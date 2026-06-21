-- Migration v6: extra absent/partial-day name lists on boards
-- Run in Supabase SQL Editor AFTER migration_v5.sql

alter table boards add column if not exists extra_absent text not null default '';
alter table boards add column if not exists extra_partial_day text not null default '';
