-- 인재 검색에 **직종**을 더하고, 부서·직종 칩을 "실제 인재가 있는 것만" 보이게 한다.
-- 오너 지시(2026-07-28): 구 널스넷 채용 필터의 근무부서·직종을 그대로 가져올 것.
--
-- 왜 필요했나(실측):
--   /talent 의 진료과 칩 9개 중 **6개가 0명**이었다 — 병동·외래·요양병원·정신과·마취과·투석실을
--   누르면 아무도 안 나온다. 이력서 7,257건이 전부 구 널스넷 근무부서 코드표(DEPA 28개)로 저장돼
--   있는데 칩은 다른 목록(JOB_SPECIALTIES)을 쓰고 있었기 때문이다. 정작 인재가 많은
--   내과(832)·정형외과(719)·피부과(652)는 필터에 아예 없었다.
--
-- 직종은 그동안 이관하지 않았다(구 person_item.job_category). 이력서 본문에도 없어서 새로 담는다.
-- 배열인 이유: 구 데이터에서 한 사람이 "간호조무직 + 사무·원무·코디" 처럼 여러 직종을 고른다.
alter table public.resumes add column if not exists job_categories text[] not null default '{}';

comment on column public.resumes.job_categories is
  '희망 직종(구 널스넷 CATE 대분류: 간호직·간호조무직·사무·원무·코디·피부관리직·의료기사직·의사직·약무직·의료기타).';

-- 배열 포함(@>) 검색용. 지금까지 specialties 에도 인덱스가 없어 칩을 누를 때마다 7천 행을 훑었다.
create index if not exists resumes_specialties_idx     on public.resumes using gin (specialties);
create index if not exists resumes_job_categories_idx  on public.resumes using gin (job_categories);

-- 🗂 부서·직종 칩 목록 — **인재가 있는 것만** 많은 순으로. 지역 계단(nurse_talent_sido_list)과 같은 사고방식이다.
--    0명인 칩을 그리면 사용자가 눌러보고 빈 화면을 만난다.
--
-- 🔴 술어는 목록 쿼리(searchPublicTalent, lib/data/talent.ts)와 **정확히 같아야** 한다 — is_public + name.
-- 🔴 화이트리스트를 건다. specialties/job_categories 는 자유 텍스트 배열이라, 조작된 POST 로 넣은 값이
--    **모든 방문자의 칩 목록**에 뜰 수 있다(한 사람의 입력이 공용 UI 에 실리는 경로).
--    목록은 lib/resumeOptions.ts 의 DEPARTMENTS / JOB_CATEGORIES 와 같아야 한다.
-- 한 번의 스캔으로 둘 다 내려준다(따로 부르면 7천 행을 두 번 훑는다).
drop function if exists public.nurse_talent_facet_list();
create function public.nurse_talent_facet_list()
returns table(kind text, name text, cnt bigint)
language sql
stable
set search_path to 'public'
as $$
  select 'department'::text, s, count(*)
  from public.resumes r, unnest(r.specialties) s
  where r.is_public and r.name is not null
    and s in ('부서무관','내과','외과','산부인과','소아청소년과','혈액종양내과','신경과','신경외과',
              '정신건강의학과','정형외과','흉부외과','성형외과','이비인후과','피부과','안과','비뇨기과',
              '응급실','중환자실','인공신장실','수술실','분만실','신생아실','혈관조영실','내시경실',
              '마취과/회복실','건강진단센터','주사실','기타')
  group by 2
  union all
  select 'category'::text, c, count(*)
  from public.resumes r, unnest(r.job_categories) c
  where r.is_public and r.name is not null
    and c in ('간호직','간호조무직','사무·원무·코디','피부관리직','의료기사직','의사직','약무직','의료기타')
  group by 2
  order by 1, 3 desc
$$;

grant execute on function public.nurse_talent_facet_list() to anon, authenticated;
