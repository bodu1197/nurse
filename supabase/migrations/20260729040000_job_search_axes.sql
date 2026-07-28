-- 🗂 공고 검색 축 개편 — 진료과를 이력서와 같은 표로 통일하고, 기관 종별·직종 축을 새로 만든다.
--    오너 지시(2026-07-29): "/talent 기준으로 진료과를 생성하고 워크넷을 고려하는 것을 추가".
--
-- 왜 필요했나(실측 2026-07-29):
--   ① 자체 광고 44건 중 **32건(73%)** 이 진료과 값은 멀쩡한데 칩이 없어 검색되지 않았다.
--      내과 5 · 안과 3 · 정형외과 3 · 산부인과 3 · 소아청소년과 · 성형외과 · 비뇨기과 · 피부과 ·
--      이비인후과 — 전부 이력서 쪽 표(DEPARTMENTS 28)에는 있는 값이다. 칩만 옛 9개였다.
--   ② 워크넷 공고는 진료과 자리에 '요양병원'(47%)이 들어앉고 41.5%가 미분류였다.
--      '병동·외래·요양병원' 은 진료과가 아니라 근무지 유형이라 축이 섞여 있었다.
--   ③ 워크넷은 산업분류(indTpNm)와 직종코드(jobsCd)를 **누락 0건으로** 주는데 둘 다 버리고 있었다.
--      그걸 저장하면 기관 종별 96.8% · 직종 100% 가 공짜로 채워진다.
--
-- ⚠️ 프로덕션 수동 적용(Management API). idempotent.

-- ── 1. 컬럼 ───────────────────────────────────────────────────────────────
alter table public.jobs add column if not exists facility_type text;
alter table public.jobs add column if not exists job_category  text;

comment on column public.jobs.facility_type is
  '기관 종별(lib/jobTaxonomy.FACILITY_TYPES 11종). 워크넷은 산업분류 indTpNm 에서 유도(96.8%).';
comment on column public.jobs.job_category is
  '직종(lib/resumeOptions.JOB_CATEGORIES). 워크넷은 직종코드 jobsCd 에서 유도(누락 0건).';
comment on column public.jobs.specialty is
  '진료과 — 이력서 resumes.specialties 와 **같은 어휘**(DEPARTMENTS 28종). 옛 9종 목록은 폐기(2026-07-29).';

-- 칩 집계와 필터가 쓰는 인덱스. 지금까지 specialty 에도 인덱스가 없어 칩마다 전 행을 훑었다.
create index if not exists jobs_specialty_idx     on public.jobs (specialty)     where specialty is not null;
create index if not exists jobs_facility_type_idx on public.jobs (facility_type) where facility_type is not null;
create index if not exists jobs_job_category_idx  on public.jobs (job_category)  where job_category is not null;

-- ── 2. 기존 값 이관 ───────────────────────────────────────────────────────
-- 옛 9개 어휘 중 이름만 다른 것을 이력서 표의 이름으로 맞춘다(lib/jobTaxonomy.LEGACY_SPECIALTY_MAP 과 동일).
update public.jobs set specialty = '정신건강의학과' where specialty = '정신과';
update public.jobs set specialty = '마취과/회복실'  where specialty = '마취과';
update public.jobs set specialty = '인공신장실'    where specialty = '투석실';

-- '요양병원' 은 진료과가 아니라 기관 종별이다 → 축을 옮긴다.
update public.jobs set facility_type = '요양병원', specialty = null where specialty = '요양병원';

-- '병동'·'외래' 는 근무 위치지 진료과가 아니다. 제목에 진짜 진료과가 있으면 살리고, 없으면 비운다.
-- (아래 3번 텍스트 추론이 어차피 한 번 더 훑으므로 여기서는 비우기만 한다.)
update public.jobs set specialty = null where specialty in ('병동', '외래');

-- ── 3. 백필(텍스트 기반 1회성) ────────────────────────────────────────────
-- 🔴 이건 어디까지나 **임시 채움**이다. 워크넷 공고의 정답은 API 의 indTpNm/jobsCd 이고,
--    다음 sync-worknet 크론(하루 4회)이 이 값을 권위 있는 값으로 덮어쓴다.
--    자체 광고는 등록 폼에서 병원이 직접 고르므로 여기서 손대지 않는다(잘못 덮으면 광고주 입력이 사라진다).

-- 기관 종별 — 회사명이 가장 신뢰도 높다. 구체적인 것부터(요양병원 > 병원, 치과의원 > 의원).
update public.jobs set facility_type = case
    when company_name ~ '요양병원'                              then '요양병원'
    when company_name ~ '요양원|주간보호|실버|데이케어|노인복지|재가' then '요양원·주간보호'
    when company_name ~ '대학교병원|대학병원|의료원'               then '상급종합병원'
    when company_name ~ '종합병원'                              then '종합병원'
    when company_name ~ '치과'                                 then '치과'
    when company_name ~ '한방병원|한의원'                        then '한방병원'
    when company_name ~ '보건소|보건지소|보건진료'                 then '보건소'
    when company_name ~ '검진|건진'                             then '검진센터'
    when company_name ~ '병원'                                 then '병원'
    when company_name ~ '의원|클리닉'                            then '의원'
    else null end
  where source = 'worknet' and facility_type is null and company_name is not null;

-- 직종 — 워크넷 jobsCd 를 아직 저장하지 않았으므로 제목으로 근사한다. 다음 동기화가 정정한다.
update public.jobs set job_category = case
    when title ~ '간호조무|조무사' then '간호조무직'
    when title ~ '간호사'         then '간호직'
    else null end
  where source = 'worknet' and job_category is null;

-- 진료과 — 제목 + 본문에서. 구체적인 것을 먼저 보도록 case 순서를 맞춘다
-- (lib/jobTaxonomy.DEPARTMENT_RULES 와 같은 순서 — 한쪽만 고치면 화면과 DB 가 갈린다).
update public.jobs set specialty = case
    when t ~ '혈액종양|종양내과|항암'               then '혈액종양내과'
    when t ~ '정신건강|정신과|정신의학|폐쇄병동|정신병원' then '정신건강의학과'
    when t ~ '소아|청소년과'                       then '소아청소년과'
    when t ~ '산부인과|여성의학'                    then '산부인과'
    when t ~ '정형외과'                           then '정형외과'
    when t ~ '신경외과'                           then '신경외과'
    when t ~ '흉부외과'                           then '흉부외과'
    when t ~ '성형외과'                           then '성형외과'
    when t ~ '이비인후'                           then '이비인후과'
    when t ~ '비뇨'                              then '비뇨기과'
    when t ~ '신경과'                             then '신경과'
    when t ~ '피부과'                             then '피부과'
    when t ~ '안과'                               then '안과'
    when t ~* '마취|회복실|PACU'                   then '마취과/회복실'
    when t ~ '인공신장|투석'                        then '인공신장실'
    when t ~* '중환자|ICU'                        then '중환자실'
    when t ~ '응급실|응급의료|응급센터'               then '응급실'
    when t ~* '수술실|스크럽|scrub'                 then '수술실'
    when t ~ '분만'                               then '분만실'
    when t ~* '신생아|NICU'                        then '신생아실'
    when t ~* '혈관조영|심혈관센터|angio'            then '혈관조영실'
    when t ~ '내시경'                             then '내시경실'
    when t ~ '건강검진|검진센터|건진|종합검진'         then '건강진단센터'
    when t ~ '주사실'                             then '주사실'
    when t ~ '내과'                               then '내과'
    when t ~ '외과'                               then '외과'
    else null end
  from (select id as jid, coalesce(title,'') || ' ' || coalesce(description,'') as t from public.jobs) src
  where public.jobs.id = src.jid and public.jobs.source = 'worknet' and public.jobs.specialty is null;

-- ── 4. 칩 목록 RPC ────────────────────────────────────────────────────────
-- 🗂 진료과·기관종별·직종 칩 — **공고가 있는 것만** 많은 순. 지역 계단·인재 칩과 같은 사고방식이다.
--    고정 목록을 뿌리면 0건인 칩을 누른 사용자가 빈 화면을 만난다(옛 9개 중 4개가 실제로 0건이었다).
--
-- 🔴 술어는 목록 쿼리(getJobs, lib/data/jobs.ts) 및 지역 RPC 와 **정확히 같아야** 한다.
--    어긋나면 칩이 "내과 12건"이라 해놓고 눌렀을 때 9건이 나온다.
--      ① status = 'open'
--      ② direct 노출: source<>'direct' OR posted_at>=(now-7일) OR featured_until>=now
--      ③ deadline: 마감 지난 글 제외(null=상시)
-- 🔴 화이트리스트를 건다. 세 컬럼 모두 자유 텍스트라, 조작된 입력이 **모든 방문자의 칩 목록**에
--    실릴 수 있다. 목록은 lib/jobTaxonomy.ts · lib/resumeOptions.ts 와 같아야 한다.
-- 한 번의 스캔으로 셋 다 내려준다(따로 부르면 같은 행을 세 번 훑는다).
drop function if exists public.nurse_job_facet_list();
create function public.nurse_job_facet_list()
returns table(kind text, name text, cnt bigint)
language sql
stable
set search_path to 'public'
as $$
  with visible as (
    select specialty, facility_type, job_category
    from public.jobs
    where status = 'open'
      and (source <> 'direct' or posted_at >= now() - interval '7 days' or featured_until >= now())
      and (deadline is null or deadline >= (now() at time zone 'Asia/Seoul')::date)
  )
  select 'department'::text, specialty, count(*)
  from visible
  where specialty in ('부서무관','내과','외과','산부인과','소아청소년과','혈액종양내과','신경과','신경외과',
                      '정신건강의학과','정형외과','흉부외과','성형외과','이비인후과','피부과','안과','비뇨기과',
                      '응급실','중환자실','인공신장실','수술실','분만실','신생아실','혈관조영실','내시경실',
                      '마취과/회복실','건강진단센터','주사실','기타')
  group by 2
  union all
  select 'facility'::text, facility_type, count(*)
  from visible
  where facility_type in ('상급종합병원','종합병원','병원','요양병원','한방병원','치과',
                          '의원','검진센터','보건소','요양원·주간보호','기타')
  group by 2
  union all
  select 'category'::text, job_category, count(*)
  from visible
  where job_category in ('간호직','간호조무직','사무·원무·코디','피부관리직','의료기사직','의사직','약무직','의료기타')
  group by 2
  order by 1, 3 desc
$$;

grant execute on function public.nurse_job_facet_list() to anon, authenticated;
