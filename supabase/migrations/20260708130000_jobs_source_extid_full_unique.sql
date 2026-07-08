-- 워크넷 대량 채용정보 upsert 지원.
-- 기존 부분 유니크 인덱스(WHERE external_id is not null)는 PostgREST onConflict가 못 써서
-- 전체 유니크 인덱스로 교체. direct 공고는 external_id가 null이라(null끼리는 서로 다름) 다중 허용 — 기존 동작 유지.
-- 마감일은 기존 jobs.deadline(date, 20260627100000) 재사용 — 신규 컬럼 없음.
drop index if exists public.jobs_source_extid_idx;
create unique index jobs_source_extid_idx on public.jobs(source, external_id);
