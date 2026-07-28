-- 🗂 지원자 메모 — 병원 담당자가 지원자별로 남기는 기록(통화함/보류/면접 일정 등).
--
-- 왜 필요했나(오너 지시 2026-07-29):
--   "병원 입장에서 500건 응모가 있을 수 있는데 담당자가 관리 불가. 응모한 간호사에 대한
--    간단 기록이라도 할 수 있어야 관리가 된다."
--   지금은 상태 5가지(미확인/열람/합격/불합격/지원취소)뿐이라, 두 번째 통화에서 무슨 말을
--   했는지 적을 곳이 없다.
--
-- 🔴 applications 에 컬럼으로 붙이지 않은 이유:
--   applications_select 정책이 **지원자 본인에게 자기 행 전체를 연다**(20260625210000:19).
--   거기 메모를 두면 간호사가 PostgREST 로 자기 행을 조회해 "느낌 별로", "보류" 같은
--   병원 내부 기록을 그대로 읽는다. 테이블을 분리해 정책 자체를 병원으로 못 박는다.
--
-- ⚠️ 프로덕션 수동 적용(Management API). idempotent.

create table if not exists public.application_notes (
  application_id uuid primary key references public.applications(id) on delete cascade,
  memo           text not null default '',
  updated_at     timestamptz not null default now(),
  updated_by     uuid references public.profiles(id) on delete set null
);

comment on table public.application_notes is
  '병원 담당자만 보는 지원자 메모. applications 에 두면 지원자 본인 select 정책에 노출되므로 분리했다.';

alter table public.application_notes enable row level security;

-- 🔴 이 공고를 가진 병원만. 지원자 본인은 select 조차 안 된다(정책에 applicant_id 조건이 없다).
--    한 정책으로 select/insert/update/delete 를 다 덮는다 — 메모는 병원의 것이고 남이 손댈 여지가 없다.
drop policy if exists application_notes_owner on public.application_notes;
create policy application_notes_owner on public.application_notes
  for all to authenticated
  using (
    exists (
      select 1
      from public.applications a
      join public.jobs j      on j.id = a.job_id
      join public.hospitals h on h.id = j.hospital_id
      where a.id = application_notes.application_id
        and h.owner_profile_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1
      from public.applications a
      join public.jobs j      on j.id = a.job_id
      join public.hospitals h on h.id = j.hospital_id
      where a.id = application_notes.application_id
        and h.owner_profile_id = (select auth.uid())
    )
  );

create trigger application_notes_set_updated_at
  before update on public.application_notes
  for each row execute function public.set_updated_at();

-- 지원자 목록을 상태로 거를 때 쓴다. 500건 규모에서 상태 칩을 누를 때마다 전 행을 훑지 않게.
create index if not exists applications_job_status_idx on public.applications (job_id, status, created_at desc);
