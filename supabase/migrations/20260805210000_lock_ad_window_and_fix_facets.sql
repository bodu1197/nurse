-- 🔴 /review8 재검증이 잡은 CRITICAL 두 건(2026-08-05).
--
-- ① 병원이 **브라우저에서 자기 공고의 광고 기간을 직접 늘릴 수 있었다**
--    public.jobs 의 UPDATE 권한이 컬럼 단위로 authenticated 에게 열려 있었다
--    (featured_until, ad_tier, status) — 실측 확인. jobs_update 정책은 "내 병원의 open/closed
--    공고" 를 허용하므로, 병원이 콘솔에서 한 줄이면 됐다:
--      supabase.from('jobs').update({ featured_until: '2030-01-01' }).eq('id', 내공고)
--    이번에 노출의 문을 featured_until **하나로** 모았기 때문에 이 구멍 하나로 광고를
--    무기한 공짜로 켤 수 있다. 결제 구조 전체를 무의미하게 만드는 값이라 회수한다.
--    🔒 status 는 남긴다 — 병원의 「마감하기」(setJobStatus)가 사용자 세션으로 쓰는 유일한 칸이다.
--       광고 기간은 결제(activateAdOrder)와 관리자 조치(extendAd/endAd)만 바꾸고, 둘 다 서버 키로 쓴다.
--
-- ② 지역·필터 칩의 개수가 옛 규칙으로 세고 있었다
--    목록은 "광고 중인 우리 공고 + 워크넷" 만 보여주는데, 칩 개수를 만드는 세 함수는
--    `source <> 'direct' or posted_at >= now() - 7일 or featured_until >= now()` 라
--    **광고를 안 낸 이관분까지 전부 셌다.** 「서울 (37)」을 눌렀는데 0건이 나오는 상태다.
--    셋 다 정본(jobs_listed.is_live) 을 읽게 바꾼다 — 규칙이 하나면 어긋날 수가 없다.

-- ── ① 광고 기간은 결제로만 바뀐다 ────────────────────────────────────────────
revoke update (featured_until, ad_tier) on public.jobs from authenticated;
-- anon 은 jobs 의 거의 모든 칸에 UPDATE 권한이 있었다(실측). 정책이 막고 있어 실제 쓰기는
-- 안 됐지만, 권한 자체를 두면 정책이 한 번 느슨해지는 날 그대로 뚫린다.
revoke update on public.jobs from anon;

-- ── ② 지역·필터 칩 개수를 노출 규칙 하나로 ──────────────────────────────────
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
         case when v in ('간호직','간호조무직','사무·원무·코디','피부관리직','의료기사직','의사직','약무직','의료기타') then v else '' end,
         count(*)
  from for_cat group by 2
  order by 1, 3 desc
$function$;

CREATE OR REPLACE FUNCTION public.nurse_job_sido_list(p_specialty text DEFAULT NULL::text, p_facility text DEFAULT NULL::text, p_category text DEFAULT NULL::text, p_employment text DEFAULT NULL::text, p_keyword text DEFAULT NULL::text, p_location text DEFAULT NULL::text)
 RETURNS TABLE(name text, cnt bigint)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select sido, count(*)
  from public.jobs_listed j
  where j.is_live and sido is not null
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
$function$;

CREATE OR REPLACE FUNCTION public.nurse_job_sigungu_list(p_sido text, p_specialty text DEFAULT NULL::text, p_facility text DEFAULT NULL::text, p_category text DEFAULT NULL::text, p_employment text DEFAULT NULL::text, p_keyword text DEFAULT NULL::text, p_location text DEFAULT NULL::text)
 RETURNS TABLE(name text, cnt bigint)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select sigungu, count(*)
  from public.jobs_listed j
  where j.is_live and sido = p_sido and sigungu is not null
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
$function$;
