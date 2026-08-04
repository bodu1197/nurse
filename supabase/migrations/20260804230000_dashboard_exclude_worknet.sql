-- 대시보드에서 워크넷 수집 공고를 뺀다 (오너 지시 2026-08-04).
--
-- 🔴 광고 목록(getAdList)에서만 뺐고 대시보드는 안 뺐다. 그래서 "게시중 공고 1,301",
--    "오늘 등록 공고 3" 이 전부 워크넷 수집분이었고, 마치 병원이 올린 공고처럼 보였다.
--    워크넷은 고용24에서 **자동으로 긁어오는 구인정보**다 — 우리 매출도, 우리가 관리할 대상도 아니다.
--
-- 🔴 부분이 전체보다 컸다. 'open' 은 status='open' 으로 걸렀는데 'direct'·'worknet' 은
--    상태를 안 걸러서, 게시중 1,301 아래에 워크넷 1,970 이 붙었다. 숫자가 스스로를 반증했다.
--    이제 공고 숫자는 전부 **워크넷 제외 + 같은 조건**이라 부분의 합이 전체와 맞는다.

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
        'today', count(*) filter (where created_at >= d0),
        'yesterday', count(*) filter (where created_at >= dy and created_at < d0),
        'd7', count(*) filter (where created_at >= d7),
        'd30', count(*) filter (where created_at >= d30)
      ) from public.profiles),
    'resumes', (select json_build_object(
        'total', count(*), 'public', count(*) filter (where is_public),
        'today', count(*) filter (where created_at >= d0),
        'yesterday', count(*) filter (where created_at >= dy and created_at < d0),
        'd7', count(*) filter (where created_at >= d7),
        'd30', count(*) filter (where created_at >= d30)
      ) from public.resumes),
    -- 🔴 여기부터 전부 워크넷 제외. 병원이 우리 사이트에 직접 올린 공고만 센다.
    'jobs', (select json_build_object(
        'open', count(*) filter (where status = 'open'),
        'today', count(*) filter (where created_at >= d0),
        'yesterday', count(*) filter (where created_at >= dy and created_at < d0),
        'd7', count(*) filter (where created_at >= d7),
        'closing3', count(*) filter (where status = 'open' and deadline is not null
                                       and deadline between kst_today and kst_today + 3)
      ) from public.jobs where source <> 'worknet'),
    -- 워크넷은 "우리 공고" 가 아니라 **수집 상태**다. 크론이 죽었는지 보려고 따로 둔다.
    'collected', (select json_build_object(
        'open', count(*) filter (where status = 'open'),
        'today', count(*) filter (where created_at >= d0),
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
      'hidden_posts', (select count(*) from public.board_posts where is_hidden)
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
