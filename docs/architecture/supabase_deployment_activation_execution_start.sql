-- RC8 Slice 4B activation execution atomic start boundary.
-- Adds a session-only start RPC. No item starts, attempts, activation, binding, rollback, or deployment finalization occurs here.

create index if not exists deployment_activation_execution_sessions_start_lookup_idx
  on public.deployment_activation_execution_sessions (clinic_id, deployment_run_key, execution_key, execution_status);

create index if not exists deployment_activation_execution_items_start_status_idx
  on public.deployment_activation_execution_items (session_id, execution_status, sequence);

create or replace function public.start_deployment_activation_execution_session(
  p_clinic_id uuid,
  p_deployment_run_key text,
  p_session_id uuid,
  p_execution_key text,
  p_claimant_id text,
  p_ownership_token text,
  p_expected_lease_expires_at timestamptz,
  p_proposed_started_at timestamptz,
  p_expected_item_count integer
)
returns table (
  status text,
  session_id uuid,
  execution_key text,
  execution_owner text,
  lease_expires_at timestamptz,
  execution_status text,
  started_at timestamptz,
  item_count integer,
  issue_code text,
  message text
)
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_session public.deployment_activation_execution_sessions%rowtype;
  v_items record;
begin
  if p_claimant_id is null or length(btrim(p_claimant_id)) = 0 then
    return query select
      'blocked'::text, p_session_id, p_execution_key, null::text,
      null::timestamptz, null::text, null::timestamptz, 0,
      'claimant_invalid'::text,
      'Claimant id is required.'::text;
    return;
  end if;

  if p_ownership_token is null or length(btrim(p_ownership_token)) = 0 then
    return query select
      'blocked'::text, p_session_id, p_execution_key, null::text,
      null::timestamptz, null::text, null::timestamptz, 0,
      'ownership_token_invalid'::text,
      'Ownership token is required.'::text;
    return;
  end if;

  select *
  into v_session
  from public.deployment_activation_execution_sessions start_session
  where start_session.clinic_id = p_clinic_id
    and start_session.deployment_run_key = p_deployment_run_key
    and start_session.id = p_session_id
    and start_session.execution_key = p_execution_key
  for update;

  if not found then
    return query select
      'not_found'::text, p_session_id, p_execution_key, null::text,
      null::timestamptz, null::text, null::timestamptz, 0,
      'missing_session'::text,
      'Activation execution session was not found.'::text;
    return;
  end if;

  if v_session.execution_status = 'running'
    and v_session.execution_owner = p_claimant_id
    and v_session.ownership_token = p_ownership_token
    and v_session.lease_expires_at is not null
    and v_session.lease_expires_at > p_proposed_started_at
    and v_session.started_at is not null
    and v_session.completed_at is null
    and v_session.failed_at is null
  then
    return query select
      'already_started'::text, v_session.id, v_session.execution_key,
      v_session.execution_owner, v_session.lease_expires_at, v_session.execution_status,
      v_session.started_at, v_session.items_requested,
      null::text,
      'Activation execution session is already running for this owner. No item execution was started.'::text;
    return;
  end if;

  if v_session.execution_owner is distinct from p_claimant_id
    or v_session.ownership_token is distinct from p_ownership_token
    or v_session.lease_expires_at is distinct from p_expected_lease_expires_at
  then
    return query select
      'conflict'::text, v_session.id, v_session.execution_key,
      v_session.execution_owner, v_session.lease_expires_at, v_session.execution_status,
      v_session.started_at, 0,
      'ownership_compare_failed'::text,
      'Execution session ownership compare-and-set failed.'::text;
    return;
  end if;

  if v_session.preparation_status <> 'ready'
    or v_session.execution_status <> 'claimed'
    or v_session.started_at is not null
    or v_session.completed_at is not null
    or v_session.failed_at is not null
  then
    return query select
      'blocked'::text, v_session.id, v_session.execution_key,
      v_session.execution_owner, v_session.lease_expires_at, v_session.execution_status,
      v_session.started_at, 0,
      'session_not_startable'::text,
      'Activation execution session is not in a start-safe lifecycle state.'::text;
    return;
  end if;

  if v_session.lease_expires_at is null or v_session.lease_expires_at <= p_proposed_started_at then
    return query select
      'blocked'::text, v_session.id, v_session.execution_key,
      v_session.execution_owner, v_session.lease_expires_at, v_session.execution_status,
      v_session.started_at, 0,
      'lease_not_active'::text,
      'Activation execution session lease is not active at the proposed start timestamp.'::text;
    return;
  end if;

  select
    count(*)::integer as item_count,
    count(*) filter (where start_item.execution_status = 'ready')::integer as ready_count,
    count(*) filter (where start_item.execution_status = 'pending')::integer as pending_count,
    count(*) filter (where start_item.execution_status not in ('ready', 'pending'))::integer as invalid_status_count,
    count(*) filter (where start_item.attempt_count > 0)::integer as attempted_count,
    count(*) filter (where start_item.started_at is not null or start_item.completed_at is not null)::integer as execution_timestamp_count,
    count(*) filter (where start_item.rolled_back_at is not null)::integer as rollback_timestamp_count,
    count(*) filter (where start_item.error_code is not null or start_item.error_message is not null)::integer as error_count,
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
    ) as duplicate_sequence_count,
    count(*) filter (
      where start_item.execution_status = 'ready'
        and jsonb_typeof(start_item.dependency_keys) = 'array'
        and jsonb_array_length(start_item.dependency_keys) = 0
    )::integer as ready_root_count,
    count(*) filter (
      where start_item.execution_status = 'pending'
        and jsonb_typeof(start_item.dependency_keys) = 'array'
        and jsonb_array_length(start_item.dependency_keys) = 0
    )::integer as pending_root_count,
    count(*) filter (where jsonb_typeof(start_item.dependency_keys) <> 'array')::integer as malformed_dependency_count,
    min(start_item.sequence) as first_sequence,
    (
      select first_item.execution_status
      from public.deployment_activation_execution_items first_item
      where first_item.session_id = v_session.id
      order by first_item.sequence, first_item.execution_item_key
      limit 1
    ) as first_status
  into v_items
  from public.deployment_activation_execution_items start_item
  where start_item.session_id = v_session.id;

  if v_items.item_count <> v_session.items_requested
    or v_items.item_count <> p_expected_item_count
    or v_items.ready_count + v_items.pending_count <> v_session.items_requested
    or v_session.items_ready <> v_items.ready_count
    or v_session.items_pending <> v_items.pending_count
    or v_session.items_blocked <> 0
    or v_items.ready_count <> 1
    or v_items.invalid_status_count <> 0
    or v_items.attempted_count <> 0
    or v_items.execution_timestamp_count <> 0
    or v_items.rollback_timestamp_count <> 0
    or v_items.error_count <> 0
    or v_items.duplicate_execution_item_key_count <> 0
    or v_items.duplicate_plan_item_key_count <> 0
    or v_items.duplicate_sequence_count <> 0
    or v_items.ready_root_count <> 1
    or v_items.pending_root_count <> 0
    or v_items.malformed_dependency_count <> 0
    or v_items.first_sequence <> 1
    or v_items.first_status <> 'ready'
  then
    return query select
      'blocked'::text, v_session.id, v_session.execution_key,
      v_session.execution_owner, v_session.lease_expires_at, v_session.execution_status,
      v_session.started_at, coalesce(v_items.item_count, 0),
      'item_integrity_invalid'::text,
      'Activation execution item set is not start-safe.'::text;
    return;
  end if;

  update public.deployment_activation_execution_sessions update_session
  set execution_status = 'running',
      started_at = p_proposed_started_at
  where update_session.id = v_session.id
  returning * into v_session;

  return query select
    'started'::text, v_session.id, v_session.execution_key,
    v_session.execution_owner, v_session.lease_expires_at, v_session.execution_status,
    v_session.started_at, v_items.item_count,
    null::text,
    'Activation execution session was started. No execution items were started.'::text;
end;
$$;

comment on function public.start_deployment_activation_execution_session(
  uuid,
  text,
  uuid,
  text,
  text,
  text,
  timestamptz,
  timestamptz,
  integer
) is
  'Atomically starts a claimed activation execution session only. It updates execution_status and started_at on the session, and does not mutate items, activate records, bind hardware, finalize assignments, finalize deployment runs, renew leases, rotate tokens, heartbeat, or execute rollback.';

revoke all on function public.start_deployment_activation_execution_session(
  uuid,
  text,
  uuid,
  text,
  text,
  text,
  timestamptz,
  timestamptz,
  integer
) from public;

revoke all on function public.start_deployment_activation_execution_session(
  uuid,
  text,
  uuid,
  text,
  text,
  text,
  timestamptz,
  timestamptz,
  integer
) from anon;

revoke all on function public.start_deployment_activation_execution_session(
  uuid,
  text,
  uuid,
  text,
  text,
  text,
  timestamptz,
  timestamptz,
  integer
) from authenticated;

grant execute on function public.start_deployment_activation_execution_session(
  uuid,
  text,
  uuid,
  text,
  text,
  text,
  timestamptz,
  timestamptz,
  integer
) to service_role;