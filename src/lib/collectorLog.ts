import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * 수집기 실행을 한 줄 남긴다 — 관리자 화면(/admin/collectors)이 이걸 읽는다.
 *
 * 🔴 **기록 실패가 수집을 죽이면 안 된다.** 이건 곁다리 기능이고, 여기서 throw 하면
 *    멀쩡히 긁어 온 공고를 저장도 못 하고 크론이 502 로 끝난다. 조용히 로그만 남기고 넘어간다.
 * 🔴 반대로 **수집이 실패해도 기록은 남겨야 한다.** 실패했다는 사실이 화면에 떠야 하니까
 *    catch 안에서도 부른다(성공했을 때만 남기면 "며칠째 실패 중"을 영영 모른다).
 */
export type CollectorKey = "hospitals" | "worknet" | "alio" | "ats";

export async function recordRun(
  admin: SupabaseClient,
  run: Readonly<{
    collector: CollectorKey;
    ok: boolean;
    stats?: Record<string, unknown>;
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
    // 화면은 최근 것만 본다 — 30일 지난 기록은 여기서 같이 지운다(정리 전용 크론을 만들지 않으려고).
    await admin
      .from("collector_runs")
      .delete()
      .eq("collector", run.collector)
      .lt("ran_at", new Date(Date.now() - 30 * 86400_000).toISOString());
  } catch (e) {
    console.error("[collectorLog] 실행 기록 실패(수집 자체는 계속):", e instanceof Error ? e.message : e);
  }
}
