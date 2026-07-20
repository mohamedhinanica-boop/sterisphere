-- RC9 Slice 3B1A read-only sterilizer activation and completion verification.

-- RC8 Slice 10B sterilizer shell activation preflight.
-- Read-only checks for schema readiness, function contract, privileges, and mutation boundary.

with required_tables as (
  select 'required_table_deployment_activation_execution_sessions' as check_name, to_regclass('public.deployment_activation_execution_sessions') is not null as passed
  union all select 'required_table_deployment_activation_execution_items', to_regclass('public.deployment_activation_execution_items') is not null
  union all select 'required_table_sterilizers', to_regclass('public.sterilizers') is not null
), required_sterilizer_columns as (
  select 'required_sterilizer_columns' as check_name,
    count(*) filter (where column_name in ('id','clinic_id','deployment_sterilizer_key','provisioning_source','provisioning_status','active','updated_at')) = 7 as passed
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'sterilizers'
), function_contract as (
  select 'exact_rpc_signature_exists' as check_name,
    to_regprocedure('public.activate_deployment_sterilizer_shell(uuid,text,uuid,text,text,text,timestamptz,uuid,text,text,integer,text,text,text,timestamptz,integer,uuid,text,jsonb,jsonb,timestamptz)') is not null as passed
), function_security as (
  select 'function_security_definer_search_path_fixed' as check_name,
    coalesce(p.prosecdef, false)
    and exists (
      select 1
      from unnest(coalesce(p.proconfig, array[]::text[])) cfg
      where cfg = 'search_path=pg_catalog, public'
    ) as passed
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'activate_deployment_sterilizer_shell'
), privileges as (
  select 'service_role_only_execute' as check_name,
    has_function_privilege('service_role', 'public.activate_deployment_sterilizer_shell(uuid,text,uuid,text,text,text,timestamptz,uuid,text,text,integer,text,text,text,timestamptz,integer,uuid,text,jsonb,jsonb,timestamptz)', 'execute')
    and not has_function_privilege('anon', 'public.activate_deployment_sterilizer_shell(uuid,text,uuid,text,text,text,timestamptz,uuid,text,text,integer,text,text,text,timestamptz,integer,uuid,text,jsonb,jsonb,timestamptz)', 'execute')
    and not has_function_privilege('authenticated', 'public.activate_deployment_sterilizer_shell(uuid,text,uuid,text,text,text,timestamptz,uuid,text,text,integer,text,text,text,timestamptz,integer,uuid,text,jsonb,jsonb,timestamptz)', 'execute') as passed
), sterilizer_duplicates as (
  select 'no_duplicate_sterilizer_deployment_identity' as check_name,
    not exists (
      select 1
      from public.sterilizers sterilizer_row
      where sterilizer_row.clinic_id is not null
        and sterilizer_row.deployment_sterilizer_key is not null
      group by sterilizer_row.clinic_id, sterilizer_row.deployment_sterilizer_key
      having count(*) > 1
    ) as passed
), sterilizer_lifecycle_assumptions as (
  select 'sterilizer_lifecycle_status_assumptions' as check_name,
    not exists (
      select 1
      from public.sterilizers sterilizer_row
      where sterilizer_row.deployment_sterilizer_key is not null
        and sterilizer_row.provisioning_source = 'setup_draft'
        and sterilizer_row.provisioning_status not in ('planned', 'active')
    ) as passed
), active_incompatible as (
  select 'no_active_incompatible_sterilizer_shells' as check_name,
    not exists (
      select 1
      from public.sterilizers sterilizer_row
      where sterilizer_row.deployment_sterilizer_key is not null
        and sterilizer_row.active = true
        and (sterilizer_row.provisioning_source is distinct from 'setup_draft' or sterilizer_row.provisioning_status is distinct from 'active')
    ) as passed
), running_item_integrity as (
  select 'running_sterilizer_shell_item_integrity_snapshot' as check_name,
    true as passed,
    jsonb_build_object(
      'runningSterilizerItems', count(*) filter (where item_row.execution_status = 'running' and item_row.entity_type = 'sterilizer_shell'),
      'readyItems', count(*) filter (where item_row.execution_status = 'ready'),
      'runningItems', count(*) filter (where item_row.execution_status = 'running')
    ) as details
  from public.deployment_activation_execution_items item_row
), duplicate_item_identities as (
  select 'no_duplicate_execution_item_identities' as check_name,
    not exists (
      select 1
      from public.deployment_activation_execution_items item_row
      group by item_row.session_id, item_row.execution_item_key
      having count(*) > 1
    )
    and not exists (
      select 1
      from public.deployment_activation_execution_items item_row
      group by item_row.session_id, item_row.plan_item_key
      having count(*) > 1
    )
    and not exists (
      select 1
      from public.deployment_activation_execution_items item_row
      group by item_row.session_id, item_row.sequence
      having count(*) > 1
    ) as passed
), source as (
  select lower(regexp_replace(pg_get_functiondef('public.activate_deployment_sterilizer_shell(uuid,text,uuid,text,text,text,timestamptz,uuid,text,text,integer,text,text,text,timestamptz,integer,uuid,text,jsonb,jsonb,timestamptz)'::regprocedure), '\s+', ' ', 'g')) as body
), source_diagnostics as (
  select
    body ~ '(^|[^a-z_])update\s+public\.sterilizers\s+update_sterilizer([^a-z_]|$)' as updates_sterilizers,
    regexp_count(body, '(^|[^a-z_])update\s+public\.sterilizers\s+update_sterilizer([^a-z_]|$)') = 1 as updates_selected_sterilizer_once,
    body ~ 'where\s+update_sterilizer\.id\s*=\s*v_sterilizer\.id' as constrains_sterilizer_id,
    body ~ 'and\s+update_sterilizer\.clinic_id\s*=\s*p_clinic_id' as constrains_clinic_id,
    body ~ 'and\s+update_sterilizer\.deployment_sterilizer_key\s*=\s*p_expected_sterilizer_key' as constrains_sterilizer_key,
    body ~ 'v_item\.entity_id::text\s+is\s+distinct\s+from\s+p_expected_entity_id' as compares_item_entity_id_to_expected_entity_id,
    body ~ '''entityidmatchessterilizerid'',\s*v_item\.entity_id::text\s+is\s+not\s+distinct\s+from\s+p_sterilizer_id::text' as reports_entity_id_sterilizer_id_diagnostic,
    body !~ 'p_expected_entity_id\s+is\s+distinct\s+from\s+p_expected_sterilizer_key' as does_not_compare_entity_id_to_sterilizer_key,
    body !~ 'v_item\.entity_id::text\s+is\s+distinct\s+from\s*p_expected_sterilizer_key' as does_not_compare_item_entity_id_to_sterilizer_key,
    body ~ 'v_item\.deployment_key\s+is\s+distinct\s+from\s+p_expected_sterilizer_key' as compares_item_deployment_key_to_sterilizer_key,
    body ~ 'v_item_transition_state\s*:=\s*jsonb_build_object\s*\([^;]*''deploymentsterilizerkey''[^;]*''provisioningsource''[^;]*''provisioningstatus''[^;]*''active''' as projects_authoritative_item_transition_state,
    body ~ 'v_item_transition_state\s+is\s+distinct\s+from\s+p_expected_current_state' as compares_projected_item_transition_state,
    body !~ 'v_item\.expected_current_state\s+is\s+distinct\s+from\s+p_expected_current_state' as does_not_compare_unprojected_item_state,
    body ~ 'set\s+active\s*=\s*true' as writes_active_true,
    body ~ 'provisioning_status\s*=\s*''active''' as writes_provisioning_status_active,
    body ~ 'updated_at\s*=\s*p_proposed_activated_at' as writes_updated_at,
    body !~ '(^|[^a-z_])update\s+public\.deployment_activation_execution_items([^a-z_]|$)' as does_not_update_execution_items,
    body !~ '(^|[^a-z_])update\s+public\.deployment_activation_execution_sessions([^a-z_]|$)' as does_not_update_execution_sessions,
    body !~ '(^|[^a-z_])update\s+public\.clinics([^a-z_]|$)' as does_not_update_clinics,
    regexp_count(body, '(^|[^a-z_])update\s+public\.') = 1 as does_not_update_other_tables,
    body !~ '(^|[^a-z_])update\s+[^;]*lease_expires_at\s*=' as does_not_write_lease,
    body !~ '(^|[^a-z_])update\s+[^;]*ownership_token\s*=' as does_not_write_token,
    body !~ '(^|[^a-z_])update\s+public\.deployment_activation_execution_items[^;]*(completed_at\s*=|execution_status\s*=\s*''succeeded'')' as does_not_complete_item,
    body !~ '(^|[^a-z_])update\s+[^;]*(dependency|execution_status\s*=\s*''ready'')' as does_not_progress_dependency,
    body !~ '(^|[^a-z_])insert\s+into([^a-z_]|$)' as does_not_insert,
    body !~ '(^|[^a-z_])delete\s+from([^a-z_]|$)' as does_not_delete
  from source
), source_checks as (
  select 'function_updates_only_sterilizers' as check_name,
    updates_sterilizers
    and updates_selected_sterilizer_once
    and constrains_sterilizer_id
    and constrains_clinic_id
    and constrains_sterilizer_key
    and writes_active_true
    and writes_provisioning_status_active
    and writes_updated_at
    and does_not_update_execution_items
    and does_not_update_execution_sessions
    and does_not_update_clinics
    and does_not_update_other_tables
    and does_not_write_lease
    and does_not_write_token
    and does_not_complete_item
    and does_not_progress_dependency
    and does_not_insert
    and does_not_delete as passed,
    jsonb_build_object(
      'updates_sterilizers', updates_sterilizers,
      'updates_selected_sterilizer_once', updates_selected_sterilizer_once,
      'constrains_sterilizer_id', constrains_sterilizer_id,
      'constrains_clinic_id', constrains_clinic_id,
      'constrains_sterilizer_key', constrains_sterilizer_key,
      'writes_active_true', writes_active_true,
      'writes_provisioning_status_active', writes_provisioning_status_active,
      'writes_updated_at', writes_updated_at,
      'does_not_update_execution_items', does_not_update_execution_items,
      'does_not_update_execution_sessions', does_not_update_execution_sessions,
      'does_not_update_clinics', does_not_update_clinics,
      'does_not_update_other_tables', does_not_update_other_tables,
      'does_not_write_lease', does_not_write_lease,
      'does_not_write_token', does_not_write_token,
      'does_not_complete_item', does_not_complete_item,
      'does_not_progress_dependency', does_not_progress_dependency,
      'compares_item_entity_id_to_expected_entity_id', compares_item_entity_id_to_expected_entity_id,
      'does_not_compare_entity_id_to_sterilizer_key', does_not_compare_entity_id_to_sterilizer_key,
      'does_not_compare_item_entity_id_to_sterilizer_key', does_not_compare_item_entity_id_to_sterilizer_key,
      'compares_item_deployment_key_to_sterilizer_key', compares_item_deployment_key_to_sterilizer_key
    ) as details
  from source_diagnostics
  union all
  select 'function_preserves_sterilizer_uuid_key_identity_contract',
    compares_item_entity_id_to_expected_entity_id
    and reports_entity_id_sterilizer_id_diagnostic
    and does_not_compare_entity_id_to_sterilizer_key
    and does_not_compare_item_entity_id_to_sterilizer_key
    and compares_item_deployment_key_to_sterilizer_key,
    jsonb_build_object(
      'compares_item_entity_id_to_expected_entity_id', compares_item_entity_id_to_expected_entity_id,
      'reports_entity_id_sterilizer_id_diagnostic', reports_entity_id_sterilizer_id_diagnostic,
      'does_not_compare_entity_id_to_sterilizer_key', does_not_compare_entity_id_to_sterilizer_key,
      'does_not_compare_item_entity_id_to_sterilizer_key', does_not_compare_item_entity_id_to_sterilizer_key,
      'compares_item_deployment_key_to_sterilizer_key', compares_item_deployment_key_to_sterilizer_key
    )
  from source_diagnostics
  union all
  select 'function_compares_authoritative_sterilizer_transition_state',
    projects_authoritative_item_transition_state
    and compares_projected_item_transition_state
    and does_not_compare_unprojected_item_state,
    jsonb_build_object(
      'projects_authoritative_item_transition_state', projects_authoritative_item_transition_state,
      'compares_projected_item_transition_state', compares_projected_item_transition_state,
      'does_not_compare_unprojected_item_state', does_not_compare_unprojected_item_state
    )
  from source_diagnostics
  union all
  select 'function_updates_selected_sterilizer_once',
    updates_selected_sterilizer_once
    and constrains_sterilizer_id
    and constrains_clinic_id
    and constrains_sterilizer_key,
    jsonb_build_object(
      'updates_selected_sterilizer_once', updates_selected_sterilizer_once,
      'constrains_sterilizer_id', constrains_sterilizer_id,
      'constrains_clinic_id', constrains_clinic_id,
      'constrains_sterilizer_key', constrains_sterilizer_key
    )
  from source_diagnostics
  union all
  select 'function_writes_supported_target_fields',
    writes_active_true
    and writes_provisioning_status_active
    and writes_updated_at
    and does_not_insert
    and does_not_delete,
    jsonb_build_object(
      'writes_active_true', writes_active_true,
      'writes_provisioning_status_active', writes_provisioning_status_active,
      'writes_updated_at', writes_updated_at,
      'does_not_insert', does_not_insert,
      'does_not_delete', does_not_delete
    )
  from source_diagnostics
)
select check_name, passed, null::jsonb as details from required_tables
union all select check_name, passed, null::jsonb from required_sterilizer_columns
union all select check_name, passed, null::jsonb from function_contract
union all select check_name, passed, null::jsonb from function_security
union all select check_name, passed, null::jsonb from privileges
union all select check_name, passed, null::jsonb from sterilizer_duplicates
union all select check_name, passed, null::jsonb from sterilizer_lifecycle_assumptions
union all select check_name, passed, null::jsonb from active_incompatible
union all select check_name, passed, details from running_item_integrity
union all select check_name, passed, null::jsonb from duplicate_item_identities
union all select check_name, passed, details from source_checks
order by check_name;


-- RC8 Slice 11B read-only preflight for sterilizer-shell execution-item completion.

with required_tables as (
  select 'required_table_execution_sessions' as check_name, to_regclass('public.deployment_activation_execution_sessions') is not null as passed, null::jsonb as details
  union all select 'required_table_execution_items', to_regclass('public.deployment_activation_execution_items') is not null, null::jsonb
  union all select 'required_table_sterilizers', to_regclass('public.sterilizers') is not null, null::jsonb
), required_columns as (
  select 'required_execution_item_columns' as check_name,
    count(*) filter (where column_name in ('id','session_id','execution_item_key','plan_item_key','sequence','entity_type','entity_id','deployment_key','action','execution_status','attempt_count','started_at','completed_at','rolled_back_at','error_code','error_message','expected_current_state','target_state','dependency_keys')) >= 19 as passed,
    null::jsonb as details
  from information_schema.columns
  where table_schema = 'public' and table_name = 'deployment_activation_execution_items'
), function_contract as (
  select 'exact_rpc_signature_exists' as check_name,
    to_regprocedure('public.complete_deployment_sterilizer_shell_execution_item(uuid,text,uuid,text,text,text,timestamptz,uuid,text,text,integer,text,text,text,text,timestamptz,integer,uuid,jsonb,jsonb,timestamptz)') is not null as passed,
    null::jsonb as details
), function_security as (
  select 'function_security_definer_search_path_fixed' as check_name,
    coalesce(p.prosecdef, false)
    and exists (select 1 from unnest(coalesce(p.proconfig, array[]::text[])) cfg where cfg = 'search_path=pg_catalog, public') as passed,
    null::jsonb as details
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'complete_deployment_sterilizer_shell_execution_item'
), privileges as (
  select 'service_role_only_execute' as check_name,
    has_function_privilege('service_role', 'public.complete_deployment_sterilizer_shell_execution_item(uuid,text,uuid,text,text,text,timestamptz,uuid,text,text,integer,text,text,text,text,timestamptz,integer,uuid,jsonb,jsonb,timestamptz)', 'execute')
    and not has_function_privilege('anon', 'public.complete_deployment_sterilizer_shell_execution_item(uuid,text,uuid,text,text,text,timestamptz,uuid,text,text,integer,text,text,text,text,timestamptz,integer,uuid,jsonb,jsonb,timestamptz)', 'execute')
    and not has_function_privilege('authenticated', 'public.complete_deployment_sterilizer_shell_execution_item(uuid,text,uuid,text,text,text,timestamptz,uuid,text,text,integer,text,text,text,text,timestamptz,integer,uuid,jsonb,jsonb,timestamptz)', 'execute') as passed,
    null::jsonb as details
), duplicate_checks as (
  select 'no_duplicate_item_or_sterilizer_identities' as check_name,
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
      select 1 from public.sterilizers sterilizer_row where sterilizer_row.clinic_id is not null and sterilizer_row.deployment_sterilizer_key is not null group by sterilizer_row.clinic_id, sterilizer_row.deployment_sterilizer_key having count(*) > 1
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
  select lower(regexp_replace(pg_get_functiondef('public.complete_deployment_sterilizer_shell_execution_item(uuid,text,uuid,text,text,text,timestamptz,uuid,text,text,integer,text,text,text,text,timestamptz,integer,uuid,jsonb,jsonb,timestamptz)'::regprocedure), '\s+', ' ', 'g')) as body
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
    body !~ 'update\s+public\.sterilizers' as does_not_update_sterilizers,
    body !~ 'update\s+public\.clinics' as does_not_update_clinics,
    update_set_clause !~ 'lease_expires_at\s*=' as does_not_write_lease,
    update_set_clause !~ 'ownership_token\s*=' as does_not_write_token,
    update_set_clause !~ 'dependency_keys\s*=' and update_set_clause !~ 'execution_status\s*=\s*''ready''' as does_not_progress_dependencies,
    update_set_clause !~ 'execution_status\s*=\s*''running''' and update_set_clause !~ 'started_at\s*=' as does_not_start_another_item,
    body !~ '(^|[^a-z_])insert\s+into([^a-z_]|$)' as does_not_insert,
    body !~ '(^|[^a-z_])delete\s+from([^a-z_]|$)' as does_not_delete,
    body ~ 'v_item\.entity_id\s+is\s+distinct\s+from\s+p_expected_entity_id' as compares_sterilizer_uuid_as_text,
    body ~ 'v_sterilizer\.id\s+is\s+distinct\s+from\s+p_sterilizer_id' as compares_sterilizer_uuid_to_sterilizer_id,
    body ~ 'v_sterilizer\.deployment_sterilizer_key\s+is\s+distinct\s+from\s+p_expected_deployment_sterilizer_key' as compares_sterilizer_key_to_key,
    body !~ 'p_sterilizer_id(::text)?\s*=\s*p_expected_deployment_sterilizer_key' as does_not_conflate_uuid_and_key
  from update_parts
), source_checks as (
  select 'function_mutates_only_selected_execution_item' as check_name,
    updates_execution_items and updates_selected_item_alias and updates_only_one_public_table and constrains_item_id and constrains_session_id and constrains_execution_item_key and constrains_plan_item_key and writes_succeeded_status and writes_completed_at and does_not_write_started_at and does_not_increment_attempt_count and does_not_update_sessions and does_not_update_sterilizers and does_not_update_clinics and does_not_write_lease and does_not_write_token and does_not_progress_dependencies and does_not_start_another_item and does_not_insert and does_not_delete as passed,
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
      'does_not_update_sterilizers', does_not_update_sterilizers,
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
  select 'function_preserves_sterilizer_uuid_key_distinction',
    compares_sterilizer_uuid_as_text and compares_sterilizer_uuid_to_sterilizer_id and compares_sterilizer_key_to_key and does_not_conflate_uuid_and_key,
    jsonb_build_object(
      'compares_sterilizer_uuid_as_text', compares_sterilizer_uuid_as_text,
      'compares_sterilizer_uuid_to_sterilizer_id', compares_sterilizer_uuid_to_sterilizer_id,
      'compares_sterilizer_key_to_key', compares_sterilizer_key_to_key,
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
