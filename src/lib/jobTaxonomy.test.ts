import { test } from "node:test";
import assert from "node:assert/strict";
import { departmentFromText, facilityFor } from "./jobTaxonomy.ts";

/**
 * 진료과 추론 회귀 테스트.
 *
 * 왜 생겼나: 규칙이 정규식이라 조용히 틀린다. 실제로 두 번 터졌다 —
 *   · `/분만/` 이 "오래 하실 **분만** 연락주세요"(분+만 조사)를 분만실로 잡아, 요양원 공고에
 *     분만실 8건이 떴다(오너 지적 2026-07-29).
 *   · `\bICU\b` 를 쓰려다 소스에 **실제 백스페이스 문자(0x08)** 가 들어가 ICU 매칭이 통째로
 *     죽었는데 컴파일도 린트도 통과했다.
 * 눈으로는 안 잡힌다. 대표 문장으로 못 박는다.
 */

test("진료과 — 진짜는 잡는다", () => {
  const cases: Array<[string, string]> = [
    ["분만실 간호사 모집", "분만실"],
    ["LDR 간호사 채용", "분만실"],
    ["신생아실 간호사 채용", "신생아실"],
    ["NICU 경력 간호사", "신생아실"],       // ICU 를 품고 있어 순서가 중요하다
    ["중환자실(ICU) 3교대", "중환자실"],
    ["특수검진실 간호사 모집합니다", "건강진단센터"],
    ["종합검진 간호사 채용", "건강진단센터"],
    ["수술실 scrub 간호사", "수술실"],
    ["마취통증의학과 간호사", "마취과/회복실"],
    ["인공신장실 투석 간호사", "인공신장실"],
    ["정형외과 병원 간호조무사", "정형외과"],
  ];
  for (const [text, expected] of cases) {
    assert.equal(departmentFromText(text), expected, `"${text}" 가 ${expected} 여야 한다`);
  }
});

test("진료과 — 진료과가 아닌 문장은 잡지 않는다", () => {
  const notDepartment = [
    "오래 하실 분만 연락주세요",                    // 분 + 만(조사)
    "요양원 근무 경험 있으신 분만 지원 부탁드립니다", // 같은 함정
    "직원 건강검진 지원, 4대보험 완비",              // 복리후생
    "채용건강검진 1개월 이내 서류 제출",             // 제출서류
    "간호사 or 간호조무사 채용",                    // 'OR' 를 수술실로 읽던 버그
    "문의: recruit@medicure.co.kr",                // 'ICU' 부분일치
    "노인요양원 간호조무사 모집",                    // 진료과 없음이 정답
  ];
  for (const text of notDepartment) {
    assert.equal(departmentFromText(text), null, `"${text}" 는 진료과가 없어야 한다`);
  }
});

test("기관 종별 — 회사명이 산업분류를 이긴다", () => {
  // 산후조리원은 사업자 등록에 따라 산업분류가 제각각이라 요양원으로 새는 일이 있었다.
  assert.equal(facilityFor("헤리티지 산후조리원", "노인 요양 복지시설 운영업"), "산후조리원");
  assert.equal(facilityFor("본느마망산후조리원", "그 외 기타 보건업"), "산후조리원");
  // 이름에 단서가 없으면 산업분류를 그대로 쓴다.
  assert.equal(facilityFor("덕인노인전문요양원", "노인 요양 복지시설 운영업"), "요양원·주간보호");
  assert.equal(facilityFor("의령군립노인전문병원", "요양 병원"), "요양병원");
  assert.equal(facilityFor(null, null), null);
});

test("소스에 제어문자가 섞이지 않았다", async () => {
  // `\b` 를 쓰려다 실제 백스페이스(0x08)를 심으면 정규식이 조용히 죽는다 — 실제로 겪었다.
  const { readFileSync } = await import("node:fs");
  const buf = readFileSync(new URL("./jobTaxonomy.ts", import.meta.url));
  const bad = [...buf].filter((b) => b < 0x09 || (b > 0x0d && b < 0x20));
  assert.equal(bad.length, 0, `제어문자 ${bad.length}개 발견 — \\b 를 쓰려다 백스페이스를 심었을 수 있다`);
});
