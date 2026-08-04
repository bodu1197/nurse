-- ① 인재 열람 자격을 **실제로 돈을 낸 광고**로 좁힌다 (오너 지시 2026-08-04)
-- ② 기존 공고 44건에 오늘부터 7일 무료 광고를 부여한다
--
-- 🔴 순서가 중요하다. ②를 먼저 하면 그 사이에 병원들이 이력서 7,270건의 이름·연락처를 공짜로 본다.
--    ① 먼저 잠그고 ② 부여한다.

-- ── ① 자격은 실결제로만 ────────────────────────────────────
--
-- 지금은 `featured_until > now()` 만 보므로, 관리자가 무료로 켜준 광고(admin_test)나
-- 아래 ②처럼 운영이 얹어준 무료 광고도 인재 열람 자격을 준다.
-- 오너 확정: **공고를 낸 것은 유료든 무료든 같은 광고지만, 돈을 안 낸 쪽은 인재를 볼 수 없다.**
--
-- 판정 = 내가 소유한 병원의 공고 중, 노출 기간이 살아 있고 **그 공고에 실결제가 있는 것**.
-- amount > 0 까지 본다 — admin_test 는 0원으로 기록되지만(activateAdFree), tier 만 믿지 않는다.
create or replace function public.is_talent_advertiser()
returns boolean
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
  select exists (
    -- 테스트 병원 = 광고주로 간주. 이 병원은 병원 검색·명부에서 이미 제외돼 밖으로 안 샌다.
    select 1 from hospitals h
    where h.owner_profile_id = (select auth.uid()) and h.is_test
  ) or exists (
    select 1
      from jobs j
      join hospitals h on h.id = j.hospital_id
     where h.owner_profile_id = (select auth.uid())
       and j.featured_until > now()
       and exists (
         select 1 from ad_orders o
          where o.job_id = j.id
            and o.status = 'PAID'
            and o.tier <> 'admin_test'
            and o.amount > 0
       )
  );
$function$;

-- ── ② 기존 공고에 7일 무료 광고 부여 ───────────────────────
--
-- 워크넷 수집분은 제외한다(우리 공고가 아니다). 이미 광고가 살아 있는 공고는 건드리지 않는다 —
-- 돈 내고 산 기간을 7일로 덮어쓰면 손해를 끼친다.
--
-- ad_tier='free' 로 표시해 둔다. ①이 실결제를 따로 보므로 이 값이 자격을 주지는 않는다.
update public.jobs
   set featured_until = now() + interval '7 days',
       ad_tier = 'free'
 where source <> 'worknet'
   and status = 'open'
   and (featured_until is null or featured_until <= now());

-- 감사 기록 — 관리자가 화면에서 한 것이 아니라 마이그레이션으로 한 조치라 actor 가 없다.
-- 그래도 "언제 무엇을 왜" 는 남겨야 나중에 이 7일이 어디서 왔는지 설명할 수 있다.
insert into public.admin_actions (actor_id, actor_email, action, target_table, target_id, reason)
select null, '(마이그레이션)', 'ad.grant_free', 'jobs', j.id::text,
       '오픈 준비 — 기존 공고에 오늘부터 7일 무료 광고 부여(오너 지시 2026-08-04). 인재 열람 자격은 없음'
  from public.jobs j
 where j.ad_tier = 'free' and j.featured_until > now();
