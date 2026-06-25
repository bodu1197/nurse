-- 레거시 로그인은 아이디(user_id) 기반 → profiles에 username 추가(고유 로그인 아이디).
alter table public.profiles add column username text;
create unique index profiles_username_key on public.profiles (username) where username is not null;
comment on column public.profiles.username is '레거시 user_id = 로그인 아이디(고유). 신규 가입은 null 가능.';
