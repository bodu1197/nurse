import { test } from "node:test";
import assert from "node:assert/strict";
import { isWorknetUrl, shouldPruneCare, splitGeoRows } from "./careSync.ts";

test("삭제 가드 — 직전 실행보다 10% 넘게 줄면 지우지 않고, 0건이면 절대 지우지 않는다", () => {
  assert.equal(shouldPruneCare(10675, null), true, "첫 실행은 지운다");
  assert.equal(shouldPruneCare(9700, 10675), true, "9% 감소는 정상 변동");
  assert.equal(shouldPruneCare(7000, 10675), false, "한 코드가 0건으로 와 34% 줄면 건너뛴다");
  assert.equal(shouldPruneCare(0, null), false, "0건 수집은 첫 실행이라도 지우지 않는다");
  assert.equal(shouldPruneCare(0, 10675), false);
  assert.equal(shouldPruneCare(7000, 7000), true, "줄어든 상태가 이어지면 다음 실행이 받아들인다");
  assert.equal(shouldPruneCare(2000, 0), false, "기준치가 0 이면 어떤 수도 '줄지 않음'이 된다 — 지우지 않는다");
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
