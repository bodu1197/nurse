-- 🔴 광고 캐시 반환을 **한 문장**으로 만든다.
--
-- 종전(앱 코드): ① ad_orders 를 조건부 UPDATE 해서 cash_used 를 0 으로 내리고
--                ② 이어서 release_ad_cash 로 profiles.ad_cash 를 올렸다.
--    ①과 ② 사이에서 프로세스가 죽으면(배포 중 종료 등) **손님 캐시가 그냥 사라진다.**
--    주문에는 아무 흔적도 안 남는다 — ②가 error 를 돌려줬을 때만 메모가 붙기 때문이다.
--    돈이 걸린 두 표를 앱에서 이어 쓰던 자리라, 트랜잭션 하나로 합친다.
--
-- 반환값 = 실제로 돌려준 금액(원). 0 이면 아무것도 하지 않았다는 뜻이다
-- (이미 누가 돌려줬거나, 그사이 결제가 확인돼 상태가 허용 목록 밖으로 갔거나, 주인이 없는 주문).
create or replace function public.release_ad_order_cash(p_order uuid, p_allowed text[], p_next text)
returns int language plpgsql security invoker set search_path = '' as $$
declare v_buyer uuid; v_amount int;
begin
  -- for update 로 그 주문을 잠근다 — 동시 요청 둘이 같은 캐시를 두 번 돌려주지 못하게.
  select buyer_id, cash_used into v_buyer, v_amount
    from public.ad_orders where id = p_order for update;
  if v_amount is null or v_amount <= 0 then return 0; end if;
  -- 🔒 주인이 없는 주문(탈퇴 회원)은 돌려줄 곳이 없다. 기록을 흐리지 않도록 아무것도 바꾸지 않는다.
  if v_buyer is null then return 0; end if;

  update public.ad_orders set status = p_next, cash_used = 0
   where id = p_order and status = any(p_allowed) and cash_used > 0;
  if not found then return 0; end if;   -- 그사이 결제가 확인됐다(PAID 등) — 손대지 않는다

  update public.profiles set ad_cash = ad_cash + v_amount where id = v_buyer;
  return v_amount;
end $$;
comment on function public.release_ad_order_cash(uuid, text[], text) is
  '결제되지 않은 주문의 광고 캐시를 돌려준다(주문 상태 전이 + 잔액 복구를 한 트랜잭션으로). 서버(service_role) 전용.';

-- 🔒 병원이 직접 부를 수 있으면 자기 캐시를 무한히 늘릴 수 있다.
revoke execute on function public.release_ad_order_cash(uuid, text[], text) from public, anon, authenticated;

-- release_ad_cash 는 남겨 둔다 — 이제 앱은 부르지 않지만, 위 함수가 손대지 않는 건
-- (주인 없는 주문, 이미 상태가 넘어간 건)을 운영이 손으로 되돌릴 때 쓰는 유일한 지렛대다.
