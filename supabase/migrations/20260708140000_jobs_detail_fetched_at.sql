-- 워크넷 상세 API(210D01) 보강 완료 마커.
-- 내용 컬럼(apply_detail 등)이 비어도 1회 보강 후 재호출하지 않도록 전용 마커 — 상세 예산 starvation 방지.
alter table public.jobs add column if not exists detail_fetched_at timestamptz;
