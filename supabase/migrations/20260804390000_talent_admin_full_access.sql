-- 최고 관리자는 권한을 다 갖는다(오너 확정 2026-08-04).
--
-- 20260804380000 에서 인재 열람의 테스트 병원 예외를 없앴는데, 그때 관리자까지 같이 막혔다.
-- 되돌리되 **열쇠를 바꾼다**:
--   전: "테스트 병원을 가진 사람" — 병원 소유 여부가 열쇠였다. 관리자가 아닌 사람이 테스트 병원을
--       하나 갖게 되면 그 사람도 전부 열렸고, 화면 어디에도 그 사실이 드러나지 않았다.
--   후: "최고 관리자인 사람"(is_admin) — 권한의 근거가 역할 그 자체다. 읽는 사람이 바로 안다.
--
-- 병원에 대한 규칙은 그대로다: 광고가 살아 있고 + 실제로 돈이 들어온 경우에만 인재를 본다.
-- 무료 1주로는 못 본다.

create or replace function public.is_talent_advertiser()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  -- 최고 관리자는 전부 볼 수 있다. 관리자 화면(/admin/resumes)과 같은 권한이므로
  -- 공개 화면에서만 못 보게 막아 봐야 우회로만 늘어난다.
  select public.is_admin() or exists (
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
