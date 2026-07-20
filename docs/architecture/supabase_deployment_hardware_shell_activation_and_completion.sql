-- RC9 Slice 3D1A - hardware atomic activation and execution-item completion persistence primitives.
-- Forward-only migration draft. Apply manually in the Supabase SQL editor after review.

-- Atomic hardware shell activation boundary.
-- Apply manually in the Supabase SQL editor after review.
-- This function activates only the selected hardware shell referenced by the currently running hardware_shell item.
-- It does not complete items, progress dependencies, start items, mutate sessions, renew leases, rotate tokens, finalize deployment, or rollback.

create or replace function public.activate_deployment_hardware_shell(
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
  sequence integer,
  hardware_id uuid,
  deployment_hardware_key text,
  hardware_state_before jsonb,
  hardware_state_after jsonb,
  activated_at timestamptz,
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
  v_state_before jsonb;
  v_state_after jsonb;
  v_item_transition_state jsonb;
  v_transition_differences jsonb;
  v_transition_differing_fields jsonb;
  v_running_count integer;
  v_ready_count integer;
  v_total_items integer;
  v_duplicate_item_identity_count integer;
  v_duplicate_hardware_identity_count integer;
  v_succeeded_prefix_length integer;
  v_later_drift_count integer;
  v_dependency_count integer;
  v_distinct_dependency_count integer;
  v_succeeded_dependency_count integer;
begin
  if p_hardware_id is null or p_expected_hardware_key is null or length(btrim(p_expected_hardware_key)) = 0
     or p_expected_entity_id is null or length(btrim(p_expected_entity_id)) = 0
     or p_proposed_activated_at is null then
    return query select 'blocked'::text, p_clinic_id, p_deployment_run_key, p_session_id, p_execution_key,
      p_item_id, p_execution_item_key, p_plan_item_key, p_expected_sequence, p_hardware_id, p_expected_hardware_key,
      null::jsonb, null::jsonb, null::timestamptz, 'hardware_identity_invalid'::text, 'Hardware UUID, deterministic key, entity identity, and activation timestamp are required.'::text;
    return;
  end if;

  if p_claimant_id is null or length(btrim(p_claimant_id)) = 0 then
    return query select 'blocked'::text, p_clinic_id, p_deployment_run_key, p_session_id, p_execution_key,
      p_item_id, p_execution_item_key, p_plan_item_key, p_expected_sequence, p_hardware_id, p_expected_hardware_key,
      null::jsonb, null::jsonb, null::timestamptz, 'claimant_invalid'::text, 'Claimant id is required.'::text;
    return;
  end if;

  if p_ownership_token is null or length(btrim(p_ownership_token)) = 0 then
    return query select 'blocked'::text, p_clinic_id, p_deployment_run_key, p_session_id, p_execution_key,
      p_item_id, p_execution_item_key, p_plan_item_key, p_expected_sequence, p_hardware_id, p_expected_hardware_key,
      null::jsonb, null::jsonb, null::timestamptz, 'ownership_token_invalid'::text, 'Ownership token is required.'::text;
    return;
  end if;

  if p_expected_current_state is null or jsonb_typeof(p_expected_current_state) <> 'object'
     or p_target_state is null or jsonb_typeof(p_target_state) <> 'object' then
    return query select 'blocked'::text, p_clinic_id, p_deployment_run_key, p_session_id, p_execution_key,
      p_item_id, p_execution_item_key, p_plan_item_key, p_expected_sequence, p_hardware_id, p_expected_hardware_key,
      null::jsonb, null::jsonb, null::timestamptz, 'state_evidence_invalid'::text, 'Hardware activation state evidence must be JSON objects.'::text;
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
    return query select 'not_found'::text, p_clinic_id, p_deployment_run_key, p_session_id, p_execution_key,
      p_item_id, p_execution_item_key, p_plan_item_key, p_expected_sequence, p_hardware_id, p_expected_hardware_key,
      null::jsonb, null::jsonb, null::timestamptz, 'missing_session'::text, 'Activation execution session was not found.'::text;
    return;
  end if;

  select item_row.*
    into v_item
    from public.deployment_activation_execution_items item_row
   where item_row.id = p_item_id
     and item_row.session_id = v_session.id
   for update;

  if not found then
    return query select 'not_found'::text, v_session.clinic_id, v_session.deployment_run_key, v_session.id, v_session.execution_key,
      p_item_id, p_execution_item_key, p_plan_item_key, p_expected_sequence, p_hardware_id, p_expected_hardware_key,
      null::jsonb, null::jsonb, null::timestamptz, 'missing_item'::text, 'Hardware activation execution item was not found.'::text;
    return;
  end if;

  select hardware_row.*
    into v_hardware
    from public.clinical_hardware_devices hardware_row
   where hardware_row.id = p_hardware_id
     and hardware_row.clinic_id = p_clinic_id
     and hardware_row.deployment_hardware_key = p_expected_hardware_key
   for update;

  if not found then
    return query select 'not_found'::text, v_session.clinic_id, v_session.deployment_run_key, v_session.id, v_session.execution_key,
      v_item.id, v_item.execution_item_key, v_item.plan_item_key, v_item.sequence, p_hardware_id, p_expected_hardware_key,
      null::jsonb, null::jsonb, null::timestamptz, 'missing_hardware_shell'::text, 'Hardware shell activation target was not found.'::text;
    return;
  end if;

  v_state_before := jsonb_build_object(
    'deploymentHardwareKey', v_hardware.deployment_hardware_key,
    'provisioningSource', v_hardware.provisioning_source,
    'provisioningStatus', v_hardware.provisioning_status,
    'active', v_hardware.active,
    'operationalStatus', v_hardware.status,
    'agentId', v_hardware.agent_id,
    'defaultWorkstationId', v_hardware.default_workstation_id,
    'currentWorkstationId', v_hardware.current_workstation_id
  );

  if jsonb_typeof(v_item.expected_current_state) = 'object' then
    select coalesce(jsonb_object_agg(item_state.key, item_state.value), '{}'::jsonb)
      into v_item_transition_state
      from jsonb_each(v_item.expected_current_state) item_state
     where item_state.key in (
       'deploymentHardwareKey', 'provisioningSource', 'provisioningStatus', 'active',
       'operationalStatus', 'agentId', 'defaultWorkstationId', 'currentWorkstationId'
     );
  else
    v_item_transition_state := null;
  end if;
  if v_session.preparation_status is distinct from 'ready'
     or v_session.execution_status is distinct from 'running'
     or v_session.started_at is null
     or v_session.completed_at is not null
     or v_session.failed_at is not null then
    return query select 'blocked'::text, v_session.clinic_id, v_session.deployment_run_key, v_session.id, v_session.execution_key,
      v_item.id, v_item.execution_item_key, v_item.plan_item_key, v_item.sequence, v_hardware.id, v_hardware.deployment_hardware_key,
      v_state_before, v_state_before, null::timestamptz, 'session_not_activation_safe'::text, 'Activation execution session is not hardware-activation safe.'::text;
    return;
  end if;

  if v_session.execution_owner is distinct from p_claimant_id
     or v_session.ownership_token is distinct from p_ownership_token
     or v_session.lease_expires_at is distinct from p_expected_lease_expires_at then
    return query select 'conflict'::text, v_session.clinic_id, v_session.deployment_run_key, v_session.id, v_session.execution_key,
      v_item.id, v_item.execution_item_key, v_item.plan_item_key, v_item.sequence, v_hardware.id, v_hardware.deployment_hardware_key,
      v_state_before, v_state_before, null::timestamptz, 'ownership_compare_failed'::text, 'Execution session ownership compare-and-set failed.'::text;
    return;
  end if;

  if v_session.lease_expires_at is null or v_session.lease_expires_at <= p_proposed_activated_at then
    return query select 'blocked'::text, v_session.clinic_id, v_session.deployment_run_key, v_session.id, v_session.execution_key,
      v_item.id, v_item.execution_item_key, v_item.plan_item_key, v_item.sequence, v_hardware.id, v_hardware.deployment_hardware_key,
      v_state_before, v_state_before, null::timestamptz, 'lease_not_active'::text, 'Activation execution lease is not active at the proposed hardware activation timestamp.'::text;
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
     or p_expected_entity_type <> 'hardware_shell'
     or p_expected_action <> 'activate' then
    return query select 'conflict'::text, v_session.clinic_id, v_session.deployment_run_key, v_session.id, v_session.execution_key,
      v_item.id, v_item.execution_item_key, v_item.plan_item_key, v_item.sequence, v_hardware.id, v_hardware.deployment_hardware_key,
      v_state_before || jsonb_build_object(
        'identityDiagnostics',
        jsonb_build_object(
          'itemIdMatches', v_item.id = p_item_id,
          'executionItemKeyMatches', v_item.execution_item_key is not distinct from p_execution_item_key,
          'planItemKeyMatches', v_item.plan_item_key is not distinct from p_plan_item_key,
          'sequenceMatches', v_item.sequence is not distinct from p_expected_sequence,
          'entityTypeMatches', v_item.entity_type is not distinct from p_expected_entity_type,
          'entityIdMatchesHardwareId', v_item.entity_id::text is not distinct from p_hardware_id::text,
          'entityIdMatchesExpected', v_item.entity_id::text is not distinct from p_expected_entity_id,
          'actionMatches', v_item.action is not distinct from p_expected_action,
          'hardwareIdMatches', v_hardware.id = p_hardware_id,
          'hardwareKeyMatches', v_hardware.deployment_hardware_key is not distinct from p_expected_hardware_key,
          'clinicMatches', v_session.clinic_id = p_clinic_id and v_hardware.clinic_id = p_clinic_id,
          'deploymentRunMatches', v_session.deployment_run_key is not distinct from p_deployment_run_key,
          'executionKeyMatches', v_session.execution_key is not distinct from p_execution_key
        )
      ),
      v_state_before, null::timestamptz, 'item_identity_compare_failed'::text, 'Hardware activation item identity compare-and-set failed.'::text;
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
    return query select 'blocked'::text, v_session.clinic_id, v_session.deployment_run_key, v_session.id, v_session.execution_key,
      v_item.id, v_item.execution_item_key, v_item.plan_item_key, v_item.sequence, v_hardware.id, v_hardware.deployment_hardware_key,
      v_state_before, v_state_before, null::timestamptz, 'item_not_activation_safe'::text, 'Hardware activation item is not activation-safe.'::text;
    return;
  end if;

  select count(*)::integer into v_total_items
    from public.deployment_activation_execution_items total_item
   where total_item.session_id = v_session.id;

  select count(*)::integer into v_running_count
    from public.deployment_activation_execution_items running_item
   where running_item.session_id = v_session.id
     and running_item.execution_status = 'running';

  select count(*)::integer into v_ready_count
    from public.deployment_activation_execution_items ready_item
   where ready_item.session_id = v_session.id
     and ready_item.execution_status = 'ready';

  select count(*)::integer into v_duplicate_item_identity_count
    from (
      select duplicate_item.execution_item_key
        from public.deployment_activation_execution_items duplicate_item
       where duplicate_item.session_id = v_session.id
       group by duplicate_item.execution_item_key
      having count(*) > 1
      union all
      select duplicate_item.plan_item_key
        from public.deployment_activation_execution_items duplicate_item
       where duplicate_item.session_id = v_session.id
       group by duplicate_item.plan_item_key
      having count(*) > 1
      union all
      select duplicate_item.sequence::text
        from public.deployment_activation_execution_items duplicate_item
       where duplicate_item.session_id = v_session.id
       group by duplicate_item.sequence
      having count(*) > 1
    ) duplicate_identity;

  select count(*)::integer into v_succeeded_prefix_length
    from public.deployment_activation_execution_items prefix_item
   where prefix_item.session_id = v_session.id
     and prefix_item.sequence < v_item.sequence
     and prefix_item.execution_status = 'succeeded'
     and prefix_item.attempt_count = 1
     and prefix_item.started_at is not null
     and prefix_item.completed_at is not null
     and prefix_item.completed_at >= prefix_item.started_at
     and prefix_item.rolled_back_at is null
     and prefix_item.error_code is null
     and prefix_item.error_message is null;

  select count(*)::integer into v_later_drift_count
    from public.deployment_activation_execution_items later_item
   where later_item.session_id = v_session.id
     and later_item.sequence > v_item.sequence
     and (
       later_item.execution_status is distinct from 'pending'
       or later_item.attempt_count is distinct from 0
       or later_item.started_at is not null
       or later_item.completed_at is not null
       or later_item.rolled_back_at is not null
       or later_item.error_code is not null
       or later_item.error_message is not null
     );

  select count(*)::integer into v_duplicate_hardware_identity_count
    from public.clinical_hardware_devices duplicate_hardware
   where duplicate_hardware.clinic_id = p_clinic_id
     and duplicate_hardware.deployment_hardware_key = p_expected_hardware_key;

  if jsonb_typeof(coalesce(v_item.dependency_keys, '[]'::jsonb)) <> 'array' then
    return query select 'blocked'::text, v_session.clinic_id, v_session.deployment_run_key, v_session.id, v_session.execution_key,
      v_item.id, v_item.execution_item_key, v_item.plan_item_key, v_item.sequence, v_hardware.id, v_hardware.deployment_hardware_key,
      v_state_before, v_state_before, null::timestamptz, 'dependency_integrity_invalid'::text, 'Hardware activation item dependency evidence is malformed.'::text;
    return;
  end if;

  select jsonb_array_length(coalesce(v_item.dependency_keys, '[]'::jsonb))::integer into v_dependency_count;
  select count(distinct dependency_key.value)::integer into v_distinct_dependency_count
    from jsonb_array_elements_text(coalesce(v_item.dependency_keys, '[]'::jsonb)) dependency_key(value);
  select count(*)::integer into v_succeeded_dependency_count
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

  if v_total_items <> v_session.items_requested
     or v_running_count <> 1
     or v_ready_count <> 0
     or v_duplicate_item_identity_count <> 0
     or v_succeeded_prefix_length <> v_item.sequence - 1
     or v_later_drift_count <> 0
     or v_dependency_count <> v_distinct_dependency_count
     or v_dependency_count <> v_succeeded_dependency_count then
    return query select 'blocked'::text, v_session.clinic_id, v_session.deployment_run_key, v_session.id, v_session.execution_key,
      v_item.id, v_item.execution_item_key, v_item.plan_item_key, v_item.sequence, v_hardware.id, v_hardware.deployment_hardware_key,
      v_state_before, v_state_before, null::timestamptz, 'item_integrity_invalid'::text, 'Activation execution item set is not hardware-activation safe.'::text;
    return;
  end if;

  if v_duplicate_hardware_identity_count <> 1 then
    return query select 'conflict'::text, v_session.clinic_id, v_session.deployment_run_key, v_session.id, v_session.execution_key,
      v_item.id, v_item.execution_item_key, v_item.plan_item_key, v_item.sequence, v_hardware.id, v_hardware.deployment_hardware_key,
      v_state_before, v_state_before, null::timestamptz, 'duplicate_hardware_identity'::text, 'Hardware deployment identity is not unique for this clinic.'::text;
    return;
  end if;

  if p_target_state is distinct from jsonb_build_object(
       'provisioningStatus', 'active',
       'active', true
     ) then
    return query select 'blocked'::text, v_session.clinic_id, v_session.deployment_run_key, v_session.id, v_session.execution_key,
      v_item.id, v_item.execution_item_key, v_item.plan_item_key, v_item.sequence, v_hardware.id, v_hardware.deployment_hardware_key,
      v_state_before, v_state_before, null::timestamptz, 'unsupported_target_state'::text, 'Hardware activation target state is not supported.'::text;
    return;
  end if;

  if v_hardware.active = true and v_hardware.provisioning_source = 'setup_draft' and v_hardware.provisioning_status = 'active' then
    v_state_after := v_state_before;
    return query select 'already_activated'::text, v_session.clinic_id, v_session.deployment_run_key, v_session.id, v_session.execution_key,
      v_item.id, v_item.execution_item_key, v_item.plan_item_key, v_item.sequence, v_hardware.id, v_hardware.deployment_hardware_key,
      v_state_before, v_state_after, null::timestamptz, null::text, 'Hardware shell already matches the activation target. No rows were changed.'::text;
    return;
  end if;

  select
    coalesce(jsonb_agg(comparison.field_name order by comparison.ordinal), '[]'::jsonb),
    coalesce(jsonb_object_agg(
      comparison.field_name,
      jsonb_build_object('expected', comparison.expected_value, 'actual', comparison.actual_value)
    ), '{}'::jsonb)
    into v_transition_differing_fields, v_transition_differences
    from (values
      (1, 'deploymentHardwareKey', p_expected_current_state -> 'deploymentHardwareKey', v_state_before -> 'deploymentHardwareKey'),
      (2, 'provisioningSource', p_expected_current_state -> 'provisioningSource', v_state_before -> 'provisioningSource'),
      (3, 'provisioningStatus', p_expected_current_state -> 'provisioningStatus', v_state_before -> 'provisioningStatus'),
      (4, 'active', p_expected_current_state -> 'active', v_state_before -> 'active'),
      (5, 'operationalStatus', p_expected_current_state -> 'operationalStatus', v_state_before -> 'operationalStatus'),
      (6, 'agentId', p_expected_current_state -> 'agentId', v_state_before -> 'agentId'),
      (7, 'defaultWorkstationId', p_expected_current_state -> 'defaultWorkstationId', v_state_before -> 'defaultWorkstationId'),
      (8, 'currentWorkstationId', p_expected_current_state -> 'currentWorkstationId', v_state_before -> 'currentWorkstationId'),
      (9, 'executionItem.deploymentHardwareKey', p_expected_current_state -> 'deploymentHardwareKey', v_item_transition_state -> 'deploymentHardwareKey'),
      (10, 'executionItem.provisioningSource', p_expected_current_state -> 'provisioningSource', v_item_transition_state -> 'provisioningSource'),
      (11, 'executionItem.provisioningStatus', p_expected_current_state -> 'provisioningStatus', v_item_transition_state -> 'provisioningStatus'),
      (12, 'executionItem.active', p_expected_current_state -> 'active', v_item_transition_state -> 'active'),
      (13, 'executionItem.operationalStatus', p_expected_current_state -> 'operationalStatus', v_item_transition_state -> 'operationalStatus'),
      (14, 'executionItem.agentId', p_expected_current_state -> 'agentId', v_item_transition_state -> 'agentId'),
      (15, 'executionItem.defaultWorkstationId', p_expected_current_state -> 'defaultWorkstationId', v_item_transition_state -> 'defaultWorkstationId'),
      (16, 'executionItem.currentWorkstationId', p_expected_current_state -> 'currentWorkstationId', v_item_transition_state -> 'currentWorkstationId'),
      (17, 'executionItemTargetState', p_target_state, v_item.target_state),
      (18, 'requiredActive', to_jsonb(false), to_jsonb(v_hardware.active)),
      (19, 'requiredProvisioningSource', to_jsonb('setup_draft'::text), to_jsonb(v_hardware.provisioning_source)),
      (20, 'requiredProvisioningStatus', to_jsonb('planned'::text), to_jsonb(v_hardware.provisioning_status))
    ) comparison(ordinal, field_name, expected_value, actual_value)
   where comparison.expected_value is distinct from comparison.actual_value;
  if v_state_before is distinct from p_expected_current_state
     or v_item_transition_state is distinct from p_expected_current_state
     or v_item.target_state is distinct from p_target_state
     or v_hardware.active is distinct from false
     or v_hardware.provisioning_source is distinct from 'setup_draft'
     or v_hardware.provisioning_status is distinct from 'planned' then
    return query select 'conflict'::text, v_session.clinic_id, v_session.deployment_run_key, v_session.id, v_session.execution_key,
      v_item.id, v_item.execution_item_key, v_item.plan_item_key, v_item.sequence, v_hardware.id, v_hardware.deployment_hardware_key,
      v_state_before || jsonb_build_object(
        'transitionDiagnostics',
        jsonb_build_object(
          'comparedTransitionFields', jsonb_build_array(
            'deploymentHardwareKey', 'provisioningSource', 'provisioningStatus', 'active',
            'operationalStatus', 'agentId', 'defaultWorkstationId', 'currentWorkstationId'
          ),
          'expectedTransitionState', p_expected_current_state,
          'actualPersistedTransitionState', v_state_before,
          'differingFields', v_transition_differing_fields,
          'differences', v_transition_differences
        )
      ),
      v_state_before, null::timestamptz, 'hardware_state_compare_failed'::text, 'Hardware shell current state does not match expected activation evidence.'::text;
    return;
  end if;

  update public.clinical_hardware_devices update_hardware
     set active = true,
         provisioning_status = 'active',
         updated_at = p_proposed_activated_at
   where update_hardware.id = v_hardware.id
     and update_hardware.clinic_id = p_clinic_id
     and update_hardware.deployment_hardware_key = p_expected_hardware_key
     and update_hardware.active = false
     and update_hardware.provisioning_source = 'setup_draft'
     and update_hardware.provisioning_status = 'planned'
   returning update_hardware.* into v_hardware;

  if not found then
    return query select 'conflict'::text, v_session.clinic_id, v_session.deployment_run_key, v_session.id, v_session.execution_key,
      p_item_id, p_execution_item_key, p_plan_item_key, p_expected_sequence, p_hardware_id, p_expected_hardware_key,
      v_state_before, v_state_before, null::timestamptz, 'stale_hardware_state'::text, 'Hardware shell changed before atomic activation.'::text;
    return;
  end if;

  v_state_after := jsonb_build_object(
    'deploymentHardwareKey', v_hardware.deployment_hardware_key,
    'provisioningSource', v_hardware.provisioning_source,
    'provisioningStatus', v_hardware.provisioning_status,
    'active', v_hardware.active,
    'operationalStatus', v_hardware.status,
    'agentId', v_hardware.agent_id,
    'defaultWorkstationId', v_hardware.default_workstation_id,
    'currentWorkstationId', v_hardware.current_workstation_id
  );

  return query select 'activated'::text, v_session.clinic_id, v_session.deployment_run_key, v_session.id, v_session.execution_key,
    v_item.id, v_item.execution_item_key, v_item.plan_item_key, v_item.sequence, v_hardware.id, v_hardware.deployment_hardware_key,
    v_state_before, v_state_after, p_proposed_activated_at, null::text, 'Hardware shell was activated. Execution item remains running.'::text;
end;
$$;

comment on function public.activate_deployment_hardware_shell(
  uuid, text, uuid, text, text, text, timestamptz, uuid, text, text,
  integer, text, text, text, timestamptz, integer, uuid, text, jsonb, jsonb, timestamptz
) is
  'Atomically activates only the selected setup-draft hardware shell for the running hardware_shell execution item. It does not mutate sessions, execution items, dependencies, leases, tokens, clinics, or other hardware rows.';

revoke execute on function public.activate_deployment_hardware_shell(
  uuid, text, uuid, text, text, text, timestamptz, uuid, text, text,
  integer, text, text, text, timestamptz, integer, uuid, text, jsonb, jsonb, timestamptz
) from public;

revoke execute on function public.activate_deployment_hardware_shell(
  uuid, text, uuid, text, text, text, timestamptz, uuid, text, text,
  integer, text, text, text, timestamptz, integer, uuid, text, jsonb, jsonb, timestamptz
) from anon;

revoke execute on function public.activate_deployment_hardware_shell(
  uuid, text, uuid, text, text, text, timestamptz, uuid, text, text,
  integer, text, text, text, timestamptz, integer, uuid, text, jsonb, jsonb, timestamptz
) from authenticated;

grant execute on function public.activate_deployment_hardware_shell(
  uuid, text, uuid, text, text, text, timestamptz, uuid, text, text,
  integer, text, text, text, timestamptz, integer, uuid, text, jsonb, jsonb, timestamptz
) to service_role;

-- Atomic hardware-shell activation execution-item completion boundary.
-- Apply manually with CREATE OR REPLACE FUNCTION only when promoting this slice.
-- This function completes only the selected running hardware_shell activate item after the hardware row is active.

create or replace function public.complete_deployment_hardware_shell_execution_item(
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
  p_expected_deployment_hardware_key text,
  p_expected_action text,
  p_expected_item_started_at timestamptz,
  p_expected_attempt_count integer,
  p_hardware_id uuid,
  p_expected_hardware_state jsonb,
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
  deployment_hardware_key text,
  action text,
  hardware_id uuid,
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
  v_hardware public.clinical_hardware_devices%rowtype;
  v_total_items integer := 0;
  v_duplicate_item_identity_count integer := 0;
  v_duplicate_hardware_identity_count integer := 0;
  v_prior_bad_count integer := 0;
  v_dependency_bad_count integer := 0;
  v_later_drift_count integer := 0;
  v_running_or_ready_other_count integer := 0;
  v_rows_updated integer := 0;
  v_completion_hardware_state jsonb;
  v_completion_differing_fields jsonb;
  v_completion_differences jsonb;
begin
  if p_hardware_id is null or p_expected_deployment_hardware_key is null or length(btrim(p_expected_deployment_hardware_key)) = 0
     or p_expected_entity_id is null or length(btrim(p_expected_entity_id)) = 0
     or p_claimant_id is null or length(btrim(p_claimant_id)) = 0
     or p_ownership_token is null or length(btrim(p_ownership_token)) = 0
     or p_proposed_completed_at is null
     or p_expected_hardware_state is null or jsonb_typeof(p_expected_hardware_state) <> 'object'
     or p_expected_target_state is null or jsonb_typeof(p_expected_target_state) <> 'object' then
    return query select 'blocked'::text, p_claimant_id, p_clinic_id, p_deployment_run_key, p_session_id, p_execution_key,
      p_item_id, p_execution_item_key, p_plan_item_key, p_expected_sequence, p_expected_entity_type,
      p_expected_entity_id, p_expected_deployment_hardware_key, p_expected_action, p_hardware_id,
      null::text, null::text, null::timestamptz, null::timestamptz, null::integer,
      'completion_evidence_invalid'::text, 'Hardware completion identity, ownership, timestamp, and JSON evidence are required.'::text;
    return;
  end if;

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
      p_expected_entity_id, p_expected_deployment_hardware_key, p_expected_action, p_hardware_id,
      null::text, null::text, null::timestamptz, null::timestamptz, null::integer,
      'missing_session'::text, 'Hardware-shell item-completion session was not found.'::text;
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
      p_expected_entity_id, p_expected_deployment_hardware_key, p_expected_action, p_hardware_id,
      null::text, null::text, null::timestamptz, null::timestamptz, null::integer,
      'missing_item'::text, 'Hardware-shell execution item was not found.'::text;
    return;
  end if;

  select hardware_row.* into v_hardware
  from public.clinical_hardware_devices hardware_row
  where hardware_row.id = p_hardware_id
    and hardware_row.clinic_id = p_clinic_id
    and hardware_row.deployment_hardware_key = p_expected_deployment_hardware_key
  for update;

  if not found then
    return query select 'not_found'::text, p_claimant_id, v_session.clinic_id, v_session.deployment_run_key, v_session.id, v_session.execution_key,
      v_item.id, v_item.execution_item_key, v_item.plan_item_key, v_item.sequence, v_item.entity_type,
      v_item.entity_id, p_expected_deployment_hardware_key, v_item.action, p_hardware_id,
      v_item.execution_status, v_item.execution_status, v_item.started_at, v_item.completed_at, v_item.attempt_count,
      'missing_hardware_shell'::text, 'Hardware shell was not found.'::text;
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

  select count(*)::integer into v_duplicate_hardware_identity_count
  from public.clinical_hardware_devices duplicate_hardware
  where duplicate_hardware.clinic_id = p_clinic_id
    and duplicate_hardware.deployment_hardware_key = p_expected_deployment_hardware_key;

  if v_total_items is distinct from v_session.items_requested
     or v_duplicate_item_identity_count > 0
     or v_duplicate_hardware_identity_count <> 1 then
    return query select 'blocked'::text, p_claimant_id, v_session.clinic_id, v_session.deployment_run_key, v_session.id, v_session.execution_key,
      v_item.id, v_item.execution_item_key, v_item.plan_item_key, v_item.sequence, v_item.entity_type,
      v_item.entity_id, v_hardware.deployment_hardware_key, v_item.action, v_hardware.id,
      v_item.execution_status, v_item.execution_status, v_item.started_at, v_item.completed_at, v_item.attempt_count,
      'duplicate_identity'::text, 'Hardware-shell item-completion identity integrity failed.'::text;
    return;
  end if;

  if v_item.execution_status = 'succeeded'
     and v_item.completed_at is not null
     and v_item.completed_at >= v_item.started_at
     and v_item.sequence = p_expected_sequence
     and v_item.entity_type = p_expected_entity_type
     and v_item.entity_id is not distinct from p_expected_entity_id
     and v_item.deployment_key is not distinct from p_expected_deployment_hardware_key
     and v_item.action = p_expected_action
     and v_item.started_at is not distinct from p_expected_item_started_at
     and v_item.attempt_count is not distinct from p_expected_attempt_count
     and v_item.rolled_back_at is null
     and v_item.error_code is null
     and v_item.error_message is null
     and v_hardware.provisioning_source = 'setup_draft'
     and v_hardware.provisioning_status = 'active'
     and v_hardware.active = true
     and jsonb_build_object('deploymentHardwareKey', v_hardware.deployment_hardware_key, 'provisioningSource', v_hardware.provisioning_source, 'provisioningStatus', v_hardware.provisioning_status, 'active', v_hardware.active, 'operationalStatus', v_hardware.status, 'agentId', v_hardware.agent_id, 'defaultWorkstationId', v_hardware.default_workstation_id, 'currentWorkstationId', v_hardware.current_workstation_id) is not distinct from p_expected_hardware_state
     and p_expected_target_state is not distinct from jsonb_build_object('provisioningStatus', 'active', 'active', true)
     and v_session.preparation_status = 'ready'
     and v_session.execution_status = 'running'
     and v_session.execution_owner is not distinct from p_claimant_id
     and v_session.ownership_token is not distinct from p_ownership_token
     and v_session.lease_expires_at is not distinct from p_expected_lease_expires_at
     and v_session.lease_expires_at > p_proposed_completed_at then
    return query select 'already_completed'::text, p_claimant_id, v_session.clinic_id, v_session.deployment_run_key, v_session.id, v_session.execution_key,
      v_item.id, v_item.execution_item_key, v_item.plan_item_key, v_item.sequence, v_item.entity_type,
      v_item.entity_id, v_hardware.deployment_hardware_key, v_item.action, v_hardware.id,
      'succeeded'::text, 'succeeded'::text, v_item.started_at, v_item.completed_at, v_item.attempt_count,
      null::text, 'Hardware-shell execution item was already completed. completed_at was preserved.'::text;
    return;
  end if;

  if v_session.preparation_status is distinct from 'ready'
     or v_session.execution_status is distinct from 'running'
     or v_session.started_at is null
     or v_session.completed_at is not null
     or v_session.failed_at is not null then
    return query select 'blocked'::text, p_claimant_id, v_session.clinic_id, v_session.deployment_run_key, v_session.id, v_session.execution_key,
      v_item.id, v_item.execution_item_key, v_item.plan_item_key, v_item.sequence, v_item.entity_type,
      v_item.entity_id, v_hardware.deployment_hardware_key, v_item.action, v_hardware.id,
      v_item.execution_status, v_item.execution_status, v_item.started_at, v_item.completed_at, v_item.attempt_count,
      'session_not_running'::text, 'Execution session is not hardware item-completion safe.'::text;
    return;
  end if;

  if v_session.execution_owner is distinct from p_claimant_id
     or v_session.ownership_token is distinct from p_ownership_token then
    return query select 'conflict'::text, p_claimant_id, v_session.clinic_id, v_session.deployment_run_key, v_session.id, v_session.execution_key,
      v_item.id, v_item.execution_item_key, v_item.plan_item_key, v_item.sequence, v_item.entity_type,
      v_item.entity_id, v_hardware.deployment_hardware_key, v_item.action, v_hardware.id,
      v_item.execution_status, v_item.execution_status, v_item.started_at, v_item.completed_at, v_item.attempt_count,
      'ownership_conflict'::text, 'Hardware-shell item-completion ownership compare-and-set failed.'::text;
    return;
  end if;

  if v_session.lease_expires_at is null
     or v_session.lease_expires_at is distinct from p_expected_lease_expires_at
     or v_session.lease_expires_at <= p_proposed_completed_at then
    return query select 'blocked'::text, p_claimant_id, v_session.clinic_id, v_session.deployment_run_key, v_session.id, v_session.execution_key,
      v_item.id, v_item.execution_item_key, v_item.plan_item_key, v_item.sequence, v_item.entity_type,
      v_item.entity_id, v_hardware.deployment_hardware_key, v_item.action, v_hardware.id,
      v_item.execution_status, v_item.execution_status, v_item.started_at, v_item.completed_at, v_item.attempt_count,
      'lease_expired'::text, 'Execution lease is not active for hardware item completion.'::text;
    return;
  end if;

  if v_item.execution_item_key is distinct from p_execution_item_key
     or v_item.plan_item_key is distinct from p_plan_item_key
     or v_item.sequence is distinct from p_expected_sequence
     or v_item.entity_type is distinct from p_expected_entity_type
     or v_item.entity_id is distinct from p_expected_entity_id
     or v_item.entity_id is distinct from p_hardware_id::text
     or p_expected_entity_id is distinct from p_hardware_id::text
     or v_item.deployment_key is distinct from p_expected_deployment_hardware_key
     or v_item.action is distinct from p_expected_action
     or p_expected_entity_type <> 'hardware_shell'
     or p_expected_action <> 'activate'
     or v_hardware.id is distinct from p_hardware_id
     or v_hardware.deployment_hardware_key is distinct from p_expected_deployment_hardware_key then
    return query select 'conflict'::text, p_claimant_id, v_session.clinic_id, v_session.deployment_run_key, v_session.id, v_session.execution_key,
      v_item.id, v_item.execution_item_key, v_item.plan_item_key, v_item.sequence, v_item.entity_type,
      v_item.entity_id, v_hardware.deployment_hardware_key, v_item.action, v_hardware.id,
      v_item.execution_status, v_item.execution_status, v_item.started_at, v_item.completed_at, v_item.attempt_count,
      'item_identity_compare_failed'::text, 'Hardware-shell item identity compare-and-set failed.'::text;
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
      v_item.entity_id, v_hardware.deployment_hardware_key, v_item.action, v_hardware.id,
      v_item.execution_status, v_item.execution_status, v_item.started_at, v_item.completed_at, v_item.attempt_count,
      'stale_state'::text, 'Hardware-shell execution item changed before completion.'::text;
    return;
  end if;

  v_completion_hardware_state := jsonb_build_object(
    'deploymentHardwareKey', v_hardware.deployment_hardware_key,
    'provisioningSource', v_hardware.provisioning_source,
    'provisioningStatus', v_hardware.provisioning_status,
    'active', v_hardware.active,
    'operationalStatus', v_hardware.status,
    'agentId', v_hardware.agent_id,
    'defaultWorkstationId', v_hardware.default_workstation_id,
    'currentWorkstationId', v_hardware.current_workstation_id
  );

  select
    coalesce(jsonb_agg(comparison.field_name order by comparison.ordinal), '[]'::jsonb),
    coalesce(jsonb_object_agg(
      comparison.field_name,
      jsonb_build_object('expected', comparison.expected_value, 'actual', comparison.actual_value)
    ), '{}'::jsonb)
    into v_completion_differing_fields, v_completion_differences
    from (values
      (1, 'deploymentHardwareKey', p_expected_hardware_state -> 'deploymentHardwareKey', v_completion_hardware_state -> 'deploymentHardwareKey'),
      (2, 'provisioningSource', p_expected_hardware_state -> 'provisioningSource', v_completion_hardware_state -> 'provisioningSource'),
      (3, 'provisioningStatus', p_expected_hardware_state -> 'provisioningStatus', v_completion_hardware_state -> 'provisioningStatus'),
      (4, 'active', p_expected_hardware_state -> 'active', v_completion_hardware_state -> 'active'),
      (5, 'operationalStatus', p_expected_hardware_state -> 'operationalStatus', v_completion_hardware_state -> 'operationalStatus'),
      (6, 'agentId', p_expected_hardware_state -> 'agentId', v_completion_hardware_state -> 'agentId'),
      (7, 'defaultWorkstationId', p_expected_hardware_state -> 'defaultWorkstationId', v_completion_hardware_state -> 'defaultWorkstationId'),
      (8, 'currentWorkstationId', p_expected_hardware_state -> 'currentWorkstationId', v_completion_hardware_state -> 'currentWorkstationId'),
      (9, 'executionItemTargetState', p_expected_target_state, v_item.target_state),
      (10, 'requiredTargetState', jsonb_build_object('provisioningStatus', 'active', 'active', true), p_expected_target_state),
      (11, 'requiredProvisioningSource', to_jsonb('setup_draft'::text), to_jsonb(v_hardware.provisioning_source)),
      (12, 'requiredProvisioningStatus', to_jsonb('active'::text), to_jsonb(v_hardware.provisioning_status)),
      (13, 'requiredActive', to_jsonb(true), to_jsonb(v_hardware.active))
    ) comparison(ordinal, field_name, expected_value, actual_value)
   where comparison.expected_value is distinct from comparison.actual_value;
  if jsonb_build_object('deploymentHardwareKey', v_hardware.deployment_hardware_key, 'provisioningSource', v_hardware.provisioning_source, 'provisioningStatus', v_hardware.provisioning_status, 'active', v_hardware.active, 'operationalStatus', v_hardware.status, 'agentId', v_hardware.agent_id, 'defaultWorkstationId', v_hardware.default_workstation_id, 'currentWorkstationId', v_hardware.current_workstation_id)
       is distinct from p_expected_hardware_state
     or v_item.target_state is distinct from p_expected_target_state
     or p_expected_target_state is distinct from jsonb_build_object('provisioningStatus', 'active', 'active', true)
     or v_hardware.provisioning_source is distinct from 'setup_draft'
     or v_hardware.provisioning_status is distinct from 'active'
     or v_hardware.active is distinct from true then
    return query select 'blocked'::text, p_claimant_id, v_session.clinic_id, v_session.deployment_run_key, v_session.id, v_session.execution_key,
      v_item.id, v_item.execution_item_key, v_item.plan_item_key, v_item.sequence, v_item.entity_type,
      v_item.entity_id, v_hardware.deployment_hardware_key, v_item.action, v_hardware.id,
      v_item.execution_status, v_item.execution_status, v_item.started_at, v_item.completed_at, v_item.attempt_count,
      'hardware_state_invalid'::text,
      jsonb_build_object(
        'message', 'Hardware shell durable state is not completion-safe.',
        'completionDiagnostics', jsonb_build_object(
          'requiredDurableHardwareState', p_expected_hardware_state,
          'actualPersistedHardwareState', v_completion_hardware_state,
          'differingFields', v_completion_differing_fields,
          'differences', v_completion_differences,
          'failingCompletionPreconditions', v_completion_differing_fields
        )
      )::text;
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
      v_item.entity_id, v_hardware.deployment_hardware_key, v_item.action, v_hardware.id,
      v_item.execution_status, v_item.execution_status, v_item.started_at, v_item.completed_at, v_item.attempt_count,
      'ordering_integrity_failed'::text, 'Hardware-shell item dependency or ordering integrity failed.'::text;
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
     and update_item.entity_type = 'hardware_shell'
     and update_item.entity_id = p_expected_entity_id
     and update_item.deployment_key = p_expected_deployment_hardware_key
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
      v_item.entity_id, v_hardware.deployment_hardware_key, v_item.action, v_hardware.id,
      v_item.execution_status, v_item.execution_status, v_item.started_at, v_item.completed_at, v_item.attempt_count,
      'stale_state'::text, 'Hardware-shell item completion compare-and-set wrote no rows.'::text;
    return;
  end if;

  return query select 'completed'::text, p_claimant_id, v_session.clinic_id, v_session.deployment_run_key, v_session.id, v_session.execution_key,
    v_item.id, v_item.execution_item_key, v_item.plan_item_key, v_item.sequence, v_item.entity_type,
    v_item.entity_id, v_hardware.deployment_hardware_key, v_item.action, v_hardware.id,
    v_item.execution_status, 'succeeded'::text, v_item.started_at, p_proposed_completed_at, v_item.attempt_count,
    null::text, 'Hardware-shell execution item was completed. Dependency progression was not attempted.'::text;
end;
$$;

revoke all on function public.complete_deployment_hardware_shell_execution_item(
  uuid, text, uuid, text, text, text, timestamptz, uuid, text, text, integer, text, text, text, text, timestamptz, integer, uuid, jsonb, jsonb, timestamptz
) from public, anon, authenticated;

grant execute on function public.complete_deployment_hardware_shell_execution_item(
  uuid, text, uuid, text, text, text, timestamptz, uuid, text, text, integer, text, text, text, text, timestamptz, integer, uuid, jsonb, jsonb, timestamptz
) to service_role;
