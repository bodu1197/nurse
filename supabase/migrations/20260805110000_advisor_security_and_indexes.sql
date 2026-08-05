-- 🩺 Supabase Advisor(Security · Performance) 경고 정리 — 1/2. 근본 수정.
-- 오너 지시 2026-08-05: "경고가 쌓인 뒤에 치우지 말고 애초에 안 생기게 짜라"(전역 규칙에도 박았다).
-- 이 파일은 **위험이 낮고 이득이 확실한 것**만 담는다. RLS 정책 합치기(66건)는 2/2 로 분리했다.

-- ── 1. 외래키에 인덱스가 없다(advisor: unindexed_foreign_keys, 8건) ─────────────────
-- 부모 행을 지우거나 조인할 때마다 자식 표를 **풀스캔**한다. 지금은 행이 적어 티가 안 나지만
-- 이력서 7,779건·공고 3,500건 규모에서 곧 드러난다. 인덱스는 만들어 두는 쪽이 항상 싸다.
create index if not exists ad_orders_hospital_id_idx on public.ad_orders (hospital_id);
create index if not exists admin_actions_actor_id_idx on public.admin_actions (actor_id);
create index if not exists application_notes_updated_by_idx on public.application_notes (updated_by);
create index if not exists board_comments_author_id_idx on public.board_comments (author_id);
create index if not exists board_posts_author_id_idx on public.board_posts (author_id);
create index if not exists inquiries_author_id_idx on public.inquiries (author_id);
create index if not exists profiles_claimed_hospital_id_idx on public.profiles (claimed_hospital_id);
create index if not exists saved_jobs_job_id_idx on public.saved_jobs (job_id);

-- ── 2. 함수 search_path 가 가변이다(advisor: function_search_path_mutable, 2건) ──────
-- search_path 를 고정하지 않으면, 호출자가 자기 스키마를 앞에 끼워 넣어 **같은 이름의 다른 함수**를
-- 실행시킬 수 있다(search_path 하이재킹). 두 함수 모두 pg_catalog 내장 함수만 쓰므로 빈 search_path 로 충분하다.
-- 🔒 인덱스·제약·생성컬럼이 이 함수를 참조하지 않는 것을 확인했다(참조하면 SET 이 인라인을 막아 재색인이 필요하다).
alter function public.clean_person_name(text) set search_path = '';
alter function public.valid_person_name(text) set search_path = '';

-- ── 3. 트리거 함수가 REST 로 열려 있다(advisor: *_security_definer_function_executable) ──
-- admin_actions_stamp_email · inquiries_stamp_author 는 **트리거 전용**인데 SECURITY DEFINER 라
-- 누구나 /rest/v1/rpc/... 로 직접 부를 수 있었다. 트리거 실행에는 EXECUTE 권한이 필요 없으므로
-- 회수해도 트리거는 그대로 돈다(아래 검증에서 확인).
revoke execute on function public.admin_actions_stamp_email() from anon, authenticated;
revoke execute on function public.inquiries_stamp_author() from anon, authenticated;

-- ── 4. 확장이 public 스키마에 있다(advisor: extension_in_public) ─────────────────────
-- public 에 두면 확장이 만든 함수·연산자가 애플리케이션 객체와 같은 이름공간에 섞이고,
-- 이름 충돌이나 하이재킹의 여지가 생긴다. Supabase 표준 자리인 extensions 스키마로 옮긴다.
-- 🔒 pg_trgm 은 relocatable 이고, 이미 만들어진 인덱스(hospitals_name_trgm)는 OID 로 연결돼 있어
--    옮겨도 그대로 동작한다. 앞으로 gin_trgm_ops 를 쓰는 인덱스를 만들 때는 search_path 에
--    extensions 가 있어야 한다(Supabase 기본 역할에는 들어 있다).
alter extension pg_trgm set schema extensions;
