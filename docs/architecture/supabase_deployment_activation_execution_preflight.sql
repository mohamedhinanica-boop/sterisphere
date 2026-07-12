-- RC8 Slice 2B activation execution persistence preflight.
-- Read-only diagnostics. Run after applying supabase_deployment_activation_execution.sql.

with required_tables(table_name) as (
  values
    ('clinics'),
    ('deployment_runs'),
    ('deployment_activation_execution_sessions'),
    ('deployment_activation_execution_items')
)
select
  'required_table' as check_name,
  required_tables.table_name,
  case when tables.table_name is null then 'missing' else 'ok' end as status
from required_tables
left join information_schema.tables as tables
  on tables.table_schema = 'public'
 and tables.table_name = required_tables.table_name
order by required_tables.table_name;

with required_columns(table_name, column_name) as (
  values
    ('deployment_runs', 'id'),
    ('deployment_runs', 'deployment_run_id'),
    ('deployment_runs', 'clinic_id'),
    ('deployment_activation_execution_sessions', 'id'),
    ('deployment_activation_execution_sessions', 'clinic_id'),
    ('deployment_activation_execution_sessions', 'deployment_run_record_id'),
    ('deployment_activation_execution_sessions', 'deployment_run_key'),
    ('deployment_activation_execution_sessions', 'execution_key'),
    ('deployment_activation_execution_sessions', 'plan_key'),
    ('deployment_activation_execution_sessions', 'payload_hash'),
    ('deployment_activation_execution_sessions', 'preparation_status'),
    ('deployment_activation_execution_sessions', 'execution_status'),
    ('deployment_activation_execution_sessions', 'execution_owner'),
    ('deployment_activation_execution_sessions', 'ownership_token'),
    ('deployment_activation_execution_sessions', 'lease_expires_at'),
    ('deployment_activation_execution_sessions', 'items_requested'),
    ('deployment_activation_execution_sessions', 'items_ready'),
    ('deployment_activation_execution_sessions', 'items_pending'),
    ('deployment_activation_execution_sessions', 'items_blocked'),
    ('deployment_activation_execution_sessions', 'reversible_items'),
    ('deployment_activation_execution_sessions', 'irreversible_items'),
    ('deployment_activation_execution_sessions', 'blockers'),
    ('deployment_activation_execution_sessions', 'warnings'),
    ('deployment_activation_execution_sessions', 'rollback_boundary'),
    ('deployment_activation_execution_sessions', 'preparation_evidence'),
    ('deployment_activation_execution_sessions', 'execution_metadata'),
    ('deployment_activation_execution_sessions', 'started_at'),
    ('deployment_activation_execution_sessions', 'completed_at'),
    ('deployment_activation_execution_sessions', 'failed_at'),
    ('deployment_activation_execution_sessions', 'created_at'),
    ('deployment_activation_execution_sessions', 'updated_at'),
    ('deployment_activation_execution_items', 'id'),
    ('deployment_activation_execution_items', 'session_id'),
    ('deployment_activation_execution_items', 'clinic_id'),
    ('deployment_activation_execution_items', 'deployment_run_record_id'),
    ('deployment_activation_execution_items', 'deployment_run_key'),
    ('deployment_activation_execution_items', 'execution_key'),
    ('deployment_activation_execution_items', 'execution_item_key'),
    ('deployment_activation_execution_items', 'plan_item_key'),
    ('deployment_activation_execution_items', 'sequence'),
    ('deployment_activation_execution_items', 'dependency_level'),
    ('deployment_activation_execution_items', 'entity_type'),
    ('deployment_activation_execution_items', 'entity_id'),
    ('deployment_activation_execution_items', 'deployment_key'),
    ('deployment_activation_execution_items', 'action'),
    ('deployment_activation_execution_items', 'expected_current_state'),
    ('deployment_activation_execution_items', 'target_state'),
    ('deployment_activation_execution_items', 'dependency_keys'),
    ('deployment_activation_execution_items', 'execution_status'),
    ('deployment_activation_execution_items', 'attempt_count'),
    ('deployment_activation_execution_items', 'reversible'),
    ('deployment_activation_execution_items', 'rollback_action'),
    ('deployment_activation_execution_items', 'rollback_status'),
    ('deployment_activation_execution_items', 'error_code'),
    ('deployment_activation_execution_items', 'error_message'),
    ('deployment_activation_execution_items', 'execution_evidence'),
    ('deployment_activation_execution_items', 'started_at'),
    ('deployment_activation_execution_items', 'completed_at'),
    ('deployment_activation_execution_items', 'rolled_back_at'),
    ('deployment_activation_execution_items', 'created_at'),
    ('deployment_activation_execution_items', 'updated_at')
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
  'identity_decision' as check_name,
  'domain deploymentRunId maps to deployment_run_key text; deployment_run_record_id uuid is the FK to deployment_runs.id' as decision;

select
  'foreign_keys' as check_name,
  conrelid::regclass::text as table_name,
  conname as constraint_name,
  confrelid::regclass::text as references_table
from pg_constraint
where contype = 'f'
  and conrelid in (
    'public.deployment_activation_execution_sessions'::regclass,
    'public.deployment_activation_execution_items'::regclass
  )
order by table_name, constraint_name;

select
  'check_constraints' as check_name,
  conrelid::regclass::text as table_name,
  conname as constraint_name
from pg_constraint
where contype = 'c'
  and conrelid in (
    'public.deployment_activation_execution_sessions'::regclass,
    'public.deployment_activation_execution_items'::regclass
  )
order by table_name, constraint_name;

select
  'indexes' as check_name,
  schemaname,
  tablename,
  indexname,
  indexdef
from pg_indexes
where schemaname = 'public'
  and tablename in (
    'deployment_activation_execution_sessions',
    'deployment_activation_execution_items'
  )
order by tablename, indexname;

select
  'rls_enabled' as check_name,
  relname as table_name,
  relrowsecurity as rls_enabled
from pg_class
where oid in (
  'public.deployment_activation_execution_sessions'::regclass,
  'public.deployment_activation_execution_items'::regclass
)
order by relname;

select
  'policies' as check_name,
  schemaname,
  tablename,
  policyname,
  roles,
  cmd,
  permissive
from pg_policies
where schemaname = 'public'
  and tablename in (
    'deployment_activation_execution_sessions',
    'deployment_activation_execution_items'
  )
order by tablename, policyname;

select
  'anon_or_authenticated_policy_count' as check_name,
  tablename,
  count(*) as policy_count
from pg_policies
where schemaname = 'public'
  and tablename in (
    'deployment_activation_execution_sessions',
    'deployment_activation_execution_items'
  )
  and (roles::text like '%anon%' or roles::text like '%authenticated%')
group by tablename
order by tablename;

select
  'duplicate_session_execution_key' as check_name,
  clinic_id,
  execution_key,
  count(*) as row_count
from public.deployment_activation_execution_sessions
group by clinic_id, execution_key
having count(*) > 1
order by clinic_id, execution_key;

select
  'duplicate_session_deployment_run_record' as check_name,
  clinic_id,
  deployment_run_record_id,
  count(*) as row_count
from public.deployment_activation_execution_sessions
group by clinic_id, deployment_run_record_id
having count(*) > 1
order by clinic_id, deployment_run_record_id;

select
  'invalid_prepared_sessions' as check_name,
  count(*) as row_count
from public.deployment_activation_execution_sessions
where execution_status = 'prepared'
  and (
    preparation_status <> 'ready'
    or execution_owner is not null
    or ownership_token is not null
    or lease_expires_at is not null
    or started_at is not null
    or completed_at is not null
    or failed_at is not null
    or blockers <> 0
    or items_blocked <> 0
  );

select
  'invalid_session_counters' as check_name,
  count(*) as row_count
from public.deployment_activation_execution_sessions
where items_requested < 0
   or items_ready < 0
   or items_pending < 0
   or items_blocked < 0
   or reversible_items < 0
   or irreversible_items < 0
   or blockers < 0
   or warnings < 0
   or items_ready + items_pending + items_blocked <> items_requested
   or reversible_items + irreversible_items <> items_requested;

select
  'duplicate_item_execution_key' as check_name,
  session_id,
  execution_item_key,
  count(*) as row_count
from public.deployment_activation_execution_items
group by session_id, execution_item_key
having count(*) > 1
order by session_id, execution_item_key;

select
  'duplicate_item_plan_key' as check_name,
  session_id,
  plan_item_key,
  count(*) as row_count
from public.deployment_activation_execution_items
group by session_id, plan_item_key
having count(*) > 1
order by session_id, plan_item_key;

select
  'duplicate_item_sequence' as check_name,
  session_id,
  sequence,
  count(*) as row_count
from public.deployment_activation_execution_items
group by session_id, sequence
having count(*) > 1
order by session_id, sequence;

select
  'item_session_identity_mismatch' as check_name,
  count(*) as row_count
from public.deployment_activation_execution_items as item
join public.deployment_activation_execution_sessions as session
  on session.id = item.session_id
where item.clinic_id <> session.clinic_id
   or item.deployment_run_record_id <> session.deployment_run_record_id
   or item.deployment_run_key <> session.deployment_run_key
   or item.execution_key <> session.execution_key;

select
  'invalid_prepared_items' as check_name,
  count(*) as row_count
from public.deployment_activation_execution_items
where execution_status in ('ready', 'pending')
  and (
    attempt_count <> 0
    or started_at is not null
    or completed_at is not null
    or rolled_back_at is not null
    or error_code is not null
    or error_message is not null
  );

select
  'reversible_items_missing_rollback_action' as check_name,
  count(*) as row_count
from public.deployment_activation_execution_items
where reversible is true
  and rollback_action is null;

select
  'malformed_json_shapes' as check_name,
  count(*) filter (where jsonb_typeof(expected_current_state) <> 'object') as malformed_expected_current_state,
  count(*) filter (where jsonb_typeof(target_state) <> 'object') as malformed_target_state,
  count(*) filter (where jsonb_typeof(dependency_keys) <> 'array') as malformed_dependency_keys,
  count(*) filter (where jsonb_typeof(execution_evidence) <> 'object') as malformed_execution_evidence
from public.deployment_activation_execution_items;

select
  'session_count_by_status' as check_name,
  execution_status,
  count(*) as row_count
from public.deployment_activation_execution_sessions
group by execution_status
order by execution_status;

select
  'item_count_by_status' as check_name,
  execution_status,
  count(*) as row_count
from public.deployment_activation_execution_items
group by execution_status
order by execution_status;

select
  'sessions_per_clinic' as check_name,
  clinic_id,
  count(*) as session_count
from public.deployment_activation_execution_sessions
group by clinic_id
order by clinic_id;

select
  'items_per_session' as check_name,
  session_id,
  count(*) as item_count
from public.deployment_activation_execution_items
group by session_id
order by session_id;

select
  'prepared_sessions_without_complete_item_sets' as check_name,
  session.id as session_id,
  session.items_requested,
  count(item.id) as actual_items
from public.deployment_activation_execution_sessions as session
left join public.deployment_activation_execution_items as item
  on item.session_id = session.id
where session.execution_status = 'prepared'
group by session.id, session.items_requested
having count(item.id) <> session.items_requested
order by session.id;

select
  'orphan_items' as check_name,
  count(*) as row_count
from public.deployment_activation_execution_items as item
left join public.deployment_activation_execution_sessions as session
  on session.id = item.session_id
where session.id is null;

select
  'migration_row_counts' as check_name,
  (select count(*) from public.deployment_activation_execution_sessions) as session_count,
  (select count(*) from public.deployment_activation_execution_items) as item_count;
