-- 🔍 수집기(크론) 실행 기록 — **조용히 죽는 것을 알아채려고** 만든다.
--
-- 왜 필요한가(오너 지시 2026-08-12: "긁어오는 기능에 오류가 생기는지 바로 알 수 있게"):
-- 지금 수집기는 넷이고(병원명부·워크넷·잡알리오·대학병원사이트) 결과는 크론 응답 JSON 에만 있다.
-- **그 JSON 을 아무도 안 본다.** 실제로 sync-hospitals 는 매주 실패하고 있었는데 몇 달 동안 몰랐다.
-- 병원 한 곳이 홈페이지를 개편하면 그 병원 공고만 조용히 0건이 되는데, 그것도 화면에 안 나타난다.
--
-- 그래서 실행마다 한 줄을 남기고 관리자 화면이 그걸 읽는다. 알림·외부 서비스 없이,
-- **관리자가 화면을 열었을 때 즉시 보이는 것**이 목표다.
create table if not exists public.collector_runs (
  id          bigint generated always as identity primary key,
  -- 'hospitals' | 'worknet' | 'alio' | 'ats' — 크론 하나당 하나.
  collector   text not null,
  ran_at      timestamptz not null default now(),
  ok          boolean not null,
  -- 몇 건을 받아 몇 건을 저장했는지 등. 수집기마다 항목이 달라 jsonb 로 둔다.
  stats       jsonb not null default '{}'::jsonb,
  -- 실패한 개별 원천(병원 사이트·ATS 테넌트). 전체는 성공했는데 한 곳만 죽는 경우가 진짜 위험하다.
  failed      text[] not null default '{}',
  -- 실행 자체가 터졌을 때의 메시지.
  error       text,
  duration_ms integer
);

-- 화면은 "수집기별 최근 실행"만 본다 — 그 조회에 맞춘 인덱스.
create index if not exists collector_runs_recent_idx on public.collector_runs(collector, ran_at desc);

-- 🔴 RLS: 이 표에는 실패 사유·내부 원천 이름이 들어간다. 관리자만 읽는다.
--    쓰기는 크론(service_role)이 RLS 를 우회해서 한다 — 정책을 따로 두지 않는다.
alter table public.collector_runs enable row level security;
create policy collector_runs_admin_read on public.collector_runs
  for select using (private.is_admin());

comment on table public.collector_runs is
  '수집 크론 실행 기록. 관리자 화면(/admin/collectors)이 "언제 마지막으로 성공했나"를 여기서 읽는다.';

-- 오래된 기록은 쌓아 둘 이유가 없다(화면은 최근 것만 본다). 30일 지난 것은 다음 실행이 지운다 —
-- 별도 크론을 만들지 않으려고 수집기가 자기 기록을 정리하게 했다(lib/collectorLog).
