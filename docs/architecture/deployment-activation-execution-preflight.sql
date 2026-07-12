-- RC8 Slice 1E activation execution repository preflight.
-- Read-only diagnostics only. Do not run inside a migration.

with required_columns(table_name, column_name) as (
  values
    ('deployment_runs', 'deployment_run_id'),
    ('deployment_runs', 'clinic_id'),
    ('deployment_runs', 'lifecycle_state'),
    ('deployment_runs', 'deployment_status'),
    ('clinics', 'id'),
    ('clinics', 'deployment_status'),
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
    ('clinical_hardware_devices', 'status'),
    ('clinical_hardware_devices', 'agent_id'),
    ('clinical_hardware_devices', 'default_workstation_id'),
    ('clinical_hardware_devices', 'current_workstation_id'),
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
  'required_column' as check_name,
  required_columns.table_name,
  required_columns.column_name,
  case when columns.column_name is null then 'missing' else 'ok' end as status
from required_columns
left join information_schema.columns as columns
  on columns.table_schema = 'public'
 and columns.table_name = required_columns.table_name
 and columns.column_name = required_columns.column_name
order by required_columns.table_name, required_columns.column_name;

select
  'activation_execution_persistence_table' as check_name,
  case
    when to_regclass('public.deployment_activation_executions') is null
      and to_regclass('public.deployment_activation_execution_items') is null
      then 'absent_not_persisted'
    else 'present_read_only_review_required'
  end as status;

select
  'deployment_run_duplicate_identity' as check_name,
  deployment_run_id,
  count(*) as row_count
from public.deployment_runs
where deployment_run_id is not null
group by deployment_run_id
having count(*) > 1
order by deployment_run_id;

select
  'provider_duplicate_same_clinic_key' as check_name,
  clinic_id,
  deployment_provider_key as deployment_key,
  count(*) as row_count
from public.providers
where deployment_provider_key is not null
group by clinic_id, deployment_provider_key
having count(*) > 1
order by clinic_id, deployment_provider_key;

select
  'sterilizer_duplicate_same_clinic_key' as check_name,
  clinic_id,
  deployment_sterilizer_key as deployment_key,
  count(*) as row_count
from public.sterilizers
where deployment_sterilizer_key is not null
group by clinic_id, deployment_sterilizer_key
having count(*) > 1
order by clinic_id, deployment_sterilizer_key;

select
  'workstation_duplicate_same_clinic_key' as check_name,
  clinic_id,
  deployment_workstation_key as deployment_key,
  count(*) as row_count
from public.clinical_workstations
where deployment_workstation_key is not null
group by clinic_id, deployment_workstation_key
having count(*) > 1
order by clinic_id, deployment_workstation_key;

select
  'hardware_duplicate_same_clinic_key' as check_name,
  clinic_id,
  deployment_hardware_key as deployment_key,
  count(*) as row_count
from public.clinical_hardware_devices
where deployment_hardware_key is not null
group by clinic_id, deployment_hardware_key
having count(*) > 1
order by clinic_id, deployment_hardware_key;

select
  'hardware_assignment_duplicate_same_clinic_hardware_key' as check_name,
  clinic_id,
  deployment_hardware_key as deployment_key,
  count(*) as row_count
from public.deployment_hardware_assignments
where deployment_hardware_key is not null
group by clinic_id, deployment_hardware_key
having count(*) > 1
order by clinic_id, deployment_hardware_key;

select
  'hardware_assignment_duplicate_same_clinic_assignment_key' as check_name,
  clinic_id,
  assignment_key,
  count(*) as row_count
from public.deployment_hardware_assignments
where assignment_key is not null
group by clinic_id, assignment_key
having count(*) > 1
order by clinic_id, assignment_key;

select
  'deployment_keyed_rows_with_null_clinic' as check_name,
  source_table,
  count(*) as row_count
from (
  select 'providers' as source_table
  from public.providers
  where deployment_provider_key is not null and clinic_id is null
  union all
  select 'sterilizers'
  from public.sterilizers
  where deployment_sterilizer_key is not null and clinic_id is null
  union all
  select 'clinical_workstations'
  from public.clinical_workstations
  where deployment_workstation_key is not null and clinic_id is null
  union all
  select 'clinical_hardware_devices'
  from public.clinical_hardware_devices
  where deployment_hardware_key is not null and clinic_id is null
  union all
  select 'deployment_hardware_assignments'
  from public.deployment_hardware_assignments
  where deployment_hardware_key is not null and clinic_id is null
) as keyed_rows
group by source_table
order by source_table;

select
  'setup_draft_planned_active_rows' as check_name,
  source_table,
  count(*) as row_count
from (
  select 'sterilizers' as source_table
  from public.sterilizers
  where provisioning_source = 'setup_draft'
    and provisioning_status = 'planned'
    and active is true
  union all
  select 'clinical_workstations'
  from public.clinical_workstations
  where provisioning_source = 'setup_draft'
    and provisioning_status = 'planned'
    and active is true
  union all
  select 'clinical_hardware_devices'
  from public.clinical_hardware_devices
  where provisioning_source = 'setup_draft'
    and provisioning_status = 'planned'
    and active is true
  union all
  select 'deployment_hardware_assignments'
  from public.deployment_hardware_assignments
  where assignment_source = 'setup_draft'
    and assignment_status = 'planned'
    and active is true
) as active_rows
group by source_table
order by source_table;

select
  'provider_placeholder_active_rows' as check_name,
  count(*) as row_count
from public.providers
where provisioning_source = 'setup_draft'
  and provisioning_status = 'placeholder'
  and active is true;

select
  'hardware_operational_binding_distribution' as check_name,
  count(*) filter (where agent_id is not null) as rows_with_agent_id,
  count(*) filter (where default_workstation_id is not null) as rows_with_default_workstation_id,
  count(*) filter (where current_workstation_id is not null) as rows_with_current_workstation_id
from public.clinical_hardware_devices
where deployment_hardware_key is not null;

select
  'hardware_assignment_shape_violations' as check_name,
  count(*) filter (
    where target_type = 'unassigned'
      and target_deployment_key is not null
  ) as unassigned_with_target_key,
  count(*) filter (
    where target_type in ('workstation', 'sterilizer')
      and target_deployment_key is null
  ) as assigned_without_target_key,
  count(*) filter (
    where target_type not in ('workstation', 'sterilizer', 'unassigned')
  ) as unsupported_target_type
from public.deployment_hardware_assignments;

select
  'activation_execution_rollback_capability' as check_name,
  'not_supported_no_execution_or_rollback_tables' as status;
