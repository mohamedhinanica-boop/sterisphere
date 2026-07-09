-- RC5 Slice 1C - clinical_hardware_devices deployment-shell preflight
-- Read-only verification after applying the deployment metadata migration.
-- This script does not migrate schema, insert rows, update rows, attach legacy
-- hardware, bind devices, activate devices, or wire runtime deployment.

select
  exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'clinical_hardware_devices'
  ) as clinical_hardware_devices_exists;

select
  column_name,
  data_type,
  is_nullable,
  column_default
from information_schema.columns
where table_schema = 'public'
  and table_name = 'clinical_hardware_devices'
order by ordinal_position;

select
  exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'clinical_hardware_devices'
      and column_name = 'deployment_hardware_key'
  ) as deployment_hardware_key_exists,
  exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'clinical_hardware_devices'
      and column_name = 'provisioning_source'
  ) as provisioning_source_exists,
  exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'clinical_hardware_devices'
      and column_name = 'provisioning_status'
  ) as provisioning_status_exists,
  exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'clinical_hardware_devices'
      and column_name = 'active'
  ) as active_exists,
  exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'clinical_hardware_devices'
      and column_name = 'display_order'
  ) as display_order_exists;

select
  tc.constraint_name,
  tc.constraint_type,
  pg_get_constraintdef(c.oid) as constraint_definition
from information_schema.table_constraints tc
join pg_constraint c
  on c.conname = tc.constraint_name
where tc.table_schema = 'public'
  and tc.table_name = 'clinical_hardware_devices'
order by tc.constraint_type, tc.constraint_name;

select
  indexname,
  indexdef
from pg_indexes
where schemaname = 'public'
  and tablename = 'clinical_hardware_devices'
order by indexname;

select
  exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and tablename = 'clinical_hardware_devices'
      and indexname = 'clinical_hardware_devices_clinic_deployment_key_uidx'
      and indexdef ilike '%unique%'
      and indexdef ilike '%clinic_id%'
      and indexdef ilike '%deployment_hardware_key%'
      and indexdef ilike '%where (deployment_hardware_key is not null)%'
  ) as partial_unique_deployment_key_index_exists;

select
  relrowsecurity as rls_enabled,
  relforcerowsecurity as rls_forced
from pg_class
where oid = 'public.clinical_hardware_devices'::regclass;

select
  tgname as trigger_name,
  pg_get_triggerdef(oid) as trigger_definition
from pg_trigger
where tgrelid = 'public.clinical_hardware_devices'::regclass
  and not tgisinternal
order by tgname;

select
  count(*) as total_rows,
  count(*) filter (where clinic_id is null) as legacy_global_rows,
  count(*) filter (where clinic_id is not null) as clinic_scoped_rows,
  count(*) filter (where deployment_hardware_key is null) as rows_without_deployment_key,
  count(*) filter (where deployment_hardware_key is not null) as rows_with_deployment_key,
  count(*) filter (where deployment_hardware_key is null and provisioning_source is null and provisioning_status is null and active is null) as legacy_rows_still_unprovisioned,
  count(*) filter (where status = 'active') as physical_active_rows,
  count(*) filter (where active is true) as deployment_active_rows,
  count(*) filter (where provisioning_status = 'planned' and active is false) as planned_inactive_deployment_rows
from public.clinical_hardware_devices;

select
  clinic_id,
  deployment_hardware_key,
  count(*) as row_count
from public.clinical_hardware_devices
where clinic_id is not null
  and deployment_hardware_key is not null
group by clinic_id, deployment_hardware_key
having count(*) > 1
order by row_count desc, deployment_hardware_key;

select
  count(*) as rows_with_deployment_key_and_null_clinic
from public.clinical_hardware_devices
where deployment_hardware_key is not null
  and clinic_id is null;

select
  count(*) as deployment_rows_that_look_activated
from public.clinical_hardware_devices
where deployment_hardware_key is not null
  and (
    active is distinct from false
    or provisioning_source is distinct from 'setup_draft'
    or provisioning_status is distinct from 'planned'
    or status = 'active'
    or agent_id is not null
    or default_workstation_id is not null
    or current_workstation_id is not null
  );

select
  count(*) as legacy_rows_with_unexpected_deployment_metadata
from public.clinical_hardware_devices
where deployment_hardware_key is null
  and (
    provisioning_source is not null
    or provisioning_status is not null
    or active is not null
    or display_order is not null
  );