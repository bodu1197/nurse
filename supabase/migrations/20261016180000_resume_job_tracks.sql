-- 🧓 이력서 '찾는 일자리' — 간호(nurse) / 요양·간병(care), **둘 다** 고를 수 있다.
--
-- 왜(오너 지시 2026-10-16): "이력서를 작성할 때 간호원이냐 요양 간병이냐를 선택하게 하면 분리가 쉽지",
--   "간호원이지만 간호도 할 수 있고 간병도 할 수 있는데" — 병원 취업이 어려울 수 있어 간병도 받겠다는 간호사가 있다.
--   그래서 하나만 고르는 칸이 아니라 배열이고, 최소 하나는 고른다.
-- 이 값 하나가 셋을 가른다:
--   · AI 자동매치 후보 — 간호 → 간호 공고(/jobs), 요양·간병 → 요양·간병 공고(/care-jobs), 둘 다 → 둘 다(lib/match matchScope)
--   · 인재정보 — 간호 인재(/talent)·요양·간병 인재(/care-talent) 목록에 실리는 곳(둘 다면 양쪽)
--   · 이력서 화면 — 요양·간병만 고르면 간호 전용 질문(면허신고·전문간호사·근무부서 등)을 숨긴다
-- 기존 이력서(8,551건, 2026-10-16 실측 — 요양 직종 0건)는 전부 간호다(구 널스넷 간호 회원).
alter table public.resumes add column if not exists job_tracks text[] not null default '{nurse}';

-- 값은 nurse·care 두 가지뿐이고 최소 하나 — 빈 배열이면 어느 목록에도 안 실려 이력서가 사라진 것처럼 보인다.
alter table public.resumes drop constraint if exists resumes_job_tracks_check;
alter table public.resumes add constraint resumes_job_tracks_check
  check (cardinality(job_tracks) between 1 and 2 and job_tracks <@ array['nurse', 'care']::text[]);

comment on column public.resumes.job_tracks is
  '찾는 일자리: nurse(간호사·간호조무사) / care(요양보호사·간병인), 둘 다 가능. 자동매치 후보·인재정보 목록(/talent·/care-talent)을 가른다(20261016180000).';

-- 인재 칩·지역 건수 RPC 에 p_track — 목록(searchPublicTalent 의 job_tracks 조건)과 같은 범위로 센다.
-- 인자를 더하면 새 오버로드가 생겨 PostgREST 가 못 고른다(PGRST203) — 옛 시그니처를 지우고 다시 만든다.
-- 본문은 20261016150000(facet)·20260728180000(sido·sigungu) 그대로, job_tracks 조건만 더했다.
drop function if exists public.nurse_talent_facet_list();
create or replace function public.nurse_talent_facet_list(p_track text DEFAULT 'nurse')
 RETURNS TABLE(kind text, name text, cnt bigint)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select 'department'::text, s, count(*)
  from public.resumes r, unnest(r.specialties) s
  where r.is_public and r.name is not null
    and r.job_tracks @> array[coalesce(nullif(p_track, ''), 'nurse')]
    and s in ('부서무관','내과','외과','산부인과','소아청소년과','혈액종양내과','신경과','신경외과',
              '정신건강의학과','정형외과','흉부외과','성형외과','이비인후과','피부과','안과','비뇨기과',
              '응급실','중환자실','인공신장실','수술실','분만실','신생아실','혈관조영실','내시경실',
              '마취과/회복실','건강진단센터','주사실','기타')
  group by 2
  union all
  select 'category'::text, c, count(*)
  from public.resumes r, unnest(r.job_categories) c
  where r.is_public and r.name is not null
    and r.job_tracks @> array[coalesce(nullif(p_track, ''), 'nurse')]
    and c in ('간호직','간호조무직','요양보호사','간병인','사무·원무·코디','피부관리직','의료기사직','의사직','약무직','의료기타')
  group by 2
  order by 1, 3 desc
$function$;
grant execute on function public.nurse_talent_facet_list(text) to anon, authenticated;

drop function if exists public.nurse_talent_sido_list();
create or replace function public.nurse_talent_sido_list(p_track text DEFAULT 'nurse')
returns table(name text, cnt bigint)
language sql
stable
set search_path to 'public'
as $$
  select sido, count(distinct profile_id)
  from (
    select r.profile_id, split_part(btrim(x), ' ', 1) as sido
    from public.resumes r, regexp_split_to_table(r.desired_location, ',') x
    where r.is_public and r.name is not null and r.desired_location is not null
      and r.job_tracks @> array[coalesce(nullif(p_track, ''), 'nurse')]
  ) t
  -- lib/koreaRegions.ts 의 SIDO_LIST 와 같은 17개. 행정구역이라 수십 년째 그대로다.
  where sido in ('서울','경기','인천','부산','대구','광주','대전','울산','세종',
                 '강원','충북','충남','전북','전남','경북','경남','제주')
  group by 1 order by 2 desc
$$;
grant execute on function public.nurse_talent_sido_list(text) to anon, authenticated;

drop function if exists public.nurse_talent_sigungu_list(text);
create or replace function public.nurse_talent_sigungu_list(p_sido text, p_track text DEFAULT 'nurse')
returns table(name text, cnt bigint)
language sql
stable
set search_path to 'public'
as $$
  select sigungu, count(distinct profile_id)
  from (
    select r.profile_id,
           split_part(btrim(x), ' ', 1) as sido,
           btrim(substr(btrim(x), position(' ' in btrim(x)) + 1)) as sigungu
    from public.resumes r, regexp_split_to_table(r.desired_location, ',') x
    where r.is_public and r.name is not null and r.desired_location is not null
      and r.job_tracks @> array[coalesce(nullif(p_track, ''), 'nurse')]
      and position(' ' in btrim(x)) > 0
  ) t
  where sido = p_sido
    -- '북부출장소'·'동해출장소'는 시군구가 아니라 도청 출장소다(레거시 지역표에 섞여 들어왔다).
    -- 해당 이력서는 시도(경기·강원)로는 계속 잡힌다.
    and sigungu not like '%출장소'
  group by 1 order by 2 desc
$$;
grant execute on function public.nurse_talent_sigungu_list(text, text) to anon, authenticated;

notify pgrst, 'reload schema';
