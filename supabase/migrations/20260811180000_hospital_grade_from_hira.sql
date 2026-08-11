-- 🏥 병원 명부에 **종별(심사평가원 clCdNm)** 을 저장한다 — "상급종합" / "종합병원" / "병원" / "요양병원" …
--
-- 왜 필요한가:
-- 공고의 기관 종별(jobs.facility_type)을 지금은 **워크넷 산업분류(KSIC)로 추정**한다. 그런데 KSIC 에는
-- '상급종합' 이라는 개념이 아예 없다. 그래서 FACILITY_TYPES 에 '상급종합병원' 칸이 있는데도 **영원히 0건**이고,
-- 칩이 화면에 그려지지 않는다(오너 지적 2026-08-11: "상급종합병원 카테고리를 만들어 주면 깔끔하지 않을까").
-- 잡알리오 수집분(국립대병원)은 산업분류조차 없어 종별이 전부 비어 있었다.
--
-- 심사평가원 API 는 병원마다 clCdNm 을 정확히 준다(실측 표본 10,000건: 상급종합 47 — 전국 상급종합병원 수와 일치).
-- 우리가 그 필드를 안 받아 버리고 있었을 뿐이다. 원본 문자열을 그대로 저장하고, 우리 표(FACILITY_TYPES)로의
-- 번역은 앱(jobTaxonomy.facilityFromClCd)에서 한다 — 번역 규칙을 고칠 때마다 8만 건을 재수집하지 않으려고.
alter table public.hospitals add column if not exists cl_cd_nm text;
comment on column public.hospitals.cl_cd_nm is
  '심사평가원 종별코드명(clCdNm): 상급종합·종합병원·병원·요양병원·정신병원·의원·치과병원·한방병원·보건소 등. 원본 그대로 저장한다.';

-- 공고 회사명 → 명부 이름으로 종별을 찾는다. 지금 name 에는 gin_trgm(부분검색용)만 있어서
-- **정확일치(=) 조회에 못 쓴다.** 수집 크론이 실행마다 수천 개 이름을 = 로 찾으므로 btree 가 필요하다.
-- (trgm 과 용도가 달라 중복 인덱스가 아니다 — advisor 의 duplicate_index 에 걸리지 않는다.)
create index if not exists hospitals_name_idx on public.hospitals(name);
