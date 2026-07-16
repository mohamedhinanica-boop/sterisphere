-- RC8 Slice 11B - atomic provider-shell activation execution-item completion boundary.
-- Apply manually with CREATE OR REPLACE FUNCTION only when promoting this slice.
-- This function completes only the selected running provider_shell activate item after the provider row is active.

create or replace function public.complete_deployment_provider_shell_execution_item(
  p_clinic_id uuid,
  p_deployment_run_key text,
  p_session_id uuid,
  p_execution_key text,
  p_claimant_id text,
  p_ownership_token text,
  p_expected_lease_expires_at timestamptz,
  p_item_id uuid,
  p_execution_item_key text,
  p_plan_item_key text,
  p_expected_sequence integer,
  p_expected_entity_type text,
  p_expected_entity_id text,
  p_expected_deployment_provider_key text,
  p_expected_action text,
  p_expected_item_started_at timestamptz,
  p_expected_attempt_count integer,
  p_provider_id uuid,
  p_expected_provider_state jsonb,
  p_expected_target_state jsonb,
  p_proposed_completed_at timestamptz
)
returns table (
  status text,
  claimant_id text,
  clinic_id uuid,
  deployment_run_key text,
  session_id uuid,
  execution_key text,
  item_id uuid,
  execution_item_key text,
  plan_item_key text,
  sequence integer,
  entity_type text,
  entity_id text,
  deployment_provider_key text,
  action text,
  provider_id uuid,
  item_status_before text,
  item_status_after text,
  started_at timestamptz,
  completed_at timestamptz,
  attempt_count integer,
  issue_code text,
  message text
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_session public.deployment_activation_execution_sessions%rowtype;
  v_item public.deployment_activation_execution_items%rowtype;
  v_provider public.providers%rowtype;
  v_total_items integer := 0;
  v_duplicate_item_identity_count integer := 0;
  v_duplicate_provider_identity_count integer := 0;
  v_prior_bad_count integer := 0;
  v_dependency_bad_count integer := 0;
  v_later_drift_count integer := 0;
  v_running_or_ready_other_count integer := 0;
  v_rows_updated integer := 0;
begin
  select session_row.* into v_session
  from public.deployment_activation_execution_sessions session_row
  where session_row.id = p_session_id
    and session_row.clinic_id = p_clinic_id
    and session_row.deployment_run_key = p_deployment_run_key
    and session_row.execution_key = p_execution_key
  for update;

  if not found then
    return query select 'not_found'::text, p_claimant_id, p_clinic_id, p_deployment_run_key, p_session_id, p_execution_key,
      p_item_id, p_execution_item_key, p_plan_item_key, p_expected_sequence, p_expected_entity_type,
      p_expected_entity_id, p_expected_deployment_provider_key, p_expected_action, p_provider_id,
      null::text, null::text, null::timestamptz, null::timestamptz, null::integer,
      'missing_session'::text, 'Provider-shell item-completion session was not found.'::text;
    return;
  end if;

  select item_row.* into v_item
  from public.deployment_activation_execution_items item_row
  where item_row.id = p_item_id
    and item_row.session_id = v_session.id
    and item_row.execution_item_key = p_execution_item_key
    and item_row.plan_item_key = p_plan_item_key
  for update;

  if not found then
    return query select 'not_found'::text, p_claimant_id, v_session.clinic_id, v_session.deployment_run_key, v_session.id, v_session.execution_key,
      p_item_id, p_execution_item_key, p_plan_item_key, p_expected_sequence, p_expected_entity_type,
      p_expected_entity_id, p_expected_deployment_provider_key, p_expected_action, p_provider_id,
      null::text, null::text, null::timestamptz, null::timestamptz, null::integer,
      'missing_item'::text, 'Provider-shell execution item was not found.'::text;
    return;
  end if;

  select provider_row.* into v_provider
  from public.providers provider_row
  where provider_row.id = p_provider_id
    and provider_row.clinic_id = p_clinic_id
    and provider_row.deployment_provider_key = p_expected_deployment_provider_key
  for update;

  if not found then
    return query select 'not_found'::text, p_claimant_id, v_session.clinic_id, v_session.deployment_run_key, v_session.id, v_session.execution_key,
      v_item.id, v_item.execution_item_key, v_item.plan_item_key, v_item.sequence, v_item.entity_type,
      v_item.entity_id, p_expected_deployment_provider_key, v_item.action, p_provider_id,
      v_item.execution_status, v_item.execution_status, v_item.started_at, v_item.completed_at, v_item.attempt_count,
      'missing_provider_shell'::text, 'Provider shell was not found.'::text;
    return;
  end if;

  select count(*)::integer into v_total_items
  from public.deployment_activation_execution_items counted_item
  where counted_item.session_id = v_session.id;

  select count(*)::integer into v_duplicate_item_identity_count
  from (
    select duplicate_item.execution_item_key from public.deployment_activation_execution_items duplicate_item where duplicate_item.session_id = v_session.id group by duplicate_item.execution_item_key having count(*) > 1
    union all
    select duplicate_item.plan_item_key from public.deployment_activation_execution_items duplicate_item where duplicate_item.session_id = v_session.id group by duplicate_item.plan_item_key having count(*) > 1
    union all
    select duplicate_item.sequence::text from public.deployment_activation_execution_items duplicate_item where duplicate_item.session_id = v_session.id group by duplicate_item.sequence having count(*) > 1
  ) duplicate_rows;

  select count(*)::integer into v_duplicate_provider_identity_count
  from public.providers duplicate_provider
  where duplicate_provider.clinic_id = p_clinic_id
    and duplicate_provider.deployment_provider_key = p_expected_deployment_provider_key;

  if v_total_items is distinct from v_session.items_requested
     or v_duplicate_item_identity_count > 0
     or v_duplicate_provider_identity_count <> 1 then
    return query select 'blocked'::text, p_claimant_id, v_session.clinic_id, v_session.deployment_run_key, v_session.id, v_session.execution_key,
      v_item.id, v_item.execution_item_key, v_item.plan_item_key, v_item.sequence, v_item.entity_type,
      v_item.entity_id, v_provider.deployment_provider_key, v_item.action, v_provider.id,
      v_item.execution_status, v_item.execution_status, v_item.started_at, v_item.completed_at, v_item.attempt_count,
      'duplicate_identity'::text, 'Provider-shell item-completion identity integrity failed.'::text;
    return;
  end if;

  if v_item.execution_status = 'succeeded'
     and v_item.completed_at is not null
     and v_item.completed_at >= v_item.started_at
     and v_item.sequence = p_expected_sequence
     and v_item.entity_type = p_expected_entity_type
     and v_item.entity_id is not distinct from p_expected_entity_id
     and v_item.deployment_key is not distinct from p_expected_deployment_provider_key
     and v_item.action = p_expected_action
     and v_item.started_at is not distinct from p_expected_item_started_at
     and v_item.attempt_count is not distinct from p_expected_attempt_count
     and v_item.rolled_back_at is null
     and v_item.error_code is null
     and v_item.error_message is null
     and v_provider.provisioning_source = 'setup_draft'
     and v_provider.provisioning_status = 'active'
     and v_provider.active = true then
    return query select 'already_completed'::text, p_claimant_id, v_session.clinic_id, v_session.deployment_run_key, v_session.id, v_session.execution_key,
      v_item.id, v_item.execution_item_key, v_item.plan_item_key, v_item.sequence, v_item.entity_type,
      v_item.entity_id, v_provider.deployment_provider_key, v_item.action, v_provider.id,
      'succeeded'::text, 'succeeded'::text, v_item.started_at, v_item.completed_at, v_item.attempt_count,
      null::text, 'Provider-shell execution item was already completed. completed_at was preserved.'::text;
    return;
  end if;

  if v_session.preparation_status is distinct from 'ready'
     or v_session.execution_status is distinct from 'running'
     or v_session.started_at is null
     or v_session.completed_at is not null
     or v_session.failed_at is not null then
    return query select 'blocked'::text, p_claimant_id, v_session.clinic_id, v_session.deployment_run_key, v_session.id, v_session.execution_key,
      v_item.id, v_item.execution_item_key, v_item.plan_item_key, v_item.sequence, v_item.entity_type,
      v_item.entity_id, v_provider.deployment_provider_key, v_item.action, v_provider.id,
      v_item.execution_status, v_item.execution_status, v_item.started_at, v_item.completed_at, v_item.attempt_count,
      'session_not_running'::text, 'Execution session is not provider item-completion safe.'::text;
    return;
  end if;

  if v_session.execution_owner is distinct from p_claimant_id
     or v_session.ownership_token is distinct from p_ownership_token then
    return query select 'conflict'::text, p_claimant_id, v_session.clinic_id, v_session.deployment_run_key, v_session.id, v_session.execution_key,
      v_item.id, v_item.execution_item_key, v_item.plan_item_key, v_item.sequence, v_item.entity_type,
      v_item.entity_id, v_provider.deployment_provider_key, v_item.action, v_provider.id,
      v_item.execution_status, v_item.execution_status, v_item.started_at, v_item.completed_at, v_item.attempt_count,
      'ownership_conflict'::text, 'Provider-shell item-completion ownership compare-and-set failed.'::text;
    return;
  end if;

  if v_session.lease_expires_at is null
     or v_session.lease_expires_at is distinct from p_expected_lease_expires_at
     or v_session.lease_expires_at <= p_proposed_completed_at then
    return query select 'blocked'::text, p_claimant_id, v_session.clinic_id, v_session.deployment_run_key, v_session.id, v_session.execution_key,
      v_item.id, v_item.execution_item_key, v_item.plan_item_key, v_item.sequence, v_item.entity_type,
      v_item.entity_id, v_provider.deployment_provider_key, v_item.action, v_provider.id,
      v_item.execution_status, v_item.execution_status, v_item.started_at, v_item.completed_at, v_item.attempt_count,
      'lease_expired'::text, 'Execution lease is not active for provider item completion.'::text;
    return;
  end if;

  if v_item.execution_item_key is distinct from p_execution_item_key
     or v_item.plan_item_key is distinct from p_plan_item_key
     or v_item.sequence is distinct from p_expected_sequence
     or v_item.entity_type is distinct from p_expected_entity_type
     or v_item.entity_id is distinct from p_expected_entity_id
     or v_item.deployment_key is distinct from p_expected_deployment_provider_key
     or v_item.action is distinct from p_expected_action
     or p_expected_entity_type <> 'provider_shell'
     or p_expected_action <> 'activate'
     or v_provider.id is distinct from p_provider_id
     or v_provider.deployment_provider_key is distinct from p_expected_deployment_provider_key then
    return query select 'conflict'::text, p_claimant_id, v_session.clinic_id, v_session.deployment_run_key, v_session.id, v_session.execution_key,
      v_item.id, v_item.execution_item_key, v_item.plan_item_key, v_item.sequence, v_item.entity_type,
      v_item.entity_id, v_provider.deployment_provider_key, v_item.action, v_provider.id,
      v_item.execution_status, v_item.execution_status, v_item.started_at, v_item.completed_at, v_item.attempt_count,
      'item_identity_compare_failed'::text, 'Provider-shell item identity compare-and-set failed.'::text;
    return;
  end if;

  if v_item.execution_status is distinct from 'running'
     or v_item.attempt_count is distinct from p_expected_attempt_count
     or p_expected_attempt_count <> 1
     or v_item.started_at is distinct from p_expected_item_started_at
     or v_item.completed_at is not null
     or v_item.rolled_back_at is not null
     or v_item.error_code is not null
     or v_item.error_message is not null then
    return query select 'blocked'::text, p_claimant_id, v_session.clinic_id, v_session.deployment_run_key, v_session.id, v_session.execution_key,
      v_item.id, v_item.execution_item_key, v_item.plan_item_key, v_item.sequence, v_item.entity_type,
      v_item.entity_id, v_provider.deployment_provider_key, v_item.action, v_provider.id,
      v_item.execution_status, v_item.execution_status, v_item.started_at, v_item.completed_at, v_item.attempt_count,
      'stale_state'::text, 'Provider-shell execution item changed before completion.'::text;
    return;
  end if;

  if jsonb_build_object('deploymentProviderKey', v_provider.deployment_provider_key, 'provisioningSource', v_provider.provisioning_source, 'provisioningStatus', v_provider.provisioning_status, 'active', v_provider.active)
       is distinct from p_expected_provider_state
     or p_expected_target_state is distinct from jsonb_build_object('deploymentProviderKey', v_provider.deployment_provider_key, 'provisioningSource', 'setup_draft', 'provisioningStatus', 'active', 'active', true)
     or v_provider.provisioning_source is distinct from 'setup_draft'
     or v_provider.provisioning_status is distinct from 'active'
     or v_provider.active is distinct from true then
    return query select 'blocked'::text, p_claimant_id, v_session.clinic_id, v_session.deployment_run_key, v_session.id, v_session.execution_key,
      v_item.id, v_item.execution_item_key, v_item.plan_item_key, v_item.sequence, v_item.entity_type,
      v_item.entity_id, v_provider.deployment_provider_key, v_item.action, v_provider.id,
      v_item.execution_status, v_item.execution_status, v_item.started_at, v_item.completed_at, v_item.attempt_count,
      'provider_state_invalid'::text, 'Provider shell durable state is not completion-safe.'::text;
    return;
  end if;

  select count(*)::integer into v_prior_bad_count
  from public.deployment_activation_execution_items prior_item
  where prior_item.session_id = v_session.id
    and prior_item.sequence < v_item.sequence
    and (prior_item.execution_status is distinct from 'succeeded' or prior_item.attempt_count is distinct from 1 or prior_item.started_at is null or prior_item.completed_at is null or prior_item.completed_at < prior_item.started_at or prior_item.rolled_back_at is not null or prior_item.error_code is not null or prior_item.error_message is not null);

  select count(*)::integer into v_dependency_bad_count
  from jsonb_array_elements_text(coalesce(v_item.dependency_keys, '[]'::jsonb)) dependency_key
  left join public.deployment_activation_execution_items dependency_item
    on dependency_item.session_id = v_session.id
   and dependency_item.plan_item_key = dependency_key
  where dependency_item.id is null
     or dependency_item.sequence >= v_item.sequence
     or dependency_item.execution_status is distinct from 'succeeded';

  select count(*)::integer into v_later_drift_count
  from public.deployment_activation_execution_items later_item
  where later_item.session_id = v_session.id
    and later_item.sequence > v_item.sequence
    and (later_item.execution_status is distinct from 'pending' or later_item.attempt_count <> 0 or later_item.started_at is not null or later_item.completed_at is not null or later_item.rolled_back_at is not null or later_item.error_code is not null or later_item.error_message is not null);

  select count(*)::integer into v_running_or_ready_other_count
  from public.deployment_activation_execution_items other_item
  where other_item.session_id = v_session.id
    and other_item.id <> v_item.id
    and other_item.execution_status in ('running', 'ready');

  if v_prior_bad_count > 0 or v_dependency_bad_count > 0 or v_later_drift_count > 0 or v_running_or_ready_other_count > 0 then
    return query select 'blocked'::text, p_claimant_id, v_session.clinic_id, v_session.deployment_run_key, v_session.id, v_session.execution_key,
      v_item.id, v_item.execution_item_key, v_item.plan_item_key, v_item.sequence, v_item.entity_type,
      v_item.entity_id, v_provider.deployment_provider_key, v_item.action, v_provider.id,
      v_item.execution_status, v_item.execution_status, v_item.started_at, v_item.completed_at, v_item.attempt_count,
      'ordering_integrity_failed'::text, 'Provider-shell item dependency or ordering integrity failed.'::text;
    return;
  end if;

  update public.deployment_activation_execution_items update_item
     set execution_status = 'succeeded',
         completed_at = p_proposed_completed_at
   where update_item.id = v_item.id
     and update_item.session_id = v_session.id
     and update_item.execution_item_key = p_execution_item_key
     and update_item.plan_item_key = p_plan_item_key
     and update_item.sequence = p_expected_sequence
     and update_item.entity_type = 'provider_shell'
     and update_item.entity_id = p_expected_entity_id
     and update_item.deployment_key = p_expected_deployment_provider_key
     and update_item.action = 'activate'
     and update_item.execution_status = 'running'
     and update_item.started_at is not distinct from p_expected_item_started_at
     and update_item.completed_at is null
     and update_item.attempt_count is not distinct from p_expected_attempt_count
     and update_item.rolled_back_at is null
     and update_item.error_code is null
     and update_item.error_message is null;

  get diagnostics v_rows_updated = row_count;

  if v_rows_updated <> 1 then
    return query select 'blocked'::text, p_claimant_id, v_session.clinic_id, v_session.deployment_run_key, v_session.id, v_session.execution_key,
      v_item.id, v_item.execution_item_key, v_item.plan_item_key, v_item.sequence, v_item.entity_type,
      v_item.entity_id, v_provider.deployment_provider_key, v_item.action, v_provider.id,
      v_item.execution_status, v_item.execution_status, v_item.started_at, v_item.completed_at, v_item.attempt_count,
      'stale_state'::text, 'Provider-shell item completion compare-and-set wrote no rows.'::text;
    return;
  end if;

  return query select 'completed'::text, p_claimant_id, v_session.clinic_id, v_session.deployment_run_key, v_session.id, v_session.execution_key,
    v_item.id, v_item.execution_item_key, v_item.plan_item_key, v_item.sequence, v_item.entity_type,
    v_item.entity_id, v_provider.deployment_provider_key, v_item.action, v_provider.id,
    v_item.execution_status, 'succeeded'::text, v_item.started_at, p_proposed_completed_at, v_item.attempt_count,
    null::text, 'Provider-shell execution item was completed. Dependency progression was not attempted.'::text;
end;
$$;

revoke all on function public.complete_deployment_provider_shell_execution_item(
  uuid, text, uuid, text, text, text, timestamptz, uuid, text, text, integer, text, text, text, text, timestamptz, integer, uuid, jsonb, jsonb, timestamptz
) from public, anon, authenticated;

grant execute on function public.complete_deployment_provider_shell_execution_item(
  uuid, text, uuid, text, text, text, timestamptz, uuid, text, text, integer, text, text, text, text, timestamptz, integer, uuid, jsonb, jsonb, timestamptz
) to service_role;
