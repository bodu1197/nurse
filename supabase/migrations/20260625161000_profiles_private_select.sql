-- profiles에 16K 회원 PII(이메일/전화/이름/아이디 등) 존재 → 전체공개 select 제거, 본인만 열람.
-- 로그인 아이디→이메일 해석은 service_role(admin 클라이언트)로 RLS 우회하므로 영향 없음.
-- 추후 공개 프로필(병원이 간호사 열람 등)이 필요하면 안전 컬럼만 노출하는 view로 별도 구성.
drop policy profiles_select_all on public.profiles;
create policy profiles_select_own on public.profiles for select using ((select auth.uid()) = id);
