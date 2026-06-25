-- 1:1 메시지 (병원↔간호사). profiles가 본인전용 select라 상대 표시명은 비정규화 저장.
create table public.messages (
  id             uuid primary key default gen_random_uuid(),
  sender_id      uuid not null references public.profiles(id) on delete cascade,
  recipient_id   uuid not null references public.profiles(id) on delete cascade,
  sender_name    text,
  recipient_name text,
  body           text not null check (char_length(body) between 1 and 2000),
  is_read        boolean not null default false,
  created_at     timestamptz not null default now()
);
create index messages_recipient_idx on public.messages (recipient_id);
create index messages_pair_idx on public.messages (sender_id, recipient_id);

alter table public.messages enable row level security;
create policy messages_select on public.messages for select using (
  sender_id = (select auth.uid()) or recipient_id = (select auth.uid())
);
create policy messages_insert_own on public.messages for insert with check (sender_id = (select auth.uid()));
create policy messages_update_recipient on public.messages for update using (recipient_id = (select auth.uid())) with check (recipient_id = (select auth.uid()));
