-- ad_tier 에 NULL 이 섞여 있어서 "무료" 를 고르는 조건이 지저분했다.
--   SQL 에서 `ad_tier <> 'standard'` 는 NULL 행을 **버린다**(NULL 비교는 참이 아니다).
--   그래서 무료 탭을 만들려면 `ad_tier is null or ad_tier <> 'standard'` 처럼 or 를 하나 더 써야 했고,
--   그런 or 가 노출 조건·검색어의 or 와 겹치면서 목록이 엉뚱하게 나왔다
--   (오너 지적 2026-08-04: 무료 탭에 이미 끝난 공고가 섞여 나왔다).
--
-- 공고 = 광고이고, 첫 1주는 0원이다. 즉 **모든 공고에는 등급이 있다** — 값이 없을 수가 없다.
-- 기본값을 'free' 로 못박으면 조건이 `ad_tier = 'standard'` / `<> 'standard'` 두 개로 끝난다.

update public.jobs set ad_tier = 'free' where ad_tier is null;

alter table public.jobs alter column ad_tier set default 'free';
alter table public.jobs alter column ad_tier set not null;

comment on column public.jobs.ad_tier is
  '광고 등급 — free(첫 1주 0원 포함) 또는 standard(결제분). 인재 열람 자격은 이 값이 아니라 실결제(is_talent_advertiser)가 정한다.';
