import { test } from "node:test";
import assert from "node:assert/strict";
import { CARE_DETAIL_RETRY_MS, isCrawlerUa, isWorknetUrl, needsCareDetail, shouldPruneCare, splitGeoRows } from "./careSync.ts";

test("마감 가드 — 직전 실행보다 10% 넘게 줄면 마감시키지 않고, 0건이면 절대 마감시키지 않는다", () => {
  assert.equal(shouldPruneCare(10675, null), true, "첫 실행은 마감시킨다");
  assert.equal(shouldPruneCare(9700, 10675), true, "9% 감소는 정상 변동");
  assert.equal(shouldPruneCare(7000, 10675), false, "한 코드가 0건으로 와 34% 줄면 건너뛴다");
  assert.equal(shouldPruneCare(0, null), false, "0건 수집은 첫 실행이라도 마감시키지 않는다");
  assert.equal(shouldPruneCare(0, 10675), false);
  assert.equal(shouldPruneCare(7000, 7000), true, "줄어든 상태가 이어지면 다음 실행이 받아들인다");
  assert.equal(shouldPruneCare(2000, 0), false, "기준치가 0 이면 어떤 수도 '줄지 않음'이 된다 — 마감시키지 않는다");
  assert.equal(shouldPruneCare(2000, -1), false);
});

test("저장 묶음 — 좌표를 시도하지 않은 행에는 lat 키 자체가 없어야 저장된 좌표가 유지된다", () => {
  const rows = [{ external_id: "a", title: "A" }, { external_id: "b", title: "B" }, { external_id: "c", title: "C" }];
  const coords = new Map([["a", { lat: 37.5, lng: 127 }], ["b", null]]); // b 는 시도했지만 주소 검색 실패
  const { withGeo, withoutGeo } = splitGeoRows(rows, coords, "2026-10-16T00:00:00.000Z");
  assert.deepEqual(withGeo.map((r) => r.external_id), ["a", "b"]);
  assert.equal(withGeo[0].lat, 37.5);
  assert.equal(withGeo[1].lat, null, "실패도 null 좌표 + geocoded_at 으로 기록한다(재시도 방지)");
  assert.equal(withGeo[1].geocoded_at, "2026-10-16T00:00:00.000Z");
  assert.deepEqual(withoutGeo, [{ external_id: "c", title: "C" }]);
  assert.equal("lat" in withoutGeo[0], false);
  assert.equal("geocoded_at" in withoutGeo[0], false);
});

test("원문 링크 — https 의 work24.go.kr 만 받는다", () => {
  assert.equal(isWorknetUrl("https://www.work24.go.kr/wk/a/b/1500/empDetailAuthView.do?x=1"), true);
  assert.equal(isWorknetUrl("http://www.work24.go.kr/x"), false, "http 는 안 받는다");
  assert.equal(isWorknetUrl("https://evil.example/work24.go.kr/"), false, "경로에 끼운 가짜 도메인");
  assert.equal(isWorknetUrl("https://work24.go.kr.evil.example/"), false);
  assert.equal(isWorknetUrl("javascript:alert(1)"), false);
  assert.equal(isWorknetUrl(""), false);
  assert.equal(isWorknetUrl(null), false);
});

test("상세 재시도 — 처음엔 묻고, 본문이 있으면 다시 안 묻고, 비어 있으면 하루 지난 뒤에만 다시 묻는다", () => {
  const now = Date.parse("2026-10-16T12:00:00.000Z");
  assert.equal(needsCareDetail({ description: null, detail_fetched_at: null }, now), true, "아직 아무도 안 열어 봄");
  assert.equal(needsCareDetail({ description: "본문", detail_fetched_at: "2026-01-01T00:00:00.000Z" }, now), false, "본문이 있으면 끝");
  assert.equal(needsCareDetail({ description: null, detail_fetched_at: "2026-10-16T11:00:00.000Z" }, now), false, "한 시간 전 실패 — 아직 안 묻는다");
  assert.equal(needsCareDetail({ description: null, detail_fetched_at: new Date(now - CARE_DETAIL_RETRY_MS).toISOString() }, now), true, "하루 지나면 다시 묻는다");
  assert.equal(needsCareDetail({ description: null, detail_fetched_at: "not-a-date" }, now), true, "읽을 수 없는 시각은 다시 묻는다");
});

test("크롤러 UA — Next 의 isBot 이 놓치는 네이버·다음·카카오 미리보기·AI 크롤러도 봇으로 본다", () => {
  for (const ua of [
    "Mozilla/5.0 (compatible; Yeti/1.1; +https://naver.me/spd)",
    "Mozilla/5.0 (compatible; Daumoa/4.0; +http://cs.daum.net/faq/15/4118.html)",
    "Mozilla/5.0 (compatible; Daum/4.1; +http://cs.daum.net/faq/15/4118.html?faqId=17351)",
    "facebookexternalhit/1.1;kakaotalk-scrap/1.0;",
    "Mozilla/5.0 AppleWebKit/537.36 (compatible; ClaudeBot/1.0)",
    "Mozilla/5.0 (compatible; Bytespider; spider-feedback@bytedance.com)",
    "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
    "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GPTBot/1.2; +https://openai.com/gptbot)",
    "Mozilla/5.0 (compatible; PetalBot;+https://webmaster.petalsearch.com/site/petalbot)",
  ]) assert.equal(isCrawlerUa(ua), true, ua);
  for (const ua of [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
    // 사람인데 넓은 정규식에 걸리던 것 — 다음 앱 인앱 브라우저, CUBOT 휴대폰
    "Mozilla/5.0 (Linux; Android 13; SM-S911N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36 DaumApps/8.5.0",
    "Mozilla/5.0 (Linux; Android 10; CUBOT X30) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36",
    "",
  ]) assert.equal(isCrawlerUa(ua), false, ua || "(빈 UA)");
});
