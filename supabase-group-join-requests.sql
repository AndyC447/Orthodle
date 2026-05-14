create extension if not exists pgcrypto;

create table if not exists public.group_join_requests (
  id uuid primary key default gen_random_uuid(),
  group_id uuid references public.groups(id) on delete set null,
  group_name text not null,
  requester_session_id text not null,
  requester_display_name text not null,
  requester_icon text,
  contact_text text,
  note text,
  status text not null default 'open',
  created_at timestamptz not null default timezone('utc', now()),
  handled_at timestamptz
);

create index if not exists group_join_requests_group_id_idx
  on public.group_join_requests (group_id);

create index if not exists group_join_requests_status_idx
  on public.group_join_requests (status);

alter table public.group_join_requests enable row level security;

drop policy if exists "public read group join requests" on public.group_join_requests;
create policy "public read group join requests"
on public.group_join_requests
for select
using (true);

drop policy if exists "public insert group join requests" on public.group_join_requests;
create policy "public insert group join requests"
on public.group_join_requests
for insert
with check (true);

drop policy if exists "public update group join requests" on public.group_join_requests;
create policy "public update group join requests"
on public.group_join_requests
for update
using (true)
with check (true);

drop policy if exists "public delete group join requests" on public.group_join_requests;
create policy "public delete group join requests"
on public.group_join_requests
for delete
using (true);
