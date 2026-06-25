-- 채용 알림 기반: 저장한 검색(키워드+지역). 메일 발송은 후속(메일 인프라 필요).
create table public.saved_searches (
  id         uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  keyword    text,
  location   text,
  created_at timestamptz not null default now()
);
create index saved_searches_profile_idx on public.saved_searches (profile_id);

alter table public.saved_searches enable row level security;
create policy saved_searches_select_own on public.saved_searches for select using (profile_id = (select auth.uid()));
create policy saved_searches_insert_own on public.saved_searches for insert with check (profile_id = (select auth.uid()));
create policy saved_searches_delete_own on public.saved_searches for delete using (profile_id = (select auth.uid()));
