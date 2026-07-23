-- 이력서는 기본 비공개로 만든다.
--
-- 지금은 저장 코드(saveResume)가 is_public 을 항상 명시해서 가려져 있을 뿐이고,
-- 다른 경로(시드 스크립트·수동 insert·앞으로 만들 임포트)로 행이 생기면
-- 그 순간 이름·휴대폰이 광고 병원에게 바로 공개된다.
-- 개인정보는 "켜야 공개"가 기본이어야 한다.
alter table public.resumes alter column is_public set default false;
