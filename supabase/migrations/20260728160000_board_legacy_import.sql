-- 구 널스넷(라이믹스) 게시판 글·댓글을 받기 위한 컬럼. 오너 지시(2026-07-28) "게시판 글은 모두 이전".
--
-- 레거시 실측:
--   글   2,856건 — 1,963건은 실회원(25명, 전원 이미 profiles 에 있음), 893건은 **익명**(member_srl 이 음수)
--   댓글 3,672건 — **전부 익명**
--
-- 그래서 author_id 의 NOT NULL 을 푼다.
--   대안이던 '아카이브용 가짜 회원 1명'은 쓰지 않는다 — profiles 에 사람이 아닌 행이 생기면
--   회원 수·쪽지·권한 판정에 계속 끼어들고, 언젠가 진짜 계정처럼 다뤄진다.
--   author_id 가 NULL 이면 화면에는 legacy_nickname("익명_42469")을 대신 보여준다.
--
-- 🔒 NULL 이 되어도 정책은 안전하다(모두 `author_id = auth.uid()` 형태라 NULL 은 참이 될 수 없다):
--   · insert/update: with check 가 통과하지 못해 **회원이 작성자 없는 글을 만들 수 없다**.
--   · delete: 레거시 글은 본인 글이 아니므로 아무도 못 지운다(정리는 service_role 로).
-- 🔒 새 컬럼에는 GRANT 를 주지 않는다. 이 테이블은 테이블 단위 insert/update 를 revoke 하고
--   컬럼 단위로만 열어놨으므로(20260724160000), 나중에 추가된 컬럼은 자동으로 잠긴 상태다
--   → 회원이 legacy_nickname 을 위조해 "익명_00000" 인 척할 수 없다.

alter table public.board_posts    alter column author_id drop not null;
alter table public.board_comments alter column author_id drop not null;

alter table public.board_posts    add column if not exists legacy_srl bigint;
alter table public.board_comments add column if not exists legacy_srl bigint;
alter table public.board_posts    add column if not exists legacy_nickname text;
alter table public.board_comments add column if not exists legacy_nickname text;

-- 이관 스크립트를 여러 번 돌려도 같은 글이 두 번 생기지 않게(upsert 의 충돌 대상).
-- ⚠️ 부분 인덱스(`where legacy_srl is not null`)로 만들면 안 된다 — PostgREST 의 upsert 는
--    `on conflict (legacy_srl)` 만 보내고 부분 조건을 함께 보내지 않아 42P10 으로 거절당한다(실측).
--    일반 유니크로 둬도 Postgres 는 NULL 끼리 서로 다르다고 보므로, legacy_srl 이 NULL 인
--    회원 신규 글은 몇 건이든 들어간다.
drop index if exists public.board_posts_legacy_srl_key;
drop index if exists public.board_comments_legacy_srl_key;
create unique index if not exists board_posts_legacy_srl_key    on public.board_posts (legacy_srl);
create unique index if not exists board_comments_legacy_srl_key on public.board_comments (legacy_srl);

comment on column public.board_posts.legacy_srl is
  '구 널스넷 wp_documents.document_srl. 재이관 시 중복 생성을 막는 열쇠(신규 글은 NULL).';
comment on column public.board_posts.legacy_nickname is
  '구 널스넷 작성자 표시명. author_id 가 NULL 인 익명 글의 화면 표기에만 쓴다.';
