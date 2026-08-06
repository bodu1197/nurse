import { cache } from "react";

export const DAY_MS = 86_400_000;
export const HOUR_MS = 3_600_000;
const KST_MS = 9 * 3600 * 1000;

// 요청당 고정된 '지금'. 서버 컴포넌트가 렌더 중 Date.now()를 직접 읽으면 react-hooks/purity 경고가 나는데,
// 규칙을 끄는 대신 cache()로 감싼다 — 같은 요청 안에서는 항상 같은 값이라 화면 계산도 일관된다.
export const nowMs = cache(() => Date.now());

// ISO 날짜 → "N일 전"의 N (0 이상).
export const daysAgo = (iso: string) => Math.max(0, Math.floor((nowMs() - new Date(iso).getTime()) / DAY_MS));

/**
 * "19시간 전" 처럼 사람이 읽는 경과 시간. 목록 카드에서 갱신 시점을 한눈에 보여주는 용도다.
 * 30일이 넘어가면 상대 표기가 오히려 감을 흐려서(“67일 전”) 날짜로 떨어뜨린다.
 */
export const timeAgo = (iso: string) => {
  const diff = nowMs() - new Date(iso).getTime();
  if (!Number.isFinite(diff) || diff < 0) return "";
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "방금 전";
  if (min < 60) return `${min}분 전`;
  const hour = Math.floor(min / 60);
  if (hour < 24) return `${hour}시간 전`;
  const day = Math.floor(hour / 24);
  return day <= 30 ? `${day}일 전` : fmtDay(iso);
};

/**
 * 두 시각 **사이**의 간격을 사람 말로 — "3분 뒤" · "17시간 뒤" · "6일 뒤".
 *
 * timeAgo 는 '지금' 기준이라 "지원한 뒤 병원이 보기까지 얼마나 걸렸나" 를 적을 수 없다.
 * 내림(floor)이다 — remain() 과 같은 이유로, 걸린 시간을 실제보다 길게 말하지 않는다.
 */
export const elapsed = (fromIso: string, toIso: string) => {
  const diff = new Date(toIso).getTime() - new Date(fromIso).getTime();
  if (!Number.isFinite(diff) || diff < 0) return "";
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "바로";
  if (min < 60) return `${min}분 뒤`;
  const hour = Math.floor(min / 60);
  if (hour < 48) return `${hour}시간 뒤`;
  return `${Math.floor(hour / 24)}일 뒤`;
};

// 우리 공고의 노출 종료 시각 = 광고 종료일(featured_until). 광고를 산 적 없으면 0 이다.
// 화면(목록·상세)과 서버 액션(지원 가능 여부)이 **같은 규칙**을 써야 해서 여기 한 곳에만 둔다.
// 컴포넌트가 아니라 lib에 두는 이유: actions.ts가 컴포넌트를 import하면 순환이 된다.
// 🔴 deadline 도 **필수 인자**로 받는다(jobState 와 같은 계약). 병원이 마감일을 넣을 수 있게 되면서,
//    이걸 안 보면 "8월 6일까지 (7일 남음)" 이라 적어놓고 실제로는 내일 사라지는 공고가 생긴다.
//    대시보드의 '마감 임박(3일)' 위젯도 같은 값을 쓰므로 존재 이유 자체가 무력화됐다.
//    선택 인자로 두면 호출부가 조용히 빠뜨리므로 필수로 둔다.
// 🔴 `now` 인자는 없앴다 — 노출 기간이 광고 하나로 정해지면서 "지금" 을 볼 일이 없어졌다.
//    남겨 두면 "시점에 따라 답이 달라진다" 는 오해를 준다.
export const listingEnd = (
  job: { featured_until: string | null; deadline: string | null },
) => {
  // 🔴 광고가 없으면 노출 기간도 없다(0). 종전에는 "게시 7일" 을 기본값으로 줬는데, 그게
  //    다시 게시로 공짜 7일을 덧붙이던 통로였다(/review8 2026-08-05).
  //    지난 광고라도 **그때가 노출 종료일**이다 — 관리자 「노출 마감」 표가 이 값을 쓴다.
  const base = job.featured_until ? new Date(job.featured_until).getTime() : 0;
  if (!job.deadline) return base;
  // 마감일은 date 컬럼이고 "그 날까지 유효"다 → KST 그날 23:59:59 까지. 둘 중 먼저 오는 쪽이 종료다.
  const until = Date.parse(`${job.deadline}T23:59:59+09:00`);
  return Number.isNaN(until) ? base : Math.min(base, until);
};

// ms → "2026.07.23". 한국 사용자 기준(KST)으로 자른다 —
// UTC로 자르면 밤 9시 이후에 지원한 건이 화면에 하루 전 날짜로 뜬다.
export const fmtDate = (ms: number) => new Date(ms + KST_MS).toISOString().slice(0, 10).replace(/-/g, ".");

// ISO 문자열(created_at 등) → "2026.07.23". 날짜 표기는 이 두 함수 밖에서 만들지 않는다.
export const fmtDay = (iso: string) => fmtDate(new Date(iso).getTime());

// ISO → "14:11"(한국시간). 하루 안의 **순서**가 중요한 화면(지원 → 열람)에서만 쓴다.
export const fmtTime = (iso: string) => new Date(new Date(iso).getTime() + KST_MS).toISOString().slice(11, 16);

// KST 기준 오늘 "2026-07-23". date 컬럼(jobs.deadline)과 비교할 때 쓴다.
export const todayKst = (now: number) => new Date(now + KST_MS).toISOString().slice(0, 10);

/**
 * 노출 종료까지 남은 기간을 사람 말로.
 *
 * 🔴 병원 화면과 관리자 화면이 **같은 함수**를 쓴다. 각자 적어 두었더니 한쪽은 올림, 한쪽은 내림이라
 *    같은 광고를 "7일 남음"(병원) 과 "6일 남음"(관리자) 으로 다르게 말했다 — 하필 부풀어 보이는 쪽이
 *    돈 낸 사람 화면이었다.
 * 🔴 내림(floor)이다. 6일 3시간 남은 광고를 "7일" 이라고 하면 하루를 더 있는 것처럼 말하는 셈이다.
 *    하루가 채 안 남았으면 "0일 남음"(끝난 것처럼 읽힌다) 대신 그 사실을 적는다.
 */
export function remain(endMs: number, now: number = nowMs()) {
  // 🔴 광고를 산 적 없는 공고는 종료 시각이 0(1970년)이다. 그대로 빼면 "20669일 전 마감" 이 찍힌다.
  if (endMs <= 0) return { text: "-", urgent: false, ended: true };
  const diff = endMs - now;
  if (diff <= 0) return { text: `${Math.ceil(-diff / DAY_MS)}일 전 마감`, urgent: false, ended: true };
  const days = Math.floor(diff / DAY_MS);
  return { text: days >= 1 ? `${days}일 남음` : "24시간 내 종료", urgent: days <= 7, ended: false };
}

/** 오늘(한국시간) 0시를 UTC ISO 로. DB 질의에 "오늘부터" 조건을 걸 때 쓴다. */
export const kstDayStartIso = (now: number) =>
  new Date(new Date(now + KST_MS).setUTCHours(0, 0, 0, 0) - KST_MS).toISOString();
