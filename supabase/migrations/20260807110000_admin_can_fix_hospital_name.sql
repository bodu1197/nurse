-- 🏥 관리자가 병원 이름을 고칠 수 있게 한다.
--
-- 왜 필요한가(오너 지시 2026-08-07): 구 널스넷에서 이관할 때 **병원 이름 자리에 회원 아이디**가
-- 들어간 곳이 141곳 있었다 — `eyessg2022`, `hama`, `김원장`, `행정부장`, `010-5054-1454`.
-- 구직자 화면에 "hama에서 간호조무사를 구합니다" 로 나간다. 주소·공고 제목으로 대조해 44곳은
-- 자동으로 바로잡았고, 나머지 97곳은 사람이 봐야 한다(같은 건물에 병원이 여럿이거나 명부에 없다).
-- 그 화면(/admin/hospitals)이 저장하려면 관리자에게 UPDATE 권한이 있어야 한다.
--
-- 🔴 정책을 **더하지 않고 합친다.** 한 표·한 동작에 permissive 정책이 여러 개면 Postgres 가
--    행마다 전부 평가한다(advisor: multiple_permissive_policies). 20260805120000 이 이 표를
--    이미 그렇게 정리해 뒀으므로 같은 규칙을 지킨다 — 기존 소유자 조건에 관리자 절만 OR 로 얹는다.
-- 🔒 넓히는 것은 UPDATE 뿐이다. INSERT·DELETE 는 그대로 소유자만 — 관리자가 병원을 새로 만들거나
--    지울 이유가 없고, 지우면 그 병원의 공고·리뷰가 함께 사라진다.
drop policy if exists hospitals_update_owner on public.hospitals;
create policy hospitals_update on public.hospitals for update
  using ((select private.is_admin()) or owner_profile_id = (select auth.uid()))
  with check ((select private.is_admin()) or owner_profile_id = (select auth.uid()));

-- 🔴 컬럼 권한도 함께 좁힌다. Supabase 기본은 표 전체 UPDATE 라, 정책만 고치면 병원 회원이
--    자기 병원의 **평점(rating_avg·rating_count)** 이나 소유자(owner_profile_id)까지 직접
--    쓸 수 있다. 화면에서 고치는 것은 이름·주소·지역뿐이다.
--    관리자는 앱을 통해 같은 칸만 쓴다(위 정책이 행을 통과시켜도 칸은 이 grant 가 정한다).
revoke update on public.hospitals from authenticated;
grant update (name, address, region) on public.hospitals to authenticated;

notify pgrst, 'reload schema';
