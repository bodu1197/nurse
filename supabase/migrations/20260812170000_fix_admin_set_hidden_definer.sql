-- 🔴 관리자 숨김이 **한 번도 작동한 적이 없었다**(오너 신고 2026-08-12: "숨김처리를 해도 적용이 안 된다").
--
-- 원인: `20260805150000_definer_to_invoker.sql` 이 함수들을 호출자 권한으로 바꿀 때 이 함수까지
-- 같이 바꿨다. 그런데 이 함수는 **남의 글을 고치는** 함수다. reviews·board_posts·board_comments 의
-- UPDATE 정책은 `author_id = auth.uid()` 뿐이라(관리자용 UPDATE 정책이 없다), 호출자 권한으로는
-- 관리자가 남의 글을 못 고친다 → UPDATE 0행 → 함수가 '대상을 찾을 수 없습니다'로 실패 →
-- 화면에는 오류만 뜨고 글은 그대로 남았다.
--   실측: is_hidden=true 인 행 0건, admin_actions 에 '*.hide' 기록 0건(= UPDATE 가 0행이라
--   감사 로그 insert 까지 가지도 못했다).
--
-- 왜 definer 로 되돌리는가(정책을 더하지 않고):
--   이 함수는 **정확히 SECURITY DEFINER 를 써야 하는 모양**이다 —
--     · 첫 줄에서 `private.is_admin()` 으로 막는다(관리자가 아니면 42501)
--     · 표 이름을 if/elsif 화이트리스트로만 받는다(동적 SQL 없음 = 주입 지점 없음)
--     · 사유 두 글자 검사 + 0행이면 예외 + 감사 로그를 같은 트랜잭션에서 남긴다
--     · `set search_path` 고정 + 객체를 `public.` 으로 스키마까지 적는다
--   세 표에 "관리자는 무엇이든 UPDATE" 정책을 여는 것보다 **문이 훨씬 좁다** — 그 정책은
--   관리자에게 is_hidden 뿐 아니라 본문·작성자까지 바꿀 길을 열어 준다.
create or replace function public.admin_set_hidden(target_table text, target_id uuid, hide boolean, reason text)
 returns void
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
begin
  if not private.is_admin() then
    raise exception '관리자만 숨김 상태를 바꿀 수 있습니다' using errcode = '42501';
  end if;
  if reason is null or length(btrim(reason)) < 2 then
    raise exception '사유를 두 글자 이상 적어야 합니다' using errcode = '22023';
  end if;

  -- 표 이름은 if 분기로 화이트리스트한다. 동적 SQL 을 쓰면 그 자리가 곧 주입 지점이 된다.
  if target_table = 'reviews' then
    -- 평점은 트리거(reviews_rating_sync)가 다시 센다 — 집계식이 `not is_hidden` 이다.
    update public.reviews set is_hidden = hide where id = target_id;
  elsif target_table = 'board_posts' then
    update public.board_posts set is_hidden = hide where id = target_id;
  elsif target_table = 'board_comments' then
    update public.board_comments set is_hidden = hide where id = target_id;
  else
    raise exception '숨길 수 없는 대상입니다: %', target_table using errcode = '22023';
  end if;

  -- 🔴 0행이면 실패로 처리한다. 없는 id 를 조용히 성공으로 돌려주면 화면은 "처리했습니다" 를
  --    띄우고 기록만 남는다 — 일어나지 않은 조치가 감사 로그에 쌓인다.
  if not found then
    raise exception '대상을 찾을 수 없습니다' using errcode = '02000';
  end if;

  insert into public.admin_actions (actor_id, action, target_table, target_id, reason)
  values (
    (select auth.uid()),
    target_table || case when hide then '.hide' else '.unhide' end,
    target_table, target_id, btrim(reason)
  );
end;
$function$;

-- 🔴 definer 함수는 **누가 실행할 수 있는지**를 좁혀 둔다. 함수 안에서 is_admin() 으로 막고 있지만,
--    비로그인(anon)에게 실행 권한을 열어 둘 이유가 없다(Advisor 의 anon_security_definer 경고도 없앤다).
revoke all on function public.admin_set_hidden(text, uuid, boolean, text) from public, anon;
grant execute on function public.admin_set_hidden(text, uuid, boolean, text) to authenticated;
