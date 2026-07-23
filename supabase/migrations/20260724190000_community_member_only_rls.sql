-- 리뷰·게시판은 "이력서를 등록한 간호사 회원"만 이용 — 앱 게이트에 더해 DB(RLS)로도 강제한다.
-- anon 키가 공개라 앱 게이트만으론 직접 REST API로 우회 가능(읽기가 특히 그렇다).
-- 이 프로젝트는 이미 쓰기를 RLS로 막고 있어(리뷰 insert의 nurse 조건), 읽기도 같은 층에서 막는다.

-- 커뮤니티 회원 판정: 간호사 역할 + 본인 이력서 존재.
-- security definer로 profiles/resumes를 RLS 무관하게 확인(정책 안에서 재귀 RLS 방지). search_path 고정.
create or replace function public.is_community_member()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from profiles p where p.id = (select auth.uid()) and p.role = 'nurse')
     and exists (select 1 from resumes r where r.profile_id = (select auth.uid()));
$$;

-- 성능: (select is_community_member())로 감싸 문장당 1회만 평가(initplan) — 행마다 재호출 방지(Supabase 권장 패턴).
-- 리뷰: 읽기는 회원만(본인 글은 숨김이어도 본인은 봄). 작성·수정도 회원만(기존 nurse 조건 → 이력서까지).
alter policy reviews_select on public.reviews
  using ((select public.is_community_member()) and (not is_hidden or author_id = (select auth.uid())));
alter policy reviews_insert_own on public.reviews
  with check (author_id = (select auth.uid()) and (select public.is_community_member()));
alter policy reviews_update_own on public.reviews
  with check (author_id = (select auth.uid()) and (select public.is_community_member()));

-- 게시판 글: 읽기·작성·수정 모두 회원만. 삭제는 본인 글 정리라 기존(author_id=본인) 유지.
alter policy board_posts_read on public.board_posts
  using ((select public.is_community_member()));
alter policy board_posts_insert on public.board_posts
  with check (author_id = (select auth.uid()) and (select public.is_community_member()));
alter policy board_posts_update on public.board_posts
  with check (author_id = (select auth.uid()) and (select public.is_community_member()));

-- 게시판 댓글: 읽기·작성 회원만. 삭제는 본인 댓글 정리라 기존 유지.
alter policy board_comments_read on public.board_comments
  using ((select public.is_community_member()));
alter policy board_comments_insert on public.board_comments
  with check (author_id = (select auth.uid()) and (select public.is_community_member()));
