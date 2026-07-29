-- 🔧 칩 집계에 지역 텍스트(?l=) 필터를 더한다 — 앞 마이그레이션(20260729070000)에서 빠뜨렸다.
--
-- 홈 검색폼이 넣는 ?l=성남 은 getJobs 가 `location ilike` 로 거는데 칩 집계는 안 걸었다.
-- 그래서 /jobs?l=성남&fac=의원 에서 "의원 70" 이라 해놓고 눌렀을 때 더 적게 나온다(/review8 지적).
-- 함수를 통째로 다시 만든다(아래는 앞 버전 전문 + p_location).
--
-- ⚠️ 프로덕션 수동 적용(Management API). idempotent.

-- 인자 없는 옛 버전을 지운다(같은 이름 다른 시그니처가 남으면 PostgREST 가 모호하다고 거부한다).
drop function if exists public.nurse_job_facet_list();
drop function if exists public.nurse_job_facet_list(text, text, text, text, text, text, text);
drop function if exists public.nurse_job_facet_list(text, text, text, text, text, text, text, text);

create function public.nurse_job_facet_list(
  p_sido       text default null,
  p_sigungu    text default null,
  p_specialty  text default null,
  p_facility   text default null,
  p_category   text default null,
  p_employment text default null,
  p_keyword    text default null,
  -- 홈 검색폼이 넣는 지역 텍스트(?l=성남). getJobs 가 location ilike 로 거는 것과 같은 축이다.
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
      and (p_location is null or p_location = '' or j.location ilike '%' || p_location || '%')
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

grant execute on function public.nurse_job_facet_list(text, text, text, text, text, text, text, text) to anon, authenticated;
