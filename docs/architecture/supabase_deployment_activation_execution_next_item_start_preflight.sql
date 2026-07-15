-- RC8 Slice 9B read-only preflight for atomic next execution-item start.
-- This script verifies the schema/function/security boundary only. It does not mutate data.

with expected_tables(table_name) as (
  values
    ('deployment_activation_execution_sessions'),
    ('deployment_activation_execution_items')
)
select
  'next_item_start_required_tables_exist' as check_name,
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
    ('deployment_activation_execution_sessions', 'plan_key'),
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
    ('deployment_activation_execution_items', 'dependency_keys'),
    ('deployment_activation_execution_items', 'expected_current_state'),
    ('deployment_activation_execution_items', 'target_state'),
    ('deployment_activation_execution_items', 'reversible'),
    ('deployment_activation_execution_items', 'rollback_action')
)
select
  'next_item_start_required_columns_exist' as check_name,
  count(c.column_name) = count(*) as passed,
  jsonb_build_object('missing_columns', coalesce(jsonb_agg(required.table_name || '.' || required.column_name order by required.table_name, required.column_name) filter (where c.column_name is null), '[]'::jsonb)) as details
from required_columns required
left join information_schema.columns c
  on c.table_schema = 'public'
 and c.table_name = required.table_name
 and c.column_name = required.column_name;

select
  'next_item_start_function_exists_with_expected_signature' as check_name,
  to_regprocedure('public.start_deployment_activation_execution_next_item(uuid,text,uuid,text,text,text,timestamptz,uuid,text,text,integer,text,text,text,integer,text[],timestamptz)') is not null as passed,
  jsonb_build_object('signature', 'public.start_deployment_activation_execution_next_item(uuid,text,uuid,text,text,text,timestamptz,uuid,text,text,integer,text,text,text,integer,text[],timestamptz)') as details;

select
  'next_item_start_function_search_path_fixed' as check_name,
  coalesce(array_to_string(proc.proconfig, ',') like '%search_path=pg_catalog, public%', false) as passed,
  jsonb_build_object('proconfig', proc.proconfig) as details
from pg_proc proc
where proc.oid = to_regprocedure('public.start_deployment_activation_execution_next_item(uuid,text,uuid,text,text,text,timestamptz,uuid,text,text,integer,text,text,text,integer,text[],timestamptz)');

select
  'next_item_start_function_execute_grants' as check_name,
  has_function_privilege('service_role', 'public.start_deployment_activation_execution_next_item(uuid,text,uuid,text,text,text,timestamptz,uuid,text,text,integer,text,text,text,integer,text[],timestamptz)', 'execute')
  and not has_function_privilege('anon', 'public.start_deployment_activation_execution_next_item(uuid,text,uuid,text,text,text,timestamptz,uuid,text,text,integer,text,text,text,integer,text[],timestamptz)', 'execute')
  and not has_function_privilege('authenticated', 'public.start_deployment_activation_execution_next_item(uuid,text,uuid,text,text,text,timestamptz,uuid,text,text,integer,text,text,text,integer,text[],timestamptz)', 'execute') as passed,
  jsonb_build_object(
    'service_role_execute', has_function_privilege('service_role', 'public.start_deployment_activation_execution_next_item(uuid,text,uuid,text,text,text,timestamptz,uuid,text,text,integer,text,text,text,integer,text[],timestamptz)', 'execute'),
    'anon_execute', has_function_privilege('anon', 'public.start_deployment_activation_execution_next_item(uuid,text,uuid,text,text,text,timestamptz,uuid,text,text,integer,text,text,text,integer,text[],timestamptz)', 'execute'),
    'authenticated_execute', has_function_privilege('authenticated', 'public.start_deployment_activation_execution_next_item(uuid,text,uuid,text,text,text,timestamptz,uuid,text,text,integer,text,text,text,integer,text[],timestamptz)', 'execute')
  ) as details;

select
  'next_item_start_no_generic_client_policies_added' as check_name,
  count(*) = 0 as passed,
  coalesce(jsonb_agg(jsonb_build_object('table', schemaname || '.' || tablename, 'policy', policyname, 'roles', roles, 'command', cmd) order by tablename, policyname), '[]'::jsonb) as details
from pg_policies
where schemaname = 'public'
  and tablename in ('deployment_activation_execution_sessions', 'deployment_activation_execution_items')
  and (roles && array['anon', 'authenticated']::name[]);

select
  'next_item_start_dependency_keys_are_json_arrays' as check_name,
  count(*) = 0 as passed,
  coalesce(jsonb_agg(jsonb_build_object('item_id', item.id, 'session_id', item.session_id, 'dependency_keys', item.dependency_keys) order by item.session_id, item.sequence), '[]'::jsonb) as details
from public.deployment_activation_execution_items item
where jsonb_typeof(item.dependency_keys) <> 'array';

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
  select item.session_id, item.sequence::text as identity_value, count(*) as duplicate_count
  from public.deployment_activation_execution_items item
  group by item.session_id, item.sequence
  having count(*) > 1
),
duplicates as (
  select session_id, 'execution_item_key' as duplicate_type, execution_item_key as identity_value, duplicate_count from duplicate_execution_item_keys
  union all
  select session_id, 'plan_item_key', plan_item_key, duplicate_count from duplicate_plan_item_keys
  union all
  select session_id, 'sequence', identity_value, duplicate_count from duplicate_sequences
)
select
  'next_item_start_no_duplicate_item_identity' as check_name,
  count(*) = 0 as passed,
  coalesce(jsonb_agg(jsonb_build_object('session_id', duplicates.session_id, 'type', duplicates.duplicate_type, 'value', duplicates.identity_value, 'count', duplicates.duplicate_count) order by duplicates.session_id, duplicates.duplicate_type), '[]'::jsonb) as details
from duplicates;

select
  'next_item_start_item_count_matches_session' as check_name,
  count(*) = 0 as passed,
  coalesce(jsonb_agg(jsonb_build_object('session_id', session_row.id, 'items_requested', session_row.items_requested, 'actual_items', item_counts.item_count) order by session_row.id), '[]'::jsonb) as details
from public.deployment_activation_execution_sessions session_row
left join (
  select item.session_id, count(*) as item_count
  from public.deployment_activation_execution_items item
  group by item.session_id
) item_counts on item_counts.session_id = session_row.id
where coalesce(item_counts.item_count, 0) <> session_row.items_requested;

select
  'next_item_start_ready_running_ambiguity' as check_name,
  count(*) = 0 as passed,
  coalesce(jsonb_agg(jsonb_build_object('session_id', counts.session_id, 'ready_count', counts.ready_count, 'running_count', counts.running_count) order by counts.session_id), '[]'::jsonb) as details
from (
  select item.session_id,
         count(*) filter (where item.execution_status = 'ready') as ready_count,
         count(*) filter (where item.execution_status = 'running') as running_count
  from public.deployment_activation_execution_items item
  group by item.session_id
) counts
where counts.ready_count > 1
   or counts.running_count > 1
   or (counts.ready_count > 0 and counts.running_count > 0);

select
  'next_item_start_ready_items_are_untouched' as check_name,
  count(*) = 0 as passed,
  coalesce(jsonb_agg(jsonb_build_object('item_id', item.id, 'session_id', item.session_id, 'attempt_count', item.attempt_count, 'started_at', item.started_at, 'completed_at', item.completed_at, 'rolled_back_at', item.rolled_back_at, 'error_code', item.error_code) order by item.session_id, item.sequence), '[]'::jsonb) as details
from public.deployment_activation_execution_items item
where item.execution_status = 'ready'
  and (
    item.attempt_count <> 0
    or item.started_at is not null
    or item.completed_at is not null
    or item.rolled_back_at is not null
    or item.error_code is not null
    or item.error_message is not null
  );

select
  'next_item_start_pending_items_are_untouched' as check_name,
  count(*) = 0 as passed,
  coalesce(jsonb_agg(jsonb_build_object('item_id', item.id, 'session_id', item.session_id, 'attempt_count', item.attempt_count, 'started_at', item.started_at, 'completed_at', item.completed_at, 'rolled_back_at', item.rolled_back_at, 'error_code', item.error_code) order by item.session_id, item.sequence), '[]'::jsonb) as details
from public.deployment_activation_execution_items item
where item.execution_status = 'pending'
  and (
    item.attempt_count <> 0
    or item.started_at is not null
    or item.completed_at is not null
    or item.rolled_back_at is not null
    or item.error_code is not null
    or item.error_message is not null
  );

select
  'next_item_start_succeeded_items_have_completion_evidence' as check_name,
  count(*) = 0 as passed,
  coalesce(jsonb_agg(jsonb_build_object('item_id', item.id, 'session_id', item.session_id, 'attempt_count', item.attempt_count, 'started_at', item.started_at, 'completed_at', item.completed_at) order by item.session_id, item.sequence), '[]'::jsonb) as details
from public.deployment_activation_execution_items item
where item.execution_status = 'succeeded'
  and (
    item.attempt_count <> 1
    or item.started_at is null
    or item.completed_at is null
    or item.completed_at < item.started_at
  );

with next_item_start_function_body as (
  select regexp_replace(pg_get_functiondef(proc.oid), '\s+', ' ', 'g') as function_body
  from pg_proc proc
  where proc.oid = to_regprocedure('public.start_deployment_activation_execution_next_item(uuid,text,uuid,text,text,text,timestamptz,uuid,text,text,integer,text,text,text,integer,text[],timestamptz)')
), mutation_boundary_conditions as (
  select
    function_body ~* 'update\s+public\.deployment_activation_execution_items\s+update_item' as updates_execution_items,
    function_body ~* 'update\s+public\.deployment_activation_execution_items\s+update_item\s+set\s+execution_status\s*=\s*''running''' as writes_running_status,
    function_body ~* 'attempt_count\s*=\s*update_item\.attempt_count\s*\+\s*1' as increments_attempt_once,
    function_body ~* 'started_at\s*=\s*p_proposed_started_at' as writes_started_at,
    function_body ~* 'where\s+update_item\.id\s*=\s*v_item\.id' as constrains_selected_item_id,
    function_body ~* 'and\s+update_item\.session_id\s*=\s*v_session\.id' as constrains_selected_session,
    function_body !~* 'update\s+public\.deployment_activation_execution_sessions\b' as does_not_update_sessions,
    function_body !~* 'update\s+public\.providers\b' as does_not_update_providers,
    function_body !~* 'update\s+public\.clinics\b' as does_not_update_clinics,
    function_body !~* 'update\s+public\.[^;]+set[^;]*lease_expires_at\s*=' as does_not_write_lease,
    function_body !~* 'update\s+public\.[^;]+set[^;]*ownership_token\s*=' as does_not_write_token,
    function_body !~* 'update\s+public\.[^;]+set[^;]*completed_at\s*=' as does_not_write_completed_at,
    function_body !~* 'update\s+public\.[^;]+set[^;]*execution_status\s*=\s*''succeeded''' as does_not_write_succeeded
  from next_item_start_function_body
)
select
  'next_item_start_function_mutation_boundary' as check_name,
  coalesce(
    updates_execution_items
    and writes_running_status
    and increments_attempt_once
    and writes_started_at
    and constrains_selected_item_id
    and constrains_selected_session
    and does_not_update_sessions
    and does_not_update_providers
    and does_not_update_clinics
    and does_not_write_lease
    and does_not_write_token
    and does_not_write_completed_at
    and does_not_write_succeeded,
    false
  ) as passed,
  jsonb_build_object(
    'updates_execution_items', coalesce(updates_execution_items, false),
    'writes_running_status', coalesce(writes_running_status, false),
    'increments_attempt_once', coalesce(increments_attempt_once, false),
    'writes_started_at', coalesce(writes_started_at, false),
    'constrains_selected_item_id', coalesce(constrains_selected_item_id, false),
    'constrains_selected_session', coalesce(constrains_selected_session, false),
    'does_not_update_sessions', coalesce(does_not_update_sessions, false),
    'does_not_update_providers', coalesce(does_not_update_providers, false),
    'does_not_update_clinics', coalesce(does_not_update_clinics, false),
    'does_not_write_lease', coalesce(does_not_write_lease, false),
    'does_not_write_token', coalesce(does_not_write_token, false),
    'does_not_write_completed_at', coalesce(does_not_write_completed_at, false),
    'does_not_write_succeeded', coalesce(does_not_write_succeeded, false)
  ) as details
from mutation_boundary_conditions;
