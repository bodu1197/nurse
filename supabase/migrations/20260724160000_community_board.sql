-- 간호사 커뮤니티 게시판 — 회원끼리 정보·고민을 나누는 공간.
-- 채용(공고)·이력서와 분리된 자유 게시판이다.

create table if not exists public.board_posts (
  id         uuid primary key default gen_random_uuid(),
  author_id  uuid not null references public.profiles(id) on delete cascade,
  title      text not null,
  body       text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists board_posts_created_idx on public.board_posts (created_at desc);
create trigger board_posts_set_updated_at before update on public.board_posts
  for each row execute function public.set_updated_at();

create table if not exists public.board_comments (
  id         uuid primary key default gen_random_uuid(),
  post_id    uuid not null references public.board_posts(id) on delete cascade,
  author_id  uuid not null references public.profiles(id) on delete cascade,
  body       text not null,
  created_at timestamptz not null default now()
);
create index if not exists board_comments_post_idx on public.board_comments (post_id, created_at);

alter table public.board_posts enable row level security;
alter table public.board_comments enable row level security;

-- 글·댓글은 누구나 읽는다(공개 게시판). 로그인 회원만 쓰고, 본인 글만 지운다.
-- author_id 를 세션 사용자로 고정해, 남의 이름으로 글을 쓰지 못하게 한다.
create policy board_posts_read on public.board_posts for select using (true);
create policy board_posts_insert on public.board_posts for insert with check (author_id = (select auth.uid()));
create policy board_posts_delete on public.board_posts for delete using (author_id = (select auth.uid()));
create policy board_posts_update on public.board_posts for update
  using (author_id = (select auth.uid())) with check (author_id = (select auth.uid()));

create policy board_comments_read on public.board_comments for select using (true);
create policy board_comments_insert on public.board_comments for insert with check (author_id = (select auth.uid()));
create policy board_comments_delete on public.board_comments for delete using (author_id = (select auth.uid()));

-- 컬럼 단위로 좁힌다(Supabase 기본이 테이블 전체 쓰기 허용이라, 정책만 있으면 다른 컬럼도 열려 있다).
revoke insert, update on public.board_posts from authenticated;
grant insert (author_id, title, body) on public.board_posts to authenticated;
grant update (title, body) on public.board_posts to authenticated;
revoke insert on public.board_comments from authenticated;
grant insert (post_id, author_id, body) on public.board_comments to authenticated;
