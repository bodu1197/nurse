-- 관리자 대시보드·통계 집계.
--
-- 🔴 왜 함수인가: 화면 하나가 필요로 하는 숫자가 30개가 넘는다. PostgREST 로 하면 왕복이 30번이고,
--    같은 표를 여러 번 훑는다. 한 번에 만들어 json 으로 돌려준다.
--
-- 🔴 총계만 보여주지 않는다. 회원 수·공고 수 같은 총계는 공개 화면에도 있어 관리자에게 새 정보가 아니다.
--    관리에 필요한 것은 **기간별 증감**과 **처리해야 할 것**이다.

create or replace function public.admin_dashboard()
returns json
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  d0 timestamptz := date_trunc('day', now());
  d7 timestamptz := date_trunc('day', now()) - interval '6 days';
  d30 timestamptz := date_trunc('day', now()) - interval '29 days';
  result json;
begin
  if not public.is_admin() then
    raise exception '관리자 전용입니다' using errcode = '42501';
  end if;

  select json_build_object(
    'members', (select json_build_object(
        'total', count(*),
        'nurse', count(*) filter (where role = 'nurse'),
        'hospital', count(*) filter (where role = 'hospital'),
        'today', count(*) filter (where created_at >= d0),
        'd7', count(*) filter (where created_at >= d7),
        'd30', count(*) filter (where created_at >= d30)
      ) from public.profiles),
    'resumes', (select json_build_object(
        'total', count(*),
        'public', count(*) filter (where is_public),
        'today', count(*) filter (where created_at >= d0),
        'd7', count(*) filter (where created_at >= d7),
        'd30', count(*) filter (where created_at >= d30)
      ) from public.resumes),
    'jobs', (select json_build_object(
        'open', count(*) filter (where status = 'open'),
        'direct', count(*) filter (where source = 'direct'),
        'worknet', count(*) filter (where source = 'worknet'),
        'today', count(*) filter (where created_at >= d0),
        'd7', count(*) filter (where created_at >= d7),
        'closing3', count(*) filter (where status = 'open' and deadline is not null
                                       and deadline::date between current_date and current_date + 3)
      ) from public.jobs),
    'applications', (select json_build_object(
        'total', count(*),
        'today', count(*) filter (where created_at >= d0),
        'd7', count(*) filter (where created_at >= d7)
      ) from public.applications),
    'ads', (select json_build_object(
        'live', count(*) filter (where featured_until > now()),
        'ending7', count(*) filter (where featured_until > now() and featured_until <= now() + interval '7 days')
      ) from public.jobs),
    'revenue', (select json_build_object(
        'today', coalesce(sum(amount) filter (where paid_at >= d0), 0),
        'd30', coalesce(sum(amount) filter (where paid_at >= d30), 0),
        'total', coalesce(sum(amount), 0),
        'count30', count(*) filter (where paid_at >= d30)
      ) from public.ad_orders where status = 'PAID' and tier <> 'admin_test'),
    -- 처리해야 할 것 — 이 화면에서 사람이 실제로 해야 하는 일
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
        'today', coalesce(sum(views) filter (where day = current_date), 0),
        'd7', coalesce(sum(views) filter (where day >= current_date - 6), 0),
        'd30', coalesce(sum(views) filter (where day >= current_date - 29), 0)
      ) from public.page_views)
  ) into result;

  return result;
end;
$$;
revoke execute on function public.admin_dashboard() from public, anon;
grant execute on function public.admin_dashboard() to authenticated;

-- 접속자 통계 상세 — 일별 추이 + 인기 경로.
create or replace function public.admin_traffic(days int default 30)
returns json
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  n int := least(greatest(coalesce(days, 30), 1), 365); -- 임의로 큰 값을 넣어 표를 통째로 훑지 못하게
  result json;
begin
  if not public.is_admin() then
    raise exception '관리자 전용입니다' using errcode = '42501';
  end if;

  select json_build_object(
    'days', (
      -- 방문이 0인 날도 빠뜨리지 않는다 — 빠지면 그래프가 '그날은 잘 나왔다'처럼 보인다.
      select coalesce(json_agg(json_build_object('day', d.day, 'views', coalesce(v.views, 0)) order by d.day), '[]'::json)
      from generate_series(current_date - (n - 1), current_date, interval '1 day') d(day)
      left join (select day, sum(views) views from public.page_views
                 where day >= current_date - (n - 1) group by day) v on v.day = d.day::date
    ),
    'paths', (
      select coalesce(json_agg(t), '[]'::json) from (
        select path, sum(views) views from public.page_views
        where day >= current_date - (n - 1)
        group by path order by sum(views) desc limit 30
      ) t
    ),
    'total', (select coalesce(sum(views), 0) from public.page_views where day >= current_date - (n - 1))
  ) into result;

  return result;
end;
$$;
revoke execute on function public.admin_traffic(int) from public, anon;
grant execute on function public.admin_traffic(int) to authenticated;
