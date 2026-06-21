-- Vikartavle database migration
-- Run this in Supabase SQL Editor

-- Enable UUID extension
create extension if not exists "pgcrypto";

-- boards: one row per date
create table if not exists boards (
  id uuid primary key default gen_random_uuid(),
  date date unique not null,
  info_text text not null default '',
  num_periods int not null default 6,
  created_at timestamptz not null default now()
);

-- absences: one row per absent teacher per date
create table if not exists absences (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references boards(id) on delete cascade,
  teacher_initials text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

-- substitutions: value in one cell (absence × period)
create table if not exists substitutions (
  id uuid primary key default gen_random_uuid(),
  absence_id uuid not null references absences(id) on delete cascade,
  period_number int not null,
  substitute_text text not null default '',
  unique (absence_id, period_number)
);

-- Enable Row Level Security
alter table boards enable row level security;
alter table absences enable row level security;
alter table substitutions enable row level security;

-- RLS policies: everyone can read
create policy "Public read boards"
  on boards for select
  using (true);

create policy "Public read absences"
  on absences for select
  using (true);

create policy "Public read substitutions"
  on substitutions for select
  using (true);

-- RLS policies: only authenticated users can write
create policy "Auth write boards"
  on boards for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

create policy "Auth write absences"
  on absences for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

create policy "Auth write substitutions"
  on substitutions for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

-- Enable Realtime on all tables
alter publication supabase_realtime add table boards;
alter publication supabase_realtime add table absences;
alter publication supabase_realtime add table substitutions;
