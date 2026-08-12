import { test } from "node:test";
import assert from "node:assert/strict";
import { decodeEntities, decodeHtml, detailText } from "./html.ts";

/**
 * 🔴 공고 본문은 **여러 줄로** 남아야 한다. 태그만 지우면 1,300자가 한 줄로 뭉쳐
 *    읽을 수 없다(오너 신고 2026-08-12: "완전 떡이 되어 있다").
 */
test("문단·행 경계에서 줄을 바꾼다", () => {
  const out = detailText(`<p>모집부문 및 자격요건</p><p>가. 학력 : 전문학사 이상<br>나. 면허 : 간호사</p>`);
  assert.deepEqual(out.split("\n"), ["모집부문 및 자격요건", "가. 학력 : 전문학사 이상", "나. 면허 : 간호사"]);
});

/** 🔴 칸마다 줄을 바꾸면 표의 머리글과 값이 짝을 잃는다 — 행 끝에서만 바꾼다. */
test("표는 행 끝에서만 줄을 바꾼다", () => {
  const out = detailText(`<tr><td>모집 부서</td><td>간호부</td></tr><tr><td>인원</td><td>1명</td></tr>`);
  assert.deepEqual(out.split("\n"), ["모집 부서 · 간호부", "인원 · 1명"]);
});

test("빈 칸이 이어져도 구분자만 남기지 않는다", () => {
  assert.equal(detailText(`<tr><td></td><td></td><td>간호사</td></tr>`), "간호사");
});

/**
 * 🔴 편집기로 쓴 공고문은 글자 단위로 색을 입혀 한 낱말이 태그로 쪼개져 있다.
 *    태그를 공백으로 바꾸면 "계 약직", "심사간호 사" 가 된다(실측 — 성빈센트병원 공고).
 */
test("꾸미기 태그로 쪼개진 낱말을 붙인다", () => {
  assert.equal(detailText(`<p>휴직대체 <span style="color:#333">계</span><span>약직</span></p>`), "휴직대체 계약직");
  assert.equal(detailText(`<p>[<font color="#f00">심사간호</font>사]</p>`), "[심사간호사]");
});

/** 반대로 문단·표 경계는 그대로 나뉘어야 한다 — 붙이기가 번져 문장이 뭉치면 안 된다. */
test("낱말 붙이기가 문단 경계까지 없애지 않는다", () => {
  assert.deepEqual(detailText(`<p><b>모집분야</b></p><p><span>간호사</span></p>`).split("\n"), ["모집분야", "간호사"]);
});

/** 🔴 링크는 보통 서로 다른 항목이다 — 붙이면 "서울부산" 이 된다. */
test("링크끼리는 붙이지 않는다", () => {
  assert.equal(detailText(`<p><a href="#">서울</a><a href="#">부산</a></p>`), "서울 부산");
});

/** 상한을 넘겨도 자른다 — 남의 페이지 크기를 우리가 정할 수 없다. */
test("본문 길이 상한을 지킨다", () => {
  assert.equal(detailText(`<p>${"가".repeat(9000)}</p>`, 500).length, 500);
});

/** 자른 끝에 구분자·공백이 매달리면 문장이 끊긴 티가 지저분하게 난다. */
test("자른 끝에 구분자가 남지 않는다", () => {
  assert.doesNotMatch(detailText(`<tr><td>가나다</td><td>라마바</td></tr>`, 5), /[\s·]$/);
});

/** EUC-KR 로 인코딩한 "연세척병원 간호사" (실제 바이트). */
const EUCKR = new Uint8Array([
  0xbf, 0xac, 0xbc, 0xbc, 0xc3, 0xb4, 0xba, 0xb4, 0xbf, 0xf8, 0x20, 0xb0, 0xa3, 0xc8, 0xa3, 0xbb, 0xe7,
]);
const bufOf = (b: Uint8Array) => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;

/**
 * 🔴 국내 채용 사이트에 EUC-KR 이 흔하다. UTF-8 로 읽으면 **한글만 깨지고 링크·숫자는 멀쩡해서**
 *    파서가 조용히 0건을 돌려준다 — 실패로도 안 잡힌다(인재채움뱅크에서 실제로 당했다).
 */
test("EUC-KR 응답을 헤더의 문자셋대로 읽는다", () => {
  assert.equal(decodeHtml(bufOf(EUCKR), "text/html; Charset=EUC-KR"), "연세척병원 간호사");
});

test("헤더에 문자셋이 없으면 <meta charset> 을 본다", () => {
  const meta = new TextEncoder().encode('<meta charset="euc-kr">');
  const body = new Uint8Array([...meta, ...EUCKR]);
  assert.match(decodeHtml(bufOf(body), "text/html"), /연세척병원 간호사$/);
});

test("문자셋 선언이 없으면 UTF-8 로 읽는다", () => {
  const utf8 = new TextEncoder().encode("연세척병원 간호사");
  assert.equal(decodeHtml(bufOf(utf8), null), "연세척병원 간호사");
});

test("모르는 문자셋 이름이어도 던지지 않는다 — 수집이 멈추면 안 된다", () => {
  const utf8 = new TextEncoder().encode("간호사");
  assert.equal(decodeHtml(bufOf(utf8), "text/html; charset=ks_c_5601-1987x"), "간호사");
});

test("단일 인코딩 — 기본 엔티티", () => {
  assert.equal(decodeEntities("A&amp;B"), "A&B");
  assert.equal(decodeEntities("a&lt;b&gt;c"), "a<b>c");
  assert.equal(decodeEntities('그는 &quot;네&quot;'), '그는 "네"');
});

test("이중 인코딩 — 워크넷 &amp;amp; 를 끝까지 푼다", () => {
  assert.equal(decodeEntities("신입&amp;amp;경력"), "신입&경력");
  assert.equal(decodeEntities("D&amp;amp;E 간호사"), "D&E 간호사");
  // 중첩 엔티티: &amp;lt; → &lt; → <
  assert.equal(decodeEntities("x&amp;lt;y"), "x<y");
});

test("엔티티 없으면 그대로", () => {
  assert.equal(decodeEntities("삼천포서울병원 인공신장실 간호사"), "삼천포서울병원 인공신장실 간호사");
  assert.equal(decodeEntities(""), "");
});
