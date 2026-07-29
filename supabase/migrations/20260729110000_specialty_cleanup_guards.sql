-- 🔧 앞 정리(20260729100000)가 너무 넓게 지웠다. 두 가지를 되돌리고 막는다.
--
-- ① **광고주가 직접 고른 값까지 지웠다** (CRITICAL)
--    그 마이그레이션의 UPDATE 8개에 `source` 조건이 없었다. 병원이 등록 폼에서 고른 진료과도
--    본문에 그 단어가 없으면 null 이 됐다. 실측: 자체 광고의 진료과 미선택이 2건 → 4건으로 늘었고,
--    '이앤정정신건강의학과의원'(회사명에는 있지만 제목·본문에는 없다)이 정신건강의학과를 잃었다.
--    → 회사명까지 보고 되살린다. 앞으로 이런 정리는 반드시 `source='worknet'` 으로 한정한다.
--
-- ② **워크넷 추론 근거의 일부(사업내용)를 SQL 이 못 본다**
--    앱은 제목 + 사업내용(busiCont) + 직무내용으로 진료과를 뽑는데, 사업내용은 컬럼에 저장하지
--    않는다. 그래서 SQL 정리는 제목·본문만 보고 "근거 없음"으로 판단해 **사업내용에서 나온 정상
--    분류까지 지웠다**. 게다가 크론은 상세를 이미 받은 공고(detail_fetched_at)를 다시 안 받아
--    스스로 복구하지 못한다.
--    → 이번에 비워진 워크넷 공고의 detail_fetched_at 을 지워 다음 크론이 상세를 다시 받아
--      지금 규칙으로 채우게 한다(하루 4회 · 실행당 1,500건 상한이라 하루면 끝난다).
--
-- ⚠️ 프로덕션 수동 적용(Management API). idempotent.

-- ── ① 자체 광고 되살리기 — 회사명까지 본다 ────────────────────────────────
-- 🔴 source <> 'worknet' 한정. 광고주가 고른 값을 우리가 지웠으니 우리가 되돌린다.
--    case 순서는 lib/jobTaxonomy.ts 의 DEPARTMENT_RULES 와 같다(구체적인 것부터).
update public.jobs set specialty = case
    when t ~ '혈액종양|종양내과|항암'                    then '혈액종양내과'
    when t ~ '정신건강|정신과|정신의학|폐쇄병동|정신병원'   then '정신건강의학과'
    when t ~ '소아|청소년과'                            then '소아청소년과'
    when t ~ '산부인과|여성의학'                         then '산부인과'
    when t ~ '정형외과'                                then '정형외과'
    when t ~ '신경외과'                                then '신경외과'
    when t ~ '흉부외과'                                then '흉부외과'
    when t ~ '성형외과'                                then '성형외과'
    when t ~ '이비인후'                                then '이비인후과'
    when t ~ '비뇨'                                    then '비뇨기과'
    when t ~ '신경과'                                  then '신경과'
    when t ~ '피부과'                                  then '피부과'
    when t ~ '안과'                                    then '안과'
    when t ~* '마취과|마취통증|회복실|마취\s*(간호|실|파트|담당)|PACU' then '마취과/회복실'
    when t ~ '인공신장실|인공신장|투석실|투석\s*(간호|파트|담당|업무)' then '인공신장실'
    when t ~* '신생아실|신생아\s*(간호|케어|파트|담당)|NICU'  then '신생아실'
    when t ~* '중환자실|중환자\s*(간호|파트|담당)|\yICU\y'   then '중환자실'
    when t ~ '응급실|응급의료|응급센터'                    then '응급실'
    when t ~* '수술실|스크럽|scrub'                      then '수술실'
    when t ~ '분만실|분만장|분만센터|분만\s*(간호|업무|파트|담당|병동)|\yLDR\y' then '분만실'
    when t ~* '혈관조영|심혈관센터|angio'                 then '혈관조영실'
    when t ~ '내시경'                                   then '내시경실'
    when t ~ '검진센터|건진센터|건강검진센터|종합검진센터|건강증진센터|검진실|건진실|종합검진|건강검진\s*(간호|파트|담당|업무)|검진\s*간호' then '건강진단센터'
    when t ~ '주사실|주사전담'                            then '주사실'
    when t ~ '내과'                                     then '내과'
    when t ~ '외과'                                     then '외과'
    else null end
  from (
    select id as jid,
           coalesce(company_name,'') || ' ' || coalesce(title,'') || ' ' || coalesce(description,'') as t
    from public.jobs
  ) src
  where public.jobs.id = src.jid
    and public.jobs.source <> 'worknet'
    and public.jobs.specialty is null;

-- ── ② 워크넷: 상세를 다시 받아 사업내용까지 보고 채우게 한다 ───────────────
-- detail_fetched_at 을 비우면 다음 크론이 이 공고들의 상세를 다시 요청한다(route.ts:58).
-- 진료과가 비어 있는 것만 대상이라, 이미 값이 있는 공고는 재요청하지 않는다.
update public.jobs
set detail_fetched_at = null
where source = 'worknet' and status = 'open' and specialty is null;
