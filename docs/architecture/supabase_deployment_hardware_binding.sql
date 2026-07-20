-- RC10.2 - Atomic Hardware Binding RPC (V1)
-- Apply manually in the Supabase SQL editor after RC10.1.
--
-- This function is the exclusive V1 mutation boundary for binding one
-- activated deployment hardware row to one activated workstation or
-- sterilizer. It does not complete execution items, progress dependencies,
-- start another item, mutate assignments, finalize, or roll back.

create or replace function public.bind_deployment_hardware_target(
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
  p_expected_action text,
  p_expected_item_started_at timestamptz,
  p_expected_attempt_count integer,
  p_hardware_id uuid,
  p_expected_hardware_key text,
  p_target_type text,
  p_target_id uuid,
  p_expected_target_deployment_key text,
  p_expected_current_state jsonb,
  p_target_state jsonb,
  p_proposed_bound_at timestamptz
)
returns table (
  status text,
  binding_written boolean,
  clinic_id uuid,
  deployment_run_key text,
  session_id uuid,
  execution_key text,
  item_id uuid,
  execution_item_key text,
  plan_item_key text,
  sequence integer,
  hardware_id uuid,
  deployment_hardware_key text,
  target_id uuid,
  target_type text,
  target_deployment_key text,
  previous_state jsonb,
  resulting_state jsonb,
  binding_timestamp timestamptz,
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
  v_hardware public.clinical_hardware_devices%rowtype;
  v_assignment public.deployment_hardware_assignments%rowtype;
  v_workstation public.clinical_workstations%rowtype;
  v_sterilizer public.sterilizers%rowtype;
  v_expected_state jsonb;
  v_target_state jsonb;
  v_updated_count integer;
  v_assignment_count integer;
  v_target_count integer;
  v_dependency_count integer;
  v_succeeded_dependency_count integer;
begin
  clinic_id := p_clinic_id;
  deployment_run_key := p_deployment_run_key;
  session_id := p_session_id;
  execution_key := p_execution_key;
  item_id := p_item_id;
  execution_item_key := p_execution_item_key;
  plan_item_key := p_plan_item_key;
  sequence := p_expected_sequence;
  hardware_id := p_hardware_id;
  deployment_hardware_key := p_expected_hardware_key;
  target_id := p_target_id;
  target_type := p_target_type;
  target_deployment_key := p_expected_target_deployment_key;
  binding_written := false;
  previous_state := null;
  resulting_state := null;
  binding_timestamp := null;
  issue_code := null;

  if p_clinic_id is null
     or p_session_id is null
     or p_item_id is null
     or p_hardware_id is null
     or p_target_id is null
     or p_deployment_run_key is null or length(btrim(p_deployment_run_key)) = 0
     or p_execution_key is null or length(btrim(p_execution_key)) = 0
     or p_execution_item_key is null or length(btrim(p_execution_item_key)) = 0
     or p_plan_item_key is null or length(btrim(p_plan_item_key)) = 0
     or p_expected_entity_id is null or length(btrim(p_expected_entity_id)) = 0
     or p_expected_hardware_key is null or length(btrim(p_expected_hardware_key)) = 0
     or p_expected_target_deployment_key is null or length(btrim(p_expected_target_deployment_key)) = 0
     or p_proposed_bound_at is null then
    status := 'blocked';
    issue_code := 'binding_identity_invalid';
    message := 'Binding execution, hardware, target, deterministic keys, and timestamp are required.';
    return next;
    return;
  end if;

  if p_claimant_id is null or length(btrim(p_claimant_id)) = 0 then
    status := 'blocked';
    issue_code := 'claimant_invalid';
    message := 'Claimant id is required.';
    return next;
    return;
  end if;

  if p_ownership_token is null or length(btrim(p_ownership_token)) = 0 then
    status := 'blocked';
    issue_code := 'ownership_token_invalid';
    message := 'Ownership token is required.';
    return next;
    return;
  end if;

  if p_target_type not in ('workstation', 'sterilizer') then
    status := 'blocked';
    issue_code := 'unsupported_target_type';
    message := 'Hardware bindings support only workstation or sterilizer targets in V1.';
    return next;
    return;
  end if;

  if p_expected_current_state is null
     or jsonb_typeof(p_expected_current_state) <> 'object'
     or p_target_state is null
     or jsonb_typeof(p_target_state) <> 'object' then
    status := 'blocked';
    issue_code := 'binding_state_invalid';
    message := 'Binding expected and target state evidence must be JSON objects.';
    return next;
    return;
  end if;

  v_expected_state := jsonb_build_object(
    'deploymentHardwareKey', p_expected_hardware_key,
    'hardwareId', p_hardware_id,
    'targetDeploymentKey', p_expected_target_deployment_key,
    'targetId', null,
    'targetType', p_target_type
  );
  v_target_state := jsonb_build_object(
    'hardwareId', p_hardware_id,
    'targetDeploymentKey', p_expected_target_deployment_key,
    'targetId', p_target_id,
    'targetType', p_target_type
  );

  if p_expected_current_state is distinct from v_expected_state
     or p_target_state is distinct from v_target_state then
    status := 'blocked';
    issue_code := 'binding_state_contract_invalid';
    message := 'Binding state evidence does not match the authoritative V1 unbound-to-bound contract.';
    return next;
    return;
  end if;

  select session_row.*
    into v_session
    from public.deployment_activation_execution_sessions session_row
   where session_row.id = p_session_id
     and session_row.clinic_id = p_clinic_id
     and session_row.deployment_run_key = p_deployment_run_key
     and session_row.execution_key = p_execution_key
   for update;

  if not found then
    status := 'not_found';
    issue_code := 'missing_session';
    message := 'Activation execution session was not found.';
    return next;
    return;
  end if;

  clinic_id := v_session.clinic_id;
  deployment_run_key := v_session.deployment_run_key;
  session_id := v_session.id;
  execution_key := v_session.execution_key;

  select item_row.*
    into v_item
    from public.deployment_activation_execution_items item_row
   where item_row.id = p_item_id
     and item_row.session_id = v_session.id
     and item_row.clinic_id = p_clinic_id
     and item_row.deployment_run_key = p_deployment_run_key
     and item_row.execution_key = p_execution_key
   for update;

  if not found then
    status := 'not_found';
    issue_code := 'missing_item';
    message := 'Hardware binding execution item was not found.';
    return next;
    return;
  end if;

  item_id := v_item.id;
  execution_item_key := v_item.execution_item_key;
  plan_item_key := v_item.plan_item_key;
  sequence := v_item.sequence;

  select hardware_row.*
    into v_hardware
    from public.clinical_hardware_devices hardware_row
   where hardware_row.id = p_hardware_id
     and hardware_row.clinic_id = p_clinic_id
     and hardware_row.deployment_hardware_key = p_expected_hardware_key
   for update;

  if not found then
    status := 'not_found';
    issue_code := 'missing_hardware';
    message := 'Deployment hardware binding source was not found.';
    return next;
    return;
  end if;

  hardware_id := v_hardware.id;
  deployment_hardware_key := v_hardware.deployment_hardware_key;
  previous_state := jsonb_build_object(
    'defaultWorkstationId', v_hardware.default_workstation_id,
    'currentWorkstationId', v_hardware.current_workstation_id,
    'defaultSterilizerId', v_hardware.default_sterilizer_id,
    'currentSterilizerId', v_hardware.current_sterilizer_id
  );
  resulting_state := previous_state;

  select assignment_row.*
    into v_assignment
    from public.deployment_hardware_assignments assignment_row
   where assignment_row.clinic_id = p_clinic_id
     and assignment_row.deployment_hardware_key = p_expected_hardware_key
   for share;

  if not found then
    status := 'not_found';
    issue_code := 'missing_assignment_evidence';
    message := 'Hardware assignment planning evidence was not found.';
    return next;
    return;
  end if;

  if p_target_type = 'workstation' then
    select workstation_row.*
      into v_workstation
      from public.clinical_workstations workstation_row
     where workstation_row.id = p_target_id
       and workstation_row.clinic_id = p_clinic_id
       and workstation_row.deployment_workstation_key = p_expected_target_deployment_key
     for share;
  else
    select sterilizer_row.*
      into v_sterilizer
      from public.sterilizers sterilizer_row
     where sterilizer_row.id = p_target_id
       and sterilizer_row.clinic_id = p_clinic_id
       and sterilizer_row.deployment_sterilizer_key = p_expected_target_deployment_key
     for share;
  end if;

  if not found then
    status := 'not_found';
    issue_code := 'missing_binding_target';
    message := 'Clinic-scoped deployment binding target was not found.';
    return next;
    return;
  end if;

  if v_session.preparation_status is distinct from 'ready'
     or v_session.execution_status is distinct from 'running'
     or v_session.started_at is null
     or v_session.completed_at is not null
     or v_session.failed_at is not null then
    status := 'blocked';
    issue_code := 'session_not_binding_safe';
    message := 'Activation execution session is not binding-safe.';
    return next;
    return;
  end if;

  if v_session.execution_owner is distinct from p_claimant_id
     or v_session.ownership_token is distinct from p_ownership_token
     or v_session.lease_expires_at is distinct from p_expected_lease_expires_at then
    status := 'conflict';
    issue_code := 'ownership_compare_failed';
    message := 'Execution ownership compare-and-set failed.';
    return next;
    return;
  end if;

  if v_session.lease_expires_at is null
     or v_session.lease_expires_at <= p_proposed_bound_at then
    status := 'blocked';
    issue_code := 'lease_not_active';
    message := 'Execution lease is not active at the proposed binding timestamp.';
    return next;
    return;
  end if;

  if v_item.execution_item_key is distinct from p_execution_item_key
     or v_item.plan_item_key is distinct from p_plan_item_key
     or v_item.sequence is distinct from p_expected_sequence
     or v_item.entity_type is distinct from p_expected_entity_type
     or v_item.entity_id::text is distinct from p_expected_entity_id
     or v_item.entity_id::text is distinct from p_hardware_id::text
     or p_expected_entity_id is distinct from p_hardware_id::text
     or v_item.action is distinct from p_expected_action
     or v_item.deployment_key is distinct from p_expected_hardware_key
     or p_expected_entity_type is distinct from 'hardware_binding'
     or p_expected_action is distinct from 'bind' then
    status := 'conflict';
    issue_code := 'item_identity_compare_failed';
    message := 'Hardware binding item identity compare-and-set failed.';
    return next;
    return;
  end if;

  if v_item.execution_status is distinct from 'running'
     or v_item.attempt_count is distinct from p_expected_attempt_count
     or p_expected_attempt_count is distinct from 1
     or v_item.started_at is distinct from p_expected_item_started_at
     or v_item.completed_at is not null
     or v_item.rolled_back_at is not null
     or v_item.error_code is not null
     or v_item.error_message is not null then
    status := 'blocked';
    issue_code := 'item_not_binding_safe';
    message := 'Hardware binding execution item is not running and binding-safe.';
    return next;
    return;
  end if;

  if v_item.expected_current_state is distinct from p_expected_current_state
     or v_item.target_state is distinct from p_target_state then
    status := 'conflict';
    issue_code := 'item_state_compare_failed';
    message := 'Persisted planner binding evidence does not match the request.';
    return next;
    return;
  end if;

  if jsonb_typeof(coalesce(v_item.dependency_keys, '[]'::jsonb)) <> 'array' then
    status := 'blocked';
    issue_code := 'dependency_integrity_invalid';
    message := 'Hardware binding dependency evidence is malformed.';
    return next;
    return;
  end if;

  select jsonb_array_length(coalesce(v_item.dependency_keys, '[]'::jsonb))::integer
    into v_dependency_count;
  select count(*)::integer
    into v_succeeded_dependency_count
    from jsonb_array_elements_text(coalesce(v_item.dependency_keys, '[]'::jsonb)) dependency_key(value)
    join public.deployment_activation_execution_items dependency_item
      on dependency_item.session_id = v_session.id
     and dependency_item.plan_item_key = dependency_key.value
     and dependency_item.sequence < v_item.sequence
     and dependency_item.execution_status = 'succeeded'
     and dependency_item.attempt_count = 1
     and dependency_item.started_at is not null
     and dependency_item.completed_at is not null
     and dependency_item.rolled_back_at is null
     and dependency_item.error_code is null
     and dependency_item.error_message is null;

  if v_dependency_count = 0
     or v_dependency_count <> v_succeeded_dependency_count then
    status := 'blocked';
    issue_code := 'dependency_integrity_invalid';
    message := 'Hardware binding dependencies are not uniquely satisfied.';
    return next;
    return;
  end if;

  select count(*)::integer
    into v_assignment_count
    from public.deployment_hardware_assignments assignment_row
   where assignment_row.clinic_id = p_clinic_id
     and assignment_row.deployment_hardware_key = p_expected_hardware_key;

  if v_assignment_count is distinct from 1
     or v_assignment.target_type is distinct from p_target_type
     or v_assignment.target_deployment_key is distinct from p_expected_target_deployment_key
     or v_assignment.assignment_status is distinct from 'planned'
     or v_assignment.assignment_source is distinct from 'setup_draft'
     or v_assignment.active is distinct from false then
    status := 'conflict';
    issue_code := 'assignment_evidence_invalid';
    message := 'Hardware assignment planning evidence does not authorize this binding.';
    return next;
    return;
  end if;

  if v_hardware.provisioning_source is distinct from 'setup_draft'
     or v_hardware.provisioning_status is distinct from 'active'
     or v_hardware.active is distinct from true then
    status := 'blocked';
    issue_code := 'hardware_not_activated';
    message := 'Hardware must be an activated deployment shell before binding.';
    return next;
    return;
  end if;

  if p_target_type = 'workstation' then
    select count(*)::integer
      into v_target_count
      from public.clinical_workstations target_row
     where target_row.clinic_id = p_clinic_id
       and target_row.deployment_workstation_key = p_expected_target_deployment_key;

    if v_target_count is distinct from 1
       or v_workstation.provisioning_source is distinct from 'setup_draft'
       or v_workstation.provisioning_status is distinct from 'active'
       or v_workstation.active is distinct from true then
      status := 'blocked';
      issue_code := 'workstation_target_not_activated';
      message := 'Workstation target identity must be unique and activated.';
      return next;
      return;
    end if;
  else
    select count(*)::integer
      into v_target_count
      from public.sterilizers target_row
     where target_row.clinic_id = p_clinic_id
       and target_row.deployment_sterilizer_key = p_expected_target_deployment_key;

    if v_target_count is distinct from 1
       or v_sterilizer.provisioning_source is distinct from 'setup_draft'
       or v_sterilizer.provisioning_status is distinct from 'active'
       or v_sterilizer.active is distinct from true then
      status := 'blocked';
      issue_code := 'sterilizer_target_not_activated';
      message := 'Sterilizer target identity must be unique and activated.';
      return next;
      return;
    end if;
  end if;

  if p_target_type = 'workstation'
     and v_hardware.default_workstation_id = p_target_id
     and v_hardware.current_workstation_id = p_target_id
     and v_hardware.default_sterilizer_id is null
     and v_hardware.current_sterilizer_id is null then
    status := 'already_bound';
    resulting_state := previous_state;
    binding_timestamp := v_hardware.updated_at;
    message := 'Hardware already has the exact workstation binding. No row was changed.';
    return next;
    return;
  end if;

  if p_target_type = 'sterilizer'
     and v_hardware.default_sterilizer_id = p_target_id
     and v_hardware.current_sterilizer_id = p_target_id
     and v_hardware.default_workstation_id is null
     and v_hardware.current_workstation_id is null then
    status := 'already_bound';
    resulting_state := previous_state;
    binding_timestamp := v_hardware.updated_at;
    message := 'Hardware already has the exact sterilizer binding. No row was changed.';
    return next;
    return;
  end if;

  if v_hardware.default_workstation_id is not null
     or v_hardware.current_workstation_id is not null
     or v_hardware.default_sterilizer_id is not null
     or v_hardware.current_sterilizer_id is not null then
    status := 'conflict';
    issue_code := case
      when (v_hardware.default_workstation_id is not null or v_hardware.current_workstation_id is not null)
       and (v_hardware.default_sterilizer_id is not null or v_hardware.current_sterilizer_id is not null)
        then 'mixed_binding_state'
      else 'conflicting_binding'
    end;
    message := 'Hardware has a partial, mixed-family, or different existing binding.';
    return next;
    return;
  end if;

  if p_target_type = 'workstation' then
    update public.clinical_hardware_devices update_hardware
       set default_workstation_id = p_target_id,
           current_workstation_id = p_target_id,
           default_sterilizer_id = null,
           current_sterilizer_id = null
     where update_hardware.id = v_hardware.id
       and update_hardware.clinic_id = p_clinic_id
       and update_hardware.deployment_hardware_key = p_expected_hardware_key
       and update_hardware.default_workstation_id is null
       and update_hardware.current_workstation_id is null
       and update_hardware.default_sterilizer_id is null
       and update_hardware.current_sterilizer_id is null;
  else
    update public.clinical_hardware_devices update_hardware
       set default_sterilizer_id = p_target_id,
           current_sterilizer_id = p_target_id,
           default_workstation_id = null,
           current_workstation_id = null
     where update_hardware.id = v_hardware.id
       and update_hardware.clinic_id = p_clinic_id
       and update_hardware.deployment_hardware_key = p_expected_hardware_key
       and update_hardware.default_workstation_id is null
       and update_hardware.current_workstation_id is null
       and update_hardware.default_sterilizer_id is null
       and update_hardware.current_sterilizer_id is null;
  end if;

  get diagnostics v_updated_count = row_count;

  if v_updated_count is distinct from 1 then
    status := 'conflict';
    issue_code := 'binding_compare_failed';
    message := 'Hardware binding compare-and-set failed.';
    return next;
    return;
  end if;

  select hardware_row.*
    into v_hardware
    from public.clinical_hardware_devices hardware_row
   where hardware_row.id = p_hardware_id;

  status := 'bound';
  binding_written := true;
  resulting_state := jsonb_build_object(
    'defaultWorkstationId', v_hardware.default_workstation_id,
    'currentWorkstationId', v_hardware.current_workstation_id,
    'defaultSterilizerId', v_hardware.default_sterilizer_id,
    'currentSterilizerId', v_hardware.current_sterilizer_id
  );
  binding_timestamp := v_hardware.updated_at;
  message := 'Hardware binding was written atomically.';
  return next;
  return;
exception
  when others then
    status := 'error';
    binding_written := false;
    issue_code := 'hardware_binding_rpc_error';
    message := 'Hardware binding failed inside the atomic persistence boundary.';
    return next;
    return;
end;
$$;

revoke all on function public.bind_deployment_hardware_target(
  uuid, text, uuid, text, text, text, timestamptz, uuid, text, text,
  integer, text, text, text, timestamptz, integer, uuid, text, text,
  uuid, text, jsonb, jsonb, timestamptz
) from public;

revoke all on function public.bind_deployment_hardware_target(
  uuid, text, uuid, text, text, text, timestamptz, uuid, text, text,
  integer, text, text, text, timestamptz, integer, uuid, text, text,
  uuid, text, jsonb, jsonb, timestamptz
) from anon;

revoke all on function public.bind_deployment_hardware_target(
  uuid, text, uuid, text, text, text, timestamptz, uuid, text, text,
  integer, text, text, text, timestamptz, integer, uuid, text, text,
  uuid, text, jsonb, jsonb, timestamptz
) from authenticated;

grant execute on function public.bind_deployment_hardware_target(
  uuid, text, uuid, text, text, text, timestamptz, uuid, text, text,
  integer, text, text, text, timestamptz, integer, uuid, text, text,
  uuid, text, jsonb, jsonb, timestamptz
) to service_role;
