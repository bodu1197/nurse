// 실행: npm test   (Node 24의 네이티브 TS 실행 — 테스트 러너 설치 불필요)
import { test } from "node:test";
import assert from "node:assert/strict";
import { firstParam, pageParam, PAGE_MAX, safeNext } from "./url.ts";

test("같은 키가 배열로 와도 첫 값만 — .trim() 에서 500 이 나지 않게", () => {
  assert.equal(firstParam(["서울특별시", "x"]), "서울특별시");
  assert.equal(firstParam("부산광역시"), "부산광역시");
  assert.equal(firstParam(undefined), "");
  assert.equal(firstParam([]), "");
});

test("쪽수는 1 이상의 안전한 정수만 — 소수·무한·음수·배열은 1쪽 또는 상한", () => {
  assert.equal(pageParam("3"), 3);
  assert.equal(pageParam("1.01"), 1, "소수 쪽은 offset 을 깨뜨린다");
  assert.equal(pageParam("Infinity"), 1);
  assert.equal(pageParam("1e300"), 1);
  assert.equal(pageParam("-2"), 1);
  assert.equal(pageParam("abc"), 1);
  assert.equal(pageParam(undefined), 1);
  assert.equal(pageParam(["4", "9"]), 4);
  assert.equal(pageParam(String(PAGE_MAX * 10)), PAGE_MAX);
});

test("내부 경로는 그대로 통과한다", () => {
  assert.equal(safeNext("/jobs"), "/jobs");
  assert.equal(safeNext("/jobs/abc?apply=dup"), "/jobs/abc?apply=dup");
  assert.equal(safeNext("/"), "/");
});

test("외부로 나가는 경로는 전부 막는다", () => {
  assert.equal(safeNext("//evil.com"), "/");
  assert.equal(safeNext("https://evil.com"), "/");
  assert.equal(safeNext("javascript:alert(1)"), "/");
  // 백슬래시: 브라우저 URL 파서가 "/"로 바꿔 읽어 //evil.com이 된다
  assert.equal(safeNext("/\\evil.com"), "/");
  assert.equal(safeNext("\\\\evil.com"), "/");
  // 탭·개행: 브라우저가 지운 뒤 해석해 역시 //evil.com이 된다
  assert.equal(safeNext("/\t/evil.com"), "/");
  assert.equal(safeNext("/\n\\evil.com"), "/");
});

test("빈 값이면 대체 경로를 준다", () => {
  assert.equal(safeNext(null), "/");
  assert.equal(safeNext(undefined, "/jobs"), "/jobs");
  assert.equal(safeNext("", "/mypage/resume?ok=1"), "/mypage/resume?ok=1");
});
