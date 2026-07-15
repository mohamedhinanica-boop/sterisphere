-- RC8 Slice 7B - atomic activation execution item completion boundary.
-- Apply manually with CREATE OR REPLACE FUNCTION only when promoting this slice.
-- This function completes only the currently running sequence-1 clinic activation item.

create or replace function public.complete_deployment_activation_execution_item(
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
  p_expected_action text,
  p_expected_started_at timestamptz,
  p_expected_attempt_count integer,
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
  action text,
  started_at timestamptz,
  completed_at timestamptz,
  attempt_count integer,
  execution_status_before text,
  execution_status_after text,
  issue_code text,
  message text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session public.deployment_activation_execution_sessions%rowtype;
  v_item public.deployment_activation_execution_items%rowtype;
  v_item_count integer := 0;
  v_duplicate_execution_item_keys integer := 0;
  v_duplicate_plan_item_keys integer := 0;
  v_duplicate_sequences integer := 0;
  v_rows_updated integer := 0;
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
      'not_found'::text,
      p_claimant_id,
      p_clinic_id,
      p_deployment_run_key,
      p_session_id,
      p_execution_key,
      p_item_id,
      p_execution_item_key,
      p_plan_item_key,
      p_expected_sequence,
      p_expected_entity_type,
      p_expected_action,
      null::timestamptz,
      null::timestamptz,
      null::integer,
      null::text,
      null::text,
      'item_not_found'::text,
      'Activation execution session or item was not found.'::text;
    return;
  end if;

  select count(*)::integer
    into v_item_count
  from public.deployment_activation_execution_items counted_item
  where counted_item.session_id = v_session.id;

  select count(*)::integer
    into v_duplicate_execution_item_keys
  from (
    select duplicate_item.execution_item_key
    from public.deployment_activation_execution_items duplicate_item
    where duplicate_item.session_id = v_session.id
    group by duplicate_item.execution_item_key
    having count(*) > 1
  ) duplicate_execution_item_key_rows;

  select count(*)::integer
    into v_duplicate_plan_item_keys
  from (
    select duplicate_item.plan_item_key
    from public.deployment_activation_execution_items duplicate_item
    where duplicate_item.session_id = v_session.id
    group by duplicate_item.plan_item_key
    having count(*) > 1
  ) duplicate_plan_item_key_rows;

  select count(*)::integer
    into v_duplicate_sequences
  from (
    select duplicate_item.sequence
    from public.deployment_activation_execution_items duplicate_item
    where duplicate_item.session_id = v_session.id
    group by duplicate_item.sequence
    having count(*) > 1
  ) duplicate_sequence_rows;

  if v_item_count is distinct from v_session.items_requested
     or v_duplicate_execution_item_keys > 0
     or v_duplicate_plan_item_keys > 0
     or v_duplicate_sequences > 0
  then
    return query select
      'blocked'::text,
      p_claimant_id,
      v_session.clinic_id,
      v_session.deployment_run_key,
      v_session.id,
      v_session.execution_key,
      p_item_id,
      p_execution_item_key,
      p_plan_item_key,
      p_expected_sequence,
      p_expected_entity_type,
      p_expected_action,
      null::timestamptz,
      null::timestamptz,
      null::integer,
      null::text,
      null::text,
      'duplicate_identity'::text,
      'Execution item identity integrity prevents item completion.'::text;
    return;
  end if;

  select item_row.*
    into v_item
  from public.deployment_activation_execution_items item_row
  where item_row.id = p_item_id
    and item_row.session_id = v_session.id
    and item_row.execution_item_key = p_execution_item_key
    and item_row.plan_item_key = p_plan_item_key
  for update;

  if not found then
    return query select
      'not_found'::text,
      p_claimant_id,
      v_session.clinic_id,
      v_session.deployment_run_key,
      v_session.id,
      v_session.execution_key,
      p_item_id,
      p_execution_item_key,
      p_plan_item_key,
      p_expected_sequence,
      p_expected_entity_type,
      p_expected_action,
      null::timestamptz,
      null::timestamptz,
      null::integer,
      null::text,
      null::text,
      'item_not_found'::text,
      'Activation execution item was not found.'::text;
    return;
  end if;

  if v_item.execution_status = 'succeeded'
     and v_item.completed_at is not null
     and v_item.sequence = p_expected_sequence
     and v_item.entity_type = p_expected_entity_type
     and v_item.action = p_expected_action
     and v_item.started_at is not distinct from p_expected_started_at
     and v_item.attempt_count is not distinct from p_expected_attempt_count
     and v_item.rolled_back_at is null
     and v_item.error_code is null
     and v_item.error_message is null
  then
    return query select
      'already_completed'::text,
      p_claimant_id,
      v_session.clinic_id,
      v_session.deployment_run_key,
      v_session.id,
      v_session.execution_key,
      v_item.id,
      v_item.execution_item_key,
      v_item.plan_item_key,
      v_item.sequence,
      v_item.entity_type,
      v_item.action,
      v_item.started_at,
      v_item.completed_at,
      v_item.attempt_count,
      'succeeded'::text,
      'succeeded'::text,
      null::text,
      'Activation execution item was already completed. Completed_at was preserved.'::text;
    return;
  end if;

  if v_session.execution_status is distinct from 'running'
     or v_session.started_at is null
     or v_session.completed_at is not null
     or v_session.failed_at is not null
  then
    return query select
      'blocked'::text,
      p_claimant_id,
      v_session.clinic_id,
      v_session.deployment_run_key,
      v_session.id,
      v_session.execution_key,
      v_item.id,
      v_item.execution_item_key,
      v_item.plan_item_key,
      v_item.sequence,
      v_item.entity_type,
      v_item.action,
      v_item.started_at,
      v_item.completed_at,
      v_item.attempt_count,
      v_item.execution_status,
      v_item.execution_status,
      'session_not_running'::text,
      'Activation execution session is not running.'::text;
    return;
  end if;

  if v_session.execution_owner is distinct from p_claimant_id
     or v_session.ownership_token is distinct from p_ownership_token
  then
    return query select
      'conflict'::text,
      p_claimant_id,
      v_session.clinic_id,
      v_session.deployment_run_key,
      v_session.id,
      v_session.execution_key,
      v_item.id,
      v_item.execution_item_key,
      v_item.plan_item_key,
      v_item.sequence,
      v_item.entity_type,
      v_item.action,
      v_item.started_at,
      v_item.completed_at,
      v_item.attempt_count,
      v_item.execution_status,
      v_item.execution_status,
      'ownership_conflict'::text,
      'Activation execution ownership compare-and-set failed.'::text;
    return;
  end if;

  if v_session.lease_expires_at is null
     or v_session.lease_expires_at is distinct from p_expected_lease_expires_at
     or v_session.lease_expires_at <= p_proposed_completed_at
  then
    return query select
      'blocked'::text,
      p_claimant_id,
      v_session.clinic_id,
      v_session.deployment_run_key,
      v_session.id,
      v_session.execution_key,
      v_item.id,
      v_item.execution_item_key,
      v_item.plan_item_key,
      v_item.sequence,
      v_item.entity_type,
      v_item.action,
      v_item.started_at,
      v_item.completed_at,
      v_item.attempt_count,
      v_item.execution_status,
      v_item.execution_status,
      'lease_expired'::text,
      'Activation execution lease is not active for item completion.'::text;
    return;
  end if;

  if v_item.execution_status is distinct from 'running' then
    return query select
      'blocked'::text,
      p_claimant_id,
      v_session.clinic_id,
      v_session.deployment_run_key,
      v_session.id,
      v_session.execution_key,
      v_item.id,
      v_item.execution_item_key,
      v_item.plan_item_key,
      v_item.sequence,
      v_item.entity_type,
      v_item.action,
      v_item.started_at,
      v_item.completed_at,
      v_item.attempt_count,
      v_item.execution_status,
      v_item.execution_status,
      'item_not_running'::text,
      'Activation execution item is not running.'::text;
    return;
  end if;

  if v_item.completed_at is not null
     or v_item.rolled_back_at is not null
     or v_item.error_code is not null
     or v_item.error_message is not null
     or v_item.sequence is distinct from p_expected_sequence
     or v_item.entity_type is distinct from p_expected_entity_type
     or v_item.action is distinct from p_expected_action
     or v_item.started_at is distinct from p_expected_started_at
     or v_item.attempt_count is distinct from p_expected_attempt_count
  then
    return query select
      'blocked'::text,
      p_claimant_id,
      v_session.clinic_id,
      v_session.deployment_run_key,
      v_session.id,
      v_session.execution_key,
      v_item.id,
      v_item.execution_item_key,
      v_item.plan_item_key,
      v_item.sequence,
      v_item.entity_type,
      v_item.action,
      v_item.started_at,
      v_item.completed_at,
      v_item.attempt_count,
      v_item.execution_status,
      v_item.execution_status,
      'stale_state'::text,
      'Activation execution item evidence changed before completion.'::text;
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
     and update_item.entity_type = p_expected_entity_type
     and update_item.action = p_expected_action
     and update_item.execution_status = 'running'
     and update_item.started_at is not distinct from p_expected_started_at
     and update_item.completed_at is null
     and update_item.attempt_count is not distinct from p_expected_attempt_count
     and update_item.rolled_back_at is null
     and update_item.error_code is null
     and update_item.error_message is null;

  get diagnostics v_rows_updated = row_count;

  if v_rows_updated <> 1 then
    return query select
      'blocked'::text,
      p_claimant_id,
      v_session.clinic_id,
      v_session.deployment_run_key,
      v_session.id,
      v_session.execution_key,
      v_item.id,
      v_item.execution_item_key,
      v_item.plan_item_key,
      v_item.sequence,
      v_item.entity_type,
      v_item.action,
      v_item.started_at,
      v_item.completed_at,
      v_item.attempt_count,
      v_item.execution_status,
      v_item.execution_status,
      'stale_state'::text,
      'Activation execution item completion compare-and-set wrote no rows.'::text;
    return;
  end if;

  return query select
    'completed'::text,
    p_claimant_id,
    v_session.clinic_id,
    v_session.deployment_run_key,
    v_session.id,
    v_session.execution_key,
    v_item.id,
    v_item.execution_item_key,
    v_item.plan_item_key,
    v_item.sequence,
    v_item.entity_type,
    v_item.action,
    v_item.started_at,
    p_proposed_completed_at,
    v_item.attempt_count,
    v_item.execution_status,
    'succeeded'::text,
    null::text,
    'Activation execution item was completed. Dependency progression was not attempted.'::text;
end;
$$;

revoke all on function public.complete_deployment_activation_execution_item(
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
  timestamptz,
  integer,
  timestamptz
) from public, anon, authenticated;

grant execute on function public.complete_deployment_activation_execution_item(
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
  timestamptz,
  integer,
  timestamptz
) to service_role;