-- RC8 Slice 9B: atomic next execution-item start boundary.
-- Apply manually in the Supabase SQL editor after review. This function starts
-- only the selected deterministic ready item; it does not activate entities,
-- mutate sessions, progress dependencies, complete items, finalize deployment,
-- renew leases, rotate tokens, or perform rollback.

create or replace function public.start_deployment_activation_execution_next_item(
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
  p_expected_attempt_count integer,
  p_expected_dependency_keys text[],
  p_proposed_started_at timestamptz
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
  entity_type text,
  entity_id text,
  action text,
  attempt_count integer,
  started_at timestamptz,
  lease_expires_at timestamptz,
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
  v_ready_count integer;
  v_running_count integer;
  v_duplicate_identity_count integer;
  v_succeeded_prefix_length integer;
  v_total_items integer;
  v_later_drift_count integer;
  v_dependency_count integer;
  v_distinct_dependency_count integer;
  v_succeeded_dependency_count integer;
begin
  select session_row.*
    into v_session
    from public.deployment_activation_execution_sessions session_row
   where session_row.id = p_session_id
     and session_row.clinic_id = p_clinic_id
     and session_row.deployment_run_key = p_deployment_run_key
     and session_row.execution_key = p_execution_key
   for update;

  if not found then
    return query select
      'not_found'::text, p_clinic_id, p_deployment_run_key, p_session_id, p_execution_key,
      p_item_id, p_execution_item_key, p_plan_item_key, p_expected_sequence,
      p_expected_entity_type, p_expected_entity_id, p_expected_action, 0,
      null::timestamptz, null::timestamptz,
      'missing_session'::text, 'Activation execution session was not found.'::text;
    return;
  end if;

  select item_row.*
    into v_item
    from public.deployment_activation_execution_items item_row
   where item_row.id = p_item_id
     and item_row.session_id = v_session.id
   for update;

  if not found then
    return query select
      'not_found'::text, v_session.clinic_id, v_session.deployment_run_key, v_session.id, v_session.execution_key,
      p_item_id, p_execution_item_key, p_plan_item_key, p_expected_sequence,
      p_expected_entity_type, p_expected_entity_id, p_expected_action, 0,
      null::timestamptz, v_session.lease_expires_at,
      'missing_item'::text, 'Activation execution next item was not found.'::text;
    return;
  end if;

  if v_session.preparation_status is distinct from 'ready'
     or v_session.execution_status is distinct from 'running'
     or v_session.started_at is null
     or v_session.completed_at is not null
     or v_session.failed_at is not null then
    return query select
      'blocked'::text, v_session.clinic_id, v_session.deployment_run_key, v_session.id, v_session.execution_key,
      v_item.id, v_item.execution_item_key, v_item.plan_item_key, v_item.sequence,
      v_item.entity_type, v_item.entity_id::text, v_item.action, v_item.attempt_count,
      v_item.started_at, v_session.lease_expires_at,
      'session_not_startable'::text, 'Activation execution session is not in a next-item-start-safe lifecycle state.'::text;
    return;
  end if;

  if v_session.execution_owner is distinct from p_claimant_id
     or v_session.ownership_token is distinct from p_ownership_token
     or v_session.lease_expires_at is distinct from p_expected_lease_expires_at then
    return query select
      'conflict'::text, v_session.clinic_id, v_session.deployment_run_key, v_session.id, v_session.execution_key,
      v_item.id, v_item.execution_item_key, v_item.plan_item_key, v_item.sequence,
      v_item.entity_type, v_item.entity_id::text, v_item.action, v_item.attempt_count,
      v_item.started_at, v_session.lease_expires_at,
      'ownership_compare_failed'::text, 'Activation execution ownership compare-and-set failed.'::text;
    return;
  end if;

  if v_session.lease_expires_at is null or v_session.lease_expires_at <= p_proposed_started_at then
    return query select
      'blocked'::text, v_session.clinic_id, v_session.deployment_run_key, v_session.id, v_session.execution_key,
      v_item.id, v_item.execution_item_key, v_item.plan_item_key, v_item.sequence,
      v_item.entity_type, v_item.entity_id::text, v_item.action, v_item.attempt_count,
      v_item.started_at, v_session.lease_expires_at,
      'lease_not_active'::text, 'Activation execution lease is not active at the proposed start timestamp.'::text;
    return;
  end if;

  if v_item.execution_item_key is distinct from p_execution_item_key
     or v_item.plan_item_key is distinct from p_plan_item_key
     or v_item.sequence is distinct from p_expected_sequence
     or v_item.entity_type is distinct from p_expected_entity_type
     or v_item.entity_id::text is distinct from p_expected_entity_id
     or v_item.action is distinct from p_expected_action then
    return query select
      'conflict'::text, v_session.clinic_id, v_session.deployment_run_key, v_session.id, v_session.execution_key,
      v_item.id, v_item.execution_item_key, v_item.plan_item_key, v_item.sequence,
      v_item.entity_type, v_item.entity_id::text, v_item.action, v_item.attempt_count,
      v_item.started_at, v_session.lease_expires_at,
      'item_identity_compare_failed'::text, 'Activation execution next item identity compare-and-set failed.'::text;
    return;
  end if;

  select count(*)::integer
    into v_total_items
    from public.deployment_activation_execution_items total_item
   where total_item.session_id = v_session.id;

  select count(*)::integer
    into v_ready_count
    from public.deployment_activation_execution_items ready_item
   where ready_item.session_id = v_session.id
     and ready_item.execution_status = 'ready';

  select count(*)::integer
    into v_running_count
    from public.deployment_activation_execution_items running_item
   where running_item.session_id = v_session.id
     and running_item.execution_status = 'running';

  select count(*)::integer
    into v_duplicate_identity_count
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

  select count(*)::integer
    into v_succeeded_prefix_length
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

  select count(*)::integer
    into v_later_drift_count
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

  if jsonb_typeof(v_item.dependency_keys) is distinct from 'array'
     or coalesce(v_item.dependency_keys, '[]'::jsonb) is distinct from to_jsonb(coalesce(p_expected_dependency_keys, array[]::text[])) then
    return query select
      'blocked'::text, v_session.clinic_id, v_session.deployment_run_key, v_session.id, v_session.execution_key,
      v_item.id, v_item.execution_item_key, v_item.plan_item_key, v_item.sequence,
      v_item.entity_type, v_item.entity_id::text, v_item.action, v_item.attempt_count,
      v_item.started_at, v_session.lease_expires_at,
      'dependency_integrity_invalid'::text, 'Candidate execution item dependency evidence changed.'::text;
    return;
  end if;

  select jsonb_array_length(coalesce(v_item.dependency_keys, '[]'::jsonb))::integer
    into v_dependency_count;

  select count(distinct dependency_key.value)::integer
    into v_distinct_dependency_count
    from jsonb_array_elements_text(coalesce(v_item.dependency_keys, '[]'::jsonb)) dependency_key(value);

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

  if v_dependency_count <> v_distinct_dependency_count
     or v_dependency_count <> v_succeeded_dependency_count then
    return query select
      'blocked'::text, v_session.clinic_id, v_session.deployment_run_key, v_session.id, v_session.execution_key,
      v_item.id, v_item.execution_item_key, v_item.plan_item_key, v_item.sequence,
      v_item.entity_type, v_item.entity_id::text, v_item.action, v_item.attempt_count,
      v_item.started_at, v_session.lease_expires_at,
      'dependency_integrity_invalid'::text, 'Candidate dependencies must resolve to unique prior succeeded items.'::text;
    return;
  end if;
  if v_item.execution_status = 'running' then
    if v_item.attempt_count = 1
       and v_item.started_at is not null
       and v_item.completed_at is null
       and v_item.rolled_back_at is null
       and v_item.error_code is null
       and v_item.error_message is null
       and v_total_items = v_session.items_requested
       and v_ready_count = 0
       and v_running_count = 1
       and v_duplicate_identity_count = 0
       and v_succeeded_prefix_length = v_item.sequence - 1
       and v_later_drift_count = 0 then
      return query select
        'already_started'::text, v_session.clinic_id, v_session.deployment_run_key, v_session.id, v_session.execution_key,
        v_item.id, v_item.execution_item_key, v_item.plan_item_key, v_item.sequence,
        v_item.entity_type, v_item.entity_id::text, v_item.action, v_item.attempt_count,
        v_item.started_at, v_session.lease_expires_at,
        null::text, 'Activation execution next item is already running. No rows were changed.'::text;
      return;
    end if;

    return query select
      'blocked'::text, v_session.clinic_id, v_session.deployment_run_key, v_session.id, v_session.execution_key,
      v_item.id, v_item.execution_item_key, v_item.plan_item_key, v_item.sequence,
      v_item.entity_type, v_item.entity_id::text, v_item.action, v_item.attempt_count,
      v_item.started_at, v_session.lease_expires_at,
      'running_item_not_reusable'::text, 'Running next-item evidence is not reusable.'::text;
    return;
  end if;

  if v_total_items <> v_session.items_requested
     or v_ready_count <> 1
     or v_running_count <> 0
     or v_duplicate_identity_count <> 0
     or v_succeeded_prefix_length <> v_item.sequence - 1
     or v_later_drift_count <> 0 then
    return query select
      'blocked'::text, v_session.clinic_id, v_session.deployment_run_key, v_session.id, v_session.execution_key,
      v_item.id, v_item.execution_item_key, v_item.plan_item_key, v_item.sequence,
      v_item.entity_type, v_item.entity_id::text, v_item.action, v_item.attempt_count,
      v_item.started_at, v_session.lease_expires_at,
      'item_integrity_invalid'::text, 'Activation execution item set is not next-item-start safe.'::text;
    return;
  end if;

  if v_item.execution_status is distinct from 'ready'
     or v_item.attempt_count is distinct from p_expected_attempt_count
     or p_expected_attempt_count <> 0
     or v_item.started_at is not null
     or v_item.completed_at is not null
     or v_item.rolled_back_at is not null
     or v_item.error_code is not null
     or v_item.error_message is not null then
    return query select
      'blocked'::text, v_session.clinic_id, v_session.deployment_run_key, v_session.id, v_session.execution_key,
      v_item.id, v_item.execution_item_key, v_item.plan_item_key, v_item.sequence,
      v_item.entity_type, v_item.entity_id::text, v_item.action, v_item.attempt_count,
      v_item.started_at, v_session.lease_expires_at,
      'candidate_not_startable'::text, 'Candidate execution item is not ready for atomic next-item start.'::text;
    return;
  end if;


  update public.deployment_activation_execution_items update_item
     set execution_status = 'running',
         attempt_count = update_item.attempt_count + 1,
         started_at = p_proposed_started_at
   where update_item.id = v_item.id
     and update_item.session_id = v_session.id
     and update_item.execution_item_key = p_execution_item_key
     and update_item.plan_item_key = p_plan_item_key
     and update_item.sequence = p_expected_sequence
     and update_item.execution_status = 'ready'
     and update_item.attempt_count = p_expected_attempt_count
     and update_item.started_at is null
     and update_item.completed_at is null
     and update_item.rolled_back_at is null
     and update_item.error_code is null
     and update_item.error_message is null
   returning update_item.* into v_item;

  if not found then
    return query select
      'conflict'::text, v_session.clinic_id, v_session.deployment_run_key, v_session.id, v_session.execution_key,
      p_item_id, p_execution_item_key, p_plan_item_key, p_expected_sequence,
      p_expected_entity_type, p_expected_entity_id, p_expected_action, p_expected_attempt_count,
      null::timestamptz, v_session.lease_expires_at,
      'stale_state'::text, 'Activation execution next item changed before atomic start.'::text;
    return;
  end if;

  return query select
    'started'::text, v_session.clinic_id, v_session.deployment_run_key, v_session.id, v_session.execution_key,
    v_item.id, v_item.execution_item_key, v_item.plan_item_key, v_item.sequence,
    v_item.entity_type, v_item.entity_id::text, v_item.action, v_item.attempt_count,
    v_item.started_at, v_session.lease_expires_at,
    null::text, 'Activation execution next item was started. No provider or entity activation was executed.'::text;
end;
$$;

revoke execute on function public.start_deployment_activation_execution_next_item(
  uuid, text, uuid, text, text, text, timestamptz, uuid, text, text,
  integer, text, text, text, integer, text[], timestamptz
) from public;

revoke execute on function public.start_deployment_activation_execution_next_item(
  uuid, text, uuid, text, text, text, timestamptz, uuid, text, text,
  integer, text, text, text, integer, text[], timestamptz
) from anon;

revoke execute on function public.start_deployment_activation_execution_next_item(
  uuid, text, uuid, text, text, text, timestamptz, uuid, text, text,
  integer, text, text, text, integer, text[], timestamptz
) from authenticated;

grant execute on function public.start_deployment_activation_execution_next_item(
  uuid, text, uuid, text, text, text, timestamptz, uuid, text, text,
  integer, text, text, text, integer, text[], timestamptz
) to service_role;