// talent(C:\dev\talent\src\__tests__\lib\location-radius.test.ts)의 clampRadius/parseRadius/radiusLabel
// 케이스를 그대로 이식 — 반경은 URL(?r=)에서 무검증으로 들어와 서버 bounding-box 계산에 그대로 쓰인다.
// 클램프가 뚫리면 딥링크 하나로 전국 범위 스캔이 만들어진다.
import { test } from "node:test";
import assert from "node:assert/strict";
import { clampRadius, parseRadius, radiusLabel, type RadiusConfig } from "./radius.ts";

const cfg: RadiusConfig = { min: 1000, max: 30_000, default: 10_000, step: 1000 };

test("clampRadius — 범위 안 값은 그대로 둔다", () => {
  assert.equal(clampRadius(15_000, cfg), 15_000);
});

test("clampRadius — 하한/상한 밖은 클램프한다", () => {
  assert.equal(clampRadius(-99_999, cfg), cfg.min);
  assert.equal(clampRadius(0, cfg), cfg.min);
  assert.equal(clampRadius(99_999_999, cfg), cfg.max);
});

test("clampRadius — 숫자가 아니면 기본값", () => {
  assert.equal(clampRadius(Number.NaN, cfg), cfg.default);
  assert.equal(clampRadius(Number.POSITIVE_INFINITY, cfg), cfg.default);
});

test("clampRadius — step 격자에 정렬한다", () => {
  assert.equal(clampRadius(7500, cfg), 8000);
  assert.equal(clampRadius(7400, cfg), 7000);
});

test("parseRadius — 빈 값·비수치는 기본값", () => {
  assert.equal(parseRadius(undefined, cfg), cfg.default);
  assert.equal(parseRadius(null, cfg), cfg.default);
  assert.equal(parseRadius("", cfg), cfg.default);
  assert.equal(parseRadius("abc", cfg), cfg.default);
});

test("radiusLabel — 1km 미만은 m, 이상은 km(정수면 소수점 생략)", () => {
  assert.equal(radiusLabel(999), "999m");
  assert.equal(radiusLabel(1000), "1km");
  assert.equal(radiusLabel(1500), "1.5km");
  assert.equal(radiusLabel(30_000), "30km");
});
