-- 🔧 칩 합계가 결과 수와 맞게 한다 — **미분류를 숨기지 않는다**.
--
-- 오너 지적(2026-07-29): "치과 결과가 9개인데 진료과 총합은 2, 직종은 8이다.
--   방에 공이 10개면 선반 5 + 서랍 3 + 바닥 2 로 합이 맞아야 하고,
--   빨간공 + 노란공 = 10 이어야 한다."
--
-- 맞는 말이다. 지금은 값이 없는 공고(진료과 미분류 등)가 칩에서 통째로 빠져,
--   치과 9건 = 진료과 2 + (사라진 7)
--   치과 9건 = 직종 8 + (사라진 1)
-- 처럼 화면이 스스로 모순된다. 워크넷 공고는 진료과가 원래 없는 게 정상이라(요양·간병 등)
-- 이 '사라진 몫'이 전체의 83%(1,156/1,393)나 된다 — 숨기면 안 되는 크기다.
--
-- 그래서 축마다 **'(미분류)' 한 칸**을 함께 내려준다. 화면은 이걸 "미분류 N" 칩으로 그리고,
-- 누르면 그 축이 비어 있는 공고만 보여준다. 그러면 언제나
--   결과 수 = 그 축 칩들의 합
-- 이 성립한다.
--
-- 🔴 이름을 빈 문자열('')로 내려보낸다. 실제 값과 절대 겹치지 않고(화이트리스트에 ''는 없다),
--    앱이 URL 센티넬(spec=_none)로 바꿔 쓴다.
--
-- ⚠️ 프로덕션 수동 적용(Management API). idempotent.

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
      and (p_employment is null or p_employment = '' or j.employment_type = p_employment)
      and (
        p_keyword is null or p_keyword = ''
        or j.title         ilike '%' || p_keyword || '%'
        or j.specialty     ilike '%' || p_keyword || '%'
        or j.facility_type ilike '%' || p_keyword || '%'
        or j.job_category  ilike '%' || p_keyword || '%'
      )
      and (p_location is null or p_location = '' or j.location ilike '%' || p_location || '%')
  ),
  -- 축마다 자기 자신을 뺀 나머지 필터를 적용한 모집단(칩 합계의 분모가 된다)
  for_dept as (
    select specialty as v from visible
    where (p_facility is null or p_facility = '' or facility_type = p_facility)
      and (p_category is null or p_category = '' or job_category  = p_category)
  ),
  for_fac as (
    select facility_type as v from visible
    where (p_specialty is null or p_specialty = '' or specialty    = p_specialty)
      and (p_category  is null or p_category  = '' or job_category = p_category)
  ),
  for_cat as (
    select job_category as v from visible
    where (p_specialty is null or p_specialty = '' or specialty     = p_specialty)
      and (p_facility  is null or p_facility  = '' or facility_type = p_facility)
  )
  -- 🔴 화이트리스트 밖 값은 '(미분류)'로 합친다. 값이 없는 것(null)과 목록에 없는 조작된 값이
  --    같은 칸으로 가므로, 합계가 언제나 결과 수와 맞고 조작된 값이 칩으로 뜨지도 않는다.
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
