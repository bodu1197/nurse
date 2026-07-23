-- 병원이 바꿀 수 있는 상태를 '열람됨/합격/불합격'으로 못 박는다.
--
-- 앱(서버 액션)은 isHospitalStatus로 걸러도, 병원 계정이 anon key로 PostgREST를 직접 호출하면
-- 기존 정책의 with check가 소유 여부만 봐서 이런 위조가 가능했다.
--   · status='withdrawn'  → 간호사가 스스로 취소한 것처럼 보이게 만듦
--   · status='submitted'  → 자기가 내린 합격·불합격을 흔적 없이 되돌림
-- 지원 취소(withdrawn)는 간호사 본인 정책(applications_withdraw_own)만 통과시킨다.
-- 재지원 되살리기(submitted)는 service_role 서버 액션이 하므로 RLS를 거치지 않는다.
-- using 절의 상태 조건도 함께 건다. 화이트리스트만으로는 반대 방향이 열려 있다 —
-- 이미 'withdrawn'인 지원을 'viewed'/'accepted'로 **되살리는 것**은 with check를 통과한다.
-- 그러면 간호사가 거둬간 지원이 동의 없이 되돌아오고, unique(job_id, applicant_id) 때문에
-- 그 공고에는 영영 다시 지원할 수 없게 된다(applyToJob이 dup으로 막는다).
-- 앱의 .neq("status","withdrawn")는 서버 액션 경로에만 걸려 PostgREST 직접 호출로 우회된다.
drop policy if exists applications_update_hospital on public.applications;
create policy applications_update_hospital on public.applications for update using (
  applications.status <> 'withdrawn'
  and exists (select 1 from public.jobs j join public.hospitals h on h.id = j.hospital_id
              where j.id = applications.job_id and h.owner_profile_id = (select auth.uid()))
) with check (
  status in ('viewed', 'accepted', 'rejected')
  and exists (select 1 from public.jobs j join public.hospitals h on h.id = j.hospital_id
              where j.id = applications.job_id and h.owner_profile_id = (select auth.uid()))
);
