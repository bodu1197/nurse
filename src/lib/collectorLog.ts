import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

/** createAdminClient 이 주는 것과 **같은 타입**. 제네릭을 빠뜨리면 조회 결과가 any 가 된다. */
type Admin = SupabaseClient<Database>;

/**
 * stats 컬럼(jsonb)에 넣을 수 있는 모양. `unknown` 으로 두면 함수·undefined 까지 통과해
 * 저장 시점에야 터진다 — 컬럼이 받는 것만 받는다.
 */
type Stats = Record<string, number | string | boolean | null>;

const DAY_MS = 86400_000;
/** 기록을 얼마나 오래 두나 — 화면은 최근 것만 본다. */
const KEEP_DAYS = 30;

/** 오래된 기록을 지운다 — 정리 전용 크론을 만들지 않으려고 쓰는 쪽이 자기 것만 치운다. */
const prune = (admin: Admin, collector: CollectorKey) =>
  admin.from("collector_runs").delete()
    .eq("collector", collector)
    .lt("ran_at", new Date(Date.now() - KEEP_DAYS * DAY_MS).toISOString());

/**
 * 수집기 실행을 한 줄 남긴다 — 관리자 화면(/admin/collectors)이 이걸 읽는다.
 *
 * 🔴 **기록 실패가 수집을 죽이면 안 된다.** 이건 곁다리 기능이고, 여기서 throw 하면
 *    멀쩡히 긁어 온 공고를 저장도 못 하고 크론이 502 로 끝난다. 조용히 로그만 남기고 넘어간다.
 * 🔴 반대로 **수집이 실패해도 기록은 남겨야 한다.** 실패했다는 사실이 화면에 떠야 하니까
 *    catch 안에서도 부른다(성공했을 때만 남기면 "며칠째 실패 중"을 영영 모른다).
 */
export type CollectorKey =
  | "hospitals" | "worknet" | "alio" | "ats"
  /**
   * 크론이 아니라 **사용자 검색이 부르는 즉시 조회**(api/hospitals/search).
   * 화면(/admin/collectors)의 수집기 카드에는 안 뜬다 — COLLECTORS 목록에 없는 키는 무시된다.
   * 여기에 남기는 이유는 **세기 위해서**다(아래 reserveHiraLookup 참고).
   */
  | "hospitals_ondemand";

export async function recordRun(
  admin: Admin,
  run: Readonly<{
    collector: CollectorKey;
    ok: boolean;
    stats?: Stats;
    failed?: readonly string[];
    error?: string | null;
    startedAt: number;
  }>,
): Promise<void> {
  try {
    await admin.from("collector_runs").insert({
      collector: run.collector,
      ok: run.ok,
      stats: run.stats ?? {},
      failed: [...(run.failed ?? [])],
      error: run.error ?? null,
      duration_ms: Date.now() - run.startedAt,
    });
    await prune(admin, run.collector);
  } catch (e) {
    console.error("[collectorLog] 실행 기록 실패(수집 자체는 계속):", e instanceof Error ? e.message : e);
  }
}

const ONDEMAND: CollectorKey = "hospitals_ondemand";
/**
 * 정리를 돌릴 확률(대략 100번에 한 번) — 매번 돌리면 사용자가 기다리는 길에 DELETE 가 얹힌다.
 * 🔴 **횟수를 세서 나누면 안 된다.** 여기서 아는 숫자(used)는 누적 실행 횟수가 아니라
 *    **굴러가는 24시간 잔량**이라, 하루 수십 건이 꾸준히 들어오면 그 값이 30 언저리에 머물러
 *    100의 배수에 영원히 안 걸린다 — 정리가 한 번도 안 도는 채로 "돈다" 고 믿게 된다
 *    (/review8 지적 2026-08-14). 확률로 뽑으면 잔량이 얼마든 결국 돈다.
 */
const PRUNE_CHANCE = 0.01;

export type Reservation =
  | { granted: true; finish: (ok: boolean, stats: Stats, error?: string) => Promise<void> }
  /**
   * 못 끊었다. **왜인지 구분해서 준다** — 화면이 "일치하는 병원이 없습니다" 라고 단정하면
   * 실재하는 신규 병원을 "없다" 고 말하게 된다. 부르는 쪽이 사유대로 안내해야 한다.
   */
  | { granted: false; reason: "capped" | "unavailable" };

/**
 * 🎫 심사평가원 **즉시 조회 한 장을 끊는다.**
 *
 * 왜 필요한가: 검색이 명부에서 못 찾으면 공공데이터포털에 물어보는데, 그 API 에는 **일일 호출
 * 한도**가 있다. 로그인한 계정 하나가 없는 이름을 계속 던지면 그 한도를 통째로 태워
 * **모두에게 이 기능이 죽는다**. 그래서 부르기 전에 표를 끊게 한다.
 *
 * 🔴 세는 곳이 DB 인 이유: 서버리스는 인스턴스마다 메모리가 따로라 프로세스 변수로는 못 센다
 *    (인스턴스가 늘어나면 상한도 같이 늘어나 버린다). 지키려는 것이 **서비스 전체가 나눠 쓰는**
 *    자원이라 세는 곳도 전체가 공유해야 한다.
 * 🔴 **먼저 적고 나서 부른다.** 부르고 나서 적으면 동시에 들어온 요청이 전부 검사를 통과한 뒤
 *    한꺼번에 나가 상한을 넘긴다.
 * 🔴 셀 수 없으면(조회 실패) **안 준다.** 열어 두면 한도를 지키려던 장치가 한도를 태우는 쪽으로
 *    실패한다 — canUseFreeWeek(lib/data/jobs) 이 같은 이유로 막는 쪽을 고른다.
 * 🔴 달력 하루가 아니라 **굴러가는 24시간**이다. 자정 경계에서 몰리는 것을 피하고, 포털의
 *    초기화 시각을 몰라도 상한을 넘지 않는다.
 *
 * ⚠️ 세기와 적기가 **한 문장이 아니라서**(count → insert) 그 사이에 동시에 들어온 요청은 함께
 *    통과한다. 한 번 넘고 나면 다음 요청부터는 늘어난 수가 보여 막히므로, 상한이 무너지는 게
 *    아니라 `cap + 동시요청수` 에서 멈춘다(초과분은 24시간 뒤 회복된다).
 *    🔴 다만 그 **동시요청수는 우리가 아니라 공격자가 정한다** — count 왕복(수십ms) 안에
 *    계정 하나로 병렬로 밀어 넣은 만큼이다. 상한 자체가 정상 사용의 10배라 그 정도 초과는
 *    한도 보호에 지장이 없다고 보고 그대로 둔다. 딱 맞게 막아야 할 만큼 한도가 빠듯해지면
 *    `insert … where (select count(*)) < cap` 을 한 문장으로 만드는 RPC 로 옮긴다.
 */
export async function reserveHiraLookup(admin: Admin, cap: number): Promise<Reservation> {
  const { count, error } = await admin
    .from("collector_runs")
    .select("id", { count: "exact", head: true })
    .eq("collector", ONDEMAND)
    .gte("ran_at", new Date(Date.now() - DAY_MS).toISOString());
  if (error) {
    console.error("[collectorLog] 즉시 조회 카운트 실패 — 막는 쪽으로 끝낸다:", error.message);
    return { granted: false, reason: "unavailable" };
  }
  const used = count ?? 0;
  if (used >= cap) {
    console.warn(`[collectorLog] 즉시 조회 상한 — 최근 24시간 ${used}/${cap}`);
    return { granted: false, reason: "capped" };
  }

  const startedAt = Date.now();
  // ok=false / "조회 중" 은 **거짓말이 아니다** — 이 시점엔 정말 안 끝났다. 아래에서 결과로 덮는다.
  const { data, error: insErr } = await admin
    .from("collector_runs")
    .insert({ collector: ONDEMAND, ok: false, error: "조회 중" })
    .select("id")
    .single();
  if (insErr || !data) {
    console.error("[collectorLog] 즉시 조회 예약 실패:", insErr?.message);
    return { granted: false, reason: "unavailable" }; // 못 세면 안 부른다(위와 같은 이유)
  }

  const finish = async (ok: boolean, stats: Stats, err?: string) => {
    try {
      await admin
        .from("collector_runs")
        .update({ ok, stats, error: err ?? null, duration_ms: Date.now() - startedAt })
        .eq("id", data.id);
      // 🔴 정리는 **가끔만** 돈다. 여기는 사용자가 기다리는 길이라, 매번 DELETE 를 돌리면
      //    하루 수백 번 대부분 0행을 지우는 왕복이 그 대기에 그대로 얹힌다.
      if (Math.random() < PRUNE_CHANCE) await prune(admin, ONDEMAND);
    } catch (e) {
      // 기록이 실패해도 검색은 이미 답을 냈다 — 여기서 throw 하면 멀쩡한 결과를 버리게 된다.
      console.error("[collectorLog] 즉시 조회 결과 기록 실패:", e instanceof Error ? e.message : e);
    }
  };
  return { granted: true, finish };
}
