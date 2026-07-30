-- 보정 작업이 잘못 밀어올린 updated_at 되돌리기(일회성).
--
-- 🔴 앞선 시도에서 조건을 LIKE 로 써서(백슬래시가 이스케이프로 먹혀 "letter n" 을 뜻했다)
--    내용이 바뀌지 않는 33행까지 UPDATE 가 돌았고, 트리거가 그 행들의 updated_at 을 오늘로 밀었다.
--    인재 목록·홈 '구직 현황'이 updated_at 내림차순이라 그 33건이 메인 첫 화면을 통째로 차지했다.
--
-- ⚠️ 행별 원래 값은 복구할 수 없다 — 이관 배치 시각이 18종이었고 어느 행이 어느 배치였는지 기록이 없다.
--    거짓으로 "최신"처럼 보이지 않게 **이관 배치 중 가장 이른 시각**으로 되돌린다(승격하지 않는 쪽).
alter table public.resumes disable trigger resumes_set_updated_at;

update public.resumes
set updated_at = (select min(updated_at) from public.resumes where updated_at < timestamptz '2026-07-29')
where updated_at >= timestamptz '2026-07-30';

alter table public.resumes enable trigger resumes_set_updated_at;
