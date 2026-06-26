-- Phase 2 광고 수익화: 무료권 + 유료 광고 노출 + 결제 주문(포트원)
-- 적용 후 createJob/repostJob에서 free_credits 차감, 결제 승인 시 featured_until/ad_tier 설정.

-- 1) 병원당 무료 게시권(7일 × 4장). 차감은 서버(service_role) 전용 — 클라이언트 위변조 방지.
alter table public.hospitals add column if not exists free_credits int not null default 4;

-- 2) 공고 유료 노출: featured_until(이 시각까지 상단/연장 노출), ad_tier(등급코드, null=무료)
alter table public.jobs add column if not exists featured_until timestamptz;
alter table public.jobs add column if not exists ad_tier text;

-- 3) 광고 결제 주문(포트원). 부가세 10% 분리 저장(공급가/세액/합계).
create table if not exists public.ad_orders (
  id            uuid primary key default gen_random_uuid(),
  merchant_uid  text not null unique,                 -- 우리 주문번호(포트원 전달)
  job_id        uuid references public.jobs(id) on delete set null,
  hospital_id   uuid not null references public.hospitals(id) on delete cascade,
  buyer_id      uuid not null references public.profiles(id) on delete cascade,
  tier          text not null,
  days          int  not null,
  supply_amount int  not null,                         -- 공급가액(원)
  vat           int  not null,                         -- 부가세 10%(원)
  amount        int  not null,                         -- 결제금액 = 공급가 + 부가세
  status        text not null default 'PREPARE' check (status in ('PREPARE','PAID','CANCELED','FAILED')),
  imp_uid       text,                                  -- 포트원 거래 고유번호
  created_at    timestamptz not null default now(),
  paid_at       timestamptz
);
create index if not exists ad_orders_buyer_idx on public.ad_orders(buyer_id);
create index if not exists ad_orders_job_idx   on public.ad_orders(job_id);

alter table public.ad_orders enable row level security;
-- 본인 주문만 조회. 생성/결제검증 변경은 service_role 전용(RLS 우회)이라 별도 insert/update 정책 없음.
drop policy if exists ad_orders_select_own on public.ad_orders;
create policy ad_orders_select_own on public.ad_orders
  for select using (buyer_id = (select auth.uid()));
