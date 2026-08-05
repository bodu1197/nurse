// 실행: pnpm test   (Node 24의 네이티브 TS 실행 — 테스트 러너 설치 불필요)
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { BRAND_COLOR } from "./constants.ts";

/**
 * 🔴 브랜드색은 두 곳에 적혀 있다 — 이 상수와 globals.css 의 `--color-brand`.
 *    CSS 변수를 못 읽는 자리(viewport.themeColor, next/og 인라인 스타일)가 있어서 어쩔 수 없다.
 *    한쪽만 바꾸면 화면 절반이 다른 색이 된다 — 실제로 파비콘만 레거시 파랑(#0044ff)으로 남아
 *    로고와 색이 갈려 있었다(2026-08-05 통일). 그래서 어긋나면 여기서 깨지게 둔다.
 */
test("BRAND_COLOR 와 globals.css --color-brand 가 같은 값이다", () => {
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  const found = /--color-brand:\s*(#[0-9a-fA-F]{3,8})\s*;/.exec(css);
  assert.ok(found, "globals.css 에 --color-brand 선언이 있어야 한다");
  assert.equal(found[1].toLowerCase(), BRAND_COLOR.toLowerCase());
});
