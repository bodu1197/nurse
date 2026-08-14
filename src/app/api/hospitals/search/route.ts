import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchHospitals } from "@/lib/hira";

// 병원 자동완성 검색 (공개 HIRA 디렉터리). q≥2자, 최대 10건.
//
// 🔴 명부에 없으면 **그때 심사평가원에 그 이름만 물어 받아 넣는다.** 매일 8만 건을 통째로 다시 받던
//    크론을 없앤 자리다(오너 지시 2026-08-14) — 병원은 매일 개원하지 않으니 전건 재수집은 어제와
//    같은 값을 다시 쓰는 낭비였다. 신규 개원 병원은 이제 **누군가 찾는 순간** 명부에 들어온다.

// 🔴 이걸 빠뜨리면 **catch 도 못 타고 504 로 죽는다.** 이 라우트는 원래 수백ms 짜리였는데 위
//    즉시 조회 때문에 외부 API 를 기다리게 됐다. Vercel 기본 예산은 이 대기보다 짧을 수 있어,
//    아래 timeoutMs(12초)가 도는 동안 함수가 먼저 끊기면 빈 배열 폴백이 통째로 무력해진다.
export const maxDuration = 30;

const SELECT = "id, name, region, address";

/**
 * 즉시 조회를 거는 최소 글자수. HIRA 왕복이 5~10초라 아무 때나 부르지 않는다 —
 * 2자짜리 질의는 8만 건 명부의 부분 일치에서 거의 항상 걸리므로 여기까지 올 일이 없다.
 */
const MIN_ONDEMAND = 3;

/**
 * 명부에도 HIRA 에도 없던 질의(대개 오타). 다시 물어도 또 없으니 두 번 태우지 않는다.
 * 🔴 **HIRA 가 정상 응답으로 "없다" 고 했을 때만** 넣는다. 한도 초과·오류는 fetchHospitals 가
 *    예외로 끊으므로 여기 안 들어온다 — 안 그러면 멀쩡한 병원이 이 인스턴스에서 영구 차단된다.
 * ponytail: 프로세스 메모리라 서버리스 인스턴스마다 따로다 — 같은 인스턴스로 오는 반복만 막는다.
 *           밖에서 무작위 질의가 쏟아져 공공API 일일 한도가 걸리기 시작하면 그때 테이블로 올린다.
 */
const misses = new Set<string>();

/** `@/lib/supabase/server` 의 createClient 와 **같은 타입**. 제네릭을 빠뜨리면 결과가 any 가 된다. */
type Db = SupabaseClient<Database>;

/**
 * 명부에 보여도 되는 행의 조건 — **한 곳에만 둔다.**
 * 🔴 즉시 조회로 넣은 행을 upsert 반환값으로 바로 내보내면 이 필터가 빠져서 두 경로가 서로 다른
 *    규칙으로 답하게 된다. 무엇으로 찾든(이름·열쇠) 이 조건을 반드시 통과하게 만든다.
 */
const directory = (db: Db) =>
  db
    .from("hospitals")
    .select(SELECT)
    .eq("is_test", false) // 관리자 테스트 병원 제외
    // 명부는 심사평가원(public_data)+직접등록(direct)만. 워크넷은 "구인 광고"라 병원 명부가 아니다.
    .in("source", ["public_data", "direct"]);

/** 이름 부분 일치로 찾는다(화면이 부르는 기본 경로). */
const searchDirectory = (db: Db, q: string) =>
  directory(db).ilike("name", `%${q}%`).order("name", { ascending: true }).limit(10);

export async function GET(request: Request) {
  const raw = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  const q = raw.replace(/[%,()]/g, "");
  if (q.length < 2) return NextResponse.json([]);

  const supabase = await createClient();
  const { data, error } = await searchDirectory(supabase, q);

  if (error) return NextResponse.json([]);
  if (data && data.length > 0) return NextResponse.json(data);

  // 여기까지 왔다 = 명부에 없다. 신규 개원이거나 이름이 바뀐 곳일 수 있으니 원천에 직접 물어본다.
  // 🔴 다만 **로그인한 사람에게만.** 이 경로는 비로그인도 부르는 공개 API 라, 무작위 질의를 흘리면
  //    공공데이터포털 일일 호출 한도를 남이 대신 태워 버릴 수 있다(그러면 기능 자체가 죽는다).
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    // 🔴 비로그인에게 그냥 빈 배열을 주면 화면이 "일치하는 병원이 없습니다" 라고 **단정한다.**
    //    실제로는 "우리 명부엔 없고, 원천에는 물어보지 않았다" 이다 — 그 차이를 화면이 알아야
    //    "로그인하면 새로 생긴 병원까지 찾습니다" 라고 정직하게 말할 수 있다.
    return NextResponse.json([], { headers: { "X-Registry-Lookup": "skipped-anonymous" } });
  }
  return NextResponse.json(await fromRegistry(supabase, q));
}

/** 명부에 없을 때만 — 심사평가원에서 그 이름을 받아 넣고, 같은 질의를 다시 돌려 돌려준다. */
async function fromRegistry(supabase: SupabaseClient, q: string) {
  const key = process.env.DATA_GO_KR_API_KEY;
  if (!key || q.length < MIN_ONDEMAND || misses.has(q)) return [];

  try {
    // 🔴 예산 12초는 **실측으로 잡았다**(2026-08-14, 이름 검색 왕복): 5.0 / 7.4 / 8.5 / 9.6초.
    //    최장 9.6초 대비 여유 25% 이고, 위 maxDuration 30초 안에 나머지 질의까지 들어간다.
    //    더 줄이면 **있는 병원을 "없습니다" 라고 말하게 된다** — 그게 이 기능의 존재 이유를 무너뜨린다.
    // 🔴 재시도는 끈다. 여기는 사용자가 기다리는 길이라 실패 시 대기가 두 배가 되면 안 된다.
    //    한 번 놓쳐도 다음 글자를 치면 다시 온다.
    const { rows } = await fetchHospitals(key, { yadmNm: q, numOfRows: 10, timeoutMs: 12000, retry: false });
    if (rows.length === 0) {
      if (misses.size > 500) misses.clear(); // 무한히 자라지 않게(값 자체에 근거는 없다 — 상한일 뿐)
      misses.add(q);
      return [];
    }
    // 명부 쓰기는 서비스 롤로 — 검색은 비로그인도 부르는 공개 경로라 RLS 로는 못 넣는다.
    // 🔴 `ignoreDuplicates` 다. **없는 병원을 넣기만 하고, 있는 행은 건드리지 않는다.**
    //    이게 없으면(그냥 upsert 면) 로그인한 아무나 검색어 하나로 **이미 있는 행을 UPDATE** 한다 —
    //    관리자가 손으로 고친 이름(admin/actions.ts renameHospital)이나 병원 회원이 인증해 소유한
    //    행(is_claimed=true)까지 심사평가원 값으로 되돌아간다. 서비스롤이라 RLS 도 안 막아 준다.
    //    이름이 바뀐 기존 병원을 갱신하는 일은 전건 재수집(/api/cron/sync-hospitals)의 몫이다.
    const { error } = await createAdminClient()
      .from("hospitals").upsert(rows, { onConflict: "ykiho", ignoreDuplicates: true });
    if (error) {
      // 🔴 조용히 빈 배열로 끝내지 않는다. 여기가 막히면 신규 병원이 영영 안 들어오는데
      //    화면에는 "없습니다" 만 떠서 아무도 못 알아챈다.
      console.error("[hospitals/search] 명부 upsert 실패:", error.message);
      return [];
    }
    // 넣었으니 **같은 질의로 다시 읽는다** — 위 필터가 그대로 걸린다.
    const { data: found } = await searchDirectory(supabase, q);
    if (found && found.length > 0) return found;
    // 🔴 넣었는데 이름 검색에 안 걸릴 수 있다. HIRA 가 주는 정식 명칭은 띄어쓰기가 달라서
    //    (예: 검색어 "서울아산병원" ↔ 명칭 "재단법인아산사회복지재단 서울아산병원") 부분 일치가
    //    빗나가기도 한다. 그때 빈 배열로 끝내면 **넣어 놓고도 "없습니다"** 라고 말하고,
    //    misses 에도 안 들어가 다음 글자마다 12초를 다시 태운다. 방금 넣은 열쇠로 직접 읽는다.
    const { data: byKey } = await directory(supabase).in("ykiho", rows.map((r) => r.ykiho)).limit(10);
    return byKey ?? [];
  } catch (e) {
    // 원천이 죽어도 검색은 죽이지 않는다 — "없습니다" 로 끝난다(종전과 같은 화면).
    // 🔴 이 경우는 misses 에 넣지 않는다. 한도 초과·타임아웃은 "그 병원이 없다" 는 뜻이 아니다.
    console.error("[hospitals/search] 명부 즉시 조회 실패:", e instanceof Error ? e.message : e);
    return [];
  }
}
