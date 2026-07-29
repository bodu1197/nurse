-- 🔧 칩 목록이 **지금 걸린 필터 안에서** 세도록 고친다.
--
-- 무엇이 문제였나(오너 지적 + 실측):
--   '요양원·주간보호'(652건)를 누르면 진료과 칩 26개가 그대로 뜬다. 그런데 그 안에 진료과가
--   있는 공고는 35건뿐이고 실제로 존재하는 진료과는 9개다 — 나머지 17개는 눌러도 빈 화면이다.
--   "0건인 칩은 그리지 않는다"는 원칙을 필터 없는 상태에서만 지키고 있었다.
--
-- 어떻게 고치나 — 축마다 **자기 자신을 뺀** 나머지 필터로 센다(faceted search 의 표준):
--   · 진료과 칩   = 기관종별 ∧ 직종 ∧ 근무형태 ∧ 지역 ∧ 키워드 (진료과는 안 건다)
--   · 기관종별 칩 = 진료과 ∧ 직종 ∧ …            (기관종별은 안 건다)
--   · 직종 칩     = 진료과 ∧ 기관종별 ∧ …         (직종은 안 건다)
--   자기 축까지 걸면 고른 값 하나만 남아 **다른 값으로 갈아탈 수가 없다**.
--
-- 🔴 술어는 getJobs(lib/data/jobs.ts)와 정확히 같아야 한다. 어긋나면 칩이 "내과 15"라 해놓고
--    눌렀을 때 다른 수가 나온다. 키워드까지 포함해 같은 컬럼을 같은 방식으로 본다.
--
-- ⚠️ 프로덕션 수동 적용(Management API). idempotent.

-- 인자 없는 옛 버전을 지운다(같은 이름 다른 시그니처가 남으면 PostgREST 가 모호하다고 거부한다).
drop function if exists public.nurse_job_facet_list();
drop function if exists public.nurse_job_facet_list(text, text, text, text, text, text, text);

create function public.nurse_job_facet_list(
  p_sido       text default null,
  p_sigungu    text default null,
  p_specialty  text default null,
  p_facility   text default null,
  p_category   text default null,
  p_employment text default null,
  p_keyword    text default null
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
      -- getJobs 의 노출 규칙 세 가지(그대로 옮긴다)
      and (source <> 'direct' or posted_at >= now() - interval '7 days' or featured_until >= now())
      and (deadline is null or deadline >= (now() at time zone 'Asia/Seoul')::date)
      -- 지역: 시군구는 시도에 종속(시도 없이 걸면 '중구'가 여러 시도에 있어 엉뚱한 곳을 긁는다)
      and (p_sido    is null or p_sido    = '' or j.sido = p_sido)
      and (p_sigungu is null or p_sigungu = '' or p_sido is null or p_sido = '' or j.sigungu = p_sigungu)
      and (p_employment is null or p_employment = '' or j.employment_type = p_employment)
      -- 키워드: getJobs 와 같은 네 컬럼
      and (
        p_keyword is null or p_keyword = ''
        or j.title         ilike '%' || p_keyword || '%'
        or j.specialty     ilike '%' || p_keyword || '%'
        or j.facility_type ilike '%' || p_keyword || '%'
        or j.job_category  ilike '%' || p_keyword || '%'
      )
  )
  select 'department'::text, specialty, count(*)
  from visible
  where specialty in ('부서무관','내과','외과','산부인과','소아청소년과','혈액종양내과','신경과','신경외과',
                      '정신건강의학과','정형외과','흉부외과','성형외과','이비인후과','피부과','안과','비뇨기과',
                      '응급실','중환자실','인공신장실','수술실','분만실','신생아실','혈관조영실','내시경실',
                      '마취과/회복실','건강진단센터','주사실','기타')
    -- 자기 축(specialty)은 빼고 나머지만 건다 → 다른 진료과로 갈아탈 수 있다
    and (p_facility is null or p_facility = '' or facility_type = p_facility)
    and (p_category is null or p_category = '' or job_category  = p_category)
  group by 2
  union all
  select 'facility'::text, facility_type, count(*)
  from visible
  where facility_type in ('상급종합병원','종합병원','병원','요양병원','한방병원','치과',
                          '의원','검진센터','보건소','요양원·주간보호','기타')
    and (p_specialty is null or p_specialty = '' or specialty    = p_specialty)
    and (p_category  is null or p_category  = '' or job_category = p_category)
  group by 2
  union all
  select 'category'::text, job_category, count(*)
  from visible
  where job_category in ('간호직','간호조무직','사무·원무·코디','피부관리직','의료기사직','의사직','약무직','의료기타')
    and (p_specialty is null or p_specialty = '' or specialty     = p_specialty)
    and (p_facility  is null or p_facility  = '' or facility_type = p_facility)
  group by 2
  order by 1, 3 desc
$$;

grant execute on function public.nurse_job_facet_list(text, text, text, text, text, text, text) to anon, authenticated;
