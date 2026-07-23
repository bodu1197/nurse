// 실행: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { totalMonths, totalYears, careerText } from "./career.ts";

const NOW = new Date("2026-07-15T00:00:00Z");

test("근무 개월 수 — 시작·끝 달을 모두 포함한다", () => {
  // 2020-01 ~ 2024-12 = 60개월(5년). 끝에서 시작만 빼면 59가 되어 1개월 손해.
  assert.equal(totalMonths([{ start_ym: "2020-01", end_ym: "2024-12", is_current: false }], NOW), 60);
  assert.equal(totalMonths([{ start_ym: "2024-03", end_ym: "2024-03", is_current: false }], NOW), 1);
  assert.equal(totalMonths([
    { start_ym: "2020-01", end_ym: "2021-12", is_current: false },
    { start_ym: "2022-01", end_ym: "2022-06", is_current: false },
  ], NOW), 30);
});

test("재직중은 오늘까지 센다", () => {
  assert.equal(totalMonths([{ start_ym: "2026-01", end_ym: null, is_current: true }], NOW), 7);
});

test("총 경력 년수는 내림 — 11개월은 0년", () => {
  assert.equal(totalYears([{ start_ym: "2025-09", end_ym: "2026-07", is_current: false }], NOW), 0);
  assert.equal(totalYears([{ start_ym: "2020-01", end_ym: "2024-12", is_current: false }], NOW), 5);
});

test("careerText — 사람이 읽는 형태", () => {
  assert.equal(careerText(0), "신규");
  assert.equal(careerText(3), "3개월");
  assert.equal(careerText(12), "1년");
  assert.equal(careerText(40), "3년 4개월");
});
