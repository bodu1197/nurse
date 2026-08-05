-- 💰 광고 캐시 — "완전 무료 광고" 를 없애고 구조를 캐시 잔액 하나로 단순화한다.
--
-- 오너 확정 2026-08-05:
--   · "지금 코드는 너무 복잡하다. 병원 회원되면 70000 캐시 자동 지급해라. 1주 광고비는 8만원부터."
--   · "병원이 1주 내면 1만원 돈으로 지불하게. 즉 완전 무료 광고는 없애라."
--
-- 왜 이게 더 단순한가: 종전에는 무료 게시를 막으려고 자물쇠가 셋이었다
-- (hospitals.free_credits + ad_credit_used.profile_id + ad_credit_used.business_no).
-- 그런데 **지급 캐시(70,000) < 최소 광고비(80,000)** 라, 첫 광고부터 반드시 현금이 나간다.
-- 공짜가 아예 없으니 "공짜를 몇 번 받았나" 를 셀 이유도 없다 — 잔액 하나면 끝난다.
--
-- 🔒 캐시는 **회원(profiles)** 에 둔다. hospitals 는 심평원 명부 81,430곳이라 거기 두면
--    한 계정이 명부의 병원을 갈아타며 반복 수령할 수 있다(오너 지적: "명부를 기준으로 하면 안 되지").

alter table public.profiles add column if not exists ad_cash int not null default 0;
comment on column public.profiles.ad_cash is
  '광고 캐시(원). 병원 회원 가입 시 1회 지급되고 광고 결제에 먼저 쓰인다. 지급액 < 최소 광고비라 공짜 광고는 성립하지 않는다.';

alter table public.ad_orders add column if not exists cash_used int not null default 0;
comment on column public.ad_orders.cash_used is
  '이 주문에서 캐시로 낸 금액(원). amount 는 카드로 실제 청구한 금액이다 — 매출 집계가 캐시에 오염되지 않는다.';

-- 이미 가입한 병원 회원에게도 지급한다. 공짜가 아니므로(캐시만으로는 광고를 못 산다) 소급해도 안전하다.
-- 🔴 가입일 조건이 **재지급을 막는다.** 이게 없으면 마이그레이션을 다시 돌릴 때
--    캐시를 다 쓴 병원(ad_cash = 0)이 70,000 을 또 받는다. 이 날짜 뒤 가입자는
--    아래 트리거가 가입하는 순간에 지급하므로 여기서 볼 필요가 없다.
update public.profiles set ad_cash = 70000
 where role = 'hospital' and ad_cash = 0 and created_at < timestamptz '2026-08-06';

-- ── 자물쇠 셋을 걷어낸다 ─────────────────────────────────────────────────────
-- 무료 광고 자체가 없어졌으므로 "무료를 몇 번 받았나" 를 기록할 이유가 없다.
drop table if exists public.ad_credit_used;
alter table public.hospitals drop column if exists free_credits;

-- 🔴 캐시 차감은 **한 문장**으로 한다. 읽고-빼고-쓰면 같은 병원의 두 결제가 동시에 들어올 때
--    둘 다 옛 잔액을 읽어 캐시가 두 번 쓰인다. greatest(...,0) 로 음수도 막는다.
create or replace function public.spend_ad_cash(p_profile uuid, p_amount int)
returns int language sql security invoker set search_path = '' as $$
  update public.profiles set ad_cash = greatest(0, ad_cash - p_amount)
   where id = p_profile returning ad_cash;
$$;
comment on function public.spend_ad_cash(uuid, int) is
  '광고 캐시 차감(원자적). 결제 활성화 시 서버(service_role)만 호출한다.';
-- 🔒 병원이 직접 부를 수 있으면 남의 캐시를 태울 수 있다. PostgREST 로 노출하지 않는다.
revoke execute on function public.spend_ad_cash(uuid, int) from public, anon, authenticated;

-- ── 가입 지급 ────────────────────────────────────────────────────────────────
-- 🔴 앱이 아니라 DB 에서 준다. 가입 경로가 셋이라(이메일 트리거·카카오 콜백·네이버 콜백)
--    앱에 넣으면 한 군데를 빠뜨리는 순간 "어떤 병원은 받고 어떤 병원은 못 받는" 일이 생긴다.
-- 🔒 금액을 여기서 못 올린다: profiles.ad_cash 는 authenticated 에게 UPDATE 권한이 없다
--    (컬럼 단위 GRANT 허용 목록에 없음 — 확인 2026-08-05).
-- ⚠️ 금액은 src/lib/ads.ts 의 SIGNUP_AD_CASH 와 같아야 한다(화면 안내가 그 값을 쓴다).
create or replace function public.grant_signup_ad_cash()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.role = 'hospital'
     and (tg_op = 'INSERT' or old.role is distinct from 'hospital')
     and new.ad_cash = 0 then
    new.ad_cash := 70000;
  end if;
  return new;
end $$;
revoke execute on function public.grant_signup_ad_cash() from public, anon, authenticated;

drop trigger if exists profiles_grant_signup_ad_cash on public.profiles;
create trigger profiles_grant_signup_ad_cash
  before insert or update of role on public.profiles
  for each row execute function public.grant_signup_ad_cash();
