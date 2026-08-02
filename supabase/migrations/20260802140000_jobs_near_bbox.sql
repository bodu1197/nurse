-- 📍 "내 주변" — talent(C:\dev\talent) 의 job_posts 방식을 그대로 이식(오너 지시 2026-08-02).
-- RPC 하버사인 정렬(20260802120000/130000) 대신 bounding-box 필터로 바꾼다 — 거리순 정렬·km 배지 없이
-- "반경 안이냐"만 걸고, 기존 정렬(featured_until desc, posted_at desc)은 그대로 둔다. RPC 는 걷어낸다.

drop function if exists public.nurse_jobs_nearby(double precision, double precision, text, text, text, text, text, text, text, text, int, int);
drop function if exists public.nurse_jobs_nearby(double precision, double precision, text, text, text, text, text, text, text, text, double precision, int, int);

-- geocode 재시도 방지 플래그 — 좌표 없음(주소 검색 실패)과 미시도를 구분. 없으면 워크넷 동기화가
-- 실패한 주소를 6시간마다 영원히 재시도한다(API 호출 낭비). 시도했으면 성공/실패 관계없이 set.
alter table public.jobs add column if not exists geocoded_at timestamptz;

-- bounding-box 범위 스캔용(lat BETWEEN .. AND lng BETWEEN ..) — open 글만, 좌표 있는 것만.
create index if not exists jobs_geo_idx
  on public.jobs (lat, lng)
  where status = 'open' and lat is not null;
