import { test } from "node:test";
import assert from "node:assert/strict";
import { decodeEntities } from "./html.ts";

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
