-- 🔧 지역 드롭다운도 **지금 걸린 필터 안에서** 세도록 고친다.
--
-- 무엇이 문제였나(오너 지적 + 실측):
--   칩(nurse_job_facet_list)은 20260729070000 에서 필터를 반영하게 고쳤는데 지역 드롭다운은
--   그대로 뒀다. 그 결과 **같은 화면 안에서 기준이 둘로 갈렸다** —
--   요양원·주간보호를 고른 상태에서 드롭다운은 "경기도 360" 이라 하지만 실제로는 265건이다.
--   진료과 칩에서 고친 것과 정확히 같은 결함이다(데이터 없는 선택지를 보여주는 것).
--
-- 규칙도 칩과 같게 맞춘다: **지역 축은 자기 자신을 뺀다.**
--   시도 목록  = 진료과 ∧ 기관종별 ∧ 직종 ∧ 근무형태 ∧ 키워드 ∧ 지역텍스트 (시도는 안 건다)
--   시군구 목록 = 위 + 고른 시도                                   (시군구는 안 건다)
--   자기 축까지 걸면 고른 지역 하나만 남아 다른 지역으로 갈아탈 수 없다.
--
-- 🔴 술어는 getJobs(lib/data/jobs.ts)·칩 RPC 와 정확히 같아야 한다. 셋이 어긋나면 한 화면에서
--    세 가지 숫자가 나온다.
--
-- ⚠️ 프로덕션 수동 적용(Management API). idempotent.

drop function if exists public.nurse_job_sido_list();
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
    and (p_specialty  is null or p_specialty  = '' or j.specialty       = p_specialty)
    and (p_facility   is null or p_facility   = '' or j.facility_type   = p_facility)
    and (p_category   is null or p_category   = '' or j.job_category    = p_category)
    and (p_employment is null or p_employment = '' or j.employment_type = p_employment)
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

drop function if exists public.nurse_job_sigungu_list(text);
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
    and (p_specialty  is null or p_specialty  = '' or j.specialty       = p_specialty)
    and (p_facility   is null or p_facility   = '' or j.facility_type   = p_facility)
    and (p_category   is null or p_category   = '' or j.job_category    = p_category)
    and (p_employment is null or p_employment = '' or j.employment_type = p_employment)
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
