-- 🔧 잘못 분류된 진료과를 걷어내고 '산후조리원' 종별을 만든다.
--
-- 오너 지적(2026-07-29): "요양원에 무슨 신생아실이 있고 분만실이 있냐?"
-- 화면을 보니 요양원·주간보호 아래에 분만실 8 · 신생아실 6 · 건강진단센터 11 이 떠 있었다.
-- 원인은 진료과 추론 규칙이 **진료과와 무관한 문장**을 잡은 것이다(실측):
--
--   · 분만실   ← "오래 하실 **분만** 연락주세요", "경험 있으신 **분만** 지원부탁드립니다"
--                〈분(사람) + 만(조사)〉 이다. 15건 중 진짜 분만실은 3건뿐.
--   · 건강진단센터 ← "직원 **건강검진** 관련 업무", "채용**건강검진** 1개월 이내"
--                복리후생·제출서류다. 16건 중 진짜 검진센터는 2건뿐.
--   · 신생아실 ← 이건 값 자체는 맞았다. **기관 종별이 틀렸다** — 산후조리원이 산업분류상
--                요양원(8)·기타(2)·보건소(1)·병원(1)·미분류(6)로 흩어져 있었다.
--
-- 규칙은 lib/jobTaxonomy.ts 에서 좁혔고(부서를 가리키는 표현일 때만), 여기서는 이미 저장된
-- 값을 같은 기준으로 정리한다. 다음 크론이 새 규칙으로 다시 채운다.
--
-- ⚠️ 프로덕션 수동 적용(Management API). idempotent.

-- ── 1. 산후조리원을 제 종별로 ────────────────────────────────────────────
-- 이름에 '산후조리' 가 들어가면 산업분류가 무엇이든 산후조리원이다(업체마다 KSIC 가 제각각).
update public.jobs
set facility_type = '산후조리원'
where coalesce(company_name, '') || ' ' || coalesce(title, '') ~ '산후\s*조리';

-- ── 2. 진료과 오분류 되돌리기 ───────────────────────────────────────────
-- '분만실' 인데 분만실·분만장·분만간호 가 없으면 〈분+만〉 오탐이다 → 비운다.
update public.jobs set specialty = null
where specialty = '분만실'
  and coalesce(title,'') || ' ' || coalesce(description,'') !~ '분만실|분만장|분만\s*(간호|업무|파트|담당)|LDR';

-- '건강진단센터' 인데 부서를 가리키는 표현이 없으면 복리후생 문구다 → 비운다.
-- ⚠️ 처음엔 '센터' 가 붙은 것만 남겼다가 "특수검진실"·"종합검진 간호사" 같은 진짜를 놓쳤다.
--    검진이 곧 업무인 표현까지 포함한다(그래도 복리후생 오탐은 0건 — 실측).
update public.jobs set specialty = null
where specialty = '건강진단센터'
  and coalesce(title,'') || ' ' || coalesce(description,'')
      !~ '검진센터|건진센터|건강검진센터|종합검진센터|건강증진센터|검진실|종합검진|건강검진\s*(간호|파트|담당|업무)|검진\s*간호';

-- 나머지도 좁힌 규칙에 맞춰 정리(신생아실·중환자실·인공신장실·마취과/회복실).
update public.jobs set specialty = null
where specialty = '신생아실'
  and coalesce(title,'') || ' ' || coalesce(description,'') !~* '신생아실|신생아\s*(간호|케어|파트|담당)|NICU';
update public.jobs set specialty = null
where specialty = '중환자실'
  and coalesce(title,'') || ' ' || coalesce(description,'') !~* '중환자실|중환자\s*(간호|파트|담당)|ICU';
update public.jobs set specialty = null
where specialty = '인공신장실'
  and coalesce(title,'') || ' ' || coalesce(description,'') !~ '인공신장실|인공신장|투석실|투석\s*(간호|파트|담당|업무)';
update public.jobs set specialty = null
where specialty = '마취과/회복실'
  and coalesce(title,'') || ' ' || coalesce(description,'') !~* '마취과|마취통증|회복실|마취\s*간호|PACU';

-- ── 2-2. 좁힌 규칙으로 **새로 잡히는** 공고를 채운다 ─────────────────────
-- 규칙을 고치면 오탐만 지우고 끝나는 게 아니다. "특수검진실 간호사" 처럼 원래 잡혔어야 하는데
-- 비어 있던 것들도 지금 채워야, 다음 크론(6시간)까지 기다리지 않고 화면이 맞는다.
-- 🔴 광고주가 직접 고른 값은 건드리지 않는다(source='worknet' + specialty is null 한정).
update public.jobs set specialty = case
    when t ~ '검진센터|건진센터|건강검진센터|종합검진센터|건강증진센터|검진실|종합검진|건강검진\s*(간호|파트|담당|업무)|검진\s*간호' then '건강진단센터'
    when t ~ '분만실|분만장|분만\s*(간호|업무|파트|담당)|LDR' then '분만실'
    when t ~* '마취과|마취통증|회복실|마취\s*간호|PACU' then '마취과/회복실'
    else null end
  from (select id as jid, coalesce(title,'') || ' ' || coalesce(description,'') as t from public.jobs) src
  where public.jobs.id = src.jid
    and public.jobs.source = 'worknet'
    and public.jobs.specialty is null;

-- 폐기한 `\bOR\b` 규칙("간호사 **or** 간호조무사")과 옛 넓은 규칙이 남긴 잔재를 마저 지운다.
-- 저장된 값은 **언제나 지금 규칙으로 설명 가능해야** 한다 — 아니면 왜 그렇게 분류됐는지
-- 아무도 재현할 수 없다.
update public.jobs set specialty = null
where specialty = '수술실'
  and coalesce(title,'') || ' ' || coalesce(description,'') !~* '수술실|스크럽|scrub';
update public.jobs set specialty = null
where specialty = '정신건강의학과'
  and coalesce(title,'') || ' ' || coalesce(description,'') !~ '정신건강|정신과|정신의학|폐쇄병동|정신병원';
update public.jobs set specialty = null
where specialty = '응급실'
  and coalesce(title,'') || ' ' || coalesce(description,'') !~ '응급실|응급의료|응급센터';

-- ── 3. 칩 화이트리스트에 산후조리원 추가(함수를 다시 만든다) ──────────────
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
                          '의원','검진센터','보건소','산후조리원','요양원·주간보호','기타')
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
