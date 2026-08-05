// 실행: npm test   (Node 24의 네이티브 TS 실행 — 테스트 러너 설치 불필요)
import { test } from "node:test";
import assert from "node:assert/strict";
import { jobState, isLive, isOpenToSeekers } from "./jobState.ts";
import { listingEnd } from "./date.ts";

const DAY = 86_400_000;
// 2026-07-23 12:00 UTC = KST 21:00 → KST 기준 오늘은 2026-07-23
const NOW = Date.UTC(2026, 6, 23, 12, 0, 0);
const ago = (days: number) => new Date(NOW - days * DAY).toISOString();
const later = (days: number) => new Date(NOW + days * DAY).toISOString();

test("병원이 보는 공고 상태", () => {
  const base = { featured_until: null, deadline: null } as const;
  assert.equal(jobState({ ...base, status: "draft", posted_at: ago(1) }, NOW), "pending");
  assert.equal(jobState({ ...base, status: "open", posted_at: ago(30), featured_until: later(5) }, NOW), "featured");
  // 🔴 광고가 없으면 방금 올린 공고도 노출되지 않는다 — 완전 무료 광고는 없다.
  assert.equal(jobState({ ...base, status: "open", posted_at: ago(0) }, NOW), "expired");
  assert.equal(jobState({ ...base, status: "open", posted_at: ago(8) }, NOW), "expired");
  // 광고가 이미 끝났으면 만료
  assert.equal(jobState({ ...base, status: "open", posted_at: ago(8), featured_until: ago(1) }, NOW), "expired");
  // closed·expired·hidden 은 병원 화면에서 모두 '마감'
  for (const s of ["closed", "expired", "hidden"] as const) {
    assert.equal(jobState({ ...base, status: s, posted_at: ago(1) }, NOW), "closed");
  }
});

// 🔴 병원 화면과 구직자 화면이 같은 답을 해야 한다. 어긋나면 병원은 "노출 중"으로 보는데
//    구직자 목록에는 없고, 병원이 자기 공고 제목을 누르면 404 가 난다(실제로 그랬다).
test("마감일이 지나면 병원 화면도 '노출 종료'로 본다", () => {
  const open = { status: "open", posted_at: ago(1), featured_until: later(5) } as const;
  assert.equal(jobState({ ...open, deadline: "2026-07-22" }, NOW), "expired");  // 어제 마감
  assert.equal(jobState({ ...open, deadline: "2026-07-23" }, NOW), "featured"); // 마감 당일은 아직 유효
  // 광고를 사둔 공고라도 마감일이 지나면 노출되지 않는다 — 광고 배지를 띄우면 거짓말이 된다.
  assert.equal(jobState({ ...open, posted_at: ago(30), featured_until: later(10), deadline: "2026-07-22" }, NOW), "expired");

  // 두 판정이 실제로 일치하는지 — 같은 공고를 두 함수에 넣어 본다.
  const job = { status: "open", source: "direct", posted_at: ago(1), featured_until: later(5), deadline: "2026-07-22" } as const;
  assert.equal(isLive(jobState(job, NOW)), isOpenToSeekers(job, NOW));
});

// 병원 화면의 "~까지 (N일 남음)" 과 대시보드 '마감 임박(3일)' 이 이 값을 쓴다.
// 마감일을 안 보면 내일 사라질 공고를 "7일 남음" 이라고 알려 연장 시점을 놓치게 한다.
test("노출 종료 시각은 마감일과 광고 기간 중 먼저 오는 쪽", () => {
  const day = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  const ad = { featured_until: later(20) } as const;
  // 마감일이 없으면 광고 종료일
  assert.equal(day(listingEnd({ ...ad, deadline: null })), day(NOW + 20 * DAY));
  // 마감일이 더 빠르면 마감일 그날 끝(KST 23:59:59)
  assert.equal(day(listingEnd({ ...ad, deadline: "2026-07-24" })), "2026-07-24");
  // 마감일이 더 멀면 광고가 먼저 끝난다
  assert.equal(day(listingEnd({ ...ad, deadline: "2026-12-31" })), day(NOW + 20 * DAY));
  // 형식이 깨진 값은 무시하고 기존 규칙을 따른다(조작된 POST 방어)
  assert.equal(day(listingEnd({ ...ad, deadline: "not-a-date" })), day(NOW + 20 * DAY));
  // 🔴 광고가 없으면 노출 기간도 없다(0). "게시 7일" 기본값이 다시 게시로 공짜 7일을
  //    덧붙이던 통로였다(/review8 2026-08-05).
  assert.equal(listingEnd({ featured_until: null, deadline: null }), 0);
});

test("노출 중 판정", () => {
  assert.equal(isLive("featured"), true);
  assert.equal(isLive("pending"), false);
  assert.equal(isLive("expired"), false);
  assert.equal(isLive("closed"), false);
});

// 목록에서 걸러진 공고가 상세 링크로는 열리면 "지원했는데 마감이었다" 사고가 난다.
test("구직자에게 보일 공고 — 목록 필터와 같은 규칙", () => {
  const direct = { status: "open", source: "direct", featured_until: later(3), deadline: null } as const;
  assert.equal(isOpenToSeekers({ ...direct, posted_at: ago(1) }, NOW), true);
  // 게시일이 오래돼도 광고 중이면 보인다 — 노출을 정하는 것은 광고뿐이다
  assert.equal(isOpenToSeekers({ ...direct, posted_at: ago(30) }, NOW), true);
  // 광고가 없으면 방금 올렸어도 안 보인다
  assert.equal(isOpenToSeekers({ ...direct, posted_at: ago(1), featured_until: null }, NOW), false);
  // 병원이 마감한 공고는 저장 목록에 남아 있어도 열리면 안 된다
  assert.equal(isOpenToSeekers({ ...direct, status: "closed", posted_at: ago(1) }, NOW), false);
  assert.equal(isOpenToSeekers({ ...direct, status: "hidden", posted_at: ago(1) }, NOW), false);

  const worknet = { status: "open", source: "worknet", posted_at: ago(100), featured_until: null } as const;
  // 외부 수집 공고는 광고 규칙을 받지 않는다(마감일만 본다)
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
  // 방금 올린 것도 광고가 없으면 안 보인다(2026-08-05: 무료 노출 창 폐지)
  assert.equal(isOpenToSeekers({ ...partner, posted_at: ago(1), featured_until: null }, NOW), false);

  // 워크넷만 이 규칙을 안 받는다 — 우리가 파는 자리가 아니라 배경 데이터다
  assert.equal(
    isOpenToSeekers({ status: "open", source: "worknet", posted_at: ago(400), featured_until: null, deadline: null }, NOW),
    true,
  );
});

/**
 * 🔴 이 규칙의 **정본은 DB** 다 — `jobs_listed.is_live`(마이그레이션 20260805200000).
 *    여기 판정과 갈라지면 "목록엔 없는데 링크로는 열리는" 공고가 생긴다.
 *
 * 🔴 이 테스트가 **"완전 무료 광고는 없다"를 노출 쪽에서 못 박는다.** 종전에는
 *    `posted_at >= now() - 7일` 이 있어서, 다시 게시(posted_at 갱신)를 누를 때마다
 *    공짜 7일이 붙었다 — 1주만 사고 영원히 광고할 수 있었다(/review8 2026-08-05).
 */
test("우리 공고는 광고가 없으면 안 보인다 — 게시일은 노출과 무관하다", () => {
  const j = { status: "open", source: "partner", deadline: null } as const;
  // 방금 올렸어도 광고가 없으면 안 보인다.
  assert.equal(isOpenToSeekers({ ...j, posted_at: ago(0), featured_until: null }, NOW), false);
  // 광고가 끝났으면 게시일이 아무리 새것이어도 안 보인다(= 다시 게시로 되살릴 수 없다).
  assert.equal(isOpenToSeekers({ ...j, posted_at: ago(0), featured_until: ago(1) }, NOW), false);
  // 광고가 살아 있으면 게시일이 오래돼도 보인다.
  assert.equal(isOpenToSeekers({ ...j, posted_at: ago(90), featured_until: later(3) }, NOW), true);
  // 워크넷 수집분만 기간 없이 항상 보인다 — 우리가 파는 자리가 아니다.
  assert.equal(isOpenToSeekers({ ...j, source: "worknet", posted_at: ago(90), featured_until: null }, NOW), true);
});
