-- Migration v5: is_absent flag on absences
-- Run in Supabase SQL Editor AFTER migration_v4.sql

alter table absences add column if not exists is_absent boolean not null default true;
