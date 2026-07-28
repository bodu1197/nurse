-- 🗂 인재(이력서) 지역 계단 목록 — 도 > 시군구, **인재가 실제로 있는 곳만** + 건수.
--    소유자 요구(2026-07-28): "간호사가 부산 수영구에 한 명도 없다면 부산을 눌렀을 때 수영구는 안 보이게."
--    지금은 고정 표(lib/koreaRegions)를 그대로 뿌려서, 0명인 구를 눌러도 빈 목록만 나온다.
--
-- 왜 컬럼이 아니라 파싱인가:
--    jobs 는 공고 하나에 지역이 하나라 sido/sigungu 실컬럼으로 정규화했다. 이력서는 희망지역을
--    여러 개 적을 수 있어("서울 종로구, 경기 성남시") 한 컬럼으로 정규화가 안 된다.
--    그래서 쉼표로 쪼개 집계한다. 8천 행 × 2조각 수준이라 순차 훑기로 충분하다(인덱스 불필요).
--
-- 🔴 술어는 목록 쿼리(searchPublicTalent, lib/data/talent.ts)와 **정확히 같아야** 한다.
--    어긋나면 팝업이 "강남구 424명"이라 해놓고 눌렀을 때 다른 수가 나온다. 그 쿼리의 두 술어를 그대로 옮긴다:
--      ① is_public = true
--      ② name is not null (이름 없는 이력서는 카드가 부실해 목록에서 제외)
--    (진료과·경력 필터는 팝업이 모르는 값이라 반영하지 않는다 — jobs 계단과 같은 계약.)
--
-- 🔴 count(distinct profile_id) 인 이유: "서울 강남구, 서울 서초구"를 적은 한 사람이
--    서울 건수에 두 번 세이면 안 된다.
--
-- SECURITY INVOKER(기본). 서버가 admin 클라이언트로 부르므로 RLS 를 통과한다.
-- anon 이 직접 불러도 resumes RLS 에 막혀 빈 결과가 나온다(집계라 PII 도 없다).

drop function if exists public.nurse_talent_sido_list();
create function public.nurse_talent_sido_list()
returns table(name text, cnt bigint)
language sql
stable
set search_path to 'public'
as $$
  select split_part(loc, ' ', 1), count(distinct profile_id)
  from (
    select r.profile_id, btrim(x) as loc
    from public.resumes r, regexp_split_to_table(r.desired_location, ',') x
    where r.is_public and r.name is not null and r.desired_location is not null
  ) t
  where loc <> ''
  group by 1
  order by 2 desc
$$;

-- 시군구는 "시도 시군구" 에서 첫 공백 뒤 전부(경기 "성남시 분당구" 처럼 2단인 곳이 있어 통째로 보존).
-- p_sido 는 URL 에서 오므로 LIKE 가 아니라 **정확 일치**로 비교한다(LIKE 메타문자로 범위가 넓어지지 않게).
drop function if exists public.nurse_talent_sigungu_list(text);
create function public.nurse_talent_sigungu_list(p_sido text)
returns table(name text, cnt bigint)
language sql
stable
set search_path to 'public'
as $$
  select btrim(substr(loc, position(' ' in loc) + 1)), count(distinct profile_id)
  from (
    select r.profile_id, btrim(x) as loc
    from public.resumes r, regexp_split_to_table(r.desired_location, ',') x
    where r.is_public and r.name is not null and r.desired_location is not null
  ) t
  where position(' ' in loc) > 0 and split_part(loc, ' ', 1) = p_sido
  group by 1
  -- '북부출장소'·'동해출장소'는 시군구가 아니라 도청 출장소다(레거시 지역표에 섞여 들어왔다).
  -- 구 목록에 끼면 사용자가 읽을 수 없는 항목이 되므로 뺀다. 해당 이력서는 시도(경기·강원)로는 계속 잡힌다.
  having btrim(substr(loc, position(' ' in loc) + 1)) not like '%출장소'
  order by 2 desc
$$;
