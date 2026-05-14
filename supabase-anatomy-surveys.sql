create extension if not exists pgcrypto;

create table if not exists public.anatomy_case_surveys (
  id uuid primary key default gen_random_uuid(),
  question text not null,
  option_1 text not null,
  option_2 text not null,
  option_3 text not null,
  start_date date not null,
  end_date date,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.anatomy_case_survey_responses (
  id uuid primary key default gen_random_uuid(),
  survey_id uuid not null references public.anatomy_case_surveys(id) on delete cascade,
  response text not null,
  session_id text,
  case_id uuid references public.cases(id) on delete set null,
  case_date date,
  level text,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists anatomy_case_surveys_start_date_idx
  on public.anatomy_case_surveys (start_date desc);

create index if not exists anatomy_case_survey_responses_survey_id_idx
  on public.anatomy_case_survey_responses (survey_id);

alter table public.anatomy_case_surveys enable row level security;
alter table public.anatomy_case_survey_responses enable row level security;

drop policy if exists "public read anatomy case surveys" on public.anatomy_case_surveys;
create policy "public read anatomy case surveys"
on public.anatomy_case_surveys
for select
using (true);

drop policy if exists "public write anatomy case surveys" on public.anatomy_case_surveys;
create policy "public write anatomy case surveys"
on public.anatomy_case_surveys
for all
using (true)
with check (true);

drop policy if exists "public read anatomy case survey responses" on public.anatomy_case_survey_responses;
create policy "public read anatomy case survey responses"
on public.anatomy_case_survey_responses
for select
using (true);

drop policy if exists "public write anatomy case survey responses" on public.anatomy_case_survey_responses;
create policy "public write anatomy case survey responses"
on public.anatomy_case_survey_responses
for all
using (true)
with check (true);
