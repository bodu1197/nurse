// 확장자를 붙여야 Node 의 네이티브 TS 실행(npm test)에서도 그대로 불러온다(jobState.ts 와 같은 규칙).
import { isCollectedJob } from "./jobState.ts";

/**
 * 간편지원을 받는 공고인가.
 *
 * 🔴 기준은 "직접 등록인가" 가 아니라 **"밖에서 수집한 공고인가"** 다(오너 확정 2026-08-04).
 *    수집처 목록은 lib/jobState 의 COLLECTED_SOURCES 한 곳에 있다(워크넷 + 잡알리오).
 *    구 널스넷에서 옮겨온 공고(source='partner')도 우리 사이트의 공고이므로 지원을 받는다.
 *    워크넷만 막는다 — 그 지원에 우리는 아무것도 관여하지 않기로 했다(오너 확정 2026-07-30).
 *
 * 🔴 apply_methods 만으로 판정하면 안 된다. 워크넷 공고도 apply_methods 가 ['platform'] 이라
 *    (실측: 2,006건) 그 기준으로는 워크넷이 통째로 열린다.
 *
 * 화면(JobDetail)과 서버 액션(applyToJob)이 **같은 함수**를 써야 한다 —
 * 갈라지면 버튼은 보이는데 눌러도 실패하거나, 그 반대가 된다.
 */
export function acceptsPlatformApply(job: { source: string; apply_methods: readonly string[] }): boolean {
  if (isCollectedJob(job.source)) return false;
  return job.apply_methods.includes("platform");
}
