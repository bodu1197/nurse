-- 🔴 공고 = 광고다(오너 확정 2026-08-04).
--    "돈을 결제해도 공고고, 안 내고 무료 7일 게시해도 공고다."
--
-- 그런데 코드는 featured_until 이 있어야만 광고로 취급했고, 무료 게시는 그 값을 비워 뒀다.
-- 그 결과 무료로 올린 공고는 시스템 전체에서 2등 시민이 됐다:
--   · 관리자 「노출중」 탭에서 빠진다(featured_until 로 판정)
--   · 구직자 목록 정렬에서 ad_live=false 라 광고 40건 뒤로 밀린다 → 41위, 3페이지
--   · 관리자 목록의 종료·남은 기간이 통째로 빈칸
-- 실측(오늘): 우리요양병원 「요양병원 3교대 간호사 모집」 — 16:02 게시, 상세는 열리고
-- 검색으로도 나오는데 첫 화면 카드에는 없었다.
--
-- 무료 게시도 **7일짜리 광고**다. 그 기간을 featured_until 에 적는다.
-- 대상은 지금 열려 있는 우리 공고 중 값이 빈 것뿐이다:
--   · 워크넷 수집분은 제외 — 우리가 파는 자리가 아니다(항상 노출되는 배경 데이터).
--   · 이미 닫힌(closed) 레거시 이관 공고는 건드리지 않는다. 끝난 공고를 되살리면 안 된다.
--
-- 🔴 돈 문제는 그대로다. 인재 열람 자격(is_talent_advertiser)은 **실제 결제**(ad_orders 의
--    PAID + amount>0)를 보므로, 이 값이 채워져도 무료 공고가 인재를 볼 수는 없다.

update public.jobs
   set featured_until = posted_at + interval '7 days',
       ad_tier = coalesce(ad_tier, 'free')
 where status = 'open'
   and source <> 'worknet'
   and featured_until is null
   and posted_at + interval '7 days' > now();   -- 이미 지난 것은 되살리지 않는다
