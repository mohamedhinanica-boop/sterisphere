-- RC8 Slice 10B provider shell activation preflight.
-- Read-only checks for schema readiness, function contract, privileges, and mutation boundary.

with required_tables as (
  select 'required_table_deployment_activation_execution_sessions' as check_name, to_regclass('public.deployment_activation_execution_sessions') is not null as passed
  union all select 'required_table_deployment_activation_execution_items', to_regclass('public.deployment_activation_execution_items') is not null
  union all select 'required_table_providers', to_regclass('public.providers') is not null
), required_provider_columns as (
  select 'required_provider_columns' as check_name,
    count(*) filter (where column_name in ('id','clinic_id','deployment_provider_key','provisioning_source','provisioning_status','active','updated_at')) = 7 as passed
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'providers'
), function_contract as (
  select 'exact_rpc_signature_exists' as check_name,
    to_regprocedure('public.activate_deployment_provider_shell(uuid,text,uuid,text,text,text,timestamptz,uuid,text,text,integer,text,text,text,timestamptz,integer,uuid,text,jsonb,jsonb,timestamptz)') is not null as passed
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
    and p.proname = 'activate_deployment_provider_shell'
), privileges as (
  select 'service_role_only_execute' as check_name,
    has_function_privilege('service_role', 'public.activate_deployment_provider_shell(uuid,text,uuid,text,text,text,timestamptz,uuid,text,text,integer,text,text,text,timestamptz,integer,uuid,text,jsonb,jsonb,timestamptz)', 'execute')
    and not has_function_privilege('anon', 'public.activate_deployment_provider_shell(uuid,text,uuid,text,text,text,timestamptz,uuid,text,text,integer,text,text,text,timestamptz,integer,uuid,text,jsonb,jsonb,timestamptz)', 'execute')
    and not has_function_privilege('authenticated', 'public.activate_deployment_provider_shell(uuid,text,uuid,text,text,text,timestamptz,uuid,text,text,integer,text,text,text,timestamptz,integer,uuid,text,jsonb,jsonb,timestamptz)', 'execute') as passed
), provider_duplicates as (
  select 'no_duplicate_provider_deployment_identity' as check_name,
    not exists (
      select 1
      from public.providers provider_row
      where provider_row.clinic_id is not null
        and provider_row.deployment_provider_key is not null
      group by provider_row.clinic_id, provider_row.deployment_provider_key
      having count(*) > 1
    ) as passed
), provider_lifecycle_assumptions as (
  select 'provider_lifecycle_status_assumptions' as check_name,
    not exists (
      select 1
      from public.providers provider_row
      where provider_row.deployment_provider_key is not null
        and provider_row.provisioning_source = 'setup_draft'
        and provider_row.provisioning_status not in ('placeholder', 'planned', 'active')
    ) as passed
), active_incompatible as (
  select 'no_active_incompatible_provider_shells' as check_name,
    not exists (
      select 1
      from public.providers provider_row
      where provider_row.deployment_provider_key is not null
        and provider_row.active = true
        and (provider_row.provisioning_source is distinct from 'setup_draft' or provider_row.provisioning_status is distinct from 'active')
    ) as passed
), running_item_integrity as (
  select 'running_provider_shell_item_integrity_snapshot' as check_name,
    true as passed,
    jsonb_build_object(
      'runningProviderItems', count(*) filter (where item_row.execution_status = 'running' and item_row.entity_type = 'provider_shell'),
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
  select lower(regexp_replace(pg_get_functiondef('public.activate_deployment_provider_shell(uuid,text,uuid,text,text,text,timestamptz,uuid,text,text,integer,text,text,text,timestamptz,integer,uuid,text,jsonb,jsonb,timestamptz)'::regprocedure), '\s+', ' ', 'g')) as body
), source_diagnostics as (
  select
    body ~ '(^|[^a-z_])update\s+public\.providers\s+update_provider([^a-z_]|$)' as updates_providers,
    regexp_count(body, '(^|[^a-z_])update\s+public\.providers\s+update_provider([^a-z_]|$)') = 1 as updates_selected_provider_once,
    body ~ 'where\s+update_provider\.id\s*=\s*v_provider\.id' as constrains_provider_id,
    body ~ 'and\s+update_provider\.clinic_id\s*=\s*p_clinic_id' as constrains_clinic_id,
    body ~ 'and\s+update_provider\.deployment_provider_key\s*=\s*p_expected_provider_key' as constrains_provider_key,
    body ~ 'v_item\.entity_id::text\s+is\s+distinct\s+from\s+p_expected_entity_id' as compares_item_entity_id_to_expected_entity_id,
    body ~ '''entityidmatchesproviderid'',\s*v_item\.entity_id::text\s+is\s+not\s+distinct\s+from\s+p_provider_id::text' as reports_entity_id_provider_id_diagnostic,
    body !~ 'p_expected_entity_id\s+is\s+distinct\s+from\s+p_expected_provider_key' as does_not_compare_entity_id_to_provider_key,
    body !~ 'v_item\.entity_id::text\s+is\s+distinct\s+from\s*p_expected_provider_key' as does_not_compare_item_entity_id_to_provider_key,
    body !~ 'v_item\.deployment_key[^;]*(p_provider_id|p_expected_provider_key)' as does_not_compare_item_deployment_key_to_provider_identity,
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
  select 'function_updates_only_providers' as check_name,
    updates_providers
    and updates_selected_provider_once
    and constrains_provider_id
    and constrains_clinic_id
    and constrains_provider_key
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
      'updates_providers', updates_providers,
      'updates_selected_provider_once', updates_selected_provider_once,
      'constrains_provider_id', constrains_provider_id,
      'constrains_clinic_id', constrains_clinic_id,
      'constrains_provider_key', constrains_provider_key,
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
      'does_not_compare_entity_id_to_provider_key', does_not_compare_entity_id_to_provider_key,
      'does_not_compare_item_entity_id_to_provider_key', does_not_compare_item_entity_id_to_provider_key,
      'does_not_compare_item_deployment_key_to_provider_identity', does_not_compare_item_deployment_key_to_provider_identity
    ) as details
  from source_diagnostics
  union all
  select 'function_preserves_provider_uuid_key_identity_contract',
    compares_item_entity_id_to_expected_entity_id
    and reports_entity_id_provider_id_diagnostic
    and does_not_compare_entity_id_to_provider_key
    and does_not_compare_item_entity_id_to_provider_key
    and does_not_compare_item_deployment_key_to_provider_identity,
    jsonb_build_object(
      'compares_item_entity_id_to_expected_entity_id', compares_item_entity_id_to_expected_entity_id,
      'reports_entity_id_provider_id_diagnostic', reports_entity_id_provider_id_diagnostic,
      'does_not_compare_entity_id_to_provider_key', does_not_compare_entity_id_to_provider_key,
      'does_not_compare_item_entity_id_to_provider_key', does_not_compare_item_entity_id_to_provider_key,
      'does_not_compare_item_deployment_key_to_provider_identity', does_not_compare_item_deployment_key_to_provider_identity
    )
  from source_diagnostics
  union all
  select 'function_updates_selected_provider_once',
    updates_selected_provider_once
    and constrains_provider_id
    and constrains_clinic_id
    and constrains_provider_key,
    jsonb_build_object(
      'updates_selected_provider_once', updates_selected_provider_once,
      'constrains_provider_id', constrains_provider_id,
      'constrains_clinic_id', constrains_clinic_id,
      'constrains_provider_key', constrains_provider_key
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
union all select check_name, passed, null::jsonb from required_provider_columns
union all select check_name, passed, null::jsonb from function_contract
union all select check_name, passed, null::jsonb from function_security
union all select check_name, passed, null::jsonb from privileges
union all select check_name, passed, null::jsonb from provider_duplicates
union all select check_name, passed, null::jsonb from provider_lifecycle_assumptions
union all select check_name, passed, null::jsonb from active_incompatible
union all select check_name, passed, details from running_item_integrity
union all select check_name, passed, null::jsonb from duplicate_item_identities
union all select check_name, passed, details from source_checks
order by check_name;
