-- 🗂 jobs_listed 에 병원 이름을 싣는다 — 「공고 관리」 검색이 조용히 잘리던 것을 없앤다.
--
-- 무엇이 문제였나(getAdList, lib/data/adminLists.ts):
--   병원명으로 공고를 찾을 때 hospitals 를 **먼저** 뒤져 id 를 300개까지 모은 뒤
--   `hospital_id=in.(uuid,uuid,…)` 로 넘겼다. 두 가지가 동시에 걸린다 —
--   ① 300건에서 잘린다. 코드에 console.warn 이 있지만 **화면은 아무 말도 안 한다** →
--      "우리요양병원" 처럼 흔한 말로 찾으면 뒤쪽 병원의 공고가 이유 없이 안 나온다.
--   ② uuid 300개면 주소가 11KB 다. PostgREST 앞단(Kong)의 헤더 상한에 걸리면 414 로 죽는다.
--      같은 부류의 사고를 방금 「지원 내역」에서 뷰로 없앴다(20260806120000) — 여기도 같게 맞춘다.
--
-- 🔴 CREATE OR REPLACE VIEW 는 reloptions 를 통째로 갈아엎는다. with 절을 안 적으면
--    security_invoker 가 지워져 뷰가 RLS 를 우회한다(20260805100000 실측: 비로그인 anon 이
--    마감·임시저장 공고 2,170건을 담당자 연락처까지 읽었다). 그래서 정의 안에 다시 적는다.
-- 🔴 hospitals 는 left join 이다. hospital_id 가 빈 공고가 실제로 있어(수집·이관분)
--    inner 로 걸면 그 공고가 목록에서 통째로 사라진다.
-- 🔴 컬럼 순서·이름은 종전 그대로 두고 hospital_name 만 뒤에 더한다. is_live/ad_live/ad_paid
--    정의는 한 글자도 건드리지 않는다(노출 판정의 정본은 계속 여기 한 곳이다).
create or replace view public.jobs_listed
with (security_invoker = true) as
 SELECT j.id, j.hospital_id, j.title, j.specialty, j.location, j.employment_type, j.salary_text,
    j.benefits, j.description, j.source, j.external_url, j.external_id, j.status, j.is_featured,
    j.posted_at, j.created_at, j.updated_at, j.featured_until, j.ad_tier, j.manager_name,
    j.manager_phone, j.deadline, j.recruit_count, j.shift_type, j.apply_method, j.apply_email,
    j.apply_detail, j.apply_methods, j.detail_fetched_at, j.company_name, j.sido, j.sigungu,
    j.facility_type, j.job_category, j.lat, j.lng, j.geocoded_at,
    j.featured_until IS NOT NULL AND j.featured_until > now() AS ad_live,
    (j.status = 'open'
      AND (j.source = 'worknet' OR j.featured_until IS NOT NULL AND j.featured_until > now())
      AND (j.deadline IS NULL OR j.deadline >= (now() AT TIME ZONE 'Asia/Seoul')::date)) IS TRUE AS is_live,
    (j.ad_tier = 'standard' AND j.featured_until IS NOT NULL AND j.featured_until > now()) IS TRUE AS ad_paid,
    -- 명부에 연결된 공고의 병원 이름. company_name 은 명부에 없는 수집 공고가 갖는 텍스트라 둘 다 필요하다.
    -- 이 컬럼을 안 읽는 조회에서는 Postgres 가 left join 자체를 지운다(hospitals.id 가 PK 라 행이 늘지 않는다).
    -- 실측(EXPLAIN ANALYZE, anon, `select id,title,company_name,posted_at from jobs_listed where is_live`):
    -- 계획에 조인 노드가 없고 `Seq Scan on jobs j` 하나다. 계획에 hospitals 가 보이는 것은 이 조인이
    -- 아니라 **jobs 의 RLS 정책**(내 병원 공고인가)이 원래 쓰던 SubPlan 이다 — 공개 목록 비용은 그대로다.
    h.name AS hospital_name
   FROM public.jobs j
   LEFT JOIN public.hospitals h ON h.id = j.hospital_id;

-- ── 「지원 내역」 뷰도 노출 판정을 **빌려 쓴다** ──────────────────────────────
-- 🔴 종전에는 화면(page.tsx)이 `status='open' && !remain(listingEnd(...)).ended` 로 노출 여부를
--    **손으로 다시 계산**했다. 그건 20260805100000 이 "앱은 is_live 를 읽기만 한다, 규칙을 다시
--    적지 말 것" 이라고 못박은 바로 그 일이다(대시보드 "게시중 44" vs 공고관리 "노출중 40" 사고).
--    뷰가 is_live 를 실어 보내고 화면은 그 불리언 하나만 본다 → featured_until·deadline 은 뺀다.
-- 🔴 create or replace 로는 컬럼을 **뺄 수 없다**(42P16). 지우고 다시 만든다 —
--    이 뷰는 20260806120000 에서 방금 만든 것이라 딸린 것이 없다.
drop view if exists public.applications_admin;
create or replace view public.applications_admin
with (security_invoker = true) as
select
  a.id, a.job_id, a.applicant_id, a.status, a.message,
  a.created_at, a.updated_at, a.viewed_at, a.closed_at,
  coalesce(h.is_test, false) as is_test,
  -- 「3일 넘게 방치」의 정의도 여기 한 곳에만 둔다. 카드 숫자·목록 필터·화면의 빨간 강조가 같은 값을 본다.
  (a.status = 'submitted' and a.created_at < now() - interval '3 days') as is_stale,
  j.title        as job_title,
  j.status       as job_status,
  j.source       as job_source,
  j.company_name as job_company_name,
  j.is_live      as job_is_live,
  h.id           as hospital_id,
  h.name         as hospital_name,
  -- 이름·연락처는 이력서에 있다(profiles.display_name 은 계정 이름이라 실명이 아닐 수 있다).
  r.name  as nurse_name,
  r.phone as nurse_phone,
  r.email as nurse_email
from public.applications a
join public.jobs_listed j on j.id = a.job_id
left join public.hospitals h on h.id = j.hospital_id
left join public.resumes r on r.profile_id = a.applicant_id;

comment on view public.applications_admin is
  '관리자 「지원 내역」 전용. is_test·is_stale·job_is_live 판정과 화면에 필요한 이름/공고/병원을 한 줄에 모은다.';

revoke all on public.applications_admin from public, anon;
grant select on public.applications_admin to authenticated;

notify pgrst, 'reload schema';
