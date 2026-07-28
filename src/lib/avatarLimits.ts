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
