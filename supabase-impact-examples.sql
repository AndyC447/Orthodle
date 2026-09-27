-- Run once in the Supabase SQL editor before saving curated examples.
create table if not exists public.impact_examples (
  slot text primary key check (slot in ('featured', 'anatomy', 'classification')),
  case_id uuid references public.cases(id) on delete set null
);
alter table public.impact_examples enable row level security;
-- Reads and writes go through the server API; no anonymous write policy.
revoke all on public.impact_examples from anon, authenticated;
grant all on public.impact_examples to service_role;
