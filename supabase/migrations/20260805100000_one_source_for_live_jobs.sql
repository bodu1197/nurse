-- 🗂 "지금 구직자에게 보이는 공고인가" 를 **여기 한 곳에서만** 정의한다.
--
-- 왜 만들었나(오너 지적 2026-08-05: "매번 수동으로 맞춰주는 게 바른 방법이냐?"):
-- 같은 개념이 네 군데에 손으로 적혀 있었다 —
--   · admin_dashboard RPC        status='open' 만
--   · getAdList(공고관리)         status='open' + featured_until > now
--   · applyListingWindow(목록·사이트맵·자동매치)  워크넷 or 게시7일내 or 광고유효 + 마감일
--   · isOpenToSeekers(TS 판정)    같은 규칙을 코드로 한 번 더
-- 그래서 대시보드는 "게시중 44", 공고관리는 "노출중 40" 을 동시에 보여줬다(실측 2026-08-05).
-- 이제 앱은 이 뷰의 is_live 를 읽기만 한다. 규칙을 바꿀 일이 생기면 **이 파일만** 고친다.
--
-- 규칙(= 종전 applyListingWindow 와 같다):
--   ① 마감하지 않았고(status='open')
--   ② 워크넷 수집분이거나 · 게시 7일 이내(무료 노출)이거나 · 광고 기간이 살아 있고
--   ③ 공고에 적힌 마감일이 아직 안 지났다(KST 오늘 포함)
-- 🔴 CREATE OR REPLACE VIEW 는 **reloptions 를 통째로 갈아엎는다.** with 절을 안 적으면
--    20260804270000 이 켜 둔 security_invoker 가 지워져 뷰가 RLS 를 우회하게 된다
--    (실측: 지워진 상태에서 비로그인 anon 이 /rest/v1/jobs_listed?status=neq.open 으로
--     마감·임시저장 공고 2,170건을 담당자 연락처까지 통째로 읽었다. jobs 테이블로는 0건).
--    그래서 with 절을 **뷰 정의 안에** 둔다 — 나중에 이 뷰를 또 바꾸는 사람이 빠뜨리지 않게.
-- 🔴 is_live 는 **IS TRUE 로 감싸 3값(NULL)을 없앤다.** featured_until 이 NULL 이면
--    `featured_until >= now()` 가 NULL 이라 `false or false or null = null` 이 된다.
--    그러면 `.eq(is_live,true)` 에도 `.eq(is_live,false)` 에도 안 걸려 그 공고가 관리자 화면
--    양쪽 탭에서 **통째로 사라진다**(실측 4건 — 무료 기간이 끝났는데 마감 버튼만 안 누른 것들).
create or replace view public.jobs_listed
with (security_invoker = true) as
 SELECT id, hospital_id, title, specialty, location, employment_type, salary_text, benefits,
    description, source, external_url, external_id, status, is_featured, posted_at, created_at,
    updated_at, featured_until, ad_tier, manager_name, manager_phone, deadline, recruit_count,
    shift_type, apply_method, apply_email, apply_detail, apply_methods, detail_fetched_at,
    company_name, sido, sigungu, facility_type, job_category, lat, lng, geocoded_at,
    featured_until IS NOT NULL AND featured_until > now() AS ad_live,
    (status = 'open'
      AND (source = 'worknet' OR posted_at >= now() - interval '7 days' OR featured_until >= now())
      AND (deadline IS NULL OR deadline >= (now() AT TIME ZONE 'Asia/Seoul')::date)) IS TRUE AS is_live
   FROM jobs j;

CREATE OR REPLACE FUNCTION public.admin_dashboard()
 RETURNS json
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
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
  if not public.is_admin() then
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
    -- 🔴 'open' = **지금 구직자에게 보이는 공고**(jobs_listed.is_live). 종전에는 status='open'
    --    만 세어, 무료 노출 기간이 끝났는데 마감 버튼만 안 누른 공고까지 "게시중" 으로 셌다
    --    (실측 2026-08-05: 44 로 표시했지만 실제 노출은 40).
    'jobs', (select json_build_object(
        'open', count(*) filter (where is_live),
        'today', count(*) filter (where posted_at >= d0),
        'yesterday', count(*) filter (where posted_at >= dy and posted_at < d0),
        'd7', count(*) filter (where posted_at >= d7),
        'closing3', count(*) filter (where is_live and deadline is not null
                                       and deadline between kst_today and kst_today + 3)
      ) from public.jobs_listed where source <> 'worknet'),
    'collected', (select json_build_object(
        'open', count(*) filter (where is_live),
        'today', count(*) filter (where posted_at >= d0),
        'last_sync', max(updated_at)
      ) from public.jobs_listed where source = 'worknet'),
    'applications', (select json_build_object(
        'total', count(*),
        'today', count(*) filter (where created_at >= d0),
        'yesterday', count(*) filter (where created_at >= dy and created_at < d0),
        'd7', count(*) filter (where created_at >= d7)
      ) from public.applications),
    -- 🔴 'live' 는 **돈을 낸 광고**만 센다. 종전에는 노출 기간이 살아 있기만 하면 전부 세어
    --    (무료 게시 포함) 매출 0원인데 "유료 광고 게재중 40" 이 떴고, 카드를 누르면 가는 곳
    --    (/admin/ads?scope=paid = ad_tier='standard')은 0건이라 화면이 스스로 모순됐다.
    -- 🔴 'granted' 는 ad_tier='admin_test' 를 셌는데 그 값은 DB 에 한 건도 없다(관리자가 켜준
    --    광고도 ad_tier 를 'free' 로 둔다 — app/admin/actions.ts). 영원히 0 인 죽은 숫자라
    --    '무료로 노출 중인 공고 수'로 뜻을 바꾼다(화면 라벨도 함께 바꿨다).
    'ads', (select json_build_object(
        'live', count(*) filter (where is_live and ad_tier = 'standard'),
        'granted', count(*) filter (where is_live and ad_tier is distinct from 'standard'),
        'ending7', count(*) filter (where is_live and ad_tier = 'standard' and featured_until <= now() + interval '7 days')
      ) from public.jobs_listed where source <> 'worknet'),
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
        'd30', coalesce(sum(views) filter (where day >= kst_today - 29), 0)
      ) from public.page_views where day >= kst_today - 29)
  ) into result;

  return result;
end;
$function$
;

