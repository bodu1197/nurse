-- 지원 생애(lifecycle) — 관리자 「지원 내역」 화면용. 오너 요청 2026-08-06:
-- "간호사가 어느 병원에 지원했는지, 그 지원이 어떻게 흘러갔는지를 봐야 운영 방향을 잡는다."
--
-- 🔴 왜 컬럼을 더하나 — updated_at 으로는 못 적는다.
--    지금까지 시각은 created_at·updated_at 둘뿐이었다. updated_at 은 **마지막 변동**일 뿐이라
--    화면에 "열람 시각" 이라고 적으면 거짓말이 된다. 실제로 지금 DB 에 status='submitted' 인데
--    updated_at 이 2분 뒤인 행이 있다(취소했다 다시 지원한 건이다) — 그걸 열람이라고 적으면
--    "병원이 봤다" 는 화면이 나온다. 병원이 며칠 만에 지원자를 보는지는 이 사이트가 간호사에게
--    쓸모 있는지를 결정하는 숫자라, 추정하지 않고 **기록**한다.

-- ── ① 기록할 자리 ────────────────────────────────────────────────────────────
alter table public.applications
  add column if not exists viewed_at timestamptz,
  add column if not exists closed_at timestamptz;

comment on column public.applications.viewed_at is
  '병원이 이 지원을 처음 열어 본 시각. 다시 지원하면 비워진다 — 그건 새 지원이다.';
comment on column public.applications.closed_at is
  '합격·불합격·지원취소로 끝난 시각.';

-- ── ② 있던 값을 되살린다(추정이 아니다) ──────────────────────────────────────
-- 채워 넣을 근거: applications 는 **status 말고 바꿀 수 있는 컬럼이 없다**
-- (20260723140000 에서 `grant update (status)` 로 좁혔고, 앱에도 다른 UPDATE 가 없다).
-- 그래서 지금 상태가 X 인 행의 updated_at 은 정확히 "X 로 바뀐 시각"이다.
-- 🔴 set_updated_at 트리거를 잠깐 끈다. 켜 둔 채로 UPDATE 하면 방금 옮겨 적은 원본
--    updated_at 이 now() 로 덮여, 두 줄 아래에서 되살린 그 값을 스스로 지운다.
alter table public.applications disable trigger applications_set_updated_at;

update public.applications set viewed_at = updated_at
 where status = 'viewed' and viewed_at is null and updated_at > created_at;

-- 합격·불합격은 **보고 내린 결정**이다 — 열람 기록이 따로 없어도 본 것으로 센다.
update public.applications
   set closed_at = updated_at, viewed_at = coalesce(viewed_at, updated_at)
 where status in ('accepted', 'rejected') and closed_at is null;

update public.applications set closed_at = updated_at
 where status = 'withdrawn' and closed_at is null;

alter table public.applications enable trigger applications_set_updated_at;

-- ── ③ 앞으로는 자동으로 찍힌다 ───────────────────────────────────────────────
-- 🔴 앱이 아니라 DB 에 둔다. 상태를 바꾸는 경로가 넷이다(병원 열람 버튼·합격·불합격,
--    간호사 취소, 다시 지원의 되살리기 — mypage/actions.ts · jobs/actions.ts).
--    앱에 적으면 다섯 번째 경로가 생기는 날 조용히 빠진다.
create or replace function public.applications_stamp_lifecycle()
returns trigger
language plpgsql
security invoker   -- create or replace 는 보안 타입을 남긴다 → 늘 명시한다(20260805150000 의 결정).
set search_path = ''
as $$
begin
  if new.status is distinct from old.status then
    if new.status = 'submitted' then
      -- 취소했다 다시 지원한 것 = **새 지원**이다. 지난 주기의 열람 기록을 남겨 두면
      -- 방금 들어온 지원을 병원이 이미 본 것으로 세게 된다.
      new.viewed_at := null;
      new.closed_at := null;
    else
      if new.status in ('viewed', 'accepted', 'rejected') and new.viewed_at is null then
        new.viewed_at := now();
      end if;
      if new.status in ('accepted', 'rejected', 'withdrawn') then
        new.closed_at := now();
      end if;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists applications_stamp_lifecycle on public.applications;
create trigger applications_stamp_lifecycle before update on public.applications
  for each row execute function public.applications_stamp_lifecycle();

-- 트리거 전용 함수는 아무도 부를 이유가 없다(20260805130000 과 같은 정리).
revoke execute on function public.applications_stamp_lifecycle() from public, anon, authenticated;

-- 관리자 목록은 전체를 최신순으로 넘긴다 — job_id·applicant_id 인덱스로는 그 정렬을 못 탄다.
create index if not exists applications_created_idx on public.applications (created_at desc);

-- 🔒 곁다리 수정: anon 이 applications 에 INSERT/UPDATE/DELETE 를 그대로 갖고 있었다(Supabase 기본).
--    지금은 anon 정책이 하나도 없어 RLS 가 막지만, 권한과 정책 **둘 다** 닫아 두는 게 이 표의 관례다
--    (20260723140000 이 authenticated 에 대해 이미 그렇게 했다 — anon 만 빠져 있었다).
revoke insert, update, delete on public.applications from anon;

-- ── ④ 「지원 내역」의 정본 — 뷰 하나 ─────────────────────────────────────────
--
-- 🔴 요약 카드(RPC)와 목록(PostgREST)이 **같은 컬럼**을 보게 한다. 종전 설계는 앱이 테스트 병원의
--    공고 id 를 먼저 긁어와 `job_id=not.in.(…)` 로 뺐는데, 그러면 (1) 술어가 SQL 과 TS 두 곳에
--    적히고 (2) 공고가 늘면 uuid 수백 개가 GET 주소에 실려 414 로 죽고 (3) 그 조회가 실패하면
--    화면은 "테스트 제외"라 말하면서 실제로는 섞인다. jobs_listed.is_live 로 노출 판정을 한곳에
--    모은 것과 같은 이유로 여기도 뷰에 모은다.
-- 🔴 security_invoker — 뷰를 읽는 사람의 권한으로 밑의 표 RLS 가 그대로 걸린다.
--    create or replace 는 이 옵션을 통째로 갈아엎으므로 바꿀 때마다 다시 적어야 한다.
-- 🔴 이 뷰는 **관리자 화면 전용**이다. jobs 조인이 inner 라, 공고를 볼 권한이 없는 사람이 읽으면
--    자기 지원 행이 통째로 사라진다(간호사 화면에 재사용하지 말 것 — applications 를 직접 읽어라).
create or replace view public.applications_admin
with (security_invoker = true) as
select
  a.id, a.job_id, a.applicant_id, a.status, a.message,
  a.created_at, a.updated_at, a.viewed_at, a.closed_at,
  coalesce(h.is_test, false) as is_test,
  -- 「3일 넘게 방치」의 정의도 여기 한 곳에만 둔다. 카드 숫자와 ?stale=1 목록이 같은 시계를 본다.
  (a.status = 'submitted' and a.created_at < now() - interval '3 days') as is_stale,
  j.title        as job_title,
  j.status       as job_status,
  j.source       as job_source,
  j.company_name as job_company_name,
  j.featured_until, j.deadline,
  h.id           as hospital_id,
  h.name         as hospital_name,
  -- 이름·연락처는 이력서에 있다(profiles.display_name 은 계정 이름이라 실명이 아닐 수 있다).
  r.name  as nurse_name,
  r.phone as nurse_phone,
  r.email as nurse_email
from public.applications a
join public.jobs j on j.id = a.job_id
left join public.hospitals h on h.id = j.hospital_id
left join public.resumes r on r.profile_id = a.applicant_id;

comment on view public.applications_admin is
  '관리자 「지원 내역」 전용. is_test·is_stale 판정과 화면에 필요한 이름/공고/병원을 한 줄에 모은다.';

revoke all on public.applications_admin from anon;
grant select on public.applications_admin to authenticated;

-- ── ⑤ 요약 ──────────────────────────────────────────────────────────────────
-- 🔴 관리자 테스트 병원(hospitals.is_test)에 넣은 지원은 뺀다. 지금 3건 중 1건이 그것이라,
--    빼지 않으면 "누적 3건" 이 실제 간호사 2명의 활동을 3건으로 부풀려 말한다
--    (매출이 tier='admin_test' 를 빼는 것과 같은 이유).
create or replace function public.admin_applications_overview()
returns json
language plpgsql
stable
security invoker
set search_path = public, pg_temp
as $$
declare
  d0  timestamptz := date_trunc('day', now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul';
  dy  timestamptz := d0 - interval '1 day';
  d7  timestamptz := d0 - interval '6 days';
  d30 timestamptz := d0 - interval '29 days';
  result json;
begin
  if not private.is_admin() then
    raise exception '관리자 전용입니다' using errcode = '42501';
  end if;

  -- 🔴 목록 화면과 **같은 뷰**를 읽는다. 술어를 여기 다시 적으면 카드 숫자와 목록 건수가 어긋난다.
  -- ponytail: 전 기간 전수 집계다(지금 3건). 지원이 수십만 건이 되면 기간을 자르거나 야간 집계로 뺀다.
  --           필요한 컬럼만 고르는 이유도 그것이다 — 이름 컬럼을 빼면 resumes 조인이 통째로 사라진다.
  with all_apps as (
    select id, job_id, applicant_id, status, created_at, viewed_at, is_test, is_stale,
           job_title, job_company_name, hospital_name
      from public.applications_admin
  ), apps as (
    select * from all_apps where not is_test
  )
  select json_build_object(
    'counts', (select json_build_object(
        'total', count(*),
        'today', count(*) filter (where created_at >= d0),
        'yesterday', count(*) filter (where created_at >= dy and created_at < d0),
        'd7', count(*) filter (where created_at >= d7),
        'd30', count(*) filter (where created_at >= d30),
        -- 🔴 건수와 사람 수를 같이 낸다. 20건이 20명인지 한 명이 20번인지는 완전히 다른 이야기다
        --    (대시보드 접속자 카드가 조회수만으로는 아무 말도 못 했던 것과 같은 함정).
        'nurses', count(distinct applicant_id),
        'nurses_d30', count(distinct applicant_id) filter (where created_at >= d30),
        'jobs', count(distinct job_id)
      ) from apps),
    'funnel', (select json_build_object(
        'submitted', count(*) filter (where status = 'submitted'),
        'viewed', count(*) filter (where status = 'viewed'),
        'accepted', count(*) filter (where status = 'accepted'),
        'rejected', count(*) filter (where status = 'rejected'),
        'withdrawn', count(*) filter (where status = 'withdrawn'),
        -- 열람률의 분모는 **취소를 뺀 것**이다. 간호사가 스스로 거둔 건을 병원이 안 봤다고 세면
        -- 병원 탓이 아닌 것으로 병원을 나쁘게 말하는 셈이다.
        'live', count(*) filter (where status <> 'withdrawn'),
        'seen', count(*) filter (where status <> 'withdrawn' and viewed_at is not null),
        'stale', count(*) filter (where is_stale),
        -- 열람까지 걸린 시간(중앙값, 시간). 평균은 한 건이 한 달 걸리면 통째로 망가진다.
        -- viewed_at 이 없는 옛 행은 애초에 빠진다 → 기록이 없으면 null 이고 화면은 "-" 로 적는다.
        'median_hours', (select round((extract(epoch from
              percentile_cont(0.5) within group (order by viewed_at - created_at)) / 3600)::numeric, 1)
            from apps where viewed_at is not null)
      ) from apps),
    'test_total', (select count(*) from all_apps where is_test),
    -- 지원이 어디로 몰리는가 = 어떤 공고를 더 받아야 하는가.
    -- 상위 5개만 — 화면의 카드 아래 한 눈에 들어오는 길이다. 전체는 아래 목록에서 본다.
    'top_jobs', (select coalesce(json_agg(t), '[]'::json) from (
        select job_id, job_title as title,
               coalesce(hospital_name, job_company_name) as hospital,
               count(*) as n,
               count(*) filter (where status = 'submitted' and viewed_at is null) as unseen,
               max(created_at) as last_at
          from apps
         where status <> 'withdrawn'
         group by job_id, job_title, hospital_name, job_company_name
         order by count(*) desc, max(created_at) desc
         limit 5) t)
  ) into result;

  return result;
end;
$$;

revoke execute on function public.admin_applications_overview() from public, anon;
grant execute on function public.admin_applications_overview() to authenticated;

-- ── ⑤ 대시보드도 같은 숫자를 말하게 한다 ────────────────────────────────────
-- 🔴 대시보드의 「오늘 지원」이 테스트 병원 지원을 세고 있었다. 새 화면은 빼고 세므로 그대로
--    두면 두 화면이 서로 다른 누적치를 말한다 — "게시중 44 vs 노출중 40"(2026-08-05)과 같은 사고다.
--    applications 블록만 바꾸고 나머지는 20260806110000 그대로다.
create or replace function public.admin_dashboard()
returns json
language plpgsql
stable
security invoker
set search_path = public, pg_temp
as $$
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
      ) from public.jobs_listed where source <> 'worknet'),
    'collected', (select json_build_object(
        'open', count(*) filter (where is_live),
        'today', count(*) filter (where posted_at >= d0),
        'last_sync', max(updated_at)
      ) from public.jobs_listed where source = 'worknet'),
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
$$;

-- PostgREST 는 함수 목록을 캐시한다 — 새 함수를 바로 부를 수 있게 다시 읽힌다.
notify pgrst, 'reload schema';
