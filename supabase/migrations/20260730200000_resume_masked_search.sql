-- 인재 검색이 **가려진 사본**을 보게 한다 (오너 확정 2026-07-30, 방법 B).
--
-- 🔴 무엇이 열려 있었나
--   카드에는 '김○○' 로 나오는데 검색은 원문(resume_title·intro)을 그대로 조회했다.
--   /talent 는 로그인 게이트가 없어서, 비로그인으로 `?q=김민수` 를 넣으면 그 이름을
--   자기소개에 적어둔 이력서만 남고 0건/1건으로 **실명이 확정된다**
--   (그 화면에 나이·성별·거주지역·학력·경력이 함께 있다). 자유서술에 본인 이름을 적어둔 사람 235명.
--   전화·이메일도 같다 — 표시에서는 maskContacts 로 가리는데 검색은 원문을 봤다.
--
-- 🔴 왜 원문을 마스킹해서 덮어쓰지 않는가 (방법 A 를 버린 이유)
--   이름이 보통 낱말에 겹치면 되돌릴 수 없이 망가진다. 이름이 '이수' 인 사람의
--   "이수한 과정" 이 "이○한 과정" 이 된다. 7,265명의 글이라 한 번 덮어쓰면 복구가 없다.
--   그래서 원문은 그대로 두고 **검색 전용 사본**을 따로 만든다.
--
-- 표시(앱 lib/data/talent.ts 의 maskName·maskContacts)와 **같은 규칙**이어야 한다.
-- 두 규칙이 어긋나면 "화면에는 안 보이는데 검색으로는 잡히는" 값이 다시 생긴다.

-- 이름 가리기 — 성(첫 글자)만 남기고 나머지를 ○ 로. 2글자 미만은 건드리지 않는다
-- (한 글자를 치환하면 엉뚱한 단어까지 깨진다 — 앱의 maskName 과 같은 조건).
-- 전화·이메일 가리기 — 앱의 PHONE_RE·EMAIL_RE 와 같은 모양. \d 대신 [0-9] 를 쓴다.
create or replace function public.resume_masked_text(p_name text, p_text text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select case
    when p_text is null then null
    else regexp_replace(
           regexp_replace(
             case
               when length(coalesce(trim(p_name), '')) < 2 then p_text
               else replace(p_text, trim(p_name),
                            left(trim(p_name), 1) || repeat('○', length(trim(p_name)) - 1))
             end,
             '01[016-9][-. ]?[0-9]{3,4}[-. ]?[0-9]{4}', '010-****-****', 'g'),
           '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+[.][A-Za-z]{2,}', '***@***', 'g')
  end;
$$;

alter table public.resumes add column if not exists search_text text;

-- 트리거로 유지한다. 앱이 채우게 하면 PostgREST 직접 호출이나 다른 경로로 들어온 행에서
-- 조용히 비고, 그 사람만 검색에서 사라지거나(빈 값) 원문이 남는다.
-- 사용자가 이 컬럼을 직접 써 넣어도 여기서 덮어쓴다 — 값의 주인은 트리거 하나뿐이다.
create or replace function public.resumes_fill_search_text()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.search_text :=
    coalesce(public.resume_masked_text(new.name, new.resume_title), '') || ' ' ||
    coalesce(public.resume_masked_text(new.name, new.intro), '');
  return new;
end;
$$;

drop trigger if exists resumes_set_search_text on public.resumes;
create trigger resumes_set_search_text
  before insert or update on public.resumes
  for each row execute function public.resumes_fill_search_text();

-- 🔴 백필 중에는 updated_at 트리거를 끈다. 안 끄면 7,265행의 수정시각이 전부 오늘로 밀리고,
--    인재 목록·홈이 updated_at 내림차순이라 **순서가 통째로 뒤집힌다**.
--    2026-07-30 역슬래시-n 정리에서 정확히 이 사고를 냈다(20260730160000 참고).
alter table public.resumes disable trigger resumes_set_updated_at;
update public.resumes set search_text = search_text; -- 트리거가 값을 채운다
alter table public.resumes enable trigger resumes_set_updated_at;
