-- 2차 마이그레이션: 병원(hospitals) + 공고(jobs) — /jobs 검색결과의 데이터 레이어.
-- Security Advisor 0 유지: 전 테이블 RLS+정책. updated_at은 기존 public.set_updated_at() 재사용(신규 함수 없음).

-- 병원 엔티티 (미등록/클레임 가능 — Indeed company page = /cmp)
create table public.hospitals (
  id                uuid primary key default gen_random_uuid(),
  name              text not null,
  region            text,
  address           text,
  rating_avg        numeric(2,1) not null default 0,
  rating_count      int not null default 0,
  source            text not null default 'direct' check (source in ('direct','worknet','public_data','partner','crawl')),
  is_claimed        boolean not null default false,
  owner_profile_id  uuid references public.profiles(id) on delete set null,
  ykiho             text unique,
  legacy_member_srl bigint unique,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index hospitals_region_idx on public.hospitals(region);

-- 공고
create table public.jobs (
  id              uuid primary key default gen_random_uuid(),
  hospital_id     uuid not null references public.hospitals(id) on delete cascade,
  title           text not null,
  specialty       text,
  location        text,
  employment_type text,
  salary_text     text,
  benefits        text[] not null default '{}',
  description     text,
  source          text not null default 'direct' check (source in ('direct','worknet','public_data','partner','crawl')),
  external_url    text,
  external_id     text,
  status          text not null default 'open' check (status in ('draft','open','closed','expired','hidden')),
  is_featured     boolean not null default false,
  posted_at       timestamptz not null default now(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index jobs_status_idx on public.jobs(status);
create index jobs_hospital_idx on public.jobs(hospital_id);
create index jobs_feed_idx on public.jobs(is_featured desc, posted_at desc) where status = 'open';
create unique index jobs_source_extid_idx on public.jobs(source, external_id) where external_id is not null;

-- updated_at 트리거 (기존 함수 재사용)
create trigger hospitals_set_updated_at before update on public.hospitals for each row execute function public.set_updated_at();
create trigger jobs_set_updated_at before update on public.jobs for each row execute function public.set_updated_at();

-- RLS
alter table public.hospitals enable row level security;
alter table public.jobs enable row level security;

-- 병원: 공개 열람, 쓰기는 소유 병원 계정(클레임). 집계/수집은 service_role(RLS 우회).
create policy hospitals_select_all on public.hospitals for select using (true);
create policy hospitals_write_owner on public.hospitals for all
  using (owner_profile_id = (select auth.uid())) with check (owner_profile_id = (select auth.uid()));

-- 공고: 게시(open)만 공개 열람. 쓰기는 소유 병원 계정(+수집은 service_role).
create policy jobs_select_open on public.jobs for select
  using (status = 'open' or exists (select 1 from public.hospitals h where h.id = jobs.hospital_id and h.owner_profile_id = (select auth.uid())));
create policy jobs_write_owner on public.jobs for all
  using (exists (select 1 from public.hospitals h where h.id = jobs.hospital_id and h.owner_profile_id = (select auth.uid())))
  with check (exists (select 1 from public.hospitals h where h.id = jobs.hospital_id and h.owner_profile_id = (select auth.uid())));
