-- RC4 Slice 3A - sterilizers schema preflight
--
-- Purpose:
-- Inspect the current public.sterilizers table before introducing
-- clinic-scoped deployment sterilizer records. This script is read-only.

select to_regclass('public.sterilizers') as sterilizers_table;

select
  table_schema,
  table_name,
  column_name,
  data_type,
  is_nullable,
  column_default
from information_schema.columns
where table_schema = 'public'
  and table_name = 'sterilizers'
order by ordinal_position;

select
  conname as constraint_name,
  contype as constraint_type,
  pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = to_regclass('public.sterilizers')
order by conname;

select
  indexname,
  indexdef
from pg_indexes
where schemaname = 'public'
  and tablename = 'sterilizers'
order by indexname;

select
  c.relname as table_name,
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as rls_forced
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname = 'sterilizers';

select
  tgname as trigger_name,
  pg_get_triggerdef(oid) as trigger_definition
from pg_trigger
where tgrelid = to_regclass('public.sterilizers')
  and not tgisinternal
order by tgname;

select count(*) as total_sterilizer_rows
from public.sterilizers;

select
  active,
  count(*) as sterilizer_rows
from public.sterilizers
group by active
order by active;

select
  exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'sterilizers'
      and column_name = 'clinic_id'
  ) as clinic_id_exists,
  exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'sterilizers'
      and column_name = 'deployment_sterilizer_key'
  ) as deployment_sterilizer_key_exists,
  exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'sterilizers'
      and column_name = 'provisioning_source'
  ) as provisioning_source_exists,
  exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'sterilizers'
      and column_name = 'provisioning_status'
  ) as provisioning_status_exists;

select
  indexname,
  indexdef,
  (
    indexdef ilike '%unique%'
    and indexdef ilike '%lower%'
    and indexdef ilike '%trim%'
    and indexdef ilike '%name%'
    and indexdef not ilike '%clinic_id%'
  ) as appears_to_be_global_lower_trim_name_unique
from pg_indexes
where schemaname = 'public'
  and tablename = 'sterilizers'
  and indexdef ilike '%unique%'
order by indexname;

select
  lower(trim(name)) as normalized_name,
  count(*) as sterilizer_rows
from public.sterilizers
where name is not null
group by lower(trim(name))
having count(*) > 1
order by sterilizer_rows desc, normalized_name;
