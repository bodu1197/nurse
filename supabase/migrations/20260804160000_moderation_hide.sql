-- 모더레이션 1단계 — 관리자가 리뷰·게시글·댓글을 **숨긴다**(지우지 않는다).
-- 설계: docs/admin-design-2026-08-04.md (결정 2 — 삭제 버튼을 만들지 않는다)
--
-- 지금 상태: 게시글 2,856 · 댓글 3,672 · 리뷰 6 이 이미 있는데 관리자가 남의 것을 하나도 못 건드린다
-- (모든 delete/update 정책이 `author_id = auth.uid()`). 허위·비방 글이 올라오면 오늘도 SQL 뿐이다.

-- ── 게시판에 숨김 칸을 만든다 ──────────────────────────────
-- reviews.is_hidden 은 이미 있다(20260625191500). 게시판만 없다.
alter table public.board_posts    add column if not exists is_hidden boolean not null default false;
alter table public.board_comments add column if not exists is_hidden boolean not null default false;

-- 숨긴 글은 관리자에게만 보인다. 작성자에게도 감춘다 —
-- 자기 글이 자기에게만 보이면 "남들에게는 왜 안 보이지" 를 알 방법이 없어 문의만 늘어난다.
alter policy board_posts_read on public.board_posts
  using (
    (not is_hidden or (select public.is_admin()))
    and ((select public.is_community_member()) or (select public.is_admin()))
  );
alter policy board_comments_read on public.board_comments
  using (
    (not is_hidden or (select public.is_admin()))
    and ((select public.is_community_member()) or (select public.is_admin()))
  );

-- ── 숨김을 바꾸는 유일한 통로 ──────────────────────────────
--
-- 🔴 is_hidden 을 authenticated 에게 **컬럼 권한으로 주면 안 된다.**
--    20260730120000 이 정확히 그 이유로 reviews 의 테이블 전체 UPDATE 를 걷어냈다:
--      "is_hidden 을 false 로 되돌려 신고로 숨겨진 리뷰 되살리기"
--    RLS 는 행 단위라 "이 사람은 내 글을 고칠 수 있지만 is_hidden 만은 못 고친다" 를 표현하지 못한다.
--    그래서 컬럼은 잠근 채로 두고, 자격을 스스로 확인하는 함수 하나만 연다.
--
-- 대상 표는 if 분기로 **화이트리스트**한다. 동적 SQL(execute format)을 쓰지 않는다 —
-- 표 이름이 인자로 들어오는데 문자열을 조립하면 그 자리가 곧 주입 지점이 된다.
create or replace function public.admin_set_hidden(target_table text, target_id uuid, hide boolean)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- 함수가 RLS 를 우회하므로(security definer) 자격 확인이 여기 있어야 한다.
  if not public.is_admin() then
    raise exception '관리자만 숨김 상태를 바꿀 수 있습니다' using errcode = '42501';
  end if;

  if target_table = 'reviews' then
    -- 평점은 트리거(reviews_rating_sync)가 알아서 다시 센다 — 집계식이 `not is_hidden` 이라
    -- 숨기는 순간 그 별점이 병원 평균에서 빠진다. 여기서 따로 손대지 않는다.
    update public.reviews set is_hidden = hide where id = target_id;
  elsif target_table = 'board_posts' then
    update public.board_posts set is_hidden = hide where id = target_id;
  elsif target_table = 'board_comments' then
    update public.board_comments set is_hidden = hide where id = target_id;
  else
    raise exception '숨길 수 없는 대상입니다: %', target_table using errcode = '22023';
  end if;
end;
$$;

revoke execute on function public.admin_set_hidden(text, uuid, boolean) from public, anon;
grant execute on function public.admin_set_hidden(text, uuid, boolean) to authenticated;
