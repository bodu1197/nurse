-- 병원 이름 실시간 검색용 트라이그램 인덱스.
-- 리뷰·병원등록에서 이름을 부분 검색(ilike '%한일%')하는데, 병원이 8만 개라
-- 인덱스가 없으면 매 타이핑마다 전체 순차 스캔이 된다.
create extension if not exists pg_trgm;
create index if not exists hospitals_name_trgm on public.hospitals using gin (name gin_trgm_ops);
