-- RC6 Slice 1C - deployment hardware assignments live preflight
-- Read-only verification for the dedicated planned hardware assignment table.
-- This script does not migrate schema, insert rows, update rows, resolve ids,
-- mutate clinical_hardware_devices, bind hardware, attach agents, or activate
-- assignments.

select
  to_regclass('public.deployment_hardware_assignments') as deployment_hardware_assignments_table,
  to_regclass('public.clinics') as clinics_table,
  to_regclass('public.clinical_hardware_devices') as clinical_hardware_devices_table,
  to_regclass('public.clinical_workstations') as clinical_workstations_table,
  to_regclass('public.sterilizers') as sterilizers_table;

select
  column_name,
  data_type,
  is_nullable,
  column_default
from information_schema.columns
where table_schema = 'public'
  and table_name = 'deployment_hardware_assignments'
order by ordinal_position;

select
  exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'deployment_hardware_assignments'
      and column_name = 'id'
      and data_type = 'uuid'
  ) as id_uuid_exists,
  exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'deployment_hardware_assignments'
      and column_name = 'clinic_id'
      and data_type = 'uuid'
      and is_nullable = 'NO'
  ) as clinic_id_uuid_not_null_exists,
  exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'deployment_hardware_assignments'
      and column_name = 'deployment_hardware_key'
      and data_type = 'text'
      and is_nullable = 'NO'
  ) as deployment_hardware_key_text_not_null_exists,
  exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'deployment_hardware_assignments'
      and column_name = 'assignment_key'
      and data_type = 'text'
      and is_nullable = 'NO'
  ) as assignment_key_text_not_null_exists,
  exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'deployment_hardware_assignments'
      and column_name = 'target_type'
      and data_type = 'text'
      and is_nullable = 'NO'
  ) as target_type_text_not_null_exists,
  exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'deployment_hardware_assignments'
      and column_name = 'target_deployment_key'
      and data_type = 'text'
      and is_nullable = 'YES'
  ) as target_deployment_key_text_null_exists,
  exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'deployment_hardware_assignments'
      and column_name = 'assignment_status'
      and data_type = 'text'
      and is_nullable = 'NO'
      and column_default = '''planned''::text'
  ) as assignment_status_default_exists,
  exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'deployment_hardware_assignments'
      and column_name = 'assignment_source'
      and data_type = 'text'
      and is_nullable = 'NO'
      and column_default = '''setup_draft''::text'
  ) as assignment_source_default_exists,
  exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'deployment_hardware_assignments'
      and column_name = 'active'
      and data_type = 'boolean'
      and is_nullable = 'NO'
      and column_default = 'false'
  ) as active_false_default_exists,
  exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'deployment_hardware_assignments'
      and column_name = 'display_order'
      and data_type = 'integer'
      and is_nullable = 'YES'
  ) as display_order_integer_null_exists,
  exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'deployment_hardware_assignments'
      and column_name = 'reason'
      and data_type = 'text'
      and is_nullable = 'YES'
  ) as reason_text_null_exists,
  exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'deployment_hardware_assignments'
      and column_name = 'metadata'
      and data_type = 'jsonb'
      and is_nullable = 'NO'
  ) as metadata_jsonb_not_null_exists,
  exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'deployment_hardware_assignments'
      and column_name = 'created_at'
      and data_type = 'timestamp with time zone'
      and is_nullable = 'NO'
  ) as created_at_timestamptz_not_null_exists,
  exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'deployment_hardware_assignments'
      and column_name = 'updated_at'
      and data_type = 'timestamp with time zone'
      and is_nullable = 'NO'
  ) as updated_at_timestamptz_not_null_exists;

select
  conname as constraint_name,
  contype as constraint_type,
  pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = to_regclass('public.deployment_hardware_assignments')
order by conname;

select
  indexname,
  indexdef
from pg_indexes
where schemaname = 'public'
  and tablename = 'deployment_hardware_assignments'
order by indexname;

select
  exists (
    select 1
    from pg_constraint
    where conrelid = to_regclass('public.deployment_hardware_assignments')
      and contype = 'f'
      and pg_get_constraintdef(oid) ilike '%foreign key (clinic_id)%references%clinics(id)%on delete restrict%'
  ) as clinic_id_restrict_fk_exists,
  exists (
    select 1
    from pg_constraint
    where conrelid = to_regclass('public.deployment_hardware_assignments')
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%target_type%workstation%sterilizer%unassigned%'
  ) as target_type_check_exists,
  exists (
    select 1
    from pg_constraint
    where conrelid = to_regclass('public.deployment_hardware_assignments')
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%assignment_status%planned%active%archived%'
  ) as assignment_status_check_exists,
  exists (
    select 1
    from pg_constraint
    where conrelid = to_regclass('public.deployment_hardware_assignments')
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%assignment_source%setup_draft%'
  ) as assignment_source_check_exists,
  exists (
    select 1
    from pg_constraint
    where conrelid = to_regclass('public.deployment_hardware_assignments')
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%display_order%> 0%'
  ) as display_order_positive_check_exists,
  exists (
    select 1
    from pg_constraint
    where conrelid = to_regclass('public.deployment_hardware_assignments')
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%target_deployment_key is null%'
      and pg_get_constraintdef(oid) ilike '%target_deployment_key is not null%'
  ) as target_key_shape_check_exists;

select
  exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and tablename = 'deployment_hardware_assignments'
      and indexname = 'deployment_hardware_assignments_clinic_hardware_key_unique_idx'
      and indexdef ilike '%unique%'
      and indexdef ilike '%clinic_id%'
      and indexdef ilike '%deployment_hardware_key%'
  ) as clinic_hardware_key_unique_index_exists,
  exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and tablename = 'deployment_hardware_assignments'
      and indexname = 'deployment_hardware_assignments_clinic_assignment_key_unique_idx'
      and indexdef ilike '%unique%'
      and indexdef ilike '%clinic_id%'
      and indexdef ilike '%assignment_key%'
  ) as clinic_assignment_key_unique_index_exists;

select
  clinic_id,
  deployment_hardware_key,
  count(*) as assignment_rows
from public.deployment_hardware_assignments
group by clinic_id, deployment_hardware_key
having count(*) > 1
order by assignment_rows desc, clinic_id, deployment_hardware_key;

select
  clinic_id,
  assignment_key,
  count(*) as assignment_rows
from public.deployment_hardware_assignments
group by clinic_id, assignment_key
having count(*) > 1
order by assignment_rows desc, clinic_id, assignment_key;

select
  count(*) as unassigned_rows_with_target_key
from public.deployment_hardware_assignments
where target_type = 'unassigned'
  and target_deployment_key is not null;

select
  count(*) as targeted_rows_without_target_key
from public.deployment_hardware_assignments
where target_type in ('workstation', 'sterilizer')
  and (
    target_deployment_key is null
    or length(trim(target_deployment_key)) = 0
  );

select
  count(*) as active_setup_draft_planned_rows
from public.deployment_hardware_assignments
where assignment_source = 'setup_draft'
  and assignment_status = 'planned'
  and active is true;

select count(*) as assignment_rows_after_schema_migration
from public.deployment_hardware_assignments;

select
  count(*) filter (where deployment_hardware_key is not null) as planned_hardware_shell_rows,
  count(*) filter (
    where deployment_hardware_key is not null
      and (
        default_workstation_id is not null
        or current_workstation_id is not null
        or agent_id is not null
      )
  ) as planned_hardware_rows_with_operational_bindings
from public.clinical_hardware_devices;

