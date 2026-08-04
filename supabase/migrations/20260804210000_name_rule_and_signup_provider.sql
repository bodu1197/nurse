-- ① 가입 경로(이메일·카카오·네이버)를 profiles 에 남긴다
-- ② 회원 이름에 기호·이모지를 못 쓰게 한다 (오너 지시 2026-08-04)
--
-- 🔴 순서가 중요하다. ②의 CHECK 를 먼저 걸면 ①의 백필 UPDATE 가 죽는다 —
--    `NOT VALID` 는 **기존 행을 스캔만 안 할 뿐**, 그 행을 UPDATE 할 때는 검사한다.
--    이름이 "정희❤️" 인 회원의 행을 건드리는 순간 제약에 걸린다.
--    그래서 ① 백필 → ② 기존 이름 정리 → ③ 제약 순으로 간다.

-- ── 이름 규칙 ──────────────────────────────────────────────
--
-- 규칙: 한글·영문·숫자가 최소 하나 있어야 하고, 시작은 한글·영문·숫자 또는 여는괄호, 30자 이내.
-- 허용 문자: 한글 · 영문 · 숫자 · 공백 · ( ) . , ' & · / -
--
-- 🔴 병원 이름을 막지 않도록 실제 값으로 확인하고 정했다 — "(주)노블아이산후조리원",
--    "(사)한국의료봉사회", "(하남)예쁨주의쁨의원", "A&B의원" 은 전부 통과한다.
--    반대로 ♡♡♡ · ☆SOHEE☆ · 🇰🇷 · 💌 · 선민❤️ · @@ · *** · :) · &#039;김경희 · ,이아란 은 전부 막힌다.

/** 이름에 쓸 수 없는 문자를 덜어내고, 앞의 문장부호도 떼고, 양끝 공백을 정리한다. */
create or replace function public.clean_person_name(v text)
returns text
language sql
immutable
as $$
  select nullif(
    btrim(
      regexp_replace(
        regexp_replace(coalesce(v, ''), '[^가-힣ㄱ-ㅎㅏ-ㅣa-zA-Z0-9 ().,''&·/-]', '', 'g'),
        '^[^가-힣a-zA-Z0-9(]+', ''
      )
    ), '');
$$;

/**
 * 규칙을 통과하는 값이면 그대로, 아니면 null.
 *
 * 🔴 "비어 있지 않은가" 가 아니라 **"규칙을 통과하는가"** 로 골라야 한다.
 *    전에는 비어 있지 않으면 썼더니 "♡(♡)" 같은 값이 "()" 로 정리돼 통과해버렸다
 *    (여는괄호로 시작하지만 글자가 하나도 없다).
 */
create or replace function public.valid_person_name(v text)
returns text
language sql
immutable
as $$
  select case
    when v ~ '^(?=.*[가-힣a-zA-Z0-9])[가-힣a-zA-Z0-9(][가-힣ㄱ-ㅎㅏ-ㅣa-zA-Z0-9 ().,''&·/-]{0,29}$'
    then v else null end;
$$;

-- ── ① 가입 경로 ────────────────────────────────────────────
--
-- 🔴 auth.users 의 app_metadata 로는 알 수 없다. 카카오·네이버 로그인은 커스텀 플로우라
--    admin.createUser 로 계정을 만드는데, Supabase 가 그때 app_metadata.provider 를
--    'email' 로 덮어쓴다(실측: 16,323명 전원 'email'). 실제 값은 user_metadata 에 들어간다.
--
-- 🔴 그런데 user_metadata 는 **세션 소유자가 브라우저에서 고칠 수 있다**(naver/callback 주석이
--    같은 이유로 역할 판정에 쓰지 말라고 적어뒀다). 그래서 가입 **그 순간에** profiles 로 복사한다 —
--    복사된 뒤에는 본인이 못 고친다(컬럼 grant 없음).
alter table public.profiles add column if not exists signup_provider text;

comment on column public.profiles.signup_provider is
  '가입 경로(email·kakao·naver·legacy). 가입 시점에 트리거가 찍는다 — 이후 본인이 못 바꾼다.';

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  insert into public.profiles (id, email, display_name, full_name, avatar_url, phone_number, role, signup_provider)
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
    coalesce((new.raw_user_meta_data ->> 'role')::public.user_role, 'nurse'),
    -- 카카오·네이버 콜백이 user_metadata.provider 에 심는다. 없으면 일반 이메일 가입이다.
    coalesce(nullif(new.raw_user_meta_data ->> 'provider', ''), 'email')
  )
  on conflict (id) do nothing;
  return new;
end;
$function$;

update public.profiles p
   set signup_provider = case
     when p.legacy_member_srl is not null then 'legacy'
     else coalesce(nullif(u.raw_user_meta_data ->> 'provider', ''), 'email')
   end
  from auth.users u
 where u.id = p.id and p.signup_provider is null;

update public.profiles set signup_provider = 'email' where signup_provider is null;

revoke update (signup_provider) on public.profiles from authenticated, anon;

-- ── ② 기존 이름 정리 ───────────────────────────────────────
--
-- 🔴 제약만 걸고 기존 값을 두면 그 사람들은 **프로필을 저장할 수 없게 된다**
--    (자기 행을 UPDATE 하는 순간 제약에 걸린다 — 전화번호 하나 못 고친다).
--    그러니 지금 정리한다. 허용되지 않는 문자만 **덜어낸다** — 이름 자체를 바꾸지 않는다.
--    "정희❤️" → "정희", "선민❤️" → "선민", "김지윤+Dharma" → "김지윤Dharma".
--    남는 글자가 없으면(💕, 一片树叶, ＪａｅＹｕｎ) 이메일 앞부분으로, 그것도 안 되면 '회원'.
update public.profiles
   set display_name = coalesce(
     public.valid_person_name(left(public.clean_person_name(display_name), 30)),
     public.valid_person_name(left(public.clean_person_name(split_part(coalesce(email, ''), '@', 1)), 30)),
     '회원'
   )
 where public.valid_person_name(display_name) is null and display_name is not null;

-- 이력서 이름은 비워둔다 — 이름이 없는 이력서는 관리자 화면에서 바로 눈에 띈다.
-- 여기에 '회원' 같은 가짜 이름을 넣으면 진짜 이름인 줄 알고 병원에 그대로 나간다.
update public.resumes
   set name = public.valid_person_name(left(public.clean_person_name(name), 30))
 where public.valid_person_name(name) is null and name is not null;

-- ── ③ 제약 ─────────────────────────────────────────────────
-- 위에서 전부 정리했으므로 VALID 로 건다(기존 행도 검사). 앞으로는 아예 못 들어온다.
alter table public.profiles drop constraint if exists profiles_display_name_shape;
alter table public.profiles add constraint profiles_display_name_shape
  check (display_name is null or public.valid_person_name(display_name) is not null);

alter table public.resumes drop constraint if exists resumes_name_shape;
alter table public.resumes add constraint resumes_name_shape
  check (name is null or public.valid_person_name(name) is not null);
