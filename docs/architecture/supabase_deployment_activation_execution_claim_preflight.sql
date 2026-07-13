-- RC8 Slice 3B activation execution claim preflight.
-- Read-only verification for atomic claim function, session ownership shape, item completeness, indexes, and RLS.

with function_check as (
  select
    p.oid,
    n.nspname as schema_name,
    p.proname as function_name,
    pg_get_function_arguments(p.oid) as arguments,
    pg_get_function_result(p.oid) as result_type,
    p.prosecdef as security_definer,
    p.proconfig as function_config
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'claim_deployment_activation_execution_session'
)
select
  'function_exists_and_signature' as check_name,
  count(*) = 1 as passed,
  jsonb_agg(to_jsonb(function_check)) as details
from function_check;

select
  'function_search_path' as check_name,
  exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'claim_deployment_activation_execution_session'
      and p.proconfig::text like '%search_path=public, pg_temp%'
  ) as passed;

select
  'function_execute_privileges' as check_name,
  jsonb_build_object(
    'public', has_function_privilege('public', 'public.claim_deployment_activation_execution_session(text, uuid, text, uuid, text, text, text, timestamptz, timestamptz, integer, text, text, timestamptz)', 'execute'),
    'anon', has_function_privilege('anon', 'public.claim_deployment_activation_execution_session(text, uuid, text, uuid, text, text, text, timestamptz, timestamptz, integer, text, text, timestamptz)', 'execute'),
    'authenticated', has_function_privilege('authenticated', 'public.claim_deployment_activation_execution_session(text, uuid, text, uuid, text, text, text, timestamptz, timestamptz, integer, text, text, timestamptz)', 'execute'),
    'service_role', has_function_privilege('service_role', 'public.claim_deployment_activation_execution_session(text, uuid, text, uuid, text, text, text, timestamptz, timestamptz, integer, text, text, timestamptz)', 'execute')
  ) as details;

select
  'session_claim_columns_exist' as check_name,
  count(*) filter (
    where column_name in ('execution_owner', 'ownership_token', 'lease_expires_at', 'execution_status', 'started_at', 'completed_at', 'failed_at')
  ) = 7 as passed,
  jsonb_agg(column_name order by column_name) filter (
    where column_name in ('execution_owner', 'ownership_token', 'lease_expires_at', 'execution_status', 'started_at', 'completed_at', 'failed_at')
  ) as details
from information_schema.columns
where table_schema = 'public'
  and table_name = 'deployment_activation_execution_sessions';

select
  'session_ownership_shape_constraint' as check_name,
  exists (
    select 1
    from pg_constraint
    where conrelid = 'public.deployment_activation_execution_sessions'::regclass
      and conname = 'deployment_activation_execution_sessions_ownership_shape_check'
  ) as passed;

select
  'malformed_session_ownership_rows' as check_name,
  count(*) = 0 as passed,
  jsonb_build_object(
    'prepared_with_owner_token_or_lease', count(*) filter (
      where execution_status = 'prepared'
        and (execution_owner is not null or ownership_token is not null or lease_expires_at is not null)
    ),
    'claimed_missing_owner_token_or_lease', count(*) filter (
      where execution_status = 'claimed'
        and (execution_owner is null or ownership_token is null or lease_expires_at is null)
    ),
    'claimed_with_lifecycle_timestamp', count(*) filter (
      where execution_status = 'claimed'
        and (started_at is not null or completed_at is not null or failed_at is not null)
    )
  ) as details
from public.deployment_activation_execution_sessions;

with item_summary as (
  select
    s.id as session_id,
    s.execution_status,
    s.items_requested,
    count(i.id)::integer as item_count,
    count(*) filter (where i.execution_status = 'ready')::integer as ready_count,
    count(*) filter (where i.execution_status = 'pending')::integer as pending_count,
    count(*) filter (where i.execution_status not in ('ready', 'pending'))::integer as invalid_status_count,
    count(*) filter (where i.attempt_count > 0)::integer as attempted_count,
    count(*) filter (where i.started_at is not null or i.completed_at is not null or i.rolled_back_at is not null)::integer as timestamp_count,
    count(*) filter (where i.error_code is not null or i.error_message is not null)::integer as error_count
  from public.deployment_activation_execution_sessions s
  left join public.deployment_activation_execution_items i on i.session_id = s.id
  where s.execution_status in ('prepared', 'claimed')
  group by s.id, s.execution_status, s.items_requested
)
select
  'prepared_or_claimed_item_completeness' as check_name,
  count(*) filter (
    where item_count <> items_requested
      or ready_count + pending_count <> items_requested
      or invalid_status_count <> 0
      or attempted_count <> 0
      or timestamp_count <> 0
      or error_count <> 0
  ) = 0 as passed,
  jsonb_agg(to_jsonb(item_summary)) filter (
    where item_count <> items_requested
      or ready_count + pending_count <> items_requested
      or invalid_status_count <> 0
      or attempted_count <> 0
      or timestamp_count <> 0
      or error_count <> 0
  ) as details
from item_summary;

select
  'duplicate_item_identities' as check_name,
  not exists (
    select 1
    from public.deployment_activation_execution_items
    group by session_id, execution_item_key
    having count(*) > 1
  )
  and not exists (
    select 1
    from public.deployment_activation_execution_items
    group by session_id, plan_item_key
    having count(*) > 1
  )
  and not exists (
    select 1
    from public.deployment_activation_execution_items
    group by session_id, sequence
    having count(*) > 1
  ) as passed;


select
  'claim_function_duplicate_queries_are_qualified' as check_name,
  pg_get_functiondef(
    'public.claim_deployment_activation_execution_session(text,uuid,text,uuid,text,text,text,timestamptz,timestamptz,integer,text,text,timestamptz)'::regprocedure
  ) like '%duplicate_item.session_id = v_session.id%'
  and pg_get_functiondef(
    'public.claim_deployment_activation_execution_session(text,uuid,text,uuid,text,text,text,timestamptz,timestamptz,integer,text,text,timestamptz)'::regprocedure
  ) like '%duplicate_plan_item.session_id = v_session.id%'
  and pg_get_functiondef(
    'public.claim_deployment_activation_execution_session(text,uuid,text,uuid,text,text,text,timestamptz,timestamptz,integer,text,text,timestamptz)'::regprocedure
  ) like '%duplicate_sequence.session_id = v_session.id%'
  and pg_get_functiondef(
    'public.claim_deployment_activation_execution_session(text,uuid,text,uuid,text,text,text,timestamptz,timestamptz,integer,text,text,timestamptz)'::regprocedure
  ) not like '%where session_id = v_session.id%' as passed;

select
  'lease_state_distribution' as check_name,
  jsonb_build_object(
    'unowned_prepared_sessions', count(*) filter (
      where execution_status = 'prepared'
        and execution_owner is null
        and ownership_token is null
        and lease_expires_at is null
    ),
    'actively_claimed_sessions', count(*) filter (
      where execution_status = 'claimed'
        and lease_expires_at > now()
    ),
    'expired_claimed_sessions', count(*) filter (
      where execution_status = 'claimed'
        and lease_expires_at <= now()
    ),
    'malformed_lease_shapes', count(*) filter (
      where (execution_owner is null) <> (ownership_token is null)
        or (execution_owner is null) <> (lease_expires_at is null)
    )
  ) as details
from public.deployment_activation_execution_sessions;

select
  'claim_indexes_exist' as check_name,
  jsonb_object_agg(indexname, true order by indexname) as details
from pg_indexes
where schemaname = 'public'
  and tablename in (
    'deployment_activation_execution_sessions',
    'deployment_activation_execution_items'
  )
  and indexname in (
    'deployment_activation_execution_sessions_claim_lookup_idx',
    'deployment_activation_execution_sessions_lease_idx',
    'deployment_activation_execution_sessions_owner_lease_idx',
    'deployment_activation_execution_items_claim_status_idx'
  );

select
  'rls_enabled' as check_name,
  bool_and(c.relrowsecurity) as passed,
  jsonb_object_agg(c.relname, c.relrowsecurity order by c.relname) as details
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in (
    'deployment_activation_execution_sessions',
    'deployment_activation_execution_items'
  );

select
  'no_anon_or_authenticated_policies' as check_name,
  count(*) = 0 as passed,
  jsonb_agg(to_jsonb(policies)) as details
from pg_policies policies
where schemaname = 'public'
  and tablename in (
    'deployment_activation_execution_sessions',
    'deployment_activation_execution_items'
  )
  and (
    roles::text like '%anon%'
    or roles::text like '%authenticated%'
    or qual = 'true'
    or with_check = 'true'
  );

-- Manual live concurrency verification plan:
-- 1. Choose a dedicated prepared session with complete ready/pending items.
-- 2. Call public.claim_deployment_activation_execution_session(..., p_claim_mode => 'fresh', claimant A, token A).
--    Expected: status = claimed, execution_status = claimed, no started_at, item rows unchanged.
-- 3. Call the function again with p_claim_mode => 'fresh', claimant B, token B.
--    Expected: status = conflict.
-- 4. Call with p_claim_mode => 'same_owner', claimant A, expected token/lease A.
--    Expected: status = already_owned, same token and lease, no lease extension.
-- 5. Verify item attempt_count remains 0 and item timestamps remain null.
-- 6. Test expired reclaim only on a dedicated test session or inside a transaction that can be rolled back.
