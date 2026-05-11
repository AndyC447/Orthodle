create extension if not exists pgcrypto;

create table if not exists public.user_accounts (
  id uuid primary key default gen_random_uuid(),
  username text not null,
  username_normalized text not null,
  password_hash text not null,
  password_salt text not null,
  display_name text,
  profile_icon text,
  created_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists user_accounts_username_idx
  on public.user_accounts (username);

create unique index if not exists user_accounts_username_normalized_idx
  on public.user_accounts (username_normalized);

create table if not exists public.group_announcements (
  id uuid primary key default gen_random_uuid(),
  message text not null,
  start_date date not null,
  end_date date,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists group_announcements_start_date_idx
  on public.group_announcements (start_date desc);
