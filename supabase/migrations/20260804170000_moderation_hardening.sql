-- 모더레이션 1단계 보강 — 검증에서 나온 구멍 넷.
-- 앞선 20260804160000 을 고친다.

-- ── ① 숨김은 감사 기록 **없이는** 일어날 수 없다 ─────────────
--
-- 🔴 admin_set_hidden 을 authenticated 에 grant 했으므로, 관리자는 공개 anon 키 + 자기 세션으로
--    PostgREST 를 직접 불러 숨길 수 있었다. 감사 기록(logAdmin)은 앱 코드에만 있어서
--    그 경로로는 **아무 기록도 남지 않는다.** "기록 없는 조치를 만들지 않는다"는 전제가 통째로 무너진다.
--
--    사유를 인자로 받아 함수 **안에서** admin_actions 에 넣는다. 둘이 같은 트랜잭션이라
--    기록이 실패하면 숨김도 없던 일이 된다 — 앱에서 두 번 호출하던 것보다 오히려 튼튼하다.
drop function if exists public.admin_set_hidden(text, uuid, boolean);

create or replace function public.admin_set_hidden(
  target_table text, target_id uuid, hide boolean, reason text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_admin() then
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
$$;

revoke execute on function public.admin_set_hidden(text, uuid, boolean, text) from public, anon;
grant execute on function public.admin_set_hidden(text, uuid, boolean, text) to authenticated;

-- ── ② 숨긴 글은 얼린다 — 작성자가 고치거나 지울 수 없다 ─────
--
-- 🔴 지금은 update/delete 정책이 `author_id = auth.uid()` 뿐이라, 관리자가 비방 리뷰를 숨겨도
--    작성자가 본문을 딴 내용으로 갈아치우거나 아예 지울 수 있다(증거 인멸).
--    조치의 대상이 조치 뒤에도 마음대로 바뀌면 숨김은 아무것도 보장하지 못한다.
--    관리자는 함수(security definer)로 바꾸므로 이 정책에 걸리지 않는다.
alter policy reviews_update_own on public.reviews
  using (author_id = (select auth.uid()) and not is_hidden);
alter policy reviews_delete_own on public.reviews
  using (author_id = (select auth.uid()) and not is_hidden
         and ((select public.is_community_member()) or (select public.is_admin())));

alter policy board_posts_update on public.board_posts
  using (author_id = (select auth.uid()) and not is_hidden);
alter policy board_posts_delete on public.board_posts
  using (author_id = (select auth.uid()) and not is_hidden
         and ((select public.is_community_member()) or (select public.is_admin())));
alter policy board_comments_delete on public.board_comments
  using (author_id = (select auth.uid()) and not is_hidden
         and ((select public.is_community_member()) or (select public.is_admin())));

-- ── ③ 게시판 읽기를 리뷰와 같은 규칙으로 ──────────────────
--
-- 20260804160000 은 게시판만 "작성자에게도 감춘다" 로 만들었는데 reviews_select 는
-- `or author_id = auth.uid()` 를 그대로 뒀다. 두 표의 규칙이 다르면 다음 사람이 어느 쪽이 맞는지 모른다.
-- ②로 숨긴 글이 얼어붙었으므로 작성자가 자기 글을 읽는 것은 위험하지 않다 — 기존 규칙(리뷰)에 맞춘다.
alter policy board_posts_read on public.board_posts
  using (
    (not is_hidden or author_id = (select auth.uid()) or (select public.is_admin()))
    and ((select public.is_community_member()) or (select public.is_admin()))
  );
alter policy board_comments_read on public.board_comments
  using (
    (not is_hidden or author_id = (select auth.uid()) or (select public.is_admin()))
    and ((select public.is_community_member()) or (select public.is_admin()))
  );

-- ── ④ 숨김이 "수정됨" 을 만들지 않게 ──────────────────────
--
-- before-update 트리거가 무조건 updated_at 을 올린다. 그래서 관리자가 글을 숨겼다 되돌리면
-- 작성자가 손대지도 않은 글에 "수정됨" 이 붙는다(화면이 created_at ≠ updated_at 으로 판단한다).
-- is_hidden 만 바뀐 경우에는 트리거를 건너뛴다.
drop trigger if exists board_posts_set_updated_at on public.board_posts;
create trigger board_posts_set_updated_at
  before update on public.board_posts
  for each row
  when (new.is_hidden is not distinct from old.is_hidden)
  execute function public.set_updated_at();

drop trigger if exists reviews_set_updated_at on public.reviews;
create trigger reviews_set_updated_at
  before update on public.reviews
  for each row
  when (new.is_hidden is not distinct from old.is_hidden)
  execute function public.set_updated_at();
