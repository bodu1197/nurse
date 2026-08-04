// 실행: pnpm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { acceptsPlatformApply } from "./applyGate.ts";

test("직접 등록 공고는 간편지원을 받는다", () => {
  assert.ok(acceptsPlatformApply({ source: "direct", apply_methods: ["platform", "email"] }));
});

// 이관 공고 1,444건이 여기 걸린다 — 구 널스넷 병원의 공고도 우리 공고다(오너 확정 2026-08-04)
test("구 널스넷에서 옮겨온 공고도 간편지원을 받는다", () => {
  assert.ok(acceptsPlatformApply({ source: "partner", apply_methods: ["platform"] }));
});

/**
 * 🔴 이 시험이 이 파일의 이유다.
 *    워크넷 공고도 apply_methods 가 ['platform'] 이라(실측 2,006건), 조건을 apply_methods 만으로
 *    쓰면 워크넷이 통째로 열린다. 그 지원에는 우리가 관여하지 않기로 했다(오너 확정 2026-07-30).
 */
test("워크넷 수집 공고는 apply_methods 가 platform 이어도 막는다", () => {
  assert.ok(!acceptsPlatformApply({ source: "worknet", apply_methods: ["platform"] }));
  assert.ok(!acceptsPlatformApply({ source: "worknet", apply_methods: ["platform", "email"] }));
});

test("간편지원을 안 받는 공고는 출처와 무관하게 막는다", () => {
  assert.ok(!acceptsPlatformApply({ source: "direct", apply_methods: ["email"] }));
  assert.ok(!acceptsPlatformApply({ source: "partner", apply_methods: ["offline"] }));
  assert.ok(!acceptsPlatformApply({ source: "partner", apply_methods: [] }));
});
