alter table public.groups
  add column if not exists icon text default '🦴';

update public.groups
set icon = '🦴'
where icon is null;

alter table public.groups enable row level security;

drop policy if exists "public update groups" on public.groups;

create policy "public update groups"
  on public.groups
  for update
  using (true)
  with check (true);

grant select, insert, update on public.groups to anon, authenticated;

alter table public.group_members
  add column if not exists icon text default '🦴';

update public.group_members
set icon = '🦴'
where icon is null;

grant select, insert, update on public.group_members to anon, authenticated;
