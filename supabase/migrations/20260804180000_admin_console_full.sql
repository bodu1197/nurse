-- 홈페이지 관리자 페이지 — 지금 코드에 박혀 있어 오너가 못 고치는 것들을 DB 로 옮긴다.
-- 설계: docs/admin-design-2026-08-04.md
--
-- 넣는 것: 공지·FAQ·이벤트 / 문의 접수 / 접속 통계 / 세금계산서 발행 정보

-- ── ① 공지사항 · FAQ · 이벤트 ─────────────────────────────
-- 지금은 src/lib/customerContent.ts 의 TypeScript 배열이라, 공지 한 줄에 코드 수정 + 재배포가 필요하다.
-- 표를 셋으로 나누지 않는다 — 구조가 같은데 셋으로 나누면 관리 화면도 세 벌이 된다.
create table if not exists public.site_posts (
  id           uuid primary key default gen_random_uuid(),
  kind         text not null check (kind in ('notice', 'faq', 'event')),
  title        text not null check (length(btrim(title)) between 1 and 200),
  body         text not null check (length(btrim(body)) between 1 and 20000),
  -- null 이면 비공개(작성 중). 값이 있으면 그 시각부터 공개.
  published_at timestamptz,
  -- 위로 올리고 싶은 글. 같은 sort 안에서는 published_at 최신순.
  sort         int not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists site_posts_kind_idx on public.site_posts (kind, sort desc, published_at desc);
drop trigger if exists site_posts_set_updated_at on public.site_posts;
create trigger site_posts_set_updated_at before update on public.site_posts
  for each row execute function public.set_updated_at();

alter table public.site_posts enable row level security;
-- 공개된 글은 누구나 읽는다(비로그인 포함 — 공지·FAQ 는 공개 정보다).
drop policy if exists site_posts_read on public.site_posts;
create policy site_posts_read on public.site_posts for select
  using (published_at is not null and published_at <= now());
-- 관리자는 비공개(작성 중) 글까지 본다.
drop policy if exists site_posts_read_admin on public.site_posts;
create policy site_posts_read_admin on public.site_posts for select
  using ((select public.is_admin()));
-- 쓰기는 관리자만. 컬럼 권한도 함께 좁힌다(정책 하나에 방어선을 몰지 않는다).
drop policy if exists site_posts_write_admin on public.site_posts;
create policy site_posts_write_admin on public.site_posts for all
  using ((select public.is_admin())) with check ((select public.is_admin()));
revoke all on public.site_posts from anon, authenticated;
grant select on public.site_posts to anon, authenticated;
grant insert (kind, title, body, published_at, sort) on public.site_posts to authenticated;
grant update (kind, title, body, published_at, sort) on public.site_posts to authenticated;
grant delete on public.site_posts to authenticated;

-- ── ② 문의 접수 ───────────────────────────────────────────
-- 지금 /contact 는 mailto 링크뿐이다. 메일함으로 흩어져서 무엇이 처리됐는지 알 방법이 없다.
create table if not exists public.inquiries (
  id          uuid primary key default gen_random_uuid(),
  -- 문의 종류. /contact 가 안내하던 네 가지 + 기타.
  kind        text not null check (kind in ('payment', 'hospital', 'report', 'privacy', 'etc')),
  name        text not null check (length(btrim(name)) between 1 and 50),
  email       text not null check (email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  phone       text check (phone is null or phone ~ '^[0-9-]{9,20}$'),
  subject     text not null check (length(btrim(subject)) between 1 and 200),
  body        text not null check (length(btrim(body)) between 1 and 5000),
  -- 로그인 상태로 보냈으면 누구인지 남긴다(비로그인도 문의할 수 있어야 하므로 nullable).
  author_id   uuid references public.profiles(id) on delete set null,
  status      text not null default 'open' check (status in ('open', 'answered', 'closed')),
  admin_memo  text,
  answered_at timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists inquiries_status_idx on public.inquiries (status, created_at desc);

alter table public.inquiries enable row level security;
-- 문의는 누구나 넣을 수 있다(비로그인 포함). 다만 **읽기는 관리자만** — 남의 문의가 보이면 안 된다.
drop policy if exists inquiries_insert_any on public.inquiries;
create policy inquiries_insert_any on public.inquiries for insert with check (true);
drop policy if exists inquiries_read_admin on public.inquiries;
create policy inquiries_read_admin on public.inquiries for select using ((select public.is_admin()));
drop policy if exists inquiries_update_admin on public.inquiries;
create policy inquiries_update_admin on public.inquiries for update
  using ((select public.is_admin())) with check ((select public.is_admin()));

revoke all on public.inquiries from anon, authenticated;
grant select on public.inquiries to authenticated;
-- 🔴 status·admin_memo·answered_at 은 넣을 때 못 정한다. 열어두면 문의를 넣으면서
--    스스로 '답변완료'로 만들어 목록에서 감출 수 있다.
grant insert (kind, name, email, phone, subject, body, author_id) on public.inquiries to anon, authenticated;
grant update (status, admin_memo, answered_at) on public.inquiries to authenticated;

-- ── ③ 접속 통계 ───────────────────────────────────────────
-- 요청마다 행을 쌓지 않는다 — (날짜, 경로) 한 칸을 올린다. 하루 수천 요청이어도 행은 경로 수만큼이다.
create table if not exists public.page_views (
  day    date not null,
  path   text not null,
  views  int  not null default 0,
  primary key (day, path)
);
create index if not exists page_views_day_idx on public.page_views (day desc);

alter table public.page_views enable row level security;
drop policy if exists page_views_read_admin on public.page_views;
create policy page_views_read_admin on public.page_views for select using ((select public.is_admin()));
-- 쓰기 정책을 만들지 않는다 — 기록은 아래 함수(security definer)로만 한다.
revoke all on public.page_views from anon, authenticated;
grant select on public.page_views to authenticated;

-- 🔴 누구나 부를 수 있는 함수다(비로그인 방문도 세야 하므로). 그래서 **경로만 받고 그 외에는
--    아무것도 못 하게** 만든다. 경로는 200자로 자르고 쿼리스트링은 버린다
--    (개인정보가 섞인 파라미터를 통계 표에 쌓지 않기 위해서다).
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
  if clean = '' then clean := '/'; end if;
  clean := left(clean, 200);
  insert into public.page_views (day, path, views)
  values (current_date, clean, 1)
  on conflict (day, path) do update set views = public.page_views.views + 1;
end;
$$;
revoke execute on function public.track_page_view(text) from public;
grant execute on function public.track_page_view(text) to anon, authenticated;

-- ── ④ 세금계산서 발행 정보 ────────────────────────────────
-- 실제 발행은 홈택스·팝빌 등 외부에서 한다. 여기서는 **발행에 필요한 정보와 발행 여부**를 관리한다
-- (누구에게 얼마짜리를 아직 안 끊었는지 화면에서 알 수 있어야 한다).
alter table public.ad_orders add column if not exists tax_biz_no    text;
alter table public.ad_orders add column if not exists tax_biz_name  text;
alter table public.ad_orders add column if not exists tax_ceo       text;
alter table public.ad_orders add column if not exists tax_email     text;
alter table public.ad_orders add column if not exists tax_issued_at timestamptz;
alter table public.ad_orders add column if not exists tax_invoice_no text;

comment on column public.ad_orders.tax_issued_at is
  '세금계산서 발행 완료 시각. null 이면 미발행(관리자 화면의 발행 대상 목록에 뜬다).';
