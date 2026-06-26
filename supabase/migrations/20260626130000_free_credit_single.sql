-- 무료 광고 정책 변경: 병원당 4회 → 최초 1회만.
alter table public.hospitals alter column free_credits set default 1;
-- 기존 행 정정: 1 초과는 1로 내림(이미 소진된 0은 유지).
update public.hospitals set free_credits = 1 where free_credits > 1;
