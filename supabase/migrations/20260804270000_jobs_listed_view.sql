-- 광고 정렬이 **종료일**로 줄을 세워 오래 산 쪽이 영원히 1등이던 것.
--
-- 🔴 지금 정렬: `order by featured_until desc nulls last, posted_at desc`
--    featured_until 은 광고가 **끝나는 날**이다. 4주를 산 병원은 종료일이 멀어서
--    **4주 내내 1등**이고, 그 뒤에 1주를 산 병원은 아무리 방금 결제해도 계속 2등이다.
--    돈을 더 낸 쪽이 더 오래 노출되는 것은 맞지만, 더 오래 **1등**이어야 할 이유는 없다.
--    (지금은 43건이 전부 같은 날 끝나서 안 보인다. 실제 결제가 시작되면 바로 드러난다.)
--
-- 정렬 키가 두 가지 질문을 한 값에 뭉쳐 놓은 게 원인이다:
--    ① 광고인가 아닌가 (광고가 위)
--    ② 광고끼리는 무슨 순서인가
-- 뷰에서 ①을 따로 뽑아 준다. ②는 posted_at 을 쓴다 —
-- activateAdOrder 가 광고를 켤 때 posted_at 을 지금으로 갱신하므로(mypage/actions.ts),
-- 이 값이 곧 **광고를 켠 시각**이다. 최근에 켜거나 연장한 쪽이 위로 온다.
--
-- 🔴 `select *` 라 **jobs 에 컬럼을 더하면 이 뷰를 다시 만들어야 한다**(뷰는 만들 때 * 를 펼친다).
--    안 그러면 새 컬럼이 목록에서 조용히 빠진다.
--
-- security_invoker = true : 뷰를 조회한 사람의 권한으로 돈다. 안 주면 뷰 소유자(postgres)
-- 권한으로 돌아 jobs 의 RLS 를 통째로 우회한다 — 비공개 공고가 목록에 샌다.
create or replace view public.jobs_listed
with (security_invoker = true) as
select
  j.*,
  -- 지금 광고가 살아 있는가. 정렬 1차 키다.
  (j.featured_until is not null and j.featured_until > now()) as ad_live
from public.jobs j;

comment on view public.jobs_listed is
  '구직자 목록용 — jobs + ad_live(광고 게재중 여부). 정렬을 "광고인가"와 "언제 켰나"로 나누기 위한 것. jobs 에 컬럼을 더하면 이 뷰를 다시 만들 것.';

grant select on public.jobs_listed to anon, authenticated;
