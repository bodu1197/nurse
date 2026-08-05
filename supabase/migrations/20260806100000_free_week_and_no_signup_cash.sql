-- 💰 광고 모델 재편 (오너 확정 2026-08-06)
--
-- 오너 지시: "무료 1주일을 별도로 주고 제약을 준다(노출은 복불복, 인재정보는 페이지는 보되
--            연락처 열람 불가). 유료는 공짜돈 주지 말고 FM 대로 징수하고 상단 노출·회원정보
--            열람·AI 자동매칭을 준다. 광고비는 시중 경쟁 업체를 검수한 뒤 정한다."
--
-- ■ 무엇을 바꾸는가
--   ① 가입 캐시 70,000원 지급을 **폐지**한다. 이미 지급된 잔액도 0 으로 만든다(오너 확정: 즉시 소멸).
--   ② **무료 1주를 병원당 딱 한 번** 준다. 어제(20260805190000) 캐시 모델로 갈아엎으며 지웠던
--      1회 제한 장치를 다시 만든다 — 이번엔 이름을 ad_free_used 로 두고 키를 단순화했다.
--   ③ 목록에서 **유료만 위로** 올린다. 무료는 노출은 되지만 유료 아래에 깔린다.
--
-- ■ 왜 무료에 별도 장치가 거의 필요 없는가 (기존 구조를 그대로 쓴다)
--   · 노출     : jobs_listed.is_live 가 `featured_until > now()` 를 보므로, 무료도 그 값만 찍으면 노출된다.
--   · 연락처   : is_talent_advertiser() 가 `ad_orders.status='PAID' and amount > 0` 을 요구한다.
--                무료는 주문 자체가 없으므로 **자동으로 막힌다.** 앱에서 따로 막을 것이 없다.
--   · AI 자동매치(병원→인재)도 같은 판정을 쓴다(lib/data/membership 의 canViewTalent).
--   그래서 이 마이그레이션이 새로 만드는 것은 "몇 번 받았나" 를 세는 표 하나와 정렬용 컬럼 하나뿐이다.
--
-- ■ 안전한 시점인 근거(실측 2026-08-06)
--   ad_orders 0건 — 아직 아무도 광고를 산 적이 없다. 가격을 바꿔도 기존 주문이 없고,
--   캐시 1억 8,970만원(2,710계정 × 70,000)을 소멸시켜도 실제로 쓴 사람이 없다.

-- ── ① 가입 캐시 폐지 ────────────────────────────────────────────────────────
-- 🔴 트리거를 먼저 떼고 나서 잔액을 민다. 순서가 바뀌면 그 사이에 가입한 병원이 다시 70,000 을 받는다.
drop trigger if exists profiles_grant_signup_ad_cash on public.profiles;
drop function if exists public.grant_signup_ad_cash();

-- 이미 나간 잔액도 0 으로. 쓴 사람이 없어(ad_orders 0건) 회수할 것도 없다.
-- 🔴 되돌려야 할 일이 생기면: **전원이 정확히 70,000 균일**이었다(2,710계정 × 70,000 = 189,700,000).
--    트리거가 가입 시 한 번 넣은 값 그대로고 쓴 사람이 0명이라 스냅샷 없이도 복원할 수 있다 —
--    `update public.profiles set ad_cash = 70000 where role = 'hospital';`
--    (앞으로 잔액이 제각각이 된 뒤에 미는 일이 생기면 그때는 반드시 백업표를 먼저 만들 것.)
-- 🔒 컬럼·claim_ad_cash·release_ad_cash 는 **남긴다.** 결제 트랜잭션 한가운데라 걷어내는 쪽이
--    더 위험하고, 잔액이 0 이면 claim 이 0 을 돌려주며 무해하게 지나간다.
--    관리자가 예외적으로 얹어 줄 여지도 남는다 — 다만 **자동 지급은 이제 없다.**
update public.profiles set ad_cash = 0 where ad_cash <> 0;

-- ── ② 무료 1주 — 병원당 1회 ──────────────────────────────────────────────────
-- 🔴 키가 둘인 이유(20260805180000 에서 얻은 교훈): 사업자등록번호가 "실제 병원" 의 정체지만
--    **이관 회원에게는 그 번호가 없다**(실측 2026-08-05: 노출 중 37곳 중 보유 6곳).
--    · business_no 있으면 → 사업자 단위로 1회 (계정을 여러 개 만들어도 같은 사업자면 1회)
--    · 없으면            → 계정 단위로 1회
--    둘 중 하나라도 걸리면 지급하지 않는다.
-- 🔴 hospitals(심평원 명부 81,430곳)를 키로 쓰지 않는다 — 한 계정이 명부의 병원을 갈아타며
--    반복 수령할 수 있다(오너 지적 2026-08-05: "명부를 기준으로 하면 안 되지").
-- 🔴 profile_id 는 **nullable + on delete set null** 이다(cascade 아님).
--    cascade 로 두면 탈퇴(deleteUser)가 이 행을 통째로 지워서
--    **탈퇴 → 재가입 → 같은 사업자번호 재인증 → 무료 1주 재수령**이 무한 반복된다(/review8 지적).
--    계정은 사라져도 **사업자번호 자물쇠는 남아야** 한다.
create table if not exists public.ad_free_used (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid references public.profiles(id) on delete set null,
  business_no text,
  job_id      uuid references public.jobs(id) on delete set null,
  used_at     timestamptz not null default now()
);

-- 이미 만들어진 표(먼저 적용된 판)를 위 규칙으로 맞춘다. 새로 만든 경우에는 전부 no-op 이다.
alter table public.ad_free_used alter column profile_id drop not null;
alter table public.ad_free_used drop constraint if exists ad_free_used_profile_id_fkey;
alter table public.ad_free_used add constraint ad_free_used_profile_id_fkey
  foreign key (profile_id) references public.profiles(id) on delete set null;
-- 키가 둘 다 비면 아무것도 못 잠그는 쓰레기 행이다 — 넣지 못하게 막는다.
alter table public.ad_free_used drop constraint if exists ad_free_used_needs_key;
alter table public.ad_free_used add constraint ad_free_used_needs_key
  check (profile_id is not null or business_no is not null);

-- 🔒 중복 방지는 **유니크 인덱스**가 한다. 앱에서 "먼저 세어 보고 없으면 넣는다" 로는
--    동시 요청 둘이 같은 0 을 보고 둘 다 넣는다. 여기서 두 번째가 깨져야 한다.
create unique index if not exists ad_free_used_profile_uk on public.ad_free_used (profile_id);
create unique index if not exists ad_free_used_business_uk on public.ad_free_used (business_no)
  where business_no is not null;
-- 외래키 인덱스(advisor: unindexed_foreign_keys). profile_id 는 위 유니크가 겸한다.
create index if not exists ad_free_used_job_idx on public.ad_free_used (job_id);

alter table public.ad_free_used enable row level security;

-- 본인 기록과 관리자만 조회. INSERT 정책은 **두지 않는다** — 아래 definer 함수로만 들어온다.
-- 🔴 auth.uid() 를 (select ...) 로 감싼다. 그냥 쓰면 행마다 재평가된다(advisor: auth_rls_initplan).
drop policy if exists ad_free_used_select on public.ad_free_used;
create policy ad_free_used_select on public.ad_free_used
  for select using ((select private.is_admin()) or profile_id = (select auth.uid()));

-- ── 무료 1주 지급 ────────────────────────────────────────────────────────────
-- 반환값: 'ok' | 'already_used' | 'not_owner' | 'already_live' | 'deadline'
--
-- 🔴 security definer + `set search_path = ''` + 스키마 명시(CLAUDE.md §1-3).
--    definer 인 이유: ad_free_used 에 INSERT 정책이 없어 일반 회원 권한으로는 못 넣는다.
--    definer 라서 **소유 검증을 이 안에서 직접 한다** — 남의 공고에 무료를 붙일 수 없어야 한다.
--    판정은 앱의 ownedJobHospital(lib/data/jobs)과 **같은 규칙**이다:
--    hospital_id 가 있어야 하고, 그 명부의 주인이 나여야 한다.
--    (hospital_id 가 없는 공고 6건은 유료도 못 산다 — 두 경로가 같은 답을 내야 한다.)
-- 🔴 insert 를 **먼저** 한다. 유니크 인덱스가 곧 잠금이라, 동시 요청 둘 중 하나는 여기서 깨진다.
--    함수 전체가 한 트랜잭션이므로 뒤의 update 가 실패하면 이 기록도 함께 되돌아간다.
create or replace function public.claim_free_week(p_job uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := (select auth.uid());
  v_biz    text;
  v_live   timestamptz;
  v_dead   date;
  v_status text;
begin
  if v_uid is null then return 'not_owner'; end if;

  -- 내 공고인가. 명부(hospitals)의 주인이 나여야 한다.
  -- 🔴 `for update of j` — 이 행을 잠그고 읽는다. 안 잠그면 같은 공고에 유료 결제가 동시에
  --    들어올 때 둘 다 "노출 중 아님" 을 보고, 무료가 featured_until 을 7일로 **덮어쓰며**
  --    ad_tier 를 'free' 로 되돌린다 → **돈 낸 4주가 증발한다**(/review8 지적).
  select j.featured_until, j.deadline, j.status into v_live, v_dead, v_status
    from public.jobs j
    join public.hospitals h on h.id = j.hospital_id
   where j.id = p_job and h.owner_profile_id = v_uid
     for update of j;
  if not found then return 'not_owner'; end if;

  -- 이미 노출 중인 공고에 무료를 얹지 않는다 — 1회뿐인 혜택을 남은 기간 위에 겹쳐 버리게 된다.
  if v_live is not null and v_live > now() then return 'already_live'; end if;

  -- 🔴 관리자가 내린(hidden) 공고는 되살리지 않는다. 아래 update 가 status 를 'open' 으로
  --    바꾸므로, 막지 않으면 병원이 무료 1주로 모더레이션을 무효화한다.
  if v_status = 'hidden' then return 'hidden'; end if;

  -- 🔴 마감일이 지났으면 주지 않는다. featured_until 을 세워도 노출 판정(is_live)이 deadline 으로
  --    먼저 걸러서 **한 번도 안 보이는** 광고가 된다. 평생 1회뿐인 혜택을 그렇게 태우면 안 된다.
  --    유료 결제(prepareAdOrder)에도 같은 검사가 있다 — 두 경로가 같은 답을 내야 한다.
  if v_dead is not null and v_dead < (now() at time zone 'Asia/Seoul')::date then return 'deadline'; end if;

  select p.business_no into v_biz from public.profiles p where p.id = v_uid;

  begin
    insert into public.ad_free_used (profile_id, business_no, job_id)
    values (v_uid, nullif(btrim(coalesce(v_biz, '')), ''), p_job);
  exception when unique_violation then
    return 'already_used';
  end;

  update public.jobs
     set featured_until = now() + interval '7 days',
         ad_tier        = 'free',
         status         = 'open',
         -- 첫 게시(draft→open)일 때만 등록일을 찍는다 — 연장·재게시가 신규 유입 지표를 오염시키지 않게
         -- (adOrders.ts 의 유료 활성화와 같은 규칙). UPDATE 의 오른쪽은 **옛 행 값**을 본다.
         posted_at      = case when status = 'draft' then now() else posted_at end
   where id = p_job;

  -- 🔴 0행이면 예외로 끝낸다. 그냥 'ok' 를 돌려주면 ad_free_used 기록만 남고 광고는 안 걸려
  --    **평생 1회뿐인 혜택이 조용히 증발한다**(/review8 지적). 예외는 위 insert 까지 되돌린다.
  if not found then
    raise exception '무료 1주 적용 실패: 공고 %를 갱신하지 못했다', p_job;
  end if;

  return 'ok';
end $$;

-- 🔴 `revoke from public` 만으로는 **anon 이 안 막힌다.** Supabase 는 기본 권한(alter default
--    privileges)으로 새 함수마다 anon·authenticated 에게 EXECUTE 를 직접 붙인다 — PUBLIC 경유가
--    아니라 직접 부여라 revoke from public 이 닿지 않는다. 실측으로 확인했다
--    (advisor: anon_security_definer_function_executable). 이름을 대고 회수한다.
revoke all on function public.claim_free_week(uuid) from public, anon;
grant execute on function public.claim_free_week(uuid) to authenticated;
-- ⚠️ advisor 의 authenticated_security_definer_function_executable 경고는 **남는다 — 의도한 것이다.**
--    이 함수는 authenticated 병원이 직접 불러야 하고, definer 가 아니면 동작할 수 없다:
--    jobs.featured_until·ad_tier 의 UPDATE 권한은 authenticated 에서 이미 회수돼 있다
--    (app/admin/actions.ts 주석 참고). 대신 소유·마감·중복 검사를 함수 안에서 전부 한다.

-- ── ②-b 🚨 무료로 연락처를 여는 구멍을 막는다 ────────────────────────────────
--
-- /review8 이 CRITICAL 로 잡았다. 종전 판정은 이랬다:
--   "광고 창이 살아 있다(featured_until > now()) **그리고** 이 공고에 PAID 주문이 있었다"
-- 창이 **왜** 열렸는지를 안 봤다. 그래서 무료 1주를 만든 순간 이런 길이 생긴다:
--
--   1주 50,000원 결제 → 7일 뒤 만료 → **같은 공고에 무료 1주** → 창이 다시 열림
--   → 과거 PAID 주문은 그대로 존재 → 연락처 열람·AI 자동매치가 **7일 더 공짜로** 열린다
--
-- 한 번만 결제하면 그 뒤로는 무료로 인재 연락처를 계속 볼 수 있다는 뜻이다.
-- 🔴 지금 창을 연 것이 **유료인가**(ad_tier='standard')를 함께 본다. 무료는 ad_tier='free' 라 막힌다.
--    이 술어는 jobs_listed.ad_paid 와 **같은 것**이다 — 목록 상단 노출과 연락처 열람이 같은 기준으로 갈린다.
-- 🔒 관리자는 위 private.is_admin() 로 그대로 통과한다(테스트 병원 화면 확인이 막히지 않는다).
create or replace function public.is_talent_advertiser()
returns boolean
language sql
stable
set search_path to 'public', 'pg_temp'
as $$
  -- 최고 관리자는 전부 볼 수 있다. 관리자 화면(/admin/resumes)과 같은 권한이므로
  -- 공개 화면에서만 못 보게 막아 봐야 우회로만 늘어난다.
  select private.is_admin() or exists (
    select 1
      from jobs j
      join hospitals h on h.id = j.hospital_id
     where h.owner_profile_id = (select auth.uid())
       and j.featured_until > now()                 -- 광고가 지금 살아 있어야 하고
       and j.ad_tier = 'standard'                   -- 그 창을 연 것이 **유료**여야 하고
       and exists (
         select 1 from ad_orders o
          where o.job_id = j.id
            and o.status = 'PAID'
            and o.tier <> 'admin_test'
            and o.amount > 0                        -- 실제로 돈이 들어와야 한다
       )
  );
$$;

-- ── ③ 유료만 상단 ───────────────────────────────────────────────────────────
-- 오너 확정 2026-08-06: "섞지 않고 유료만 위로 올린다."
-- 종전 정렬은 ad_live(=featured_until 이 살아 있음) 였는데, 무료도 featured_until 을 쓰므로
-- 그대로 두면 무료가 유료와 같은 칸에 올라간다. 유료만 가리는 컬럼을 하나 더 둔다.
--
-- 🔴 `create or replace view` 는 옵션을 통째로 갈아엎는다 — security_invoker 를 **다시 적는다.**
--    이걸 빠뜨려 실제로 마감 공고 2,170건이 비로그인에게 샌 적이 있다(2026-08-05).
create or replace view public.jobs_listed with (security_invoker = true) as
  select
    id, hospital_id, title, specialty, location, employment_type, salary_text, benefits, description,
    source, external_url, external_id, status, is_featured, posted_at, created_at, updated_at,
    featured_until, ad_tier, manager_name, manager_phone, deadline, recruit_count, shift_type,
    apply_method, apply_email, apply_detail, apply_methods, detail_fetched_at, company_name,
    sido, sigungu, facility_type, job_category, lat, lng, geocoded_at,
    (featured_until is not null and featured_until > now()) as ad_live,
    (status = 'open'
      and (source = 'worknet' or (featured_until is not null and featured_until > now()))
      and (deadline is null or deadline >= (now() at time zone 'Asia/Seoul')::date)) is true as is_live,
    -- 💰 돈을 낸 광고만 true. 무료(ad_tier='free')·워크넷 수집분은 false 라 유료 아래에 깔린다.
    (ad_tier = 'standard' and featured_until is not null and featured_until > now()) is true as ad_paid
  from public.jobs j;
