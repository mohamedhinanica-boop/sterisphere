-- RC8 Slice 11B read-only preflight for provider-shell execution-item completion.

with required_tables as (
  select 'required_table_execution_sessions' as check_name, to_regclass('public.deployment_activation_execution_sessions') is not null as passed, null::jsonb as details
  union all select 'required_table_execution_items', to_regclass('public.deployment_activation_execution_items') is not null, null::jsonb
  union all select 'required_table_providers', to_regclass('public.providers') is not null, null::jsonb
), required_columns as (
  select 'required_execution_item_columns' as check_name,
    count(*) filter (where column_name in ('id','session_id','execution_item_key','plan_item_key','sequence','entity_type','entity_id','deployment_key','action','execution_status','attempt_count','started_at','completed_at','rolled_back_at','error_code','error_message','expected_current_state','target_state','dependency_keys')) >= 19 as passed,
    null::jsonb as details
  from information_schema.columns
  where table_schema = 'public' and table_name = 'deployment_activation_execution_items'
), function_contract as (
  select 'exact_rpc_signature_exists' as check_name,
    to_regprocedure('public.complete_deployment_provider_shell_execution_item(uuid,text,uuid,text,text,text,timestamptz,uuid,text,text,integer,text,text,text,text,timestamptz,integer,uuid,jsonb,jsonb,timestamptz)') is not null as passed,
    null::jsonb as details
), function_security as (
  select 'function_security_definer_search_path_fixed' as check_name,
    coalesce(p.prosecdef, false)
    and exists (select 1 from unnest(coalesce(p.proconfig, array[]::text[])) cfg where cfg = 'search_path=pg_catalog, public') as passed,
    null::jsonb as details
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'complete_deployment_provider_shell_execution_item'
), privileges as (
  select 'service_role_only_execute' as check_name,
    has_function_privilege('service_role', 'public.complete_deployment_provider_shell_execution_item(uuid,text,uuid,text,text,text,timestamptz,uuid,text,text,integer,text,text,text,text,timestamptz,integer,uuid,jsonb,jsonb,timestamptz)', 'execute')
    and not has_function_privilege('anon', 'public.complete_deployment_provider_shell_execution_item(uuid,text,uuid,text,text,text,timestamptz,uuid,text,text,integer,text,text,text,text,timestamptz,integer,uuid,jsonb,jsonb,timestamptz)', 'execute')
    and not has_function_privilege('authenticated', 'public.complete_deployment_provider_shell_execution_item(uuid,text,uuid,text,text,text,timestamptz,uuid,text,text,integer,text,text,text,text,timestamptz,integer,uuid,jsonb,jsonb,timestamptz)', 'execute') as passed,
    null::jsonb as details
), duplicate_checks as (
  select 'no_duplicate_item_or_provider_identities' as check_name,
    not exists (
      select 1 from public.deployment_activation_execution_items item_row group by item_row.session_id, item_row.execution_item_key having count(*) > 1
    )
    and not exists (
      select 1 from public.deployment_activation_execution_items item_row group by item_row.session_id, item_row.plan_item_key having count(*) > 1
    )
    and not exists (
      select 1 from public.deployment_activation_execution_items item_row group by item_row.session_id, item_row.sequence having count(*) > 1
    )
    and not exists (
      select 1 from public.providers provider_row where provider_row.clinic_id is not null and provider_row.deployment_provider_key is not null group by provider_row.clinic_id, provider_row.deployment_provider_key having count(*) > 1
    ) as passed,
    null::jsonb as details
), timestamp_checks as (
  select 'no_invalid_succeeded_item_timestamps' as check_name,
    not exists (
      select 1 from public.deployment_activation_execution_items item_row
      where item_row.execution_status = 'succeeded'
        and (item_row.started_at is null or item_row.completed_at is null or item_row.completed_at < item_row.started_at)
    ) as passed,
    null::jsonb as details
), source as (
  select lower(regexp_replace(pg_get_functiondef('public.complete_deployment_provider_shell_execution_item(uuid,text,uuid,text,text,text,timestamptz,uuid,text,text,integer,text,text,text,text,timestamptz,integer,uuid,jsonb,jsonb,timestamptz)'::regprocedure), '\s+', ' ', 'g')) as body
), update_source as (
  select
    body,
    (regexp_match(body, 'update\s+public\.deployment_activation_execution_items\s+update_item\s+set\s+.+?;'))[1] as update_statement
  from source
), update_parts as (
  select
    body,
    update_statement,
    split_part(split_part(coalesce(update_statement, ''), ' where ', 1), ' set ', 2) as update_set_clause,
    split_part(coalesce(update_statement, ''), ' where ', 2) as update_where_clause
  from update_source
), source_diagnostics as (
  select
    update_statement is not null as updates_execution_items,
    coalesce(update_statement, '') ~ '^update\s+public\.deployment_activation_execution_items\s+update_item\s+set\s+' as updates_selected_item_alias,
    regexp_count(body, 'update\s+public\.') = 1 as updates_only_one_public_table,
    update_where_clause ~ 'update_item\.id\s*=\s*v_item\.id' as constrains_item_id,
    update_where_clause ~ 'update_item\.session_id\s*=\s*v_session\.id' as constrains_session_id,
    update_where_clause ~ 'update_item\.execution_item_key\s*=\s*p_execution_item_key' as constrains_execution_item_key,
    update_where_clause ~ 'update_item\.plan_item_key\s*=\s*p_plan_item_key' as constrains_plan_item_key,
    update_set_clause ~ 'execution_status\s*=\s*''succeeded''' as writes_succeeded_status,
    update_set_clause ~ 'completed_at\s*=\s*p_proposed_completed_at' as writes_completed_at,
    update_set_clause !~ '(^|[^a-z_])started_at\s*=' as does_not_write_started_at,
    update_set_clause !~ '(^|[^a-z_])attempt_count\s*=|attempt_count\s*\+' as does_not_increment_attempt_count,
    body !~ 'update\s+public\.deployment_activation_execution_sessions' as does_not_update_sessions,
    body !~ 'update\s+public\.providers' as does_not_update_providers,
    body !~ 'update\s+public\.clinics' as does_not_update_clinics,
    update_set_clause !~ 'lease_expires_at\s*=' as does_not_write_lease,
    update_set_clause !~ 'ownership_token\s*=' as does_not_write_token,
    update_set_clause !~ 'dependency_keys\s*=' and update_set_clause !~ 'execution_status\s*=\s*''ready''' as does_not_progress_dependencies,
    update_set_clause !~ 'execution_status\s*=\s*''running''' and update_set_clause !~ 'started_at\s*=' as does_not_start_another_item,
    body !~ '(^|[^a-z_])insert\s+into([^a-z_]|$)' as does_not_insert,
    body !~ '(^|[^a-z_])delete\s+from([^a-z_]|$)' as does_not_delete,
    body ~ 'v_item\.entity_id\s+is\s+distinct\s+from\s+p_expected_entity_id' as compares_provider_uuid_as_text,
    body ~ 'v_provider\.id\s+is\s+distinct\s+from\s+p_provider_id' as compares_provider_uuid_to_provider_id,
    body ~ 'v_provider\.deployment_provider_key\s+is\s+distinct\s+from\s+p_expected_deployment_provider_key' as compares_provider_key_to_key,
    body !~ 'p_provider_id(::text)?\s*=\s*p_expected_deployment_provider_key' as does_not_conflate_uuid_and_key
  from update_parts
), source_checks as (
  select 'function_mutates_only_selected_execution_item' as check_name,
    updates_execution_items and updates_selected_item_alias and updates_only_one_public_table and constrains_item_id and constrains_session_id and constrains_execution_item_key and constrains_plan_item_key and writes_succeeded_status and writes_completed_at and does_not_write_started_at and does_not_increment_attempt_count and does_not_update_sessions and does_not_update_providers and does_not_update_clinics and does_not_write_lease and does_not_write_token and does_not_progress_dependencies and does_not_start_another_item and does_not_insert and does_not_delete as passed,
    jsonb_build_object(
      'updates_execution_items', updates_execution_items,
      'updates_selected_item_alias', updates_selected_item_alias,
      'constrains_item_id', constrains_item_id,
      'constrains_session_id', constrains_session_id,
      'constrains_execution_item_key', constrains_execution_item_key,
      'constrains_plan_item_key', constrains_plan_item_key,
      'writes_succeeded_status', writes_succeeded_status,
      'writes_completed_at', writes_completed_at,
      'does_not_write_started_at', does_not_write_started_at,
      'does_not_increment_attempt_count', does_not_increment_attempt_count,
      'does_not_update_sessions', does_not_update_sessions,
      'does_not_update_providers', does_not_update_providers,
      'does_not_update_clinics', does_not_update_clinics,
      'does_not_write_lease', does_not_write_lease,
      'does_not_write_token', does_not_write_token,
      'does_not_progress_dependencies', does_not_progress_dependencies,
      'does_not_start_another_item', does_not_start_another_item,
      'does_not_insert', does_not_insert,
      'does_not_delete', does_not_delete
    ) as details
  from source_diagnostics
  union all
  select 'function_preserves_provider_uuid_key_distinction',
    compares_provider_uuid_as_text and compares_provider_uuid_to_provider_id and compares_provider_key_to_key and does_not_conflate_uuid_and_key,
    jsonb_build_object(
      'compares_provider_uuid_as_text', compares_provider_uuid_as_text,
      'compares_provider_uuid_to_provider_id', compares_provider_uuid_to_provider_id,
      'compares_provider_key_to_key', compares_provider_key_to_key,
      'does_not_conflate_uuid_and_key', does_not_conflate_uuid_and_key
    )
  from source_diagnostics
)
select * from required_tables
union all select * from required_columns
union all select * from function_contract
union all select * from function_security
union all select * from privileges
union all select * from duplicate_checks
union all select * from timestamp_checks
union all select * from source_checks
order by check_name;
