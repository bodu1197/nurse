-- 결제 대기(draft) 공고를 결제 없이 게시하는 구멍을 막는다.
--
-- 🔴 무엇이 열려 있었나
--   jobs_write_owner 는 `for all` 인데 using/with check 가 **소유 여부만** 봤다.
--   거기에 20260723130000 이 `grant update (status) on public.jobs to authenticated` 를 줬다.
--   그래서 병원 회원이 자기 세션 + 공개 anon 키로 PostgREST 를 직접 부르면
--     PATCH /rest/v1/jobs?id=eq.<내 draft 공고>  {"status":"open"}
--   가 그대로 통과했다. 유료 상품을 고른 공고는 draft 로 저장되므로(createJob), 이 한 번의
--   호출로 **돈을 내지 않고 7일 노출**을 얻는다(getJobs 는 source=direct 를 posted_at 신선도로 낸다).
--   draft 를 여러 건 만들어 반복하면 '무료 동시 1건' 제한도 무제한 우회된다.
--   앱 경로(setJobStatus)는 .in("status",["open","closed"]) 로 막혀 있었지만,
--   **앱을 거치지 않는 길**이 남아 있었다.
--
-- 같은 구멍을 applications 에서는 20260723160000_hospital_status_whitelist.sql 이 이미 막았다.
-- 여기서 같은 방식을 jobs 에 적용한다 — using 과 with check **양쪽**에 상태를 건다.
--   · with check 만 걸면: draft → open 은 막지만, 이미 open 인 것을 draft 로 되돌리는 길이 남는다.
--   · using 만 걸면: draft 행을 못 고치지만, open → 임의 상태로 나가는 길이 남는다.
--
-- 🔴 for all 을 쪼개도 잃는 것이 없음을 확인했다
--   · SELECT — jobs_select_open 이 이미 `status='open' or 소유자` 라 본인 draft 도 보인다.
--   · INSERT — authenticated 에게서 이미 revoke 되어 있다(20260723130000). 등록은 service_role.
--   · UPDATE — authenticated 가 쓸 수 있는 컬럼은 status 하나뿐. 앱에서 이 경로를 쓰는 곳은
--              setJobStatus(actions.ts:909) 하나이고 open/closed 만 보낸다.
--   · DELETE — deleteJob(actions.ts:922)이 사용자 클라이언트로 지운다. 상태 제한을 걸지 않는다
--              (결제 안 한 draft 를 스스로 지우는 것은 막을 이유가 없다).
--   · repostJob·광고 활성화는 service_role(createAdminClient) 이라 RLS 를 타지 않는다.

drop policy if exists jobs_write_owner on public.jobs;

create policy jobs_update_owner on public.jobs for update
  using (
    jobs.status in ('open', 'closed')
    and exists (select 1 from public.hospitals h
                where h.id = jobs.hospital_id and h.owner_profile_id = (select auth.uid()))
  )
  with check (
    status in ('open', 'closed')
    and exists (select 1 from public.hospitals h
                where h.id = jobs.hospital_id and h.owner_profile_id = (select auth.uid()))
  );

create policy jobs_delete_owner on public.jobs for delete
  using (
    exists (select 1 from public.hospitals h
            where h.id = jobs.hospital_id and h.owner_profile_id = (select auth.uid()))
  );
