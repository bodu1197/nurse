-- 1차 마이그레이션: 인증/회원 토대 (profiles)
-- 레거시 wp_member(약 1.6만, bcrypt) → auth.users + profiles 로 이관할 기반.
-- Security Advisor 0 유지: RLS 전체 활성+정책, SECURITY DEFINER 함수는 search_path='' 고정.

-- 역할 (레거시 join_type: 간호사/병원)
create type public.user_role as enum ('nurse', 'hospital', 'admin');

-- 공통 프로필 (auth.users 1:1)
create table public.profiles (
  id                uuid primary key references auth.users (id) on delete cascade,
  role              public.user_role not null default 'nurse',
  display_name      text,
  full_name         text,
  email             text,
  phone_number      text,
  avatar_url        text,
  gender            text,
  birthday          date,
  is_open_to_work   boolean not null default false,   -- 간호사 '구직중'
  legacy_member_srl bigint unique,                     -- 레거시 매핑 키
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index profiles_role_idx on public.profiles (role);

-- RLS
alter table public.profiles enable row level security;

-- 프로필은 공개 열람(채용 특성), 쓰기는 본인만. auth.uid()는 (select ...)로 감싸 initplan 경고 방지.
create policy profiles_select_all on public.profiles
  for select using (true);

create policy profiles_insert_own on public.profiles
  for insert with check ((select auth.uid()) = id);

create policy profiles_update_own on public.profiles
  for update using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
-- 삭제는 auth.users 삭제 시 cascade. 별도 delete 정책 없음(차단).

-- updated_at 자동 갱신
create function public.set_updated_at()
  returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- 신규 auth 사용자 → profiles 행 자동 생성 (SNS 가입·이관 공통)
create function public.handle_new_user()
  returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  insert into public.profiles (id, email, display_name, full_name, avatar_url, phone_number, role)
  values (
    new.id,
    new.email,
    coalesce(
      new.raw_user_meta_data ->> 'name',
      new.raw_user_meta_data ->> 'full_name',
      split_part(coalesce(new.email, ''), '@', 1)
    ),
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'avatar_url',
    new.raw_user_meta_data ->> 'phone_number',
    coalesce((new.raw_user_meta_data ->> 'role')::public.user_role, 'nurse')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- SECURITY DEFINER 함수는 트리거 전용 — 직접 호출 권한 회수.
-- (트리거 실행엔 영향 없음. advisor: *_security_definer_function_executable 경고 방지)
revoke execute on function public.set_updated_at() from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
