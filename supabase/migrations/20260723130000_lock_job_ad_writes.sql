-- 인재 검색 열람 자격을 jobs.featured_until(광고 노출 기간)에 걸면서 생긴 구멍을 막는다.
-- 공개 anon key로 PATCH /rest/v1/jobs?id=eq.<내 공고> {"featured_until":"2099-01-01"} 하면
-- RLS(jobs_write_owner: 소유 공고)를 그대로 통과한다 → 결제 없이 영구 광고 + 공개 이력서 전건의
-- 이름·연락처 열람. 앱의 jobs 쓰기는 등록·수정·광고 전부 service_role 경유이고, 사용자 세션으로 하는
-- 쓰기는 마감/게시 토글(status)과 공고 삭제뿐이다 → status 컬럼 UPDATE와 DELETE만 남기고 회수한다.
revoke insert, update on public.jobs from authenticated;
grant update (status) on public.jobs to authenticated;

-- 광고 주문도 동일 — 생성·상태 변경·삭제는 전부 서버(service_role)가 한다.
-- ad_orders에는 insert/update 정책 자체가 없어 RLS로 이미 막히지만, 정책이 하나 추가되는 순간
-- 권한이 열려 있으면 주문을 스스로 PAID로 바꿀 수 있다 → 권한도 같이 회수해 둔다.
revoke insert, update, delete on public.ad_orders from authenticated;

-- 면허번호 컬럼 제거 — 입력 화면도 없고 저장된 값도 0건인데, 인재 검색 정책이 열리면
-- 민감 개인정보가 열람 대상에 포함된다. 쓰지 않는 민감 컬럼은 아예 두지 않는다.
alter table public.resumes drop column if exists license_no;
