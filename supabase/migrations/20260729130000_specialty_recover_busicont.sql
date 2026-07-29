-- 🔧 앞 정리(20260729120000)가 사업내용(busiCont) 근거로 맞춘 정상값까지 지웠다. 되살린다.
--
-- 무엇이 문제였나(/review8 지적, 실측):
--   진료과는 제목·직무내용뿐 아니라 상세의 **사업내용(busiCont)** 으로도 맞춘다(예: 사업내용이
--   "정신병원" → 정신건강의학과). 그런데 busiCont 는 컬럼에 저장하지 않는다.
--   그래서 SQL 정리가 `제목 || 직무내용` 만 보고 "근거 없음" 으로 판정해 **정상값까지 지웠다.**
--   앞 마이그레이션(…110000) 주석 ② 가 경고한 실수를 그대로 반복했다.
--
-- 상세는 공고당 한 번만 받으므로(detail_fetched_at) 크론이 스스로 복구하지 못한다.
--   → 이번 정리로 비워졌을 가능성이 있는 공고의 detail_fetched_at 을 비워 상세를 다시 받게 한다.
--
-- ⚠️ 이번엔 안전하다: 코드가 이미 새 규칙으로 배포돼 있고(stillValid + finalDesc),
--    sync 가 "이미 보강된 공고는 저장값을 지킨다" 로 바뀌어 같은 사고가 반복되지 않는다.
--
-- 함께 고치는 것:
--   · 산후조리원 UPDATE 에 source 조건이 빠져 있었다(광고주 값을 건드릴 뻔했다 — 실제 피해는 없었다)
--   · '주사실' 규칙이 TS(`주사실`)와 SQL(`주사실|주사전담`)에서 달랐다 → TS 에 맞춘다
--   · `\y`(PG 단어경계)는 한글을 단어문자로 봐서 "서울ICU센터" 를 매칭하지 않는다. JS `\b` 는
--     매칭한다 — 두 쪽이 갈린다. SQL 을 JS 와 같게 문자 클래스로 바꾼다.
--
-- ⚠️ 프로덕션 수동 적용(Management API). idempotent.

-- ── 1. 상세를 다시 받아 사업내용까지 보고 채우게 한다 ──────────────────────
-- 대상: 진료과가 비어 있는 **게시 중** 워크넷 공고. 마감된 공고는 화면에 안 나오므로 제외한다
-- (재수집 비용만 든다). 실행당 1,500건 상한이라 하루면 끝난다.
update public.jobs
set detail_fetched_at = null
where source = 'worknet' and status = 'open' and specialty is null;

-- ── 2. 산후조리원 — source 조건 보강 ──────────────────────────────────────
-- 광고주가 고른 값을 우리가 덮지 않는다. 워크넷 공고만 이름으로 바로잡는다.
update public.jobs set facility_type = '산후조리원'
where source = 'worknet'
  and coalesce(company_name, '') ~ '산후\s*조리'
  and facility_type is distinct from '산후조리원';

-- ── 3. TS 와 어긋났던 두 규칙을 맞춘다 ────────────────────────────────────
-- '주사실': SQL 에만 있던 '주사전담' 을 뺀다(TS 는 /주사실/ 뿐이다).
update public.jobs set specialty = null
where source = 'worknet' and specialty = '주사실'
  and coalesce(title,'') || ' ' || coalesce(description,'') !~ '주사실';

-- 'ICU'·'LDR': \y 는 한글을 단어문자로 봐 "서울ICU센터" 를 놓친다(JS \b 는 잡는다).
-- 두 쪽을 같게 하려고 영숫자·밑줄만 경계로 보는 문자 클래스를 쓴다.
update public.jobs set specialty = null
where source = 'worknet' and specialty = '중환자실'
  and coalesce(title,'') || ' ' || coalesce(description,'')
      !~* '중환자실|중환자\s*(간호|파트|담당)|(^|[^A-Za-z0-9_])ICU([^A-Za-z0-9_]|$)';
update public.jobs set specialty = null
where source = 'worknet' and specialty = '분만실'
  and coalesce(title,'') || ' ' || coalesce(description,'')
      !~ '분만실|분만장|분만센터|분만\s*(간호|업무|파트|담당|병동)|(^|[^A-Za-z0-9_])LDR([^A-Za-z0-9_]|$)';
