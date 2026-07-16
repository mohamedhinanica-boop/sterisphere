-- RC8 Slice 10B: atomic provider shell activation boundary.
-- Apply manually in the Supabase SQL editor after review.
-- This function activates only the selected provider shell referenced by the currently running provider_shell item.
-- It does not complete items, progress dependencies, start items, mutate sessions, renew leases, rotate tokens, finalize deployment, or rollback.

create or replace function public.activate_deployment_provider_shell(
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
  p_provider_id uuid,
  p_expected_provider_key text,
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
  provider_id uuid,
  deployment_provider_key text,
  provider_state_before jsonb,
  provider_state_after jsonb,
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
  v_provider public.providers%rowtype;
  v_state_before jsonb;
  v_state_after jsonb;
  v_running_count integer;
  v_ready_count integer;
  v_total_items integer;
  v_duplicate_item_identity_count integer;
  v_duplicate_provider_identity_count integer;
  v_succeeded_prefix_length integer;
  v_later_drift_count integer;
  v_dependency_count integer;
  v_distinct_dependency_count integer;
  v_succeeded_dependency_count integer;
begin
  if p_claimant_id is null or length(btrim(p_claimant_id)) = 0 then
    return query select 'blocked'::text, p_clinic_id, p_deployment_run_key, p_session_id, p_execution_key,
      p_item_id, p_execution_item_key, p_plan_item_key, p_expected_sequence, p_provider_id, p_expected_provider_key,
      null::jsonb, null::jsonb, null::timestamptz, 'claimant_invalid'::text, 'Claimant id is required.'::text;
    return;
  end if;

  if p_ownership_token is null or length(btrim(p_ownership_token)) = 0 then
    return query select 'blocked'::text, p_clinic_id, p_deployment_run_key, p_session_id, p_execution_key,
      p_item_id, p_execution_item_key, p_plan_item_key, p_expected_sequence, p_provider_id, p_expected_provider_key,
      null::jsonb, null::jsonb, null::timestamptz, 'ownership_token_invalid'::text, 'Ownership token is required.'::text;
    return;
  end if;

  if p_expected_current_state is null or jsonb_typeof(p_expected_current_state) <> 'object'
     or p_target_state is null or jsonb_typeof(p_target_state) <> 'object' then
    return query select 'blocked'::text, p_clinic_id, p_deployment_run_key, p_session_id, p_execution_key,
      p_item_id, p_execution_item_key, p_plan_item_key, p_expected_sequence, p_provider_id, p_expected_provider_key,
      null::jsonb, null::jsonb, null::timestamptz, 'state_evidence_invalid'::text, 'Provider activation state evidence must be JSON objects.'::text;
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
      p_item_id, p_execution_item_key, p_plan_item_key, p_expected_sequence, p_provider_id, p_expected_provider_key,
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
      p_item_id, p_execution_item_key, p_plan_item_key, p_expected_sequence, p_provider_id, p_expected_provider_key,
      null::jsonb, null::jsonb, null::timestamptz, 'missing_item'::text, 'Provider activation execution item was not found.'::text;
    return;
  end if;

  select provider_row.*
    into v_provider
    from public.providers provider_row
   where provider_row.id = p_provider_id
     and provider_row.clinic_id = p_clinic_id
     and provider_row.deployment_provider_key = p_expected_provider_key
   for update;

  if not found then
    return query select 'not_found'::text, v_session.clinic_id, v_session.deployment_run_key, v_session.id, v_session.execution_key,
      v_item.id, v_item.execution_item_key, v_item.plan_item_key, v_item.sequence, p_provider_id, p_expected_provider_key,
      null::jsonb, null::jsonb, null::timestamptz, 'missing_provider_shell'::text, 'Provider shell activation target was not found.'::text;
    return;
  end if;

  v_state_before := jsonb_build_object(
    'deploymentProviderKey', v_provider.deployment_provider_key,
    'provisioningSource', v_provider.provisioning_source,
    'provisioningStatus', v_provider.provisioning_status,
    'active', v_provider.active
  );

  if v_session.preparation_status is distinct from 'ready'
     or v_session.execution_status is distinct from 'running'
     or v_session.started_at is null
     or v_session.completed_at is not null
     or v_session.failed_at is not null then
    return query select 'blocked'::text, v_session.clinic_id, v_session.deployment_run_key, v_session.id, v_session.execution_key,
      v_item.id, v_item.execution_item_key, v_item.plan_item_key, v_item.sequence, v_provider.id, v_provider.deployment_provider_key,
      v_state_before, v_state_before, null::timestamptz, 'session_not_activation_safe'::text, 'Activation execution session is not provider-activation safe.'::text;
    return;
  end if;

  if v_session.execution_owner is distinct from p_claimant_id
     or v_session.ownership_token is distinct from p_ownership_token
     or v_session.lease_expires_at is distinct from p_expected_lease_expires_at then
    return query select 'conflict'::text, v_session.clinic_id, v_session.deployment_run_key, v_session.id, v_session.execution_key,
      v_item.id, v_item.execution_item_key, v_item.plan_item_key, v_item.sequence, v_provider.id, v_provider.deployment_provider_key,
      v_state_before, v_state_before, null::timestamptz, 'ownership_compare_failed'::text, 'Execution session ownership compare-and-set failed.'::text;
    return;
  end if;

  if v_session.lease_expires_at is null or v_session.lease_expires_at <= p_proposed_activated_at then
    return query select 'blocked'::text, v_session.clinic_id, v_session.deployment_run_key, v_session.id, v_session.execution_key,
      v_item.id, v_item.execution_item_key, v_item.plan_item_key, v_item.sequence, v_provider.id, v_provider.deployment_provider_key,
      v_state_before, v_state_before, null::timestamptz, 'lease_not_active'::text, 'Activation execution lease is not active at the proposed provider activation timestamp.'::text;
    return;
  end if;

  if v_item.execution_item_key is distinct from p_execution_item_key
     or v_item.plan_item_key is distinct from p_plan_item_key
     or v_item.sequence is distinct from p_expected_sequence
     or v_item.entity_type is distinct from p_expected_entity_type
     or v_item.entity_id::text is distinct from p_expected_entity_id
     or v_item.action is distinct from p_expected_action
     or p_expected_entity_type <> 'provider_shell'
     or p_expected_action <> 'activate' then
    return query select 'conflict'::text, v_session.clinic_id, v_session.deployment_run_key, v_session.id, v_session.execution_key,
      v_item.id, v_item.execution_item_key, v_item.plan_item_key, v_item.sequence, v_provider.id, v_provider.deployment_provider_key,
      v_state_before || jsonb_build_object(
        'identityDiagnostics',
        jsonb_build_object(
          'itemIdMatches', v_item.id = p_item_id,
          'executionItemKeyMatches', v_item.execution_item_key is not distinct from p_execution_item_key,
          'planItemKeyMatches', v_item.plan_item_key is not distinct from p_plan_item_key,
          'sequenceMatches', v_item.sequence is not distinct from p_expected_sequence,
          'entityTypeMatches', v_item.entity_type is not distinct from p_expected_entity_type,
          'entityIdMatchesProviderId', v_item.entity_id::text is not distinct from p_provider_id::text,
          'entityIdMatchesExpected', v_item.entity_id::text is not distinct from p_expected_entity_id,
          'actionMatches', v_item.action is not distinct from p_expected_action,
          'providerIdMatches', v_provider.id = p_provider_id,
          'providerKeyMatches', v_provider.deployment_provider_key is not distinct from p_expected_provider_key,
          'clinicMatches', v_session.clinic_id = p_clinic_id and v_provider.clinic_id = p_clinic_id,
          'deploymentRunMatches', v_session.deployment_run_key is not distinct from p_deployment_run_key,
          'executionKeyMatches', v_session.execution_key is not distinct from p_execution_key
        )
      ),
      v_state_before, null::timestamptz, 'item_identity_compare_failed'::text, 'Provider activation item identity compare-and-set failed.'::text;
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
      v_item.id, v_item.execution_item_key, v_item.plan_item_key, v_item.sequence, v_provider.id, v_provider.deployment_provider_key,
      v_state_before, v_state_before, null::timestamptz, 'item_not_activation_safe'::text, 'Provider activation item is not activation-safe.'::text;
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

  select count(*)::integer into v_duplicate_provider_identity_count
    from public.providers duplicate_provider
   where duplicate_provider.clinic_id = p_clinic_id
     and duplicate_provider.deployment_provider_key = p_expected_provider_key;

  if jsonb_typeof(coalesce(v_item.dependency_keys, '[]'::jsonb)) <> 'array' then
    return query select 'blocked'::text, v_session.clinic_id, v_session.deployment_run_key, v_session.id, v_session.execution_key,
      v_item.id, v_item.execution_item_key, v_item.plan_item_key, v_item.sequence, v_provider.id, v_provider.deployment_provider_key,
      v_state_before, v_state_before, null::timestamptz, 'dependency_integrity_invalid'::text, 'Provider activation item dependency evidence is malformed.'::text;
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
      v_item.id, v_item.execution_item_key, v_item.plan_item_key, v_item.sequence, v_provider.id, v_provider.deployment_provider_key,
      v_state_before, v_state_before, null::timestamptz, 'item_integrity_invalid'::text, 'Activation execution item set is not provider-activation safe.'::text;
    return;
  end if;

  if v_duplicate_provider_identity_count <> 1 then
    return query select 'conflict'::text, v_session.clinic_id, v_session.deployment_run_key, v_session.id, v_session.execution_key,
      v_item.id, v_item.execution_item_key, v_item.plan_item_key, v_item.sequence, v_provider.id, v_provider.deployment_provider_key,
      v_state_before, v_state_before, null::timestamptz, 'duplicate_provider_identity'::text, 'Provider deployment identity is not unique for this clinic.'::text;
    return;
  end if;

  if p_target_state is distinct from jsonb_build_object(
       'deploymentProviderKey', p_expected_provider_key,
       'provisioningSource', 'setup_draft',
       'provisioningStatus', 'active',
       'active', true
     ) then
    return query select 'blocked'::text, v_session.clinic_id, v_session.deployment_run_key, v_session.id, v_session.execution_key,
      v_item.id, v_item.execution_item_key, v_item.plan_item_key, v_item.sequence, v_provider.id, v_provider.deployment_provider_key,
      v_state_before, v_state_before, null::timestamptz, 'unsupported_target_state'::text, 'Provider activation target state is not supported.'::text;
    return;
  end if;

  if v_provider.active = true and v_provider.provisioning_source = 'setup_draft' and v_provider.provisioning_status = 'active' then
    v_state_after := v_state_before;
    return query select 'already_activated'::text, v_session.clinic_id, v_session.deployment_run_key, v_session.id, v_session.execution_key,
      v_item.id, v_item.execution_item_key, v_item.plan_item_key, v_item.sequence, v_provider.id, v_provider.deployment_provider_key,
      v_state_before, v_state_after, null::timestamptz, null::text, 'Provider shell already matches the activation target. No rows were changed.'::text;
    return;
  end if;

  if v_state_before is distinct from p_expected_current_state
     or v_provider.active is distinct from false
     or v_provider.provisioning_source is distinct from 'setup_draft'
     or v_provider.provisioning_status not in ('placeholder', 'planned') then
    return query select 'conflict'::text, v_session.clinic_id, v_session.deployment_run_key, v_session.id, v_session.execution_key,
      v_item.id, v_item.execution_item_key, v_item.plan_item_key, v_item.sequence, v_provider.id, v_provider.deployment_provider_key,
      v_state_before, v_state_before, null::timestamptz, 'provider_state_compare_failed'::text, 'Provider shell current state does not match expected activation evidence.'::text;
    return;
  end if;

  update public.providers update_provider
     set active = true,
         provisioning_status = 'active',
         updated_at = p_proposed_activated_at
   where update_provider.id = v_provider.id
     and update_provider.clinic_id = p_clinic_id
     and update_provider.deployment_provider_key = p_expected_provider_key
     and update_provider.active = false
     and update_provider.provisioning_source = 'setup_draft'
     and update_provider.provisioning_status in ('placeholder', 'planned')
   returning update_provider.* into v_provider;

  if not found then
    return query select 'conflict'::text, v_session.clinic_id, v_session.deployment_run_key, v_session.id, v_session.execution_key,
      p_item_id, p_execution_item_key, p_plan_item_key, p_expected_sequence, p_provider_id, p_expected_provider_key,
      v_state_before, v_state_before, null::timestamptz, 'stale_provider_state'::text, 'Provider shell changed before atomic activation.'::text;
    return;
  end if;

  v_state_after := jsonb_build_object(
    'deploymentProviderKey', v_provider.deployment_provider_key,
    'provisioningSource', v_provider.provisioning_source,
    'provisioningStatus', v_provider.provisioning_status,
    'active', v_provider.active
  );

  return query select 'activated'::text, v_session.clinic_id, v_session.deployment_run_key, v_session.id, v_session.execution_key,
    v_item.id, v_item.execution_item_key, v_item.plan_item_key, v_item.sequence, v_provider.id, v_provider.deployment_provider_key,
    v_state_before, v_state_after, p_proposed_activated_at, null::text, 'Provider shell was activated. Execution item remains running.'::text;
end;
$$;

comment on function public.activate_deployment_provider_shell(
  uuid, text, uuid, text, text, text, timestamptz, uuid, text, text,
  integer, text, text, text, timestamptz, integer, uuid, text, jsonb, jsonb, timestamptz
) is
  'Atomically activates only the selected setup-draft provider shell for the running provider_shell execution item. It does not mutate sessions, execution items, dependencies, leases, tokens, clinics, or other provider rows.';

revoke execute on function public.activate_deployment_provider_shell(
  uuid, text, uuid, text, text, text, timestamptz, uuid, text, text,
  integer, text, text, text, timestamptz, integer, uuid, text, jsonb, jsonb, timestamptz
) from public;

revoke execute on function public.activate_deployment_provider_shell(
  uuid, text, uuid, text, text, text, timestamptz, uuid, text, text,
  integer, text, text, text, timestamptz, integer, uuid, text, jsonb, jsonb, timestamptz
) from anon;

revoke execute on function public.activate_deployment_provider_shell(
  uuid, text, uuid, text, text, text, timestamptz, uuid, text, text,
  integer, text, text, text, timestamptz, integer, uuid, text, jsonb, jsonb, timestamptz
) from authenticated;

grant execute on function public.activate_deployment_provider_shell(
  uuid, text, uuid, text, text, text, timestamptz, uuid, text, text,
  integer, text, text, text, timestamptz, integer, uuid, text, jsonb, jsonb, timestamptz
) to service_role;