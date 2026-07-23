import { cache } from "react";

export const DAY_MS = 86_400_000;
const KST_MS = 9 * 3600 * 1000;

/** 직접등록 공고의 무료 노출 기간(7일). 화면·쿼리·서버검증이 같은 값을 쓴다. */
export const FREE_LISTING_DAYS = 7;
export const FREE_LISTING_MS = FREE_LISTING_DAYS * DAY_MS;

// 요청당 고정된 '지금'. 서버 컴포넌트가 렌더 중 Date.now()를 직접 읽으면 react-hooks/purity 경고가 나는데,
// 규칙을 끄는 대신 cache()로 감싼다 — 같은 요청 안에서는 항상 같은 값이라 화면 계산도 일관된다.
export const nowMs = cache(() => Date.now());

// ISO 날짜 → "N일 전"의 N (0 이상).
export const daysAgo = (iso: string) => Math.max(0, Math.floor((nowMs() - new Date(iso).getTime()) / DAY_MS));

// 직접등록 공고의 노출 종료 시각: 광고 중이면 featured_until, 아니면 게시 + 7일(무료 노출).
// 화면(목록·상세)과 서버 액션(지원 가능 여부)이 **같은 규칙**을 써야 해서 여기 한 곳에만 둔다.
// 컴포넌트가 아니라 lib에 두는 이유: actions.ts가 컴포넌트를 import하면 순환이 된다.
export const listingEnd = (job: { posted_at: string; featured_until: string | null }, now: number) => {
  const featured = job.featured_until ? new Date(job.featured_until).getTime() : 0;
  return featured > now ? featured : new Date(job.posted_at).getTime() + FREE_LISTING_MS;
};

// ms → "2026.07.23". 한국 사용자 기준(KST)으로 자른다 —
// UTC로 자르면 밤 9시 이후에 지원한 건이 화면에 하루 전 날짜로 뜬다.
export const fmtDate = (ms: number) => new Date(ms + KST_MS).toISOString().slice(0, 10).replace(/-/g, ".");

// ISO 문자열(created_at 등) → "2026.07.23". 날짜 표기는 이 두 함수 밖에서 만들지 않는다.
export const fmtDay = (iso: string) => fmtDate(new Date(iso).getTime());

// KST 기준 오늘 "2026-07-23". date 컬럼(jobs.deadline)과 비교할 때 쓴다.
export const todayKst = (now: number) => new Date(now + KST_MS).toISOString().slice(0, 10);
