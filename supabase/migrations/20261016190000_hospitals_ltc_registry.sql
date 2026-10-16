-- 🧓 요양원·재가센터를 병원 명부(hospitals)에 싣는다 + 명부 표 권한 정리 — 2026-10-16
--
-- (1) 공단 장기요양기관 명부 행의 열쇠 칸.
--     오너 지시(2026-10-16): 요양원·재가센터도 공고를 올리게 — (가) 명부에서 찾아 고르기 (나) 없으면 직접 등록.
--     새 표를 만들지 않는다(오너: 기존 화면·표 재사용) — 같은 명부·같은 기관 검색창·같은 사업자 인증 흐름을 쓴다.
--     심사평가원 행의 열쇠가 ykiho 인 것처럼, 공단 행은 장기요양기관기호(11자리)가 열쇠다.
--     값은 scripts/import-ltc-facilities.ts 가 채운다(이 파일은 칸과 권한만 다룬다).
alter table public.hospitals add column if not exists ltc_code text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'hospitals_ltc_code_key') then
    alter table public.hospitals add constraint hospitals_ltc_code_key unique (ltc_code);
  end if;
end $$;

comment on column public.hospitals.ltc_code is
  '국민건강보험공단 장기요양기관기호(11자리) — 요양원·재가센터 명부 행의 열쇠. 심사평가원 행은 null.';

-- (나) 직접 등록한 회원 — 계정당 직접 등록 상한(app/mypage/actions DIRECT_FACILITY_MAX)을 '지금 소유'가 아니라 '만든 사람'으로 센다.
--     소유(owner_profile_id)는 연결 해제(unlinkHospital)로 비워지므로, 그것으로 세면 등록→해제를 되풀이해 상한을 넘긴다(검증 지적).
--     외래키라 인덱스를 같이 둔다(Advisor unindexed_foreign_keys). 탈퇴하면 비워진다(명부 행은 남긴다 — 탈퇴 규칙과 같다).
alter table public.hospitals add column if not exists created_by uuid references public.profiles(id) on delete set null;
create index if not exists hospitals_created_by_idx on public.hospitals (created_by) where created_by is not null;
comment on column public.hospitals.created_by is
  '사업자 인증 화면에서 이 기관을 직접 등록한 회원(source=direct). 연결 해제로 바뀌지 않는다 — 계정당 직접 등록 상한을 센다.';

comment on column public.hospitals.cl_cd_nm is
  '기관 종별 — 심사평가원 clCdNm 원본(의원·요양병원…) 또는 장기요양 급여 종류(노인요양시설·방문요양…, 공단 행·직접 등록 행).';

-- (2) 🔒 권한 정리 — 이 작업의 검증 중 발견(2026-10-16, 운영 DB 권한 실측).
--     · 회원(authenticated): 표 단위 넣기·지우기 권한은 이미 없고(20260723090000), 칸 권한은 이름·주소·지역 고치기뿐이다
--       (20260807110000). 그런데 hospitals_update 가 '관리자 **또는 소유자**' 라서, 병원 회원이 자기 기관이 된 명부 행의
--       **정식 이름·주소·지역을 마음대로 바꿀 수 있었다**(심사평가원·공단 명부 값을 덮어쓴다 — 리뷰·검색·공고에 그대로 나간다).
--     · 비회원(anon): 표 단위 넣기·고치기·지우기 권한이 Supabase 기본값으로 남아 있어 정책이 유일한 벽이다.
--     앱은 이 표를 전부 서버의 서비스 롤로 쓴다(사업자 인증·직접 등록·공고 등록·탈퇴·명부 즉시 조회·명부 수집).
--     사용자 세션으로 쓰는 곳은 관리자 이름 고치기(app/admin/actions renameHospital) 하나뿐이고,
--     평점 재계산(recompute_hospital_rating)·무료 1주(claim_free_week)는 security definer 라 RLS 를 타지 않는다.
--     그래서 넣기·지우기 정책은 없애고('정책 없음 = 거부'), 고치기는 관리자만 남긴다. 읽기(hospitals_select_all)는 그대로다.
drop policy if exists hospitals_insert_owner on public.hospitals;
drop policy if exists hospitals_delete_owner on public.hospitals;
drop policy if exists hospitals_update on public.hospitals;
create policy hospitals_update on public.hospitals
  for update to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));
