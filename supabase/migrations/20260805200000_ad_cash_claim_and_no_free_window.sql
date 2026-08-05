-- 🔴 /review8 이 잡은 CRITICAL 두 건을 막는다(2026-08-05).
--
-- ① 광고 캐시를 두 번 쓸 수 있었다
--    종전: 결제 준비(prepare)에서는 캐시를 **약속만** 하고, 실제 차감은 결제 완료(activate)에서 했다.
--    그 사이를 30분만 벌리면 두 주문이 같은 70,000 을 각각 약속받았고, 둘 다 결제되면
--    두 번째 차감은 greatest(...,0) 에 먹혀 조용히 0원이 빠졌다.
--    → 8만원짜리 광고 두 개를 2만원에 사고, 반복하면 몇 개든 살 수 있었다.
--    이제 **잡는 순간 잔액에서 뺀다**(claim). 결제가 안 되면 돌려준다(release).
--
-- ② "완전 무료 광고는 없다" 가 DB 에서 거짓이었다
--    jobs_listed.is_live 에 `posted_at >= now() - 7일` 이 남아 있었다. 다시 게시(repostJob)가
--    posted_at 을 새로 찍으므로, 1주를 사고 6일째에 마감→다시 게시를 누르면 **공짜 7일이 붙었다**.
--    → 우리 공고(워크넷 수집분 제외)의 노출 조건에서 그 조항을 뺀다.
--    실측 2026-08-05: 노출 중인 우리 공고 41건 전부 featured_until 이 살아 있어 잃는 공고가 없다.

-- ── ① 캐시 claim / release ───────────────────────────────────────────────────
-- 🔒 잔액을 읽고-빼는 두 문장으로 나누면 동시 요청 둘이 같은 잔액을 본다.
--    `for update` 로 그 행을 잠근 뒤 빼서, 실제로 잡은 금액만 돌려준다.
create or replace function public.claim_ad_cash(p_profile uuid, p_want int)
returns int language plpgsql security invoker set search_path = '' as $$
declare v_before int; v_claimed int;
begin
  select ad_cash into v_before from public.profiles where id = p_profile for update;
  if v_before is null then return 0; end if;
  v_claimed := least(v_before, greatest(coalesce(p_want, 0), 0));
  update public.profiles set ad_cash = ad_cash - v_claimed where id = p_profile;
  return v_claimed;
end $$;
comment on function public.claim_ad_cash(uuid, int) is
  '광고 캐시를 실제로 잡는다(원자적). 잔액이 모자라면 남은 만큼만 잡고 그 값을 돌려준다. 서버(service_role) 전용.';

create or replace function public.release_ad_cash(p_profile uuid, p_amount int)
returns void language sql security invoker set search_path = '' as $$
  update public.profiles set ad_cash = ad_cash + greatest(coalesce(p_amount, 0), 0)
   where id = p_profile;
$$;
comment on function public.release_ad_cash(uuid, int) is
  '잡아둔 광고 캐시를 되돌린다. 결제가 끝내 안 된 주문에서만 부른다. 서버(service_role) 전용.';

-- 🔒 병원이 직접 부를 수 있으면 남의 캐시를 태우거나 자기 캐시를 무한히 늘릴 수 있다.
revoke execute on function public.claim_ad_cash(uuid, int) from public, anon, authenticated;
revoke execute on function public.release_ad_cash(uuid, int) from public, anon, authenticated;

-- 종전 방식(활성화 때 차감)은 위 ①의 원인이었다. 남겨두면 다시 쓰인다.
drop function if exists public.spend_ad_cash(uuid, int);

-- 잔액·사용액이 음수가 되는 경로는 없어야 한다 — 있으면 캐시가 늘어난다.
alter table public.profiles   drop constraint if exists profiles_ad_cash_nonneg;
alter table public.profiles   add  constraint profiles_ad_cash_nonneg check (ad_cash >= 0);
alter table public.ad_orders  drop constraint if exists ad_orders_cash_used_nonneg;
alter table public.ad_orders  add  constraint ad_orders_cash_used_nonneg check (cash_used >= 0);

-- 결제창을 닫고 떠난 주문은 EXPIRED 로 만들고 캐시를 돌려준다(앱의 reclaimStaleAdCash).
-- 🔴 EXPIRED 는 **되살아나지 않는다** — 캐시를 이미 돌려줬으므로 이 주문이 나중에 활성화되면
--    캐시를 공짜로 얻은 셈이 된다. activateAdOrder 가 EXPIRED 를 선점 대상에서 제외한다.
alter table public.ad_orders drop constraint if exists ad_orders_status_check;
alter table public.ad_orders add  constraint ad_orders_status_check
  check (status = any (array['PREPARE','PAID','CANCELED','FAILED','EXPIRED']));

-- ── ② 노출 조건에서 무료 7일 창을 뺀다 ───────────────────────────────────────
-- 🔴 with (security_invoker = true) 를 **정의 안에** 다시 적는다. create or replace view 는
--    옵션을 통째로 갈아엎어서, 빠뜨리면 마감 공고가 비로그인에게 샌다(2026-08-05 실제 사고).
create or replace view public.jobs_listed
with (security_invoker = true) as
SELECT id,
    hospital_id,
    title,
    specialty,
    location,
    employment_type,
    salary_text,
    benefits,
    description,
    source,
    external_url,
    external_id,
    status,
    is_featured,
    posted_at,
    created_at,
    updated_at,
    featured_until,
    ad_tier,
    manager_name,
    manager_phone,
    deadline,
    recruit_count,
    shift_type,
    apply_method,
    apply_email,
    apply_detail,
    apply_methods,
    detail_fetched_at,
    company_name,
    sido,
    sigungu,
    facility_type,
    job_category,
    lat,
    lng,
    geocoded_at,
    featured_until IS NOT NULL AND featured_until > now() AS ad_live,
    (status = 'open'::text AND (source = 'worknet'::text OR (featured_until IS NOT NULL AND featured_until > now())) AND (deadline IS NULL OR deadline >= (now() AT TIME ZONE 'Asia/Seoul'::text)::date)) IS TRUE AS is_live
   FROM jobs j;
