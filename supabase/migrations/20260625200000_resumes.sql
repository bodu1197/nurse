-- 간호사 이력서 (1:1 profile). 전면 무료. 본인만 열람/수정(병원 열람은 추후 별도 정책).
create table public.resumes (
  profile_id              uuid primary key references public.profiles(id) on delete cascade,
  name                    text,
  phone                   text,
  license_type            text,
  license_no              text,
  experience_years        int,
  education               text,
  specialties             text[] not null default '{}',
  desired_location        text,
  desired_employment_type text,
  desired_salary          text,
  intro                   text,
  is_public               boolean not null default true,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

alter table public.resumes enable row level security;
create policy resumes_select_own on public.resumes for select using (profile_id = (select auth.uid()));
create policy resumes_insert_own on public.resumes for insert with check (profile_id = (select auth.uid()));
create policy resumes_update_own on public.resumes for update using (profile_id = (select auth.uid())) with check (profile_id = (select auth.uid()));

create trigger resumes_set_updated_at before update on public.resumes for each row execute function public.set_updated_at();
