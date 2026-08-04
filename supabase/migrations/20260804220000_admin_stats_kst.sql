-- 관리자 통계의 "오늘" 이 한국시간이 아니라 UTC 였다.
--
-- 🔴 서버는 UTC 로 돈다(Vercel 기본, 이 저장소에 TZ 설정 없음). date_trunc('day', now()) 는
--    UTC 자정이라 **한국시간 00:00~08:59 에 일어난 일이 전부 "어제" 로 잡힌다.**
--    출근 전에 대시보드를 보면 그 시간대 가입·이력서·매출이 통째로 빠져 보인다.
--    같은 함정을 이 저장소가 이미 겪었다 — lib/date.ts 의 todayKst 와 event 페이지 주석 참조.
--
-- 아래 함수 전부에서 날짜 경계를 KST 로 바꾼다. 그리고 "오늘 0건" 이 왜 0인지 알 수 있게
-- **어제 수치**를 같이 돌려준다 — 0 만 있으면 집계가 깨진 것인지 실제로 없는 것인지 구분이 안 된다.

create or replace function public.admin_dashboard()
returns json
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  -- 한국시간 오늘 자정을 timestamptz 로. 이후 비교는 전부 이 기준이다.
  d0  timestamptz := date_trunc('day', now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul';
  dy  timestamptz := d0 - interval '1 day';   -- 어제 자정
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
    'jobs', (select json_build_object(
        'open', count(*) filter (where status = 'open'),
        'direct', count(*) filter (where source = 'direct'),
        'worknet', count(*) filter (where source = 'worknet'),
        'today', count(*) filter (where created_at >= d0),
        'yesterday', count(*) filter (where created_at >= dy and created_at < d0),
        'd7', count(*) filter (where created_at >= d7),
        'closing3', count(*) filter (where status = 'open' and deadline is not null
                                       and deadline between kst_today and kst_today + 3)
      ) from public.jobs),
    'applications', (select json_build_object(
        'total', count(*),
        'today', count(*) filter (where created_at >= d0),
        'yesterday', count(*) filter (where created_at >= dy and created_at < d0),
        'd7', count(*) filter (where created_at >= d7)
      ) from public.applications),
    'ads', (select json_build_object(
        'live', count(*) filter (where featured_until > now()),
        'ending7', count(*) filter (where featured_until > now() and featured_until <= now() + interval '7 days')
      ) from public.jobs),
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

-- 접속 기록도 한국시간 날짜로 쌓는다 — 안 그러면 새벽 방문이 어제 칸에 들어간다.
create or replace function public.track_page_view(p_path text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  clean text;
begin
  clean := split_part(coalesce(p_path, '/'), '?', 1);
  clean := split_part(clean, '#', 1);
  if clean = '' then clean := '/'; end if;
  if clean !~ '^/[A-Za-z0-9/_.,%~+-]*$' or length(clean) > 120 then
    return;
  end if;
  clean := regexp_replace(clean, '/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}', '/:id', 'g');
  clean := regexp_replace(clean, '/[0-9]+(/|$)', '/:id\1', 'g');
  if length(clean) - length(replace(clean, '/', '')) > 6 then
    return;
  end if;
  clean := left(clean, 80);

  insert into public.page_views (day, path, views)
  values ((now() at time zone 'Asia/Seoul')::date, clean, 1)
  on conflict (day, path) do update set views = public.page_views.views + 1;
end;
$$;

create or replace function public.admin_traffic(days int default 30)
returns json
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  n int := least(greatest(coalesce(days, 30), 1), 365);
  today date := (now() at time zone 'Asia/Seoul')::date;
  result json;
begin
  if not public.is_admin() then
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
$$;
