-- 워크넷 구인광고를 병원 명부(심사평가원)에서 물리적으로 분리한다.
-- 원칙: 병원 정보(hospitals)와 구인 광고(jobs)는 다른 것이다. 이름이 같아도 같은 데이터가 아니다.
--  · 심사평가원 데이터 = 병원 정보 → hospitals (리뷰·병원등록의 기본자산)
--  · 워크넷 + 수동 유료광고 = 구인 광고 → jobs (홈에 뜨는 "광고")
-- 그동안 워크넷 크론이 회사명마다 hospitals에 가짜 병원 레코드를 만들어 명부를 오염시켰다.
-- 이제 워크넷 공고는 회사명을 광고 자체(jobs.company_name)에 텍스트로 갖고, 명부에는 만들지 않는다.

-- 1) 광고가 회사명을 스스로 갖게 한다(워크넷 공고는 병원 명부에 안 붙으므로).
alter table public.jobs add column if not exists company_name text;

-- 2) 워크넷 공고: 지금 붙어있는 가짜 병원명을 광고 자체로 이관.
update public.jobs j
set company_name = h.name
from public.hospitals h
where j.hospital_id = h.id and j.source = 'worknet' and j.company_name is null;

-- 3) 워크넷 광고는 명부를 참조하지 않는다 → hospital_id nullable + 링크 끊기.
alter table public.jobs alter column hospital_id drop not null;
update public.jobs set hospital_id = null where source = 'worknet';

-- 4) 워크넷 가짜 병원 제거. 참조 0건 확인: reviews·claim·profiles.claimed·ad_orders·비워크넷 공고 모두 0.
delete from public.hospitals where source = 'worknet';
