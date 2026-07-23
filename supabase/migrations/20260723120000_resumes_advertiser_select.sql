-- 인재 검색: 공개 이력서를 "광고 중인 병원"만 열람할 수 있게 한다.
-- 앱에서만 막으면 소용없다 — anon key가 공개(NEXT_PUBLIC_)라 아무 로그인 계정이나 PostgREST로
-- /rest/v1/resumes 를 직접 호출할 수 있다. 그래서 자격 판정을 정책 안에 둔다.
-- 자격 = 내가 소유한 병원의 공고 중 광고 노출 기간(featured_until)이 아직 남은 것이 하나라도 있을 것.
-- SELECT 정책은 OR로 합쳐지므로 기존 resumes_select_own(본인 이력서)은 그대로 유지된다.
drop policy if exists resumes_select_advertiser on public.resumes;
create policy resumes_select_advertiser on public.resumes for select using (
  is_public
  and exists (
    select 1
    from public.jobs j
    join public.hospitals h on h.id = j.hospital_id
    where h.owner_profile_id = (select auth.uid())
      and j.featured_until > now()
  )
);

-- 위 정책과 병원 마이페이지 전반이 owner_profile_id로 hospitals를 찾는다(18만 행 → 인덱스 없으면 매번 풀스캔).
create index if not exists hospitals_owner_idx on public.hospitals (owner_profile_id) where owner_profile_id is not null;
