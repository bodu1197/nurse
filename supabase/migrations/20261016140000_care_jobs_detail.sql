-- 🧓 요양·간병 공고 상세 페이지(/care-jobs/[id]) — 오너 지시 2026-10-16:
--   "카드를 클릭하면 페이지가 나와야지 다른 곳으로 보내면 안 되지" · "기존 구인 공고와 똑같은 기능이 되도록, 지원도 되게".
--
-- 20261016100000 의 "상세 페이지를 만들지 않는다" 결정을 뒤집는다. 본문·연락처는 간호 공고(sync-worknet)와 같은 워크넷
-- 상세 API(210D01)에서 받되, 1만 건을 크론으로 미리 받지 않고 **누군가 그 공고를 여는 순간** 한 번 받아 저장한다
-- (lib/data/careJobs getCareJob — detail_fetched_at 이 그 표식, jobs.detail_fetched_at 과 같은 계약).
--
-- 기관이 직접 올리는 요양·간병 공고는 이 표가 아니라 jobs 에 들어간다(직종 = 요양보호사·간병인, lib/jobTaxonomy CARE_CATEGORIES).
-- 등록·결제·상세·저장·지원이 전부 거기 있어서 한 벌 더 만들 이유가 없다. /care-jobs 와 홈 요양 탭이 두 표를 합쳐 보여 준다.
alter table public.care_jobs
  add column if not exists employment_type   text,                    -- 목록 API empTpCd·급여형태 → 정규직/계약직/파트타임(worknet.ts deriveEmploymentType)
  add column if not exists description       text,                    -- 상세 API jobCont(직무 내용)
  add column if not exists recruit_count     integer,
  add column if not exists shift_type        text,                    -- 근무시간(workdayWorkhrCont)
  add column if not exists benefits          text[] not null default '{}',
  add column if not exists apply_detail      text,                    -- 전형·제출서류·접수방법·자격·우대 — 담당자 연락처가 섞여 있어 로그인 뒤에만 보인다
  add column if not exists manager_name      text,
  add column if not exists manager_phone     text,
  add column if not exists detail_fetched_at timestamptz;             -- 상세를 마지막으로 물어본 시각(실패 포함). null = 아직 아무도 안 열어 봄

-- 🔴 실패도 찍는다. 성공만 찍으면 워크넷 장애·마감(원문 없음) 공고는 방문마다 다시 묻느라 매번 타임아웃을 기다린다.
--    본문이 비어 있으면 하루 지난 뒤 한 번 더 묻는다(lib/careSync needsCareDetail).
comment on column public.care_jobs.detail_fetched_at is
  '워크넷 상세(210D01)를 마지막으로 물어본 시각(실패 포함) — 상세 페이지가 열릴 때 채운다(lib/data/careJobs withCareDetail). 본문이 비면 하루 뒤 재시도.';

-- RLS·정책은 그대로다(공개 읽기, 쓰기는 service_role). 새 인덱스 없음 — 상세는 기본키(external_id)로만 찾는다.
