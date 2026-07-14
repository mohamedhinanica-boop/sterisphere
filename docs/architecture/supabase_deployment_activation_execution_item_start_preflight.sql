-- RC8 Slice 5B activation execution item-start preflight.
-- Read-only checks for the atomic item-start boundary.

with expected_tables(table_name) as (
  values
    ('deployment_activation_execution_sessions'),
    ('deployment_activation_execution_items')
)
select
  'item_start_required_tables_exist' as check_name,
  count(t.table_name) = 2 as passed,
  jsonb_build_object('found_tables', coalesce(jsonb_agg(t.table_name order by t.table_name) filter (where t.table_name is not null), '[]'::jsonb)) as details
from expected_tables expected
left join information_schema.tables t
  on t.table_schema = 'public'
 and t.table_name = expected.table_name;

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
    ('deployment_activation_execution_items', 'dependency_level'),
    ('deployment_activation_execution_items', 'entity_type'),
    ('deployment_activation_execution_items', 'deployment_key'),
    ('deployment_activation_execution_items', 'entity_id'),
    ('deployment_activation_execution_items', 'action'),
    ('deployment_activation_execution_items', 'execution_status'),
    ('deployment_activation_execution_items', 'attempt_count'),
    ('deployment_activation_execution_items', 'started_at'),
    ('deployment_activation_execution_items', 'completed_at'),
    ('deployment_activation_execution_items', 'rolled_back_at'),
    ('deployment_activation_execution_items', 'error_code'),
    ('deployment_activation_execution_items', 'error_message'),
    ('deployment_activation_execution_items', 'dependency_keys'),
    ('deployment_activation_execution_items', 'reversible'),
    ('deployment_activation_execution_items', 'rollback_action'),
    ('deployment_activation_execution_items', 'expected_current_state'),
    ('deployment_activation_execution_items', 'target_state')
)
select
  'item_start_required_columns_exist' as check_name,
  count(c.column_name) = count(*) as passed,
  jsonb_build_object(
    'missing_columns',
    coalesce(jsonb_agg(required.table_name || '.' || required.column_name order by required.table_name, required.column_name) filter (where c.column_name is null), '[]'::jsonb)
  ) as details
from required_columns required
left join information_schema.columns c
  on c.table_schema = 'public'
 and c.table_name = required.table_name
 and c.column_name = required.column_name;

select
  'item_start_function_exists_with_expected_signature' as check_name,
  to_regprocedure('public.start_deployment_activation_execution_item(uuid,text,uuid,text,text,text,timestamptz,uuid,text,text,integer,text,text,text,timestamptz,integer)') is not null as passed,
  jsonb_build_object('signature', 'public.start_deployment_activation_execution_item(uuid,text,uuid,text,text,text,timestamptz,uuid,text,text,integer,text,text,text,timestamptz,integer)') as details;

select
  'item_start_function_search_path_fixed' as check_name,
  coalesce(array_to_string(proc.proconfig, ',') like '%search_path=public, pg_temp%', false) as passed,
  jsonb_build_object('proconfig', proc.proconfig) as details
from pg_proc proc
where proc.oid = to_regprocedure('public.start_deployment_activation_execution_item(uuid,text,uuid,text,text,text,timestamptz,uuid,text,text,integer,text,text,text,timestamptz,integer)');

select
  'item_start_function_execute_grants' as check_name,
  has_function_privilege('service_role', 'public.start_deployment_activation_execution_item(uuid,text,uuid,text,text,text,timestamptz,uuid,text,text,integer,text,text,text,timestamptz,integer)', 'execute')
  and not has_function_privilege('anon', 'public.start_deployment_activation_execution_item(uuid,text,uuid,text,text,text,timestamptz,uuid,text,text,integer,text,text,text,timestamptz,integer)', 'execute')
  and not has_function_privilege('authenticated', 'public.start_deployment_activation_execution_item(uuid,text,uuid,text,text,text,timestamptz,uuid,text,text,integer,text,text,text,timestamptz,integer)', 'execute') as passed,
  jsonb_build_object(
    'service_role_execute', has_function_privilege('service_role', 'public.start_deployment_activation_execution_item(uuid,text,uuid,text,text,text,timestamptz,uuid,text,text,integer,text,text,text,timestamptz,integer)', 'execute'),
    'anon_execute', has_function_privilege('anon', 'public.start_deployment_activation_execution_item(uuid,text,uuid,text,text,text,timestamptz,uuid,text,text,integer,text,text,text,timestamptz,integer)', 'execute'),
    'authenticated_execute', has_function_privilege('authenticated', 'public.start_deployment_activation_execution_item(uuid,text,uuid,text,text,text,timestamptz,uuid,text,text,integer,text,text,text,timestamptz,integer)', 'execute')
  ) as details;

select
  'item_start_tables_no_anon_or_authenticated_policies' as check_name,
  count(*) = 0 as passed,
  coalesce(jsonb_agg(jsonb_build_object('table', schemaname || '.' || tablename, 'policy', policyname, 'roles', roles, 'command', cmd) order by tablename, policyname), '[]'::jsonb) as details
from pg_policies
where schemaname = 'public'
  and tablename in ('deployment_activation_execution_sessions', 'deployment_activation_execution_items')
  and (roles && array['anon', 'authenticated']::name[]);

select
  'item_start_function_column_references_are_qualified' as check_name,
  pg_get_functiondef(proc.oid) not like '%where session_id = v_session.id%'
  and pg_get_functiondef(proc.oid) like '%duplicate_item.session_id = v_session.id%'
  and pg_get_functiondef(proc.oid) like '%duplicate_plan_item.session_id = v_session.id%'
  and pg_get_functiondef(proc.oid) like '%duplicate_sequence.session_id = v_session.id%'
  and pg_get_functiondef(proc.oid) like '%integrity_item.session_id = v_session.id%'
  and pg_get_functiondef(proc.oid) like '%first_ready_item.session_id = v_session.id%'
  and pg_get_functiondef(proc.oid) like '%running_item.session_id = v_session.id%'
  and pg_get_functiondef(proc.oid) like '%dependency_item.session_id = v_session.id%' as passed,
  jsonb_build_object('function', proc.proname) as details
from pg_proc proc
where proc.oid = to_regprocedure('public.start_deployment_activation_execution_item(uuid,text,uuid,text,text,text,timestamptz,uuid,text,text,integer,text,text,text,timestamptz,integer)');

with duplicate_execution_item_keys as (
  select item.session_id, item.execution_item_key, count(*) as duplicate_count
  from public.deployment_activation_execution_items item
  group by item.session_id, item.execution_item_key
  having count(*) > 1
),
duplicate_plan_item_keys as (
  select item.session_id, item.plan_item_key, count(*) as duplicate_count
  from public.deployment_activation_execution_items item
  group by item.session_id, item.plan_item_key
  having count(*) > 1
),
duplicate_sequences as (
  select item.session_id, item.sequence, count(*) as duplicate_count
  from public.deployment_activation_execution_items item
  group by item.session_id, item.sequence
  having count(*) > 1
),
duplicates as (
  select session_id, 'execution_item_key' as duplicate_type, execution_item_key as duplicate_value, duplicate_count from duplicate_execution_item_keys
  union all
  select session_id, 'plan_item_key', plan_item_key, duplicate_count from duplicate_plan_item_keys
  union all
  select session_id, 'sequence', sequence::text, duplicate_count from duplicate_sequences
)
select
  'item_start_no_duplicate_item_identity' as check_name,
  count(*) = 0 as passed,
  coalesce(jsonb_agg(jsonb_build_object('session_id', duplicates.session_id, 'type', duplicates.duplicate_type, 'value', duplicates.duplicate_value, 'count', duplicates.duplicate_count) order by duplicates.session_id, duplicates.duplicate_type), '[]'::jsonb) as details
from duplicates;

select
  'item_start_lifecycle_counts' as check_name,
  true as passed,
  jsonb_object_agg(status_counts.execution_status, status_counts.item_count order by status_counts.execution_status) as details
from (
  select item.execution_status, count(*) as item_count
  from public.deployment_activation_execution_items item
  group by item.execution_status
) status_counts;

select
  'item_start_running_item_counts_per_session' as check_name,
  count(*) = 0 as passed,
  coalesce(jsonb_agg(jsonb_build_object('session_id', running.session_id, 'running_count', running.running_count) order by running.session_id), '[]'::jsonb) as details
from (
  select item.session_id, count(*) as running_count
  from public.deployment_activation_execution_items item
  where item.execution_status = 'running'
  group by item.session_id
  having count(*) > 1
) running;

select
  'item_start_no_unexpected_item_execution_evidence' as check_name,
  count(*) = 0 as passed,
  coalesce(jsonb_agg(jsonb_build_object('item_id', item.id, 'session_id', item.session_id, 'status', item.execution_status, 'attempt_count', item.attempt_count, 'started_at', item.started_at, 'completed_at', item.completed_at, 'rolled_back_at', item.rolled_back_at, 'error_code', item.error_code) order by item.session_id, item.sequence), '[]'::jsonb) as details
from public.deployment_activation_execution_items item
where (item.execution_status in ('ready', 'pending') and (item.attempt_count <> 0 or item.started_at is not null or item.completed_at is not null or item.rolled_back_at is not null or item.error_code is not null or item.error_message is not null))
   or (item.execution_status = 'running' and (item.attempt_count <> 1 or item.started_at is null or item.completed_at is not null or item.rolled_back_at is not null or item.error_code is not null or item.error_message is not null));

select
  'item_start_dependency_keys_are_arrays' as check_name,
  count(*) = 0 as passed,
  coalesce(jsonb_agg(jsonb_build_object('item_id', item.id, 'session_id', item.session_id, 'dependency_keys', item.dependency_keys) order by item.session_id, item.sequence), '[]'::jsonb) as details
from public.deployment_activation_execution_items item
where jsonb_typeof(item.dependency_keys) <> 'array';

select
  'item_start_no_orphan_items' as check_name,
  count(*) = 0 as passed,
  coalesce(jsonb_agg(jsonb_build_object('item_id', item.id, 'session_id', item.session_id) order by item.session_id, item.sequence), '[]'::jsonb) as details
from public.deployment_activation_execution_items item
left join public.deployment_activation_execution_sessions session
  on session.id = item.session_id
where session.id is null;

/*
Manual verification plan for disposable execution evidence only:
1. Pick a dedicated running execution session with one ready item.
2. Call public.start_deployment_activation_execution_item with matching owner/token/lease/item identity.
3. Verify selected item becomes running.
4. Verify attempt_count becomes 1.
5. Verify started_at is set.
6. Verify the session row is unchanged.
7. Verify all other items are unchanged.
8. Call again with the same item and receive already_started.
9. Call with another item and receive blocked or conflict.
10. Perform rollback-safe testing only on disposable execution evidence.
*/