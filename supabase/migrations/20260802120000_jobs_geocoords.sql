-- 📍 "내 주변 간호사 채용 찾기" — 공고 근무지 좌표 + 거리순 정렬 RPC.
--    JobNearMeButton.tsx 의 2026-07-30 메모(역지오코딩 방식)를 오너가 뒤집고
--    "공고 주소를 직접 좌표로 바꿔 저장" 방식으로 확정(2026-08-02). 저장해두면
--    접속마다 지오코딩을 다시 부를 필요가 없다 — 등록/수정/워크넷 동기화 시 1회만 채운다.
--
-- ⚠️ 프로덕션 수동 적용(Management API). idempotent.

alter table public.jobs add column if not exists lat double precision;
alter table public.jobs add column if not exists lng double precision;

comment on column public.jobs.lat is
  '근무지 위도 — 카카오 주소 검색 API 지오코딩(공고 등록/수정, 워크넷 동기화 시 자동 채움). 실패/미시도면 NULL(내 주변 정렬에서 제외될 뿐 목록 자체는 그대로 보인다).';
comment on column public.jobs.lng is
  '근무지 경도 — lat 과 동일 출처.';

-- 거리순 후보 id — id/거리만 반환한다(공고 셀렉트·병원 조인은 앱에서 기존 SELECT 를 재사용).
-- 술어는 nurse_job_facet_list(20260729080000)와 동일(getJobs 의 노출 규칙 세 가지 + 축 필터).
-- 하버사인(구면 근사)으로 충분하다 — 지금 규모(공고 수천 건)에 PostGIS 는 과하다(ponytail).
drop function if exists public.nurse_jobs_nearby(double precision, double precision, text, text, text, text, text, text, text, text, int, int);
create function public.nurse_jobs_nearby(
  p_lat        double precision,
  p_lng        double precision,
  p_sido       text default null,
  p_sigungu    text default null,
  p_specialty  text default null,
  p_facility   text default null,
  p_category   text default null,
  p_employment text default null,
  p_keyword    text default null,
  p_location   text default null,
  p_limit      int default 20,
  p_offset     int default 0
)
returns table(id uuid, distance_km double precision, total_count bigint)
language sql
stable
set search_path to 'public'
as $$
  with visible as (
    select j.id, j.lat, j.lng, j.specialty, j.facility_type, j.job_category
    from public.jobs j
    where status = 'open'
      and j.lat is not null and j.lng is not null
      and (source <> 'direct' or posted_at >= now() - interval '7 days' or featured_until >= now())
      and (deadline is null or deadline >= (now() at time zone 'Asia/Seoul')::date)
      and (p_sido    is null or p_sido    = '' or j.sido = p_sido)
      and (p_sigungu is null or p_sigungu = '' or p_sido is null or p_sido = '' or j.sigungu = p_sigungu)
      and (p_employment is null or p_employment = '' or j.employment_type = p_employment)
      -- 축 필터는 getJobs(lib/data/jobs.ts)의 axis()와 같은 규칙: '_none'은 그 축이 비어있는 공고.
      and (p_specialty is null or p_specialty = ''
           or (case when p_specialty = '_none' then j.specialty is null else j.specialty = p_specialty end))
      and (p_facility  is null or p_facility  = ''
           or (case when p_facility  = '_none' then j.facility_type is null else j.facility_type = p_facility end))
      and (p_category  is null or p_category  = ''
           or (case when p_category  = '_none' then j.job_category is null else j.job_category = p_category end))
      and (
        p_keyword is null or p_keyword = ''
        or j.title         ilike '%' || p_keyword || '%'
        or j.specialty     ilike '%' || p_keyword || '%'
        or j.facility_type ilike '%' || p_keyword || '%'
        or j.job_category  ilike '%' || p_keyword || '%'
      )
      and (p_location is null or p_location = '' or j.location ilike '%' || p_location || '%')
  ),
  dist as (
    select id,
      2 * 6371 * asin(sqrt(
        sin(radians(lat - p_lat) / 2) ^ 2
        + cos(radians(p_lat)) * cos(radians(lat)) * sin(radians(lng - p_lng) / 2) ^ 2
      )) as distance_km
    from visible
  )
  select id, distance_km, count(*) over ()::bigint as total_count
  from dist
  order by distance_km asc
  limit p_limit offset p_offset
$$;

grant execute on function public.nurse_jobs_nearby(
  double precision, double precision, text, text, text, text, text, text, text, text, int, int
) to anon, authenticated;
