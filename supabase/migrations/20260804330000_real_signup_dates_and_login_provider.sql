-- 세 가지를 한 번에 정리한다. 전부 오늘 오너 지적에서 나온 것이다.
--
-- ① 레거시 가입일 복원 뒤처리
--    scripts/restore-legacy-signup-dates.ts 가 구 널스넷 wp_member.regdate 를
--    profiles.created_at / auth.users.created_at 에 되돌려 넣었다(17,129건).
--    "레거시 회원은 8월 4일에 가입 자체가 불가능하다 — 그날은 새 DB 가 열린 날이다"(오너).
--    이제 이관 회원의 created_at 은 2024~2026 에 퍼져 있고, 오늘 날짜로 남은 건 0건이다.
--    → 대시보드에서 **이관분을 빼던 장치를 없앤다.** 날짜가 진짜니까 그냥 세면 맞는다.
--      (억지로 빼는 조건이 남아 있으면, 앞으로 진짜 신규 가입자가 legacy 로 잘못 표시될 때
--       숫자가 조용히 사라진다. 조건이 없으면 그런 실수 자체가 불가능하다.)
--
-- ② 로그인 경로를 기록한다
--    카카오로 들어와도 이메일이 이관 계정과 맞으면 그 계정에 붙는다 — 흔적이 남지 않아
--    "오늘 카카오로 들어온 사람"을 셀 방법이 아예 없었다. 내가 계속 숫자를 틀린 원인이다.
--    signup_provider(계정이 만들어진 경로)와 따로 둔다. 로그인은 여러 번, 가입은 한 번이다.
--
-- ③ 학력이 같은 걸 두 번 묻던 것
--    "4년제 졸업" 을 고르면 옆에서 또 "졸업 여부"를 묻는다(오너 지적).
--    최종 학력은 **학위 수준**만 말하게 하고, 졸업/졸업예정/재학중은 졸업 여부 한 곳에서만 받는다.
--    실제로 모순 데이터가 이미 있다: "4년제 졸업" + "졸업예정" 1건.

-- ── ② 로그인 경로 ─────────────────────────────────────────────────────────
alter table public.profiles add column if not exists last_login_provider text;

comment on column public.profiles.last_login_provider is
  '마지막으로 로그인할 때 쓴 경로(kakao 등). signup_provider(가입 경로)와 다르다 — 이관 회원이 카카오로 들어오면 여기에만 남는다.';

-- ── ③ 학력 중복 제거 ──────────────────────────────────────────────────────
-- 순서 중요: 졸업 여부를 먼저 채우고 나서 라벨을 깎는다. 반대로 하면 '졸업' 이라는 근거가 사라진다.
update public.resumes
   set graduation_status = '졸업'
 where graduation_status is null and education_level like '% 졸업';

update public.resumes
   set education_level = replace(education_level, ' 졸업', '')
 where education_level like '% 졸업';

-- ── ① 대시보드: 이관분 제외 장치 제거 ──────────────────────────────────────
create or replace function public.admin_dashboard()
returns json
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  d0  timestamptz := date_trunc('day', now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul';
  dy  timestamptz := d0 - interval '1 day';
  d7  timestamptz := d0 - interval '6 days';
  d30 timestamptz := d0 - interval '29 days';
  kst_today date := (now() at time zone 'Asia/Seoul')::date;
  result json;
begin
  if not public.is_admin() then
    raise exception '관리자 전용입니다' using errcode = '42501';
  end if;

  select json_build_object(
    -- created_at 은 이제 **진짜 가입일**이다(구 널스넷 시절 포함). 그냥 센다.
    'members', (select json_build_object(
        'total', count(*), 'nurse', count(*) filter (where role = 'nurse'),
        'hospital', count(*) filter (where role = 'hospital'),
        'legacy', count(*) filter (where legacy_member_srl is not null),
        'real', count(*) filter (where legacy_member_srl is null),
        'today', count(*) filter (where created_at >= d0),
        'yesterday', count(*) filter (where created_at >= dy and created_at < d0),
        'd7', count(*) filter (where created_at >= d7),
        'd30', count(*) filter (where created_at >= d30)
      ) from public.profiles),
    'resumes', (select json_build_object(
        'total', count(*), 'public', count(*) filter (where r.is_public),
        'real', count(*) filter (where p.legacy_member_srl is null),
        'real_public', count(*) filter (where p.legacy_member_srl is null and r.is_public),
        'today', count(*) filter (where r.created_at >= d0),
        'yesterday', count(*) filter (where r.created_at >= dy and r.created_at < d0),
        'd7', count(*) filter (where r.created_at >= d7),
        'd30', count(*) filter (where r.created_at >= d30),
        -- 🔴 저장은 last_edited_at 으로 센다. updated_at 은 내 배치가 세 번 밀어서 못 쓴다.
        --    로그인한 적 없는 사람의 값은 20260804320000 에서 걷어냈다.
        'saved_today', count(*) filter (where r.last_edited_at >= d0),
        'saved_yesterday', count(*) filter (where r.last_edited_at >= dy and r.last_edited_at < d0),
        'edited_today', count(*) filter (where r.last_edited_at >= d0 and r.created_at < d0),
        'edited_d7', count(*) filter (where r.last_edited_at >= d7 and r.created_at < d7)
      ) from public.resumes r join public.profiles p on p.id = r.profile_id),
    'jobs', (select json_build_object(
        'open', count(*) filter (where status = 'open'),
        'today', count(*) filter (where created_at >= d0),
        'yesterday', count(*) filter (where created_at >= dy and created_at < d0),
        'd7', count(*) filter (where created_at >= d7),
        'closing3', count(*) filter (where status = 'open' and deadline is not null
                                       and deadline between kst_today and kst_today + 3)
      ) from public.jobs where source <> 'worknet'),
    'collected', (select json_build_object(
        'open', count(*) filter (where status = 'open'),
        'today', count(*) filter (where created_at >= d0),
        'last_sync', max(updated_at)
      ) from public.jobs where source = 'worknet'),
    'applications', (select json_build_object(
        'total', count(*),
        'today', count(*) filter (where created_at >= d0),
        'yesterday', count(*) filter (where created_at >= dy and created_at < d0),
        'd7', count(*) filter (where created_at >= d7)
      ) from public.applications),
    'ads', (select json_build_object(
        'live', count(*) filter (where featured_until > now() and ad_tier is distinct from 'admin_test'),
        'granted', count(*) filter (where featured_until > now() and ad_tier = 'admin_test'),
        'ending7', count(*) filter (where featured_until > now() and featured_until <= now() + interval '7 days')
      ) from public.jobs where source <> 'worknet'),
    'revenue', (select json_build_object(
        'today', coalesce(sum(amount) filter (where paid_at >= d0), 0),
        'yesterday', coalesce(sum(amount) filter (where paid_at >= dy and paid_at < d0), 0),
        'd30', coalesce(sum(amount) filter (where paid_at >= d30), 0),
        'total', coalesce(sum(amount), 0),
        'count30', count(*) filter (where paid_at >= d30)
      ) from public.ad_orders where status = 'PAID' and tier <> 'admin_test'),
    'todo', json_build_object(
      'inquiries', (select count(*) from public.inquiries where status = 'open'),
      'tax', (select count(*) from public.ad_orders
                where status = 'PAID' and tier <> 'admin_test' and tax_issued_at is null),
      'stale_orders', (select count(*) from public.ad_orders
                where status = 'PREPARE' and created_at < now() - interval '1 hour'),
      'failed_orders', (select count(*) from public.ad_orders where status = 'FAILED'),
      'hidden_reviews', (select count(*) from public.reviews where is_hidden),
      'hidden_posts', (select count(*) from public.board_posts where is_hidden),
      'nameless_resumes', (select count(*) from public.resumes where name is null),
      'private_resumes_7d', (select count(*) from public.resumes
                where not is_public and last_edited_at >= d7)
    ),
    'traffic', (select json_build_object(
        'today', coalesce(sum(views) filter (where day = kst_today), 0),
        'yesterday', coalesce(sum(views) filter (where day = kst_today - 1), 0),
        'd7', coalesce(sum(views) filter (where day >= kst_today - 6), 0),
        'd30', coalesce(sum(views) filter (where day >= kst_today - 29), 0)
      ) from public.page_views where day >= kst_today - 29)
  ) into result;

  return result;
end;
$$;
