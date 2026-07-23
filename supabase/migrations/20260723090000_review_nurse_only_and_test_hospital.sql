-- 1) 리뷰 작성은 간호사만 — DB에서 강제.
-- 앱 서버액션 게이트만으로는 부족하다: anon key가 공개(NEXT_PUBLIC_)라 병원 계정이 자기 세션 JWT로
-- PostgREST에 직접 insert하면 게이트를 통째로 건너뛰고 자작 리뷰로 rating_avg를 조작할 수 있다.
drop policy if exists reviews_insert_own on public.reviews;
create policy reviews_insert_own on public.reviews for insert with check (
  author_id = (select auth.uid())
  and exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'nurse')
);

-- insert만 막으면 반쪽이다 — 간호사로 리뷰를 쓴 뒤 역할이 바뀐 계정이 기존 리뷰의 별점을 고칠 수 있다.
drop policy if exists reviews_update_own on public.reviews;
create policy reviews_update_own on public.reviews for update
  using (author_id = (select auth.uid()))
  with check (
    author_id = (select auth.uid())
    and exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'nurse')
  );

-- 2) 테스트용 병원 표시 — 관리자 테스트 공고가 실제 채용공고판/병원검색에 섞이지 않게 한다.
--    (관리자가 병원 마이페이지를 실제로 테스트하려면 공고를 실제로 등록해야 하는데,
--     그 공고가 공개되면 진짜 간호사가 가짜 공고에 지원하게 된다.)
alter table public.hospitals add column if not exists is_test boolean not null default false;
-- 인덱스는 두지 않는다: 조회 조건이 전부 is_test = false(=전체 행의 사실상 100%)라 플래너가 어차피 안 쓴다.

-- 3) hospitals 직접 쓰기 권한 회수 — 앱의 hospitals 쓰기는 전부 service_role(createAdminClient) 경유다.
--    RLS 정책(hospitals_write_owner)만 믿으면 로그인 계정이 공개 anon key로 PostgREST를 직접 호출해
--    - UPDATE: 자기 병원의 rating_avg·free_credits·is_test 조작(평점 조작 / 무료 공고 무한 / 테스트 플래그 해제)
--    - INSERT: owner_profile_id를 자기 것으로 둔 채 평점 5.0·크레딧 9999짜리 병원을 새로 생성
--    - DELETE: 병원 행 삭제 → reviews on delete cascade 로 악평 전량 삭제
--    가 가능하다. 셋 다 막아야 1)의 리뷰 제한이 의미를 갖는다.
revoke insert, update, delete on public.hospitals from authenticated;
