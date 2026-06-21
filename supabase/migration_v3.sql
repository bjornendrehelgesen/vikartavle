-- Migration v3: assigned_to field for duties
-- Run in Supabase SQL Editor AFTER migration_v2.sql

alter table board_duties add column if not exists assigned_to text not null default '';
alter table board_bus_duties add column if not exists assigned_to text not null default '';
