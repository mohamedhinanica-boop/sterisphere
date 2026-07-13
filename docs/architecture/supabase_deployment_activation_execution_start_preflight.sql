-- RC8 Slice 4B activation execution start preflight.
-- Read-only checks for the session-only atomic start boundary.

with expected_tables(table_name) as (
  values
    ('deployment_activation_execution_sessions'),
    ('deployment_activation_execution_items')
)
select
  'start_required_tables_exist' as check_name,
  count(t.table_name) = 2 as passed,
  jsonb_build_object(
    'found_tables', coalesce(jsonb_agg(t.table_name order by t.table_name) filter (where t.table_name is not null), '[]'::jsonb)
  ) as details
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
    ('deployment_activation_execution_sessions', 'execution_owner'),
    ('deployment_activation_execution_sessions', 'ownership_token'),
    ('deployment_activation_execution_sessions', 'lease_expires_at'),
    ('deployment_activation_execution_sessions', 'preparation_status'),
    ('deployment_activation_execution_sessions', 'execution_status'),
    ('deployment_activation_execution_sessions', 'started_at'),
    ('deployment_activation_execution_sessions', 'completed_at'),
    ('deployment_activation_execution_sessions', 'failed_at'),
    ('deployment_activation_execution_sessions', 'items_requested'),
    ('deployment_activation_execution_sessions', 'items_ready'),
    ('deployment_activation_execution_sessions', 'items_pending'),
    ('deployment_activation_execution_sessions', 'items_blocked'),
    ('deployment_activation_execution_items', 'session_id'),
    ('deployment_activation_execution_items', 'execution_item_key'),
    ('deployment_activation_execution_items', 'plan_item_key'),
    ('deployment_activation_execution_items', 'sequence'),
    ('deployment_activation_execution_items', 'dependency_keys'),
    ('deployment_activation_execution_items', 'execution_status'),
    ('deployment_activation_execution_items', 'attempt_count'),
    ('deployment_activation_execution_items', 'error_code'),
    ('deployment_activation_execution_items', 'error_message'),
    ('deployment_activation_execution_items', 'started_at'),
    ('deployment_activation_execution_items', 'completed_at'),
    ('deployment_activation_execution_items', 'rolled_back_at')
)
select
  'start_required_columns_exist' as check_name,
  count(c.column_name) = count(*) as passed,
  jsonb_build_object(
    'missing_columns',
    coalesce(
      jsonb_agg(required.table_name || '.' || required.column_name order by required.table_name, required.column_name)
        filter (where c.column_name is null),
      '[]'::jsonb
    )
  ) as details
from required_columns required
left join information_schema.columns c
  on c.table_schema = 'public'
 and c.table_name = required.table_name
 and c.column_name = required.column_name;

select
  'start_tables_rls_enabled' as check_name,
  bool_and(cls.relrowsecurity) as passed,
  jsonb_object_agg(cls.relname, cls.relrowsecurity order by cls.relname) as details
from pg_class cls
join pg_namespace ns on ns.oid = cls.relnamespace
where ns.nspname = 'public'
  and cls.relname in (
    'deployment_activation_execution_sessions',
    'deployment_activation_execution_items'
  );

select
  'start_tables_no_anon_or_authenticated_policies' as check_name,
  count(*) = 0 as passed,
  coalesce(jsonb_agg(jsonb_build_object(
    'table', schemaname || '.' || tablename,
    'policy', policyname,
    'roles', roles,
    'command', cmd
  ) order by tablename, policyname), '[]'::jsonb) as details
from pg_policies
where schemaname = 'public'
  and tablename in (
    'deployment_activation_execution_sessions',
    'deployment_activation_execution_items'
  )
  and (roles && array['anon', 'authenticated']::name[]);

select
  'start_function_exists_with_expected_signature' as check_name,
  to_regprocedure(
    'public.start_deployment_activation_execution_session(uuid,text,uuid,text,text,text,timestamptz,timestamptz,integer)'
  ) is not null as passed,
  jsonb_build_object(
    'signature',
    'public.start_deployment_activation_execution_session(uuid,text,uuid,text,text,text,timestamptz,timestamptz,integer)'
  ) as details;

select
  'start_function_search_path_fixed' as check_name,
  coalesce(
    array_to_string(proc.proconfig, ',') like '%search_path=public, pg_temp%',
    false
  ) as passed,
  jsonb_build_object('proconfig', proc.proconfig) as details
from pg_proc proc
where proc.oid = to_regprocedure(
  'public.start_deployment_activation_execution_session(uuid,text,uuid,text,text,text,timestamptz,timestamptz,integer)'
);

select
  'start_function_execute_grants' as check_name,
  has_function_privilege(
    'service_role',
    'public.start_deployment_activation_execution_session(uuid,text,uuid,text,text,text,timestamptz,timestamptz,integer)',
    'execute'
  )
  and not has_function_privilege(
    'anon',
    'public.start_deployment_activation_execution_session(uuid,text,uuid,text,text,text,timestamptz,timestamptz,integer)',
    'execute'
  )
  and not has_function_privilege(
    'authenticated',
    'public.start_deployment_activation_execution_session(uuid,text,uuid,text,text,text,timestamptz,timestamptz,integer)',
    'execute'
  ) as passed,
  jsonb_build_object(
    'service_role_execute',
    has_function_privilege(
      'service_role',
      'public.start_deployment_activation_execution_session(uuid,text,uuid,text,text,text,timestamptz,timestamptz,integer)',
      'execute'
    ),
    'anon_execute',
    has_function_privilege(
      'anon',
      'public.start_deployment_activation_execution_session(uuid,text,uuid,text,text,text,timestamptz,timestamptz,integer)',
      'execute'
    ),
    'authenticated_execute',
    has_function_privilege(
      'authenticated',
      'public.start_deployment_activation_execution_session(uuid,text,uuid,text,text,text,timestamptz,timestamptz,integer)',
      'execute'
    )
  ) as details;

select
  'start_function_item_queries_are_qualified' as check_name,
  pg_get_functiondef(proc.oid) not like '%where session_id = v_session.id%'
  and pg_get_functiondef(proc.oid) like '%duplicate_item.session_id = v_session.id%'
  and pg_get_functiondef(proc.oid) like '%duplicate_plan_item.session_id = v_session.id%'
  and pg_get_functiondef(proc.oid) like '%duplicate_sequence.session_id = v_session.id%'
  and pg_get_functiondef(proc.oid) like '%first_item.session_id = v_session.id%'
  and pg_get_functiondef(proc.oid) like '%start_item.session_id = v_session.id%' as passed,
  jsonb_build_object('function', proc.proname) as details
from pg_proc proc
where proc.oid = to_regprocedure(
  'public.start_deployment_activation_execution_session(uuid,text,uuid,text,text,text,timestamptz,timestamptz,integer)'
);

select
  'start_claimed_sessions_have_ownership_and_active_lease' as check_name,
  count(*) = 0 as passed,
  coalesce(jsonb_agg(jsonb_build_object(
    'session_id', start_session.id,
    'execution_key', start_session.execution_key,
    'execution_status', start_session.execution_status,
    'execution_owner_missing', start_session.execution_owner is null,
    'ownership_token_missing', start_session.ownership_token is null,
    'lease_missing', start_session.lease_expires_at is null
  ) order by start_session.created_at), '[]'::jsonb) as details
from public.deployment_activation_execution_sessions start_session
where start_session.execution_status = 'claimed'
  and (
    start_session.execution_owner is null
    or start_session.ownership_token is null
    or start_session.lease_expires_at is null
  );

select
  'start_running_sessions_have_started_at' as check_name,
  count(*) = 0 as passed,
  coalesce(jsonb_agg(jsonb_build_object(
    'session_id', start_session.id,
    'execution_key', start_session.execution_key
  ) order by start_session.created_at), '[]'::jsonb) as details
from public.deployment_activation_execution_sessions start_session
where start_session.execution_status = 'running'
  and start_session.started_at is null;

select
  'start_running_sessions_not_terminal' as check_name,
  count(*) = 0 as passed,
  coalesce(jsonb_agg(jsonb_build_object(
    'session_id', start_session.id,
    'execution_key', start_session.execution_key,
    'completed_at', start_session.completed_at,
    'failed_at', start_session.failed_at
  ) order by start_session.created_at), '[]'::jsonb) as details
from public.deployment_activation_execution_sessions start_session
where start_session.execution_status = 'running'
  and (start_session.completed_at is not null or start_session.failed_at is not null);

select
  'start_items_have_no_execution_evidence_before_execution_stage' as check_name,
  count(*) = 0 as passed,
  coalesce(jsonb_agg(jsonb_build_object(
    'item_id', start_item.id,
    'session_id', start_item.session_id,
    'execution_item_key', start_item.execution_item_key,
    'attempt_count', start_item.attempt_count,
    'started_at', start_item.started_at,
    'completed_at', start_item.completed_at,
    'rolled_back_at', start_item.rolled_back_at,
    'error_code', start_item.error_code
  ) order by start_item.session_id, start_item.sequence), '[]'::jsonb) as details
from public.deployment_activation_execution_items start_item
where start_item.attempt_count > 0
   or start_item.started_at is not null
   or start_item.completed_at is not null
   or start_item.rolled_back_at is not null
   or start_item.error_code is not null
   or start_item.error_message is not null;

select
  'start_items_dependency_keys_are_arrays' as check_name,
  count(*) = 0 as passed,
  coalesce(jsonb_agg(jsonb_build_object(
    'item_id', start_item.id,
    'session_id', start_item.session_id,
    'execution_item_key', start_item.execution_item_key,
    'dependency_keys', start_item.dependency_keys
  ) order by start_item.session_id, start_item.sequence), '[]'::jsonb) as details
from public.deployment_activation_execution_items start_item
where jsonb_typeof(start_item.dependency_keys) <> 'array';

with duplicate_execution_item_keys as (
  select start_item.session_id, start_item.execution_item_key, count(*) as duplicate_count
  from public.deployment_activation_execution_items start_item
  group by start_item.session_id, start_item.execution_item_key
  having count(*) > 1
),
duplicate_plan_item_keys as (
  select start_item.session_id, start_item.plan_item_key, count(*) as duplicate_count
  from public.deployment_activation_execution_items start_item
  group by start_item.session_id, start_item.plan_item_key
  having count(*) > 1
),
duplicate_sequences as (
  select start_item.session_id, start_item.sequence, count(*) as duplicate_count
  from public.deployment_activation_execution_items start_item
  group by start_item.session_id, start_item.sequence
  having count(*) > 1
),
duplicates as (
  select session_id, 'execution_item_key' as duplicate_type, execution_item_key as duplicate_value, duplicate_count
  from duplicate_execution_item_keys
  union all
  select session_id, 'plan_item_key', plan_item_key, duplicate_count
  from duplicate_plan_item_keys
  union all
  select session_id, 'sequence', sequence::text, duplicate_count
  from duplicate_sequences
)
select
  'start_items_have_no_duplicate_identity' as check_name,
  count(*) = 0 as passed,
  coalesce(jsonb_agg(jsonb_build_object(
    'session_id', duplicates.session_id,
    'duplicate_type', duplicates.duplicate_type,
    'duplicate_value', duplicates.duplicate_value,
    'duplicate_count', duplicates.duplicate_count
  ) order by duplicates.session_id, duplicates.duplicate_type), '[]'::jsonb) as details
from duplicates;

select
  'start_session_lifecycle_counts' as check_name,
  true as passed,
  jsonb_object_agg(start_session.execution_status, start_session.session_count order by start_session.execution_status) as details
from (
  select execution_status, count(*) as session_count
  from public.deployment_activation_execution_sessions
  group by execution_status
) start_session;
