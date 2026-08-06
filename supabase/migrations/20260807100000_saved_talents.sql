-- 💾 찜한 간호사 — 병원이 검색 도중 마음에 든 인재를 담아 두고 마이페이지에서 다시 본다.
--
-- 오너 지시 2026-08-07: "채용공고 상세에는 저장·닫기가 있는데 인재정보에는 둘 다 없다.
-- 닫기가 없어 첫 페이지로 돌아가 다시 검색해야 하고, 검색 도중 후보군을 저장해서
-- 마이페이지에서 검토할 수 있어야 한다."
--
-- 구조는 saved_jobs(20260627120000)와 같다 — 간호사가 공고를 찜하는 것의 반대 방향이다.
-- 🔴 지운 회원의 찜은 함께 사라진다(양쪽 cascade). 이력서를 지운 사람이 목록에 유령으로 남으면
--    병원은 눌러도 404 만 만난다.
create table if not exists public.saved_talents (
  id          uuid primary key default gen_random_uuid(),
  -- 찜한 사람(병원 회원)
  profile_id  uuid not null references public.profiles(id) on delete cascade,
  -- 찜당한 사람(간호사) — resumes.profile_id 와 같은 값이다.
  talent_id   uuid not null references public.profiles(id) on delete cascade,
  -- 후보를 왜 담았는지 한 줄. 병원만 본다.
  memo        text,
  created_at  timestamptz not null default now(),
  unique (profile_id, talent_id)
);

alter table public.saved_talents enable row level security;

-- 내 찜만 읽고 쓴다. 남이 누구를 찜했는지는 아무도 못 본다(관리자 절도 두지 않는다 —
-- 관리자가 병원의 후보 검토 내역을 볼 이유가 없고, 열어두면 그게 곧 유출 경로다).
create policy saved_talents_own on public.saved_talents
  for all
  using (profile_id = (select auth.uid()))
  with check (profile_id = (select auth.uid()));

-- 목록은 "내 찜을 최신순으로" 읽는다 — 그 정렬을 그대로 태운다.
create index if not exists saved_talents_profile_idx on public.saved_talents (profile_id, created_at desc);
-- 🩺 외래키에는 인덱스를 만든다(advisor: unindexed_foreign_keys). profile_id 는 위 복합 인덱스가
--    선두 컬럼으로 커버하므로 talent_id 만 따로 만든다 — 간호사가 탈퇴할 때 이 표를 훑는다.
create index if not exists saved_talents_talent_idx on public.saved_talents (talent_id);

-- anon 은 이 표에 아무 볼일이 없다(로그인한 병원만 쓴다). 권한도 정책도 둘 다 닫는다.
revoke all on public.saved_talents from anon;
grant select, insert, update, delete on public.saved_talents to authenticated;

notify pgrst, 'reload schema';
