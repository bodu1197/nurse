-- 리뷰·게시판 쓰기 권한의 남은 구멍 두 개. 20260730120000 이 UPDATE 만 좁히고 끝낸 것을 마저 한다.
--
-- ① authenticated 가 reviews 에 **테이블 전체** INSERT 권한을 갖고 있었다.
--    RLS(reviews_insert_own)는 "author_id 가 나인가 + 회원인가"만 본다. 컬럼은 안 본다.
--    그래서 본인 JWT + 공개 anon 키로 PostgREST 를 직접 부르면 이런 게 됐다:
--      · created_at 을 미래로 박아 **목록 영구 최상단 고정** (getReviews 가 created_at desc 정렬)
--      · report_count 를 임의 지정
--      · is_hidden 을 지정해 처음부터 숨김 상태로 넣기
--    앱(createReview)은 다섯 컬럼만 쓴다. 앱은 방어선이 아니다 — 20260730120000 이 UPDATE 에
--    대해 똑같은 이유로 이미 좁혔는데 INSERT 만 빠져 있었다. board_posts 는 처음부터
--    `grant insert (author_id, title, body)` 였다 — 두 테이블 규칙을 맞춘다.
--
--    grant 목록 밖 5개(id·is_hidden·report_count·created_at·updated_at)는 전부 컬럼 기본값이
--    있다(gen_random_uuid() / false / 0 / now() / now()). INSERT 에는 트리거가 관여하지 않는다 —
--    updated_at 을 갱신하는 reviews_set_updated_at 은 BEFORE **UPDATE** 전용이다.
revoke insert on public.reviews from authenticated;
grant insert (hospital_id, author_id, rating, content, work_period) on public.reviews to authenticated;

-- ② anon 이 board_posts·board_comments 에 INSERT·UPDATE·DELETE 권한을 갖고 있었다.
--    지금 뚫리지는 않는다 — RLS 의 author_id = auth.uid() 가 anon(NULL)에서 false 다.
--    하지만 20260730120000 이 reviews 에 대해 "정책이 한 줄 바뀌는 순간 열리므로 권한 자체를
--    걷는다"고 써 놓고 게시판에는 적용하지 않았다. 방어선을 정책 하나에 몰지 않는다.
revoke insert, update, delete on public.board_posts from anon;
revoke insert, update, delete on public.board_comments from anon;
