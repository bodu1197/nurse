-- 🧓 직종 허용 목록에 요양보호사·간병인 추가 — 공고 칩(nurse_job_facet_list)·인재 칩(nurse_talent_facet_list).
--
-- 앱의 JOB_CATEGORIES(lib/resumeOptions)에 두 직종을 더하면서(2026-10-16, 기관 직접 등록 요양·간병 공고 → /care-jobs)
-- 두 함수의 화이트리스트도 같이 늘린다. 안 늘리면 그 직종 공고가 '미분류'('') 칸에 섞여 세어지는데, 미분류 칩을 누르면
-- 앱은 job_category is null 로 거르므로(lib/data/jobs.ts UNSET) **칩 건수와 목록이 어긋난다**(/review8 지적 2026-10-16).
-- 본문은 20260805210000·20260728190000 의 정의를 그대로 두고 category 목록만 바꿨다.
CREATE OR REPLACE FUNCTION public.nurse_job_facet_list(p_sido text DEFAULT NULL::text, p_sigungu text DEFAULT NULL::text, p_specialty text DEFAULT NULL::text, p_facility text DEFAULT NULL::text, p_category text DEFAULT NULL::text, p_employment text DEFAULT NULL::text, p_keyword text DEFAULT NULL::text, p_location text DEFAULT NULL::text)
 RETURNS TABLE(kind text, name text, cnt bigint)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  with visible as (
    select specialty, facility_type, job_category
    from public.jobs_listed j
    where j.is_live
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
         case when v in ('간호직','간호조무직','요양보호사','간병인','사무·원무·코디','피부관리직','의료기사직','의사직','약무직','의료기타') then v else '' end,
         count(*)
  from for_cat group by 2
  order by 1, 3 desc
$function$;

-- 인재 칩 — 이력서 희망 직종에도 같은 두 값이 생긴다(요양보호사 구직자가 이력서를 올려야 요양·간병 공고에 간편지원할 수 있다).
CREATE OR REPLACE FUNCTION public.nurse_talent_facet_list()
 RETURNS TABLE(kind text, name text, cnt bigint)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select 'department'::text, s, count(*)
  from public.resumes r, unnest(r.specialties) s
  where r.is_public and r.name is not null
    and s in ('부서무관','내과','외과','산부인과','소아청소년과','혈액종양내과','신경과','신경외과',
              '정신건강의학과','정형외과','흉부외과','성형외과','이비인후과','피부과','안과','비뇨기과',
              '응급실','중환자실','인공신장실','수술실','분만실','신생아실','혈관조영실','내시경실',
              '마취과/회복실','건강진단센터','주사실','기타')
  group by 2
  union all
  select 'category'::text, c, count(*)
  from public.resumes r, unnest(r.job_categories) c
  where r.is_public and r.name is not null
    and c in ('간호직','간호조무직','요양보호사','간병인','사무·원무·코디','피부관리직','의료기사직','의사직','약무직','의료기타')
  group by 2
  order by 1, 3 desc
$function$;
