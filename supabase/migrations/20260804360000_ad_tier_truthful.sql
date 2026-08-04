-- 유료/무료를 **탭으로** 걸러야 한다(오너 지시 2026-08-04): "광고가 80,000개면 한 줄 한 줄 어떻게 읽냐".
--
-- 걸러내려면 그 판정이 jobs 한 줄 안에 있어야 한다. ad_orders 를 매번 조인해서 거르면
-- 목록 한 페이지를 그리려고 결제 테이블 전체를 훑는다.
-- ad_tier 가 그 자리인데, 지금 값이 사실과 다르다:
--   실측 — featured_until 이 살아 있는 40건 중 ad_tier='standard'(유료 표기) 5건.
--   그런데 실제 결제(ad_orders PAID, amount>0)는 **0건**이다. 레거시 이관분이 그대로 들어왔다.
--   유료라고 적힌 줄을 눌러 보면 결제 내역이 없다 — 화면이 거짓말을 한다.
--
-- 결제 기록이 없으면 무료다. 자격 판정(is_talent_advertiser)은 지금도 ad_orders 를 직접 보므로
-- 이 값이 권한을 주지는 않는다. 이 값은 **보여주고 거르기 위한 것**이다.

update public.jobs j
   set ad_tier = 'free'
 where j.ad_tier = 'standard'
   and not exists (
     select 1 from public.ad_orders o
      where o.job_id = j.id and o.status = 'PAID' and o.amount > 0 and o.tier <> 'admin_test'
   );

-- 목록이 유료/무료 탭으로 갈릴 때 쓰는 인덱스. 워크넷은 목록에서 빠지므로 조건에 넣어 둔다.
create index if not exists jobs_ad_tier_posted_idx
  on public.jobs (ad_tier, posted_at desc) where source <> 'worknet';
