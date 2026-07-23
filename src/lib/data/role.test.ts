// 실행: pnpm test   (Node 24의 네이티브 TS 실행 — 테스트 러너 설치 불필요)
import { test } from "node:test";
import assert from "node:assert/strict";
import { pickRole } from "./role.ts";

test("일반 회원은 쿠키를 위조해도 역할이 안 바뀐다", () => {
  assert.equal(pickRole("nurse", "hospital"), "nurse");
  assert.equal(pickRole("nurse", "admin"), "nurse");
  assert.equal(pickRole("hospital", "nurse"), "hospital");
  assert.equal(pickRole("hospital", "admin"), "hospital");
});

test("관리자만 병원/간호사로 전환된다", () => {
  assert.equal(pickRole("admin", "hospital"), "hospital");
  assert.equal(pickRole("admin", "nurse"), "nurse");
});

test("관리자라도 쿠키가 없거나 이상하면 관리자 그대로", () => {
  assert.equal(pickRole("admin", undefined), "admin");
  assert.equal(pickRole("admin", ""), "admin");
  assert.equal(pickRole("admin", "superuser"), "admin");
});
