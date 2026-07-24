-- 최고 관리자(role='admin')는 리뷰·게시판을 관리·모더레이션하기 위해 열람할 수 있어야 한다.
-- 앱 게이트(getCommunityAccess)에 더해 RLS에서도 관리자를 통과시킨다.
-- 단, 리뷰 "작성/수정"은 관리자 제외 유지 — 관리자가 실제 병원 평점을 매기면 오염된다(is_community_member만).

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from profiles p where p.id = (select auth.uid()) and p.role = 'admin');
$$;

-- 읽기: 회원 또는 관리자. 관리자는 숨김(is_hidden) 리뷰도 볼 수 있어야 모더레이션이 된다.
alter policy reviews_select on public.reviews
  using (
    ((select public.is_community_member()) or (select public.is_admin()))
    and (not is_hidden or author_id = (select auth.uid()) or (select public.is_admin()))
  );
alter policy board_posts_read on public.board_posts
  using ((select public.is_community_member()) or (select public.is_admin()));
alter policy board_comments_read on public.board_comments
  using ((select public.is_community_member()) or (select public.is_admin()));

-- 게시판 작성·수정: 회원 또는 관리자(공지·모더레이션). 삭제는 본인 글 기준 유지.
alter policy board_posts_insert on public.board_posts
  with check (author_id = (select auth.uid()) and ((select public.is_community_member()) or (select public.is_admin())));
alter policy board_posts_update on public.board_posts
  with check (author_id = (select auth.uid()) and ((select public.is_community_member()) or (select public.is_admin())));
alter policy board_comments_insert on public.board_comments
  with check (author_id = (select auth.uid()) and ((select public.is_community_member()) or (select public.is_admin())));

-- reviews_insert_own / reviews_update_own 은 변경하지 않는다(회원만 — 평점 오염 방지).
