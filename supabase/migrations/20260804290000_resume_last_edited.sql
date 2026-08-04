-- 🔴 "오늘 쓴 이력서가 안 보인다" 의 원인.
--
-- 인재 목록 정렬을 updated_at → created_at 으로 바꿨더니(20260804 dfcdeb1) 더 나빠졌다.
-- 이 사이트에서 **이력서를 새로 쓰는 사람 대부분이 레거시 회원**이기 때문이다:
-- 이관된 빈 이력서가 이미 있으니 그들이 오늘 내용을 채워도 INSERT 가 아니라 UPDATE 다.
--   → created_at 은 2025~2026-01 그대로 → 정렬에서 8,000건 뒤로 밀린다.
-- 실측(오늘 실제 저장 6건): 박영화 2026-07-26 · 김윤정 2026-04-13 · 남경화 2026-01-23 최초작성.
-- 즉 **오늘 이력서를 채운 사람이 목록 맨 뒤에 있었다.**
--
-- 그렇다고 updated_at 으로 되돌릴 수도 없다. 내 이관·이름정리 배치가 8,070건의 updated_at 을
-- 오늘로 밀어놔서, 그걸로 줄을 세우면 아무도 손대지 않은 이력서가 1페이지를 덮는다.
--
-- 필요한 것은 **사람이 마지막으로 저장한 시각** 이다. 배치가 건드리지 않는 칸을 따로 둔다.

alter table public.resumes add column if not exists last_edited_at timestamptz;

comment on column public.resumes.last_edited_at is
  '사람이 마지막으로 이력서를 저장한 시각. 이관·보정 배치는 이 값을 건드리지 않는다. 인재 목록 정렬 키.';

-- 백필: updated_at 을 쓰되, **같은 초에 4건 이상 몰린 것은 배치**로 보고 제외한다.
-- 사람이 같은 초에 네 명 이상 저장할 리 없다. 배치로 판정된 행은 created_at 을 쓴다
-- (그 사람이 실제로 언제 마지막으로 손댔는지는 잃었지만, 최초작성일은 확실한 하한이다).
with batch as (
  select date_trunc('second', updated_at) t
    from public.resumes
   group by 1
  having count(*) > 3
)
update public.resumes r
   set last_edited_at = case
     when date_trunc('second', r.updated_at) in (select t from batch) then r.created_at
     else r.updated_at
   end
 where r.last_edited_at is null;

-- 앞으로: 사람이 저장할 때만 갱신한다. 배치가 다른 칸을 고쳐도 순서가 안 흔들린다.
-- 🔴 트리거로 하지 않는다 — 트리거는 배치 UPDATE 에도 걸려서 같은 사고가 반복된다.
--    앱(saveResume)이 명시적으로 넣는다. 컬럼 권한도 열어 준다.
grant update (last_edited_at) on public.resumes to authenticated;
grant insert (last_edited_at) on public.resumes to authenticated;

create index if not exists resumes_last_edited_idx
  on public.resumes (last_edited_at desc) where is_public;
