-- 🔧 '미분류' 를 고른 상태에서도 다른 축 집계가 맞게 한다.
--
-- 앞 마이그레이션(20260729140000)이 '(미분류)' 칩을 만들었는데, 그걸 **고른 뒤**가 문제였다.
-- 앱은 URL 센티넬 `_none` 을 그대로 RPC 에 넘기는데, RPC 는 `facility_type = '_none'` 으로 비교해
-- 어떤 행에도 안 맞았다 → 미분류를 고르면 나머지 축 칩이 전부 0건이 된다.
--
-- 센티넬을 "그 축이 비어 있는 행" 으로 읽게 한다. 지역 RPC 2개도 같은 규칙을 쓴다
-- (한 화면에서 기준이 갈리면 안 된다).
--
-- ⚠️ 프로덕션 수동 적용(Management API). idempotent.

-- 축 조건을 한 곳에서 정의한다 — 세 RPC 가 같은 규칙을 쓰도록.
--   p 가 비었으면        → 필터 없음(전부 통과)
--   p 가 '_none' 이면    → 값이 비어 있는 행만
--   그 밖                → 값이 같은 행만
create or replace function public.nurse_axis_match(v text, p text)
returns boolean
language sql
immutable
set search_path to 'public'
as $$
  select case
    when p is null or p = '' then true
    when p = '_none'         then v is null
    else v = p
  end
$$;

grant execute on function public.nurse_axis_match(text, text) to anon, authenticated;

drop function if exists public.nurse_job_facet_list(text, text, text, text, text, text, text, text);

create function public.nurse_job_facet_list(
  p_sido       text default null,
  p_sigungu    text default null,
  p_specialty  text default null,
  p_facility   text default null,
  p_category   text default null,
  p_employment text default null,
  p_keyword    text default null,
  p_location   text default null
)
returns table(kind text, name text, cnt bigint)
language sql
stable
set search_path to 'public'
as $$
  with visible as (
    select specialty, facility_type, job_category
    from public.jobs j
    where status = 'open'
      and (source <> 'direct' or posted_at >= now() - interval '7 days' or featured_until >= now())
      and (deadline is null or deadline >= (now() at time zone 'Asia/Seoul')::date)
      and (p_sido    is null or p_sido    = '' or j.sido = p_sido)
      and (p_sigungu is null or p_sigungu = '' or p_sido is null or p_sido = '' or j.sigungu = p_sigungu)
      and public.nurse_axis_match(j.employment_type, p_employment)
      and (
        p_keyword is null or p_keyword = ''
        or j.title         ilike '%' || p_keyword || '%'
        or j.specialty     ilike '%' || p_keyword || '%'
        or j.facility_type ilike '%' || p_keyword || '%'
        or j.job_category  ilike '%' || p_keyword || '%'
      )
      and (p_location is null or p_location = '' or j.location ilike '%' || p_location || '%')
  ),
  -- 축마다 자기 자신을 뺀 나머지 필터를 적용한 모집단(칩 합계의 분모)
  for_dept as (
    select specialty as v from visible
    where public.nurse_axis_match(facility_type, p_facility)
      and public.nurse_axis_match(job_category, p_category)
  ),
  for_fac as (
    select facility_type as v from visible
    where public.nurse_axis_match(specialty, p_specialty)
      and public.nurse_axis_match(job_category, p_category)
  ),
  for_cat as (
    select job_category as v from visible
    where public.nurse_axis_match(specialty, p_specialty)
      and public.nurse_axis_match(facility_type, p_facility)
  )
  -- 화이트리스트 밖 값(null 포함)은 '' 한 칸으로 합친다 → 합계가 항상 결과 수와 맞고,
  -- 조작된 값이 칩으로 뜨지도 않는다.
  select 'department'::text,
         case when v in ('부서무관','내과','외과','산부인과','소아청소년과','혈액종양내과','신경과','신경외과',
                         '정신건강의학과','정형외과','흉부외과','성형외과','이비인후과','피부과','안과','비뇨기과',
                         '응급실','중환자실','인공신장실','수술실','분만실','신생아실','혈관조영실','내시경실',
                         '마취과/회복실','건강진단센터','주사실','기타') then v else '' end,
         count(*)
  from for_dept group by 2
  union all
  select 'facility'::text,
         case when v in ('상급종합병원','종합병원','병원','요양병원','한방병원','치과',
                         '의원','검진센터','보건소','산후조리원','요양원·주간보호','기타') then v else '' end,
         count(*)
  from for_fac group by 2
  union all
  select 'category'::text,
         case when v in ('간호직','간호조무직','사무·원무·코디','피부관리직','의료기사직','의사직','약무직','의료기타') then v else '' end,
         count(*)
  from for_cat group by 2
  order by 1, 3 desc
$$;

grant execute on function public.nurse_job_facet_list(text, text, text, text, text, text, text, text) to anon, authenticated;

-- ── 지역 RPC 2개도 같은 규칙으로 ─────────────────────────────────────────
drop function if exists public.nurse_job_sido_list(text, text, text, text, text, text);
create function public.nurse_job_sido_list(
  p_specialty  text default null,
  p_facility   text default null,
  p_category   text default null,
  p_employment text default null,
  p_keyword    text default null,
  p_location   text default null
)
returns table(name text, cnt bigint)
language sql
stable
set search_path to 'public'
as $$
  select sido, count(*)
  from public.jobs j
  where status = 'open' and sido is not null
    and (source <> 'direct' or posted_at >= now() - interval '7 days' or featured_until >= now())
    and (deadline is null or deadline >= (now() at time zone 'Asia/Seoul')::date)
    and public.nurse_axis_match(j.specialty, p_specialty)
    and public.nurse_axis_match(j.facility_type, p_facility)
    and public.nurse_axis_match(j.job_category, p_category)
    and public.nurse_axis_match(j.employment_type, p_employment)
    and (
      p_keyword is null or p_keyword = ''
      or j.title         ilike '%' || p_keyword || '%'
      or j.specialty     ilike '%' || p_keyword || '%'
      or j.facility_type ilike '%' || p_keyword || '%'
      or j.job_category  ilike '%' || p_keyword || '%'
    )
    and (p_location is null or p_location = '' or j.location ilike '%' || p_location || '%')
  group by sido order by count(*) desc
$$;

drop function if exists public.nurse_job_sigungu_list(text, text, text, text, text, text, text);
create function public.nurse_job_sigungu_list(
  p_sido       text,
  p_specialty  text default null,
  p_facility   text default null,
  p_category   text default null,
  p_employment text default null,
  p_keyword    text default null,
  p_location   text default null
)
returns table(name text, cnt bigint)
language sql
stable
set search_path to 'public'
as $$
  select sigungu, count(*)
  from public.jobs j
  where status = 'open' and sido = p_sido and sigungu is not null
    and (source <> 'direct' or posted_at >= now() - interval '7 days' or featured_until >= now())
    and (deadline is null or deadline >= (now() at time zone 'Asia/Seoul')::date)
    and public.nurse_axis_match(j.specialty, p_specialty)
    and public.nurse_axis_match(j.facility_type, p_facility)
    and public.nurse_axis_match(j.job_category, p_category)
    and public.nurse_axis_match(j.employment_type, p_employment)
    and (
      p_keyword is null or p_keyword = ''
      or j.title         ilike '%' || p_keyword || '%'
      or j.specialty     ilike '%' || p_keyword || '%'
      or j.facility_type ilike '%' || p_keyword || '%'
      or j.job_category  ilike '%' || p_keyword || '%'
    )
    and (p_location is null or p_location = '' or j.location ilike '%' || p_location || '%')
  group by sigungu order by count(*) desc
$$;

grant execute on function public.nurse_job_sido_list(text, text, text, text, text, text) to anon, authenticated;
grant execute on function public.nurse_job_sigungu_list(text, text, text, text, text, text, text) to anon, authenticated;
