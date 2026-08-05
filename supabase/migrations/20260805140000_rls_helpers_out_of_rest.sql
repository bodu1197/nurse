-- 🩺 Advisor 보안 경고 근본 수정 — RLS 헬퍼를 REST 에서 아예 치운다.
--
-- 오너 지적 2026-08-05: "왜 남겼냐고?"
-- 종전 판단: EXECUTE 를 회수하면 RLS 가 죽으니(실측: 42501 permission denied) 어쩔 수 없다.
-- 그건 **회수만 생각한** 것이었다. PostgREST 는 설정된 스키마(public)만 노출하므로,
-- 함수를 다른 스키마로 옮기면 **RLS 는 그대로 쓰면서 /rest/v1/rpc 엔드포인트만 사라진다.**
--
-- 🔒 정책 28개는 **한 줄도 고치지 않는다.** 정책 표현식은 함수를 OID 로 기억하고
--    ALTER FUNCTION … SET SCHEMA 는 OID 를 유지하기 때문이다(실측 확인: 이동 후 정책이
--    private.is_admin() 으로 렌더되고 anon 의 공고 조회 1,343건이 그대로 나왔다).
-- 🔴 반면 **함수 본문은 텍스트**라 OID 를 따라오지 않는다 — is_admin 을 이름으로 부르는
--    함수 4개는 아래에서 본문을 고쳐 다시 만든다. 안 고치면 실행 시점에 "함수 없음"으로 죽는다.

create schema if not exists private;
comment on schema private is
  'PostgREST 가 노출하지 않는 스키마. RLS 정책이 부르는 헬퍼처럼 **DB 안에서만** 쓰이는 것을 둔다 — public 에 두면 /rest/v1/rpc 로 외부에 열린다.';

-- RLS 정책은 조회하는 사람의 권한으로 평가되므로, 그 역할들이 스키마를 열어볼 수 있어야 한다.
-- (스키마 USAGE 는 PostgREST 노출과 무관하다 — 노출 여부는 PostgREST 설정이 정한다.)
grant usage on schema private to anon, authenticated, service_role;

-- OID 를 유지한 채 옮긴다 → 정책·권한(ACL)이 그대로 따라온다.
alter function public.is_admin() set schema private;
alter function public.is_community_member() set schema private;

-- admin_dashboard: 본문이 텍스트라 스키마 이동을 안 따라온다 → 참조를 private 로 고쳐 다시 만든다.
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

-- admin_set_hidden: 본문이 텍스트라 스키마 이동을 안 따라온다 → 참조를 private 로 고쳐 다시 만든다.
CREATE OR REPLACE FUNCTION public.admin_set_hidden(target_table text, target_id uuid, hide boolean, reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if not private.is_admin() then
    raise exception '관리자만 숨김 상태를 바꿀 수 있습니다' using errcode = '42501';
  end if;
  if reason is null or length(btrim(reason)) < 2 then
    raise exception '사유를 두 글자 이상 적어야 합니다' using errcode = '22023';
  end if;

  -- 표 이름은 if 분기로 화이트리스트한다. 동적 SQL 을 쓰면 그 자리가 곧 주입 지점이 된다.
  if target_table = 'reviews' then
    -- 평점은 트리거(reviews_rating_sync)가 다시 센다 — 집계식이 `not is_hidden` 이다.
    update public.reviews set is_hidden = hide where id = target_id;
  elsif target_table = 'board_posts' then
    update public.board_posts set is_hidden = hide where id = target_id;
  elsif target_table = 'board_comments' then
    update public.board_comments set is_hidden = hide where id = target_id;
  else
    raise exception '숨길 수 없는 대상입니다: %', target_table using errcode = '22023';
  end if;

  -- 🔴 0행이면 실패로 처리한다. 없는 id 를 조용히 성공으로 돌려주면 화면은 "처리했습니다" 를
  --    띄우고 기록만 남는다 — 일어나지 않은 조치가 감사 로그에 쌓인다.
  if not found then
    raise exception '대상을 찾을 수 없습니다' using errcode = '02000';
  end if;

  insert into public.admin_actions (actor_id, action, target_table, target_id, reason)
  values (
    (select auth.uid()),
    target_table || case when hide then '.hide' else '.unhide' end,
    target_table, target_id, btrim(reason)
  );
end;
$function$
;

-- admin_traffic: 본문이 텍스트라 스키마 이동을 안 따라온다 → 참조를 private 로 고쳐 다시 만든다.
CREATE OR REPLACE FUNCTION public.admin_traffic(days integer DEFAULT 30)
 RETURNS json
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  n int := least(greatest(coalesce(days, 30), 1), 365);
  today date := (now() at time zone 'Asia/Seoul')::date;
  result json;
begin
  if not private.is_admin() then
    raise exception '관리자 전용입니다' using errcode = '42501';
  end if;

  select json_build_object(
    'days', (
      select coalesce(json_agg(json_build_object('day', d.day, 'views', coalesce(v.views, 0)) order by d.day), '[]'::json)
      from (select generate_series(today - (n - 1), today, interval '1 day')::date as day) d
      left join (select day, sum(views) views from public.page_views
                 where day >= today - (n - 1) group by day) v on v.day = d.day
    ),
    'paths', (
      select coalesce(json_agg(t), '[]'::json) from (
        select path, sum(views) views from public.page_views
        where day >= today - (n - 1)
        group by path order by sum(views) desc limit 30
      ) t
    ),
    'total', (select coalesce(sum(views), 0) from public.page_views where day >= today - (n - 1))
  ) into result;

  return result;
end;
$function$
;

-- is_talent_advertiser: 본문이 텍스트라 스키마 이동을 안 따라온다 → 참조를 private 로 고쳐 다시 만든다.
CREATE OR REPLACE FUNCTION public.is_talent_advertiser()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  -- 최고 관리자는 전부 볼 수 있다. 관리자 화면(/admin/resumes)과 같은 권한이므로
  -- 공개 화면에서만 못 보게 막아 봐야 우회로만 늘어난다.
  select private.is_admin() or exists (
    select 1
      from jobs j
      join hospitals h on h.id = j.hospital_id
     where h.owner_profile_id = (select auth.uid())
       and j.featured_until > now()                 -- 광고가 지금 살아 있어야 하고
       and exists (
         select 1 from ad_orders o
          where o.job_id = j.id
            and o.status = 'PAID'
            and o.tier <> 'admin_test'
            and o.amount > 0                        -- 실제로 돈이 들어와야 한다
       )
  );
$function$
;

-- ── 새로 뜬 경고: rls_policy_always_true (inquiries_insert_any) ────────────────
-- 문의는 **비로그인도 보낼 수 있어야 한다**(가입 전 문의가 제일 많다 — app/contact/actions.ts).
-- 그래서 INSERT 자체를 막을 수는 없다. 문제는 WITH CHECK 가 true 라 **아무 값이나** 넣을 수 있었다는 것:
--   · status 를 'answered'/'closed' 로 넣어 관리자 화면에서 처리된 것처럼 숨길 수 있다
--   · admin_memo(관리자 메모)·answered_at 에 임의 값을 심을 수 있다
--   · author_id 는 트리거(inquiries_stamp_author)가 덮어써서 사칭은 원래 불가능하다
-- → "새 문의의 모양"만 허용한다. 관리자 칸은 비어 있어야 하고 상태는 접수(open)여야 한다.
drop policy if exists inquiries_insert_any on public.inquiries;
create policy inquiries_insert_any on public.inquiries for insert
  with check (
    status = 'open'
    and admin_memo is null
    and answered_at is null
  );
