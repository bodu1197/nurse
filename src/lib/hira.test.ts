import { test } from "node:test";
import assert from "node:assert/strict";
import { toRows } from "./hira.ts";

// 실제 응답에서 그대로 옮긴 항목(2026-08-14, yadmNm=서울아산병원).
const 아산 = {
  ykiho: "JDQ4MTg4MSM1MSMkMSMkMCMkODk",
  yadmNm: "재단법인아산사회복지재단 서울아산병원",
  addr: "서울특별시 송파구 올림픽로43길 88",
  sidoCdNm: "서울",
  sgguCdNm: "송파구",
  clCdNm: "상급종합",
};

test("한 곳만 걸리면 배열이 아니라 객체로 온다 — 그래도 1행이 나와야 한다", () => {
  // 🔴 이게 깨지면 이름 검색으로 새 병원을 받아 넣는 길이 통째로 죽는다(대부분 단건이다).
  const rows = toRows(아산);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].name, "재단법인아산사회복지재단 서울아산병원");
  assert.equal(rows[0].region, "서울 송파구");
  assert.equal(rows[0].cl_cd_nm, "상급종합");
});

test("출처를 항상 public_data 로 박는다", () => {
  // 안 박으면 컬럼 기본값 'direct'(직접등록)가 붙는다 — 실제로 464곳이 그렇게 잘못 들어갔었다.
  assert.equal(toRows([아산])[0].source, "public_data");
});

test("결과가 없으면 빈 배열 — undefined 든 빈 배열이든", () => {
  assert.deepEqual(toRows(undefined), []);
  assert.deepEqual(toRows([]), []);
});

test("ykiho 나 이름이 없는 항목은 버린다 — 명부의 열쇠가 없으면 upsert 가 중복을 만든다", () => {
  assert.equal(toRows([{ yadmNm: "이름만있음" }, { ykiho: "키만있음" }, 아산]).length, 1);
});

test("종별이 비었거나 공백뿐이면 null — 빈 값은 칩에서 빠질 뿐이지만 틀린 값은 거짓말이다", () => {
  assert.equal(toRows([{ ...아산, clCdNm: "  " }])[0].cl_cd_nm, null);
  assert.equal(toRows([{ ...아산, sidoCdNm: undefined, sgguCdNm: undefined }])[0].region, null);
});

test("문자열이 아닌 값이 와도 안 터지고 걸러진다 — 서비스롤로 넣는 값이라 여기가 신뢰 경계다", () => {
  // 외부 JSON 이 숫자·null·문자열을 섞어 보내도 열쇠가 문자열인 것만 통과해야 한다.
  const 쓰레기 = [null, 42, "문자열", { ykiho: 1, yadmNm: 2 }, { ...아산, addr: 99, clCdNm: 7 }];
  const rows = toRows(쓰레기);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].address, null); // 숫자로 온 주소는 버린다
  assert.equal(rows[0].cl_cd_nm, null);
});
