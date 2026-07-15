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
  select pg_get_functiondef('public.activate_deployment_provider_shell(uuid,text,uuid,text,text,text,timestamptz,uuid,text,text,integer,text,text,text,timestamptz,integer,uuid,text,jsonb,jsonb,timestamptz)'::regprocedure) as body
), source_checks as (
  select 'function_updates_only_providers' as check_name,
    body ilike '%update public.providers update_provider%'
    and body not ilike '%update public.deployment_activation_execution_items%'
    and body not ilike '%update public.deployment_activation_execution_sessions%'
    and body not ilike '%update public.clinics%'
    and body not ilike '%lease_expires_at =%'
    and body not ilike '%ownership_token =%'
    and body not ilike '%completed_at =%'
    and body not ilike '%execution_status =%succeeded%'
    and body not ilike '%execution_status =%ready%'
    as passed
  from source
  union all
  select 'function_updates_selected_provider_once',
    regexp_count(lower(body), 'update public\.providers') = 1
    and body ilike '%where update_provider.id = v_provider.id%'
    and body ilike '%and update_provider.clinic_id = p_clinic_id%'
    and body ilike '%and update_provider.deployment_provider_key = p_expected_provider_key%'
  from source
  union all
  select 'function_writes_supported_target_fields',
    body ilike '%set active = true%'
    and body ilike '%provisioning_status = ''active''%'
    and body not ilike '%insert into%'
    and body not ilike '%delete from%'
  from source
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
union all select check_name, passed, null::jsonb from source_checks
order by check_name;