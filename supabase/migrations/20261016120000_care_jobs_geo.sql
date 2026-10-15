-- 📍 요양보호사 공고에도 "내 주변"(오너 지시 2026-10-16: "내주변 기능도 적용이 되어야 한다").
--
-- 간호 공고(jobs, 20260802140000)와 같은 방식 — 좌표는 크론(sync-care)이 카카오 지오코딩으로 미리 채우고,
-- 화면(getCareJobs)은 bounding-box(lat/lng 범위)로 거른다. 거리순 정렬·km 배지는 없다(반경 안이냐만).
alter table public.care_jobs
  add column if not exists lat double precision,
  add column if not exists lng double precision,
  -- 지오코딩 시도 표식 — 주소 검색 실패도 "시도했음"으로 남겨, 매 실행 같은 주소를 영원히 재시도하지
  -- 않는다(jobs.geocoded_at 과 같은 계약). null = 아직 안 해 봄.
  add column if not exists geocoded_at timestamptz;

-- bounding-box 범위 스캔용(lat BETWEEN .. AND lng BETWEEN ..) — 좌표 있는 행만.
create index if not exists care_jobs_geo_idx on public.care_jobs (lat, lng) where lat is not null;
