-- 🧓 요양·간병 공고를 jobs 로 합친다 (2/2) — care_jobs 의 행을 jobs 로 옮기고 표·RPC 를 지운다.
--
-- 🔴 **새 코드 배포 뒤에** 적용한다. 옛 코드는 is_care 를 몰라서, 먼저 옮기면 간호 목록(/jobs)에 1만 건이 섞인다.
-- 🔴 적용한 뒤에는 **옛 코드로 되돌리지 않는다**(Vercel 롤백 포함) — 옛 간호 크론(sync-worknet)은 요양 행을 가리지 않아
--    6시간마다 1만 건을 마감시키고, 옛 /jobs 는 요양 공고를 섞어 보이며, 옛 sync-care·/care-jobs 는 지운 표를 찾다 실패한다.
-- 🔴 적용 직후 sync-care 를 한 번 돌린다 — care_jobs 에는 기관 종별(facility_type) 칸이 없어 옮겨지지 않는다. 크론이 산업분류로
--    채워야 /care-jobs 의 기관 종별 칩이 '미지정' 하나로 뭉치지 않는다.
-- 직종은 워크넷 직종코드로 정한다 — 5502xx 간병인, 그 밖(5501xx 요양보호사·5503xx 생활지원사)은 요양보호사
-- (앱의 짝: lib/jobTaxonomy careCategoryFromJobCode). 좌표·이미 받은 상세 본문도 그대로 옮긴다(카카오·워크넷을 다시 안 부른다).
-- 겹치는 행(같은 공고번호가 예전 간호 수집분으로 이미 있는 것 — 실측 1건, 마감 상태)은 요양 쪽 값으로 갱신해 다시 연다.
-- 그 행에 예전에 받아 둔 본문(같은 공고번호라 같은 공고의 본문이다)은 지키고, 요양 쪽에 있을 때만 덮는다(coalesce).
insert into public.jobs (
  source, external_id, external_url, status, hospital_id, company_name, title, job_category, employment_type,
  location, sido, sigungu, salary_text, posted_at, deadline, lat, lng, geocoded_at,
  description, recruit_count, shift_type, benefits, apply_detail, manager_name, manager_phone, detail_fetched_at
)
select 'worknet', c.external_id, c.external_url, 'open', null, c.company_name, c.title,
       case when c.jobs_cd like '5502%' then '간병인' else '요양보호사' end,
       c.employment_type, c.location, c.sido, c.sigungu, c.salary_text,
       (c.posted_at::timestamp at time zone 'UTC'), -- 간호 수집과 같은 꼴(등록일 00:00Z — sync-worknet toIso)
       c.deadline, c.lat, c.lng, c.geocoded_at,
       c.description, c.recruit_count, c.shift_type, c.benefits, c.apply_detail, c.manager_name, c.manager_phone, c.detail_fetched_at
from public.care_jobs c
on conflict (source, external_id) do update set
  status = 'open', company_name = excluded.company_name, title = excluded.title, job_category = excluded.job_category,
  employment_type = excluded.employment_type, location = excluded.location, sido = excluded.sido, sigungu = excluded.sigungu,
  salary_text = excluded.salary_text, posted_at = excluded.posted_at, deadline = excluded.deadline,
  lat = excluded.lat, lng = excluded.lng, geocoded_at = excluded.geocoded_at, external_url = excluded.external_url,
  description = coalesce(excluded.description, public.jobs.description),
  detail_fetched_at = coalesce(excluded.detail_fetched_at, public.jobs.detail_fetched_at);

-- 다 옮겨졌는지(공고 수·좌표 수가 원본과 같은지) 확인한 **뒤에만** 지운다. 지우기도 이 블록 안에서 한다 —
-- 실행기가 문장마다 따로 커밋하더라도(psql -f 등) 확인이 실패하면 표가 남는다.
do $$
declare total bigint; moved bigint; geo_src bigint; geo_moved bigint;
begin
  select count(*), count(*) filter (where geocoded_at is not null) into total, geo_src from public.care_jobs;
  select count(*), count(*) filter (where j.geocoded_at is not null) into moved, geo_moved
    from public.jobs j join public.care_jobs c on c.external_id = j.external_id
   where j.source = 'worknet' and j.job_category in ('요양보호사', '간병인') and j.status = 'open';
  if moved < total or geo_moved < geo_src then
    raise exception 'care_jobs → jobs 옮기기 모자람: 공고 % / %, 좌표 % / %', moved, total, geo_moved, geo_src;
  end if;
  drop function if exists public.care_job_region_list(text);
  drop table public.care_jobs;
end $$;

notify pgrst, 'reload schema';
