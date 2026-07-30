-- 자기소개가 단말마인 이력서를 비공개로 돌린다 (오너 지시 2026-07-30).
--
-- 기준: "점, 기호, 안녕(10자 이하) => 모두 무의미하다" — 오너 원문.
--   기호·공백·자음낱자(ㅇㅇ, ^^, ㆍ)를 빼고 **의미 있는 글자**만 세서 10자 이하면 숨긴다.
--   기호를 세지 않는 이유: 점 30개로 글자수 제한을 넘길 수 있기 때문이다.
--   잡히는 것: '.'(70건) 'ㅇㅇ' '^^' '첨부파일' '안녕하세요' '열심히하겠습니다' '최선을다하겠습니다'
--   남는 것:   '간호조무사 성실히 일합니다' '종합병원 간호조무사 5년 근무' '늘 겸손한 자세로 성실히 배우겠습니다'
--
-- 지우지 않는다. is_public 만 내린다 — 본인이 자기소개를 제대로 쓰고 이력서 화면의
-- 공개 스위치를 다시 켜면 그대로 돌아온다(saveResume 은 기존 이력서의 is_public 에 손대지 않는다).
--
-- 🔴 트리거를 끄고 돈다. resumes_set_updated_at 이 돌면 이 수백 건의 updated_at 이 전부 오늘로
--    밀리고, 인재 목록·홈이 updated_at 내림차순이라 **숨겨야 할 이력서가 목록 맨 앞을 차지한다**.
--    2026-07-30 역슬래시-n 정리에서 정확히 이 사고를 냈다(마이그레이션 20260730160000 참고).
alter table public.resumes disable trigger resumes_set_updated_at;

update public.resumes
   set is_public = false
 where is_public
   and length(regexp_replace(coalesce(intro, ''), '[^가-힣a-zA-Z0-9]', '', 'g')) <= 10;

alter table public.resumes enable trigger resumes_set_updated_at;
