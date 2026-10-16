import { test } from "node:test";
import assert from "node:assert/strict";
import { ltcKind, ltcRegion, mergeLtc, type LtcItem } from "./_ltc.ts";

const item = (o: Partial<LtcItem>): LtcItem => ({
  adminNm: "행복재가센터", adminPttnCd: "C01", longTermAdminSym: "31111000108", siDoCd: "11", siGunGuCd: "110", ...o,
});
const names: Record<string, string> = { "11/110": "종로구", "12/750": "보성군", "36/110": " " };
const sgg = (sd: string, g: string) => names[`${sd}/${g}`];

test("급여 종류 코드 → 이름(서울 기관명으로 맞춰 본 규칙)", () => {
  assert.equal(ltcKind("C01"), "방문요양");
  assert.equal(ltcKind("B02"), "방문목욕");
  assert.equal(ltcKind("B03"), "주야간보호");
  assert.equal(ltcKind("C04"), "단기보호");
  assert.equal(ltcKind("B05"), "방문간호");
  assert.equal(ltcKind("C06"), "복지용구");
  assert.equal(ltcKind("A03"), "노인요양시설");
  assert.equal(ltcKind("A04"), "노인요양공동생활가정");
  assert.equal(ltcKind("G31"), "노인요양시설");
  assert.equal(ltcKind("S41"), "노인요양공동생활가정");
  assert.equal(ltcKind("H31"), "주야간보호");
  assert.equal(ltcKind("Z99"), null);
});

test("지역 — 공단 시도 번호를 명부 표기로(전남광주 통합 12, 세종은 시군구 이름이 비어 시도만)", () => {
  assert.equal(ltcRegion("11", "종로구"), "서울 종로구");
  assert.equal(ltcRegion("12", "보성군"), "전남광주 보성군");
  assert.equal(ltcRegion("36", " "), "세종");
  assert.equal(ltcRegion("46", "보성군"), null, "공단에 없는 번호면 틀린 지역 대신 비운다");
});

test("같은 기관의 여러 줄을 하나로 — 급여 종류를 이어 붙이고 복지용구만 하는 곳은 뺀다", () => {
  const rows = mergeLtc(
    [
      item({ adminPttnCd: "C02" }),
      item({ adminPttnCd: "C01" }),
      item({ adminPttnCd: "C06" }), // 복지용구도 하지만 방문요양·목욕 기관이다 → 싣되 그 종류는 뺀다
      item({ adminNm: "약손복지용구", adminPttnCd: "B06", longTermAdminSym: "31111000999" }), // 복지용구만 → 뺀다
      item({ adminNm: "보성은빛복지센터", adminPttnCd: "B01", longTermAdminSym: "34675000001", siDoCd: "12", siGunGuCd: "750" }),
      item({ adminNm: "모르는코드기관", adminPttnCd: "Z99", longTermAdminSym: "31111000555" }),
    ],
    sgg,
  );
  assert.deepEqual(rows.map((r) => [r.ltc_code, r.name, r.region, r.cl_cd_nm]), [
    ["31111000108", "행복재가센터", "서울 종로구", "방문요양·방문목욕"],
    ["34675000001", "보성은빛복지센터", "전남광주 보성군", "방문요양"],
    ["31111000555", "모르는코드기관", "서울 종로구", "장기요양기관"],
  ]);
  assert.ok(rows.every((r) => r.source === "public_data"));
});
