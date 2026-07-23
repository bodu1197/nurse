-- 지원 취소(변심) — 간호사가 넣은 지원을 스스로 거둘 수 있게 한다.
alter table public.applications drop constraint if exists applications_status_check;
alter table public.applications add constraint applications_status_check
  check (status in ('submitted', 'viewed', 'accepted', 'rejected', 'withdrawn'));

-- 지원자 본인은 '취소'로만 바꿀 수 있다. UPDATE 정책은 OR로 합쳐지므로 병원의 상태 변경 정책은 그대로 동작한다.
-- with check에 status = 'withdrawn'을 박아, 이 경로로는 합격/불합격을 위조할 수 없다.
drop policy if exists applications_withdraw_own on public.applications;
create policy applications_withdraw_own on public.applications for update
  using (applicant_id = (select auth.uid()))
  with check (applicant_id = (select auth.uid()) and status = 'withdrawn');

-- 컬럼 권한을 status 하나로 좁힌다. Supabase 기본이 테이블 전체 UPDATE 허용이라
-- 정책만 추가하면 아무것도 좁아지지 않는다(앞으로 메모·면접일 컬럼이 생기면 그때 뚫린다).
revoke update on public.applications from authenticated;
grant update (status) on public.applications to authenticated;

-- insert도 마찬가지 — 지원자가 status를 'accepted'로 넣어 병원 화면에 '합격'으로 띄우는 것을 막는다.
-- status를 아예 못 쓰게 하면 기본값 'submitted'가 적용된다.
revoke insert on public.applications from authenticated;
grant insert (job_id, applicant_id, message) on public.applications to authenticated;
