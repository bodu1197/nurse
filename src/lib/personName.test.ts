// 실행: pnpm test
//
// 이 규칙은 DB CHECK(20260804210000)와 **같아야** 한다. 한쪽만 바뀌면 화면은 통과시키고 저장에서 죽는다.
import { test } from "node:test";
import assert from "node:assert/strict";
import { isValidPersonName, cleanPersonName } from "./personName.ts";

test("사람 이름은 통과한다", () => {
  for (const v of ["김간호", "박영화", "Jane Doe", "홍길-동", "김지윤Dharma", "이 서연"]) {
    assert.ok(isValidPersonName(v), v);
  }
});

// 🔴 병원 계정의 표시 이름이 곧 상호다. 여기서 막으면 병원이 가입 자체를 못 한다.
test("병원·법인 이름은 막지 않는다", () => {
  for (const v of ["(주)노블아이산후조리원", "(사)한국의료봉사회", "(하남)예쁨주의쁨의원", "A&B의원", "서울성모병원"]) {
    assert.ok(isValidPersonName(v), v);
  }
});

test("하트·별·이모지·특수기호는 막는다", () => {
  for (const v of ["♡♡♡", "☆SOHEE☆", "🇰🇷", "💌", "선민❤️", "〰️", "갱💕", "🐰"]) {
    assert.ok(!isValidPersonName(v), v);
  }
});

test("글자가 없는 이름은 막는다", () => {
  for (const v of ["...", "***", "@@", ":)", ":D", "()", " ", ""]) {
    assert.ok(!isValidPersonName(v), JSON.stringify(v));
  }
});

test("문장부호로 시작하는 이름은 막는다", () => {
  for (const v of [",이아란", ".김철수", "-홍길동", "&#039;김경희"]) {
    assert.ok(!isValidPersonName(v), v);
  }
});

test("30자를 넘으면 막는다", () => {
  assert.ok(isValidPersonName("가".repeat(30)));
  assert.ok(!isValidPersonName("가".repeat(31)));
});

test("정리는 이름을 바꾸지 않고 못 쓰는 문자만 덜어낸다", () => {
  assert.equal(cleanPersonName("정희❤️"), "정희");
  assert.equal(cleanPersonName("선민❤️"), "선민");
  assert.equal(cleanPersonName("김지윤+Dharma"), "김지윤Dharma");
  assert.equal(cleanPersonName(",이아란"), "이아란");
  assert.equal(cleanPersonName("(주)노블아이"), "(주)노블아이");
});

test("정리해도 글자가 안 남으면 null — 부를 쪽이 대체값을 정한다", () => {
  for (const v of ["💕", "一片树叶", "ＪａｅＹｕｎ", "...", "♡(♡)"]) {
    assert.equal(cleanPersonName(v), null, v);
  }
});
