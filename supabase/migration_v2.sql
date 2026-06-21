-- Migration v2: Vakter og Bussvakter
-- Run in Supabase SQL Editor AFTER migration.sql

-- Predefined recess duty areas (global config)
create table if not exists duty_areas (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sort_order int not null default 0
);

-- Predefined bus duty times (global config)
create table if not exists bus_times (
  id uuid primary key default gen_random_uuid(),
  time_label text not null,
  sort_order int not null default 0
);

-- Recess duties per board/day
create table if not exists board_duties (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references boards(id) on delete cascade,
  area text not null default '',
  time_slot text not null default '',
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

-- Bus duties per board/day
create table if not exists board_bus_duties (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references boards(id) on delete cascade,
  time_label text not null default '',
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

-- Enable RLS
alter table duty_areas enable row level security;
alter table bus_times enable row level security;
alter table board_duties enable row level security;
alter table board_bus_duties enable row level security;

-- Public read
create policy "Public read duty_areas" on duty_areas for select using (true);
create policy "Public read bus_times" on bus_times for select using (true);
create policy "Public read board_duties" on board_duties for select using (true);
create policy "Public read board_bus_duties" on board_bus_duties for select using (true);

-- Auth write
create policy "Auth write duty_areas" on duty_areas for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "Auth write bus_times" on bus_times for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "Auth write board_duties" on board_duties for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "Auth write board_bus_duties" on board_bus_duties for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- Enable Realtime
alter publication supabase_realtime add table board_duties;
alter publication supabase_realtime add table board_bus_duties;

-- Add per-teacher period count to absences (default 6)
alter table absences add column if not exists num_periods int not null default 6;
