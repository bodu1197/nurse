/**
 * 이력서 사진 제약 — **클라이언트도 읽는다**(PhotoPicker).
 *
 * lib/data/avatar.ts 는 `server-only` 라 클라이언트 컴포넌트가 import 하면 빌드가 깨진다.
 * 값 자체는 비밀이 아니므로 여기에 두고 양쪽이 같이 쓴다 —
 * 화면과 서버가 다른 숫자를 쓰면 "왜 안 되는지 모를 실패"가 난다.
 *
 * 🔴 버킷 설정(20260728120000_avatars_bucket_private.sql)과 같은 값이어야 한다.
 *    여기만 올리면 스토리지가 거부하고, 버킷만 올리면 화면이 먼저 막는다.
 */
export const AVATAR_MAX_BYTES = 2 * 1024 * 1024;
export const AVATAR_MIME = ["image/jpeg", "image/png", "image/webp"] as const;
/** <input accept> 에 그대로 쓴다 — 파일 선택창에서 애초에 못 고르게 한다. */
export const AVATAR_ACCEPT = AVATAR_MIME.join(",");
/**
 * 브라우저에서 줄일 때 긴 변의 최대 픽셀.
 * 800px = 이력서·목록 어디서도 96~128px 로만 그리므로 2배 화면(레티나)에도 충분하고,
 * 3:4 증명사진이 JPEG 0.85 로 보통 60~120KB 가 된다(상한 2MB 근처에도 안 간다).
 */
export const AVATAR_MAX_EDGE = 800;

/**
 * 🔒 avatars 버킷이 위 값에서 벗어났는지 — 벗어난 항목 이름을 돌려준다(빈 배열이면 정상).
 *
 * 왜 런타임에 다시 보는가:
 *   버킷을 비공개로 만드는 건 마이그레이션(20260728120000)이지만, 마이그레이션은 **한 번 적용되면
 *   다시 돌지 않는다.** 그래서 대시보드에서 '공개' 토글 한 번이면 그대로 공개가 되고,
 *   난수 키도 서명 URL 도 전부 무의미해진다(공개 버킷은 서명 없이 열린다).
 *   DB 트리거로 못 박으려 했으나 storage.buckets 소유자가 supabase_storage_admin 이라
 *   우리 postgres 롤에는 트리거를 걸 권한이 없다(실측 2026-07-30).
 *   → 남은 수단은 '주기적으로 확인하고 스스로 되돌리기'뿐이다(/api/cron/guard-avatars-bucket).
 */
export function avatarBucketDrift(bucket: {
  public?: boolean | null;
  file_size_limit?: number | null;
  allowed_mime_types?: readonly string[] | null;
}): string[] {
  const drift: string[] = [];
  if (bucket.public) drift.push("public");
  if (bucket.file_size_limit !== AVATAR_MAX_BYTES) drift.push("file_size_limit");
  // 순서는 의미가 없으므로 정렬해서 비교한다 — 순서만 다른 걸 이상으로 보면 매번 고치려 든다.
  const got = [...(bucket.allowed_mime_types ?? [])].sort().join(",");
  if (got !== [...AVATAR_MIME].sort().join(",")) drift.push("allowed_mime_types");
  return drift;
}
