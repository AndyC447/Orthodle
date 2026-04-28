create extension if not exists "uuid-ossp";

create table if not exists cases (
  id uuid primary key default uuid_generate_v4(),
  case_date date not null,
  level text not null default 'med_student',
  contributor_name text,
  category text,
  prompt text not null,
  answer text not null,
  synonyms text[] default '{}',
  image_url text,
  image_credit text,
  image_reveal_clue integer,
  clue_1 text,
  clue_2 text,
  clue_3 text,
  clue_4 text,
  clue_5 text,
  clue_6 text,
  teaching_point text,
  created_at timestamptz default now()
);

alter table cases add column if not exists contributor_name text;
alter table cases add column if not exists image_credit text;
alter table cases add column if not exists image_reveal_clue integer;
alter table cases add column if not exists clue_4 text;
alter table cases add column if not exists clue_5 text;
alter table cases add column if not exists clue_6 text;
alter table cases add column if not exists teaching_point text;

create table if not exists guesses (
  id uuid primary key default uuid_generate_v4(),
  case_id uuid references cases(id) on delete cascade,
  session_id text not null,
  guess_text text not null,
  is_correct boolean default false,
  created_at timestamptz default now()
);

create table if not exists visits (
  id uuid primary key default uuid_generate_v4(),
  session_id text not null,
  path text,
  created_at timestamptz default now()
);

create table if not exists case_submissions (
  id uuid primary key default uuid_generate_v4(),
  contributor_name text,
  status text not null default 'pending',
  scheduled_date date,
  published_case_id uuid references cases(id) on delete set null,
  level text not null default 'med_student',
  category text,
  prompt text not null,
  answer text not null,
  synonyms text[] default '{}',
  image_url text,
  image_credit text,
  image_reveal_clue integer,
  clue_1 text,
  clue_2 text,
  clue_3 text,
  clue_4 text,
  clue_5 text,
  clue_6 text,
  teaching_point text,
  created_at timestamptz default now()
);

create or replace view daily_analytics as
select
  c.case_date,
  count(distinct v.session_id) as daily_users,
  count(g.id) as guesses,
  count(g.id) filter (where g.is_correct = true) as correct_guesses
from cases c
left join visits v on date(v.created_at) = c.case_date
left join guesses g on g.case_id = c.id
group by c.case_date
order by c.case_date desc;

alter table cases enable row level security;
alter table guesses enable row level security;
alter table visits enable row level security;
alter table case_submissions enable row level security;

create policy "public read cases" on cases for select using (true);
create policy "public insert cases" on cases for insert with check (true);
create policy "public read guesses" on guesses for select using (true);
create policy "public insert guesses" on guesses for insert with check (true);
create policy "public read visits" on visits for select using (true);
create policy "public insert visits" on visits for insert with check (true);
create policy "public read case submissions" on case_submissions for select using (true);
create policy "public insert case submissions" on case_submissions for insert with check (true);
create policy "public update case submissions" on case_submissions for update using (true) with check (true);

insert into cases (case_date, level, category, prompt, answer, synonyms, clue_1, clue_2)
values (
  current_date,
  'med_student',
  'Wrist / nerve',
  'A 52-year-old right-handed office worker describes six months of numbness and burning in her right hand that wakes her at night. She frequently flicks her hand to relieve symptoms.',
  'Carpal tunnel syndrome',
  array['CTS','median nerve compression','carpal tunnel'],
  'Symptoms often involve the thumb, index, middle, and radial half of the ring finger.',
  'Provocative testing may include Phalen or Tinel signs.'
)
on conflict do nothing;
