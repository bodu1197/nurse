// 형제 모듈이라 상대 경로로 부른다(lib/data/user.ts → ./role 과 같은 방식).
// 확장자를 붙여야 Node 의 네이티브 TS 실행(npm test)에서도 그대로 불러온다.
import { FREE_LISTING_MS, listingEnd, todayKst } from "./date.ts";

// 공고가 지금 어떤 상태인지 — 화면이 아니라 규칙이라 lib에 둔다.
// (컴포넌트에 두면 서버 액션이 이 판정을 쓰려는 순간 액션→컴포넌트 의존이 생긴다.)

/** jobs.status 의 허용값(DB check 제약과 같은 집합). 늘어나면 아래 판정이 컴파일에서 걸린다. */
export type JobStatus = "draft" | "open" | "closed" | "expired" | "hidden";

/** 병원에게 보여줄 노출 상태 */
export type JobState = "pending" | "featured" | "free" | "expired" | "closed";

export function jobState(
  job: Readonly<{ status: JobStatus; posted_at: string; featured_until: string | null }>,
  now: number,
): JobState {
  if (job.status === "draft") return "pending";
  // closed·expired·hidden은 병원 화면에서 모두 '마감'으로 묶는다(구분해봐야 할 일이 같다).
  if (job.status !== "open") return "closed";
  if (job.featured_until && new Date(job.featured_until).getTime() > now) return "featured";
  if (new Date(job.posted_at).getTime() >= now - FREE_LISTING_MS) return "free";
  return "expired";
}

/** 노출 중(구직자가 볼 수 있는 상태)인가 */
export const isLive = (s: JobState) => s === "featured" || s === "free";

/** 병원이 화면에서 바꿀 수 있는 공고 상태(게시/마감) */
export const JOB_SETTABLE = ["open", "closed"] as const satisfies readonly JobStatus[];

/** 폼 문자열을 그 둘로 좁힌다. some()만으로는 타입이 안 좁혀져 임의 문자열이 update로 넘어간다. */
export const isSettableJobStatus = (s: string): s is (typeof JOB_SETTABLE)[number] =>
  JOB_SETTABLE.some((v) => v === s);

/**
 * 구직자에게 지금 보여줄 공고인가 — 목록(getJobs)의 SQL 필터와 **같은 규칙**을 코드로 옮긴 것.
 * 목록·상세·저장한 공고·지원 서버검증이 어긋나면 "목록엔 없는데 링크로는 열리는" 공고가 생긴다.
 * status 도 본다 — 저장 목록은 마감된 공고를 서버 권한으로 되살려 보여주므로 RLS만 믿을 수 없다.
 */
export function isOpenToSeekers(
  job: Readonly<{ status: JobStatus; source: string; posted_at: string; featured_until: string | null; deadline: string | null }>,
  now: number,
): boolean {
  if (job.status !== "open") return false;
  if (job.source === "direct" && listingEnd(job, now) <= now) return false;
  return !(job.deadline && job.deadline < todayKst(now));
}
