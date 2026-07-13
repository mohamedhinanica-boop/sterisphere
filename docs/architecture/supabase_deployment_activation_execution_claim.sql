-- RC8 Slice 3B activation execution atomic claim boundary.
-- Adds an atomic ownership RPC and supporting guards only.
-- No item starts, attempts, activation, binding, rollback, or deployment finalization occurs here.

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'deployment_activation_execution_sessions_ownership_shape_check'
      and conrelid = 'public.deployment_activation_execution_sessions'::regclass
  ) then
    alter table public.deployment_activation_execution_sessions
      add constraint deployment_activation_execution_sessions_ownership_shape_check
      check (
        (
          execution_status = 'prepared'
          and execution_owner is null
          and ownership_token is null
          and lease_expires_at is null
        )
        or (
          execution_status = 'claimed'
          and execution_owner is not null
          and length(btrim(execution_owner)) > 0
          and ownership_token is not null
          and length(btrim(ownership_token)) > 0
          and lease_expires_at is not null
          and started_at is null
          and completed_at is null
          and failed_at is null
        )
        or execution_status in (
          'running',
          'partially_completed',
          'completed',
          'failed',
          'rollback_required',
          'rolling_back',
          'rolled_back',
          'cancelled'
        )
      );
  end if;
end;
$$;

create index if not exists deployment_activation_execution_sessions_claim_lookup_idx
  on public.deployment_activation_execution_sessions (clinic_id, deployment_run_key, execution_key);

create index if not exists deployment_activation_execution_sessions_lease_idx
  on public.deployment_activation_execution_sessions (execution_status, lease_expires_at);

create index if not exists deployment_activation_execution_sessions_owner_lease_idx
  on public.deployment_activation_execution_sessions (clinic_id, execution_owner, lease_expires_at);

create index if not exists deployment_activation_execution_items_claim_status_idx
  on public.deployment_activation_execution_items (session_id, execution_status, sequence);

create or replace function public.claim_deployment_activation_execution_session(
  p_claim_mode text,
  p_clinic_id uuid,
  p_deployment_run_key text,
  p_session_id uuid,
  p_execution_key text,
  p_claimant_id text,
  p_proposed_ownership_token text,
  p_claimed_at timestamptz,
  p_proposed_lease_expires_at timestamptz,
  p_expected_item_count integer,
  p_expected_previous_owner text default null,
  p_expected_previous_ownership_token text default null,
  p_expected_previous_lease_expires_at timestamptz default null
)
returns table (
  status text,
  session_id uuid,
  execution_key text,
  execution_owner text,
  ownership_token text,
  lease_expires_at timestamptz,
  execution_status text,
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
  v_duration_seconds numeric;
begin
  if p_claim_mode not in ('fresh', 'same_owner', 'expired_reclaim') then
    return query select
      'blocked'::text, null::uuid, p_execution_key, null::text, null::text,
      null::timestamptz, null::text, 0,
      'invalid_claim_mode'::text,
      'Claim mode is not supported.'::text;
    return;
  end if;

  if p_claimant_id is null or length(btrim(p_claimant_id)) = 0 then
    return query select
      'blocked'::text, p_session_id, p_execution_key, null::text, null::text,
      null::timestamptz, null::text, 0,
      'claimant_invalid'::text,
      'Claimant id is required.'::text;
    return;
  end if;

  if p_proposed_ownership_token is null or length(btrim(p_proposed_ownership_token)) = 0 then
    return query select
      'blocked'::text, p_session_id, p_execution_key, null::text, null::text,
      null::timestamptz, null::text, 0,
      'ownership_token_invalid'::text,
      'Ownership token is required.'::text;
    return;
  end if;

  v_duration_seconds := extract(epoch from (p_proposed_lease_expires_at - p_claimed_at));

  if v_duration_seconds < 30 or v_duration_seconds > 900 then
    return query select
      'blocked'::text, p_session_id, p_execution_key, null::text, null::text,
      null::timestamptz, null::text, 0,
      'lease_duration_invalid'::text,
      'Lease duration must be between 30 and 900 seconds.'::text;
    return;
  end if;

  select *
  into v_session
  from public.deployment_activation_execution_sessions s
  where s.clinic_id = p_clinic_id
    and s.deployment_run_key = p_deployment_run_key
    and s.id = p_session_id
    and s.execution_key = p_execution_key
  for update;

  if not found then
    return query select
      'not_found'::text, p_session_id, p_execution_key, null::text, null::text,
      null::timestamptz, null::text, 0,
      'missing_session'::text,
      'Prepared activation execution session was not found.'::text;
    return;
  end if;

  if v_session.preparation_status <> 'ready'
    or v_session.blockers <> 0
    or v_session.items_blocked <> 0
    or v_session.started_at is not null
    or v_session.completed_at is not null
    or v_session.failed_at is not null
  then
    return query select
      'blocked'::text, v_session.id, v_session.execution_key, v_session.execution_owner,
      null::text, v_session.lease_expires_at, v_session.execution_status, 0,
      'session_not_claimable'::text,
      'Prepared activation execution session is not in a claim-safe state.'::text;
    return;
  end if;

  select
    count(*)::integer as item_count,
    count(*) filter (where i.execution_status = 'ready')::integer as ready_count,
    count(*) filter (where i.execution_status = 'pending')::integer as pending_count,
    count(*) filter (where i.execution_status not in ('ready', 'pending'))::integer as invalid_status_count,
    count(*) filter (where i.attempt_count > 0)::integer as attempted_count,
    count(*) filter (where i.started_at is not null or i.completed_at is not null)::integer as execution_timestamp_count,
    count(*) filter (where i.rolled_back_at is not null)::integer as rollback_timestamp_count,
    count(*) filter (where i.error_code is not null or i.error_message is not null)::integer as error_count,
    (
      select count(*)::integer
      from (
        select execution_item_key
        from public.deployment_activation_execution_items
        where session_id = v_session.id
        group by execution_item_key
        having count(*) > 1
      ) d
    ) as duplicate_execution_item_key_count,
    (
      select count(*)::integer
      from (
        select plan_item_key
        from public.deployment_activation_execution_items
        where session_id = v_session.id
        group by plan_item_key
        having count(*) > 1
      ) d
    ) as duplicate_plan_item_key_count,
    (
      select count(*)::integer
      from (
        select sequence
        from public.deployment_activation_execution_items
        where session_id = v_session.id
        group by sequence
        having count(*) > 1
      ) d
    ) as duplicate_sequence_count,
    count(*) filter (
      where i.execution_status = 'ready'
        and jsonb_typeof(i.dependency_keys) = 'array'
        and jsonb_array_length(i.dependency_keys) = 0
    )::integer as ready_root_count,
    count(*) filter (
      where i.execution_status = 'pending'
        and jsonb_typeof(i.dependency_keys) = 'array'
        and jsonb_array_length(i.dependency_keys) = 0
    )::integer as pending_root_count,
    count(*) filter (where jsonb_typeof(i.dependency_keys) <> 'array')::integer as malformed_dependency_count,
    min(i.sequence) as first_sequence,
    (
      select i2.execution_status
      from public.deployment_activation_execution_items i2
      where i2.session_id = v_session.id
      order by i2.sequence, i2.execution_item_key
      limit 1
    ) as first_status
  into v_items
  from public.deployment_activation_execution_items i
  where i.session_id = v_session.id;

  if v_items.item_count <> v_session.items_requested
    or v_items.item_count <> p_expected_item_count
    or v_items.ready_count + v_items.pending_count <> v_session.items_requested
    or v_items.invalid_status_count <> 0
    or v_items.attempted_count <> 0
    or v_items.execution_timestamp_count <> 0
    or v_items.rollback_timestamp_count <> 0
    or v_items.error_count <> 0
    or v_items.duplicate_execution_item_key_count <> 0
    or v_items.duplicate_plan_item_key_count <> 0
    or v_items.duplicate_sequence_count <> 0
    or v_items.ready_count < 1
    or v_items.ready_root_count <> 1
    or v_items.pending_root_count <> 0
    or v_items.malformed_dependency_count <> 0
    or v_items.first_status <> 'ready'
  then
    return query select
      'blocked'::text, v_session.id, v_session.execution_key, v_session.execution_owner,
      null::text, v_session.lease_expires_at, v_session.execution_status,
      coalesce(v_items.item_count, 0),
      'item_completeness_invalid'::text,
      'Prepared execution item set is not claim-safe.'::text;
    return;
  end if;

  if p_claim_mode = 'same_owner' then
    if v_session.execution_status = 'claimed'
      and v_session.execution_owner = p_claimant_id
      and v_session.ownership_token = coalesce(p_expected_previous_ownership_token, v_session.ownership_token)
      and v_session.lease_expires_at > p_claimed_at
    then
      return query select
        'already_owned'::text, v_session.id, v_session.execution_key,
        v_session.execution_owner, v_session.ownership_token,
        v_session.lease_expires_at, v_session.execution_status,
        v_items.item_count,
        null::text,
        'Prepared activation execution session is already owned by this claimant.'::text;
      return;
    end if;

    return query select
      'conflict'::text, v_session.id, v_session.execution_key, v_session.execution_owner,
      null::text, v_session.lease_expires_at, v_session.execution_status,
      v_items.item_count,
      'same_owner_compare_failed'::text,
      'Same-owner claim check did not match the current ownership state.'::text;
    return;
  end if;

  if p_claim_mode = 'fresh' then
    if v_session.execution_status = 'prepared'
      and v_session.execution_owner is null
      and v_session.ownership_token is null
      and v_session.lease_expires_at is null
    then
      update public.deployment_activation_execution_sessions
      set execution_owner = p_claimant_id,
          ownership_token = p_proposed_ownership_token,
          lease_expires_at = p_proposed_lease_expires_at,
          execution_status = 'claimed'
      where id = v_session.id
      returning * into v_session;

      return query select
        'claimed'::text, v_session.id, v_session.execution_key,
        v_session.execution_owner, v_session.ownership_token,
        v_session.lease_expires_at, v_session.execution_status,
        v_items.item_count,
        null::text,
        'Prepared activation execution session ownership was claimed. No execution was started.'::text;
      return;
    end if;

    return query select
      'conflict'::text, v_session.id, v_session.execution_key, v_session.execution_owner,
      null::text, v_session.lease_expires_at, v_session.execution_status,
      v_items.item_count,
      'fresh_claim_compare_failed'::text,
      'Fresh claim did not match an unowned prepared session.'::text;
    return;
  end if;

  if p_claim_mode = 'expired_reclaim' then
    if v_session.execution_status = 'claimed'
      and v_session.lease_expires_at <= p_claimed_at
      and v_session.execution_owner = p_expected_previous_owner
      and v_session.ownership_token = p_expected_previous_ownership_token
      and v_session.lease_expires_at = p_expected_previous_lease_expires_at
    then
      update public.deployment_activation_execution_sessions
      set execution_owner = p_claimant_id,
          ownership_token = p_proposed_ownership_token,
          lease_expires_at = p_proposed_lease_expires_at,
          execution_status = 'claimed'
      where id = v_session.id
      returning * into v_session;

      return query select
        'reclaimed'::text, v_session.id, v_session.execution_key,
        v_session.execution_owner, v_session.ownership_token,
        v_session.lease_expires_at, v_session.execution_status,
        v_items.item_count,
        null::text,
        'Expired activation execution ownership was reclaimed. No execution was started.'::text;
      return;
    end if;

    return query select
      'conflict'::text, v_session.id, v_session.execution_key, v_session.execution_owner,
      null::text, v_session.lease_expires_at, v_session.execution_status,
      v_items.item_count,
      'expired_reclaim_compare_failed'::text,
      'Expired reclaim did not match the expected stale ownership state.'::text;
    return;
  end if;
end;
$$;

comment on function public.claim_deployment_activation_execution_session(
  text,
  uuid,
  text,
  uuid,
  text,
  text,
  text,
  timestamptz,
  timestamptz,
  integer,
  text,
  text,
  timestamptz
) is
  'Atomically claims or reclaims prepared activation execution session ownership only. It does not start execution, mutate items, activate records, bind hardware, finalize assignments, finalize deployment runs, or execute rollback.';

revoke all on function public.claim_deployment_activation_execution_session(
  text,
  uuid,
  text,
  uuid,
  text,
  text,
  text,
  timestamptz,
  timestamptz,
  integer,
  text,
  text,
  timestamptz
) from public;

revoke all on function public.claim_deployment_activation_execution_session(
  text,
  uuid,
  text,
  uuid,
  text,
  text,
  text,
  timestamptz,
  timestamptz,
  integer,
  text,
  text,
  timestamptz
) from anon;

revoke all on function public.claim_deployment_activation_execution_session(
  text,
  uuid,
  text,
  uuid,
  text,
  text,
  text,
  timestamptz,
  timestamptz,
  integer,
  text,
  text,
  timestamptz
) from authenticated;

grant execute on function public.claim_deployment_activation_execution_session(
  text,
  uuid,
  text,
  uuid,
  text,
  text,
  text,
  timestamptz,
  timestamptz,
  integer,
  text,
  text,
  timestamptz
) to service_role;
