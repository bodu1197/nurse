-- 공고별 지원 방법 — 병원마다 다름(플랫폼 간편지원 / 이메일 / 우편·방문·전화).
alter table public.jobs add column if not exists apply_method text not null default 'platform';
alter table public.jobs add column if not exists apply_email text;
alter table public.jobs add column if not exists apply_detail text;
