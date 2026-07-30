-- 관리자(role='admin')도 병원 리뷰를 작성·수정할 수 있게 한다(오너 확정 2026-07-31).
--
-- 🔴 왜 뒤집나: 20260724200000 이 "평점 오염 방지"를 이유로 리뷰 insert/update 만 관리자 제외로 남겼다.
--    그런데 앱도 같은 이유로 "리뷰 작성" 버튼을 숨겼고, **숨긴 이유를 화면에 한 글자도 안 알려줬다.**
--    결과: 오너(관리자 계정)가 자기 사이트에서 리뷰를 쓸 방법을 못 찾았다. 버튼이 사라진 버그로 보였다.
--    이제 버튼은 항상 그리고, 자격은 여기(RLS)와 서버 액션이 판정한다.
--
-- 나머지 정책(select·delete)은 이미 `is_community_member() or is_admin()` 형태다 — 같은 모양으로 맞춘다.
-- 소유자 조건(author_id = auth.uid())은 그대로 — 남의 리뷰를 쓰거나 고칠 권한은 여전히 없다.
alter policy reviews_insert_own on public.reviews
  with check (author_id = (select auth.uid()) and ((select public.is_community_member()) or (select public.is_admin())));

alter policy reviews_update_own on public.reviews
  with check (author_id = (select auth.uid()) and ((select public.is_community_member()) or (select public.is_admin())));
