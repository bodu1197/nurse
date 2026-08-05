-- 💰 첫 광고비 지원(1회)을 **명부가 아니라 실제 회원·사업자 단위**로 잠근다.
--
-- 오너 지적 2026-08-05: "명부(hospitals)를 기준으로 하면 안 되지. 회원가입 시 등록되는
-- 실제 병원을 기준으로 해야지." + "김원장의 경우 레거시 데이터여서 사업자 인증을 받지 않았을 텐데."
--
-- ■ 무엇이 문제였나
-- 지원금(hospitals.free_credits)이 **심평원 병원 명부 81,430곳 전체**에 기본값 1로 뿌려져 있다.
-- 명부는 우리 회원이 아니라 공공데이터다. 한 계정이 명부의 다른 병원을 계속 연결하면
-- (hospitals.owner_profile_id) **병원마다 1회씩** 받을 수 있었다.
--
-- ■ 왜 키가 둘인가
-- 사업자등록번호(profiles.business_no, 국세청 진위확인 통과값)가 "실제 병원"의 정체지만,
-- **이관 회원에게는 그 번호가 없다** — 실측 2026-08-05: 지금 노출 중인 37곳 중 번호 보유 6곳뿐.
-- 김원장도 번호가 없다(인증 전). 그래서 번호 하나로는 못 잡는다.
--   · business_no 있으면 → 사업자 단위로 1회 (계정을 여러 개 만들어도 같은 사업자면 1회)
--   · 없으면            → 계정(profile) 단위로 1회 (이관 회원이 명부의 다른 병원으로 갈아타도 1회)
-- 둘 중 **하나라도** 기록되어 있으면 지원은 없다.
--
-- 🔒 hospitals.free_credits 도 그대로 둔다 — 같은 병원에서 두 번 받는 것을 막는 자물쇠다.
--    셋 중 하나라도 걸리면 지원 불가.
create table if not exists public.ad_credit_used (
  id          uuid primary key default gen_random_uuid(),
  -- 사업자 인증을 마친 회원이면 이 번호가 키다.
  business_no text,
  -- 번호가 없는 회원(이관분)이면 계정이 키다. 있는 회원도 함께 적어 갈아타기를 막는다.
  profile_id  uuid references public.profiles(id) on delete cascade,
  job_id      uuid references public.jobs(id) on delete set null,
  used_at     timestamptz not null default now(),
  constraint ad_credit_used_needs_key check (business_no is not null or profile_id is not null)
);

comment on table public.ad_credit_used is
  '첫 광고비 지원(1회)을 이미 쓴 사업자/계정. 행이 있으면 지원 불가 — 판정은 이 표와 hospitals.free_credits 를 함께 본다(마이그레이션 20260805180000).';

-- 🔴 부분 유니크 인덱스 둘. 값이 있는 쪽만 유일해야 한다 — 한쪽이 null 인 행이 서로를 막으면 안 된다.
--    소비는 INSERT 한 번으로 하고, 23505(중복)가 나면 "이미 사용" 으로 읽는다(원자적).
create unique index if not exists ad_credit_used_business_no_idx
  on public.ad_credit_used (business_no) where business_no is not null;
create unique index if not exists ad_credit_used_profile_idx
  on public.ad_credit_used (profile_id) where profile_id is not null;

alter table public.ad_credit_used enable row level security;
-- 🔒 병원이 자기 기록을 지우고 지원을 다시 받는 길을 막는다 — 읽기는 관리자만, 쓰기는 서버(service_role)만.
--    앱의 판정·소비는 createAdminClient 로 하므로 anon·authenticated 정책은 만들지 않는다.
create policy ad_credit_used_select_admin on public.ad_credit_used for select
  using ((select private.is_admin()));

-- ── 이미 받은 몫 기록 ────────────────────────────────────────────────────────
-- "지금 공고가 노출된 병원들은 공짜돈을 회수해야 한다. 이미 광고가 나가고 있기 때문에."(오너 확정)
-- 그 병원 **소유 계정**을 사용 처리한다(번호가 있으면 함께 적는다).
-- 이러면 김원장처럼 번호가 없는 이관 회원도, 나중에 인증해서 명부의 다른 병원을 연결해도 막힌다.
insert into public.ad_credit_used (business_no, profile_id, job_id)
select distinct on (p.id) p.business_no, p.id, j.id
  from public.jobs j
  join public.jobs_listed jl on jl.id = j.id
  join public.hospitals h on h.id = j.hospital_id
  join public.profiles p on p.id = h.owner_profile_id
 where j.source <> 'worknet'
   and jl.is_live
on conflict do nothing;
