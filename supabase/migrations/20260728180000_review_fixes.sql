-- /review8 지적 반영(2026-07-28). 기능 변경 없음 — 방어와 관례 맞추기.

-- ① 지역 계단 목록에 **시도 화이트리스트**를 건다.
--    desired_location 은 자유 텍스트다. 화면에서는 표에 있는 값만 고를 수 있지만, 조작된 POST 로
--    "무료광고 010-0000-0000" 같은 값을 넣으면 그게 **모든 방문자의 지역 팝업에 타일로 뜬다**.
--    한 사람의 입력이 공용 UI 에 실리는 경로라 표시 단계에서 잘라낸다(지금 데이터는 17개 전부 정상).
drop function if exists public.nurse_talent_sido_list();
create function public.nurse_talent_sido_list()
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
  ) t
  -- lib/koreaRegions.ts 의 SIDO_LIST 와 같은 17개. 행정구역이라 수십 년째 그대로다.
  where sido in ('서울','경기','인천','부산','대구','광주','대전','울산','세종',
                 '강원','충북','충남','전북','전남','경북','경남','제주')
  group by 1 order by 2 desc
$$;

drop function if exists public.nurse_talent_sigungu_list(text);
create function public.nurse_talent_sigungu_list(p_sido text)
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
      and position(' ' in btrim(x)) > 0
  ) t
  where sido = p_sido
    -- '북부출장소'·'동해출장소'는 시군구가 아니라 도청 출장소다(레거시 지역표에 섞여 들어왔다).
    -- 해당 이력서는 시도(경기·강원)로는 계속 잡힌다.
    and sigungu not like '%출장소'
  group by 1 order by 2 desc
$$;

-- 채용 쪽 RPC(20260724210000)와 같은 형태로 권한을 명시한다. 기본 PUBLIC 권한에 기대면
-- 나중에 기본값이 바뀌었을 때 조용히 목록이 비어버린다.
grant execute on function public.nurse_talent_sido_list() to anon, authenticated;
grant execute on function public.nurse_talent_sigungu_list(text) to anon, authenticated;

-- ② security definer 함수의 search_path 에 pg_temp 를 명시한다.
--    빠뜨리면 세션의 임시 스키마가 탐색 경로 앞에 남을 수 있어, 같은 이름의 임시 테이블로
--    함수가 보는 hospitals/jobs 를 바꿔치기할 여지가 생긴다(PostgreSQL 권장 형태).
alter function public.is_talent_advertiser() set search_path = public, pg_temp;
alter function public.is_community_member() set search_path = public, pg_temp;
alter function public.is_admin() set search_path = public, pg_temp;

-- ③ board_comments 는 테이블 단위 UPDATE 권한이 남아 있었다(20260724160000 에서 insert 만 revoke).
--    지금은 UPDATE 정책이 없어 RLS 가 전부 막지만, 누군가 나중에 수정 기능을 넣으며 정책만 만들면
--    컬럼 제한 없이 legacy_nickname 까지 고칠 수 있게 된다. 미리 닫는다.
revoke update on public.board_comments from authenticated;

-- ④ board 버킷(게시판 사진)의 공개 설정을 마이그레이션에 못박는다.
--    지금은 1회성 스크립트에만 있어서 새 환경에서 재현되지 않고, 대시보드 토글로 바뀌어도 흔적이 없다.
--    공개인 이유: 얼굴이 아니라 공지 포스터·행사 안내이고 구 널스넷에서 이미 공개였다.
--    경로가 32자리 해시라 주소를 조합해 훑을 수 없고, 목록 조회 권한(storage.objects SELECT 정책)도 없다.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('board', 'board', true, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
