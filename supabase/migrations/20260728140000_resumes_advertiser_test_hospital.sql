-- 인재 열람 자격(RLS)에 **테스트 병원** 예외를 더한다 — 앱의 isAdvertiser() 와 판정을 일치시킨다.
--
-- 왜 필요한가:
--   앱(lib/data/talent.ts isAdvertiser)은 hospitals.is_test = true 인 병원을 "광고를 낸 병원"으로
--   간주한다(결제 없이 광고 병원 화면을 실제와 같게 확인하려고). 그런데 이 정책에는 그 예외가 없어서
--   앱은 통과시키고 DB 는 막는 어긋남이 생겼다. 결과: 테스트 병원으로 로그인하면 /mypage/talent
--   (내 인재 목록)이 아무 안내도 없이 빈 화면이 된다 — 이 화면은 anon 클라이언트로 resumes 를
--   직접 읽어 RLS 를 그대로 받기 때문이다.
--
--   /talent 목록·상세는 서버가 admin 클라이언트로 읽고 이름·전화를 select 에서 빼는 방식이라
--   이 정책과 무관하게 정상이었다. 그래서 증상이 마이페이지에만 나타났다.
--
-- 판정을 한 함수에 모아둔다 — 정책 두 곳(여기, 앞으로 생길 곳)에 복붙하면 한쪽만 고쳐져 다시 어긋난다.
-- security definer: 정책 안에서 hospitals/jobs 를 읽으므로 그 테이블들의 RLS 를 다시 타면 재귀가 된다.
-- search_path 고정 — definer 함수의 필수 안전장치.
create or replace function public.is_talent_advertiser()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    -- 테스트 병원 = 광고주로 간주. 이 병원은 병원 검색·명부에서 이미 제외돼 일반 사용자에게 안 새어나간다.
    select 1 from hospitals h
    where h.owner_profile_id = (select auth.uid()) and h.is_test
  ) or exists (
    -- 실제 광고: 내가 소유한 병원의 공고 중 노출 기간이 남은 것이 하나라도 있을 것.
    select 1 from jobs j
    join hospitals h on h.id = j.hospital_id
    where h.owner_profile_id = (select auth.uid()) and j.featured_until > now()
  );
$$;

-- (select ...) 로 감싸 문장당 1회만 평가한다(initplan) — 행마다 재호출하면 8천 행 조회가 8천 번 돈다.
drop policy if exists resumes_select_advertiser on public.resumes;
create policy resumes_select_advertiser on public.resumes for select using (
  is_public and (select public.is_talent_advertiser())
);

-- is_test 를 owner 로 찾는 경로가 새로 생겼다(18만 행 → 인덱스 없으면 풀스캔).
-- hospitals_owner_idx(owner_profile_id) 가 이미 있어 owner 로 좁힌 뒤 is_test 를 보면 되므로 추가 인덱스는 두지 않는다.
