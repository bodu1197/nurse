-- 🧓 요양·간병 공고를 jobs 로 합친다 (1/2) — 뷰에 is_care, 간호 목록 RPC 3개에 p_care.
--
-- 왜(오너 지시 2026-10-16): "왜 별도 페이지를 새로 만들어? 기존 구인 공고 페이지 그대로 100% 재사용 하면 되지".
--   요양·간병 공고를 별도 표(care_jobs)에 두니 상세·저장·지원·옆 목록을 전부 따로 만들어야 했고, 따로 만든 것은 기존과 달랐다.
--   jobs 에 직종(요양보호사·간병인)으로 넣으면 /jobs/[id]·저장·로그인→이력서→지원·광고가 **그대로** 돈다. 목록만 갈린다:
--   간호(/jobs)는 is_care = false, 요양·간병(/care-jobs)은 is_care = true. 화면 코드는 같은 것을 쓴다(app/jobs/JobsListing).
--
-- 🔴 is_live 의 뜻은 바꾸지 않는다 — "구직자에게 어딘가 보인다". 결제·무료 1주·지원 상태·관리자 화면·인재 열람 자격이
--    그 뜻으로 읽는다(요양·간병 광고도 돈을 낸 노출이다). 간호 목록만 is_care 로 한 번 더 거른다.
-- 🔴 이 파일은 **새 코드 배포 전에** 적용해도 옛 코드가 깨지지 않는다 — 뷰는 맨 뒤에 칸을 붙이고, RPC 는 기본값 false 인 인자를
--    더할 뿐이다(옛 코드가 p_care 없이 불러도 오류 없이 간호 쪽 답). 단 배포 전까지는 기관이 직접 올린 요양·간병 공고가 옛 목록에는
--    보이고 칩·지역 건수에서는 빠져 그만큼 어긋난다(직종이 생긴 지 몇 시간이라 실제 0건 근처) — 배포를 서두른다.
--    행 옮기기는 2/2(20261016170000) — 배포 **뒤에** 적용한다.
-- 🔴 목록 RPC 에 `status = 'open'` 을 평문으로 함께 적는다 — is_live·is_care 는 계산식이라 인덱스를 못 탄다. 수집분은 지우지 않고
--    닫아 두므로(closed) 표가 계속 커지는데, 평문 조건이 있어야 닫힌 행을 건너뛰는 인덱스(jobs_status_idx)를 쓸 수 있다.

-- 1) 뷰 — 칸은 **맨 뒤에만** 붙인다(CREATE OR REPLACE VIEW 는 기존 칸의 자리·이름을 못 바꾼다, 42P16).
--    🔴 security_invoker 를 다시 적는다 — create or replace 는 옵션을 통째로 갈아엎는다(빠뜨려 마감 공고가 샌 적 있다).
create or replace view public.jobs_listed
with (security_invoker = true) as
 SELECT j.id, j.hospital_id, j.title, j.specialty, j.location, j.employment_type, j.salary_text,
    j.benefits, j.description, j.source, j.external_url, j.external_id, j.status, j.is_featured,
    j.posted_at, j.created_at, j.updated_at, j.featured_until, j.ad_tier, j.manager_name,
    j.manager_phone, j.deadline, j.recruit_count, j.shift_type, j.apply_method, j.apply_email,
    j.apply_detail, j.apply_methods, j.detail_fetched_at, j.company_name, j.sido, j.sigungu,
    j.facility_type, j.job_category, j.lat, j.lng, j.geocoded_at,
    j.featured_until IS NOT NULL AND j.featured_until > now() AS ad_live,
    (j.status = 'open'
      AND (j.source in ('worknet','public_data','crawl') OR j.featured_until IS NOT NULL AND j.featured_until > now())
      AND (j.deadline IS NULL OR j.deadline >= (now() AT TIME ZONE 'Asia/Seoul')::date)) IS TRUE AS is_live,
    (j.ad_tier = 'standard' AND j.featured_until IS NOT NULL AND j.featured_until > now()) IS TRUE AS ad_paid,
    h.name AS hospital_name,
    (j.facility_type = '상급종합병원') IS TRUE AS is_tertiary,
    -- 요양·간병 직종인가 — 직종 이름을 여기 한 번만 적는다(앱의 짝은 lib/jobTaxonomy CARE_CATEGORIES). 값이 없으면 간호 쪽이다.
    (j.job_category in ('요양보호사', '간병인')) IS TRUE AS is_care
   FROM public.jobs j
   LEFT JOIN public.hospitals h ON h.id = j.hospital_id;

-- 2) 칩 집계 — 본문은 20261016150000 그대로, visible 에 is_care 조건만 더했다.
--    인자를 더하면 새 오버로드가 생겨 PostgREST 가 어느 것을 부를지 못 고른다(PGRST203) — 옛 시그니처를 지우고 다시 만든다.
drop function if exists public.nurse_job_facet_list(text, text, text, text, text, text, text, text);
create or replace function public.nurse_job_facet_list(p_sido text DEFAULT NULL::text, p_sigungu text DEFAULT NULL::text, p_specialty text DEFAULT NULL::text, p_facility text DEFAULT NULL::text, p_category text DEFAULT NULL::text, p_employment text DEFAULT NULL::text, p_keyword text DEFAULT NULL::text, p_location text DEFAULT NULL::text, p_care boolean DEFAULT false)
 RETURNS TABLE(kind text, name text, cnt bigint)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  with visible as (
    select specialty, facility_type, job_category
    from public.jobs_listed j
    where j.is_live
      and j.status = 'open'
      and j.is_care = coalesce(p_care, false)
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
grant execute on function public.nurse_job_facet_list(text, text, text, text, text, text, text, text, boolean) to anon, authenticated;

-- 3) 지역 건수(시도) — 20260805210000 본문 + is_care 조건.
drop function if exists public.nurse_job_sido_list(text, text, text, text, text, text);
create or replace function public.nurse_job_sido_list(p_specialty text DEFAULT NULL::text, p_facility text DEFAULT NULL::text, p_category text DEFAULT NULL::text, p_employment text DEFAULT NULL::text, p_keyword text DEFAULT NULL::text, p_location text DEFAULT NULL::text, p_care boolean DEFAULT false)
 RETURNS TABLE(name text, cnt bigint)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select sido, count(*)
  from public.jobs_listed j
  where j.is_live and j.status = 'open' and sido is not null
    and j.is_care = coalesce(p_care, false)
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
grant execute on function public.nurse_job_sido_list(text, text, text, text, text, text, boolean) to anon, authenticated;

-- 4) 지역 건수(시군구) — 20260805210000 본문 + is_care 조건.
drop function if exists public.nurse_job_sigungu_list(text, text, text, text, text, text, text);
create or replace function public.nurse_job_sigungu_list(p_sido text, p_specialty text DEFAULT NULL::text, p_facility text DEFAULT NULL::text, p_category text DEFAULT NULL::text, p_employment text DEFAULT NULL::text, p_keyword text DEFAULT NULL::text, p_location text DEFAULT NULL::text, p_care boolean DEFAULT false)
 RETURNS TABLE(name text, cnt bigint)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select sigungu, count(*)
  from public.jobs_listed j
  where j.is_live and j.status = 'open' and sido = p_sido and sigungu is not null
    and j.is_care = coalesce(p_care, false)
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
grant execute on function public.nurse_job_sigungu_list(text, text, text, text, text, text, text, boolean) to anon, authenticated;

notify pgrst, 'reload schema';
