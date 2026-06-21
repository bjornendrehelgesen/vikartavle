-- Migration v4: direction field for bus duties
-- Run in Supabase SQL Editor AFTER migration_v3.sql

alter table board_bus_duties add column if not exists direction text not null default '';
