// 실행: npm test   (Node 24의 네이티브 TS 실행 — 테스트 러너 설치 불필요)
import { test } from "node:test";
import assert from "node:assert/strict";
import { elapsed } from "./date.ts";

const at = (h: number, m = 0) => new Date(Date.UTC(2026, 7, 4, h, m)).toISOString();

test("elapsed — 지원한 뒤 병원이 보기까지", () => {
  assert.equal(elapsed(at(0), at(0)), "바로");
  assert.equal(elapsed(at(0), at(0, 45)), "45분 뒤");
  assert.equal(elapsed(at(0), at(1)), "1시간 뒤");
  // 🔴 내림이다. 17시간 16분을 "18시간" 이라고 하면 병원이 실제보다 느린 것처럼 말하게 된다.
  assert.equal(elapsed("2026-08-04T05:54:36Z", "2026-08-04T23:10:41Z"), "17시간 뒤");
  // 이틀부터는 날로 떨어뜨린다 — "47시간" 은 읽고 나서 다시 나눠야 한다.
  assert.equal(elapsed(at(0), new Date(Date.UTC(2026, 7, 5, 23)).toISOString()), "47시간 뒤");
  assert.equal(elapsed(at(0), new Date(Date.UTC(2026, 7, 6, 1)).toISOString()), "2일 뒤");
  // 거꾸로 흐르는 시각·잘못된 값은 아무 말도 하지 않는다(화면에서 "-" 로 그린다).
  assert.equal(elapsed(at(5), at(1)), "");
  assert.equal(elapsed("", at(1)), "");
});
