-- Phase 9 RC3 Slice 2 - clinics schema preflight
-- Select-only verification script. Safe to run in Supabase SQL editor.
-- This file does not create, update, or delete data.

-- 1. Confirm the table exists and whether RLS is enabled.
select
  schemaname,
  tablename,
  rowsecurity as rls_enabled,
  hasindexes,
  hasrules,
  hastriggers
from pg_tables
where schemaname = 'public'
  and tablename = 'clinics';

-- 2. Inspect columns, types, nullability, and defaults.
select
  ordinal_position,
  column_name,
  data_type,
  udt_name,
  is_nullable,
  column_default
from information_schema.columns
where table_schema = 'public'
  and table_name = 'clinics'
order by ordinal_position;

-- 3. Inspect constraints, including primary key, unique clinic_code, and
-- deployment_status check constraints.
select
  c.conname as constraint_name,
  c.contype as constraint_type,
  pg_get_constraintdef(c.oid) as constraint_definition
from pg_constraint c
join pg_class t on t.oid = c.conrelid
join pg_namespace n on n.oid = t.relnamespace
where n.nspname = 'public'
  and t.relname = 'clinics'
order by c.conname;

-- 4. Inspect indexes. clinic_code should have a uniqueness-backed index.
select
  indexname,
  indexdef
from pg_indexes
where schemaname = 'public'
  and tablename = 'clinics'
order by indexname;

-- 5. Inspect triggers, including updated_at maintenance.
select
  trigger_name,
  event_manipulation,
  action_timing,
  action_statement
from information_schema.triggers
where event_object_schema = 'public'
  and event_object_table = 'clinics'
order by trigger_name, event_manipulation;

-- 6. Inspect RLS policies if RLS is enabled.
select
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
from pg_policies
where schemaname = 'public'
  and tablename = 'clinics'
order by policyname;

-- 7. Confirm deployment_runs can hold the clinic link expected by RC3.
select
  column_name,
  data_type,
  udt_name,
  is_nullable,
  column_default
from information_schema.columns
where table_schema = 'public'
  and table_name = 'deployment_runs'
  and column_name = 'clinic_id';

-- 8. Inspect deployment_runs constraints touching clinic_id.
select
  c.conname as constraint_name,
  c.contype as constraint_type,
  pg_get_constraintdef(c.oid) as constraint_definition
from pg_constraint c
join pg_class t on t.oid = c.conrelid
join pg_namespace n on n.oid = t.relnamespace
where n.nspname = 'public'
  and t.relname = 'deployment_runs'
  and pg_get_constraintdef(c.oid) ilike '%clinic_id%'
order by c.conname;
