-- 🗂 "밖에서 수집한 공고" 에 **잡알리오(public_data)** 를 더한다 — 종전에는 워크넷 하나뿐이라
--    그 개념이 `source = 'worknet'` 이라는 문자열로 네 곳에 손으로 적혀 있었다.
--
-- 왜 이 마이그레이션이 없으면 안 되나(수집만 붙이고 여기를 안 고쳤을 때 실제로 벌어지는 일):
--   ① jobs_listed.is_live — 수집 공고는 광고를 산 적이 없어 featured_until 이 null 이다.
--      'worknet' 만 예외로 두면 잡알리오 공고는 **넣는 족족 is_live=false** 가 되어
--      /jobs 목록·홈·사이트맵 어디에도 안 뜬다. 크론은 매일 도는데 화면은 그대로 — 조용한 실패다.
--   ② admin_dashboard 'jobs'/'ads' — `source <> 'worknet'` 이라 잡알리오 공고가 **우리 공고**로
--      세어진다. 돈 한 푼 안 낸 공공기관 공고가 "게시중"·"무료 노출" 숫자를 부풀린다.
--   ③ admin_dashboard 'collected' — `source = 'worknet'` 이라 수집 카드가 잡알리오를 못 센다.
--      last_sync 도 워크넷 것만 봐서 알리오 크론이 죽어도 화면은 멀쩡해 보인다.
--
-- 🔴 앱 쪽 짝은 src/lib/jobState.ts 의 COLLECTED_SOURCES 다. 수집처를 또 늘리면 **두 곳을 같이** 고친다
--    (앱은 이미 받아 온 행 하나를 판정해야 해서 뷰 필터를 쓸 수 없다 — jobState 주석 참고).

-- ── 노출 판정(정본) ────────────────────────────────────────────────────────
-- 🔴 CREATE OR REPLACE VIEW 는 reloptions 를 통째로 갈아엎는다. with 절을 안 적으면
--    security_invoker 가 지워져 뷰가 RLS 를 우회한다 — 그 상태에서 비로그인 anon 이
--    마감·임시저장 공고 2,170건을 담당자 연락처까지 읽었다(실측 2026-08-05).
--    바꿀 때마다 **정의 안에** 다시 적는다.
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
      AND (j.source in ('worknet','public_data') OR j.featured_until IS NOT NULL AND j.featured_until > now())
      AND (j.deadline IS NULL OR j.deadline >= (now() AT TIME ZONE 'Asia/Seoul')::date)) IS TRUE AS is_live,
    (j.ad_tier = 'standard' AND j.featured_until IS NOT NULL AND j.featured_until > now()) IS TRUE AS ad_paid,
    h.name AS hospital_name
   FROM public.jobs j
   LEFT JOIN public.hospitals h ON h.id = j.hospital_id;

-- ── 관리자 대시보드 ────────────────────────────────────────────────────────
-- 아래는 **현재 살아 있는 정의 그대로**이고, 바뀐 곳은 worknet 을 다루는 세 줄뿐이다.
CREATE OR REPLACE FUNCTION public.admin_dashboard()
 RETURNS json
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  d0  timestamptz := date_trunc('day', now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul';
  dy  timestamptz := d0 - interval '1 day';
  d7  timestamptz := d0 - interval '6 days';
  d30 timestamptz := d0 - interval '29 days';
  kst_today date := (now() at time zone 'Asia/Seoul')::date;
  result json;
begin
  if not private.is_admin() then
    raise exception '관리자 전용입니다' using errcode = '42501';
  end if;

  select json_build_object(
    'members', (select json_build_object(
        'total', count(*), 'nurse', count(*) filter (where role = 'nurse'),
        'hospital', count(*) filter (where role = 'hospital'),
        'legacy', count(*) filter (where legacy_member_srl is not null),
        'real', count(*) filter (where legacy_member_srl is null),
        'today', count(*) filter (where created_at >= d0),
        'yesterday', count(*) filter (where created_at >= dy and created_at < d0),
        'd7', count(*) filter (where created_at >= d7),
        'd30', count(*) filter (where created_at >= d30)
      ) from public.profiles),
    'resumes', (select json_build_object(
        'total', count(*), 'public', count(*) filter (where r.is_public),
        'real', count(*) filter (where p.legacy_member_srl is null),
        'real_public', count(*) filter (where p.legacy_member_srl is null and r.is_public),
        'today', count(*) filter (where r.created_at >= d0),
        'yesterday', count(*) filter (where r.created_at >= dy and r.created_at < d0),
        'd7', count(*) filter (where r.created_at >= d7),
        'd30', count(*) filter (where r.created_at >= d30),
        'saved_today', count(*) filter (where r.last_edited_at >= d0),
        'saved_yesterday', count(*) filter (where r.last_edited_at >= dy and r.last_edited_at < d0),
        'edited_today', count(*) filter (where r.last_edited_at >= d0 and r.created_at < d0),
        'edited_d7', count(*) filter (where r.last_edited_at >= d7 and r.created_at < d7)
      ) from public.resumes r join public.profiles p on p.id = r.profile_id),
    -- 🔴 posted_at 이다. created_at 은 이관 배치가 오늘로 밀어놨다.
    -- 🔴 'open' = **지금 구직자에게 보이는 공고**(jobs_listed.is_live).
    'jobs', (select json_build_object(
        'open', count(*) filter (where is_live),
        'today', count(*) filter (where posted_at >= d0),
        'yesterday', count(*) filter (where posted_at >= dy and posted_at < d0),
        'd7', count(*) filter (where posted_at >= d7),
        'closing3', count(*) filter (where is_live and deadline is not null
                                       and deadline between kst_today and kst_today + 3)
      ) from public.jobs_listed where source not in ('worknet','public_data')),
    'collected', (select json_build_object(
        'open', count(*) filter (where is_live),
        'today', count(*) filter (where posted_at >= d0),
        'last_sync', max(updated_at)
      ) from public.jobs_listed where source in ('worknet','public_data')),
    -- 🔴 테스트 병원 지원은 뺀다 — 「지원 내역」 화면과 같은 술어여야 두 화면이 같은 말을 한다.
    'applications', (select json_build_object(
        'total', count(*),
        'today', count(*) filter (where a.created_at >= d0),
        'yesterday', count(*) filter (where a.created_at >= dy and a.created_at < d0),
        'd7', count(*) filter (where a.created_at >= d7)
      ) from public.applications a
        join public.jobs j on j.id = a.job_id
        left join public.hospitals h on h.id = j.hospital_id
       where coalesce(h.is_test, false) = false),
    'ads', (select json_build_object(
        'live', count(*) filter (where is_live and ad_tier = 'standard'),
        'granted', count(*) filter (where is_live and ad_tier is distinct from 'standard'),
        'ending7', count(*) filter (where is_live and ad_tier = 'standard' and featured_until <= now() + interval '7 days')
      ) from public.jobs_listed where source not in ('worknet','public_data')),
    'revenue', (select json_build_object(
        'today', coalesce(sum(amount) filter (where paid_at >= d0), 0),
        'yesterday', coalesce(sum(amount) filter (where paid_at >= dy and paid_at < d0), 0),
        'd30', coalesce(sum(amount) filter (where paid_at >= d30), 0),
        'total', coalesce(sum(amount), 0),
        'count30', count(*) filter (where paid_at >= d30)
      ) from public.ad_orders where status = 'PAID' and tier <> 'admin_test'),
    'todo', json_build_object(
      'inquiries', (select count(*) from public.inquiries where status = 'open'),
      'tax', (select count(*) from public.ad_orders
                where status = 'PAID' and tier <> 'admin_test' and tax_issued_at is null),
      'stale_orders', (select count(*) from public.ad_orders
                where status = 'PREPARE' and created_at < now() - interval '1 hour'),
      'failed_orders', (select count(*) from public.ad_orders where status = 'FAILED'),
      'hidden_reviews', (select count(*) from public.reviews where is_hidden),
      'hidden_posts', (select count(*) from public.board_posts where is_hidden),
      'nameless_resumes', (select count(*) from public.resumes where name is null),
      'private_resumes_7d', (select count(*) from public.resumes
                where not is_public and last_edited_at >= d7)
    ),
    'traffic', (select json_build_object(
        'today', coalesce(sum(views) filter (where day = kst_today), 0),
        'yesterday', coalesce(sum(views) filter (where day = kst_today - 1), 0),
        'd7', coalesce(sum(views) filter (where day >= kst_today - 6), 0),
        'd30', coalesce(sum(views) filter (where day >= kst_today - 29), 0),
        'bots30', coalesce(sum(bots) filter (where day >= kst_today - 29), 0)
      ) from public.page_views where day >= kst_today - 29),
    -- 🔴 d7·d30 은 **서로 다른 지문의 수**다(일별 합이 아니다).
    'visitors', (select json_build_object(
        'today', count(*) filter (where day = kst_today),
        'yesterday', count(*) filter (where day = kst_today - 1),
        'd7', count(distinct vid) filter (where day >= kst_today - 6),
        'd30', count(distinct vid)
      ) from public.visitors where day >= kst_today - 29)
  ) into result;

  return result;
end;
$function$;
