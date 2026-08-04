-- 🔴 감사 로그가 **탈퇴 한 번으로 통째로 사라지던 것**.
--
-- 20260804120000 이 actor_id 를 `references profiles(id) on delete cascade` 로 걸었다.
-- 그런데 deleteAccount(mypage/actions.ts)는 auth.admin.deleteUser 를 부르고,
-- profiles.id 는 auth.users(id) 에 cascade 로 묶여 있다. 사슬이 이어진다:
--
--   auth.users 삭제 → profiles 삭제 → admin_actions 삭제
--
-- update·delete 권한을 회수해서 "아무도 못 고친다"고 해놓고, 정작 자기 계정을 지우면
-- 자기가 한 일의 기록이 전부 없어졌다. 감사 로그가 막으려던 게 정확히 그거다.
--
-- 같은 문제의 정답이 이미 이 저장소에 있다 — ad_orders.buyer_id 는 `set null` 이라
-- 계정을 지워도 결제 기록이 남는다(전자상거래법 5년 보존). 같은 방식으로 맞춘다.

alter table public.admin_actions drop constraint if exists admin_actions_actor_id_fkey;
alter table public.admin_actions alter column actor_id drop not null;
alter table public.admin_actions
  add constraint admin_actions_actor_id_fkey
  foreign key (actor_id) references public.profiles(id) on delete set null;

-- 🔴 actor_id 만 null 로 만들면 행은 남는데 **누가 했는지를 잃는다**. 그러면 남은 기록이
--    "누군가 2026-08-04 에 리뷰를 숨겼다" 가 되어 감사로 쓸 수 없다.
--    조치 시점의 이메일을 같이 박아 둔다 — 계정이 사라져도 사람은 식별된다.
alter table public.admin_actions add column if not exists actor_email text not null default '';
alter table public.admin_actions alter column actor_email drop default;

-- insert 정책은 그대로 `actor_id = auth.uid()` 다. actor_id 가 nullable 이 되어도
-- null = auth.uid() 는 NULL(≠true)이라 여전히 거절된다 — 익명 기록을 심을 수 없다.
revoke insert on public.admin_actions from authenticated;
grant insert (actor_id, actor_email, action, target_table, target_id, reason)
  on public.admin_actions to authenticated;
