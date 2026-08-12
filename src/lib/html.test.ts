import { test } from "node:test";
import assert from "node:assert/strict";
import { decodeEntities, decodeHtml } from "./html.ts";

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
