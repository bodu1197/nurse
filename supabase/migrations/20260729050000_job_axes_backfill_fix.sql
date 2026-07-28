-- 🔧 앞 마이그레이션(20260729040000)의 빠진 자리 메우기.
--
-- 무엇이 빠졌나(/review8 지적, 실측 확인):
--   앞 마이그레이션 :42 는 **전 source** 의 '병동'·'외래' 를 NULL 로 비웠는데(둘 다 진료과가 아니라
--   근무 위치라서), 진짜 진료과를 다시 찾는 백필 :102 는 `source='worknet'` 한정이었다.
--   그래서 광고주가 고른 값이 사라진 자체 광고 4건이 **모든 진료과 칩에서 빠졌다**:
--     · 힘내라정형외과병원 "병동 간호사 구함"        → 정형외과로 살릴 수 있다
--     · 우리들내과 "외래 간호사, 방문간호사"          → 내과
--     · 우리들내과 "주 2-3회 근무할 방문간호사 구인"   → 내과
--     · 위드힘병원 "암전문 … 주사전담상주"            → 주사실
--
-- ⚠️ 프로덕션 수동 적용(Management API). idempotent — specialty 가 비어 있을 때만 채운다.
--    광고주가 직접 고른 값은 절대 덮지 않는다.

-- 회사명까지 본다. 자체 광고는 "우리들내과"처럼 **회사명에 진료과가 들어 있는** 경우가 많은데
-- 워크넷 백필은 제목·본문만 봤다.
-- 🔴 case 순서는 lib/jobTaxonomy.ts 의 DEPARTMENT_RULES 와 같아야 한다(구체적인 것부터).
--    'OR'(operating room)은 뺐다 — 본문에 "camc.or.kr" 같은 주소가 있으면 전부 수술실이 된다(실측).
update public.jobs set specialty = case
    when t ~ '혈액종양|종양내과|항암|암전문'          then '혈액종양내과'
    when t ~ '정신건강|정신과|정신의학|폐쇄병동|정신병원' then '정신건강의학과'
    when t ~ '소아|청소년과'                        then '소아청소년과'
    when t ~ '산부인과|여성의학'                     then '산부인과'
    when t ~ '정형외과'                            then '정형외과'
    when t ~ '신경외과'                            then '신경외과'
    when t ~ '흉부외과'                            then '흉부외과'
    when t ~ '성형외과'                            then '성형외과'
    when t ~ '이비인후'                            then '이비인후과'
    when t ~ '비뇨'                                then '비뇨기과'
    when t ~ '신경과'                              then '신경과'
    when t ~ '피부과'                              then '피부과'
    when t ~ '안과'                                then '안과'
    when t ~* '마취|회복실|PACU'                    then '마취과/회복실'
    when t ~ '인공신장|투석'                         then '인공신장실'
    when t ~* '중환자|ICU'                         then '중환자실'
    when t ~ '응급실|응급의료|응급센터'                then '응급실'
    when t ~* '수술실|스크럽|scrub'                  then '수술실'
    when t ~ '분만'                                then '분만실'
    when t ~* '신생아|NICU'                         then '신생아실'
    when t ~* '혈관조영|심혈관센터|angio'             then '혈관조영실'
    when t ~ '내시경'                              then '내시경실'
    when t ~ '건강검진|검진센터|건진|종합검진'          then '건강진단센터'
    when t ~ '주사실|주사전담'                        then '주사실'
    when t ~ '내과'                                then '내과'
    when t ~ '외과'                                then '외과'
    else null end
  from (
    select id as jid,
           coalesce(company_name,'') || ' ' || coalesce(title,'') || ' ' || coalesce(description,'') as t
    from public.jobs
  ) src
  where public.jobs.id = src.jid
    and public.jobs.source <> 'worknet'
    and public.jobs.specialty is null;

-- 기관 종별도 같은 이유로 자체 광고에는 아직 비어 있다(앞 마이그레이션은 worknet 한정이었다).
update public.jobs set facility_type = case
    when c ~ '요양병원'                          then '요양병원'
    when c ~ '요양원|주간보호|실버|데이케어|노인복지|재가' then '요양원·주간보호'
    when c ~ '대학교병원|대학병원|의료원'            then '상급종합병원'
    when c ~ '종합병원'                          then '종합병원'
    when c ~ '치과'                             then '치과'
    when c ~ '한방병원|한의원'                     then '한방병원'
    when c ~ '보건소|보건지소|보건진료'              then '보건소'
    when c ~ '검진|건진'                          then '검진센터'
    when c ~ '병원'                              then '병원'
    when c ~ '의원|클리닉'                        then '의원'
    else null end
  from (select id as jid, coalesce(company_name,'') as c from public.jobs) src2
  where public.jobs.id = src2.jid
    and public.jobs.source <> 'worknet'
    and public.jobs.facility_type is null;
