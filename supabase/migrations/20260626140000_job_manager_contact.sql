-- 공고에 채용담당자 연락처 — 지원자가 급할 때 전화/문의 + 신뢰 확보.
alter table public.jobs add column if not exists manager_name text;
alter table public.jobs add column if not exists manager_phone text;
