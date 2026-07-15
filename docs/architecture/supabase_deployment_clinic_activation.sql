-- RC8 Slice 6B clinic activation atomic boundary.
-- Mutates only public.clinics deployment_status/deployed_at for the sequence-1 clinic activation item.
-- It does not complete the execution item, unlock dependencies, activate shells/hardware, bind hardware, finalize deployment, or rollback.

create or replace function public.activate_deployment_clinic(
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
  p_expected_item_started_at timestamptz,
  p_expected_attempt_count integer,
  p_expected_current_state jsonb,
  p_target_state jsonb,
  p_proposed_activated_at timestamptz
)
returns table (
  status text,
  clinic_id uuid,
  deployment_run_key text,
  session_id uuid,
  execution_key text,
  item_id uuid,
  execution_item_key text,
  plan_item_key text,
  clinic_state_before jsonb,
  clinic_state_after jsonb,
  activated_at timestamptz,
  issue_code text,
  message text
)
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_session public.deployment_activation_execution_sessions%rowtype;
  v_item public.deployment_activation_execution_items%rowtype;
  v_clinic public.clinics%rowtype;
  v_run_link public.deployment_runs%rowtype;
  v_state_before jsonb;
  v_state_after jsonb;
  v_expected_clinic_id text;
  v_expected_deployment_status text;
  v_target_deployment_status text;
begin
  if p_claimant_id is null or length(btrim(p_claimant_id)) = 0 then
    return query select 'blocked'::text, p_clinic_id, p_deployment_run_key, p_session_id, p_execution_key,
      p_item_id, p_execution_item_key, p_plan_item_key, null::jsonb, null::jsonb, null::timestamptz,
      'claimant_invalid'::text, 'Claimant id is required.'::text;
    return;
  end if;

  if p_ownership_token is null or length(btrim(p_ownership_token)) = 0 then
    return query select 'blocked'::text, p_clinic_id, p_deployment_run_key, p_session_id, p_execution_key,
      p_item_id, p_execution_item_key, p_plan_item_key, null::jsonb, null::jsonb, null::timestamptz,
      'ownership_token_invalid'::text, 'Ownership token is required.'::text;
    return;
  end if;

  if p_expected_current_state is null or jsonb_typeof(p_expected_current_state) <> 'object' then
    return query select 'blocked'::text, p_clinic_id, p_deployment_run_key, p_session_id, p_execution_key,
      p_item_id, p_execution_item_key, p_plan_item_key, null::jsonb, null::jsonb, null::timestamptz,
      'expected_state_invalid'::text, 'Expected current state must be a JSON object.'::text;
    return;
  end if;

  if p_target_state is null or jsonb_typeof(p_target_state) <> 'object' then
    return query select 'blocked'::text, p_clinic_id, p_deployment_run_key, p_session_id, p_execution_key,
      p_item_id, p_execution_item_key, p_plan_item_key, null::jsonb, null::jsonb, null::timestamptz,
      'target_state_invalid'::text, 'Target state must be a JSON object.'::text;
    return;
  end if;

  select *
  into v_session
  from public.deployment_activation_execution_sessions activation_session
  where activation_session.clinic_id = p_clinic_id
    and activation_session.deployment_run_key = p_deployment_run_key
    and activation_session.id = p_session_id
    and activation_session.execution_key = p_execution_key
  for update;

  if not found then
    return query select 'not_found'::text, p_clinic_id, p_deployment_run_key, p_session_id, p_execution_key,
      p_item_id, p_execution_item_key, p_plan_item_key, null::jsonb, null::jsonb, null::timestamptz,
      'missing_session'::text, 'Activation execution session was not found.'::text;
    return;
  end if;

  select *
  into v_item
  from public.deployment_activation_execution_items activation_item
  where activation_item.session_id = v_session.id
    and activation_item.id = p_item_id
    and activation_item.execution_item_key = p_execution_item_key
    and activation_item.plan_item_key = p_plan_item_key
  for update;

  if not found then
    return query select 'not_found'::text, p_clinic_id, p_deployment_run_key, v_session.id, v_session.execution_key,
      p_item_id, p_execution_item_key, p_plan_item_key, null::jsonb, null::jsonb, null::timestamptz,
      'missing_item'::text, 'Clinic activation execution item was not found.'::text;
    return;
  end if;

  select *
  into v_clinic
  from public.clinics activation_clinic
  where activation_clinic.id = p_clinic_id
  for update;

  if not found then
    return query select 'not_found'::text, p_clinic_id, p_deployment_run_key, v_session.id, v_session.execution_key,
      v_item.id, v_item.execution_item_key, v_item.plan_item_key, null::jsonb, null::jsonb, null::timestamptz,
      'missing_clinic'::text, 'Clinic activation target was not found.'::text;
    return;
  end if;

  select *
  into v_run_link
  from public.deployment_runs activation_run
  where activation_run.deployment_run_id = p_deployment_run_key
    and activation_run.clinic_id = p_clinic_id;

  if not found then
    return query select 'conflict'::text, v_clinic.id, p_deployment_run_key, v_session.id, v_session.execution_key,
      v_item.id, v_item.execution_item_key, v_item.plan_item_key, null::jsonb, null::jsonb, null::timestamptz,
      'deployment_ownership_mismatch'::text, 'Clinic is not linked to the expected deployment run.'::text;
    return;
  end if;

  v_state_before := jsonb_build_object('clinicId', v_clinic.id::text, 'deploymentStatus', v_clinic.deployment_status);
  v_expected_clinic_id := coalesce(p_expected_current_state->>'clinicId', p_expected_current_state->>'clinic_id');
  v_expected_deployment_status := coalesce(p_expected_current_state->>'deploymentStatus', p_expected_current_state->>'deployment_status');
  v_target_deployment_status := coalesce(p_target_state->>'deploymentStatus', p_target_state->>'deployment_status');

  if v_session.execution_owner is distinct from p_claimant_id
    or v_session.ownership_token is distinct from p_ownership_token
    or v_session.lease_expires_at is distinct from p_expected_lease_expires_at
  then
    return query select 'conflict'::text, v_clinic.id, p_deployment_run_key, v_session.id, v_session.execution_key,
      v_item.id, v_item.execution_item_key, v_item.plan_item_key, v_state_before, v_state_before, v_clinic.deployed_at,
      'ownership_compare_failed'::text, 'Execution session ownership compare-and-set failed.'::text;
    return;
  end if;

  if v_session.preparation_status <> 'ready'
    or v_session.execution_status <> 'running'
    or v_session.started_at is null
    or v_session.completed_at is not null
    or v_session.failed_at is not null
  then
    return query select 'blocked'::text, v_clinic.id, p_deployment_run_key, v_session.id, v_session.execution_key,
      v_item.id, v_item.execution_item_key, v_item.plan_item_key, v_state_before, v_state_before, v_clinic.deployed_at,
      'session_not_activation_safe'::text, 'Activation execution session is not activation-safe.'::text;
    return;
  end if;

  if v_session.lease_expires_at is null or v_session.lease_expires_at <= p_proposed_activated_at then
    return query select 'blocked'::text, v_clinic.id, p_deployment_run_key, v_session.id, v_session.execution_key,
      v_item.id, v_item.execution_item_key, v_item.plan_item_key, v_state_before, v_state_before, v_clinic.deployed_at,
      'lease_not_active'::text, 'Activation execution session lease is not active at the proposed clinic activation timestamp.'::text;
    return;
  end if;

  if v_item.sequence <> 1
    or v_item.entity_type <> 'clinic'
    or v_item.action <> 'activate'
    or v_item.execution_status <> 'running'
    or v_item.attempt_count is distinct from p_expected_attempt_count
    or p_expected_attempt_count <> 1
    or v_item.started_at is distinct from p_expected_item_started_at
    or v_item.completed_at is not null
    or v_item.rolled_back_at is not null
    or v_item.error_code is not null
    or v_item.error_message is not null
  then
    return query select 'blocked'::text, v_clinic.id, p_deployment_run_key, v_session.id, v_session.execution_key,
      v_item.id, v_item.execution_item_key, v_item.plan_item_key, v_state_before, v_state_before, v_clinic.deployed_at,
      'item_not_activation_safe'::text, 'Clinic activation item is not activation-safe.'::text;
    return;
  end if;

  if jsonb_typeof(v_item.dependency_keys) <> 'array' or jsonb_array_length(v_item.dependency_keys) <> 0 then
    return query select 'blocked'::text, v_clinic.id, p_deployment_run_key, v_session.id, v_session.execution_key,
      v_item.id, v_item.execution_item_key, v_item.plan_item_key, v_state_before, v_state_before, v_clinic.deployed_at,
      'item_dependency_present'::text, 'Clinic activation item must not have dependencies.'::text;
    return;
  end if;

  -- deployment_key is intentionally not compared to p_clinic_id; it is not a clinic UUID in the activation-plan contract.
  if v_item.entity_id::text is distinct from p_clinic_id::text
  then
    return query select 'conflict'::text, v_clinic.id, p_deployment_run_key, v_session.id, v_session.execution_key,
      v_item.id, v_item.execution_item_key, v_item.plan_item_key, v_state_before, v_state_before, v_clinic.deployed_at,
      'item_clinic_identity_mismatch'::text, 'Clinic activation item identity does not match the clinic.'::text;
    return;
  end if;

  if v_item.expected_current_state is distinct from p_expected_current_state
    or v_item.target_state is distinct from p_target_state
  then
    return query select 'conflict'::text, v_clinic.id, p_deployment_run_key, v_session.id, v_session.execution_key,
      v_item.id, v_item.execution_item_key, v_item.plan_item_key, v_state_before, v_state_before, v_clinic.deployed_at,
      'item_state_compare_failed'::text, 'Clinic activation item state evidence compare-and-set failed.'::text;
    return;
  end if;

  if v_target_deployment_status <> 'active'
    or p_target_state not in ('{"deploymentStatus":"active"}'::jsonb, '{"deployment_status":"active"}'::jsonb)
  then
    return query select 'blocked'::text, v_clinic.id, p_deployment_run_key, v_session.id, v_session.execution_key,
      v_item.id, v_item.execution_item_key, v_item.plan_item_key, v_state_before, v_state_before, v_clinic.deployed_at,
      'unsupported_target_state'::text, 'Clinic activation target state is not supported.'::text;
    return;
  end if;

  if v_clinic.deployment_status = 'active' then
    if v_clinic.deployed_at is null then
      return query select 'conflict'::text, v_clinic.id, p_deployment_run_key, v_session.id, v_session.execution_key,
        v_item.id, v_item.execution_item_key, v_item.plan_item_key, v_state_before, v_state_before, v_clinic.deployed_at,
        'already_active_incompatible'::text, 'Clinic is active without durable activation timestamp evidence.'::text;
      return;
    end if;

    v_state_after := v_state_before;
    return query select 'already_activated'::text, v_clinic.id, p_deployment_run_key, v_session.id, v_session.execution_key,
      v_item.id, v_item.execution_item_key, v_item.plan_item_key, v_state_before, v_state_after, v_clinic.deployed_at,
      null::text, 'Clinic already matches the activation target. No timestamp or execution item was changed.'::text;
    return;
  end if;

  if v_clinic.deployment_status <> 'draft'
    or v_expected_clinic_id is distinct from v_clinic.id::text
    or v_expected_deployment_status is distinct from v_clinic.deployment_status
  then
    return query select 'conflict'::text, v_clinic.id, p_deployment_run_key, v_session.id, v_session.execution_key,
      v_item.id, v_item.execution_item_key, v_item.plan_item_key, v_state_before, v_state_before, v_clinic.deployed_at,
      'clinic_state_compare_failed'::text, 'Clinic current state does not match expected activation evidence.'::text;
    return;
  end if;

  update public.clinics update_clinic
  set deployment_status = 'active',
      deployed_at = p_proposed_activated_at
  where update_clinic.id = v_clinic.id
  returning * into v_clinic;

  v_state_after := jsonb_build_object('clinicId', v_clinic.id::text, 'deploymentStatus', v_clinic.deployment_status);

  return query select 'activated'::text, v_clinic.id, p_deployment_run_key, v_session.id, v_session.execution_key,
    v_item.id, v_item.execution_item_key, v_item.plan_item_key, v_state_before, v_state_after, v_clinic.deployed_at,
    null::text, 'Clinic deployment status was activated. Execution item remains running.'::text;
end;
$$;

comment on function public.activate_deployment_clinic(
  uuid,
  text,
  uuid,
  text,
  text,
  text,
  timestamptz,
  uuid,
  text,
  text,
  timestamptz,
  integer,
  jsonb,
  jsonb,
  timestamptz
) is
  'Atomically activates the clinic deployment_status/deployed_at for the running sequence-1 clinic activation item. It does not complete items, unlock dependencies, activate shells or hardware, bind hardware, finalize deployment, renew leases, rotate tokens, heartbeat, or rollback.';

revoke all on function public.activate_deployment_clinic(
  uuid,
  text,
  uuid,
  text,
  text,
  text,
  timestamptz,
  uuid,
  text,
  text,
  timestamptz,
  integer,
  jsonb,
  jsonb,
  timestamptz
) from public;

revoke all on function public.activate_deployment_clinic(
  uuid,
  text,
  uuid,
  text,
  text,
  text,
  timestamptz,
  uuid,
  text,
  text,
  timestamptz,
  integer,
  jsonb,
  jsonb,
  timestamptz
) from anon;

revoke all on function public.activate_deployment_clinic(
  uuid,
  text,
  uuid,
  text,
  text,
  text,
  timestamptz,
  uuid,
  text,
  text,
  timestamptz,
  integer,
  jsonb,
  jsonb,
  timestamptz
) from authenticated;

grant execute on function public.activate_deployment_clinic(
  uuid,
  text,
  uuid,
  text,
  text,
  text,
  timestamptz,
  uuid,
  text,
  text,
  timestamptz,
  integer,
  jsonb,
  jsonb,
  timestamptz
) to service_role;