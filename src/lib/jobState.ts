// 형제 모듈이라 상대 경로로 부른다(lib/data/user.ts → ./role 과 같은 방식).
// 확장자를 붙여야 Node 의 네이티브 TS 실행(npm test)에서도 그대로 불러온다.
import { todayKst } from "./date.ts";

// 공고가 지금 어떤 상태인지 — 화면이 아니라 규칙이라 lib에 둔다.
// (컴포넌트에 두면 서버 액션이 이 판정을 쓰려는 순간 액션→컴포넌트 의존이 생긴다.)

/** jobs.status 의 허용값(DB check 제약과 같은 집합). 늘어나면 아래 판정이 컴파일에서 걸린다. */
export type JobStatus = "draft" | "open" | "closed" | "expired" | "hidden";

/** 병원에게 보여줄 노출 상태 */
export type JobState = "pending" | "featured" | "expired" | "closed";

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
  // 🔴 광고가 살아 있을 때만 노출된다. 종전에는 "게시 7일 이내면 무료 노출" 이 하나 더 있었는데,
  //    다시 게시(repostJob)가 posted_at 을 새로 찍는 탓에 **1주를 사고 6일째 마감→다시 게시로
  //    공짜 7일을 덧붙일 수 있었다**(/review8 2026-08-05). 완전 무료 광고는 없다.
  return job.featured_until && new Date(job.featured_until).getTime() > now ? "featured" : "expired";
}

/** 노출 중(구직자가 볼 수 있는 상태)인가 */
export const isLive = (s: JobState) => s === "featured";

/** 병원이 화면에서 바꿀 수 있는 공고 상태(게시/마감) */
export const JOB_SETTABLE = ["open", "closed"] as const satisfies readonly JobStatus[];

/** 폼 문자열을 그 둘로 좁힌다. some()만으로는 타입이 안 좁혀져 임의 문자열이 update로 넘어간다. */
export const isSettableJobStatus = (s: string): s is (typeof JOB_SETTABLE)[number] =>
  JOB_SETTABLE.some((v) => v === s);

/**
 * 구직자에게 지금 보여줄 공고인가 — **정본은 DB 에 있다**: `jobs_listed.is_live`
 * (마이그레이션 20260805200000). 이건 그 규칙을 코드로 옮긴 사본이다.
 *
 * 🔴 왜 사본이 필요한가: 상세·지원·저장 목록은 **이미 받아 온 행 하나**를 판정해야 해서
 *    쿼리 필터를 쓸 수 없다(저장 목록은 마감 공고를 서버 권한으로 되살려 보여주기까지 한다).
 * 🔴 **둘이 어긋나면 "목록엔 없는데 링크로는 열리는" 공고가 생긴다.** 규칙을 바꿀 일이 생기면
 *    반드시 양쪽을 같이 고칠 것 — jobState.test.ts 가 "광고가 없으면 안 보인다" 를 못 박아 둔다.
 */
export function isOpenToSeekers(
  job: Readonly<{ status: JobStatus; source: string; posted_at: string; featured_until: string | null; deadline: string | null }>,
  now: number,
): boolean {
  if (job.status !== "open") return false;
  // 🔴 `source === "direct"` 가 아니라 **워크넷이 아닌 우리 공고 전부**다.
  //    구 널스넷 이관분(partner)이 이 규칙 밖에 있어서, 광고가 끝나도 목록에 남고
  //    featured_until 값이 남은 탓에 정렬에서 워크넷(null)보다 위였다 —
  //    **돈 낸 광고가 끝났는데 계속 1페이지 상단을 차지**했다(실측: 8/19 시점 43건).
  //    워크넷 수집분만 노출 기간 없이 항상 보인다 — 우리가 파는 자리가 아니라 배경 데이터다.
  // 🔴 우리 공고는 **광고가 살아 있을 때만** 보인다(무료 노출 창은 없앴다 — jobState 주석 참고).
  //    워크넷 수집분만 기간 없이 항상 보인다 — 우리가 파는 자리가 아니라 배경 데이터다.
  if (job.source !== "worknet" && !(job.featured_until && new Date(job.featured_until).getTime() > now)) return false;
  return !(job.deadline && job.deadline < todayKst(now));
}
