-- 🗂 "밖에서 수집한 공고" 에 **대학병원 채용 ATS(source='crawl')** 를 더한다.
--
-- 왜: 잡알리오는 공공기관만 다뤄서 상급종합병원 47곳 중 3곳밖에 못 얻었다. 사립(세브란스·고대의료원·
-- 한양대·중앙대·아주대…)은 자기 채용사이트에만 올리는데, 그 상당수가 **같은 ATS(마이다스인 리크루터)**
-- 를 쓴다 — 서브도메인만 다르고 경로·응답이 같다. 파서 하나로 20개 기관이 열린다(실측: 간호 34건).
--
-- 🔴 이 파일을 빼먹으면 **크론은 도는데 화면엔 한 건도 안 뜬다.** 수집 공고는 광고를 산 적이 없어
--    featured_until 이 null 이라, is_live 예외 목록에 없으면 전부 false 가 된다. 조용한 실패다.
--    (같은 실수를 잡알리오 붙일 때도 할 뻔했다 — 20260811150000 참고.)
-- 🔴 앱 쪽 짝은 src/lib/jobState.ts 의 COLLECTED_SOURCES 다. 수집처가 늘면 **두 곳을 같이** 고친다.

-- 🔴 CREATE OR REPLACE VIEW 는 reloptions 를 통째로 갈아엎는다. with 절을 안 적으면 security_invoker
--    가 지워져 뷰가 RLS 를 우회한다 — 그 상태에서 비로그인 anon 이 마감·임시저장 공고 2,170건을
--    담당자 연락처까지 읽었다(실측 2026-08-05). 바꿀 때마다 **정의 안에** 다시 적는다.
create or replace view public.jobs_listed
with (security_invoker = true) as
 SELECT j.id, j.hospital_id, j.title, j.specialty, j.location, j.employment_type, j.salary_text,
    j.benefits, j.description, j.source, j.external_url, j.external_id, j.status, j.is_featured,
    j.posted_at, j.created_at, j.updated_at, j.featured_until, j.ad_tier, j.manager_name,
    j.manager_phone, j.deadline, j.recruit_count, j.shift_type, j.apply_method, j.apply_email,
    j.apply_detail, j.apply_methods, j.detail_fetched_at, j.company_name, j.sido, j.sigungu,
    j.facility_type, j.job_category, j.lat, j.lng, j.geocoded_at,
    j.featured_until IS NOT NULL AND j.featured_until > now() AS ad_live,
    (j.status = 'open'
      AND (j.source in ('worknet','public_data','crawl') OR j.featured_until IS NOT NULL AND j.featured_until > now())
      AND (j.deadline IS NULL OR j.deadline >= (now() AT TIME ZONE 'Asia/Seoul')::date)) IS TRUE AS is_live,
    (j.ad_tier = 'standard' AND j.featured_until IS NOT NULL AND j.featured_until > now()) IS TRUE AS ad_paid,
    h.name AS hospital_name
   FROM public.jobs j
   LEFT JOIN public.hospitals h ON h.id = j.hospital_id;

-- 관리자 대시보드: 수집분은 '우리 공고'·'광고' 에서 빼고 'collected' 로 센다.
-- 🔴 아래 세 곳이 이 규칙을 쓰는 전부다(20260811150000 에서 확인). 나머지는 그대로다.
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
