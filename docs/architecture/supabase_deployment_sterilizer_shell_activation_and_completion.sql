-- RC9 Slice 3B1A - sterilizer atomic activation and execution-item completion persistence primitives.
-- Forward-only migration draft. Apply manually in the Supabase SQL editor after review.

-- Atomic sterilizer shell activation boundary.
-- Apply manually in the Supabase SQL editor after review.
-- This function activates only the selected sterilizer shell referenced by the currently running sterilizer_shell item.
-- It does not complete items, progress dependencies, start items, mutate sessions, renew leases, rotate tokens, finalize deployment, or rollback.

create or replace function public.activate_deployment_sterilizer_shell(
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
  p_sterilizer_id uuid,
  p_expected_sterilizer_key text,
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
  sterilizer_id uuid,
  deployment_sterilizer_key text,
  sterilizer_state_before jsonb,
  sterilizer_state_after jsonb,
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
  v_sterilizer public.sterilizers%rowtype;
  v_state_before jsonb;
  v_item_transition_state jsonb;
  v_state_after jsonb;
  v_running_count integer;
  v_ready_count integer;
  v_total_items integer;
  v_duplicate_item_identity_count integer;
  v_duplicate_sterilizer_identity_count integer;
  v_succeeded_prefix_length integer;
  v_later_drift_count integer;
  v_dependency_count integer;
  v_distinct_dependency_count integer;
  v_succeeded_dependency_count integer;
begin
  if p_sterilizer_id is null or p_expected_sterilizer_key is null or length(btrim(p_expected_sterilizer_key)) = 0
     or p_expected_entity_id is null or length(btrim(p_expected_entity_id)) = 0
     or p_proposed_activated_at is null then
    return query select 'blocked'::text, p_clinic_id, p_deployment_run_key, p_session_id, p_execution_key,
      p_item_id, p_execution_item_key, p_plan_item_key, p_expected_sequence, p_sterilizer_id, p_expected_sterilizer_key,
      null::jsonb, null::jsonb, null::timestamptz, 'sterilizer_identity_invalid'::text, 'Sterilizer UUID, deterministic key, entity identity, and activation timestamp are required.'::text;
    return;
  end if;

  if p_claimant_id is null or length(btrim(p_claimant_id)) = 0 then
    return query select 'blocked'::text, p_clinic_id, p_deployment_run_key, p_session_id, p_execution_key,
      p_item_id, p_execution_item_key, p_plan_item_key, p_expected_sequence, p_sterilizer_id, p_expected_sterilizer_key,
      null::jsonb, null::jsonb, null::timestamptz, 'claimant_invalid'::text, 'Claimant id is required.'::text;
    return;
  end if;

  if p_ownership_token is null or length(btrim(p_ownership_token)) = 0 then
    return query select 'blocked'::text, p_clinic_id, p_deployment_run_key, p_session_id, p_execution_key,
      p_item_id, p_execution_item_key, p_plan_item_key, p_expected_sequence, p_sterilizer_id, p_expected_sterilizer_key,
      null::jsonb, null::jsonb, null::timestamptz, 'ownership_token_invalid'::text, 'Ownership token is required.'::text;
    return;
  end if;

  if p_expected_current_state is null or jsonb_typeof(p_expected_current_state) <> 'object'
     or p_target_state is null or jsonb_typeof(p_target_state) <> 'object' then
    return query select 'blocked'::text, p_clinic_id, p_deployment_run_key, p_session_id, p_execution_key,
      p_item_id, p_execution_item_key, p_plan_item_key, p_expected_sequence, p_sterilizer_id, p_expected_sterilizer_key,
      null::jsonb, null::jsonb, null::timestamptz, 'state_evidence_invalid'::text, 'Sterilizer activation state evidence must be JSON objects.'::text;
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
      p_item_id, p_execution_item_key, p_plan_item_key, p_expected_sequence, p_sterilizer_id, p_expected_sterilizer_key,
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
      p_item_id, p_execution_item_key, p_plan_item_key, p_expected_sequence, p_sterilizer_id, p_expected_sterilizer_key,
      null::jsonb, null::jsonb, null::timestamptz, 'missing_item'::text, 'Sterilizer activation execution item was not found.'::text;
    return;
  end if;

  select sterilizer_row.*
    into v_sterilizer
    from public.sterilizers sterilizer_row
   where sterilizer_row.id = p_sterilizer_id
     and sterilizer_row.clinic_id = p_clinic_id
     and sterilizer_row.deployment_sterilizer_key = p_expected_sterilizer_key
   for update;

  if not found then
    return query select 'not_found'::text, v_session.clinic_id, v_session.deployment_run_key, v_session.id, v_session.execution_key,
      v_item.id, v_item.execution_item_key, v_item.plan_item_key, v_item.sequence, p_sterilizer_id, p_expected_sterilizer_key,
      null::jsonb, null::jsonb, null::timestamptz, 'missing_sterilizer_shell'::text, 'Sterilizer shell activation target was not found.'::text;
    return;
  end if;

  v_state_before := jsonb_build_object(
    'deploymentSterilizerKey', v_sterilizer.deployment_sterilizer_key,
    'provisioningSource', v_sterilizer.provisioning_source,
    'provisioningStatus', v_sterilizer.provisioning_status,
    'active', v_sterilizer.active
  );
  v_item_transition_state := jsonb_build_object(
    'deploymentSterilizerKey', v_item.expected_current_state -> 'deploymentSterilizerKey',
    'provisioningSource', v_item.expected_current_state -> 'provisioningSource',
    'provisioningStatus', v_item.expected_current_state -> 'provisioningStatus',
    'active', v_item.expected_current_state -> 'active'
  );

  if v_session.preparation_status is distinct from 'ready'
     or v_session.execution_status is distinct from 'running'
     or v_session.started_at is null
     or v_session.completed_at is not null
     or v_session.failed_at is not null then
    return query select 'blocked'::text, v_session.clinic_id, v_session.deployment_run_key, v_session.id, v_session.execution_key,
      v_item.id, v_item.execution_item_key, v_item.plan_item_key, v_item.sequence, v_sterilizer.id, v_sterilizer.deployment_sterilizer_key,
      v_state_before, v_state_before, null::timestamptz, 'session_not_activation_safe'::text, 'Activation execution session is not sterilizer-activation safe.'::text;
    return;
  end if;

  if v_session.execution_owner is distinct from p_claimant_id
     or v_session.ownership_token is distinct from p_ownership_token
     or v_session.lease_expires_at is distinct from p_expected_lease_expires_at then
    return query select 'conflict'::text, v_session.clinic_id, v_session.deployment_run_key, v_session.id, v_session.execution_key,
      v_item.id, v_item.execution_item_key, v_item.plan_item_key, v_item.sequence, v_sterilizer.id, v_sterilizer.deployment_sterilizer_key,
      v_state_before, v_state_before, null::timestamptz, 'ownership_compare_failed'::text, 'Execution session ownership compare-and-set failed.'::text;
    return;
  end if;

  if v_session.lease_expires_at is null or v_session.lease_expires_at <= p_proposed_activated_at then
    return query select 'blocked'::text, v_session.clinic_id, v_session.deployment_run_key, v_session.id, v_session.execution_key,
      v_item.id, v_item.execution_item_key, v_item.plan_item_key, v_item.sequence, v_sterilizer.id, v_sterilizer.deployment_sterilizer_key,
      v_state_before, v_state_before, null::timestamptz, 'lease_not_active'::text, 'Activation execution lease is not active at the proposed sterilizer activation timestamp.'::text;
    return;
  end if;

  if v_item.execution_item_key is distinct from p_execution_item_key
     or v_item.plan_item_key is distinct from p_plan_item_key
     or v_item.sequence is distinct from p_expected_sequence
     or v_item.entity_type is distinct from p_expected_entity_type
     or v_item.entity_id::text is distinct from p_expected_entity_id
     or v_item.entity_id::text is distinct from p_sterilizer_id::text
     or p_expected_entity_id is distinct from p_sterilizer_id::text
     or v_item.action is distinct from p_expected_action
     or v_item.deployment_key is distinct from p_expected_sterilizer_key
     or p_expected_entity_type <> 'sterilizer_shell'
     or p_expected_action <> 'activate' then
    return query select 'conflict'::text, v_session.clinic_id, v_session.deployment_run_key, v_session.id, v_session.execution_key,
      v_item.id, v_item.execution_item_key, v_item.plan_item_key, v_item.sequence, v_sterilizer.id, v_sterilizer.deployment_sterilizer_key,
      v_state_before || jsonb_build_object(
        'identityDiagnostics',
        jsonb_build_object(
          'itemIdMatches', v_item.id = p_item_id,
          'executionItemKeyMatches', v_item.execution_item_key is not distinct from p_execution_item_key,
          'planItemKeyMatches', v_item.plan_item_key is not distinct from p_plan_item_key,
          'sequenceMatches', v_item.sequence is not distinct from p_expected_sequence,
          'entityTypeMatches', v_item.entity_type is not distinct from p_expected_entity_type,
          'entityIdMatchesSterilizerId', v_item.entity_id::text is not distinct from p_sterilizer_id::text,
          'entityIdMatchesExpected', v_item.entity_id::text is not distinct from p_expected_entity_id,
          'actionMatches', v_item.action is not distinct from p_expected_action,
          'sterilizerIdMatches', v_sterilizer.id = p_sterilizer_id,
          'sterilizerKeyMatches', v_sterilizer.deployment_sterilizer_key is not distinct from p_expected_sterilizer_key,
          'clinicMatches', v_session.clinic_id = p_clinic_id and v_sterilizer.clinic_id = p_clinic_id,
          'deploymentRunMatches', v_session.deployment_run_key is not distinct from p_deployment_run_key,
          'executionKeyMatches', v_session.execution_key is not distinct from p_execution_key
        )
      ),
      v_state_before, null::timestamptz, 'item_identity_compare_failed'::text, 'Sterilizer activation item identity compare-and-set failed.'::text;
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
      v_item.id, v_item.execution_item_key, v_item.plan_item_key, v_item.sequence, v_sterilizer.id, v_sterilizer.deployment_sterilizer_key,
      v_state_before, v_state_before, null::timestamptz, 'item_not_activation_safe'::text, 'Sterilizer activation item is not activation-safe.'::text;
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

  select count(*)::integer into v_duplicate_sterilizer_identity_count
    from public.sterilizers duplicate_sterilizer
   where duplicate_sterilizer.clinic_id = p_clinic_id
     and duplicate_sterilizer.deployment_sterilizer_key = p_expected_sterilizer_key;

  if jsonb_typeof(coalesce(v_item.dependency_keys, '[]'::jsonb)) <> 'array' then
    return query select 'blocked'::text, v_session.clinic_id, v_session.deployment_run_key, v_session.id, v_session.execution_key,
      v_item.id, v_item.execution_item_key, v_item.plan_item_key, v_item.sequence, v_sterilizer.id, v_sterilizer.deployment_sterilizer_key,
      v_state_before, v_state_before, null::timestamptz, 'dependency_integrity_invalid'::text, 'Sterilizer activation item dependency evidence is malformed.'::text;
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
      v_item.id, v_item.execution_item_key, v_item.plan_item_key, v_item.sequence, v_sterilizer.id, v_sterilizer.deployment_sterilizer_key,
      v_state_before, v_state_before, null::timestamptz, 'item_integrity_invalid'::text, 'Activation execution item set is not sterilizer-activation safe.'::text;
    return;
  end if;

  if v_duplicate_sterilizer_identity_count <> 1 then
    return query select 'conflict'::text, v_session.clinic_id, v_session.deployment_run_key, v_session.id, v_session.execution_key,
      v_item.id, v_item.execution_item_key, v_item.plan_item_key, v_item.sequence, v_sterilizer.id, v_sterilizer.deployment_sterilizer_key,
      v_state_before, v_state_before, null::timestamptz, 'duplicate_sterilizer_identity'::text, 'Sterilizer deployment identity is not unique for this clinic.'::text;
    return;
  end if;

  if p_target_state is distinct from jsonb_build_object(
       'provisioningStatus', 'active',
       'active', true
     ) then
    return query select 'blocked'::text, v_session.clinic_id, v_session.deployment_run_key, v_session.id, v_session.execution_key,
      v_item.id, v_item.execution_item_key, v_item.plan_item_key, v_item.sequence, v_sterilizer.id, v_sterilizer.deployment_sterilizer_key,
      v_state_before, v_state_before, null::timestamptz, 'unsupported_target_state'::text, 'Sterilizer activation target state is not supported.'::text;
    return;
  end if;

  if v_sterilizer.active = true and v_sterilizer.provisioning_source = 'setup_draft' and v_sterilizer.provisioning_status = 'active' then
    v_state_after := v_state_before;
    return query select 'already_activated'::text, v_session.clinic_id, v_session.deployment_run_key, v_session.id, v_session.execution_key,
      v_item.id, v_item.execution_item_key, v_item.plan_item_key, v_item.sequence, v_sterilizer.id, v_sterilizer.deployment_sterilizer_key,
      v_state_before, v_state_after, null::timestamptz, null::text, 'Sterilizer shell already matches the activation target. No rows were changed.'::text;
    return;
  end if;

  if v_state_before is distinct from p_expected_current_state
     or v_item_transition_state is distinct from p_expected_current_state
     or v_item.target_state is distinct from p_target_state
     or v_sterilizer.active is distinct from false
     or v_sterilizer.provisioning_source is distinct from 'setup_draft'
     or v_sterilizer.provisioning_status is distinct from 'planned' then
    return query select 'conflict'::text, v_session.clinic_id, v_session.deployment_run_key, v_session.id, v_session.execution_key,
      v_item.id, v_item.execution_item_key, v_item.plan_item_key, v_item.sequence, v_sterilizer.id, v_sterilizer.deployment_sterilizer_key,
      v_state_before, v_state_before, null::timestamptz, 'sterilizer_state_compare_failed'::text, 'Sterilizer shell current state does not match expected activation evidence.'::text;
    return;
  end if;

  update public.sterilizers update_sterilizer
     set active = true,
         provisioning_status = 'active'
   where update_sterilizer.id = v_sterilizer.id
     and update_sterilizer.clinic_id = p_clinic_id
     and update_sterilizer.deployment_sterilizer_key = p_expected_sterilizer_key
     and update_sterilizer.active = false
     and update_sterilizer.provisioning_source = 'setup_draft'
     and update_sterilizer.provisioning_status = 'planned'
   returning update_sterilizer.* into v_sterilizer;

  if not found then
    return query select 'conflict'::text, v_session.clinic_id, v_session.deployment_run_key, v_session.id, v_session.execution_key,
      p_item_id, p_execution_item_key, p_plan_item_key, p_expected_sequence, p_sterilizer_id, p_expected_sterilizer_key,
      v_state_before, v_state_before, null::timestamptz, 'stale_sterilizer_state'::text, 'Sterilizer shell changed before atomic activation.'::text;
    return;
  end if;

  v_state_after := jsonb_build_object(
    'deploymentSterilizerKey', v_sterilizer.deployment_sterilizer_key,
    'provisioningSource', v_sterilizer.provisioning_source,
    'provisioningStatus', v_sterilizer.provisioning_status,
    'active', v_sterilizer.active
  );

  return query select 'activated'::text, v_session.clinic_id, v_session.deployment_run_key, v_session.id, v_session.execution_key,
    v_item.id, v_item.execution_item_key, v_item.plan_item_key, v_item.sequence, v_sterilizer.id, v_sterilizer.deployment_sterilizer_key,
    v_state_before, v_state_after, p_proposed_activated_at, null::text, 'Sterilizer shell was activated. Execution item remains running.'::text;
end;
$$;

comment on function public.activate_deployment_sterilizer_shell(
  uuid, text, uuid, text, text, text, timestamptz, uuid, text, text,
  integer, text, text, text, timestamptz, integer, uuid, text, jsonb, jsonb, timestamptz
) is
  'Atomically activates only the selected setup-draft sterilizer shell for the running sterilizer_shell execution item. It does not mutate sessions, execution items, dependencies, leases, tokens, clinics, or other sterilizer rows.';

revoke execute on function public.activate_deployment_sterilizer_shell(
  uuid, text, uuid, text, text, text, timestamptz, uuid, text, text,
  integer, text, text, text, timestamptz, integer, uuid, text, jsonb, jsonb, timestamptz
) from public;

revoke execute on function public.activate_deployment_sterilizer_shell(
  uuid, text, uuid, text, text, text, timestamptz, uuid, text, text,
  integer, text, text, text, timestamptz, integer, uuid, text, jsonb, jsonb, timestamptz
) from anon;

revoke execute on function public.activate_deployment_sterilizer_shell(
  uuid, text, uuid, text, text, text, timestamptz, uuid, text, text,
  integer, text, text, text, timestamptz, integer, uuid, text, jsonb, jsonb, timestamptz
) from authenticated;

grant execute on function public.activate_deployment_sterilizer_shell(
  uuid, text, uuid, text, text, text, timestamptz, uuid, text, text,
  integer, text, text, text, timestamptz, integer, uuid, text, jsonb, jsonb, timestamptz
) to service_role;

-- Atomic sterilizer-shell activation execution-item completion boundary.
-- Apply manually with CREATE OR REPLACE FUNCTION only when promoting this slice.
-- This function completes only the selected running sterilizer_shell activate item after the sterilizer row is active.

create or replace function public.complete_deployment_sterilizer_shell_execution_item(
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
  p_expected_deployment_sterilizer_key text,
  p_expected_action text,
  p_expected_item_started_at timestamptz,
  p_expected_attempt_count integer,
  p_sterilizer_id uuid,
  p_expected_sterilizer_state jsonb,
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
  deployment_sterilizer_key text,
  action text,
  sterilizer_id uuid,
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
  v_sterilizer public.sterilizers%rowtype;
  v_total_items integer := 0;
  v_duplicate_item_identity_count integer := 0;
  v_duplicate_sterilizer_identity_count integer := 0;
  v_prior_bad_count integer := 0;
  v_dependency_bad_count integer := 0;
  v_later_drift_count integer := 0;
  v_running_or_ready_other_count integer := 0;
  v_rows_updated integer := 0;
begin
  if p_sterilizer_id is null or p_expected_deployment_sterilizer_key is null or length(btrim(p_expected_deployment_sterilizer_key)) = 0
     or p_expected_entity_id is null or length(btrim(p_expected_entity_id)) = 0
     or p_claimant_id is null or length(btrim(p_claimant_id)) = 0
     or p_ownership_token is null or length(btrim(p_ownership_token)) = 0
     or p_proposed_completed_at is null
     or p_expected_sterilizer_state is null or jsonb_typeof(p_expected_sterilizer_state) <> 'object'
     or p_expected_target_state is null or jsonb_typeof(p_expected_target_state) <> 'object' then
    return query select 'blocked'::text, p_claimant_id, p_clinic_id, p_deployment_run_key, p_session_id, p_execution_key,
      p_item_id, p_execution_item_key, p_plan_item_key, p_expected_sequence, p_expected_entity_type,
      p_expected_entity_id, p_expected_deployment_sterilizer_key, p_expected_action, p_sterilizer_id,
      null::text, null::text, null::timestamptz, null::timestamptz, null::integer,
      'completion_evidence_invalid'::text, 'Sterilizer completion identity, ownership, timestamp, and JSON evidence are required.'::text;
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
      p_expected_entity_id, p_expected_deployment_sterilizer_key, p_expected_action, p_sterilizer_id,
      null::text, null::text, null::timestamptz, null::timestamptz, null::integer,
      'missing_session'::text, 'Sterilizer-shell item-completion session was not found.'::text;
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
      p_expected_entity_id, p_expected_deployment_sterilizer_key, p_expected_action, p_sterilizer_id,
      null::text, null::text, null::timestamptz, null::timestamptz, null::integer,
      'missing_item'::text, 'Sterilizer-shell execution item was not found.'::text;
    return;
  end if;

  select sterilizer_row.* into v_sterilizer
  from public.sterilizers sterilizer_row
  where sterilizer_row.id = p_sterilizer_id
    and sterilizer_row.clinic_id = p_clinic_id
    and sterilizer_row.deployment_sterilizer_key = p_expected_deployment_sterilizer_key
  for update;

  if not found then
    return query select 'not_found'::text, p_claimant_id, v_session.clinic_id, v_session.deployment_run_key, v_session.id, v_session.execution_key,
      v_item.id, v_item.execution_item_key, v_item.plan_item_key, v_item.sequence, v_item.entity_type,
      v_item.entity_id, p_expected_deployment_sterilizer_key, v_item.action, p_sterilizer_id,
      v_item.execution_status, v_item.execution_status, v_item.started_at, v_item.completed_at, v_item.attempt_count,
      'missing_sterilizer_shell'::text, 'Sterilizer shell was not found.'::text;
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

  select count(*)::integer into v_duplicate_sterilizer_identity_count
  from public.sterilizers duplicate_sterilizer
  where duplicate_sterilizer.clinic_id = p_clinic_id
    and duplicate_sterilizer.deployment_sterilizer_key = p_expected_deployment_sterilizer_key;

  if v_total_items is distinct from v_session.items_requested
     or v_duplicate_item_identity_count > 0
     or v_duplicate_sterilizer_identity_count <> 1 then
    return query select 'blocked'::text, p_claimant_id, v_session.clinic_id, v_session.deployment_run_key, v_session.id, v_session.execution_key,
      v_item.id, v_item.execution_item_key, v_item.plan_item_key, v_item.sequence, v_item.entity_type,
      v_item.entity_id, v_sterilizer.deployment_sterilizer_key, v_item.action, v_sterilizer.id,
      v_item.execution_status, v_item.execution_status, v_item.started_at, v_item.completed_at, v_item.attempt_count,
      'duplicate_identity'::text, 'Sterilizer-shell item-completion identity integrity failed.'::text;
    return;
  end if;

  if v_item.execution_status = 'succeeded'
     and v_item.completed_at is not null
     and v_item.completed_at >= v_item.started_at
     and v_item.sequence = p_expected_sequence
     and v_item.entity_type = p_expected_entity_type
     and v_item.entity_id is not distinct from p_expected_entity_id
     and v_item.deployment_key is not distinct from p_expected_deployment_sterilizer_key
     and v_item.action = p_expected_action
     and v_item.started_at is not distinct from p_expected_item_started_at
     and v_item.attempt_count is not distinct from p_expected_attempt_count
     and v_item.rolled_back_at is null
     and v_item.error_code is null
     and v_item.error_message is null
     and v_sterilizer.provisioning_source = 'setup_draft'
     and v_sterilizer.provisioning_status = 'active'
     and v_sterilizer.active = true
     and jsonb_build_object('deploymentSterilizerKey', v_sterilizer.deployment_sterilizer_key, 'provisioningSource', v_sterilizer.provisioning_source, 'provisioningStatus', v_sterilizer.provisioning_status, 'active', v_sterilizer.active) is not distinct from p_expected_sterilizer_state
     and p_expected_target_state is not distinct from jsonb_build_object('provisioningStatus', 'active', 'active', true)
     and v_session.preparation_status = 'ready'
     and v_session.execution_status = 'running'
     and v_session.execution_owner is not distinct from p_claimant_id
     and v_session.ownership_token is not distinct from p_ownership_token
     and v_session.lease_expires_at is not distinct from p_expected_lease_expires_at
     and v_session.lease_expires_at > p_proposed_completed_at then
    return query select 'already_completed'::text, p_claimant_id, v_session.clinic_id, v_session.deployment_run_key, v_session.id, v_session.execution_key,
      v_item.id, v_item.execution_item_key, v_item.plan_item_key, v_item.sequence, v_item.entity_type,
      v_item.entity_id, v_sterilizer.deployment_sterilizer_key, v_item.action, v_sterilizer.id,
      'succeeded'::text, 'succeeded'::text, v_item.started_at, v_item.completed_at, v_item.attempt_count,
      null::text, 'Sterilizer-shell execution item was already completed. completed_at was preserved.'::text;
    return;
  end if;

  if v_session.preparation_status is distinct from 'ready'
     or v_session.execution_status is distinct from 'running'
     or v_session.started_at is null
     or v_session.completed_at is not null
     or v_session.failed_at is not null then
    return query select 'blocked'::text, p_claimant_id, v_session.clinic_id, v_session.deployment_run_key, v_session.id, v_session.execution_key,
      v_item.id, v_item.execution_item_key, v_item.plan_item_key, v_item.sequence, v_item.entity_type,
      v_item.entity_id, v_sterilizer.deployment_sterilizer_key, v_item.action, v_sterilizer.id,
      v_item.execution_status, v_item.execution_status, v_item.started_at, v_item.completed_at, v_item.attempt_count,
      'session_not_running'::text, 'Execution session is not sterilizer item-completion safe.'::text;
    return;
  end if;

  if v_session.execution_owner is distinct from p_claimant_id
     or v_session.ownership_token is distinct from p_ownership_token then
    return query select 'conflict'::text, p_claimant_id, v_session.clinic_id, v_session.deployment_run_key, v_session.id, v_session.execution_key,
      v_item.id, v_item.execution_item_key, v_item.plan_item_key, v_item.sequence, v_item.entity_type,
      v_item.entity_id, v_sterilizer.deployment_sterilizer_key, v_item.action, v_sterilizer.id,
      v_item.execution_status, v_item.execution_status, v_item.started_at, v_item.completed_at, v_item.attempt_count,
      'ownership_conflict'::text, 'Sterilizer-shell item-completion ownership compare-and-set failed.'::text;
    return;
  end if;

  if v_session.lease_expires_at is null
     or v_session.lease_expires_at is distinct from p_expected_lease_expires_at
     or v_session.lease_expires_at <= p_proposed_completed_at then
    return query select 'blocked'::text, p_claimant_id, v_session.clinic_id, v_session.deployment_run_key, v_session.id, v_session.execution_key,
      v_item.id, v_item.execution_item_key, v_item.plan_item_key, v_item.sequence, v_item.entity_type,
      v_item.entity_id, v_sterilizer.deployment_sterilizer_key, v_item.action, v_sterilizer.id,
      v_item.execution_status, v_item.execution_status, v_item.started_at, v_item.completed_at, v_item.attempt_count,
      'lease_expired'::text, 'Execution lease is not active for sterilizer item completion.'::text;
    return;
  end if;

  if v_item.execution_item_key is distinct from p_execution_item_key
     or v_item.plan_item_key is distinct from p_plan_item_key
     or v_item.sequence is distinct from p_expected_sequence
     or v_item.entity_type is distinct from p_expected_entity_type
     or v_item.entity_id is distinct from p_expected_entity_id
     or v_item.entity_id is distinct from p_sterilizer_id::text
     or p_expected_entity_id is distinct from p_sterilizer_id::text
     or v_item.deployment_key is distinct from p_expected_deployment_sterilizer_key
     or v_item.action is distinct from p_expected_action
     or p_expected_entity_type <> 'sterilizer_shell'
     or p_expected_action <> 'activate'
     or v_sterilizer.id is distinct from p_sterilizer_id
     or v_sterilizer.deployment_sterilizer_key is distinct from p_expected_deployment_sterilizer_key then
    return query select 'conflict'::text, p_claimant_id, v_session.clinic_id, v_session.deployment_run_key, v_session.id, v_session.execution_key,
      v_item.id, v_item.execution_item_key, v_item.plan_item_key, v_item.sequence, v_item.entity_type,
      v_item.entity_id, v_sterilizer.deployment_sterilizer_key, v_item.action, v_sterilizer.id,
      v_item.execution_status, v_item.execution_status, v_item.started_at, v_item.completed_at, v_item.attempt_count,
      'item_identity_compare_failed'::text, 'Sterilizer-shell item identity compare-and-set failed.'::text;
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
      v_item.entity_id, v_sterilizer.deployment_sterilizer_key, v_item.action, v_sterilizer.id,
      v_item.execution_status, v_item.execution_status, v_item.started_at, v_item.completed_at, v_item.attempt_count,
      'stale_state'::text, 'Sterilizer-shell execution item changed before completion.'::text;
    return;
  end if;

  if jsonb_build_object('deploymentSterilizerKey', v_sterilizer.deployment_sterilizer_key, 'provisioningSource', v_sterilizer.provisioning_source, 'provisioningStatus', v_sterilizer.provisioning_status, 'active', v_sterilizer.active)
       is distinct from p_expected_sterilizer_state
     or v_item.target_state is distinct from p_expected_target_state
     or p_expected_target_state is distinct from jsonb_build_object('provisioningStatus', 'active', 'active', true)
     or v_sterilizer.provisioning_source is distinct from 'setup_draft'
     or v_sterilizer.provisioning_status is distinct from 'active'
     or v_sterilizer.active is distinct from true then
    return query select 'blocked'::text, p_claimant_id, v_session.clinic_id, v_session.deployment_run_key, v_session.id, v_session.execution_key,
      v_item.id, v_item.execution_item_key, v_item.plan_item_key, v_item.sequence, v_item.entity_type,
      v_item.entity_id, v_sterilizer.deployment_sterilizer_key, v_item.action, v_sterilizer.id,
      v_item.execution_status, v_item.execution_status, v_item.started_at, v_item.completed_at, v_item.attempt_count,
      'sterilizer_state_invalid'::text, 'Sterilizer shell durable state is not completion-safe.'::text;
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
      v_item.entity_id, v_sterilizer.deployment_sterilizer_key, v_item.action, v_sterilizer.id,
      v_item.execution_status, v_item.execution_status, v_item.started_at, v_item.completed_at, v_item.attempt_count,
      'ordering_integrity_failed'::text, 'Sterilizer-shell item dependency or ordering integrity failed.'::text;
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
     and update_item.entity_type = 'sterilizer_shell'
     and update_item.entity_id = p_expected_entity_id
     and update_item.deployment_key = p_expected_deployment_sterilizer_key
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
      v_item.entity_id, v_sterilizer.deployment_sterilizer_key, v_item.action, v_sterilizer.id,
      v_item.execution_status, v_item.execution_status, v_item.started_at, v_item.completed_at, v_item.attempt_count,
      'stale_state'::text, 'Sterilizer-shell item completion compare-and-set wrote no rows.'::text;
    return;
  end if;

  return query select 'completed'::text, p_claimant_id, v_session.clinic_id, v_session.deployment_run_key, v_session.id, v_session.execution_key,
    v_item.id, v_item.execution_item_key, v_item.plan_item_key, v_item.sequence, v_item.entity_type,
    v_item.entity_id, v_sterilizer.deployment_sterilizer_key, v_item.action, v_sterilizer.id,
    v_item.execution_status, 'succeeded'::text, v_item.started_at, p_proposed_completed_at, v_item.attempt_count,
    null::text, 'Sterilizer-shell execution item was completed. Dependency progression was not attempted.'::text;
end;
$$;

revoke all on function public.complete_deployment_sterilizer_shell_execution_item(
  uuid, text, uuid, text, text, text, timestamptz, uuid, text, text, integer, text, text, text, text, timestamptz, integer, uuid, jsonb, jsonb, timestamptz
) from public, anon, authenticated;

grant execute on function public.complete_deployment_sterilizer_shell_execution_item(
  uuid, text, uuid, text, text, text, timestamptz, uuid, text, text, integer, text, text, text, text, timestamptz, integer, uuid, jsonb, jsonb, timestamptz
) to service_role;
