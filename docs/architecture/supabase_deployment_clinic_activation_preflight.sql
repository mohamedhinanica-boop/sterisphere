-- RC8 Slice 6B clinic activation preflight.
-- Read-only checks for public.activate_deployment_clinic and its supporting schema/data assumptions.

with required_tables(table_name) as (
  values
    ('clinics'),
    ('deployment_runs'),
    ('deployment_activation_execution_sessions'),
    ('deployment_activation_execution_items')
)
select
  'clinic_activation_required_tables_exist' as check_name,
  count(t.table_name) = count(*) as passed,
  jsonb_build_object(
    'missing_tables', coalesce(jsonb_agg(required.table_name order by required.table_name) filter (where t.table_name is null), '[]'::jsonb)
  ) as details
from required_tables required
left join information_schema.tables t
  on t.table_schema = 'public'
 and t.table_name = required.table_name;

with required_columns(table_name, column_name) as (
  values
    ('clinics', 'id'),
    ('clinics', 'deployment_status'),
    ('clinics', 'deployed_at'),
    ('deployment_runs', 'deployment_run_id'),
    ('deployment_runs', 'clinic_id'),
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
    ('deployment_activation_execution_items', 'id'),
    ('deployment_activation_execution_items', 'session_id'),
    ('deployment_activation_execution_items', 'execution_item_key'),
    ('deployment_activation_execution_items', 'plan_item_key'),
    ('deployment_activation_execution_items', 'sequence'),
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
    ('deployment_activation_execution_items', 'expected_current_state'),
    ('deployment_activation_execution_items', 'target_state')
)
select
  'clinic_activation_required_columns_exist' as check_name,
  count(c.column_name) = count(*) as passed,
  jsonb_build_object(
    'missing_columns', coalesce(jsonb_agg(required.table_name || '.' || required.column_name order by required.table_name, required.column_name) filter (where c.column_name is null), '[]'::jsonb)
  ) as details
from required_columns required
left join information_schema.columns c
  on c.table_schema = 'public'
 and c.table_name = required.table_name
 and c.column_name = required.column_name;

select
  'clinic_activation_function_exists_with_expected_signature' as check_name,
  to_regprocedure('public.activate_deployment_clinic(uuid,text,uuid,text,text,text,timestamptz,uuid,text,text,timestamptz,integer,jsonb,jsonb,timestamptz)') is not null as passed,
  jsonb_build_object('signature', 'public.activate_deployment_clinic(uuid,text,uuid,text,text,text,timestamptz,uuid,text,text,timestamptz,integer,jsonb,jsonb,timestamptz)') as details;

select
  'clinic_activation_function_search_path_fixed' as check_name,
  coalesce(array_to_string(proc.proconfig, ',') like '%search_path=public, pg_temp%', false) as passed,
  jsonb_build_object('proconfig', proc.proconfig) as details
from pg_proc proc
where proc.oid = to_regprocedure('public.activate_deployment_clinic(uuid,text,uuid,text,text,text,timestamptz,uuid,text,text,timestamptz,integer,jsonb,jsonb,timestamptz)');

select
  'clinic_activation_function_execute_grants' as check_name,
  has_function_privilege('service_role', 'public.activate_deployment_clinic(uuid,text,uuid,text,text,text,timestamptz,uuid,text,text,timestamptz,integer,jsonb,jsonb,timestamptz)', 'execute')
  and not has_function_privilege('anon', 'public.activate_deployment_clinic(uuid,text,uuid,text,text,text,timestamptz,uuid,text,text,timestamptz,integer,jsonb,jsonb,timestamptz)', 'execute')
  and not has_function_privilege('authenticated', 'public.activate_deployment_clinic(uuid,text,uuid,text,text,text,timestamptz,uuid,text,text,timestamptz,integer,jsonb,jsonb,timestamptz)', 'execute') as passed,
  jsonb_build_object(
    'service_role_execute', has_function_privilege('service_role', 'public.activate_deployment_clinic(uuid,text,uuid,text,text,text,timestamptz,uuid,text,text,timestamptz,integer,jsonb,jsonb,timestamptz)', 'execute'),
    'anon_execute', has_function_privilege('anon', 'public.activate_deployment_clinic(uuid,text,uuid,text,text,text,timestamptz,uuid,text,text,timestamptz,integer,jsonb,jsonb,timestamptz)', 'execute'),
    'authenticated_execute', has_function_privilege('authenticated', 'public.activate_deployment_clinic(uuid,text,uuid,text,text,text,timestamptz,uuid,text,text,timestamptz,integer,jsonb,jsonb,timestamptz)', 'execute')
  ) as details;

select
  'clinic_activation_no_anon_or_authenticated_policies' as check_name,
  count(*) = 0 as passed,
  coalesce(jsonb_agg(jsonb_build_object('table', schemaname || '.' || tablename, 'policy', policyname, 'roles', roles, 'command', cmd) order by tablename, policyname), '[]'::jsonb) as details
from pg_policies
where schemaname = 'public'
  and tablename in ('deployment_activation_execution_sessions', 'deployment_activation_execution_items')
  and (roles && array['anon', 'authenticated']::name[]);

select
  'clinic_activation_function_identifiers_are_qualified' as check_name,
  pg_get_functiondef(proc.oid) not like '%where session_id =%'
  and pg_get_functiondef(proc.oid) not like '%where clinic_id =%'
  and pg_get_functiondef(proc.oid) like '%activation_session.clinic_id = p_clinic_id%'
  and pg_get_functiondef(proc.oid) like '%activation_item.session_id = v_session.id%'
  and pg_get_functiondef(proc.oid) like '%activation_clinic.id = p_clinic_id%'
  and pg_get_functiondef(proc.oid) like '%activation_run.deployment_run_id = p_deployment_run_key%' as passed,
  jsonb_build_object('function', proc.proname) as details
from pg_proc proc
where proc.oid = to_regprocedure('public.activate_deployment_clinic(uuid,text,uuid,text,text,text,timestamptz,uuid,text,text,timestamptz,integer,jsonb,jsonb,timestamptz)');

select
  'clinic_activation_function_does_not_compare_deployment_key_to_clinic_id' as check_name,
  pg_get_functiondef(proc.oid) not like '%v_item.deployment_key is distinct from p_clinic_id::text%'
  and pg_get_functiondef(proc.oid) like '%v_item.entity_id::text is distinct from p_clinic_id::text%' as passed,
  jsonb_build_object(
    'invalid_deployment_key_clinic_id_comparison_present', pg_get_functiondef(proc.oid) like '%v_item.deployment_key is distinct from p_clinic_id::text%',
    'entity_id_clinic_id_comparison_present', pg_get_functiondef(proc.oid) like '%v_item.entity_id::text is distinct from p_clinic_id::text%'
  ) as details
from pg_proc proc
where proc.oid = to_regprocedure('public.activate_deployment_clinic(uuid,text,uuid,text,text,text,timestamptz,uuid,text,text,timestamptz,integer,jsonb,jsonb,timestamptz)');
select
  'clinic_activation_rows_by_deployment_status' as check_name,
  true as passed,
  coalesce(jsonb_object_agg(status_counts.deployment_status, status_counts.clinic_count order by status_counts.deployment_status), '{}'::jsonb) as details
from (
  select clinic.deployment_status, count(*) as clinic_count
  from public.clinics clinic
  group by clinic.deployment_status
) status_counts;

select
  'clinic_activation_active_without_deployed_at' as check_name,
  count(*) = 0 as passed,
  coalesce(jsonb_agg(jsonb_build_object('clinic_id', clinic.id, 'deployment_status', clinic.deployment_status, 'deployed_at', clinic.deployed_at) order by clinic.id), '[]'::jsonb) as details
from public.clinics clinic
where clinic.deployment_status = 'active'
  and clinic.deployed_at is null;

select
  'clinic_activation_deployment_run_link_mismatches' as check_name,
  count(*) = 0 as passed,
  coalesce(jsonb_agg(jsonb_build_object('deployment_run_id', run.deployment_run_id, 'clinic_id', run.clinic_id) order by run.deployment_run_id), '[]'::jsonb) as details
from public.deployment_runs run
where run.clinic_id is not null
  and not exists (
    select 1
    from public.clinics clinic
    where clinic.id = run.clinic_id
  );

select
  'clinic_activation_running_clinic_items_unsafe' as check_name,
  count(*) = 0 as passed,
  coalesce(jsonb_agg(jsonb_build_object(
    'item_id', item.id,
    'session_id', item.session_id,
    'sequence', item.sequence,
    'entity_type', item.entity_type,
    'action', item.action,
    'execution_status', item.execution_status,
    'attempt_count', item.attempt_count,
    'started_at', item.started_at,
    'completed_at', item.completed_at,
    'rolled_back_at', item.rolled_back_at,
    'error_code', item.error_code,
    'dependency_keys', item.dependency_keys,
    'target_state', item.target_state
  ) order by item.session_id, item.sequence), '[]'::jsonb) as details
from public.deployment_activation_execution_items item
where item.sequence = 1
  and item.entity_type = 'clinic'
  and item.action = 'activate'
  and (
    item.execution_status <> 'running'
    or item.attempt_count <> 1
    or item.started_at is null
    or item.completed_at is not null
    or item.rolled_back_at is not null
    or item.error_code is not null
    or item.error_message is not null
    or jsonb_typeof(item.dependency_keys) <> 'array'
    or jsonb_array_length(item.dependency_keys) <> 0
    or item.target_state not in ('{"deploymentStatus":"active"}'::jsonb, '{"deployment_status":"active"}'::jsonb)
  );

with duplicate_clinic_activation_items as (
  select item.session_id, count(*) as item_count
  from public.deployment_activation_execution_items item
  where item.sequence = 1
    and item.entity_type = 'clinic'
    and item.action = 'activate'
  group by item.session_id
  having count(*) > 1
)
select
  'clinic_activation_no_duplicate_sequence_one_clinic_items' as check_name,
  count(*) = 0 as passed,
  coalesce(jsonb_agg(jsonb_build_object('session_id', duplicate.session_id, 'item_count', duplicate.item_count) order by duplicate.session_id), '[]'::jsonb) as details
from duplicate_clinic_activation_items duplicate;

select
  'clinic_activation_exact_target_state_counts' as check_name,
  true as passed,
  jsonb_build_object(
    'camel_target_items', count(*) filter (where item.target_state = '{"deploymentStatus":"active"}'::jsonb),
    'snake_target_items', count(*) filter (where item.target_state = '{"deployment_status":"active"}'::jsonb),
    'other_target_items', count(*) filter (where item.entity_type = 'clinic' and item.action = 'activate' and item.target_state not in ('{"deploymentStatus":"active"}'::jsonb, '{"deployment_status":"active"}'::jsonb))
  ) as details
from public.deployment_activation_execution_items item
where item.entity_type = 'clinic'
  and item.action = 'activate';

/*
Manual verification plan for disposable execution evidence only:
1. Choose a disposable running execution session with the sequence-1 clinic item running.
2. Call public.activate_deployment_clinic with matching owner/token/lease/item and state evidence.
3. Verify only public.clinics.deployment_status and public.clinics.deployed_at changed.
4. Verify public.deployment_activation_execution_sessions is unchanged.
5. Verify public.deployment_activation_execution_items is unchanged and the clinic item remains running.
6. Call again and receive already_activated.
7. Verify deployed_at is not rewritten on reuse.
8. Use rollback-safe disposable evidence only.
*/