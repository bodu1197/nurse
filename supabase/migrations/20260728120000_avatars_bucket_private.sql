-- 인재 사진 보관소(avatars)는 **비공개**여야 한다.
--
-- 왜 마이그레이션으로 못박는가:
--   처음에 이 버킷을 공개로 만들고 파일명을 `{profile_id}.jpg` 로 지었다. 그런데 profile_id 는
--   인재 목록 HTML 에 그대로 실린다(`href="/talent/{profile_id}"`). 누구나 목록에서 id 를 긁어
--   `/object/public/avatars/{id}.jpg` 를 조합하면 얼굴 사진 전량을 가져갈 수 있었다.
--   "사진은 광고 중인 병원만" 이라는 게이트가 통째로 우회됐다.
--
--   지금은 (1) 키를 난수 UUID 로 바꾸고 (2) 버킷을 비공개로 돌리고 (3) 열람 자격을 통과한
--   revealContacts 에서만 단기 서명 URL 을 발급한다. 그런데 (2)가 대시보드 토글 한 번으로
--   조용히 되돌아가면 (1)(3)이 무의미해진다 — 공개 버킷은 서명 없이도 열리기 때문이다.
--
-- 🔴 이 파일만으로는 (2)가 지켜지지 않는다(정정 2026-07-30).
--   마이그레이션은 **한 번 적용되면 다시 돌지 않는다.** 그러니 여기 적힌 값은 '지금 한 번' 일 뿐,
--   토글로 뒤집히면 되돌릴 사람이 없다. DB 트리거로 못 박으려 했으나 storage.buckets 소유자가
--   supabase_storage_admin 이라 우리 postgres 롤에 트리거 권한이 없다(can_create_trigger=false).
--   → 실제 강제는 /api/cron/guard-avatars-bucket 이 매시간 확인하고 스스로 되돌린다.
--     판정 로직은 src/lib/avatarLimits.ts 의 avatarBucketDrift (테스트 있음).
--
-- 정책(RLS)은 따로 두지 않는다. 이 버킷은 서버(service_role)만 읽고 쓰며,
-- 사용자에게는 서명 URL 로만 나간다 — authenticated 에게 열어줄 이유가 없다.
update storage.buckets
set public = false,
    file_size_limit = 2097152,                                   -- 2MB. 이관 원본 최대가 0.49MB 였다
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
where id = 'avatars';
