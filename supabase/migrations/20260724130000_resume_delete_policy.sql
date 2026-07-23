-- 이력서 삭제 — 지금까지는 select/insert/update 정책만 있어 지울 방법이 아예 없었다.
-- 개인정보처리방침은 "삭제를 요청할 수 있다"고 고지하고 있는데 기능이 없으면 고지 위반이다.
-- (개인정보보호법 제21조: 목적 달성 시 지체 없이 파기)
drop policy if exists resumes_delete_own on public.resumes;
create policy resumes_delete_own on public.resumes for delete
  using (profile_id = (select auth.uid()));
