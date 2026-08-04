-- 결제 사고의 **사유**를 담을 곳. 지금은 상태 네 글자 말고 아무 단서도 안 남는다.
--
-- 🔴 왜 status 값을 늘리지 않나
--    ad_orders_status_check 는 이미 PREPARE·PAID·CANCELED·FAILED 를 갖고 있다(CANCELED 는 쓰는 코드가 0건).
--    "금액 불일치"·"손님이 결제창 닫음"·"포트원에서 취소" 를 상태로 구분하려면 값을 3개 더 늘려야 하고,
--    그러면 화면·필터·매출 집계가 전부 그 값들을 알아야 한다. 컬럼 하나가 훨씬 싸다.
alter table public.ad_orders add column if not exists note text;

comment on column public.ad_orders.note is
  '결제 실패·취소 사유(사람이 읽는 문장). 상태값으로 나누지 않는 이유는 마이그레이션 주석 참조.';
