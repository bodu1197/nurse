// 실행: npm test   (Node 24의 네이티브 TS 실행 — 테스트 러너 설치 불필요)
import { test } from "node:test";
import assert from "node:assert/strict";
import { jobState, isLive, isOpenToSeekers } from "./jobState.ts";
import { listingEnd, FREE_LISTING_DAYS } from "./date.ts";

const DAY = 86_400_000;
// 2026-07-23 12:00 UTC = KST 21:00 → KST 기준 오늘은 2026-07-23
const NOW = Date.UTC(2026, 6, 23, 12, 0, 0);
const ago = (days: number) => new Date(NOW - days * DAY).toISOString();
const later = (days: number) => new Date(NOW + days * DAY).toISOString();

test("병원이 보는 공고 상태", () => {
  const base = { featured_until: null, deadline: null } as const;
  assert.equal(jobState({ ...base, status: "draft", posted_at: ago(1) }, NOW), "pending");
  assert.equal(jobState({ ...base, status: "open", posted_at: ago(30), featured_until: later(5) }, NOW), "featured");
  assert.equal(jobState({ ...base, status: "open", posted_at: ago(1) }, NOW), "free");
  assert.equal(jobState({ ...base, status: "open", posted_at: ago(8) }, NOW), "expired");
  // 광고가 이미 끝났고 게시도 7일이 지났으면 만료
  assert.equal(jobState({ ...base, status: "open", posted_at: ago(8), featured_until: ago(1) }, NOW), "expired");
  // closed·expired·hidden 은 병원 화면에서 모두 '마감'
  for (const s of ["closed", "expired", "hidden"] as const) {
    assert.equal(jobState({ ...base, status: s, posted_at: ago(1) }, NOW), "closed");
  }
});

// 🔴 병원 화면과 구직자 화면이 같은 답을 해야 한다. 어긋나면 병원은 "노출 중"으로 보는데
//    구직자 목록에는 없고, 병원이 자기 공고 제목을 누르면 404 가 난다(실제로 그랬다).
test("마감일이 지나면 병원 화면도 '노출 종료'로 본다", () => {
  const open = { status: "open", posted_at: ago(1), featured_until: null } as const;
  assert.equal(jobState({ ...open, deadline: "2026-07-22" }, NOW), "expired"); // 어제 마감
  assert.equal(jobState({ ...open, deadline: "2026-07-23" }, NOW), "free");    // 마감 당일은 아직 유효
  // 광고를 사둔 공고라도 마감일이 지나면 노출되지 않는다 — 광고 배지를 띄우면 거짓말이 된다.
  assert.equal(jobState({ ...open, posted_at: ago(30), featured_until: later(10), deadline: "2026-07-22" }, NOW), "expired");

  // 두 판정이 실제로 일치하는지 — 같은 공고를 두 함수에 넣어 본다.
  const job = { status: "open", source: "direct", posted_at: ago(1), featured_until: null, deadline: "2026-07-22" } as const;
  assert.equal(isLive(jobState(job, NOW)), isOpenToSeekers(job, NOW));
});

// 병원 화면의 "~까지 (N일 남음)" 과 대시보드 '마감 임박(3일)' 이 이 값을 쓴다.
// 마감일을 안 보면 내일 사라질 공고를 "7일 남음" 이라고 알려 연장 시점을 놓치게 한다.
test("노출 종료 시각은 마감일과 무료·광고 기간 중 먼저 오는 쪽", () => {
  const day = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  const free = { posted_at: ago(0), featured_until: null } as const;
  // 마감일이 없으면 게시 + 7일
  assert.equal(day(listingEnd({ ...free, deadline: null }, NOW)), day(NOW + 7 * DAY));
  // 마감일이 더 빠르면 마감일 그날 끝(KST 23:59:59)
  assert.equal(day(listingEnd({ ...free, deadline: "2026-07-24" }, NOW)), "2026-07-24");
  // 마감일이 더 멀면 무료 기간이 먼저 끝난다
  assert.equal(day(listingEnd({ ...free, deadline: "2026-12-31" }, NOW)), day(NOW + 7 * DAY));
  // 광고가 있어도 마감일이 먼저면 마감일이 이긴다
  assert.equal(
    day(listingEnd({ posted_at: ago(30), featured_until: later(20), deadline: "2026-07-25" }, NOW)),
    "2026-07-25",
  );
  // 형식이 깨진 값은 무시하고 기존 규칙을 따른다(조작된 POST 방어)
  assert.equal(day(listingEnd({ ...free, deadline: "not-a-date" }, NOW)), day(NOW + 7 * DAY));
});

test("노출 중 판정", () => {
  assert.equal(isLive("featured"), true);
  assert.equal(isLive("free"), true);
  assert.equal(isLive("pending"), false);
  assert.equal(isLive("expired"), false);
  assert.equal(isLive("closed"), false);
});

// 목록에서 걸러진 공고가 상세 링크로는 열리면 "지원했는데 마감이었다" 사고가 난다.
test("구직자에게 보일 공고 — 목록 필터와 같은 규칙", () => {
  const direct = { status: "open", source: "direct", featured_until: null, deadline: null } as const;
  assert.equal(isOpenToSeekers({ ...direct, posted_at: ago(1) }, NOW), true);
  assert.equal(isOpenToSeekers({ ...direct, posted_at: ago(8) }, NOW), false);
  // 무료 기간이 끝나도 광고 중이면 계속 보인다
  assert.equal(isOpenToSeekers({ ...direct, posted_at: ago(30), featured_until: later(3) }, NOW), true);
  // 병원이 마감한 공고는 저장 목록에 남아 있어도 열리면 안 된다
  assert.equal(isOpenToSeekers({ ...direct, status: "closed", posted_at: ago(1) }, NOW), false);
  assert.equal(isOpenToSeekers({ ...direct, status: "hidden", posted_at: ago(1) }, NOW), false);

  const worknet = { status: "open", source: "worknet", posted_at: ago(100), featured_until: null } as const;
  // 외부 수집 공고는 게시 후 7일 규칙을 받지 않는다(마감일만 본다)
  assert.equal(isOpenToSeekers({ ...worknet, deadline: null }, NOW), true);
  assert.equal(isOpenToSeekers({ ...worknet, deadline: "2026-07-23" }, NOW), true); // 마감 당일은 아직 유효
  assert.equal(isOpenToSeekers({ ...worknet, deadline: "2026-07-22" }, NOW), false);
});

/**
 * 🔴 이 시험이 있는 이유: 규칙이 `source === "direct"` 였을 때 구 널스넷 이관분(partner)이
 *    노출 규칙 **밖**에 있었다. 그래서 광고가 끝나도 목록에 남았고, featured_until 값이 남은 탓에
 *    정렬(featured_until desc, null 뒤로)에서 워크넷보다 위였다 —
 *    **돈 낸 광고가 끝났는데 계속 1페이지 상단을 차지했다**(실측: 8/19 시점 43건).
 */
test("구 널스넷 이관 공고도 노출 기간 규칙을 받는다", () => {
  const partner = { status: "open", source: "partner", deadline: null } as const;

  // 광고 중이면 보인다
  assert.equal(isOpenToSeekers({ ...partner, posted_at: ago(400), featured_until: later(3) }, NOW), true);
  // 광고가 끝나면 목록에서 내려간다 — 예전에는 여기가 true 라 상단에 계속 남았다
  assert.equal(isOpenToSeekers({ ...partner, posted_at: ago(400), featured_until: ago(1) }, NOW), false);
  // 광고를 산 적 없는 옛 공고도 마찬가지
  assert.equal(isOpenToSeekers({ ...partner, posted_at: ago(400), featured_until: null }, NOW), false);
  // 방금 올린 것은 7일 무료로 보인다
  assert.equal(isOpenToSeekers({ ...partner, posted_at: ago(1), featured_until: null }, NOW), true);

  // 워크넷만 이 규칙을 안 받는다 — 우리가 파는 자리가 아니라 배경 데이터다
  assert.equal(
    isOpenToSeekers({ status: "open", source: "worknet", posted_at: ago(400), featured_until: null, deadline: null }, NOW),
    true,
  );
});

/**
 * 🔴 이 규칙의 **정본은 DB** 다 — `jobs_listed.is_live`(마이그레이션 20260805100000)에
 *    `posted_at >= now() - interval '7 days'` 라고 **숫자가 박혀 있다**. 여기 상수를 바꾸면
 *    목록(SQL)과 상세·지원·저장(TS)이 갈라져 "목록엔 없는데 링크로는 열리는" 공고가 생긴다.
 *    상수를 바꾸려면 그 마이그레이션도 같이 고치고 이 테스트의 7을 바꿀 것.
 */
test("무료 노출 기간은 DB 정의(7일)와 같은 값이어야 한다", () => {
  assert.equal(FREE_LISTING_DAYS, 7);
  const j = { status: "open", source: "partner", featured_until: null, deadline: null } as const;
  // 경계: 6일 지난 것은 보이고, 8일 지난 것은 안 보인다.
  assert.equal(isOpenToSeekers({ ...j, posted_at: ago(FREE_LISTING_DAYS - 1) }, NOW), true);
  assert.equal(isOpenToSeekers({ ...j, posted_at: ago(FREE_LISTING_DAYS + 1) }, NOW), false);
});
