-- 📊 대시보드 「오늘 등록 공고」 옆에 **그중 지금 노출되는 건수**를 같이 낸다.
--
-- 왜: 이 숫자는 posted_at 만 보므로 결제 전(draft)·마감(closed)·탈퇴로 닫힌 공고까지 전부 센다.
--     2026-08-13 실제로 3건이 찍혔는데 구직자에게 보이는 것은 1건이었다 —
--     ① 연세두리 무료 1주 → 노출  ② 다나메디피아 '테스트' → 등록 3분 뒤 탈퇴로 자동 마감
--     ③ 그리니피부과 → 결제 전(draft) 상태에서 2분 뒤 탈퇴로 자동 마감.
--     숫자가 틀린 것은 아니지만 화면이 "3건이 올라왔다" 로 읽혀서 목록을 뒤지게 만들었다.
--     한 줄 더 내보내 카드에서 같이 보여주면 그 질문이 화면에서 끝난다.
-- 🔴 today 를 is_live 기준으로 **바꾸지는 않는다.** '등록됐다' 와 '보인다' 는 다른 사실이고,
--    등록은 느는데 노출이 안 늘면 그것이 곧 결제 이탈 신호다 — 두 숫자가 나란히 있어야 보인다.

CREATE OR REPLACE FUNCTION public.admin_dashboard()
 RETURNS json
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  d0  timestamptz := date_trunc('day', now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul';
  dy  timestamptz := d0 - interval '1 day';
  d7  timestamptz := d0 - interval '6 days';
  d30 timestamptz := d0 - interval '29 days';
  kst_today date := (now() at time zone 'Asia/Seoul')::date;
  result json;
begin
  if not private.is_admin() then
    raise exception '관리자 전용입니다' using errcode = '42501';
  end if;

  select json_build_object(
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
        'saved_today', count(*) filter (where r.last_edited_at >= d0),
        'saved_yesterday', count(*) filter (where r.last_edited_at >= dy and r.last_edited_at < d0),
        'edited_today', count(*) filter (where r.last_edited_at >= d0 and r.created_at < d0),
        'edited_d7', count(*) filter (where r.last_edited_at >= d7 and r.created_at < d7)
      ) from public.resumes r join public.profiles p on p.id = r.profile_id),
    -- 🔴 posted_at 이다. created_at 은 이관 배치가 오늘로 밀어놨다.
    'jobs', (select json_build_object(
        'open', count(*) filter (where is_live),
        'today', count(*) filter (where posted_at >= d0),
        -- 🔴 '오늘 등록' 옆에 **그중 실제로 보이는 것**을 같이 낸다. 등록은 결제 전(draft)·마감까지
        --    전부 세므로, 이 짝이 없으면 "오늘 3건 등록" 을 보고 목록에 갔다가 1건만 찾게 된다
        --    (오너 지적 2026-08-13: 3건 중 2건이 탈퇴·결제 전이라 안 보였다).
        'today_live', count(*) filter (where posted_at >= d0 and is_live),
        'yesterday', count(*) filter (where posted_at >= dy and posted_at < d0),
        'd7', count(*) filter (where posted_at >= d7),
        'closing3', count(*) filter (where is_live and deadline is not null
                                       and deadline between kst_today and kst_today + 3)
      ) from public.jobs_listed where source not in ('worknet','public_data','crawl')),
    'collected', (select json_build_object(
        'open', count(*) filter (where is_live),
        'today', count(*) filter (where posted_at >= d0),
        'last_sync', max(updated_at)
      ) from public.jobs_listed where source in ('worknet','public_data','crawl')),
    -- 🔴 테스트 병원 지원은 뺀다 — 「지원 내역」 화면과 같은 술어여야 두 화면이 같은 말을 한다.
    'applications', (select json_build_object(
        'total', count(*),
        'today', count(*) filter (where a.created_at >= d0),
        'yesterday', count(*) filter (where a.created_at >= dy and a.created_at < d0),
        'd7', count(*) filter (where a.created_at >= d7)
      ) from public.applications a
        join public.jobs j on j.id = a.job_id
        left join public.hospitals h on h.id = j.hospital_id
       where coalesce(h.is_test, false) = false),
    'ads', (select json_build_object(
        'live', count(*) filter (where is_live and ad_tier = 'standard'),
        'granted', count(*) filter (where is_live and ad_tier is distinct from 'standard'),
        'ending7', count(*) filter (where is_live and ad_tier = 'standard' and featured_until <= now() + interval '7 days')
      ) from public.jobs_listed where source not in ('worknet','public_data','crawl')),
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
        'd30', coalesce(sum(views) filter (where day >= kst_today - 29), 0),
        'bots30', coalesce(sum(bots) filter (where day >= kst_today - 29), 0)
      ) from public.page_views where day >= kst_today - 29),
    -- 🔴 d7·d30 은 **서로 다른 지문의 수**다(일별 합이 아니다).
    'visitors', (select json_build_object(
        'today', count(*) filter (where day = kst_today),
        'yesterday', count(*) filter (where day = kst_today - 1),
        'd7', count(distinct vid) filter (where day >= kst_today - 6),
        'd30', count(distinct vid)
      ) from public.visitors where day >= kst_today - 29)
  ) into result;

  return result;
end;
$function$;
