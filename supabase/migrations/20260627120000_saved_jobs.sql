-- 관심 공고(찜) — 간호사가 마음에 든 공고를 저장해 나중에 확인.
create table if not exists public.saved_jobs (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  job_id uuid not null references public.jobs(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (profile_id, job_id)
);

alter table public.saved_jobs enable row level security;

create policy saved_jobs_own on public.saved_jobs
  for all
  using (profile_id = (select auth.uid()))
  with check (profile_id = (select auth.uid()));

create index if not exists saved_jobs_profile_idx on public.saved_jobs (profile_id, created_at desc);
