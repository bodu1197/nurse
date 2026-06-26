-- 공고 핵심 정보 — 간호사가 가장 먼저 보는 마감일·모집인원·교대형태.
alter table public.jobs add column if not exists deadline date;
alter table public.jobs add column if not exists recruit_count int;
alter table public.jobs add column if not exists shift_type text;
