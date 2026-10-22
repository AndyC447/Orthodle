-- Apply before deploying the answer-specificity UI. Existing cases default to off.
alter table public.cases add column if not exists answer_specificity text not null default 'off'
  constraint cases_answer_specificity_check check (answer_specificity in ('off', 'named_diagnosis', 'named_fracture'));

-- Make the new field available to the API immediately after the migration.
notify pgrst, 'reload schema';
