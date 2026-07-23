-- 이력서 표준화 — 이름·전화·경력년수만으로는 채용 판단이 불가능하다.
-- "ICU 5년, 나이트 전담 가능, BLS 보유"와 "경력 5년"이 화면에서 똑같이 보이던 것을 고친다.
-- 항목 근거: docs/replan-mypage.md 2장(너스케입 분류체계 + 실제 병원 공고 + 표준 병원 이력서 서식).

alter table public.resumes
  -- 기본
  add column if not exists resume_title           text,           -- 예: "NICU 4년, 나이트 가능"
  add column if not exists email                  text,           -- 전화를 안 받을 때의 예비 연락 수단
  add column if not exists residence_region       text,           -- 거주지(통근 판단). 희망 근무지와 다른 축
  -- 면허·자격
  add column if not exists license_year           integer,        -- 면허 취득연도
  add column if not exists license_reported       boolean,        -- 의료인 면허신고(3년마다) 완료 여부
  add column if not exists certifications         text[] not null default '{}',  -- BLS/ACLS/KALS/PALS 등
  add column if not exists apn_field              text,           -- 전문간호사 분야
  -- 학력
  add column if not exists education_level        text,           -- 3년제/4년제/석사/박사
  add column if not exists graduation_status      text,           -- 졸업/졸업예정/재학
  -- 경력
  add column if not exists career_level           text,           -- 신규/경력
  add column if not exists has_integrated_care    boolean,        -- 간호간병통합병동 경력
  add column if not exists can_charge             boolean,        -- 차지(Charge) 가능
  -- 희망 근무조건 (매칭의 핵심)
  add column if not exists shift_types            text[] not null default '{}',  -- 3교대/2교대/N-KEEP/상근 …
  add column if not exists night_available        boolean,        -- 나이트 전담 가능
  add column if not exists desired_hospital_types text[] not null default '{}',  -- 상급종합/종합/요양 …
  add column if not exists available_from         text,           -- 즉시/1개월 내/협의
  add column if not exists needs_dormitory        boolean;        -- 기숙사 필요(지방·경기권 매칭의 실제 변수)

-- ❌ 용모·키·체중, 출신지역, 혼인여부, 재산, 가족의 학력·직업은 컬럼 자체를 만들지 않는다.
--    채용절차법 제4조의3 — 수집 자체가 과태료 대상(500만원)이라 "안 물어보는" 게 아니라 "못 담는" 구조로 둔다.

-- 경력 상세 — 이번에 유일하게 만드는 새 테이블.
-- 병상수는 장식이 아니다. 실제 공고 우대사항이 "250병상 이상 종합병원 5년 이상"이고
-- 공고 제목에 "#325병상"이 그대로 붙는다.
create table if not exists public.work_experiences (
  id            uuid primary key default gen_random_uuid(),
  resume_id     uuid not null references public.resumes(profile_id) on delete cascade,
  hospital_name text not null,
  hospital_type text,          -- 상급종합/종합/병원/요양 …
  bed_range     text,          -- 100미만/100-299/300-499/500-999/1000이상
  department    text,          -- 근무 부서(병동·중환자실 …)
  start_ym      text not null, -- 'YYYY-MM' (일 단위는 이력서에 불필요)
  end_ym        text,          -- 재직중이면 null
  is_current    boolean not null default false,
  shift_type    text,          -- 그 병원에서의 근무형태
  position      text,          -- 직위(일반/책임/수간호사 …)
  duties        text,          -- 담당업무
  sort_order    integer not null default 0,
  created_at    timestamptz not null default now()
);
create index if not exists work_experiences_resume_idx on public.work_experiences (resume_id, sort_order);

alter table public.work_experiences enable row level security;

-- 본인만 쓰기/읽기
drop policy if exists work_experiences_own on public.work_experiences;
create policy work_experiences_own on public.work_experiences for all
  using (resume_id = (select auth.uid()))
  with check (resume_id = (select auth.uid()));

-- 내 공고에 지원한 간호사의 경력은 그 병원이 볼 수 있다(resumes_select_for_hospital 과 같은 규칙).
drop policy if exists work_experiences_select_for_hospital on public.work_experiences;
create policy work_experiences_select_for_hospital on public.work_experiences for select using (
  exists (select 1 from public.applications a
          join public.jobs j on j.id = a.job_id
          join public.hospitals h on h.id = j.hospital_id
          where a.applicant_id = work_experiences.resume_id and h.owner_profile_id = (select auth.uid()))
);

-- 광고 중인 병원은 공개 이력서의 경력을 볼 수 있다(resumes_select_advertiser 와 같은 규칙).
drop policy if exists work_experiences_select_advertiser on public.work_experiences;
create policy work_experiences_select_advertiser on public.work_experiences for select using (
  exists (select 1 from public.resumes r where r.profile_id = work_experiences.resume_id and r.is_public)
  and exists (select 1 from public.jobs j
              join public.hospitals h on h.id = j.hospital_id
              where h.owner_profile_id = (select auth.uid()) and j.featured_until > now())
);
