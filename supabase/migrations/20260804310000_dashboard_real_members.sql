-- 🔴 대시보드가 **이관 데이터를 사람으로 세고 있었다.**
--
-- 오너 지적: "이 홈페이지는 3일째인데 무슨 7일이냐? 7일은 레거시 이력서지."
-- 그리고 "오늘만 14건 이상이다" — 대시보드는 9건이라고 했다. 둘 다 오너가 맞다.
--
-- 실측(2026-08-04):
--   · auth.users 오늘 생성 941명 중 **922명이 13:15~13:20 내 이관 배치**다. 실제 사람은 19명.
--   · profiles 17,254명 중 17,193명이 signup_provider='legacy'. 실제 회원은 61명(카카오38·이메일23).
--   · 즉 "오늘 가입 941" 도, "최근 7일" 도, "최근 30일" 도 전부 내 배치를 센 숫자였다.
--     사이트는 8/2에 열렸다. 그 전 날짜의 모든 숫자는 사람이 아니다.
--
-- 회원·이력서의 기간 숫자는 **레거시를 뺀다**. 레거시 규모는 따로 한 칸에 적는다 —
-- 섞어 놓으면 17,000이라는 큰 수가 19라는 진짜 수를 덮어 버린다.

-- ── ① 내가 덮어쓴 저장시각 복구 ────────────────────────────────────────────
-- 20260804290000 의 백필은 "같은 초에 4건 이상 = 배치" 로 보고 그 행의 last_edited_at 을
-- created_at 으로 되돌렸다. 그런데 그 배치들(11:40 이름정리, 13:47 이력서이관)이 지나가기 **전에**
-- 이미 사람이 저장한 행이 있었다 — 그 사람의 저장시각은 배치가 먼저 덮었고, 백필은 그걸 몰랐다.
--   실측: 신광재(오늘 09:45 로그인 / 저장기록 2026-03-10), 변지연(오늘 11:49 / 2026-06-15).
--   이분들은 인재 목록에서 8,000건 뒤로 밀려 있었다.
--
-- 로그인 시각을 하한으로 쓴다. 로그인은 저장이 아니지만, **로그인보다 이른 시각에 저장했을 리는 없다.**
-- 사이트가 열린 8/2 이후로 한정한다 — 그 전 로그인까지 끌어오면 이관 회원 전부가 앞줄로 올라온다.
update public.resumes r
   set last_edited_at = u.last_sign_in_at
  from auth.users u
 where u.id = r.profile_id
   and u.last_sign_in_at >= '2026-08-02 00:00+09'
   and (r.last_edited_at is null or r.last_edited_at < u.last_sign_in_at);

-- ── ② 대시보드: 사람과 이관분을 나눈다 ──────────────────────────────────────
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
    -- 🔴 기간 숫자(today/yesterday/d7/d30)는 **실제 가입만** 센다. legacy_member_srl 이 있으면
    --    구 널스넷에서 내가 옮겨온 계정이고, 그 created_at 은 이관을 돌린 시각이지 가입한 날이 아니다.
    'members', (select json_build_object(
        'total', count(*), 'nurse', count(*) filter (where role = 'nurse'),
        'hospital', count(*) filter (where role = 'hospital'),
        'legacy', count(*) filter (where legacy_member_srl is not null),
        'real', count(*) filter (where legacy_member_srl is null),
        'today', count(*) filter (where legacy_member_srl is null and created_at >= d0),
        'yesterday', count(*) filter (where legacy_member_srl is null and created_at >= dy and created_at < d0),
        'd7', count(*) filter (where legacy_member_srl is null and created_at >= d7),
        'd30', count(*) filter (where legacy_member_srl is null and created_at >= d30)
      ) from public.profiles),
    'resumes', (select json_build_object(
        'total', count(*), 'public', count(*) filter (where r.is_public),
        -- 실제 회원이 쓴 이력서. 나머지는 이관분이다.
        'real', count(*) filter (where p.legacy_member_srl is null),
        'real_public', count(*) filter (where p.legacy_member_srl is null and r.is_public),
        'today', count(*) filter (where p.legacy_member_srl is null and r.created_at >= d0),
        'yesterday', count(*) filter (where p.legacy_member_srl is null and r.created_at >= dy and r.created_at < d0),
        'd7', count(*) filter (where p.legacy_member_srl is null and r.created_at >= d7),
        'd30', count(*) filter (where p.legacy_member_srl is null and r.created_at >= d30),
        -- 🔴 '저장' 은 레거시 회원도 센다. 이 사이트에서 이력서를 채우는 사람 대부분이
        --    이관 회원이라(이미 빈 이력서가 있으니 INSERT 가 아니라 UPDATE 다) 그들을 빼면
        --    화면에는 오늘 쓴 이력서가 잔뜩 보이는데 대시보드만 0 이 된다.
        --    last_edited_at 은 사람이 저장할 때만 갱신된다(saveResume) — 이관 여부와 무관하게 사람이다.
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
      -- 비공개 이력서는 병원에 안 보인다. 본인은 올렸다고 생각하는데 아무도 못 본다.
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
