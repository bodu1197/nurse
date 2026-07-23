// 실행: npm test   (Node 24의 네이티브 TS 실행 — 테스트 러너 설치 불필요)
import { test } from "node:test";
import assert from "node:assert/strict";
import { jobState, isLive, isOpenToSeekers } from "./jobState.ts";

const DAY = 86_400_000;
// 2026-07-23 12:00 UTC = KST 21:00 → KST 기준 오늘은 2026-07-23
const NOW = Date.UTC(2026, 6, 23, 12, 0, 0);
const ago = (days: number) => new Date(NOW - days * DAY).toISOString();
const later = (days: number) => new Date(NOW + days * DAY).toISOString();

test("병원이 보는 공고 상태", () => {
  assert.equal(jobState({ status: "draft", posted_at: ago(1), featured_until: null }, NOW), "pending");
  assert.equal(jobState({ status: "open", posted_at: ago(30), featured_until: later(5) }, NOW), "featured");
  assert.equal(jobState({ status: "open", posted_at: ago(1), featured_until: null }, NOW), "free");
  assert.equal(jobState({ status: "open", posted_at: ago(8), featured_until: null }, NOW), "expired");
  // 광고가 이미 끝났고 게시도 7일이 지났으면 만료
  assert.equal(jobState({ status: "open", posted_at: ago(8), featured_until: ago(1) }, NOW), "expired");
  // closed·expired·hidden 은 병원 화면에서 모두 '마감'
  for (const s of ["closed", "expired", "hidden"] as const) {
    assert.equal(jobState({ status: s, posted_at: ago(1), featured_until: null }, NOW), "closed");
  }
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
  const direct = { source: "direct", featured_until: null, deadline: null };
  assert.equal(isOpenToSeekers({ ...direct, posted_at: ago(1) }, NOW), true);
  assert.equal(isOpenToSeekers({ ...direct, posted_at: ago(8) }, NOW), false);
  // 무료 기간이 끝나도 광고 중이면 계속 보인다
  assert.equal(isOpenToSeekers({ ...direct, posted_at: ago(30), featured_until: later(3) }, NOW), true);

  const worknet = { source: "worknet", posted_at: ago(100), featured_until: null };
  // 외부 수집 공고는 게시 후 7일 규칙을 받지 않는다(마감일만 본다)
  assert.equal(isOpenToSeekers({ ...worknet, deadline: null }, NOW), true);
  assert.equal(isOpenToSeekers({ ...worknet, deadline: "2026-07-23" }, NOW), true); // 마감 당일은 아직 유효
  assert.equal(isOpenToSeekers({ ...worknet, deadline: "2026-07-22" }, NOW), false);
});
