-- 인재 목록 정렬 인덱스를 **쿼리와 같은 방향**으로 다시 만든다.
--
-- 🔴 무엇이 문제였나: 인덱스는 `(last_edited_at desc) where is_public` 인데, DESC 인덱스의 기본은
--    NULLS FIRST 다. 반면 목록·홈 쿼리는 `desc nulls last` 로 정렬한다(lib/data/talent.ts 의
--    searchPublicTalent — 아직 한 번도 저장하지 않은 이력서를 맨 뒤로 보내려고 nullsFirst:false 를 쓴다).
--    정렬 방향이 다르면 Postgres 는 그 인덱스를 **정렬에 쓸 수 없다.**
--    실측(EXPLAIN ANALYZE, 2026-08-08): Seq Scan on resumes … rows=7770, Buffers: shared hit=1559.
--    카드 10장을 그리려고 매 요청 7,770행을 전부 읽고 정렬하고 있었다. 홈은 방문자 전원이 타는 길이고,
--    2026-08-08 부터 인재정보가 색인되면서 크롤러 트래픽까지 이 길로 들어온다.
--
-- 🔴 2차 정렬키(profile_id desc)도 인덱스에 넣는다. 쿼리가 두 키로 정렬하는데 인덱스에 첫 키만
--    있으면 같은 시각 동률 구간에서 다시 정렬이 붙는다(이관분은 last_edited_at 이 같은 행이 많다).
--
-- 부분 인덱스 조건(where is_public)은 그대로 둔다 — 목록·사이트맵·홈이 전부 is_public=true 로만 본다.
-- `name is not null` 은 조건에 넣지 않는다: 인덱스가 걸러주지 않아도 heap 검사 한 번이면 되고,
-- 넣으면 이름 없는 이력서를 포함해 세는 다른 쿼리가 이 인덱스를 못 쓴다.

create index if not exists resumes_talent_sort_idx
  on public.resumes (last_edited_at desc nulls last, profile_id desc)
  where is_public;

-- 옛 인덱스는 지운다. 같은 컬럼에 인덱스를 두 벌 두면 쓰기마다 둘 다 갱신되고,
-- advisor 가 중복 인덱스로 잡는다(CLAUDE.md §1-3).
drop index if exists public.resumes_last_edited_idx;
