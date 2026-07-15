-- RC8 Slice 8B read-only preflight for atomic dependency progression.
-- This script verifies the schema/function boundary only. It does not mutate data.

with required_columns(table_name, column_name) as (
  values
    ('deployment_activation_execution_sessions', 'id'),
    ('deployment_activation_execution_sessions', 'clinic_id'),
    ('deployment_activation_execution_sessions', 'deployment_run_key'),
    ('deployment_activation_execution_sessions', 'execution_key'),
    ('deployment_activation_execution_sessions', 'preparation_status'),
    ('deployment_activation_execution_sessions', 'execution_status'),
    ('deployment_activation_execution_sessions', 'execution_owner'),
    ('deployment_activation_execution_sessions', 'ownership_token'),
    ('deployment_activation_execution_sessions', 'lease_expires_at'),
    ('deployment_activation_execution_sessions', 'started_at'),
    ('deployment_activation_execution_sessions', 'completed_at'),
    ('deployment_activation_execution_sessions', 'failed_at'),
    ('deployment_activation_execution_sessions', 'items_requested'),
    ('deployment_activation_execution_items', 'id'),
    ('deployment_activation_execution_items', 'session_id'),
    ('deployment_activation_execution_items', 'execution_item_key'),
    ('deployment_activation_execution_items', 'plan_item_key'),
    ('deployment_activation_execution_items', 'sequence'),
    ('deployment_activation_execution_items', 'entity_type'),
    ('deployment_activation_execution_items', 'entity_id'),
    ('deployment_activation_execution_items', 'action'),
    ('deployment_activation_execution_items', 'execution_status'),
    ('deployment_activation_execution_items', 'attempt_count'),
    ('deployment_activation_execution_items', 'started_at'),
    ('deployment_activation_execution_items', 'completed_at'),
    ('deployment_activation_execution_items', 'rolled_back_at'),
    ('deployment_activation_execution_items', 'error_code'),
    ('deployment_activation_execution_items', 'error_message'),
    ('deployment_activation_execution_items', 'dependency_keys')
)
select
  'required_column' as check_name,
  required_columns.table_name,
  required_columns.column_name,
  (columns.column_name is not null) as passed
from required_columns
left join information_schema.columns columns
  on columns.table_schema = 'public'
 and columns.table_name = required_columns.table_name
 and columns.column_name = required_columns.column_name
order by required_columns.table_name, required_columns.column_name;

select
  'dependency_progression_function_exists' as check_name,
  exists (
    select 1
      from pg_proc proc
      join pg_namespace namespace on namespace.oid = proc.pronamespace
     where namespace.nspname = 'public'
       and proc.proname = 'progress_deployment_activation_execution_dependency'
       and pg_get_function_identity_arguments(proc.oid) = 'p_clinic_id uuid, p_deployment_run_key text, p_session_id uuid, p_execution_key text, p_claimant_id text, p_ownership_token text, p_expected_lease_expires_at timestamp with time zone, p_completed_item_id uuid, p_completed_execution_item_key text, p_completed_plan_item_key text, p_completed_sequence integer, p_completed_started_at timestamp with time zone, p_completed_completed_at timestamp with time zone, p_completed_attempt_count integer, p_next_item_id uuid, p_next_execution_item_key text, p_next_plan_item_key text, p_next_sequence integer, p_next_entity_type text, p_next_entity_id text, p_next_action text, p_expected_next_status text, p_expected_next_attempt_count integer, p_expected_dependency_keys text[], p_progressed_at timestamp with time zone'
  ) as passed;

select
  'dependency_progression_function_privileges' as check_name,
  has_function_privilege('service_role', 'public.progress_deployment_activation_execution_dependency(uuid, text, uuid, text, text, text, timestamptz, uuid, text, text, integer, timestamptz, timestamptz, integer, uuid, text, text, integer, text, text, text, text, integer, text[], timestamptz)', 'execute') as service_role_can_execute,
  has_function_privilege('anon', 'public.progress_deployment_activation_execution_dependency(uuid, text, uuid, text, text, text, timestamptz, uuid, text, text, integer, timestamptz, timestamptz, integer, uuid, text, text, integer, text, text, text, text, integer, text[], timestamptz)', 'execute') as anon_can_execute,
  has_function_privilege('authenticated', 'public.progress_deployment_activation_execution_dependency(uuid, text, uuid, text, text, text, timestamptz, uuid, text, text, integer, timestamptz, timestamptz, integer, uuid, text, text, integer, text, text, text, text, integer, text[], timestamptz)', 'execute') as authenticated_can_execute;

select
  'duplicate_execution_item_keys' as check_name,
  duplicate_item.session_id,
  duplicate_item.execution_item_key,
  count(*) as duplicate_count
from public.deployment_activation_execution_items duplicate_item
group by duplicate_item.session_id, duplicate_item.execution_item_key
having count(*) > 1
order by duplicate_item.session_id, duplicate_item.execution_item_key;

select
  'duplicate_plan_item_keys' as check_name,
  duplicate_item.session_id,
  duplicate_item.plan_item_key,
  count(*) as duplicate_count
from public.deployment_activation_execution_items duplicate_item
group by duplicate_item.session_id, duplicate_item.plan_item_key
having count(*) > 1
order by duplicate_item.session_id, duplicate_item.plan_item_key;

select
  'duplicate_sequences' as check_name,
  duplicate_item.session_id,
  duplicate_item.sequence,
  count(*) as duplicate_count
from public.deployment_activation_execution_items duplicate_item
group by duplicate_item.session_id, duplicate_item.sequence
having count(*) > 1
order by duplicate_item.session_id, duplicate_item.sequence;

select
  'malformed_dependency_keys' as check_name,
  item.id,
  item.session_id,
  item.execution_item_key,
  item.dependency_keys
from public.deployment_activation_execution_items item
where item.dependency_keys is null;

select
  'ready_item_count_per_running_session' as check_name,
  session_row.id as session_id,
  count(item.id) filter (where item.execution_status = 'ready') as ready_item_count,
  count(item.id) filter (where item.execution_status = 'running') as running_item_count
from public.deployment_activation_execution_sessions session_row
join public.deployment_activation_execution_items item
  on item.session_id = session_row.id
where session_row.execution_status = 'running'
group by session_row.id
having count(item.id) filter (where item.execution_status = 'ready') > 1
    or count(item.id) filter (where item.execution_status = 'running') > 0
order by session_row.id;

select
  'pending_items_with_mutation_evidence' as check_name,
  item.id,
  item.session_id,
  item.execution_item_key,
  item.execution_status,
  item.attempt_count,
  item.started_at,
  item.completed_at,
  item.rolled_back_at,
  item.error_code,
  item.error_message
from public.deployment_activation_execution_items item
where item.execution_status in ('pending', 'ready')
  and (
    item.attempt_count <> 0
    or item.started_at is not null
    or item.completed_at is not null
    or item.rolled_back_at is not null
    or item.error_code is not null
    or item.error_message is not null
  )
order by item.session_id, item.sequence, item.execution_item_key;

select
  'succeeded_items_without_completion_evidence' as check_name,
  item.id,
  item.session_id,
  item.execution_item_key,
  item.execution_status,
  item.attempt_count,
  item.started_at,
  item.completed_at
from public.deployment_activation_execution_items item
where item.execution_status = 'succeeded'
  and (
    item.attempt_count <> 1
    or item.started_at is null
    or item.completed_at is null
    or item.completed_at < item.started_at
  )
order by item.session_id, item.sequence, item.execution_item_key;
