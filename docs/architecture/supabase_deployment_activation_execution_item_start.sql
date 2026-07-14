-- RC8 Slice 5B activation execution atomic item-start boundary.
-- Starts exactly one ready execution item. No activation action, dependent unlock, session mutation, binding, finalization, or rollback occurs here.

create index if not exists deployment_activation_execution_items_item_start_lookup_idx
  on public.deployment_activation_execution_items (session_id, execution_status, sequence, execution_item_key);

create or replace function public.start_deployment_activation_execution_item(
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
  p_expected_action text,
  p_expected_entity_type text,
  p_expected_entity_key text,
  p_proposed_started_at timestamptz,
  p_expected_attempt_count integer
)
returns table (
  status text,
  session_id uuid,
  execution_key text,
  item_id uuid,
  execution_item_key text,
  plan_item_key text,
  sequence integer,
  action text,
  entity_type text,
  entity_key text,
  execution_status text,
  attempt_count integer,
  started_at timestamptz,
  lease_expires_at timestamptz,
  issue_code text,
  message text
)
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_session public.deployment_activation_execution_sessions%rowtype;
  v_item public.deployment_activation_execution_items%rowtype;
  v_counts record;
  v_first_ready_item_id uuid;
  v_running_count integer;
begin
  if p_claimant_id is null or length(btrim(p_claimant_id)) = 0 then
    return query select 'blocked'::text, p_session_id, p_execution_key, p_item_id, p_execution_item_key,
      p_plan_item_key, p_expected_sequence, p_expected_action, p_expected_entity_type, p_expected_entity_key,
      null::text, 0, null::timestamptz, null::timestamptz, 'claimant_invalid'::text, 'Claimant id is required.'::text;
    return;
  end if;

  if p_ownership_token is null or length(btrim(p_ownership_token)) = 0 then
    return query select 'blocked'::text, p_session_id, p_execution_key, p_item_id, p_execution_item_key,
      p_plan_item_key, p_expected_sequence, p_expected_action, p_expected_entity_type, p_expected_entity_key,
      null::text, 0, null::timestamptz, null::timestamptz, 'ownership_token_invalid'::text, 'Ownership token is required.'::text;
    return;
  end if;

  select *
  into v_session
  from public.deployment_activation_execution_sessions item_start_session
  where item_start_session.clinic_id = p_clinic_id
    and item_start_session.deployment_run_key = p_deployment_run_key
    and item_start_session.id = p_session_id
    and item_start_session.execution_key = p_execution_key
  for update;

  if not found then
    return query select 'not_found'::text, p_session_id, p_execution_key, p_item_id, p_execution_item_key,
      p_plan_item_key, p_expected_sequence, p_expected_action, p_expected_entity_type, p_expected_entity_key,
      null::text, 0, null::timestamptz, null::timestamptz, 'missing_session'::text, 'Activation execution session was not found.'::text;
    return;
  end if;

  select *
  into v_item
  from public.deployment_activation_execution_items selected_item
  where selected_item.session_id = v_session.id
    and selected_item.id = p_item_id
  for update;

  if not found then
    return query select 'not_found'::text, v_session.id, v_session.execution_key, p_item_id, p_execution_item_key,
      p_plan_item_key, p_expected_sequence, p_expected_action, p_expected_entity_type, p_expected_entity_key,
      null::text, 0, null::timestamptz, v_session.lease_expires_at, 'missing_item'::text, 'Activation execution item was not found.'::text;
    return;
  end if;

  if v_session.execution_owner is distinct from p_claimant_id
    or v_session.ownership_token is distinct from p_ownership_token
    or v_session.lease_expires_at is distinct from p_expected_lease_expires_at
  then
    return query select 'conflict'::text, v_session.id, v_session.execution_key, v_item.id, v_item.execution_item_key,
      v_item.plan_item_key, v_item.sequence, v_item.action, v_item.entity_type, v_item.deployment_key,
      v_item.execution_status, v_item.attempt_count, v_item.started_at, v_session.lease_expires_at,
      'ownership_compare_failed'::text, 'Execution session ownership compare-and-set failed.'::text;
    return;
  end if;

  if v_session.preparation_status <> 'ready'
    or v_session.execution_status <> 'running'
    or v_session.started_at is null
    or v_session.completed_at is not null
    or v_session.failed_at is not null
  then
    return query select 'blocked'::text, v_session.id, v_session.execution_key, v_item.id, v_item.execution_item_key,
      v_item.plan_item_key, v_item.sequence, v_item.action, v_item.entity_type, v_item.deployment_key,
      v_item.execution_status, v_item.attempt_count, v_item.started_at, v_session.lease_expires_at,
      'session_not_item_startable'::text, 'Activation execution session is not in an item-start-safe lifecycle state.'::text;
    return;
  end if;

  if v_session.lease_expires_at is null or v_session.lease_expires_at <= p_proposed_started_at then
    return query select 'blocked'::text, v_session.id, v_session.execution_key, v_item.id, v_item.execution_item_key,
      v_item.plan_item_key, v_item.sequence, v_item.action, v_item.entity_type, v_item.deployment_key,
      v_item.execution_status, v_item.attempt_count, v_item.started_at, v_session.lease_expires_at,
      'lease_not_active'::text, 'Activation execution session lease is not active at the proposed item-start timestamp.'::text;
    return;
  end if;

  if v_item.execution_item_key is distinct from p_execution_item_key
    or v_item.plan_item_key is distinct from p_plan_item_key
    or v_item.sequence is distinct from p_expected_sequence
    or v_item.action is distinct from p_expected_action
    or v_item.entity_type is distinct from p_expected_entity_type
    or v_item.deployment_key is distinct from p_expected_entity_key
  then
    return query select 'conflict'::text, v_session.id, v_session.execution_key, v_item.id, v_item.execution_item_key,
      v_item.plan_item_key, v_item.sequence, v_item.action, v_item.entity_type, v_item.deployment_key,
      v_item.execution_status, v_item.attempt_count, v_item.started_at, v_session.lease_expires_at,
      'item_identity_compare_failed'::text, 'Execution item identity compare-and-set failed.'::text;
    return;
  end if;

  select
    count(*)::integer as item_count,
    count(*) filter (where integrity_item.execution_status = 'ready')::integer as ready_count,
    count(*) filter (where integrity_item.execution_status = 'pending')::integer as pending_count,
    count(*) filter (where integrity_item.execution_status = 'running')::integer as running_count,
    count(*) filter (where integrity_item.execution_status = 'succeeded')::integer as succeeded_count,
    count(*) filter (where integrity_item.execution_status = 'failed')::integer as failed_count,
    count(*) filter (where integrity_item.execution_status = 'blocked')::integer as blocked_count,
    count(*) filter (where integrity_item.attempt_count > 0)::integer as attempted_count,
    count(*) filter (where integrity_item.started_at is not null or integrity_item.completed_at is not null)::integer as timestamped_count,
    count(*) filter (where integrity_item.rolled_back_at is not null)::integer as rollback_count,
    count(*) filter (where integrity_item.error_code is not null or integrity_item.error_message is not null)::integer as error_count,
    count(*) filter (where jsonb_typeof(integrity_item.dependency_keys) <> 'array')::integer as malformed_dependency_count,
    (
      select count(*)::integer
      from (
        select duplicate_item.execution_item_key
        from public.deployment_activation_execution_items duplicate_item
        where duplicate_item.session_id = v_session.id
        group by duplicate_item.execution_item_key
        having count(*) > 1
      ) duplicate_execution_items
    ) as duplicate_execution_item_key_count,
    (
      select count(*)::integer
      from (
        select duplicate_plan_item.plan_item_key
        from public.deployment_activation_execution_items duplicate_plan_item
        where duplicate_plan_item.session_id = v_session.id
        group by duplicate_plan_item.plan_item_key
        having count(*) > 1
      ) duplicate_plan_items
    ) as duplicate_plan_item_key_count,
    (
      select count(*)::integer
      from (
        select duplicate_sequence.sequence
        from public.deployment_activation_execution_items duplicate_sequence
        where duplicate_sequence.session_id = v_session.id
        group by duplicate_sequence.sequence
        having count(*) > 1
      ) duplicate_sequences
    ) as duplicate_sequence_count
  into v_counts
  from public.deployment_activation_execution_items integrity_item
  where integrity_item.session_id = v_session.id;

  select first_ready_item.id
  into v_first_ready_item_id
  from public.deployment_activation_execution_items first_ready_item
  where first_ready_item.session_id = v_session.id
    and first_ready_item.execution_status = 'ready'
  order by first_ready_item.sequence, first_ready_item.execution_item_key
  limit 1;

  if v_item.execution_status = 'running' then
    select count(*)::integer
    into v_running_count
    from public.deployment_activation_execution_items running_item
    where running_item.session_id = v_session.id
      and running_item.execution_status = 'running';

    if v_item.attempt_count = 1
      and v_item.started_at is not null
      and v_item.completed_at is null
      and v_item.rolled_back_at is null
      and v_item.error_code is null
      and v_item.error_message is null
      and v_running_count = 1
      and v_counts.item_count = v_session.items_requested
      and v_counts.ready_count = 0
      and v_counts.pending_count + v_counts.running_count = v_session.items_requested
      and v_counts.succeeded_count = 0
      and v_counts.failed_count = 0
      and v_counts.blocked_count = 0
      and v_counts.attempted_count = 1
      and v_counts.timestamped_count = 1
      and v_counts.rollback_count = 0
      and v_counts.error_count = 0
      and v_counts.duplicate_execution_item_key_count = 0
      and v_counts.duplicate_plan_item_key_count = 0
      and v_counts.duplicate_sequence_count = 0
      and v_counts.malformed_dependency_count = 0
    then
      return query select 'already_started'::text, v_session.id, v_session.execution_key, v_item.id, v_item.execution_item_key,
        v_item.plan_item_key, v_item.sequence, v_item.action, v_item.entity_type, v_item.deployment_key,
        v_item.execution_status, v_item.attempt_count, v_item.started_at, v_session.lease_expires_at,
        null::text, 'Activation execution item is already running. No timestamp, attempt, lease, or dependent item was changed.'::text;
      return;
    end if;

    return query select 'blocked'::text, v_session.id, v_session.execution_key, v_item.id, v_item.execution_item_key,
      v_item.plan_item_key, v_item.sequence, v_item.action, v_item.entity_type, v_item.deployment_key,
      v_item.execution_status, v_item.attempt_count, v_item.started_at, v_session.lease_expires_at,
      'running_item_not_reusable'::text, 'Running execution item evidence is not reusable.'::text;
    return;
  end if;

  if v_counts.item_count <> v_session.items_requested
    or v_counts.ready_count <> 1
    or v_counts.running_count <> 0
    or v_counts.succeeded_count <> 0
    or v_counts.failed_count <> 0
    or v_counts.blocked_count <> 0
    or v_counts.ready_count + v_counts.pending_count <> v_session.items_requested
    or v_counts.attempted_count <> 0
    or v_counts.timestamped_count <> 0
    or v_counts.rollback_count <> 0
    or v_counts.error_count <> 0
    or v_counts.duplicate_execution_item_key_count <> 0
    or v_counts.duplicate_plan_item_key_count <> 0
    or v_counts.duplicate_sequence_count <> 0
    or v_counts.malformed_dependency_count <> 0
    or v_first_ready_item_id is distinct from v_item.id
  then
    return query select 'blocked'::text, v_session.id, v_session.execution_key, v_item.id, v_item.execution_item_key,
      v_item.plan_item_key, v_item.sequence, v_item.action, v_item.entity_type, v_item.deployment_key,
      v_item.execution_status, v_item.attempt_count, v_item.started_at, v_session.lease_expires_at,
      'item_integrity_invalid'::text, 'Activation execution item set is not item-start-safe.'::text;
    return;
  end if;

  if v_item.execution_status <> 'ready'
    or v_item.attempt_count is distinct from p_expected_attempt_count
    or p_expected_attempt_count <> 0
    or v_item.started_at is not null
    or v_item.completed_at is not null
    or v_item.rolled_back_at is not null
    or v_item.error_code is not null
    or v_item.error_message is not null
  then
    return query select 'blocked'::text, v_session.id, v_session.execution_key, v_item.id, v_item.execution_item_key,
      v_item.plan_item_key, v_item.sequence, v_item.action, v_item.entity_type, v_item.deployment_key,
      v_item.execution_status, v_item.attempt_count, v_item.started_at, v_session.lease_expires_at,
      'candidate_not_startable'::text, 'Candidate execution item is not ready for atomic start.'::text;
    return;
  end if;

  if jsonb_typeof(v_item.dependency_keys) <> 'array'
    or (
      v_item.sequence = 1
      and jsonb_array_length(v_item.dependency_keys) <> 0
    )
    or (
      v_item.sequence > 1
      and exists (
        select 1
        from jsonb_array_elements_text(v_item.dependency_keys) dependency_key(value)
        where not exists (
          select 1
          from public.deployment_activation_execution_items dependency_item
          where dependency_item.session_id = v_session.id
            and dependency_item.plan_item_key = dependency_key.value
            and dependency_item.execution_status = 'succeeded'
        )
      )
    )
  then
    return query select 'blocked'::text, v_session.id, v_session.execution_key, v_item.id, v_item.execution_item_key,
      v_item.plan_item_key, v_item.sequence, v_item.action, v_item.entity_type, v_item.deployment_key,
      v_item.execution_status, v_item.attempt_count, v_item.started_at, v_session.lease_expires_at,
      'dependency_integrity_invalid'::text, 'Candidate execution item dependencies are not item-start-safe.'::text;
    return;
  end if;

  update public.deployment_activation_execution_items update_item
  set execution_status = 'running',
      attempt_count = update_item.attempt_count + 1,
      started_at = p_proposed_started_at
  where update_item.id = v_item.id
  returning * into v_item;

  return query select 'started'::text, v_session.id, v_session.execution_key, v_item.id, v_item.execution_item_key,
    v_item.plan_item_key, v_item.sequence, v_item.action, v_item.entity_type, v_item.deployment_key,
    v_item.execution_status, v_item.attempt_count, v_item.started_at, v_session.lease_expires_at,
    null::text, 'Activation execution item was started. No activation action was executed.'::text;
end;
$$;

comment on function public.start_deployment_activation_execution_item(
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
  integer,
  text,
  text,
  text,
  timestamptz,
  integer
) is
  'Atomically starts exactly one ready activation execution item by setting execution_status = running, incrementing attempt_count from 0 to 1, and setting started_at. It does not execute activation actions, mutate sessions, unlock dependent items, activate records, bind hardware, finalize deployment, renew leases, rotate tokens, heartbeat, or execute rollback.';

revoke all on function public.start_deployment_activation_execution_item(
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
  integer,
  text,
  text,
  text,
  timestamptz,
  integer
) from public;

revoke all on function public.start_deployment_activation_execution_item(
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
  integer,
  text,
  text,
  text,
  timestamptz,
  integer
) from anon;

revoke all on function public.start_deployment_activation_execution_item(
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
  integer,
  text,
  text,
  text,
  timestamptz,
  integer
) from authenticated;

grant execute on function public.start_deployment_activation_execution_item(
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
  integer,
  text,
  text,
  text,
  timestamptz,
  integer
) to service_role;