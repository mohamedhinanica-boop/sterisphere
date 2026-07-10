-- RC6 Infrastructure Cleanup - deployment table RLS preflight
--
-- Read-only audit for deployment-related public tables. This script does not
-- enable RLS, create policies, insert rows, update rows, delete rows, activate
-- records, or change runtime behavior.

with audited_tables(table_name, intended_access) as (
  values
    ('deployment_runs', 'server_service_role'),
    ('deployment_hardware_assignments', 'server_service_role'),
    ('clinical_hardware_devices', 'mixed_or_deferred'),
    ('clinical_workstations', 'mixed_or_deferred'),
    ('sterilizers', 'mixed_or_deferred'),
    ('providers', 'mixed_or_deferred'),
    ('clinic_settings', 'mixed_or_deferred'),
    ('clinics', 'server_service_role')
)
select
  audited.table_name,
  audited.intended_access,
  to_regclass('public.' || audited.table_name) is not null as table_exists,
  coalesce(cls.relrowsecurity, false) as rls_enabled,
  coalesce(cls.relforcerowsecurity, false) as rls_forced
from audited_tables audited
left join pg_class cls
  on cls.oid = to_regclass('public.' || audited.table_name)
order by audited.table_name;

with audited_tables(table_name) as (
  values
    ('deployment_runs'),
    ('deployment_hardware_assignments'),
    ('clinical_hardware_devices'),
    ('clinical_workstations'),
    ('sterilizers'),
    ('providers'),
    ('clinic_settings'),
    ('clinics')
)
select
  audited.table_name,
  policies.policyname,
  policies.cmd,
  policies.roles,
  policies.qual,
  policies.with_check
from audited_tables audited
left join pg_policies policies
  on policies.schemaname = 'public'
  and policies.tablename = audited.table_name
order by audited.table_name, policies.policyname;

select
  coalesce(assignments.relrowsecurity, false) as deployment_hardware_assignments_rls_enabled,
  coalesce(runs.relrowsecurity, false) as deployment_runs_rls_enabled
from pg_class assignments
cross join pg_class runs
where assignments.oid = to_regclass('public.deployment_hardware_assignments')
  and runs.oid = to_regclass('public.deployment_runs');

with deployment_only_tables(tablename) as (
  values ('deployment_hardware_assignments'), ('deployment_runs')
)
select
  deployment_only_tables.tablename,
  count(policies.policyname) filter (where 'anon' = any(policies.roles)) as anon_policy_count,
  count(policies.policyname) filter (
    where 'authenticated' = any(policies.roles)
      and (
        coalesce(policies.qual, '') in ('true', '(true)')
        or coalesce(policies.with_check, '') in ('true', '(true)')
      )
  ) as broad_authenticated_policy_count
from deployment_only_tables
left join pg_policies policies
  on policies.schemaname = 'public'
  and policies.tablename = deployment_only_tables.tablename
group by deployment_only_tables.tablename
order by deployment_only_tables.tablename;

select
  count(*) as deployment_runs_row_count,
  count(*) filter (where lifecycle_state in ('completed', 'failed', 'blocked', 'cancelled')) as terminal_deployment_run_rows,
  count(*) filter (where clinic_id is not null) as linked_clinic_deployment_run_rows
from public.deployment_runs;
select
  count(*) as deployment_hardware_assignments_row_count,
  count(*) filter (where active = true) as active_assignment_rows,
  count(*) filter (
    where assignment_source = 'setup_draft'
      and assignment_status = 'planned'
      and active = false
  ) as inactive_setup_draft_planned_rows
from public.deployment_hardware_assignments;

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
  count(*) as duplicate_clinic_hardware_key_groups
from (
  select clinic_id, deployment_hardware_key
  from public.deployment_hardware_assignments
  group by clinic_id, deployment_hardware_key
  having count(*) > 1
) duplicates;

select
  count(*) as duplicate_clinic_assignment_key_groups
from (
  select clinic_id, assignment_key
  from public.deployment_hardware_assignments
  group by clinic_id, assignment_key
  having count(*) > 1
) duplicates;
