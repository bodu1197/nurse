-- 🔴 대시보드가 "오늘 이력서 활동 8,079건" 이라고 말했다. 거짓이다. 실제는 9건이다.
--
-- 원인: 20260804290000 의 last_edited_at 백필 UPDATE 가 resumes_set_updated_at 트리거를 건드려
-- **8,078건 전부의 updated_at 을 그 순간으로 밀었다.** 대시보드는 updated_at 으로 "고침" 을 센다.
-- 관리자 이력서 목록도 updated_at 순이라 1페이지가 통째로 오늘 날짜로 보였다.
--
-- updated_at 은 이제 이 사이트에서 "사람이 손댄 시각" 을 말해주지 못한다. 내 배치가 세 번 밀었다.
-- 대시보드도 last_edited_at 을 쓴다 — 사람이 저장할 때만 갱신되는 값이다.
--
-- 공고 쪽 '고침' 은 아예 뺀다. jobs 에는 대응하는 깨끗한 칸이 없고, 이관·광고부여·병원연결이
-- 1,444건의 updated_at 을 오늘로 밀어놨다. 셀 수 없는 것을 숫자로 내놓느니 안 내놓는 게 낫다.

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
        -- 🔴 last_edited_at 이다. updated_at 은 내 배치가 세 번 밀어서 못 쓴다.
        --    새로 쓴 것(created_at 이 같은 날)은 빼서 '등록' 과 겹치지 않게 한다.
        'edited_today', count(*) filter (where last_edited_at >= d0 and created_at < d0),
        'edited_d7', count(*) filter (where last_edited_at >= d7 and created_at < d7),
        -- 사람이 저장한 것 전부(등록+고침). 화면이 "오늘 활동" 으로 쓰는 값.
        'saved_today', count(*) filter (where last_edited_at >= d0),
        'saved_yesterday', count(*) filter (where last_edited_at >= dy and last_edited_at < d0)
      ) from public.resumes),
    'jobs', (select json_build_object(
        'open', count(*) filter (where status = 'open'),
        'today', count(*) filter (where created_at >= d0),
        'yesterday', count(*) filter (where created_at >= dy and created_at < d0),
        'd7', count(*) filter (where created_at >= d7),
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
      'nameless_resumes', (select count(*) from public.resumes where name is null),
      -- 🔴 비공개 이력서는 병원에 안 보인다. 본인은 올렸다고 생각하는데 아무도 못 본다.
      --    실측(8/1~8/4): 저장 21건 중 4건이 비공개였다. 눈에 띄어야 안내할 수 있다.
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
