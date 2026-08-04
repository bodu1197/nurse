-- 대시보드가 "새로 쓴 것" 만 세서 실제 활동이 안 보였다.
--
-- 🔴 이 사이트의 이력서 7,270건은 **전부 구 널스넷에서 옮겨온 것**이다(created_at 이 2024~2025).
--    그래서 회원이 로그인해 자기 이력서를 고쳐도 created_at 은 그대로고 updated_at 만 오늘이 된다.
--    관리자 목록은 updated_at 내림차순이라 그 이력서들이 맨 위에 뜨는데,
--    대시보드는 created_at 만 세서 "오늘 등록 0" 이라고 말한다 —
--    **목록에는 오늘 것이 잔뜩 보이는데 대시보드는 0** 이라 화면이 서로를 반증한다.
--
-- 등록(created)과 수정(updated)을 **둘 다** 센다. 이관 사이트에서 활동은 대부분 '고치기' 다.
-- 공고·회원도 같은 이유로 수정 건수를 함께 낸다.

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
        'd30', count(*) filter (where created_at >= d30),
        -- 🔴 고친 것도 센다. 이관 이력서는 '새로 쓰기' 가 아니라 '고치기' 로 활동이 나타난다.
        --    created_at = updated_at 인 것(=새로 쓴 것)은 빼서 등록과 겹치지 않게 한다.
        'edited_today', count(*) filter (where updated_at >= d0 and updated_at <> created_at),
        'edited_d7', count(*) filter (where updated_at >= d7 and updated_at <> created_at)
      ) from public.resumes),
    'jobs', (select json_build_object(
        'open', count(*) filter (where status = 'open'),
        'today', count(*) filter (where created_at >= d0),
        'yesterday', count(*) filter (where created_at >= dy and created_at < d0),
        'd7', count(*) filter (where created_at >= d7),
        'edited_today', count(*) filter (where updated_at >= d0 and updated_at <> created_at),
        'closing3', count(*) filter (where status = 'open' and deadline is not null
                                       and deadline between kst_today and kst_today + 3)
      ) from public.jobs where source <> 'worknet'),
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
      'hidden_posts', (select count(*) from public.board_posts where is_hidden),
      -- 이름이 빈 이력서는 공개 인재 목록에서 제외된다(searchPublicTalent) — 사실상 안 보이는 이력서다.
      'nameless_resumes', (select count(*) from public.resumes where name is null)
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
