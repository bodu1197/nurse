-- 간편지원: 간호사가 공고에 지원 → 병원이 지원자(+이력서) 확인.
create table public.applications (
  id           uuid primary key default gen_random_uuid(),
  job_id       uuid not null references public.jobs(id) on delete cascade,
  applicant_id uuid not null references public.profiles(id) on delete cascade,
  message      text,
  status       text not null default 'submitted' check (status in ('submitted','viewed','accepted','rejected')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (job_id, applicant_id)
);
create index applications_job_idx on public.applications (job_id);
create index applications_applicant_idx on public.applications (applicant_id);
create trigger applications_set_updated_at before update on public.applications for each row execute function public.set_updated_at();

alter table public.applications enable row level security;

-- 지원자 본인 + 해당 공고 소유 병원만 열람
create policy applications_select on public.applications for select using (
  applicant_id = (select auth.uid())
  or exists (select 1 from public.jobs j join public.hospitals h on h.id = j.hospital_id
             where j.id = applications.job_id and h.owner_profile_id = (select auth.uid()))
);
-- 지원자 본인만 지원 생성
create policy applications_insert_own on public.applications for insert with check (applicant_id = (select auth.uid()));
-- 공고 소유 병원만 상태 변경
create policy applications_update_hospital on public.applications for update using (
  exists (select 1 from public.jobs j join public.hospitals h on h.id = j.hospital_id
          where j.id = applications.job_id and h.owner_profile_id = (select auth.uid()))
) with check (
  exists (select 1 from public.jobs j join public.hospitals h on h.id = j.hospital_id
          where j.id = applications.job_id and h.owner_profile_id = (select auth.uid()))
);

-- 병원은 자기 공고에 지원한 간호사의 이력서를 열람 가능
create policy resumes_select_for_hospital on public.resumes for select using (
  exists (select 1 from public.applications a
          join public.jobs j on j.id = a.job_id
          join public.hospitals h on h.id = j.hospital_id
          where a.applicant_id = resumes.profile_id and h.owner_profile_id = (select auth.uid()))
);
