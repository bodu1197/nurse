-- 🔴 '다시 게시' 로 노출 창(featured_until)을 잃은 공고를 되살린다.
--
-- 오너 지적 2026-08-05: "오늘 김원장 병원 공고가 올라왔는데 왜 카드가 생성 안 되냐?"
--
-- 원인: repostJob 의 무료 분기가 featured_until 을 null 로 지웠다(옛 정렬 규칙의 잔재).
--   지금 목록 정렬은 `ad_live desc, posted_at desc` 이고 ad_live = (featured_until > now) 라,
--   방금 올린 공고가 ad_live=false 가 되어 **기간이 살아 있는 석 달 전 공고 39건 전부보다 아래**로
--   밀렸다. 실측: 오늘 14:24 게시분이 목록 40위, 홈의 「최신 채용공고」 6칸에도 못 들어갔다.
--   코드는 같은 커밋에서 고쳤다(다시 게시 = 지금부터 7일 창을 새로 찍는다 — createJob 과 같은 값).
--
-- 여기서는 **이미 그 상태로 남아 있는 행**을 고친다. 조건은 20260804350000 과 같다:
--   · 워크넷 수집분 제외(우리가 파는 자리가 아니다)
--   · 열려 있고 창이 비어 있는 것만
--   · 게시 7일이 아직 안 지난 것만 — 이미 지난 것을 되살리면 없던 노출을 만들어 주는 셈이다
update public.jobs
   set featured_until = posted_at + interval '7 days'
 where status = 'open'
   and source <> 'worknet'
   and featured_until is null
   and posted_at + interval '7 days' > now();
