-- RC8 Slice 7B preflight for the atomic item-completion RPC source and live shape.
-- Run after manually applying supabase_deployment_activation_execution_item_completion.sql.

with rpc_args as (
  select
    p.proname,
    pg_get_function_identity_arguments(p.oid) as identity_arguments,
    pg_get_function_result(p.oid) as result_contract,
    pg_get_functiondef(p.oid) as function_source
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'complete_deployment_activation_execution_item'
)
select
  exists(select 1 from rpc_args) as function_exists,
  identity_arguments like '%p_clinic_id uuid%' as has_clinic_id_arg,
  identity_arguments like '%p_deployment_run_key text%' as has_deployment_run_key_arg,
  identity_arguments like '%p_session_id uuid%' as has_session_id_arg,
  identity_arguments like '%p_execution_key text%' as has_execution_key_arg,
  identity_arguments like '%p_claimant_id text%' as has_claimant_arg,
  identity_arguments like '%p_ownership_token text%' as has_ownership_token_arg,
  identity_arguments like '%p_expected_lease_expires_at timestamp with time zone%' as has_expected_lease_arg,
  identity_arguments like '%p_item_id uuid%' as has_item_id_arg,
  identity_arguments like '%p_execution_item_key text%' as has_execution_item_key_arg,
  identity_arguments like '%p_plan_item_key text%' as has_plan_item_key_arg,
  identity_arguments like '%p_expected_sequence integer%' as has_expected_sequence_arg,
  identity_arguments like '%p_expected_entity_type text%' as has_expected_entity_type_arg,
  identity_arguments like '%p_expected_action text%' as has_expected_action_arg,
  identity_arguments like '%p_expected_started_at timestamp with time zone%' as has_expected_started_at_arg,
  identity_arguments like '%p_expected_attempt_count integer%' as has_expected_attempt_count_arg,
  identity_arguments like '%p_proposed_completed_at timestamp with time zone%' as has_proposed_completed_at_arg,
  result_contract like 'TABLE(status text%' as returns_expected_table,
  function_source like '%update public.deployment_activation_execution_items update_item%' as uses_single_item_update,
  function_source not like '%update public.deployment_activation_execution_sessions%' as does_not_update_session,
  function_source not like '%unlock%' as does_not_unlock_dependencies,
  function_source like '%duplicate_item.execution_item_key%' as qualified_duplicate_execution_item_key_check,
  function_source like '%duplicate_item.plan_item_key%' as qualified_duplicate_plan_item_key_check,
  function_source like '%duplicate_item.sequence%' as qualified_duplicate_sequence_check,
  function_source like '%v_completion_timestamp := clock_timestamp()%' as uses_database_mutation_clock,
  function_source like '%completed_at = v_completion_timestamp%' as persists_database_mutation_time,
  function_source like '%lease_expires_at <= v_completion_timestamp%' as validates_lease_at_mutation_time,
  function_source not like '%completed_at = p_proposed_completed_at%' as caller_cannot_set_completed_at
from rpc_args;

select
  count(*) filter (where item.execution_status = 'succeeded' and item.completed_at is null) as succeeded_without_completed_at,
  count(*) filter (where item.execution_status = 'running' and item.completed_at is not null) as running_with_completed_at,
  count(*) filter (where item.sequence = 1 and item.entity_type = 'clinic' and item.action = 'activate' and item.execution_status in ('running', 'succeeded')) as sequence_one_clinic_activation_items
from public.deployment_activation_execution_items item;

-- Causality audit: completed items must never predate their own start.
select
  count(*) filter (where item.completed_at < item.started_at) as completion_before_start
from public.deployment_activation_execution_items item
where item.completed_at is not null;
