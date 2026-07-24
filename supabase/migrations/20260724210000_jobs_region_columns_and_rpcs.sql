-- 🗂 채용(jobs) 지역 정규화 컬럼 + 도>시군구 계단 RPC + 인덱스.
--    dolpagu(talent) /jobs 의 지역 드롭다운을 nurse /jobs 에 이식(소유자 확정 2026-07-24).
--    location(워크넷 region "경기 성남시" 또는 직접등록 주소)을 앱이 ingest 시점에 파싱한
--    canonical sido/sigungu 실컬럼으로 대체한다 — normalizeJobRegion(null, location) 산출.
--
-- ⚠️ 읍면동은 주소가 도로명이라 불완전 → 도 > 시군구 2단 확정(내 주변 버튼이 그 아래를 커버).
-- ⚠️ jobs 는 RLS 테이블 SELECT(jobs_select_open)라 새 컬럼은 anon 이 자동으로 읽는다(컬럼 GRANT 불필요).
-- ⚠️ 프로덕션 수동 적용(Management API). idempotent — 로컬/신규 정합용.

alter table public.jobs add column if not exists sido text;
alter table public.jobs add column if not exists sigungu text;

comment on column public.jobs.sido is
  'canonical 시도(17종) — normalizeJobRegion(null, location) 산출. 지역 필터·계단 목록의 단일 진실.';
comment on column public.jobs.sigungu is
  'canonical 시군구(세종은 NULL) — 2단 시군구는 "성남시 분당구" 전체 보존.';

-- 🗂 지역 계단(도 > 시군구) RPC — 정규화 컬럼 기준 서버 GROUP BY 집계.
--    평면 select distinct 는 PostgREST max-rows(1000)에 잘려 목록이 조용히 불완전해진다.
--
-- 🔴 술어는 목록 쿼리(getJobs, lib/data/jobs.ts)와 **정확히 같아야** 한다. 어긋나면 드롭다운이
--    "경기도 12건"이라 해놓고 클릭하면 9건이 나온다. getJobs 의 세 술어를 그대로 옮긴다:
--      ① status = 'open'
--      ② direct 노출: source<>'direct' OR posted_at>=(now-7일 무료) OR featured_until>=now(유료)
--      ③ deadline: 마감 지난 글 제외(null=상시)
--    (무료기간 7일 = lib/date.FREE_LISTING_MS. 어긋나면 "보이는데 지원은 안 되는" 공고가 생긴다.)
-- SECURITY INVOKER(기본) + RLS 로 open 글만. 동적 SQL 없음(파라미터가 SQL 텍스트에 안 닿는다).

drop function if exists public.nurse_job_sido_list();
create function public.nurse_job_sido_list()
returns table(name text, cnt bigint)
language sql
stable
set search_path to 'public'
as $$
  select sido, count(*)
  from public.jobs
  where status = 'open' and sido is not null
    and (source <> 'direct' or posted_at >= now() - interval '7 days' or featured_until >= now())
    and (deadline is null or deadline >= (now() at time zone 'Asia/Seoul')::date)
  group by sido order by count(*) desc
$$;

drop function if exists public.nurse_job_sigungu_list(text);
create function public.nurse_job_sigungu_list(p_sido text)
returns table(name text, cnt bigint)
language sql
stable
set search_path to 'public'
as $$
  select sigungu, count(*)
  from public.jobs
  where status = 'open' and sido = p_sido and sigungu is not null
    and (source <> 'direct' or posted_at >= now() - interval '7 days' or featured_until >= now())
    and (deadline is null or deadline >= (now() at time zone 'Asia/Seoul')::date)
  group by sigungu order by count(*) desc
$$;

grant execute on function public.nurse_job_sido_list() to anon, authenticated;
grant execute on function public.nurse_job_sigungu_list(text) to anon, authenticated;

-- 지역 필터 인덱스(status='open' 부분 인덱스). 주 목적은 계단 RPC 의 GROUP BY sido/sigungu + 지역 eq 필터
-- 탐색을 인덱스로 좁히는 것이다. ⚠️ 목록(getJobs)은 featured_until DESC, posted_at DESC 로 정렬하므로
-- 선두 정렬키(featured_until)가 이 인덱스에 없어 top-N 정렬까지 흡수하진 못한다(필터 후보 축소까지만).
-- featured_until 선두 부분 인덱스는 쓰기 비용 대비 이득이 불확실해 지금은 만들지 않는다(필요해지면 그때).
drop index if exists public.jobs_region_idx;
create index if not exists jobs_region_idx
  on public.jobs (sido, sigungu, posted_at desc)
  where status = 'open';

drop index if exists public.jobs_sido_posted_idx;
create index if not exists jobs_sido_posted_idx
  on public.jobs (sido, posted_at desc)
  where status = 'open';
