// 형제 모듈이라 상대 경로로 부른다(lib/data/user.ts → ./role 과 같은 방식).
// 확장자를 붙여야 Node 의 네이티브 TS 실행(npm test)에서도 그대로 불러온다.
import { FREE_LISTING_MS, listingEnd, todayKst } from "./date.ts";

// 공고가 지금 어떤 상태인지 — 화면이 아니라 규칙이라 lib에 둔다.
// (컴포넌트에 두면 서버 액션이 이 판정을 쓰려는 순간 액션→컴포넌트 의존이 생긴다.)

/** jobs.status 의 허용값(DB check 제약과 같은 집합). 늘어나면 아래 판정이 컴파일에서 걸린다. */
export type JobStatus = "draft" | "open" | "closed" | "expired" | "hidden";

/** 병원에게 보여줄 노출 상태 */
export type JobState = "pending" | "featured" | "free" | "expired" | "closed";

/**
 * 🔴 deadline 을 **필수 인자**로 둔다(선택으로 두면 부르는 쪽이 조용히 빠뜨린다).
 *    병원이 공고에 마감일을 넣을 수 있게 되면서, 이걸 안 보면 구직자 화면에서는 이미 사라진 공고를
 *    병원 화면만 "무료 …까지 (N일 남음)" 이라고 표시하고 제목을 누르면 404 가 났다.
 *    노출 판정의 기준은 구직자 쪽(isOpenToSeekers)과 하나여야 한다.
 */
export function jobState(
  job: Readonly<{ status: JobStatus; posted_at: string; featured_until: string | null; deadline: string | null }>,
  now: number,
): JobState {
  if (job.status === "draft") return "pending";
  // closed·expired·hidden은 병원 화면에서 모두 '마감'으로 묶는다(구분해봐야 할 일이 같다).
  if (job.status !== "open") return "closed";
  // 마감일이 지났으면 광고가 남아 있어도 구직자에게 안 보인다 → 노출 종료로 본다.
  if (job.deadline && job.deadline < todayKst(now)) return "expired";
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
