-- 🔴 "오늘 공고 낸 병원 목록이 어디 있냐" — 숫자를 눌러도 갈 곳이 없었고, 숫자 자체도 틀렸다.
--
-- admin_dashboard() 의 jobs.today 는 created_at 으로 셌다. created_at 은 **행이 우리 DB 에
-- 만들어진 시각**이라, 오늘 이관한 레거시 공고 1,401건이 전부 오늘 등록으로 잡힌다.
-- 실제로 오늘 게시된 우리 공고는 1건이다(우리요양병원).
--
-- posted_at 은 그 공고가 실제로 게시된 시각이고, 이관할 때 원본 게시일을 그대로 넣었다.
-- 회원 가입일(20260804330000)과 이력서 저장(20260804300000)에서 겪은 것과 같은 함정이다 —
-- **내 배치가 만든 시각을 사람의 행동으로 세면 안 된다.**
--
-- 목록 화면의 '오늘 등록' 탭도 posted_at 을 쓴다(getAdList). 둘이 같은 기준이어야
-- 숫자를 눌러 들어간 목록의 건수가 그 숫자와 맞는다.

create or replace function public.admin_dashboard()
returns json
language plpgsql
stable
security definer
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
    'jobs', (select json_build_object(
        'open', count(*) filter (where status = 'open'),
        'today', count(*) filter (where posted_at >= d0),
        'yesterday', count(*) filter (where posted_at >= dy and posted_at < d0),
        'd7', count(*) filter (where posted_at >= d7),
        'closing3', count(*) filter (where status = 'open' and deadline is not null
                                       and deadline between kst_today and kst_today + 3)
      ) from public.jobs where source <> 'worknet'),
    'collected', (select json_build_object(
        'open', count(*) filter (where status = 'open'),
        'today', count(*) filter (where posted_at >= d0),
        'last_sync', max(updated_at)
      ) from public.jobs where source = 'worknet'),
    'applications', (select json_build_object(
        'total', count(*),
        'today', count(*) filter (where created_at >= d0),
        'yesterday', count(*) filter (where created_at >= dy and created_at < d0),
        'd7', count(*) filter (where created_at >= d7)
      ) from public.applications),
    'ads', (select json_build_object(
        'live', count(*) filter (where featured_until > now() and ad_tier is distinct from 'admin_test'),
        'granted', count(*) filter (where featured_until > now() and ad_tier = 'admin_test'),
        'ending7', count(*) filter (where featured_until > now() and featured_until <= now() + interval '7 days')
      ) from public.jobs where source <> 'worknet'),
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
$$;
