// 실행: npm test   (Node 24의 네이티브 TS 실행 — 테스트 러너 설치 불필요)
import { test } from "node:test";
import assert from "node:assert/strict";
import { avatarBucketDrift, AVATAR_MAX_BYTES, AVATAR_MIME } from "./avatarLimits.ts";

const OK = {
  public: false,
  file_size_limit: AVATAR_MAX_BYTES,
  allowed_mime_types: [...AVATAR_MIME],
};

test("정상 버킷은 이상 없음", () => {
  assert.deepEqual(avatarBucketDrift(OK), []);
  // 형식 순서는 의미가 없다 — 순서만 다르면 고치려 들면 안 된다.
  assert.deepEqual(avatarBucketDrift({ ...OK, allowed_mime_types: ["image/webp", "image/jpeg", "image/png"] }), []);
});

test("공개로 뒤집히면 잡아낸다 — 이게 이 검사의 존재 이유다", () => {
  assert.deepEqual(avatarBucketDrift({ ...OK, public: true }), ["public"]);
});

test("크기·형식 제한이 풀려도 잡아낸다", () => {
  assert.deepEqual(avatarBucketDrift({ ...OK, file_size_limit: null }), ["file_size_limit"]);
  assert.deepEqual(avatarBucketDrift({ ...OK, allowed_mime_types: null }), ["allowed_mime_types"]);
  // 위험한 형식이 끼어든 경우(예: SVG — 스크립트를 품을 수 있다)
  assert.deepEqual(
    avatarBucketDrift({ ...OK, allowed_mime_types: [...AVATAR_MIME, "image/svg+xml"] }),
    ["allowed_mime_types"],
  );
});

test("여러 항목이 동시에 어긋나면 전부 보고한다", () => {
  // drift 는 '어긋난 항목의 집합'이지 순서가 있는 목록이 아니다 —
  // 검사 순서를 바꾸는 무해한 리팩터에 테스트가 깨지지 않게 양쪽 다 정렬해 비교한다.
  assert.deepEqual(
    avatarBucketDrift({ public: true, file_size_limit: 999, allowed_mime_types: [] }).sort(),
    ["allowed_mime_types", "file_size_limit", "public"],
  );
});
