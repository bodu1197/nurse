-- 관리자 페이지 보강 — 검증에서 나온 것들.

-- ── ① 접속 기록이 공격자에게 열려 있었다 ────────────────────
--
-- 🔴 track_page_view 는 anon 에게 열려 있고(비로그인 방문도 세야 한다) 경로를 검사하지 않았다.
--    (day, path) 가 기본키라 **행 수를 부르는 쪽이 정한다** — 공개 anon 키로 임의 경로를
--    무한히 넣어 표를 부풀릴 수 있다. 공격이 아니어도 문제다: /jobs/<uuid> 를 크롤러가 훑기만 해도
--    공고 수만큼 행이 생기고, 그러면 "어느 페이지가 인기 있나" 를 볼 수 없다(전부 1회씩이다).
--
-- 두 가지를 한다.
--   · 동적 구간(uuid·숫자)을 `:id` 로 묶는다 → /jobs/<uuid> 2,015개가 /jobs/:id 한 줄이 된다.
--     개인정보(이력서 주인 id, 주문 id)가 통계 표에 남지 않는 효과도 같이 얻는다.
--   · 모양이 경로답지 않으면 조용히 버린다.
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

  -- 경로답지 않으면 버린다. 슬래시로 시작하고, 흔한 경로 문자만, 120자 이내.
  if clean !~ '^/[A-Za-z0-9/_.,%~+-]*$' or length(clean) > 120 then
    return;
  end if;

  -- 동적 구간을 묶는다: uuid → :id, 숫자 → :id
  clean := regexp_replace(clean, '/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}', '/:id', 'g');
  clean := regexp_replace(clean, '/[0-9]+(/|$)', '/:id\1', 'g');
  -- 그래도 이상하게 깊으면(경로 조작) 버린다 — 정상 라우트는 5단계를 넘지 않는다.
  if length(clean) - length(replace(clean, '/', '')) > 6 then
    return;
  end if;
  clean := left(clean, 80);

  insert into public.page_views (day, path, views)
  values (current_date, clean, 1)
  on conflict (day, path) do update set views = public.page_views.views + 1;
end;
$$;

-- ── ② 문의 작성자를 위조할 수 있었다 ────────────────────────
-- author_id 를 넣을 수 있으면 비로그인이 남의 profile_id 를 작성자로 박을 수 있다.
-- 서버 액션이 넣던 값이지만, 값을 정하는 쪽은 DB 여야 한다.
revoke insert on public.inquiries from anon, authenticated;
grant insert (kind, name, email, phone, subject, body) on public.inquiries to anon, authenticated;

create or replace function public.inquiries_stamp_author()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  new.author_id := (select auth.uid()); -- 비로그인이면 null
  return new;
end;
$$;
drop trigger if exists inquiries_stamp_author on public.inquiries;
create trigger inquiries_stamp_author before insert on public.inquiries
  for each row execute function public.inquiries_stamp_author();

-- ── ③ 관리자 쓰기를 RLS 로 옮긴다 ───────────────────────────
--
-- 🔴 20260804120000 이 "권한은 service_role 이 아니라 RLS 로 준다"고 정해놓고,
--    광고 연장·세금계산서 저장·이력서 공개는 service_role 로 만들었다. 규칙을 스스로 어긴 것이라
--    되돌린다. **컬럼까지 좁혀서** 연다 — 정책만 열면 그 표의 모든 컬럼이 관리자에게 쓰기 가능해진다.
drop policy if exists jobs_update_admin on public.jobs;
create policy jobs_update_admin on public.jobs for update
  using ((select public.is_admin())) with check ((select public.is_admin()));
grant update (featured_until, ad_tier) on public.jobs to authenticated;

drop policy if exists ad_orders_update_admin on public.ad_orders;
create policy ad_orders_update_admin on public.ad_orders for update
  using ((select public.is_admin())) with check ((select public.is_admin()));
revoke update on public.ad_orders from authenticated;
grant update (tax_biz_no, tax_biz_name, tax_ceo, tax_email, tax_issued_at, tax_invoice_no)
  on public.ad_orders to authenticated;

drop policy if exists resumes_update_admin on public.resumes;
create policy resumes_update_admin on public.resumes for update
  using ((select public.is_admin())) with check ((select public.is_admin()));
-- resumes 는 본인 수정이 이미 컬럼 단위로 열려 있다. is_public 은 본인도 쓰는 컬럼이라 추가 grant 불필요.

-- ── ④ 대시보드가 통계 표를 통째로 훑었다 ────────────────────
-- traffic 집계에 기간 조건이 없어 page_views 전체를 읽었다. ①의 팽창과 겹치면 그대로 커진다.
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
        'total', count(*), 'nurse', count(*) filter (where role = 'nurse'),
        'hospital', count(*) filter (where role = 'hospital'),
        'today', count(*) filter (where created_at >= d0),
        'd7', count(*) filter (where created_at >= d7),
        'd30', count(*) filter (where created_at >= d30)
      ) from public.profiles),
    'resumes', (select json_build_object(
        'total', count(*), 'public', count(*) filter (where is_public),
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
        'total', count(*), 'today', count(*) filter (where created_at >= d0),
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
    'todo', json_build_object(
      'inquiries', (select count(*) from public.inquiries where status = 'open'),
      -- 🔴 /admin/invoices 목록(getTaxTargets)과 **정확히 같은 조건**이어야 한다.
      --    어긋나면 "1건 남았다는데 목록은 비어 있다" 가 된다.
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
      ) from public.page_views where day >= current_date - 29)  -- 기간 밖은 읽지 않는다
  ) into result;

  return result;
end;
$$;

-- ── ⑤ 통계 날짜가 timestamp 로 나왔다 ───────────────────────
-- generate_series(date, date, interval) 는 timestamp 를 돌려준다. 그래서 JSON 에
-- "2026-08-04T00:00:00" 이 실려 화면 축 라벨이 "08.04T00:00:00" 로 깨졌다. date 로 캐스팅한다.
create or replace function public.admin_traffic(days int default 30)
returns json
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  n int := least(greatest(coalesce(days, 30), 1), 365);
  result json;
begin
  if not public.is_admin() then
    raise exception '관리자 전용입니다' using errcode = '42501';
  end if;

  select json_build_object(
    'days', (
      -- 방문이 0인 날도 빠뜨리지 않는다 — 빠지면 그래프가 '그날은 잘 나왔다'처럼 보인다.
      select coalesce(json_agg(json_build_object('day', d.day, 'views', coalesce(v.views, 0)) order by d.day), '[]'::json)
      from (select generate_series(current_date - (n - 1), current_date, interval '1 day')::date as day) d
      left join (select day, sum(views) views from public.page_views
                 where day >= current_date - (n - 1) group by day) v on v.day = d.day
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

-- ── ⑥ 공지·FAQ 를 마이그레이션에서 이관한다 ─────────────────
--
-- 🔴 표만 만들고 내용을 안 옮기면, 새 환경에 배포하는 순간 /notice·/faq 가 텅 빈다
--    (기존 글은 src/lib/customerContent.ts 에 있었고 그 파일에서 지웠다).
--    이미 들어 있으면 건드리지 않는다 — 마이그레이션을 다시 돌려도 중복되지 않아야 한다.
insert into public.site_posts (kind, title, body, published_at, sort)
select * from (values
  ('notice', '널스넷이 정식 오픈 하였습니다.',
   E'안녕하세요, 널스넷 회원 여러분!\n\n저희 널스넷은 2024년 7월 1일에 정식으로 출범하게 되었음을 알려드립니다. 널스넷은 대형 간호사 커뮤니티를 기반으로 만들어졌으며, 간호사분들과 의사분들이 모두 만족할 수 있는 전문적인 커뮤니티입니다.\n\n저희는 회원 여러분의 전문성과 경험을 공유하고, 서로의 성장을 도울 수 있는 공간을 제공하기 위해 최선을 다할 것입니다. 다양한 정보와 유익한 콘텐츠를 통해 모든 회원들이 함께 발전할 수 있도록 많은 참여와 관심 부탁드립니다.\n\n감사합니다.\n\n널스넷 운영팀 드림.',
   timestamptz '2024-07-22 00:00:00+09', 0),
  ('faq', '채용정보 스크랩을 하고 싶은데 어떻게 하나요?',
   '회원 로그인 후, 스크랩하고자 하는 채용정보를 연 다음 상단의 스크랩(별 모양) 버튼을 누르시면 [마이페이지 > 스크랩]에 저장됩니다.',
   timestamptz '2024-07-22 00:00:00+09', 10),
  ('faq', '이력서는 몇 개까지 등록할 수 있나요?',
   '널스넷에서는 하나의 아이디당 1개의 이력서를 등록할 수 있습니다.',
   timestamptz '2024-07-22 00:00:00+09', 5)
) as seed(kind, title, body, published_at, sort)
where not exists (select 1 from public.site_posts s where s.kind = seed.kind and s.title = seed.title);
