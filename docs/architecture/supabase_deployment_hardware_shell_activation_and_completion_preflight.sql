-- RC9 Slice 3D1A read-only hardware activation and completion verification.

-- RC9 Slice 3D1A hardware shell activation preflight.
-- Read-only checks for schema readiness, function contract, privileges, and mutation boundary.

with required_tables as (
  select 'required_table_deployment_activation_execution_sessions' as check_name, to_regclass('public.deployment_activation_execution_sessions') is not null as passed
  union all select 'required_table_deployment_activation_execution_items', to_regclass('public.deployment_activation_execution_items') is not null
  union all select 'required_table_clinical_hardware_devices', to_regclass('public.clinical_hardware_devices') is not null
), required_hardware_columns as (
  select 'required_hardware_columns' as check_name,
    count(*) filter (where column_name in ('id','clinic_id','deployment_hardware_key','provisioning_source','provisioning_status','active','status','agent_id','default_workstation_id','current_workstation_id','updated_at')) = 11 as passed
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'clinical_hardware_devices'
), function_contract as (
  select 'exact_rpc_signature_exists' as check_name,
    to_regprocedure('public.activate_deployment_hardware_shell(uuid,text,uuid,text,text,text,timestamptz,uuid,text,text,integer,text,text,text,timestamptz,integer,uuid,text,jsonb,jsonb,timestamptz)') is not null as passed
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
    and p.proname = 'activate_deployment_hardware_shell'
), privileges as (
  select 'service_role_only_execute' as check_name,
    has_function_privilege('service_role', 'public.activate_deployment_hardware_shell(uuid,text,uuid,text,text,text,timestamptz,uuid,text,text,integer,text,text,text,timestamptz,integer,uuid,text,jsonb,jsonb,timestamptz)', 'execute')
    and not has_function_privilege('anon', 'public.activate_deployment_hardware_shell(uuid,text,uuid,text,text,text,timestamptz,uuid,text,text,integer,text,text,text,timestamptz,integer,uuid,text,jsonb,jsonb,timestamptz)', 'execute')
    and not has_function_privilege('authenticated', 'public.activate_deployment_hardware_shell(uuid,text,uuid,text,text,text,timestamptz,uuid,text,text,integer,text,text,text,timestamptz,integer,uuid,text,jsonb,jsonb,timestamptz)', 'execute') as passed
), hardware_duplicates as (
  select 'no_duplicate_hardware_deployment_identity' as check_name,
    not exists (
      select 1
      from public.clinical_hardware_devices hardware_row
      where hardware_row.clinic_id is not null
        and hardware_row.deployment_hardware_key is not null
      group by hardware_row.clinic_id, hardware_row.deployment_hardware_key
      having count(*) > 1
    ) as passed
), hardware_lifecycle_assumptions as (
  select 'hardware_lifecycle_status_assumptions' as check_name,
    not exists (
      select 1
      from public.clinical_hardware_devices hardware_row
      where hardware_row.deployment_hardware_key is not null
        and hardware_row.provisioning_source = 'setup_draft'
        and hardware_row.provisioning_status not in ('planned', 'active')
    ) as passed
), active_incompatible as (
  select 'no_active_incompatible_hardware_shells' as check_name,
    not exists (
      select 1
      from public.clinical_hardware_devices hardware_row
      where hardware_row.deployment_hardware_key is not null
        and hardware_row.active = true
        and (hardware_row.provisioning_source is distinct from 'setup_draft' or hardware_row.provisioning_status is distinct from 'active')
    ) as passed
), running_item_integrity as (
  select 'running_hardware_shell_item_integrity_snapshot' as check_name,
    true as passed,
    jsonb_build_object(
      'runningHardwareItems', count(*) filter (where item_row.execution_status = 'running' and item_row.entity_type = 'hardware_shell'),
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
  select lower(regexp_replace(pg_get_functiondef('public.activate_deployment_hardware_shell(uuid,text,uuid,text,text,text,timestamptz,uuid,text,text,integer,text,text,text,timestamptz,integer,uuid,text,jsonb,jsonb,timestamptz)'::regprocedure), '\s+', ' ', 'g')) as body
), source_diagnostics as (
  select
    body ~ '(^|[^a-z_])update\s+public\.clinical_hardware_devices\s+update_hardware([^a-z_]|$)' as updates_clinical_hardware_devices,
    regexp_count(body, '(^|[^a-z_])update\s+public\.clinical_hardware_devices\s+update_hardware([^a-z_]|$)') = 1 as updates_selected_hardware_once,
    body ~ 'where\s+update_hardware\.id\s*=\s*v_hardware\.id' as constrains_hardware_id,
    body ~ 'and\s+update_hardware\.clinic_id\s*=\s*p_clinic_id' as constrains_clinic_id,
    body ~ 'and\s+update_hardware\.deployment_hardware_key\s*=\s*p_expected_hardware_key' as constrains_hardware_key,
    body ~ 'v_item\.entity_id::text\s+is\s+distinct\s+from\s+p_expected_entity_id' as compares_item_entity_id_to_expected_entity_id,
    body ~ '''entityidmatcheshardwareid'',\s*v_item\.entity_id::text\s+is\s+not\s+distinct\s+from\s+p_hardware_id::text' as reports_entity_id_hardware_id_diagnostic,
    body !~ 'p_expected_entity_id\s+is\s+distinct\s+from\s+p_expected_hardware_key' as does_not_compare_entity_id_to_hardware_key,
    body !~ 'v_item\.entity_id::text\s+is\s+distinct\s+from\s*p_expected_hardware_key' as does_not_compare_item_entity_id_to_hardware_key,
    body ~ 'v_item\.deployment_key\s+is\s+distinct\s+from\s+p_expected_hardware_key' as compares_item_deployment_key_to_hardware_key,
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
  select 'function_updates_only_clinical_hardware_devices' as check_name,
    updates_clinical_hardware_devices
    and updates_selected_hardware_once
    and constrains_hardware_id
    and constrains_clinic_id
    and constrains_hardware_key
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
      'updates_clinical_hardware_devices', updates_clinical_hardware_devices,
      'updates_selected_hardware_once', updates_selected_hardware_once,
      'constrains_hardware_id', constrains_hardware_id,
      'constrains_clinic_id', constrains_clinic_id,
      'constrains_hardware_key', constrains_hardware_key,
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
      'does_not_compare_entity_id_to_hardware_key', does_not_compare_entity_id_to_hardware_key,
      'does_not_compare_item_entity_id_to_hardware_key', does_not_compare_item_entity_id_to_hardware_key,
      'compares_item_deployment_key_to_hardware_key', compares_item_deployment_key_to_hardware_key
    ) as details
  from source_diagnostics
  union all
  select 'function_preserves_hardware_uuid_key_identity_contract',
    compares_item_entity_id_to_expected_entity_id
    and reports_entity_id_hardware_id_diagnostic
    and does_not_compare_entity_id_to_hardware_key
    and does_not_compare_item_entity_id_to_hardware_key
    and compares_item_deployment_key_to_hardware_key,
    jsonb_build_object(
      'compares_item_entity_id_to_expected_entity_id', compares_item_entity_id_to_expected_entity_id,
      'reports_entity_id_hardware_id_diagnostic', reports_entity_id_hardware_id_diagnostic,
      'does_not_compare_entity_id_to_hardware_key', does_not_compare_entity_id_to_hardware_key,
      'does_not_compare_item_entity_id_to_hardware_key', does_not_compare_item_entity_id_to_hardware_key,
      'compares_item_deployment_key_to_hardware_key', compares_item_deployment_key_to_hardware_key
    )
  from source_diagnostics
  union all
  select 'function_updates_selected_hardware_once',
    updates_selected_hardware_once
    and constrains_hardware_id
    and constrains_clinic_id
    and constrains_hardware_key,
    jsonb_build_object(
      'updates_selected_hardware_once', updates_selected_hardware_once,
      'constrains_hardware_id', constrains_hardware_id,
      'constrains_clinic_id', constrains_clinic_id,
      'constrains_hardware_key', constrains_hardware_key
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
union all select check_name, passed, null::jsonb from required_hardware_columns
union all select check_name, passed, null::jsonb from function_contract
union all select check_name, passed, null::jsonb from function_security
union all select check_name, passed, null::jsonb from privileges
union all select check_name, passed, null::jsonb from hardware_duplicates
union all select check_name, passed, null::jsonb from hardware_lifecycle_assumptions
union all select check_name, passed, null::jsonb from active_incompatible
union all select check_name, passed, details from running_item_integrity
union all select check_name, passed, null::jsonb from duplicate_item_identities
union all select check_name, passed, details from source_checks
order by check_name;


-- Read-only field-difference harness for the activation conflict diagnostic.
with baseline as (
  select jsonb_build_object(
    'deploymentHardwareKey', 'hardware-001', 'provisioningSource', 'setup_draft',
    'provisioningStatus', 'planned', 'active', false, 'operationalStatus', 'discovered',
    'agentId', null, 'defaultWorkstationId', null, 'currentWorkstationId', null
  ) as state
), cases(case_name, expected_state, actual_state, expected_differences) as (
  select 'matching', state, state, '[]'::jsonb from baseline
  union all select 'different_property_order', state, jsonb_build_object(
    'currentWorkstationId', null, 'defaultWorkstationId', null, 'agentId', null,
    'operationalStatus', 'discovered', 'active', false, 'provisioningStatus', 'planned',
    'provisioningSource', 'setup_draft', 'deploymentHardwareKey', 'hardware-001'
  ), '[]'::jsonb from baseline
  union all select 'extra_execution_item_fields', state, state || '{"id":"hardware-uuid","clinicId":"clinic-uuid","plannerOnly":true}'::jsonb, '[]'::jsonb from baseline
  union all select 'null_values', state, state, '[]'::jsonb from baseline  union all select 'deploymentHardwareKey', state, jsonb_set(state, '{deploymentHardwareKey}', '"other"'), '["deploymentHardwareKey"]' from baseline
  union all select 'provisioningSource', state, jsonb_set(state, '{provisioningSource}', '"other"'), '["provisioningSource"]' from baseline
  union all select 'provisioningStatus', state, jsonb_set(state, '{provisioningStatus}', '"active"'), '["provisioningStatus"]' from baseline
  union all select 'active', state, jsonb_set(state, '{active}', 'true'), '["active"]' from baseline
  union all select 'operationalStatus', state, jsonb_set(state, '{operationalStatus}', '"offline"'), '["operationalStatus"]' from baseline
  union all select 'agentId', state, jsonb_set(state, '{agentId}', '"agent-1"'), '["agentId"]' from baseline
  union all select 'defaultWorkstationId', state, jsonb_set(state, '{defaultWorkstationId}', '"workstation-1"'), '["defaultWorkstationId"]' from baseline
  union all select 'currentWorkstationId', state, jsonb_set(state, '{currentWorkstationId}', '"workstation-2"'), '["currentWorkstationId"]' from baseline
  union all select 'multiple', state, jsonb_set(jsonb_set(state, '{active}', 'true'), '{operationalStatus}', '"offline"'), '["active","operationalStatus"]' from baseline
), observed as (
  select cases.case_name, cases.expected_differences,
    coalesce(jsonb_agg(field.field_name order by field.ordinal) filter (where field.expected_value is distinct from field.actual_value), '[]'::jsonb) as differing_fields
  from cases
  cross join lateral (values
    (1, 'deploymentHardwareKey', expected_state -> 'deploymentHardwareKey', actual_state -> 'deploymentHardwareKey'),
    (2, 'provisioningSource', expected_state -> 'provisioningSource', actual_state -> 'provisioningSource'),
    (3, 'provisioningStatus', expected_state -> 'provisioningStatus', actual_state -> 'provisioningStatus'),
    (4, 'active', expected_state -> 'active', actual_state -> 'active'),
    (5, 'operationalStatus', expected_state -> 'operationalStatus', actual_state -> 'operationalStatus'),
    (6, 'agentId', expected_state -> 'agentId', actual_state -> 'agentId'),
    (7, 'defaultWorkstationId', expected_state -> 'defaultWorkstationId', actual_state -> 'defaultWorkstationId'),
    (8, 'currentWorkstationId', expected_state -> 'currentWorkstationId', actual_state -> 'currentWorkstationId')
  ) field(ordinal, field_name, expected_value, actual_value)
  group by cases.case_name, cases.expected_differences
)
select 'matching_order_extra_and_null_transition_states_report_no_differences' as check_name,
  bool_and(differing_fields = expected_differences) filter (where case_name in ('matching', 'different_property_order', 'extra_execution_item_fields', 'null_values')) as passed,
  jsonb_object_agg(case_name, differing_fields) filter (where case_name in ('matching', 'different_property_order', 'extra_execution_item_fields', 'null_values')) as details
from observed
union all
select 'each_transition_field_mismatch_is_identified',
  bool_and(differing_fields = expected_differences) filter (where case_name not in ('matching', 'different_property_order', 'extra_execution_item_fields', 'null_values', 'multiple')),
  jsonb_object_agg(case_name, differing_fields) filter (where case_name not in ('matching', 'different_property_order', 'extra_execution_item_fields', 'null_values', 'multiple'))
from observed
union all
select 'multiple_transition_field_mismatches_are_reported_together',
  bool_and(differing_fields = expected_differences) filter (where case_name = 'multiple'),
  jsonb_object_agg(case_name, differing_fields) filter (where case_name = 'multiple')
from observed;
-- Read-only preservation checks for non-transition activation guards.
with source as (
  select lower(regexp_replace(pg_get_functiondef('public.activate_deployment_hardware_shell(uuid,text,uuid,text,text,text,timestamptz,uuid,text,text,integer,text,text,text,timestamptz,integer,uuid,text,jsonb,jsonb,timestamptz)'::regprocedure), '\s+', ' ', 'g')) as body
)
select 'authoritative_item_transition_projection_preserved' as check_name,
  body ~ 'jsonb_each\(v_item\.expected_current_state\)'
  and body ~ 'v_item_transition_state\s+is\s+distinct\s+from\s+p_expected_current_state'
  and body !~ 'v_item\.expected_current_state\s+is\s+distinct\s+from\s+p_expected_current_state' as passed
from source
union all
select 'claimant_token_and_lease_guards_preserved',
  body ~ 'v_session\.execution_owner\s+is\s+distinct\s+from\s+p_claimant_id'
  and body ~ 'v_session\.ownership_token\s+is\s+distinct\s+from\s+p_ownership_token'
  and body ~ 'v_session\.lease_expires_at\s+is\s+distinct\s+from\s+p_expected_lease_expires_at'
from source
union all
select 'clinic_uuid_and_deployment_key_guards_preserved',
  body ~ 'hardware_row\.id\s*=\s*p_hardware_id'
  and body ~ 'hardware_row\.clinic_id\s*=\s*p_clinic_id'
  and body ~ 'hardware_row\.deployment_hardware_key\s*=\s*p_expected_hardware_key'
  and body ~ 'v_item\.entity_id::text\s+is\s+distinct\s+from\s+p_hardware_id::text'
from source
union all
select 'target_and_required_state_guards_preserved',
  body ~ 'v_item\.target_state\s+is\s+distinct\s+from\s+p_target_state'
  and body ~ 'v_hardware\.active\s+is\s+distinct\s+from\s+false'
  and body ~ 'v_hardware\.provisioning_source\s+is\s+distinct\s+from\s+''setup_draft'''
  and body ~ 'v_hardware\.provisioning_status\s+is\s+distinct\s+from\s+''planned'''
from source;
-- RC8 Slice 11B read-only preflight for hardware-shell execution-item completion.

with required_tables as (
  select 'required_table_execution_sessions' as check_name, to_regclass('public.deployment_activation_execution_sessions') is not null as passed, null::jsonb as details
  union all select 'required_table_execution_items', to_regclass('public.deployment_activation_execution_items') is not null, null::jsonb
  union all select 'required_table_clinical_hardware_devices', to_regclass('public.clinical_hardware_devices') is not null, null::jsonb
), required_columns as (
  select 'required_execution_item_columns' as check_name,
    count(*) filter (where column_name in ('id','session_id','execution_item_key','plan_item_key','sequence','entity_type','entity_id','deployment_key','action','execution_status','attempt_count','started_at','completed_at','rolled_back_at','error_code','error_message','expected_current_state','target_state','dependency_keys')) >= 19 as passed,
    null::jsonb as details
  from information_schema.columns
  where table_schema = 'public' and table_name = 'deployment_activation_execution_items'
), function_contract as (
  select 'exact_rpc_signature_exists' as check_name,
    to_regprocedure('public.complete_deployment_hardware_shell_execution_item(uuid,text,uuid,text,text,text,timestamptz,uuid,text,text,integer,text,text,text,text,timestamptz,integer,uuid,jsonb,jsonb,timestamptz)') is not null as passed,
    null::jsonb as details
), function_security as (
  select 'function_security_definer_search_path_fixed' as check_name,
    coalesce(p.prosecdef, false)
    and exists (select 1 from unnest(coalesce(p.proconfig, array[]::text[])) cfg where cfg = 'search_path=pg_catalog, public') as passed,
    null::jsonb as details
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'complete_deployment_hardware_shell_execution_item'
), privileges as (
  select 'service_role_only_execute' as check_name,
    has_function_privilege('service_role', 'public.complete_deployment_hardware_shell_execution_item(uuid,text,uuid,text,text,text,timestamptz,uuid,text,text,integer,text,text,text,text,timestamptz,integer,uuid,jsonb,jsonb,timestamptz)', 'execute')
    and not has_function_privilege('anon', 'public.complete_deployment_hardware_shell_execution_item(uuid,text,uuid,text,text,text,timestamptz,uuid,text,text,integer,text,text,text,text,timestamptz,integer,uuid,jsonb,jsonb,timestamptz)', 'execute')
    and not has_function_privilege('authenticated', 'public.complete_deployment_hardware_shell_execution_item(uuid,text,uuid,text,text,text,timestamptz,uuid,text,text,integer,text,text,text,text,timestamptz,integer,uuid,jsonb,jsonb,timestamptz)', 'execute') as passed,
    null::jsonb as details
), duplicate_checks as (
  select 'no_duplicate_item_or_hardware_identities' as check_name,
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
      select 1 from public.clinical_hardware_devices hardware_row where hardware_row.clinic_id is not null and hardware_row.deployment_hardware_key is not null group by hardware_row.clinic_id, hardware_row.deployment_hardware_key having count(*) > 1
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
  select lower(regexp_replace(pg_get_functiondef('public.complete_deployment_hardware_shell_execution_item(uuid,text,uuid,text,text,text,timestamptz,uuid,text,text,integer,text,text,text,text,timestamptz,integer,uuid,jsonb,jsonb,timestamptz)'::regprocedure), '\s+', ' ', 'g')) as body
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
    body !~ 'update\s+public\.clinical_hardware_devices' as does_not_update_clinical_hardware_devices,
    body !~ 'update\s+public\.clinics' as does_not_update_clinics,
    update_set_clause !~ 'lease_expires_at\s*=' as does_not_write_lease,
    update_set_clause !~ 'ownership_token\s*=' as does_not_write_token,
    update_set_clause !~ 'dependency_keys\s*=' and update_set_clause !~ 'execution_status\s*=\s*''ready''' as does_not_progress_dependencies,
    update_set_clause !~ 'execution_status\s*=\s*''running''' and update_set_clause !~ 'started_at\s*=' as does_not_start_another_item,
    body !~ '(^|[^a-z_])insert\s+into([^a-z_]|$)' as does_not_insert,
    body !~ '(^|[^a-z_])delete\s+from([^a-z_]|$)' as does_not_delete,
    body ~ 'v_item\.entity_id\s+is\s+distinct\s+from\s+p_expected_entity_id' as compares_hardware_uuid_as_text,
    body ~ 'v_hardware\.id\s+is\s+distinct\s+from\s+p_hardware_id' as compares_hardware_uuid_to_hardware_id,
    body ~ 'v_hardware\.deployment_hardware_key\s+is\s+distinct\s+from\s+p_expected_deployment_hardware_key' as compares_hardware_key_to_key,
    body !~ 'p_hardware_id(::text)?\s*=\s*p_expected_deployment_hardware_key' as does_not_conflate_uuid_and_key
  from update_parts
), source_checks as (
  select 'function_mutates_only_selected_execution_item' as check_name,
    updates_execution_items and updates_selected_item_alias and updates_only_one_public_table and constrains_item_id and constrains_session_id and constrains_execution_item_key and constrains_plan_item_key and writes_succeeded_status and writes_completed_at and does_not_write_started_at and does_not_increment_attempt_count and does_not_update_sessions and does_not_update_clinical_hardware_devices and does_not_update_clinics and does_not_write_lease and does_not_write_token and does_not_progress_dependencies and does_not_start_another_item and does_not_insert and does_not_delete as passed,
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
      'does_not_update_clinical_hardware_devices', does_not_update_clinical_hardware_devices,
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
  select 'function_preserves_hardware_uuid_key_distinction',
    compares_hardware_uuid_as_text and compares_hardware_uuid_to_hardware_id and compares_hardware_key_to_key and does_not_conflate_uuid_and_key,
    jsonb_build_object(
      'compares_hardware_uuid_as_text', compares_hardware_uuid_as_text,
      'compares_hardware_uuid_to_hardware_id', compares_hardware_uuid_to_hardware_id,
      'compares_hardware_key_to_key', compares_hardware_key_to_key,
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

-- Read-only Hardware completion four-field contract harness.
with baseline as (
  select
    jsonb_build_object(
      'deploymentHardwareKey', 'hardware-001', 'provisioningSource', 'setup_draft',
      'provisioningStatus', 'active', 'active', true
    ) as required_state,
    jsonb_build_object(
      'deploymentHardwareKey', 'hardware-001', 'provisioningSource', 'setup_draft',
      'provisioningStatus', 'active', 'active', true, 'operationalStatus', 'discovered',
      'agentId', null, 'defaultWorkstationId', null, 'currentWorkstationId', null
    ) as persisted_state
), cases(case_name, expected_state, persisted_state, expected_differences) as (
  select 'valid_four_field_state', required_state, persisted_state, '[]'::jsonb from baseline
  union all select 'operational_drift_ignored', required_state, jsonb_set(persisted_state, '{operationalStatus}', '"offline"'), '[]' from baseline
  union all select 'null_bindings_ignored', required_state, persisted_state, '[]' from baseline
  union all select 'non_null_bindings_ignored', required_state, jsonb_set(jsonb_set(jsonb_set(persisted_state, '{agentId}', '"agent-1"'), '{defaultWorkstationId}', '"workstation-1"'), '{currentWorkstationId}', '"workstation-2"'), '[]' from baseline
  union all select 'deploymentHardwareKey', required_state, jsonb_set(persisted_state, '{deploymentHardwareKey}', '"other"'), '["deploymentHardwareKey"]' from baseline
  union all select 'provisioningSource', required_state, jsonb_set(persisted_state, '{provisioningSource}', '"other"'), '["provisioningSource"]' from baseline
  union all select 'provisioningStatus', required_state, jsonb_set(persisted_state, '{provisioningStatus}', '"planned"'), '["provisioningStatus"]' from baseline
  union all select 'active', required_state, jsonb_set(persisted_state, '{active}', 'false'), '["active"]' from baseline
  union all select 'multiple_authoritative', required_state, jsonb_set(jsonb_set(persisted_state, '{active}', 'false'), '{provisioningStatus}', '"planned"'), '["provisioningStatus","active"]' from baseline
), projected as (
  select case_name, expected_state, expected_differences,
    jsonb_build_object(
      'deploymentHardwareKey', persisted_state -> 'deploymentHardwareKey',
      'provisioningSource', persisted_state -> 'provisioningSource',
      'provisioningStatus', persisted_state -> 'provisioningStatus',
      'active', persisted_state -> 'active'
    ) as actual_state
  from cases
), observed as (
  select projected.case_name, projected.expected_differences,
    coalesce(jsonb_agg(field.field_name order by field.ordinal) filter (where field.expected_value is distinct from field.actual_value), '[]'::jsonb) as differing_fields
  from projected
  cross join lateral (values
    (1, 'deploymentHardwareKey', expected_state -> 'deploymentHardwareKey', actual_state -> 'deploymentHardwareKey'),
    (2, 'provisioningSource', expected_state -> 'provisioningSource', actual_state -> 'provisioningSource'),
    (3, 'provisioningStatus', expected_state -> 'provisioningStatus', actual_state -> 'provisioningStatus'),
    (4, 'active', expected_state -> 'active', actual_state -> 'active')
  ) field(ordinal, field_name, expected_value, actual_value)
  group by projected.case_name, projected.expected_differences
)
select 'completion_four_field_contract_cases' as check_name,
  bool_and(differing_fields = expected_differences) as passed,
  jsonb_object_agg(case_name, differing_fields) as details
from observed;

-- Ensure the deployed function retains all non-state completion guards.
with source as (
  select lower(regexp_replace(pg_get_functiondef('public.complete_deployment_hardware_shell_execution_item(uuid,text,uuid,text,text,text,timestamptz,uuid,text,text,integer,text,text,text,text,timestamptz,integer,uuid,jsonb,jsonb,timestamptz)'::regprocedure), '\s+', ' ', 'g')) as body
)
select 'completion_four_field_predicate_and_guards_preserved' as check_name,
  body ~ 'v_completion_authoritative_state\s+is\s+distinct\s+from\s+p_expected_hardware_state'
  and body ~ 'v_item\.target_state\s+is\s+distinct\s+from\s+p_expected_target_state'
  and body ~ 'v_session\.execution_owner\s+is\s+distinct\s+from\s+p_claimant_id'
  and body ~ 'v_session\.ownership_token\s+is\s+distinct\s+from\s+p_ownership_token'
  and body ~ 'v_session\.lease_expires_at\s+is\s+distinct\s+from\s+p_expected_lease_expires_at'
  and body ~ 'v_hardware\.provisioning_source\s+is\s+distinct\s+from\s+''setup_draft'''
  and body ~ 'v_hardware\.provisioning_status\s+is\s+distinct\s+from\s+''active'''
  and body ~ 'v_hardware\.active\s+is\s+distinct\s+from\s+true' as passed
from source;