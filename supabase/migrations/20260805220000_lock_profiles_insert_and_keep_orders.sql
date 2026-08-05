-- 🔴 광고비 결제 전생애 검증(2026-08-05)이 잡은 DB 결함 두 건.
--
-- ① profiles 를 손님이 직접 INSERT 할 수 있었다 → 스스로 admin 이 되거나 광고 캐시를 찍어낸다
--    profiles_insert_own 의 with check 는 `auth.uid() = id` 만 본다. role·ad_cash 는 보지 않는다.
--    그리고 UPDATE 는 20260625182439 에서 회수했는데 **INSERT 는 회수하지 않았다**
--    (Supabase 기본 grant 가 그대로 살아 있다).
--    그래서 profiles 행이 없는 로그인 계정이면 anon 키 + 자기 세션으로 이 한 줄이 통했다:
--        POST /rest/v1/profiles  {"id":"<내 uid>","role":"admin"}
--      → is_admin() 이 true → /admin 전체(모든 결제내역·이력서 PII), activateAdFree(결제 없이 광고 켜기),
--        extendAd(광고 무기한 연장)가 열린다.
--        {"role":"hospital","ad_cash":79900} 이면 trigger 는 `new.ad_cash = 0` 일 때만 덮으므로
--        79,900원이 그대로 남아 80,000원짜리 1주 광고를 100원에 산다.
--    "행이 이미 있으면 PK 충돌로 막힌다" 가 유일한 방어선이었는데, 행이 없는 계정은 실제로 생긴다 —
--    lib/data/user.ts 가 스스로 그렇게 적어 두고 있다("가입 트리거가 실패한 계정에서 실제로 난다").
--    🔒 앱에는 사용자 클라이언트로 profiles 를 insert/upsert 하는 코드가 한 곳도 없다(확인 2026-08-05).
--       행 생성은 SECURITY DEFINER 트리거(handle_new_user)만 하므로 회수해도 가입이 깨지지 않는다.
revoke insert on public.profiles from anon, authenticated;
drop policy if exists profiles_insert_own on public.profiles;

-- ② 병원 행이 지워지면 그 병원의 **결제 기록이 통째로 사라졌다**
--    ad_orders.hospital_id 가 `on delete cascade` 다. 같은 사고를 buyer_id 에서는 이미 고쳤는데
--    (20260724140000: 전자상거래법 5년 보존 + 포트원 정산 대사) hospital_id 만 남아 있었다.
--    hospitals 는 심평원 명부 81,430곳을 담는 **동기화 대상 표**이고, 실제로 마이그레이션이
--    그 표를 통째로 지운 전례가 있다(20260724180000: `delete from hospitals where source='worknet'`).
--    다음 명부 재동기화나 중복 정리 한 줄에 결제 기록이 복구 불가로 없어진다.
--    거래는 남기고 상대만 지운다 — 화면은 이미 null 을 견딘다(/admin/orders 는 `hospital?.name ?? "-"`).
alter table public.ad_orders alter column hospital_id drop not null;
alter table public.ad_orders drop constraint if exists ad_orders_hospital_id_fkey;
alter table public.ad_orders
  add constraint ad_orders_hospital_id_fkey
  foreign key (hospital_id) references public.hospitals(id) on delete set null;
