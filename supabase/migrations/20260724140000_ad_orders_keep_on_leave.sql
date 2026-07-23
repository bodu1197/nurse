-- 회원이 탈퇴해도 결제 기록은 남아야 한다.
--
-- ad_orders.buyer_id 가 `not null references profiles(id) on delete cascade` 라서
-- 탈퇴하는 순간 그 회원의 광고 주문·결제 내역이 통째로 삭제된다.
--  · 전자상거래법상 대금결제 기록은 5년 보존 대상이다.
--  · 포트원(결제대행) 정산 대사도 불가능해진다.
-- 탈퇴 기능을 만드는 이 시점에 반드시 함께 고쳐야 하는 항목이다.
--
-- 주문한 사람이 누구였는지는 지우고(개인정보 파기), 거래 자체는 남긴다.
alter table public.ad_orders alter column buyer_id drop not null;

alter table public.ad_orders drop constraint if exists ad_orders_buyer_id_fkey;
alter table public.ad_orders
  add constraint ad_orders_buyer_id_fkey
  foreign key (buyer_id) references public.profiles(id) on delete set null;
