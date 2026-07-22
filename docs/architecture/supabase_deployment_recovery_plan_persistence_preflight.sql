-- RC10.9B - Read-only recovery-plan persistence preflight and contract harness.
-- Run after applying supabase_deployment_recovery_plan_persistence.sql.
-- This script performs no inserts, updates, deletes, rollback, compensation,
-- binding removal, execution-state change, session recovery, or finalization.

with required_columns(table_name, column_name) as (
  values
    ('deployment_recovery_plans', 'id'),
    ('deployment_recovery_plans', 'clinic_id'),
    ('deployment_recovery_plans', 'deployment_run_key'),
    ('deployment_recovery_plans', 'session_id'),
    ('deployment_recovery_plans', 'execution_key'),
    ('deployment_recovery_plans', 'plan_key'),
    ('deployment_recovery_plans', 'recovery_key'),
    ('deployment_recovery_plans', 'idempotency_key'),
    ('deployment_recovery_plans', 'payload_hash'),
    ('deployment_recovery_plans', 'recovery_status'),
    ('deployment_recovery_plans', 'rollback_required'),
    ('deployment_recovery_plans', 'rollback_executable'),
    ('deployment_recovery_plans', 'sanitized_failure'),
    ('deployment_recovery_plans', 'unsupported_compensations'),
    ('deployment_recovery_plans', 'running_items_to_recover'),
    ('deployment_recovery_plans', 'downstream'),
    ('deployment_recovery_plans', 'evidence'),
    ('deployment_recovery_plan_items', 'recovery_plan_id'),
    ('deployment_recovery_plan_items', 'rollback_item_key'),
    ('deployment_recovery_plan_items', 'source_execution_item_key'),
    ('deployment_recovery_plan_items', 'source_plan_item_key'),
    ('deployment_recovery_plan_items', 'source_sequence'),
    ('deployment_recovery_plan_items', 'rollback_sequence'),
    ('deployment_recovery_plan_items', 'expected_current_state'),
    ('deployment_recovery_plan_items', 'expected_prior_state'),
    ('deployment_recovery_plan_items', 'reversible'),
    ('deployment_recovery_plan_items', 'blocked_reason'),
    ('deployment_recovery_plan_items', 'status'),
    ('deployment_recovery_plan_items', 'evidence')
), column_check as (
  select count(column_row.column_name) = count(*) as passed
  from required_columns required
  left join information_schema.columns column_row
    on column_row.table_schema = 'public'
   and column_row.table_name = required.table_name
   and column_row.column_name = required.column_name
), function_row as (
  select
    function_definition.oid,
    function_definition.prosecdef,
    function_definition.proconfig,
    pg_get_function_result(function_definition.oid) as result_contract,
    pg_get_functiondef(function_definition.oid) as definition
  from pg_proc function_definition
  where function_definition.oid = to_regprocedure(
    'public.persist_deployment_recovery_plan(uuid,text,uuid,text,text,text,text,text,text,boolean,boolean,jsonb,jsonb,jsonb,integer,integer,jsonb,jsonb,jsonb)'
  )
), source as (
  select coalesce((select definition from function_row), '') as definition
), index_names as (
  select indexname
  from pg_indexes
  where schemaname = 'public'
    and tablename in ('deployment_recovery_plans', 'deployment_recovery_plan_items')
), constraint_names as (
  select constraint_name
  from information_schema.table_constraints
  where table_schema = 'public'
    and table_name in ('deployment_recovery_plans', 'deployment_recovery_plan_items')
), checks(check_number, check_name, passed, details) as (
  select 1, 'create_rollback_not_required_parent_zero_items',
    definition ilike '%rollback_not_required_inconsistent%'
      and definition ilike '%v_item_count <> 0%', '{}'::jsonb from source
  union all
  select 2, 'create_rollback_required_executable_reversible_items',
    definition ilike '%executable_rollback_inconsistent%'
      and definition ilike '%v_reversible_count <> v_item_count%', '{}'::jsonb from source
  union all
  select 3, 'create_rollback_required_non_executable_unsupported',
    definition ilike '%non_executable_rollback_unexplained%'
      and definition ilike '%jsonb_array_length(p_unsupported_compensations)%', '{}'::jsonb from source
  union all
  select 4, 'identical_replay_returns_reused',
    definition ilike '%persistence_status := ''reused''%'
      and definition ilike '%v_existing.payload_hash = p_payload_hash%', '{}'::jsonb from source
  union all
  select 5, 'conflicting_payload_replay_returns_conflict',
    definition ilike '%persistence_status := ''conflict''%'
      and definition ilike '%recovery_plan_identity_conflict%', '{}'::jsonb from source
  union all
  select 6, 'duplicate_recovery_key_guarded',
    exists (select 1 from index_names where indexname = 'deployment_recovery_plans_recovery_key_uidx'), '{}'::jsonb
  union all
  select 7, 'duplicate_rollback_item_key_guarded',
    exists (select 1 from index_names where indexname = 'deployment_recovery_plan_items_plan_item_key_uidx'), '{}'::jsonb
  union all
  select 8, 'duplicate_rollback_sequence_guarded',
    exists (select 1 from index_names where indexname = 'deployment_recovery_plan_items_plan_rollback_sequence_uidx'), '{}'::jsonb
  union all
  select 9, 'duplicate_source_execution_item_guarded',
    exists (select 1 from index_names where indexname = 'deployment_recovery_plan_items_plan_source_item_uidx'), '{}'::jsonb
  union all
  select 10, 'foreign_clinic_child_identity_rejected',
    definition ilike '%v_plan_id, p_clinic_id, p_deployment_run_key, p_session_id, p_execution_key%'
      and exists (select 1 from constraint_names where constraint_name = 'deployment_recovery_plan_items_clinic_fk'), '{}'::jsonb from source
  union all
  select 11, 'foreign_run_child_identity_rejected',
    definition ilike '%run_row.deployment_run_id = p_deployment_run_key%'
      and definition ilike '%v_plan_id, p_clinic_id, p_deployment_run_key%', '{}'::jsonb from source
  union all
  select 12, 'foreign_session_child_identity_rejected',
    definition ilike '%session_row.id = p_session_id%'
      and exists (select 1 from constraint_names where constraint_name = 'deployment_recovery_plan_items_session_fk'), '{}'::jsonb from source
  union all
  select 13, 'foreign_execution_child_identity_rejected',
    definition ilike '%session_row.execution_key = p_execution_key%'
      and definition ilike '%p_session_id, p_execution_key%', '{}'::jsonb from source
  union all
  select 14, 'foreign_plan_child_identity_rejected',
    definition ilike '%session_row.plan_key = p_plan_key%'
      and definition ilike '%p_execution_key, p_plan_key%', '{}'::jsonb from source
  union all
  select 15, 'malformed_recovery_status_rejected',
    exists (select 1 from constraint_names where constraint_name = 'deployment_recovery_plans_status_check')
      and definition ilike '%recovery_decision_invalid%', '{}'::jsonb from source
  union all
  select 16, 'malformed_item_status_rejected',
    exists (select 1 from constraint_names where constraint_name = 'deployment_recovery_plan_items_status_check')
      and definition ilike '%then ''planned''%else ''blocked''%', '{}'::jsonb from source
  union all
  select 17, 'negative_counters_rejected',
    exists (select 1 from constraint_names where constraint_name = 'deployment_recovery_plans_counter_check')
      and definition ilike '%recovery_counter_invalid%', '{}'::jsonb from source
  union all
  select 18, 'rollback_not_required_with_items_rejected',
    definition ilike '%p_recovery_status = ''rollback_not_required''%'
      and definition ilike '%v_item_count <> 0%', '{}'::jsonb from source
  union all
  select 19, 'rollback_not_required_required_flag_rejected',
    definition ilike '%p_rollback_required or p_rollback_executable or v_item_count <> 0%', '{}'::jsonb from source
  union all
  select 20, 'rollback_not_required_executable_flag_rejected',
    definition ilike '%rollback_not_required_inconsistent%'
      and exists (select 1 from constraint_names where constraint_name = 'deployment_recovery_plans_decision_shape_check'), '{}'::jsonb from source
  union all
  select 21, 'executable_rollback_without_reversible_item_rejected',
    definition ilike '%v_item_count = 0%'
      and definition ilike '%v_reversible_count <> v_item_count%', '{}'::jsonb from source
  union all
  select 22, 'blocked_decision_executable_rejected',
    definition ilike '%p_recovery_status in (''blocked'', ''not_found'')%'
      and definition ilike '%p_rollback_executable%', '{}'::jsonb from source
  union all
  select 23, 'not_found_decision_executable_or_items_rejected',
    definition ilike '%p_recovery_status = ''not_found'' and v_item_count <> 0%'
      and definition ilike '%terminal_recovery_decision_inconsistent%', '{}'::jsonb from source
  union all
  select 24, 'reused_binding_destructive_item_rejected',
    definition ilike '%expectedPriorState''->''targetId'' <> ''null''::jsonb%'
      and definition ilike '%hardware_binding_rollback_identity_invalid%', '{}'::jsonb from source
  union all
  select 25, 'newly_written_exact_binding_item_accepted',
    definition ilike '%remove_deployment_hardware_binding%'
      and definition ilike '%expectedCurrentState''->>''hardwareId''%'
      and definition ilike '%expectedPriorState''->''targetId''%', '{}'::jsonb from source
  union all
  select 26, 'running_successor_stored_outside_plan_items',
    column_check.passed
      and definition ilike '%p_running_items_to_recover%'
      and definition ilike '%p_rollback_items%', '{}'::jsonb from source cross join column_check
  union all
  select 27, 'parent_and_children_persisted_atomically',
    definition ilike '%insert into public.deployment_recovery_plans%'
      and definition ilike '%insert into public.deployment_recovery_plan_items%'
      and definition ilike '%for v_item in%', '{}'::jsonb from source
  union all
  select 28, 'child_failure_rolls_back_parent_insert',
    definition ilike '%when others then%'
      and definition ilike '%no partial recovery plan was retained%'
      and definition not ilike '%commit%', '{}'::jsonb from source
  union all
  select 29, 'no_execution_session_state_changed',
    definition not ilike '%update public.deployment_activation_execution_sessions%'
      and definition not ilike '%insert into public.deployment_activation_execution_sessions%'
      and definition not ilike '%delete from public.deployment_activation_execution_sessions%', '{}'::jsonb from source
  union all
  select 30, 'no_execution_item_state_changed',
    definition not ilike '%update public.deployment_activation_execution_items%'
      and definition not ilike '%insert into public.deployment_activation_execution_items%'
      and definition not ilike '%delete from public.deployment_activation_execution_items%', '{}'::jsonb from source
  union all
  select 31, 'no_entity_activation_state_changed',
    definition not ilike '%update public.clinics%'
      and definition not ilike '%update public.providers%'
      and definition not ilike '%update public.sterilizers%'
      and definition not ilike '%update public.clinical_workstations%'
      and definition not ilike '%update public.clinical_hardware_devices%', '{}'::jsonb from source
  union all
  select 32, 'no_hardware_binding_removed',
    definition not ilike '%update public.clinical_hardware_devices%'
      and definition not ilike '%delete%hardware_binding%', '{}'::jsonb from source
  union all
  select 33, 'no_deployment_finalization_performed',
    definition not ilike '%update public.deployment_runs%'
      and definition not ilike '%deployment_status =%'
      and definition not ilike '%lifecycle_state =%', '{}'::jsonb from source
  union all
  select 34, 'unsafe_diagnostics_absent',
    definition ilike '%unsafe_recovery_evidence%'
      and definition ilike '%ownershipToken%'
      and definition ilike '%rawException%'
      and definition ilike '%serviceRoleKey%', '{}'::jsonb from source
  union all
  select 35, 'repeated_item_ordering_deterministic',
    definition ilike '%lag((value->>''sourceSequence'')::integer)%'
      and definition ilike '%previous_source_sequence <= source_sequence%'
      and exists (select 1 from index_names where indexname = 'deployment_recovery_plan_items_plan_source_sequence_uidx'), '{}'::jsonb from source
)
select check_number, check_name, passed, details
from checks
order by check_number;

-- Security and exact RPC contract evidence.
with function_row as (
  select
    function_definition.oid,
    function_definition.prosecdef,
    function_definition.proconfig,
    pg_get_function_result(function_definition.oid) as result_contract
  from pg_proc function_definition
  where function_definition.oid = to_regprocedure(
    'public.persist_deployment_recovery_plan(uuid,text,uuid,text,text,text,text,text,text,boolean,boolean,jsonb,jsonb,jsonb,integer,integer,jsonb,jsonb,jsonb)'
  )
)
select
  'recovery_rpc_security_contract' as check_name,
  oid is not null
    and prosecdef
    and proconfig @> array['search_path=pg_catalog, public']
    and result_contract ilike '%persistence_status text%'
    and result_contract ilike '%recovery_plan_id uuid%'
    and has_function_privilege('service_role', oid, 'EXECUTE')
    and not has_function_privilege('anon', oid, 'EXECUTE')
    and not has_function_privilege('authenticated', oid, 'EXECUTE') as passed,
  jsonb_build_object(
    'securityDefiner', prosecdef,
    'configuration', proconfig,
    'result', result_contract,
    'serviceRoleExecute', has_function_privilege('service_role', oid, 'EXECUTE'),
    'anonExecute', has_function_privilege('anon', oid, 'EXECUTE'),
    'authenticatedExecute', has_function_privilege('authenticated', oid, 'EXECUTE')
  ) as details
from function_row;

select
  'recovery_tables_rls_deny_by_default' as check_name,
  bool_and(class_row.relrowsecurity)
    and not exists (
      select 1
      from pg_policies policy_row
      where policy_row.schemaname = 'public'
        and policy_row.tablename in ('deployment_recovery_plans', 'deployment_recovery_plan_items')
        and ('anon' = any(policy_row.roles) or 'authenticated' = any(policy_row.roles) or 'public' = any(policy_row.roles))
    )
    and not has_table_privilege('anon', 'public.deployment_recovery_plans', 'SELECT,INSERT,UPDATE,DELETE')
    and not has_table_privilege('authenticated', 'public.deployment_recovery_plans', 'SELECT,INSERT,UPDATE,DELETE')
    and not has_table_privilege('anon', 'public.deployment_recovery_plan_items', 'SELECT,INSERT,UPDATE,DELETE')
    and not has_table_privilege('authenticated', 'public.deployment_recovery_plan_items', 'SELECT,INSERT,UPDATE,DELETE') as passed,
  jsonb_build_object(
    'tables', jsonb_agg(class_row.relname order by class_row.relname),
    'rlsEnabled', bool_and(class_row.relrowsecurity)
  ) as details
from pg_class class_row
join pg_namespace namespace_row on namespace_row.oid = class_row.relnamespace
where namespace_row.nspname = 'public'
  and class_row.relname in ('deployment_recovery_plans', 'deployment_recovery_plan_items');

-- Existing-row integrity checks. Passing state is no returned rows.
select recovery_plan_id, rollback_item_key, count(*) as duplicate_count
from public.deployment_recovery_plan_items
group by recovery_plan_id, rollback_item_key
having count(*) > 1;

select recovery_plan_id, rollback_sequence, count(*) as duplicate_count
from public.deployment_recovery_plan_items
group by recovery_plan_id, rollback_sequence
having count(*) > 1;

select recovery_plan_id, source_execution_item_key, count(*) as duplicate_count
from public.deployment_recovery_plan_items
group by recovery_plan_id, source_execution_item_key
having count(*) > 1;

select recovery_plan_id, source_sequence, count(*) as duplicate_count
from public.deployment_recovery_plan_items
group by recovery_plan_id, source_sequence
having count(*) > 1;

with ordered as (
  select
    item_row.id,
    item_row.recovery_plan_id,
    item_row.rollback_item_key,
    item_row.rollback_sequence,
    item_row.source_sequence,
    lag(item_row.source_sequence) over (
      partition by item_row.recovery_plan_id
      order by item_row.rollback_sequence
    ) as previous_source_sequence
  from public.deployment_recovery_plan_items item_row
)
select *
from ordered
where previous_source_sequence is not null
  and previous_source_sequence <= source_sequence;
