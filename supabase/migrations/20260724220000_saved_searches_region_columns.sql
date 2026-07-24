-- 🗂 저장검색에 정규화 지역(sido/sigungu) 추가 — 지역 드롭다운(sido/sigungu eq)으로 검색한 조건을
--    같은 정규화 경로로 재생하기 위함. 종전 location(자유텍스트 ilike) 컬럼만으론 canonical 시도명
--    "경기도"가 워크넷 location "경기 성남시"와 ilike 불일치라 재생 결과가 0건이 된다.
-- ⚠️ 프로덕션 수동 적용(Management API). idempotent. saved_searches 는 소유자 전용(RLS profile_id).

alter table public.saved_searches add column if not exists sido text;
alter table public.saved_searches add column if not exists sigungu text;

comment on column public.saved_searches.location is
  '⚠️ 레거시 자유텍스트 지역(구 검색바). 신규 저장은 sido/sigungu 사용 — 재생 시 정규화 eq 경로.';
