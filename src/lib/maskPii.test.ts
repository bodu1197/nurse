// 실행: npm test   (Node 24의 네이티브 TS 실행 — 테스트 러너 설치 불필요)
import { test } from "node:test";
import assert from "node:assert/strict";
import { maskName, maskContacts, maskFree, maskDeep } from "./maskPii.ts";

/**
 * 🔴 이 관문이 깨지면 **되돌릴 수 없다.** 인재정보는 구글에 색인되므로(2026-08-08),
 *    새어 나간 실명·번호는 검색 캐시에 그대로 남는다. 그래서 여기서 깨지게 둔다.
 */

test("실명은 성만 남기고 가린다", () => {
  assert.equal(maskName("안녕하세요 김민수입니다", "김민수"), "안녕하세요 김○○입니다");
  assert.equal(maskName("김민수 / 김민수", "김민수"), "김○○ / 김○○"); // 여러 번 나와도 전부
  assert.equal(maskName("남궁민수 간호사", "남궁민수"), "남○○○ 간호사"); // 네 글자 이름
});

test("이름이 없거나 한 글자면 원문을 건드리지 않는다", () => {
  assert.equal(maskName("이 병동은 좋다", null), "이 병동은 좋다");
  assert.equal(maskName("이 병동은 좋다", "이"), "이 병동은 좋다"); // 한 글자를 지우면 문장이 깨진다
  assert.equal(maskName(null, "김민수"), null);
});

test("휴대폰은 구분자가 무엇이든 가린다", () => {
  for (const raw of ["010-1234-5678", "01012345678", "010.1234.5678", "010 1234 5678", "016-123-4567"]) {
    assert.equal(maskContacts(`연락처 ${raw} 입니다`), "연락처 010-****-**** 입니다", raw);
  }
});

test("이메일을 가린다", () => {
  assert.equal(maskContacts("메일 a.b-c_1@example.co.kr 로 주세요"), "메일 ***@*** 로 주세요");
});

test("한 문장에 실명·전화·이메일이 다 있어도 전부 가린다", () => {
  assert.equal(
    maskFree("김민수입니다. 010-1234-5678 / kim@test.com 으로 연락주세요", "김민수"),
    "김○○입니다. 010-****-**** / ***@*** 으로 연락주세요",
  );
});

test("가릴 것이 없는 평범한 문장은 그대로 둔다", () => {
  const plain = "중환자실 3년, 인공호흡기 관리 및 CRRT 경험";
  assert.equal(maskFree(plain, "김민수"), plain);
});

test("실제로 새던 전화 표기들을 잡는다", () => {
  // 재검증(2026-08-08)에서 옛 정규식을 빠져나간 것들 — 회귀 방지
  for (const raw of ["+82-10-1234-5678", "82 10 1234 5678", "010)1234-5678", "010--1234--5678"]) {
    assert.equal(maskContacts(`연락 ${raw} 입니다`), "연락 010-****-**** 입니다", raw);
  }
});

test("긴 숫자열 한가운데를 전화번호로 오인하지 않는다", () => {
  // 면허번호·사업자번호가 잘려나가면 경력이 읽히지 않는다
  const plain = "면허 20101234567890 / 사업자 3630601936";
  assert.equal(maskContacts(plain), plain);
});

test("띄어 쓴 실명과 한글 도메인 이메일도 가린다", () => {
  assert.equal(maskName("김 민수 간호사", "김민수"), "김○○ 간호사");
  assert.equal(maskContacts("hong@한국.kr 로 주세요"), "***@*** 로 주세요");
});

test("정규식 특수문자가 든 이름도 안전하게 가린다", () => {
  // 이름에 . ( 등이 들어오면 이스케이프가 없을 때 정규식이 깨지거나 엉뚱한 곳을 지운다
  assert.equal(maskName("A.B 님 안녕", "A.B"), "A○○ 님 안녕");
  assert.doesNotThrow(() => maskName("아무 말", "김(민수"));
});

test("maskDeep 은 값의 모양을 바꾸지 않고 안쪽 문자열만 가린다", () => {
  const row = {
    id: 7,
    is_current: true,
    duties: "김민수 담당 010-1234-5678",
    department: null,
    certs: ["BLS", "문의 010-1234-5678"],
    nested: { position: "김민수 수간호사" },
  };
  const out = maskDeep(row, "김민수");
  assert.equal(out.id, 7);              // 숫자는 그대로
  assert.equal(out.is_current, true);   // 불리언도 그대로
  assert.equal(out.department, null);   // null 도 그대로
  assert.equal(out.duties, "김○○ 담당 010-****-****");
  assert.deepEqual(out.certs, ["BLS", "문의 010-****-****"]);
  assert.equal(out.nested.position, "김○○ 수간호사"); // 중첩 객체까지 내려간다
});

test("g 플래그 정규식이 호출 사이에 상태를 남기지 않는다", () => {
  // 같은 입력을 두 번 넣으면 두 번 다 같은 결과여야 한다(lastIndex 누수 회귀 방지).
  const s = "010-1111-2222 그리고 010-3333-4444";
  assert.equal(maskContacts(s), maskContacts(s));
  assert.equal(maskContacts(s), "010-****-**** 그리고 010-****-****");
});
