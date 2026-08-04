-- 관리자 콘솔 바닥 — 감사 로그 + 관리자 읽기 권한.
-- 설계: docs/admin-design-2026-08-04.md
--
-- 🔴 권한을 service_role 이 아니라 **RLS 로** 준다(설계 결정 1).
--    lib/supabase/admin.ts 주석이 "사용자가 넘긴 id 를 그대로 조회하는 데 쓰면 안 된다"고 못박았는데
--    관리자 화면은 본질이 그 용법이다(운영자가 입력한 회원 id 로 조회). service_role 로 만들면
--    화면 전체가 그 규칙을 상시 위반하고, requireAdmin() 한 줄이 방어선의 전부가 된다.
--    RLS 로 하면 앱 게이트가 뚫려도 DB 가 role='admin' 을 다시 본다 — 방어선이 2겹이다.
--
-- is_admin() 은 이미 있다(20260724200000). 커뮤니티 3테이블이 쓰는 것과 같은 함수다.

-- ── 감사 로그 ────────────────────────────────────────────────
-- 관리자가 남의 데이터를 고칠 수 있게 되는 순간, 누가 언제 무엇을 왜 바꿨는지 남지 않으면
-- 사고가 나도 추적이 안 된다. 관리자 5명이 서로를 확인할 방법도 없다.
create table if not exists public.admin_actions (
  id           uuid primary key default gen_random_uuid(),
  actor_id     uuid not null references public.profiles(id) on delete cascade,
  action       text not null,   -- 'ad.free_activate' | 'review.hide' | 'user.suspend' ...
  target_table text not null,
  target_id    text not null,
  -- 🔴 not null 이 핵심이다. 사유를 안 적으면 DB 가 거절한다 —
  --    "왜 지웠느냐"에 답할 수 없는 조치를 애초에 만들지 못하게 한다.
  reason       text not null,
  created_at   timestamptz not null default now()
);
create index if not exists admin_actions_created_idx on public.admin_actions (created_at desc);
create index if not exists admin_actions_target_idx on public.admin_actions (target_table, target_id);

alter table public.admin_actions enable row level security;

drop policy if exists admin_actions_select on public.admin_actions;
create policy admin_actions_select on public.admin_actions for select
  using ((select public.is_admin()));

-- actor_id 를 세션 사용자로 고정한다 — 남의 이름으로 기록을 남기지 못하게.
drop policy if exists admin_actions_insert on public.admin_actions;
create policy admin_actions_insert on public.admin_actions for insert
  with check (actor_id = (select auth.uid()) and (select public.is_admin()));

-- update·delete 정책을 만들지 않는다 = **로그인한 사용자는** 못 고치고 못 지운다. 로그가 고쳐지면 로그가 아니다.
-- (service_role 은 RLS 와 grant 를 모두 우회한다 — 앱 코드가 이 표를 수정하지 않는 것이 나머지 절반이다.)
-- 정책이 없어도 Supabase 기본 grant 는 남아 있으므로 권한 자체를 회수한다(정책 실수 대비).
revoke update, delete on public.admin_actions from authenticated, anon;
revoke insert on public.admin_actions from anon;
revoke insert on public.admin_actions from authenticated;
grant insert (actor_id, action, target_table, target_id, reason) on public.admin_actions to authenticated;

-- ── 관리자 읽기 ──────────────────────────────────────────────
-- 정책은 permissive(OR) 라 기존 정책을 건드리지 않고 **더한다**. 문제가 생기면 이 5개만 drop 하면
-- 원래대로 돌아간다 — 기존 정책 본문을 고치면 되돌릴 때 일반 회원 권한까지 흔들린다.
--
-- 읽기만 연다. 쓰기(숨김·정지·이전)는 화면과 함께 다음 단계에서 연다.
--
-- 🔴 resumes 는 이름·전화가 든 표다. 관리자에게 여는 것은 의도된 것이다 —
--    개인정보 열람·삭제 요청 대응은 법정 의무이고, 지금은 그 대응을 SQL 로만 할 수 있다.
--    관리자 계정이 뚫리면 7,270건이 열린다는 뜻이기도 하다. 감사 로그가 그래서 먼저 있다.
drop policy if exists profiles_select_admin on public.profiles;
create policy profiles_select_admin on public.profiles for select
  using ((select public.is_admin()));

drop policy if exists resumes_select_admin on public.resumes;
create policy resumes_select_admin on public.resumes for select
  using ((select public.is_admin()));

-- 숨김(status='hidden')·미결제(draft) 공고까지 보여야 관리가 된다.
drop policy if exists jobs_select_admin on public.jobs;
create policy jobs_select_admin on public.jobs for select
  using ((select public.is_admin()));

drop policy if exists ad_orders_select_admin on public.ad_orders;
create policy ad_orders_select_admin on public.ad_orders for select
  using ((select public.is_admin()));

drop policy if exists applications_select_admin on public.applications;
create policy applications_select_admin on public.applications for select
  using ((select public.is_admin()));

-- hospitals 는 이미 hospitals_select_all(true) 라 더할 것이 없다.
