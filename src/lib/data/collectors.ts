import "server-only";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/data/admin";
import { TENANTS } from "@/lib/recruiterAts";
import { SITES } from "@/lib/hospitalSites";

/**
 * 수집 모니터링 화면(/admin/collectors)이 읽는 것.
 *
 * 두 가지를 본다:
 *   ① **수집기가 도는가** — collector_runs 의 마지막 실행(성공/실패·언제·몇 건)
 *   ② **원천이 마르지 않았나** — 병원별로 지금 몇 건이 살아 있고 마지막으로 언제 갱신됐나.
 *      전체는 성공했는데 병원 한 곳만 조용히 0건이 되는 것이 가장 놓치기 쉬운 고장이다.
 */

/** 수집기별 기대 주기(시간). 이 시간을 넘겨 안 돌았으면 화면이 경고한다. */
export const COLLECTORS = [
  { key: "hospitals", label: "병원 명부(심사평가원)", everyHours: 24, cron: "매일 03:00" },
  { key: "worknet", label: "워크넷(고용24)", everyHours: 6, cron: "6시간마다" },
  { key: "alio", label: "공공기관 채용(잡알리오)", everyHours: 24, cron: "매일 07:00" },
  // 한 크론이 셋을 함께 돈다 — 병원 ATS·병원 자체 홈페이지·집계 사이트(인재채움뱅크).
  { key: "ats", label: "병원 채용사이트·집계 사이트", everyHours: 12, cron: "매일 08:00·20:00" },
] as const;

export type CollectorKey = (typeof COLLECTORS)[number]["key"];

export type RunRow = {
  collector: string;
  ran_at: string;
  ok: boolean;
  stats: Record<string, number> | null;
  failed: string[] | null;
  error: string | null;
  duration_ms: number | null;
};

export type CollectorCard = {
  key: CollectorKey;
  label: string;
  cron: string;
  /** 마지막 실행(성공·실패 무관). 한 번도 안 돌았으면 null. */
  last: RunRow | null;
  /** 마지막 **성공**. 실패가 이어지고 있으면 last 와 다르다. */
  lastOk: RunRow | null;
  /** 화면 판정 — 'ok' | 'fail'(마지막이 실패) | 'stale'(기대 주기를 넘겨 안 돎) | 'none'(기록 없음) */
  state: "ok" | "fail" | "stale" | "none";
};

export type SourceRow = { name: string; live: number; updatedAt: string | null; empty: number };

export type CollectorsView = {
  cards: CollectorCard[];
  /** 수집 원천별 현황(대학병원 ATS·자체 사이트·잡알리오). 0건이면 화면이 표시한다. */
  sources: SourceRow[];
  /** 우리가 아는 수집 대상 수 — 원천 표가 이보다 적으면 그만큼 공고가 하나도 없는 것이다. */
  expected: number;
  /**
   * 본문이 비어 있는 노출 공고 수.
   * 🔴 이걸 안 보여 주면 **수집은 성공했는데 카드가 텅 빈 상태**를 아무도 모른다 —
   *    실제로 24건이 제목·병원명뿐인 채로 노출되고 있었고, 오너가 화면에서 발견했다(2026-08-12).
   *    상세 마크업이 바뀌면 조용히 이 숫자부터 올라간다.
   */
  emptyBodies: number;
};

export async function getCollectors(): Promise<CollectorsView> {
  await requireAdmin();
  const supabase = await createClient();

  // 최근 실행분만 읽어 수집기별로 가른다(수집기 4개 × 넉넉히).
  const { data: runs } = await supabase
    .from("collector_runs")
    .select("collector,ran_at,ok,stats,failed,error,duration_ms")
    .order("ran_at", { ascending: false })
    .limit(200)
    .returns<RunRow[]>();

  const now = Date.now();
  const cards: CollectorCard[] = COLLECTORS.map((c) => {
    const mine = (runs ?? []).filter((r) => r.collector === c.key);
    const last = mine[0] ?? null;
    const lastOk = mine.find((r) => r.ok) ?? null;
    // 🔴 판정 순서가 규칙이다. **실패가 먼저다** — 실패했는데 방금 돌았다고 'ok' 로 보이면
    //    화면이 고장을 숨기는 셈이다.
    const state: CollectorCard["state"] = !last
      ? "none"
      : !last.ok
        ? "fail"
        : now - new Date(last.ran_at).getTime() > c.everyHours * 3600_000 * 1.5
          ? "stale"
          : "ok";
    return { key: c.key, label: c.label, cron: c.cron, last, lastOk, state };
  });

  // 원천별 현황 — 수집 공고를 회사명으로 묶는다.
  // 🔴 페이지로 끝까지 읽는다. PostgREST 는 요청당 1000행에서 **조용히 자른다** — 잘리면 원천 표가
  //    실제보다 적게 나와 멀쩡한 병원이 "0건(말랐음)" 으로 보인다. 고장을 알리는 화면이 거짓말을
  //    하는 셈이라 여기서만은 전건을 읽는다(정렬이 없으면 페이지 경계에서 행이 새거나 겹친다).
  const byName = new Map<string, SourceRow>();
  for (let from = 0; ; from += 1000) {
    const { data: page } = await supabase
      .from("jobs_listed")
      .select("company_name,updated_at,description")
      .in("source", ["crawl", "public_data"])
      .eq("is_live", true)
      .order("id")
      .range(from, from + 999)
      .returns<{ company_name: string | null; updated_at: string; description: string | null }[]>();
    for (const j of page ?? []) {
      const name = j.company_name ?? "(이름 없음)";
      const empty = j.description ? 0 : 1;
      const cur = byName.get(name);
      if (cur) {
        cur.live++;
        cur.empty += empty;
        if (!cur.updatedAt || j.updated_at > cur.updatedAt) cur.updatedAt = j.updated_at;
      } else byName.set(name, { name, live: 1, updatedAt: j.updated_at, empty });
    }
    if (!page || page.length < 1000) break;
  }

  const rows = [...byName.values()];
  return {
    cards,
    // 🔴 본문 없는 곳을 **맨 위로** 올린다. 고장을 알리는 화면이라 정상보다 이상이 먼저 보여야 한다.
    sources: rows.sort((a, b) => b.empty - a.empty || b.live - a.live || a.name.localeCompare(b.name, "ko")),
    // 병원 하나가 여러 지점을 갖기도 해서 정확한 수가 아니라 **최소 기대치**다.
    expected: TENANTS.length + SITES.length,
    emptyBodies: rows.reduce((n, r) => n + r.empty, 0),
  };
}
