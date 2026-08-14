import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchHospitals } from "@/lib/hira";
import { reserveHiraLookup } from "@/lib/collectorLog";

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
 * 24시간 동안 심사평가원에 물어볼 수 있는 **전체 합계** 상한(사용자별이 아니다).
 *
 * 지키려는 것이 공공데이터포털의 일일 호출 한도 — 서비스 전체가 나눠 쓰는 자원이라 상한도
 * 전체에 건다. 계정 하나가 없는 이름을 계속 던져 한도를 태우면 **모두에게** 이 기능이 죽는다.
 *
 * 값 근거: 정상 사용은 하루 수십 건이면 넉넉하다 — 명부에 이미 8만 곳이 있어 거의 다 바로
 * 걸리고(실측 176~939ms, 원천 호출 없음), 여기까지 오는 건 정말 새로 생긴 병원뿐이다.
 * 전건 재수집이 한 번에 41회를 쓰므로 그쪽 여유도 남겨 둔다. 500 은 정상 사용의 10배쯤이다.
 * 🔴 이 숫자에 막히기 시작하면(서버 로그에 "즉시 조회 상한") 포털에서 실제 한도를 확인하고
 *    여기만 올리면 된다. 세는 일은 lib/collectorLog 의 reserveHiraLookup 이 한다.
 */
const DAILY_LOOKUP_CAP = 500;

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

/**
 * 결과와 함께 **왜 이 결과인지**를 준다.
 * 🔴 빈 배열은 세 가지 서로 다른 사실을 뭉뚱그린다: "정말 없다" / "비로그인이라 원천에 안 물어봤다" /
 *    "호출 상한이라 지금은 못 물어본다". 화면이 이걸 구분 못 하면 실재하는 신규 병원을
 *    "없습니다" 라고 단정하게 된다. 헤더로 사유를 실어 보낸다(본문 모양은 그대로 배열이다).
 */
const answer = (rows: unknown, note?: string) =>
  NextResponse.json(rows, note ? { headers: { "X-Registry-Lookup": note } } : undefined);

export async function GET(request: Request) {
  const raw = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  const q = raw.replace(/[%,()]/g, "");
  if (q.length < 2) return NextResponse.json([]);

  const supabase = await createClient();
  const { data, error } = await searchDirectory(supabase, q);

  // 🔴 명부 조회 자체가 실패한 것을 "없습니다" 라고 하면 안 된다 — 못 찾아본 것이지 없는 게 아니다.
  if (error) return answer([], "unavailable");
  if (data && data.length > 0) return NextResponse.json(data);

  // 여기까지 왔다 = 명부에 없다. 신규 개원이거나 이름이 바뀐 곳일 수 있으니 원천에 직접 물어본다.
  // 🔴 다만 **로그인한 사람에게만.** 이 경로는 비로그인도 부르는 공개 API 라, 무작위 질의를 흘리면
  //    공공데이터포털 일일 호출 한도를 남이 대신 태워 버릴 수 있다(그러면 기능 자체가 죽는다).
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return answer([], "skipped-anonymous");

  const { rows, note } = await fromRegistry(supabase, q);
  return answer(rows, note);
}

/** 명부에 없을 때만 — 심사평가원에서 그 이름을 받아 넣고, 같은 질의를 다시 돌려 돌려준다. */
async function fromRegistry(supabase: Db, q: string): Promise<{ rows: unknown[]; note?: string }> {
  // 🔴 키가 없으면 **물어볼 수가 없는 것**이지 병원이 없는 게 아니다 — 사유를 붙여야 화면이
  //    "없습니다" 라고 단정하지 않는다(환경변수가 빠진 배포에서 이 기능이 조용히 죽는 걸 막는다).
  const key = process.env.DATA_GO_KR_API_KEY;
  if (!key) {
    console.error("[hospitals/search] DATA_GO_KR_API_KEY 없음 — 즉시 조회 불가");
    return { rows: [], note: "unavailable" };
  }
  // 너무 짧거나, 이미 물어봐서 없던 이름은 다시 안 묻는다 — 이건 진짜 "없다" 라서 사유가 없다.
  if (q.length < MIN_ONDEMAND || misses.has(q)) return { rows: [] };

  // 🎫 부르기 전에 표를 끊는다 — 계정 하나가 공공데이터 일일 한도를 통째로 태우면 이 기능이
  //    모두에게 죽는다. 상한에 걸려도 명부 8만 건 검색은 아무 영향 없이 계속 된다.
  const admin = createAdminClient();
  const slot = await reserveHiraLookup(admin, DAILY_LOOKUP_CAP);
  // 🔴 사유를 그대로 화면까지 올린다. 여기서 빈 배열만 주면 화면이 "없습니다" 라고 단정하는데,
  //    실제로는 **아직 안 찾아봤다** 이다 — 실재하는 병원을 없다고 말하는 셈이 된다.
  if (!slot.granted) return { rows: [], note: slot.reason };
  const { finish } = slot;

  try {
    // 🔴 예산 12초는 **실측으로 잡았다**(2026-08-14, 이름 검색 왕복): 5.0 / 7.4 / 8.5 / 9.6초.
    //    최장 9.6초 대비 여유 25% 이고, 위 maxDuration 30초 안에 나머지 질의까지 들어간다.
    //    더 줄이면 **있는 병원을 "없습니다" 라고 말하게 된다** — 그게 이 기능의 존재 이유를 무너뜨린다.
    // 🔴 재시도는 끈다. 여기는 사용자가 기다리는 길이라 실패 시 대기가 두 배가 되면 안 된다.
    //    한 번 놓쳐도 다음 글자를 치면 다시 온다.
    const { rows } = await fetchHospitals(key, { yadmNm: q, numOfRows: 10, timeoutMs: 12000, retry: false });
    if (rows.length === 0) {
      await finish(true, { found: 0 });
      if (misses.size > 500) misses.clear(); // 무한히 자라지 않게(값 자체에 근거는 없다 — 상한일 뿐)
      misses.add(q);
      return { rows: [] }; // 원천이 정상으로 "없다" 고 했다 — 화면이 그대로 말해도 사실이다
    }
    // 명부 쓰기는 서비스 롤로 — 검색은 비로그인도 부르는 공개 경로라 RLS 로는 못 넣는다.
    // 🔴 `ignoreDuplicates` 다. **없는 병원을 넣기만 하고, 있는 행은 건드리지 않는다.**
    //    이게 없으면(그냥 upsert 면) 로그인한 아무나 검색어 하나로 **이미 있는 행을 UPDATE** 한다 —
    //    관리자가 손으로 고친 이름(admin/actions.ts renameHospital)이나 병원 회원이 인증해 소유한
    //    행(is_claimed=true)까지 심사평가원 값으로 되돌아간다. 서비스롤이라 RLS 도 안 막아 준다.
    //    이름이 바뀐 기존 병원을 갱신하는 일은 전건 재수집(/api/cron/sync-hospitals)의 몫이다.
    const { error } = await admin
      .from("hospitals").upsert(rows, { onConflict: "ykiho", ignoreDuplicates: true });
    // 🔴 기록은 **저장까지 끝난 뒤** 남긴다. 받아오기만 성공했다고 ok=true 로 적어 두면,
    //    저장이 막혀 사용자는 아무것도 못 보는데 로그에는 성공으로 남는다(/review8 지적).
    await finish(!error, { found: rows.length, saved: !error }, error?.message);
    if (error) {
      // 🔴 조용히 빈 배열로 끝내지 않는다. 여기가 막히면 신규 병원이 영영 안 들어오는데
      //    화면에는 "없습니다" 만 떠서 아무도 못 알아챈다.
      console.error("[hospitals/search] 명부 upsert 실패:", error.message);
      return { rows: [], note: "unavailable" };
    }
    // 넣었으니 **같은 질의로 다시 읽는다** — 위 필터가 그대로 걸린다.
    const { data: found } = await searchDirectory(supabase, q);
    if (found && found.length > 0) return { rows: found };
    // 🔴 넣었는데 이름 검색에 안 걸릴 수 있다. HIRA 가 주는 정식 명칭은 띄어쓰기가 달라서
    //    (예: 검색어 "서울아산병원" ↔ 명칭 "재단법인아산사회복지재단 서울아산병원") 부분 일치가
    //    빗나가기도 한다. 그때 빈 배열로 끝내면 **넣어 놓고도 "없습니다"** 라고 말하고,
    //    misses 에도 안 들어가 다음 글자마다 12초를 다시 태운다. 방금 넣은 열쇠로 직접 읽는다.
    const { data: byKey } = await directory(supabase).in("ykiho", rows.map((r) => r.ykiho)).limit(10);
    return { rows: byKey ?? [] };
  } catch (e) {
    // 원천이 죽어도 검색은 죽이지 않는다 — "없습니다" 로 끝난다(종전과 같은 화면).
    // 🔴 이 경우는 misses 에 넣지 않는다. 한도 초과·타임아웃은 "그 병원이 없다" 는 뜻이 아니다.
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[hospitals/search] 명부 즉시 조회 실패:", msg);
    // 🔴 실패도 남긴다. 표는 이미 끊었으니(한 번 쓴 것은 맞다) 기록이 "조회 중" 으로 남으면
    //    관리자가 이 기능이 왜 안 되는지 볼 길이 없다 — 실패가 몰리면 원천이 죽은 것이다.
    await finish(false, {}, msg);
    return { rows: [], note: "unavailable" };
  }
}
