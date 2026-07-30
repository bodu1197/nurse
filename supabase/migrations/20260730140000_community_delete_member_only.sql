-- 리뷰·게시판은 "이력서를 등록한 간호사 회원"만 쓰고·보고·고치고·지운다(오너 확정 2026-07-30).
--
-- 🔴 select·insert·update 에는 이미 is_community_member() 가 걸려 있는데(20260724190000)
--    **delete 정책에만 빠져 있었다**. 그래서 이력서를 지운 뒤에도(= 더 이상 커뮤니티 회원이 아님)
--    PostgREST 를 직접 부르면 자기 글·리뷰를 지울 수 있었다. 앱은 게이트를 지키는데 DB 가 안 지키면
--    방어선이 하나뿐이라, 정책 한 줄만 바뀌어도 열린다.
--
-- 소유자 조건(author_id = auth.uid())은 그대로 두고 회원 조건만 더한다.
--
-- 🔴 관리자(is_admin)도 통과시킨다 — 20260724200000 이 관리자에게 게시판 **작성**을 열어줬기 때문이다
--    (공지·모더레이션). 회원 조건만 걸면 관리자는 자기가 쓴 공지를 지울 수 없게 된다.
--    insert·update 가 이미 `is_community_member() or is_admin()` 형태라 같은 모양으로 맞춘다.
--    남의 글을 지우는 권한은 여전히 없다 — author_id 조건은 그대로다.
alter policy reviews_delete_own on public.reviews
  using (author_id = (select auth.uid()) and ((select public.is_community_member()) or (select public.is_admin())));

alter policy board_posts_delete on public.board_posts
  using (author_id = (select auth.uid()) and ((select public.is_community_member()) or (select public.is_admin())));

alter policy board_comments_delete on public.board_comments
  using (author_id = (select auth.uid()) and ((select public.is_community_member()) or (select public.is_admin())));
