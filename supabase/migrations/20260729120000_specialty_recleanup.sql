-- 🔧 크론이 되살려 놓은 오분류를 다시 지운다. 이번이 마지막이어야 한다.
--
-- 무슨 일이 있었나(2026-07-29):
--   20260729100000 으로 "요양원의 분만실·건강진단센터" 를 정리했는데, 몇 시간 뒤 오너가
--   똑같은 화면을 다시 보내왔다. 확인해 보니 크론(하루 4회)이 1,667건을 갱신하면서
--   지운 값을 그대로 되살렸다.
--
--   원인은 둘이었다:
--     ① 정리하면서 detail_fetched_at 을 비웠다 → 크론이 상세를 다시 받아 **그 시점의 배포 코드**
--        (아직 옛 규칙)로 다시 분류했다.
--     ② 더 근본적으로, sync 가 `추론값 ?? 저장값` 이라 **규칙을 고쳐도 옛 값이 영원히 살아남았다.**
--
--   ②는 코드로 막았다(sync-worknet/route.ts + jobTaxonomy.stillValid):
--     · 상세를 이번에 받았으면 지금 규칙이 본 것이 정답 — null 이면 null 로 둔다
--     · 상세를 못 받았으면 저장값을 쓰되, **지금 규칙으로 설명되지 않으면 버린다**
--   그래서 이 정리 이후로는 크론이 돌수록 오히려 깨끗해진다.
--
-- 🔴 detail_fetched_at 은 이번엔 건드리지 않는다. 비우면 상세를 다시 받으러 가고, 그 사이
--    배포가 밀리면 같은 사고가 반복된다. 새 코드가 뜬 뒤에는 stillValid 가 알아서 걷어낸다.
--
-- ⚠️ 프로덕션 수동 적용(Management API). idempotent.
-- 🔴 source='worknet' 한정 — 광고주가 직접 고른 값은 절대 건드리지 않는다(앞서 실수했다).

-- 지금 규칙으로 설명되지 않는 값을 비운다. 규칙 문자열은 lib/jobTaxonomy.ts 의
-- DEPARTMENT_RULES 와 같아야 한다(한쪽만 고치면 다시 어긋난다).
update public.jobs set specialty = null
where source = 'worknet' and specialty is not null
  and coalesce(title,'') || ' ' || coalesce(description,'') !~* case specialty
    when '혈액종양내과'  then '혈액종양|종양내과|항암'
    when '정신건강의학과' then '정신건강|정신과|정신의학|폐쇄병동|정신병원'
    when '소아청소년과'  then '소아|청소년과'
    when '산부인과'     then '산부인과|여성의학'
    when '정형외과'     then '정형외과'
    when '신경외과'     then '신경외과'
    when '흉부외과'     then '흉부외과'
    when '성형외과'     then '성형외과'
    when '이비인후과'   then '이비인후'
    when '비뇨기과'     then '비뇨'
    when '신경과'       then '신경과'
    when '피부과'       then '피부과'
    when '안과'         then '안과'
    when '마취과/회복실' then '마취과|마취통증|회복실|마취\s*(간호|실|파트|담당)|PACU'
    when '인공신장실'   then '인공신장실|인공신장|투석실|투석\s*(간호|파트|담당|업무)'
    when '신생아실'     then '신생아실|신생아\s*(간호|케어|파트|담당)|NICU'
    when '중환자실'     then '중환자실|중환자\s*(간호|파트|담당)|\yICU\y'
    when '응급실'       then '응급실|응급의료|응급센터'
    when '수술실'       then '수술실|스크럽|scrub'
    when '분만실'       then '분만실|분만장|분만센터|분만\s*(간호|업무|파트|담당|병동)|\yLDR\y'
    when '혈관조영실'   then '혈관조영|심혈관센터|angio'
    when '내시경실'     then '내시경'
    when '건강진단센터'  then '검진센터|건진센터|건강검진센터|종합검진센터|건강증진센터|검진실|건진실|종합검진|건강검진\s*(간호|파트|담당|업무)|검진\s*간호'
    when '주사실'       then '주사실|주사전담'
    when '내과'         then '내과'
    when '외과'         then '외과'
    -- 목록 밖 값(폐기된 옛 어휘)은 건드리지 않는다. '.' 은 어떤 문자열에도 매칭되므로
    -- `!~* '.'` 는 항상 거짓 → 이 행들은 UPDATE 대상에서 빠진다(실측 확인).
    -- 지금은 그런 값이 0건이고, 있더라도 조용히 지우기보다 남겨서 눈에 띄게 두는 편이 낫다.
    else '.'
  end;

-- 산후조리원도 다시 붙인다(크론이 산업분류로 되돌렸을 수 있다).
update public.jobs set facility_type = '산후조리원'
where coalesce(company_name, '') ~ '산후\s*조리' and facility_type is distinct from '산후조리원';
