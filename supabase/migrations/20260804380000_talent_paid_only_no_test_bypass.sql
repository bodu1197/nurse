-- 🔴 광고가 끝났는데도 간호사 개인정보가 다 보였다(오너 지적 2026-08-04).
--
-- 원인은 is_talent_advertiser() 의 첫 번째 가지다:
--     "테스트 병원 소유자면 광고주로 간주한다"
-- 관리자 계정이 [테스트] 관리자 전용 병원을 갖고 있어서, 그 병원 공고가 끝나든 말든
-- **항상** 인재 열람 자격이 있었다. 테스트하려고 넣은 문이 상시 개방된 문이 됐다.
--
-- 규칙은 하나다(오너 확정): **돈을 낸 광고만 인재를 본다.**
--   · 무료 1주(첫 주 0원)로는 못 본다 — 지금도 두 번째 가지가 amount > 0 을 요구하므로 맞다.
--   · 관리자도 예외가 아니다. 관리자가 이력서를 봐야 할 일은 관리자 화면(/admin/resumes)에서
--     하면 되고, 그 경로는 감사 기록이 남는다. 공개 인재정보에 뒷문을 두지 않는다.
--
-- 이 함수를 지우면 인재 열람이 필요할 때 실제 결제가 있어야 한다. 그것이 규칙이므로 그대로 둔다.

create or replace function public.is_talent_advertiser()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
      from jobs j
      join hospitals h on h.id = j.hospital_id
     where h.owner_profile_id = (select auth.uid())
       and j.featured_until > now()                 -- 광고가 지금 살아 있어야 하고
       and exists (
         select 1 from ad_orders o
          where o.job_id = j.id
            and o.status = 'PAID'
            and o.tier <> 'admin_test'
            and o.amount > 0                        -- 실제로 돈이 들어와야 한다
       )
  );
$$;
