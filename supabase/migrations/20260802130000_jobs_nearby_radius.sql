-- 📍 "내 주변" 반경 슬라이더 — nurse_jobs_nearby 에 p_radius_km 추가(0이면 무제한, 기존 호출 호환).
-- ⚠️ 프로덕션 수동 적용(Management API). idempotent.

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
  p_radius_km  double precision default null,
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
  where p_radius_km is null or p_radius_km <= 0 or distance_km <= p_radius_km
  order by distance_km asc
  limit p_limit offset p_offset
$$;

grant execute on function public.nurse_jobs_nearby(
  double precision, double precision, text, text, text, text, text, text, text, text, double precision, int, int
) to anon, authenticated;
