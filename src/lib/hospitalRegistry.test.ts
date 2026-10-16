import { test } from "node:test";
import assert from "node:assert/strict";
import { decideMatch, pickMatch, type RegistryMatch, type RegistryRow } from "./hospitalRegistry.ts";

const row = (o: Partial<RegistryRow>): RegistryRow =>
  ({ name: "테스트병원", cl_cd_nm: null, region: null, address: null, ...o });

/**
 * 🔴 이 파일이 있는 이유: 여기 판정이 틀리면 **간호사에게 거짓말이 나간다.**
 *    요양원을 상급종합병원 칩에 넣거나, 부산 병원을 "서울 강남" 이라고 적는 경로가 전부 이 함수다.
 *    실측(2026-08-11): 명부 81,431건 중 서로 다른 이름은 57,020개 — "우리한의원" 62곳,
 *    "연세의원" 47곳처럼 동명이 흔해서 "한 건 찾았으니 그 값을 쓴다" 가 통하지 않는다.
 */

test("유일하게 일치하면 종별·지역·주소를 모두 쓴다", () => {
  const m = decideMatch([row({ cl_cd_nm: "상급종합", region: "전남광주 동구", address: "광주 동구 제봉로 42" })]);
  assert.equal(m.facilityType, "상급종합병원");
  assert.equal(m.region, "전남광주 동구");
  assert.equal(m.address, "광주 동구 제봉로 42");
});

test("동명이라도 종별이 전부 같으면 종별은 쓴다 — 지역은 못 쓴다", () => {
  // "우리한의원" 62곳은 전부 한의원이라 종별은 확실하다. 하지만 지역은 62곳이 제각각이다.
  const m = decideMatch([
    row({ cl_cd_nm: "한의원", region: "서울 강남구", address: "서울 강남구 A" }),
    row({ cl_cd_nm: "한의원", region: "부산 해운대구", address: "부산 해운대구 B" }),
  ]);
  assert.equal(m.facilityType, "한방병원");
  assert.equal(m.region, null, "동명이 여럿이면 지역을 고르면 안 된다 — 남의 동네가 찍힌다");
  assert.equal(m.address, null);
});

test("동명인데 종별이 갈리면 비운다", () => {
  const m = decideMatch([row({ cl_cd_nm: "요양병원" }), row({ cl_cd_nm: "의원" })]);
  assert.equal(m.facilityType, null);
});

/**
 * 🔴 이 시험이 핵심이다. 종전 코드는 `.filter(Boolean)` 로 null 을 버려서 판정이
 *    "전부 같을 때" 가 아니라 "**아는 것끼리** 같을 때" 였다. 명부 동기화가 중간까지 반영된
 *    구간에서는 동명 2곳 중 1곳만 종별이 채워진 상태가 실제로 생기고, 그때 그 1곳 값이
 *    나머지 한 곳까지 확정해 버린다.
 */
test("한 곳이라도 종별을 모르면 비운다 — 아는 것끼리 같다고 확정하지 않는다", () => {
  const m = decideMatch([row({ cl_cd_nm: "상급종합" }), row({ cl_cd_nm: null })]);
  assert.equal(m.facilityType, null);
});

test("유일하게 일치해도 종별을 모르면 종별만 비운다 — 지역은 살린다", () => {
  const m = decideMatch([row({ cl_cd_nm: null, region: "서울 종로구" })]);
  assert.equal(m.facilityType, null);
  assert.equal(m.region, "서울 종로구");
});

test("표에 없는 종별(조산원 등)도 확정하지 않는다", () => {
  // facilityFromClCd 가 null 을 주므로 '기타' 로 뭉개지 않는다 — 부르는 쪽이 산업분류로 내려간다.
  assert.equal(decideMatch([row({ cl_cd_nm: "조산원" })]).facilityType, null);
});

test("빈 목록이면 아무것도 확정하지 않는다", () => {
  const m = decideMatch([]);
  assert.equal(m.facilityType, null);
  assert.equal(m.region, null);
  assert.equal(m.address, null);
});

test("같은 이름에 심사평가원 행이 있으면 그 행으로만 판정한다 — 요양원·재가센터(공단 명부) 행이 섞여도 병원 판정이 흐려지지 않게", () => {
  const m = decideMatch([
    row({ name: "곡성군보건의료원", cl_cd_nm: "보건의료원", region: "전남광주 곡성군", address: "전남 곡성군 곡성읍 A", ykiho: "Y1" }),
    row({ name: "곡성군보건의료원", cl_cd_nm: "방문간호", region: "전남광주 곡성군", address: null }),
  ]);
  assert.equal(m.facilityType, "보건소");
  assert.equal(m.address, "전남 곡성군 곡성읍 A", "의료기관 행이 하나면 그 주소를 쓴다");
  assert.equal(m.hira, true);
  const careOnly = decideMatch([row({ name: "행복재가센터", cl_cd_nm: "방문요양·방문목욕", region: "서울 종로구" })]);
  assert.equal(careOnly.facilityType, "요양원·주간보호", "심사평가원 행이 없으면 공단 행으로 판정한다");
  assert.equal(careOnly.hira, false, "부르는 쪽(sync-ats)이 병원 이름 쪽을 먼저 고르게 표시한다");
});

test("이름이 둘로 맞으면 — 심사평가원 쪽 먼저, 그다음 주소 있는 쪽(sync-ats 집계 사이트 공고)", () => {
  const m = (o: Partial<RegistryMatch>): RegistryMatch => ({ facilityType: null, region: null, address: null, hira: false, ...o });
  const hiraNoAddr = m({ facilityType: "종합병원", hira: true });
  const careWithAddr = m({ facilityType: "요양원·주간보호", address: "서울특별시 강북구 월계로 187" });
  assert.equal(pickMatch(hiraNoAddr, careWithAddr), hiraNoAddr, "주소가 있어도 재가센터 쪽으로 병원 공고를 붙이지 않는다");
  assert.equal(pickMatch(careWithAddr, hiraNoAddr), hiraNoAddr);
  const noAddr = m({}), withAddr = m({ address: "A" });
  assert.equal(pickMatch(noAddr, withAddr), withAddr, "둘 다 심사평가원이 아니면 예전처럼 주소 있는 쪽");
  assert.equal(pickMatch(withAddr, m({ address: "B" })), withAddr, "같으면 첫째");
  assert.equal(pickMatch(undefined, noAddr), noAddr);
  assert.equal(pickMatch(undefined, undefined), undefined);
});
