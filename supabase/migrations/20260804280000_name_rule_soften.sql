-- 🔴 긴급: 내가 건 이름 CHECK 가 **가입과 이력서 저장을 막고 있었다.**
--
-- 20260804210000 이 profiles.display_name / resumes.name 에 CHECK 를 걸었다.
-- 의도는 "앞으로 이모지·기호를 못 넣게" 였는데, 실제로 벌어진 일은 이렇다:
--
--   · 카카오 닉네임이 "선민❤️" 인 사람이 가입 → handle_new_user 트리거가 profiles 에 INSERT
--     → CHECK 위반 → 트리거가 죽고 → **auth.users INSERT 까지 롤백 → 가입 자체가 실패**
--   · 이력서에 이름을 "선민❤️" 로 적으면 저장 실패. 화면에는 영어 오류만 뜬다.
--
-- 실측(2026-08-04): CHECK 를 건 11:40 이후 그날 작성된 이력서가 1건뿐이다. 사실상 멈췄다.
--
-- 데이터를 지키자고 건 규칙이 데이터가 들어오는 문을 잠갔다.
-- 이름 같은 **사람이 쓴 값은 DB 가 거절하면 안 된다** — 거절은 그 사람의 작업을 통째로 날린다.
-- 대신 들어올 때 조용히 정리한다. "선민❤️" 는 "선민" 으로 저장된다.
-- 정리해도 남는 글자가 없으면(💌, 一片树叶) 원본을 그대로 둔다 — 거절하느니 지저분한 게 낫다.

alter table public.profiles drop constraint if exists profiles_display_name_shape;
alter table public.resumes  drop constraint if exists resumes_name_shape;

-- 표마다 함수를 따로 둔다. 컬럼 이름을 인자로 받아 동적으로 다루려면 hstore 같은 확장이 필요한데,
-- 이 한 줄을 위해 확장에 기대면 그 확장이 없는 환경에서 다시 저장이 막힌다.
create or replace function public.tidy_profile_display_name()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare tidy text;
begin
  if new.display_name is null or btrim(new.display_name) = '' then return new; end if;
  tidy := public.valid_person_name(left(public.clean_person_name(new.display_name), 30));
  if tidy is not null then new.display_name := tidy; end if;   -- 못 다듬으면 원본 유지
  return new;
end;
$$;

create or replace function public.tidy_resume_name()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare tidy text;
begin
  if new.name is null or btrim(new.name) = '' then return new; end if;
  tidy := public.valid_person_name(left(public.clean_person_name(new.name), 30));
  if tidy is not null then new.name := tidy; end if;
  return new;
end;
$$;

drop trigger if exists profiles_tidy_display_name on public.profiles;
create trigger profiles_tidy_display_name
  before insert or update of display_name on public.profiles
  for each row execute function public.tidy_profile_display_name();

drop trigger if exists resumes_tidy_name on public.resumes;
create trigger resumes_tidy_name
  before insert or update of name on public.resumes
  for each row execute function public.tidy_resume_name();
