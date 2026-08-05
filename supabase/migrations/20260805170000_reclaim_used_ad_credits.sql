-- 💰 첫 광고비 지원(병원당 1회)을 **이미 받은 병원의 잔액을 회수한다.**
--
-- 오너 확정 2026-08-05:
--   · 널스넷은 병원당 **1회만** 광고비를 지원한다. 병원 화면에는 「무료 7일」로 보이지만
--     안에서는 지원금(hospitals.free_credits)이 1회 차감된다 — 다음부터는 잔액이 없어 유료뿐이다.
--   · "지금 공고가 노출된 병원들은 공짜돈을 모두 회수해야 한다. 이미 광고가 나가고 있기 때문에."
--   · 그 이전의 일은 묻지 않는다(과거 소급 없음).
--
-- 왜 필요했나: free_credits 는 처음부터 있었지만(기본 1) **한 번도 차감된 적이 없었다**
-- (실측 2026-08-05: 병원 81,430곳 전부 잔액 1). 제한이 코드에 없어서, 7일이 끝날 때마다
-- '다시 게시'를 누르면 **1원도 안 내고 계속 광고**할 수 있었다. 실제로 그 일이 있었다 —
-- 관리자가 켜준 무료 7일을 쓴 병원이 같은 공고를 오늘 또 무료로 올렸다.
-- 차감은 같은 커밋의 createJob·repostJob 에 넣었고, 여기서는 **이미 받은 몫**만 정리한다.
--
-- 🔒 대상은 **지금 노출 중인 우리 공고를 가진 병원**뿐이다(jobs_listed.is_live).
--    워크넷 수집분은 우리가 파는 자리가 아니므로 제외하고, 이미 끝난 공고도 건드리지 않는다.
--    인재정보 열람은 이 변경과 무관하게 **실결제 광고**만 열린다(is_talent_advertiser) — 그대로다.
update public.hospitals h
   set free_credits = 0
 where free_credits > 0
   and exists (
     select 1
       from public.jobs j
       join public.jobs_listed jl on jl.id = j.id
      where j.hospital_id = h.id
        and j.source <> 'worknet'
        and jl.is_live
   );
