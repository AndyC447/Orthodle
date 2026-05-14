create extension if not exists pgcrypto;

create table if not exists public.site_surveys (
  id uuid primary key default gen_random_uuid(),
  question text not null,
  options jsonb not null default '[]'::jsonb,
  placement text not null check (placement in ('homepage_header', 'group_header', 'after_case')),
  level_scope text not null default 'all' check (level_scope in ('all', 'med_student', 'resident', 'attending')),
  start_date date not null,
  end_date date,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.site_survey_responses (
  id uuid primary key default gen_random_uuid(),
  survey_id uuid not null references public.site_surveys(id) on delete cascade,
  response text not null,
  session_id text,
  placement text,
  case_id uuid references public.cases(id) on delete set null,
  case_date date,
  level text,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists site_surveys_start_date_idx
  on public.site_surveys (start_date desc);

create index if not exists site_surveys_placement_idx
  on public.site_surveys (placement, start_date desc);

create index if not exists site_survey_responses_survey_id_idx
  on public.site_survey_responses (survey_id);

alter table public.site_surveys enable row level security;
alter table public.site_survey_responses enable row level security;

drop policy if exists "public read site surveys" on public.site_surveys;
create policy "public read site surveys"
on public.site_surveys
for select
to anon, authenticated
using (true);

drop policy if exists "public write site surveys" on public.site_surveys;
create policy "public write site surveys"
on public.site_surveys
for all
to anon, authenticated
using (true)
with check (true);

drop policy if exists "public read site survey responses" on public.site_survey_responses;
create policy "public read site survey responses"
on public.site_survey_responses
for select
to anon, authenticated
using (true);

drop policy if exists "public write site survey responses" on public.site_survey_responses;
create policy "public write site survey responses"
on public.site_survey_responses
for all
to anon, authenticated
using (true)
with check (true);
