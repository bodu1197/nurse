-- 🧓 요양보호사·간병 구인공고 — 워크넷 직종코드 5501xx·5502xx. **간호사 공고(jobs)와 별도 표**다.
--
-- 왜 따로 두나(오너 지시 2026-10-16: "제외된 것을 탭을 별도로 만들어서 홈페이지에 표시"):
--   2026-07-25 에 워크넷 수집을 직종코드 방식으로 바꾸면서 요양보호사를 뺐다 — "간호" 키워드 결과의
--   76% 가 요양보호사라 간호사 사이트가 요양보호사 사이트가 됐기 때문이다. 지금 워크넷의 요양보호사·간병인
--   공고는 고유 약 1만 700건(코드별 합계는 2만이 넘지만 같은 공고가 여러 코드에 걸린다)으로 우리 간호 공고
--   (노출 1,400건)의 7~8배다. jobs 에 섞으면 목록·칩·AI 자동매치·건수·사이트맵이 전부 요양보호사로 덮인다.
--   그래서 표를 나누고, 간호 쪽 질의는 한 줄도 건드리지 않는다.
--
-- [정정 2026-10-16 오후] 아래 "상세 페이지 없음" 결정은 20261016140000 에서 뒤집었다 — /care-jobs/[id] 상세가 생겼고
-- 본문·연락처 컬럼을 더했다(오너: "카드를 클릭하면 페이지가 나와야지 다른 곳으로 보내면 안 되지"). 아래는 당시 기록.
-- 상세 페이지를 만들지 않는다 — 카드가 워크넷 원문으로 바로 간다. 그래서 본문·연락처 컬럼이 없고(좌표는
-- 20261016120000 에서 "내 주변"용으로 더했다), 워크넷에서 내려간 공고는 그냥 지운다(404 가 될 우리 URL 이 없다).
-- 색인 URL 도 /care-jobs 하나뿐이라 크롤 대상 URL 이 1만 개 늘지 않는다(봇 비용).
create table if not exists public.care_jobs (
  -- 워크넷 채용공고번호(wantedAuthNo). 그 자체가 유일 키라 따로 id 를 두지 않는다.
  external_id  text primary key,
  jobs_cd      text not null,                     -- 대표 직종코드(550100 요양보호사 …)
  title        text not null,
  company_name text,
  location     text,                              -- 워크넷 region 원문("서울 강남구")
  sido         text,                              -- 정규화 시도(lib/jobRegion) — 지역 필터용
  sigungu      text,
  salary_text  text,
  posted_at    date not null,                     -- 워크넷 등록일(regDt)
  deadline     date,                              -- null = 상시
  external_url text not null,                     -- 워크넷 원문 링크
  -- 이번 수집에서 본 시각. 수집 뒤 이 값이 수집 시작보다 이른 행 = 워크넷에서 내려간 공고 → 삭제.
  last_seen_at timestamptz not null default now(),
  created_at   timestamptz not null default now()
);

-- 목록 정렬(최신순 + 유일 키)과 지역 필터용. 둘은 선두 컬럼이 달라 중복 인덱스가 아니다(advisor).
create index if not exists care_jobs_list_idx   on public.care_jobs (posted_at desc, external_id desc);
create index if not exists care_jobs_region_idx on public.care_jobs (sido, sigungu, posted_at desc, external_id desc);

-- 🔴 RLS: 공개 구인공고라 누구나 읽는다. 쓰기는 크론(service_role)이 RLS 를 우회해서 한다 — 쓰기 정책 없음.
alter table public.care_jobs enable row level security;
drop policy if exists care_jobs_public_read on public.care_jobs;
create policy care_jobs_public_read on public.care_jobs for select using (true);

comment on table public.care_jobs is
  '요양보호사·간병 구인(워크넷 5501xx·5502xx). 간호사 공고(jobs)와 분리 — /care-jobs 와 홈 탭이 읽는다. 크론 /api/cron/sync-care.';

-- 지역 계단(시도 → 시군구) 건수. p_sido 가 비면 시도별, 있으면 그 시도의 시군구별.
-- nurse_job_sido_list 와 같은 모양(name, cnt)이라 RegionPicker 를 그대로 쓴다.
-- security invoker(기본) — 위 공개 읽기 정책을 그대로 탄다.
create or replace function public.care_job_region_list(p_sido text default '')
returns table(name text, cnt bigint)
language sql
stable
set search_path to 'public'
as $$
  select case when coalesce(p_sido, '') = '' then c.sido else c.sigungu end, count(*)
  from public.care_jobs c
  where (coalesce(p_sido, '') = '' and c.sido is not null)
     or (coalesce(p_sido, '') <> '' and c.sido = p_sido and c.sigungu is not null)
  group by 1
  order by 2 desc
$$;
grant execute on function public.care_job_region_list(text) to anon, authenticated;
