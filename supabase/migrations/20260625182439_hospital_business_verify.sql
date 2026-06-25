-- 병원 사업자 인증 + 병원 claim 필드. 인증/권한 필드는 서버(service_role)만 설정 가능.
alter table public.profiles
  add column business_no text,
  add column business_verified boolean not null default false,
  add column business_verified_at timestamptz,
  add column claimed_hospital_id uuid references public.hospitals(id) on delete set null;

-- 자가 인증/권한 상승 차단: 테이블 UPDATE 권한 회수 후, 사용자가 직접 수정 가능한 컬럼만 재허용.
-- (role, business_verified, business_no, claimed_hospital_id, username, email, legacy_member_srl 등은
--  service_role=서버 로직으로만 변경 — NTS 진위확인 통과 시에만 verified 설정)
revoke update on public.profiles from anon, authenticated;
grant update (display_name, full_name, phone_number, avatar_url, gender, birthday, is_open_to_work)
  on public.profiles to authenticated;
