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
--   그래서 '비공개'를 코드에 남겨 마이그레이션을 돌릴 때마다 다시 강제한다.
--
-- 정책(RLS)은 따로 두지 않는다. 이 버킷은 서버(service_role)만 읽고 쓰며,
-- 사용자에게는 서명 URL 로만 나간다 — authenticated 에게 열어줄 이유가 없다.
update storage.buckets
set public = false,
    file_size_limit = 2097152,                                   -- 2MB. 이관 원본 최대가 0.49MB 였다
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
where id = 'avatars';
