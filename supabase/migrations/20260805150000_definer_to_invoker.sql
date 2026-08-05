-- 🩺 Advisor 보안 경고 마무리 — SECURITY DEFINER 를 꼭 필요한 곳만 남긴다.
--
-- 오너 지시 2026-08-05: 남은 경고도 없애라.
-- 앱이 rpc 로 부르는 함수는 스키마를 옮길 수 없다(옮기면 앱이 깨진다). 대신 **권한 상승 자체를 없앤다** —
-- SECURITY INVOKER 로 바꾸면 함수가 부르는 사람의 권한으로 돌아 RLS 가 그대로 걸린다.
-- 그래서 "정의자 권한으로 뭐든 할 수 있는 함수가 외부에 열려 있다"는 경고의 전제가 사라진다.
--
-- 🔒 아래 넷은 **RLS 정책이 이미 관리자/본인에게 같은 권한을 준다**는 것을 확인하고 바꾼다:
--    admin_dashboard 가 세는 표(profiles·resumes·jobs·applications·ad_orders·site_posts·
--    page_views·inquiries)에 전부 관리자 SELECT 정책이 있고,
--    admin_set_hidden 이 고치는 표(reviews·board_posts)에도 관리자 UPDATE 정책이 있다.
--    is_talent_advertiser 가 읽는 것(jobs·hospitals·ad_orders)은 **자기 것**이라 본인이 읽을 수 있다.
-- 🔒 함수 안의 `if not private.is_admin() then raise` 검사는 그대로 둔다 —
--    RLS 로도 막히지만, 관리자가 아닌 사람이 부르면 "권한 없음"이라고 **말해 주는** 쪽이 낫다.
alter function public.is_talent_advertiser() security invoker;
alter function public.admin_dashboard() security invoker;
alter function public.admin_traffic(integer) security invoker;
alter function public.admin_set_hidden(text, uuid, boolean, text) security invoker;

-- 🔴 track_page_view 만 SECURITY DEFINER 로 남긴다 — **바꾸면 지금보다 나빠지기 때문이다.**
--    이 함수는 page_views 에 upsert 를 한다. INVOKER 로 바꾸려면 anon 에게 page_views 의
--    INSERT·UPDATE 를 열어야 하는데, 그러면 방문자가 REST 로 표를 직접 건드릴 수 있게 된다 —
--    함수가 하는 **경로 정제(쿼리스트링·해시 제거, 화이트리스트 검사, uuid/숫자 → :id 치환, 길이 제한)**
--    를 통째로 건너뛰고 아무 경로·아무 조회수나 써넣을 수 있다.
--    지금 구조는 그 반대다: 표는 **아무에게도 쓰기가 열려 있지 않고**(정책은 관리자 SELECT 하나뿐),
--    오직 이 함수를 통해서만, 정제를 통과한 값만 들어간다. 그게 이 함수가 DEFINER 인 이유다.
--    남는 advisor 경고 2건(anon·authenticated)은 이 설계의 결과이고, 바꾸는 쪽이 손해다.
comment on function public.track_page_view(text) is
  '접속 경로 집계. SECURITY DEFINER 를 의도적으로 유지한다 — page_views 에 직접 쓰기를 열지 않고 이 함수의 경로 정제를 반드시 거치게 하려는 것이다(마이그레이션 20260805150000).';
