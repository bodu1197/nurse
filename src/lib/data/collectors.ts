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
  { key: "ats", label: "대학병원 채용사이트", everyHours: 12, cron: "매일 08:00·20:00" },
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

export type SourceRow = { name: string; live: number; updatedAt: string | null };

export type CollectorsView = {
  cards: CollectorCard[];
  /** 수집 원천별 현황(대학병원 ATS·자체 사이트·잡알리오). 0건이면 화면이 표시한다. */
  sources: SourceRow[];
  /** 우리가 아는 수집 대상 수 — 원천 표가 이보다 적으면 그만큼 공고가 하나도 없는 것이다. */
  expected: number;
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
  const { data: jobs } = await supabase
    .from("jobs_listed")
    .select("company_name,updated_at")
    .in("source", ["crawl", "public_data"])
    .eq("is_live", true)
    .returns<{ company_name: string | null; updated_at: string }[]>();

  const byName = new Map<string, SourceRow>();
  for (const j of jobs ?? []) {
    const name = j.company_name ?? "(이름 없음)";
    const cur = byName.get(name);
    if (cur) {
      cur.live++;
      if (!cur.updatedAt || j.updated_at > cur.updatedAt) cur.updatedAt = j.updated_at;
    } else byName.set(name, { name, live: 1, updatedAt: j.updated_at });
  }

  return {
    cards,
    sources: [...byName.values()].sort((a, b) => b.live - a.live || a.name.localeCompare(b.name, "ko")),
    // 병원 하나가 여러 지점을 갖기도 해서 정확한 수가 아니라 **최소 기대치**다.
    expected: TENANTS.length + SITES.length,
  };
}
