-- 지원 취소는 '진행 중'인 건에만 허용한다.
-- 앞선 정책은 본인 여부만 봐서, 폼의 hidden input을 바꿔 제출하면 병원이 내린 합격·불합격까지
-- 'withdrawn'으로 덮고 다시 지원할 수 있었다(결과를 지우는 셈).
drop policy if exists applications_withdraw_own on public.applications;
create policy applications_withdraw_own on public.applications for update
  using (applicant_id = (select auth.uid()) and status in ('submitted', 'viewed'))
  with check (applicant_id = (select auth.uid()) and status = 'withdrawn');
