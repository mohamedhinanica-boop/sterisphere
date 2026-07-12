-- RC7 Slice 1F - Deployment activation readiness live preflight
-- Read-only verification for durable source rows used by
-- SupabaseDeploymentActivationReadinessRepository.
--
-- This script intentionally does not verify assignment target validation or
-- planned assignment resolution evidence because those evidence objects are
-- runtime action results today, not durable rows.

with required_columns(table_name, column_name) as (
  values
    ('deployment_runs', 'deployment_run_id'),
    ('deployment_runs', 'clinic_id'),
    ('deployment_runs', 'lifecycle_state'),
    ('deployment_runs', 'deployment_status'),
    ('clinics', 'id'),
    ('clinic_settings', 'id'),
    ('clinic_settings', 'clinic_id'),
    ('providers', 'id'),
    ('providers', 'clinic_id'),
    ('providers', 'deployment_provider_key'),
    ('providers', 'provisioning_source'),
    ('providers', 'provisioning_status'),
    ('providers', 'active'),
    ('sterilizers', 'id'),
    ('sterilizers', 'clinic_id'),
    ('sterilizers', 'deployment_sterilizer_key'),
    ('sterilizers', 'provisioning_source'),
    ('sterilizers', 'provisioning_status'),
    ('sterilizers', 'active'),
    ('clinical_workstations', 'id'),
    ('clinical_workstations', 'clinic_id'),
    ('clinical_workstations', 'deployment_workstation_key'),
    ('clinical_workstations', 'provisioning_source'),
    ('clinical_workstations', 'provisioning_status'),
    ('clinical_workstations', 'active'),
    ('clinical_hardware_devices', 'id'),
    ('clinical_hardware_devices', 'clinic_id'),
    ('clinical_hardware_devices', 'deployment_hardware_key'),
    ('clinical_hardware_devices', 'provisioning_source'),
    ('clinical_hardware_devices', 'provisioning_status'),
    ('clinical_hardware_devices', 'active'),
    ('clinical_hardware_devices', 'agent_id'),
    ('clinical_hardware_devices', 'default_workstation_id'),
    ('clinical_hardware_devices', 'current_workstation_id'),
    ('clinical_hardware_devices', 'status'),
    ('deployment_hardware_assignments', 'id'),
    ('deployment_hardware_assignments', 'clinic_id'),
    ('deployment_hardware_assignments', 'deployment_hardware_key'),
    ('deployment_hardware_assignments', 'assignment_key'),
    ('deployment_hardware_assignments', 'target_type'),
    ('deployment_hardware_assignments', 'target_deployment_key'),
    ('deployment_hardware_assignments', 'assignment_source'),
    ('deployment_hardware_assignments', 'assignment_status'),
    ('deployment_hardware_assignments', 'active')
)
select
  'required_columns' as check_name,
  required_columns.table_name,
  required_columns.column_name,
  case when columns.column_name is null then 'missing' else 'ok' end as status
from required_columns
left join information_schema.columns columns
  on columns.table_schema = 'public'
 and columns.table_name = required_columns.table_name
 and columns.column_name = required_columns.column_name
order by required_columns.table_name, required_columns.column_name;

select
  'deployment_key_indexes' as check_name,
  schemaname,
  tablename,
  indexname,
  indexdef
from pg_indexes
where schemaname = 'public'
  and tablename in (
    'deployment_runs',
    'providers',
    'sterilizers',
    'clinical_workstations',
    'clinical_hardware_devices',
    'deployment_hardware_assignments'
  )
  and (
    indexdef ilike '%deployment_run_id%' or
    indexdef ilike '%deployment_provider_key%' or
    indexdef ilike '%deployment_sterilizer_key%' or
    indexdef ilike '%deployment_workstation_key%' or
    indexdef ilike '%deployment_hardware_key%' or
    indexdef ilike '%assignment_key%'
  )
order by tablename, indexname;

select 'duplicate_deployment_runs' as check_name, deployment_run_id, count(*) as row_count
from public.deployment_runs
where deployment_run_id is not null
group by deployment_run_id
having count(*) > 1
order by deployment_run_id;

select 'duplicate_provider_keys' as check_name, clinic_id, deployment_provider_key, count(*) as row_count
from public.providers
where clinic_id is not null and deployment_provider_key is not null
group by clinic_id, deployment_provider_key
having count(*) > 1
order by clinic_id, deployment_provider_key;

select 'duplicate_sterilizer_keys' as check_name, clinic_id, deployment_sterilizer_key, count(*) as row_count
from public.sterilizers
where clinic_id is not null and deployment_sterilizer_key is not null
group by clinic_id, deployment_sterilizer_key
having count(*) > 1
order by clinic_id, deployment_sterilizer_key;

select 'duplicate_workstation_keys' as check_name, clinic_id, deployment_workstation_key, count(*) as row_count
from public.clinical_workstations
where clinic_id is not null and deployment_workstation_key is not null
group by clinic_id, deployment_workstation_key
having count(*) > 1
order by clinic_id, deployment_workstation_key;

select 'duplicate_hardware_keys' as check_name, clinic_id, deployment_hardware_key, count(*) as row_count
from public.clinical_hardware_devices
where clinic_id is not null and deployment_hardware_key is not null
group by clinic_id, deployment_hardware_key
having count(*) > 1
order by clinic_id, deployment_hardware_key;

select 'duplicate_assignment_hardware_keys' as check_name, clinic_id, deployment_hardware_key, count(*) as row_count
from public.deployment_hardware_assignments
where clinic_id is not null and deployment_hardware_key is not null
group by clinic_id, deployment_hardware_key
having count(*) > 1
order by clinic_id, deployment_hardware_key;

select 'duplicate_assignment_keys' as check_name, clinic_id, assignment_key, count(*) as row_count
from public.deployment_hardware_assignments
where clinic_id is not null and assignment_key is not null
group by clinic_id, assignment_key
having count(*) > 1
order by clinic_id, assignment_key;

select 'deployment_keyed_rows_without_clinic' as check_name, source_table, row_id, deployment_key
from (
  select 'providers' as source_table, id::text as row_id, deployment_provider_key as deployment_key
  from public.providers
  where clinic_id is null and deployment_provider_key is not null
  union all
  select 'sterilizers' as source_table, id::text as row_id, deployment_sterilizer_key as deployment_key
  from public.sterilizers
  where clinic_id is null and deployment_sterilizer_key is not null
  union all
  select 'clinical_workstations' as source_table, id::text as row_id, deployment_workstation_key as deployment_key
  from public.clinical_workstations
  where clinic_id is null and deployment_workstation_key is not null
  union all
  select 'clinical_hardware_devices' as source_table, id::text as row_id, deployment_hardware_key as deployment_key
  from public.clinical_hardware_devices
  where clinic_id is null and deployment_hardware_key is not null
  union all
  select 'deployment_hardware_assignments' as source_table, id::text as row_id, deployment_hardware_key as deployment_key
  from public.deployment_hardware_assignments
  where clinic_id is null
) rows
order by source_table, deployment_key, row_id;

select 'active_setup_draft_planned_rows' as check_name, source_table, row_id, deployment_key
from (
  select 'sterilizers' as source_table, id::text as row_id, deployment_sterilizer_key as deployment_key
  from public.sterilizers
  where provisioning_source = 'setup_draft'
    and provisioning_status = 'planned'
    and active is true
  union all
  select 'clinical_workstations' as source_table, id::text as row_id, deployment_workstation_key as deployment_key
  from public.clinical_workstations
  where provisioning_source = 'setup_draft'
    and provisioning_status = 'planned'
    and active is true
  union all
  select 'clinical_hardware_devices' as source_table, id::text as row_id, deployment_hardware_key as deployment_key
  from public.clinical_hardware_devices
  where provisioning_source = 'setup_draft'
    and provisioning_status = 'planned'
    and active is true
  union all
  select 'deployment_hardware_assignments' as source_table, id::text as row_id, deployment_hardware_key as deployment_key
  from public.deployment_hardware_assignments
  where assignment_source = 'setup_draft'
    and assignment_status = 'planned'
    and active is true
) rows
order by source_table, deployment_key, row_id;

select 'active_setup_draft_provider_placeholders' as check_name, id, clinic_id, deployment_provider_key
from public.providers
where provisioning_source = 'setup_draft'
  and provisioning_status = 'placeholder'
  and active is true
order by clinic_id, deployment_provider_key, id;

select
  'planned_hardware_with_operational_bindings' as check_name,
  id,
  clinic_id,
  deployment_hardware_key,
  agent_id,
  default_workstation_id,
  current_workstation_id
from public.clinical_hardware_devices
where provisioning_source = 'setup_draft'
  and provisioning_status = 'planned'
  and deployment_hardware_key is not null
  and (
    agent_id is not null or
    default_workstation_id is not null or
    current_workstation_id is not null
  )
order by clinic_id, deployment_hardware_key, id;

select 'malformed_provider_keys' as check_name, id, clinic_id, deployment_provider_key
from public.providers
where deployment_provider_key is not null
  and deployment_provider_key !~ '^provider-[0-9]{3}$'
order by clinic_id, deployment_provider_key, id;

select 'malformed_sterilizer_keys' as check_name, id, clinic_id, deployment_sterilizer_key
from public.sterilizers
where deployment_sterilizer_key is not null
  and deployment_sterilizer_key !~ '^sterilizer-[0-9]{3}$'
order by clinic_id, deployment_sterilizer_key, id;

select 'malformed_workstation_keys' as check_name, id, clinic_id, deployment_workstation_key
from public.clinical_workstations
where deployment_workstation_key is not null
  and deployment_workstation_key !~ '^workstation-[0-9]{3}$'
order by clinic_id, deployment_workstation_key, id;

select 'malformed_hardware_keys' as check_name, id, clinic_id, deployment_hardware_key
from public.clinical_hardware_devices
where deployment_hardware_key is not null
  and deployment_hardware_key !~ '^hardware-[0-9]{3}$'
order by clinic_id, deployment_hardware_key, id;

select
  'assignment_target_shape_violations' as check_name,
  id,
  clinic_id,
  deployment_hardware_key,
  target_type,
  target_deployment_key
from public.deployment_hardware_assignments
where not (
  (target_type = 'unassigned' and target_deployment_key is null) or
  (target_type = 'workstation' and target_deployment_key ~ '^workstation-[0-9]{3}$') or
  (target_type = 'sterilizer' and target_deployment_key ~ '^sterilizer-[0-9]{3}$')
)
order by clinic_id, deployment_hardware_key, id;

select
  'assignment_missing_hardware_shell' as check_name,
  assignments.id,
  assignments.clinic_id,
  assignments.deployment_hardware_key
from public.deployment_hardware_assignments assignments
left join public.clinical_hardware_devices hardware
  on hardware.clinic_id = assignments.clinic_id
 and hardware.deployment_hardware_key = assignments.deployment_hardware_key
 and hardware.provisioning_source = 'setup_draft'
 and hardware.provisioning_status = 'planned'
 and hardware.active is false
where assignments.assignment_source = 'setup_draft'
  and assignments.assignment_status = 'planned'
  and assignments.active is false
  and hardware.id is null
order by assignments.clinic_id, assignments.deployment_hardware_key, assignments.id;

select
  'assignment_missing_workstation_target' as check_name,
  assignments.id,
  assignments.clinic_id,
  assignments.deployment_hardware_key,
  assignments.target_deployment_key
from public.deployment_hardware_assignments assignments
left join public.clinical_workstations workstations
  on workstations.clinic_id = assignments.clinic_id
 and workstations.deployment_workstation_key = assignments.target_deployment_key
 and workstations.provisioning_source = 'setup_draft'
 and workstations.provisioning_status = 'planned'
 and workstations.active is false
where assignments.assignment_source = 'setup_draft'
  and assignments.assignment_status = 'planned'
  and assignments.active is false
  and assignments.target_type = 'workstation'
  and workstations.id is null
order by assignments.clinic_id, assignments.deployment_hardware_key, assignments.id;

select
  'assignment_missing_sterilizer_target' as check_name,
  assignments.id,
  assignments.clinic_id,
  assignments.deployment_hardware_key,
  assignments.target_deployment_key
from public.deployment_hardware_assignments assignments
left join public.sterilizers sterilizers
  on sterilizers.clinic_id = assignments.clinic_id
 and sterilizers.deployment_sterilizer_key = assignments.target_deployment_key
 and sterilizers.provisioning_source = 'setup_draft'
 and sterilizers.provisioning_status = 'planned'
 and sterilizers.active is false
where assignments.assignment_source = 'setup_draft'
  and assignments.assignment_status = 'planned'
  and assignments.active is false
  and assignments.target_type = 'sterilizer'
  and sterilizers.id is null
order by assignments.clinic_id, assignments.deployment_hardware_key, assignments.id;

select
  'durable_activation_readiness_snapshot_counts' as check_name,
  (select count(*) from public.deployment_runs) as deployment_runs,
  (select count(*) from public.clinics) as clinics,
  (select count(*) from public.clinic_settings) as clinic_settings,
  (select count(*) from public.providers where deployment_provider_key is not null) as provider_shells,
  (select count(*) from public.sterilizers where deployment_sterilizer_key is not null) as sterilizer_shells,
  (select count(*) from public.clinical_workstations where deployment_workstation_key is not null) as workstation_shells,
  (select count(*) from public.clinical_hardware_devices where deployment_hardware_key is not null) as hardware_shells,
  (select count(*) from public.deployment_hardware_assignments) as hardware_assignments;
