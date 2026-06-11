alter table public.play_mode_settings
  add column if not exists no_anatomy_mode boolean default false,
  add column if not exists no_anatomy_mode_start_date date;
