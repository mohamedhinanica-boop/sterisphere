-- RC4 Slice 2A - providers schema preflight
--
-- Purpose:
-- Inspect the current public.providers table before introducing clinic-scoped
-- deployment provider shells. This script is read-only.

select to_regclass('public.providers') as providers_table;

select
  table_schema,
  table_name,
  column_name,
  data_type,
  is_nullable,
  column_default
from information_schema.columns
where table_schema = 'public'
  and table_name = 'providers'
order by ordinal_position;

select
  conname as constraint_name,
  contype as constraint_type,
  pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = to_regclass('public.providers')
order by conname;

select
  indexname,
  indexdef
from pg_indexes
where schemaname = 'public'
  and tablename = 'providers'
order by indexname;

select
  c.relname as table_name,
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as rls_forced
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname = 'providers';

select
  tgname as trigger_name,
  pg_get_triggerdef(oid) as trigger_definition
from pg_trigger
where tgrelid = to_regclass('public.providers')
  and not tgisinternal
order by tgname;

select count(*) as total_provider_rows
from public.providers;

select
  role,
  active,
  count(*) as provider_rows
from public.providers
group by role, active
order by role, active;

select
  exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'providers'
      and column_name = 'clinic_id'
  ) as clinic_id_exists,
  exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'providers'
      and column_name = 'deployment_provider_key'
  ) as deployment_provider_key_exists,
  exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'providers'
      and column_name = 'provisioning_source'
  ) as provisioning_source_exists,
  exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'providers'
      and column_name = 'provisioning_status'
  ) as provisioning_status_exists;

