-- 🔴 감사 로그의 이메일을 **클라이언트가 쓸 수 없게** 한다.
--
-- 20260804140000 이 actor_email 을 더하면서 insert 컬럼 권한도 같이 줬다. 그런데 정책은
-- actor_id 만 세션 사용자로 고정한다(`actor_id = auth.uid()`). 그래서 관리자가 앱을 거치지 않고
-- 공개 anon 키 + 자기 세션으로 PostgREST 를 직접 부르면
--
--   POST /rest/v1/admin_actions  {"actor_id":"<내 uid>", "actor_email":"남의주소@x", ...}
--
-- 가 통과한다. 그 뒤 자기 계정을 지우면 actor_id 는 null 이 되고(140000 의 set null)
-- **남는 식별자는 위조된 이메일 하나뿐**이다. 140000 이 만든 유일한 식별자가 곧 유일한 위조 지점이었다.
-- 이 표의 위협모델은 외부인이 아니라 관리자 5명 서로다(120000 주석) — 정확히 이 경로가 문제다.
--
-- 해법: 앱이 값을 보내지 않게 하고, **DB 가 세션에서 직접 찍는다.** 권한을 회수하면 위조 경로가 사라진다.

create or replace function public.admin_actions_stamp_email()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- JWT 의 email 이 정본. 소셜 로그인 등으로 비어 있으면 profiles 에서, 그것도 없으면 표시 문구.
  new.actor_email := coalesce(
    nullif(auth.jwt() ->> 'email', ''),
    (select p.email from public.profiles p where p.id = new.actor_id),
    '(이메일 없음)'
  );
  return new;
end;
$$;

drop trigger if exists admin_actions_stamp_email on public.admin_actions;
create trigger admin_actions_stamp_email
  before insert on public.admin_actions
  for each row execute function public.admin_actions_stamp_email();

-- 기본값을 되돌려 둔다. 트리거가 어차피 덮어쓰므로 값 자체는 의미가 없지만, default 가 없으면
-- 생성되는 TS 타입에서 actor_email 이 **필수 입력**이 되어 앱이 보내야만 컴파일된다 —
-- 방금 권한에서 뺀 컬럼을 타입이 요구하는 모순이 생긴다.
alter table public.admin_actions alter column actor_email set default '';

-- 앱은 이제 actor_email 을 보내지 않는다(lib/data/admin.ts). 권한에서도 뺀다 —
-- 보내면 PostgREST 가 권한 없음으로 거절하므로, 코드와 DB 가 서로를 강제한다.
revoke insert on public.admin_actions from authenticated;
grant insert (actor_id, action, target_table, target_id, reason)
  on public.admin_actions to authenticated;

-- 140000 이 default '' 로 백필했으므로, 그 사이에 쌓인 행이 있으면 지금 채운다(현재 0건이지만
-- 나중에 이 마이그레이션만 다시 도는 환경에서도 빈 이메일이 남지 않게 한다).
update public.admin_actions a
   set actor_email = coalesce(p.email, '(이메일 없음)')
  from public.profiles p
 where p.id = a.actor_id and a.actor_email = '';
