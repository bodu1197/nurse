-- 접속 통계에 "조회수" 밖에 없어서 **순 방문자를 알 수 없었다**
-- (오너 지적 2026-08-06: "순 접속자수를 알 수 없어서 눈을 감고 운전하는 느낌이다").
-- 조회수 3,000 이 사람 100명이 30쪽씩 본 것인지, 3,000명이 한 쪽씩 본 것인지 구분이 안 됐다.
--
-- 🔴 쿠키는 여전히 심지 않는다. 대신 미들웨어가 **IP + 브라우저정보 + 서버만 아는 비밀값**을
--    SHA-256 으로 섞어 16자 지문(vid)만 보낸다. 원본 IP 는 DB 로 넘어오지도 저장되지도 않고,
--    지문만으로는 되돌릴 수 없다. 비밀값(VISITOR_SALT)을 바꾸면 지문은 전부 리셋된다.
--    ⚠️ 한계: 병원·회사처럼 공용 인터넷을 쓰면 여러 명이 한 명으로 뭉친다(오차 5~10%).
--    정확한 1:1 이 필요하면 쿠키를 심어야 하는데, 그건 처리방침이 따라오므로 안 한다.
--
-- 🔴 봇을 사람과 섞지 않는다. 지금까지 조회수에는 구글봇·크롤러가 그대로 들어 있었다.
--    버리지는 않고 **따로 센다** — 검색엔진이 우리 사이트를 도는지가 그 자체로 SEO 게이지다.

-- ── ① 조회수 표에 봇 칸을 만든다 ─────────────────────────────
alter table public.page_views add column if not exists bots int not null default 0;

-- ── ② 방문자 표 ──────────────────────────────────────────────
-- 하루에 사람 하나당 한 행. 그래서 **행 수가 곧 그날의 순 방문자 수**다.
-- 요청마다 쌓지 않으므로(page_views 와 같은 원칙) 조회수가 아무리 늘어도 행은 사람 수만큼이다.
-- ponytail: 보관 기간 제한 없음. 지금은 하루 수백 행이라 문제가 안 된다 —
--   하루 10만 방문을 넘기면 크론에 `delete from visitors where day < today - 400` 한 줄을 넣는다.
create table if not exists public.visitors (
  day      date     not null,
  vid      text     not null,               -- 되돌릴 수 없는 16자 지문
  hits     int      not null default 1,     -- 그날 그 사람이 연 페이지 수
  hour_kst smallint not null,               -- 그날 처음 들어온 시각(한국시간 0~23)
  device   text     not null,               -- mobile | desktop
  ref      text     not null,               -- 유입 도메인(google.com 등) · 'direct'
  primary key (day, vid)
);
create index if not exists visitors_day_idx on public.visitors (day desc);

alter table public.visitors enable row level security;
drop policy if exists visitors_read_admin on public.visitors;
-- page_views 와 같은 정책. admin_traffic 이 invoker 라 읽기는 이 정책을 그대로 탄다.
create policy visitors_read_admin on public.visitors for select using ((select private.is_admin()));
-- 쓰기 정책은 만들지 않는다 — 기록은 아래 함수(security definer)로만 한다.
revoke all on public.visitors from anon, authenticated;
grant select on public.visitors to authenticated;

-- ── ③ 기록 함수 ──────────────────────────────────────────────
-- 🔴 인자가 늘었다. 옛 1개짜리는 **반드시 지운다** — 둘 다 있으면 PostgREST 의 이름 인자
--    호출({p_path})이 어느 쪽인지 모호해져(42725) 기록이 통째로 멈춘다.
--    지운 뒤에도 옛 코드가 보내는 {p_path} 는 새 함수의 기본값으로 그대로 받는다 — 무중단이다.
drop function if exists public.track_page_view(text);

create or replace function public.track_page_view(
  p_path   text,
  p_vid    text    default null,
  p_device text    default null,
  p_ref    text    default null,
  p_bot    boolean default false
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  clean  text;
  d      date    := (now() at time zone 'Asia/Seoul')::date;
  is_bot boolean := coalesce(p_bot, false);
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

  -- 흔한 경우: 이미 있는 칸을 올린다(주키 인덱스 한 번). 여기서 끝나면 아래 상한 검사도 안 한다.
  update public.page_views
     set views = views + (case when is_bot then 0 else 1 end),
         bots  = bots  + (case when is_bot then 1 else 0 end)
   where day = d and path = clean;

  if not found then
    -- 🔴 **새 경로일 때만** 하루 5,000개 상한을 본다. 봇 스캐너는 /wp-login.php, /.env 처럼
    --    없는 주소를 무작위로 때리는데, 경로가 곧 행이라 그대로 두면 이 표가 무한히 는다.
    --    사람 트래픽의 경로는 (동적 구간을 /:id 로 묶은 뒤) 수십 개뿐이라 5,000은 넉넉하다.
    --    상한을 넘겨도 **이미 있는 경로는 위 update 로 계속 센다** — 통계가 멈추지 않는다.
    if not exists (select 1 from public.page_views where day = d offset 5000 limit 1) then
      insert into public.page_views (day, path, views, bots)
      values (d, clean, case when is_bot then 0 else 1 end, case when is_bot then 1 else 0 end)
      -- 같은 새 경로를 두 요청이 동시에 넣을 때를 위해 on conflict 는 남긴다.
      on conflict (day, path) do update
        set views = public.page_views.views + excluded.views,
            bots  = public.page_views.bots  + excluded.bots;
    end if;
  end if;

  -- 사람만 방문자로 센다. 이 함수는 비로그인도 부를 수 있으므로 **받은 값을 전부 검사**한다.
  if is_bot or p_vid is null or p_vid !~ '^[0-9a-f]{16}$' then
    return;
  end if;

  -- 🔴 하루 10만 행 상한. p_vid 는 **호출자가 주는 값**이고 이 함수는 anon 키로 부를 수 있어,
  --    형식만 맞는 난수를 계속 보내면 행이 무한히 는다(순 방문자 숫자도 부풀릴 수 있다).
  --    상한을 넘으면 그날은 방문자만 그만 세고 조회수는 계속 센다 — 통계가 멈춰도 화면은 산다.
  --    offset 은 10만 행에서 멈추므로 평상시(하루 수백 행)에는 그날 행 수만큼만 훑는다.
  if exists (select 1 from public.visitors where day = d offset 100000 limit 1) then
    return;
  end if;

  -- 🔴 on conflict 는 hits 만 올린다 — 시각·기기·유입은 **그날 첫 방문의 값을 지킨다.**
  --    안 그러면 사이트 안에서 페이지를 옮길 때마다 유입 경로가 우리 도메인으로 덮인다.
  -- 🔴 'mobile'/'direct' 문자열은 세 곳이 짝이다 — 여기, src/lib/track.ts, 그리고 화면의
  --    DEVICE_LABEL/REF_LABEL(app/admin/stats/page.tsx). 한 곳만 바꾸면 나머지가 조용히 어긋난다.
  insert into public.visitors (day, vid, hits, hour_kst, device, ref)
  values (
    d, p_vid, 1,
    extract(hour from (now() at time zone 'Asia/Seoul'))::smallint,
    case when p_device = 'mobile' then 'mobile' else 'desktop' end,
    case when p_ref ~ '^[a-z0-9][a-z0-9.-]{0,39}$' then p_ref else 'direct' end
  )
  on conflict (day, vid) do update set hits = public.visitors.hits + 1;
end;
$$;

revoke execute on function public.track_page_view(text, text, text, text, boolean) from public;
grant execute on function public.track_page_view(text, text, text, text, boolean) to anon, authenticated;

-- ── ④ 통계 조회 ──────────────────────────────────────────────
-- 🔴 `security invoker` 를 **명시**한다. create or replace 는 owner·권한만 남기고 보안 타입은
--    기본값으로 되돌리므로, 20260805150000 에서 definer→invoker 로 바꾼 결정이 이 파일에
--    적혀 있지 않으면 다음에 고치는 사람이 조용히 definer 로 되돌릴 수 있다.
create or replace function public.admin_traffic(days int default 30)
returns json
language plpgsql
stable
security invoker
set search_path = public, pg_temp
as $$
declare
  n     int  := least(greatest(coalesce(days, 30), 1), 365);
  today date := (now() at time zone 'Asia/Seoul')::date;
  d_fro date;
  result json;
begin
  if not private.is_admin() then
    raise exception '관리자 전용입니다' using errcode = '42501';
  end if;
  d_fro := today - (n - 1);

  select json_build_object(
    -- 일별: 순 방문자 · 그들이 연 쪽수 · 사람 조회 · 봇 조회를 한 줄에 같이 준다.
    -- 🔴 hits 는 **방문자로 확인된 사람이 연 쪽수**다. views(조회수)와 다르다 —
    --    지문을 못 만든 요청(IP 미상 등)은 views 에만 들어간다. '1인당 몇 쪽' 은 hits 로 낸다.
    'days', (
      select coalesce(json_agg(json_build_object(
               'day', g.day,
               'uniques', coalesce(u.uniques, 0),
               'hits',    coalesce(u.hits, 0),
               'views',   coalesce(v.views, 0),
               'bots',    coalesce(v.bots, 0)) order by g.day), '[]'::json)
      from (select generate_series(d_fro, today, interval '1 day')::date as day) g
      left join (select day, sum(views) views, sum(bots) bots from public.page_views
                 where day >= d_fro group by day) v on v.day = g.day
      left join (select day, count(*) uniques, sum(hits) hits from public.visitors
                 where day >= d_fro group by day) u on u.day = g.day
    ),
    'paths', (
      select coalesce(json_agg(t), '[]'::json) from (
        select path, sum(views) views, sum(bots) bots from public.page_views
        where day >= d_fro
        group by path order by sum(views) desc limit 30
      ) t
    ),
    'total', (select coalesce(sum(views), 0) from public.page_views where day >= d_fro),
    'bots',  (select coalesce(sum(bots),  0) from public.page_views where day >= d_fro),
    -- 🔴 기간 순 방문자는 일별 합이 아니라 **서로 다른 지문의 수**다.
    --    사흘 연속 온 사람은 3이 아니라 1로 센다. 일별을 더하면 실제보다 크게 나온다.
    -- 오늘·어제 값은 따로 세지 않는다. days 배열의 마지막 두 칸이 정확히 그 값이고,
    -- 같은 것을 두 곳에서 세면 언젠가 두 숫자가 어긋난다.
    'uniques',    (select count(distinct vid) from public.visitors where day >= d_fro),
    'returning',  (select count(*) from (
        select vid from public.visitors where day >= d_fro group by vid having count(*) > 1) r),
    -- 아래 셋은 **방문(사람×날짜) 기준**이다. 같은 사람이 다른 날 오면 각각 센다 —
    -- 순 방문자 기준으로 바꾸면 유입 경로가 여러 개인 사람을 어디에 넣을지 답이 없어진다.
    'refs', (
      select coalesce(json_agg(t), '[]'::json) from (
        select ref, count(*) visits from public.visitors where day >= d_fro
        group by ref order by count(*) desc limit 15) t
    ),
    'devices', (
      select coalesce(json_agg(t), '[]'::json) from (
        select device, count(*) visits from public.visitors where day >= d_fro
        group by device order by count(*) desc) t
    ),
    'hours', (
      select coalesce(json_agg(json_build_object('hour', h.h, 'visits', coalesce(c.n, 0)) order by h.h), '[]'::json)
      from generate_series(0, 23) h(h)
      left join (select hour_kst, count(*) n from public.visitors where day >= d_fro
                 group by hour_kst) c on c.hour_kst = h.h
    )
  ) into result;

  return result;
end;
$$;

revoke execute on function public.admin_traffic(int) from public, anon;
grant execute on function public.admin_traffic(int) to authenticated;

-- ── ⑤ 대시보드에도 순 방문자를 얹는다 ────────────────────────
-- 대시보드가 "오늘 조회 414" 만 보여주면, 그게 몇 명인지 모르는 채로 stats 를 또 눌러야 한다.
create or replace function public.admin_dashboard()
returns json
language plpgsql
stable
security invoker   -- 위와 같은 이유로 명시한다(20260805150000 의 결정을 지운다).
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
    'applications', (select json_build_object(
        'total', count(*),
        'today', count(*) filter (where created_at >= d0),
        'yesterday', count(*) filter (where created_at >= dy and created_at < d0),
        'd7', count(*) filter (where created_at >= d7)
      ) from public.applications),
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

-- 🔴 PostgREST 는 함수 목록을 캐시한다. 시그니처를 바꿨으므로 즉시 다시 읽게 한다 —
--    안 하면 배포된 미들웨어가 PGRST202(함수 없음)를 받고 통계가 통째로 멈춘다.
notify pgrst, 'reload schema';
