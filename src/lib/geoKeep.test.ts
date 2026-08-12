import { test } from "node:test";
import assert from "node:assert/strict";
import { keepOrReplaceCoords, addressMoved } from "./geoKeep.ts";

const prev = { lat: 37.58, lng: 127.0 };

/**
 * 🔴 이 시험이 이 파일의 이유다. 종전 코드는 저장할 때마다 지오코딩하고 결과를 그대로 덮어썼다.
 *    병원이 **제목만 고쳐 저장**했는데 그때 카카오가 한 번 삐끗하면 좌표가 null 이 되고,
 *    그 공고는 「내 주변」에서 조용히 사라진다. 병원도 우리도 모른다.
 */
test("주소가 그대로면 지오코딩이 실패해도 좌표를 지키지 않는다 — 건드리지 않는다", () => {
  assert.deepEqual(keepOrReplaceCoords(false, null, prev), prev);
});

test("주소가 그대로면 새로 잡은 값이 있어도 옛 좌표를 유지한다(외부 호출 자체를 안 한다)", () => {
  assert.deepEqual(keepOrReplaceCoords(false, { lat: 1, lng: 2 }, prev), prev);
});

test("주소가 바뀌면 새 좌표로 바꾼다", () => {
  assert.deepEqual(keepOrReplaceCoords(true, { lat: 35.1, lng: 129.0 }, prev), { lat: 35.1, lng: 129.0 });
});

/** 🔴 옛 주소의 좌표를 새 주소에 남겨두면 「내 주변」이 엉뚱한 동네라고 거짓말한다. */
test("주소가 바뀌었는데 지오코딩에 실패하면 비운다", () => {
  assert.deepEqual(keepOrReplaceCoords(true, null, prev), { lat: null, lng: null });
});

test("앞뒤 공백 차이는 '바뀐 것'이 아니다", () => {
  assert.equal(addressMoved("서울 종로구 대학로 101", " 서울 종로구 대학로 101 "), false);
  assert.equal(addressMoved(null, ""), false);
  assert.equal(addressMoved("서울 종로구", "부산 서구"), true);
  assert.equal(addressMoved(null, "서울 종로구"), true);
  assert.equal(addressMoved("서울 종로구", null), true);
});
