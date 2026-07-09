-- RC4 Slice 4B - clinical_workstations deployment-shell preflight
-- Read-only verification for the future workstation planned-shell repository.
-- This script does not migrate schema, insert rows, update rows, attach legacy
-- workstations, activate workstations, or wire runtime deployment.

select
  exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'clinical_workstations'
  ) as clinical_workstations_exists;

select
  column_name,
  data_type,
  is_nullable,
  column_default
from information_schema.columns
where table_schema = 'public'
  and table_name = 'clinical_workstations'
order by ordinal_position;

select
  tc.constraint_name,
  tc.constraint_type,
  pg_get_constraintdef(c.oid) as constraint_definition
from information_schema.table_constraints tc
join pg_constraint c
  on c.conname = tc.constraint_name
where tc.table_schema = 'public'
  and tc.table_name = 'clinical_workstations'
order by tc.constraint_type, tc.constraint_name;

select
  indexname,
  indexdef
from pg_indexes
where schemaname = 'public'
  and tablename = 'clinical_workstations'
order by indexname;

select
  relrowsecurity as rls_enabled,
  relforcerowsecurity as rls_forced
from pg_class
where oid = 'public.clinical_workstations'::regclass;

select
  tgname as trigger_name,
  pg_get_triggerdef(oid) as trigger_definition
from pg_trigger
where tgrelid = 'public.clinical_workstations'::regclass
  and not tgisinternal
order by tgname;

select
  count(*) as total_rows,
  count(*) filter (where clinic_id is null) as legacy_global_rows,
  count(*) filter (where clinic_id is not null) as clinic_scoped_rows,
  count(*) filter (where status = 'planned') as planned_rows,
  count(*) filter (where status = 'active') as active_rows
from public.clinical_workstations;

select
  exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'clinical_workstations'
      and column_name = 'deployment_workstation_key'
  ) as deployment_workstation_key_exists,
  exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'clinical_workstations'
      and column_name = 'provisioning_source'
  ) as provisioning_source_exists,
  exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'clinical_workstations'
      and column_name = 'provisioning_status'
  ) as provisioning_status_exists,
  exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'clinical_workstations'
      and column_name = 'active'
  ) as active_exists,
  exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'clinical_workstations'
      and column_name = 'capabilities'
  ) as capabilities_json_exists;

do $$
declare
  duplicate_key_count integer := 0;
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'clinical_workstations'
      and column_name = 'deployment_workstation_key'
  )
  then
    execute '
      select count(*)
      from (
        select clinic_id, deployment_workstation_key
        from public.clinical_workstations
        where clinic_id is not null
          and deployment_workstation_key is not null
        group by clinic_id, deployment_workstation_key
        having count(*) > 1
      ) duplicate_keys
    ' into duplicate_key_count;

    raise notice 'Duplicate (clinic_id, deployment_workstation_key) groups: %', duplicate_key_count;
  else
    raise notice 'Skipping duplicate deployment_workstation_key check because the column is not present.';
  end if;
end $$;