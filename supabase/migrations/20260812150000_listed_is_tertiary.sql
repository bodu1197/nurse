-- 🗂 목록 정렬을 바꾼다 — **① 유료광고 ② 상급종합병원 ③ 최신순**(오너 확정 2026-08-12).
--
-- 종전: ad_paid → ad_live → posted_at
--   ad_live 는 **무료 1주도 참**이다(무료도 featured_until 을 쓴다). 그래서 공짜 광고가
--   일반 공고 전체보다 위에 섰다. 오너 지시: "무료광고는 일반 순서에 그냥 둬라, 공고에 파묻혀도 된다."
-- 이후: ad_paid → is_tertiary → posted_at
--   돈 낸 광고가 맨 위, 그다음이 상급종합병원(간호사가 가장 찾는 자리), 나머지는 최신순.
--
-- 🔴 정렬 키는 **뷰의 컬럼**이어야 한다. 앱에서 받아온 뒤 정렬하면 20건씩 끊어 가져오는
--    페이지네이션에서 순서가 쪽마다 뒤집힌다(2쪽의 상급종합이 1쪽 것보다 위로 갈 수 없다).
--
-- 🔴 CREATE OR REPLACE VIEW 는 reloptions 를 통째로 갈아엎는다. with 절을 안 적으면
--    security_invoker 가 지워져 뷰가 RLS 를 우회한다 — 그 상태에서 비로그인 anon 이
--    마감·임시저장 공고 2,170건을 담당자 연락처까지 읽었다(실측 2026-08-05).
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
      AND (j.source in ('worknet','public_data','crawl') OR j.featured_until IS NOT NULL AND j.featured_until > now())
      AND (j.deadline IS NULL OR j.deadline >= (now() AT TIME ZONE 'Asia/Seoul')::date)) IS TRUE AS is_live,
    (j.ad_tier = 'standard' AND j.featured_until IS NOT NULL AND j.featured_until > now()) IS TRUE AS ad_paid,
    h.name AS hospital_name,
    -- 🔴 새 컬럼은 **맨 뒤에만** 붙일 수 있다. CREATE OR REPLACE VIEW 는 기존 컬럼의 자리·이름을
    --    못 바꾼다(42P16: cannot change name of view column). 가운데 끼우면 배포가 실패한다.
    -- 목록 2순위. 종별 이름을 여기 한 번만 적는다 — 앱은 이 불리언만 읽는다.
    (j.facility_type = '상급종합병원') IS TRUE AS is_tertiary
   FROM public.jobs j
   LEFT JOIN public.hospitals h ON h.id = j.hospital_id;
