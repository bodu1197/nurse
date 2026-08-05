-- 🩺 Supabase Advisor 정리 — 2/2. multiple_permissive_policies 66건.
--
-- 무엇이 문제였나: 한 표·한 동작에 permissive 정책이 여러 개면 Postgres 는 **행마다 전부 평가**한다
-- (하나만 통과해도 되지만, 통과 여부를 알려면 다 돌려봐야 한다). resumes 는 SELECT 정책이 4개라
-- 8,084행을 훑을 때마다 4개 식이 각각 돈다 — 그중 둘은 EXISTS 서브쿼리다.
--
-- 근본 수정: **표·동작마다 정책 하나**. 여러 정책의 USING 을 OR 로 합치면 의미가 정확히 같다
-- (permissive 는 원래 OR 로 결합된다). UPDATE 는 USING 과 WITH CHECK 가 서로 독립으로 평가되므로
-- 각각 OR 로 합치면 종전과 동일하다.
--
-- FOR ALL 정책도 SELECT 와 겹친다 → INSERT/UPDATE/DELETE 로 쪼개고, SELECT 몫은 통합 SELECT 정책에 넣는다.
--
-- 🔒 권한은 **한 톨도 바꾸지 않는다**(아래 work_experiences 한 건만 예외 — 그건 누수 수정이다).
--    적용 전후로 anon·간호사·병원·관리자 네 역할이 각 표에서 보는 행 수를 실측해 대조했다.

-- ── ad_orders ────────────────────────────────────────────────────────────────
drop policy if exists ad_orders_select_admin on public.ad_orders;
drop policy if exists ad_orders_select_own on public.ad_orders;
create policy ad_orders_select on public.ad_orders for select
  using ((select public.is_admin()) or buyer_id = (select auth.uid()));

-- ── applications ─────────────────────────────────────────────────────────────
drop policy if exists applications_select on public.applications;
drop policy if exists applications_select_admin on public.applications;
create policy applications_select on public.applications for select
  using (
    (select public.is_admin())
    or applicant_id = (select auth.uid())
    or exists (
      select 1 from public.jobs j join public.hospitals h on h.id = j.hospital_id
       where j.id = applications.job_id and h.owner_profile_id = (select auth.uid()))
  );

-- 지원자는 '철회'만, 병원은 '열람/합격/불합격'만 — 두 규칙을 한 정책에 담는다.
drop policy if exists applications_update_hospital on public.applications;
drop policy if exists applications_withdraw_own on public.applications;
create policy applications_update on public.applications for update
  using (
    (status <> 'withdrawn' and exists (
      select 1 from public.jobs j join public.hospitals h on h.id = j.hospital_id
       where j.id = applications.job_id and h.owner_profile_id = (select auth.uid())))
    or (applicant_id = (select auth.uid()) and status = any (array['submitted', 'viewed']))
  )
  with check (
    (status = any (array['viewed', 'accepted', 'rejected']) and exists (
      select 1 from public.jobs j join public.hospitals h on h.id = j.hospital_id
       where j.id = applications.job_id and h.owner_profile_id = (select auth.uid())))
    or (applicant_id = (select auth.uid()) and status = 'withdrawn')
  );

-- ── hospitals ────────────────────────────────────────────────────────────────
-- FOR ALL 이라 SELECT 까지 덮어 hospitals_select_all(true) 과 겹쳤다. 쓰기 3종으로 쪼갠다.
-- (읽기는 어차피 전원 허용이라 잃는 것이 없다.)
drop policy if exists hospitals_write_owner on public.hospitals;
create policy hospitals_insert_owner on public.hospitals for insert
  with check (owner_profile_id = (select auth.uid()));
create policy hospitals_update_owner on public.hospitals for update
  using (owner_profile_id = (select auth.uid()))
  with check (owner_profile_id = (select auth.uid()));
create policy hospitals_delete_owner on public.hospitals for delete
  using (owner_profile_id = (select auth.uid()));

-- ── jobs ─────────────────────────────────────────────────────────────────────
drop policy if exists jobs_select_admin on public.jobs;
drop policy if exists jobs_select_open on public.jobs;
create policy jobs_select on public.jobs for select
  using (
    (select public.is_admin())
    or status = 'open'
    or exists (
      select 1 from public.hospitals h
       where h.id = jobs.hospital_id and h.owner_profile_id = (select auth.uid()))
  );

drop policy if exists jobs_update_admin on public.jobs;
drop policy if exists jobs_update_owner on public.jobs;
create policy jobs_update on public.jobs for update
  using (
    (select public.is_admin())
    or (status = any (array['open', 'closed']) and exists (
      select 1 from public.hospitals h
       where h.id = jobs.hospital_id and h.owner_profile_id = (select auth.uid())))
  )
  with check (
    (select public.is_admin())
    or (status = any (array['open', 'closed']) and exists (
      select 1 from public.hospitals h
       where h.id = jobs.hospital_id and h.owner_profile_id = (select auth.uid())))
  );

-- ── profiles ─────────────────────────────────────────────────────────────────
drop policy if exists profiles_select_admin on public.profiles;
drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select on public.profiles for select
  using ((select public.is_admin()) or (select auth.uid()) = id);

-- ── resumes ──────────────────────────────────────────────────────────────────
-- SELECT 정책 4개(관리자 · 본인 · 광고주 · 내게 지원한 사람)를 하나로. 순서는 **싼 것부터** 둔다 —
-- 본인 비교가 먼저 통과하면 뒤의 EXISTS 서브쿼리는 아예 돌지 않는다(OR 단축평가).
drop policy if exists resumes_select_admin on public.resumes;
drop policy if exists resumes_select_advertiser on public.resumes;
drop policy if exists resumes_select_for_hospital on public.resumes;
drop policy if exists resumes_select_own on public.resumes;
create policy resumes_select on public.resumes for select
  using (
    profile_id = (select auth.uid())
    or (select public.is_admin())
    or (is_public and (select public.is_talent_advertiser()))
    or exists (
      select 1 from public.applications a
        join public.jobs j on j.id = a.job_id
        join public.hospitals h on h.id = j.hospital_id
       where a.applicant_id = resumes.profile_id and h.owner_profile_id = (select auth.uid()))
  );

drop policy if exists resumes_update_admin on public.resumes;
drop policy if exists resumes_update_own on public.resumes;
create policy resumes_update on public.resumes for update
  using (profile_id = (select auth.uid()) or (select public.is_admin()))
  with check (profile_id = (select auth.uid()) or (select public.is_admin()));

-- ── site_posts ───────────────────────────────────────────────────────────────
drop policy if exists site_posts_read on public.site_posts;
drop policy if exists site_posts_read_admin on public.site_posts;
drop policy if exists site_posts_write_admin on public.site_posts;
create policy site_posts_select on public.site_posts for select
  using ((published_at is not null and published_at <= now()) or (select public.is_admin()));
create policy site_posts_insert_admin on public.site_posts for insert
  with check ((select public.is_admin()));
create policy site_posts_update_admin on public.site_posts for update
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy site_posts_delete_admin on public.site_posts for delete
  using ((select public.is_admin()));

-- ── work_experiences ─────────────────────────────────────────────────────────
-- 🔴 여기서 **누수를 하나 막는다.** 종전 work_experiences_select_advertiser 는 열람 자격을
--    `EXISTS(내 병원 공고 중 featured_until > now())` 로 봤다 — 즉 **돈을 안 낸 무료 게시**만으로도
--    남의 경력(근무 병원명·담당업무)이 열렸다. 같은 자료를 담은 resumes 는 실결제
--    (is_talent_advertiser)를 요구하는데 경력만 무료로 열려 있었다. 게이트를 resumes 와 맞춘다.
-- 🔒 FOR ALL(work_experiences_own)도 SELECT 와 겹쳤다 → 쓰기 3종으로 쪼개고 본인 읽기는 아래 통합 정책에 넣는다.
-- 🔒 관리자 전용 SELECT 정책은 **원래 없었다** — 여기서 새로 만들지 않는다(권한을 넓히지 않는다).
drop policy if exists work_experiences_own on public.work_experiences;
drop policy if exists work_experiences_select_advertiser on public.work_experiences;
drop policy if exists work_experiences_select_for_hospital on public.work_experiences;
create policy work_experiences_select on public.work_experiences for select
  using (
    resume_id = (select auth.uid())
    or (exists (
          select 1 from public.resumes r
           where r.profile_id = work_experiences.resume_id and r.is_public)
        and (select public.is_talent_advertiser()))
    or exists (
      select 1 from public.applications a
        join public.jobs j on j.id = a.job_id
        join public.hospitals h on h.id = j.hospital_id
       where a.applicant_id = work_experiences.resume_id and h.owner_profile_id = (select auth.uid()))
  );
create policy work_experiences_insert_own on public.work_experiences for insert
  with check (resume_id = (select auth.uid()));
create policy work_experiences_update_own on public.work_experiences for update
  using (resume_id = (select auth.uid())) with check (resume_id = (select auth.uid()));
create policy work_experiences_delete_own on public.work_experiences for delete
  using (resume_id = (select auth.uid()));
