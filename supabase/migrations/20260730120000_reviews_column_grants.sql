-- 리뷰 수정을 화면에 여는 김에, DB 쪽 쓰기 권한도 게시판과 같은 수준으로 좁힌다.
--
-- 🔴 지금까지 authenticated 는 reviews **테이블 전체**에 UPDATE 를 갖고 있었다.
--    RLS(reviews_update_own)는 "내 리뷰인가"만 보므로, 본인 JWT + 공개 anon 키로 PostgREST 를
--    직접 부르면 자기 리뷰에 한해 이런 것들이 가능했다:
--      · hospital_id 를 바꿔 **다른 병원의 평점으로 옮기기** (평점 조작)
--      · is_hidden 을 false 로 되돌려 **신고로 숨겨진 리뷰 되살리기**
--      · report_count 를 0 으로 초기화
--    앱 코드(updateReview)는 rating·content·work_period 세 개만 쓰지만, 앱은 방어선이 아니다.
--
-- board_posts 가 이미 같은 방식으로 잠겨 있다(20260724160000: grant update (title, body)).
-- 같은 모양으로 맞춘다 — 두 테이블의 규칙이 다르면 어느 쪽이 맞는지 다음 사람이 알 수 없다.
--
-- updated_at 은 grant 하지 않는다 — before-update 트리거(reviews_set_updated_at)가 채운다.
revoke update on public.reviews from authenticated;
grant update (rating, content, work_period) on public.reviews to authenticated;

-- anon 은 리뷰를 쓸 일이 없다. 지금은 auth.uid() 가 NULL 이라 RLS 가 막지만,
-- 정책이 한 줄 바뀌는 순간 열리므로 권한 자체를 걷는다(방어선을 정책 하나에 몰지 않는다).
revoke insert, update, delete on public.reviews from anon;
