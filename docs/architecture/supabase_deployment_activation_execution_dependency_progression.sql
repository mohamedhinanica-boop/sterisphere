-- RC8 Slice 8B: atomic activation execution dependency progression.
-- Apply manually in the Supabase SQL editor after review. This patch changes only
-- the function boundary and privileges; it does not add tables, columns, rows, or runtime wiring.

create or replace function public.progress_deployment_activation_execution_dependency(
  p_clinic_id uuid,
  p_deployment_run_key text,
  p_session_id uuid,
  p_execution_key text,
  p_claimant_id text,
  p_ownership_token text,
  p_expected_lease_expires_at timestamptz,
  p_completed_item_id uuid,
  p_completed_execution_item_key text,
  p_completed_plan_item_key text,
  p_completed_sequence integer,
  p_completed_started_at timestamptz,
  p_completed_completed_at timestamptz,
  p_completed_attempt_count integer,
  p_next_item_id uuid,
  p_next_execution_item_key text,
  p_next_plan_item_key text,
  p_next_sequence integer,
  p_next_entity_type text,
  p_next_entity_id text,
  p_next_action text,
  p_expected_next_status text,
  p_expected_next_attempt_count integer,
  p_expected_dependency_keys text[],
  p_progressed_at timestamptz
)
returns table (
  status text,
  clinic_id uuid,
  deployment_run_key text,
  session_id uuid,
  execution_key text,
  completed_item_id uuid,
  completed_execution_item_key text,
  completed_plan_item_key text,
  completed_sequence integer,
  next_item_id uuid,
  next_execution_item_key text,
  next_plan_item_key text,
  next_sequence integer,
  next_entity_type text,
  next_entity_id text,
  next_action text,
  next_status_before text,
  next_status_after text,
  issue_code text,
  message text
)
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_session public.deployment_activation_execution_sessions%rowtype;
  v_completed public.deployment_activation_execution_items%rowtype;
  v_next public.deployment_activation_execution_items%rowtype;
  v_next_status_before text;
  v_duplicate_count integer;
  v_succeeded_dependency_count integer;
begin
  if p_expected_next_status not in ('pending', 'ready') then
    return query select
      'blocked'::text, p_clinic_id, p_deployment_run_key, p_session_id, p_execution_key,
      p_completed_item_id, p_completed_execution_item_key, p_completed_plan_item_key, p_completed_sequence,
      p_next_item_id, p_next_execution_item_key, p_next_plan_item_key, p_next_sequence,
      p_next_entity_type, p_next_entity_id, p_next_action, null::text, null::text,
      'stale_state'::text, 'Expected next status must be pending or ready.'::text;
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
    return query select
      'not_found'::text, p_clinic_id, p_deployment_run_key, p_session_id, p_execution_key,
      p_completed_item_id, p_completed_execution_item_key, p_completed_plan_item_key, p_completed_sequence,
      p_next_item_id, p_next_execution_item_key, p_next_plan_item_key, p_next_sequence,
      p_next_entity_type, p_next_entity_id, p_next_action, null::text, null::text,
      'missing_session'::text, 'Activation execution session was not found.'::text;
    return;
  end if;

  if v_session.preparation_status is distinct from 'ready'
     or v_session.execution_status is distinct from 'running'
     or v_session.started_at is null
     or v_session.completed_at is not null
     or v_session.failed_at is not null then
    return query select
      'blocked'::text, v_session.clinic_id, v_session.deployment_run_key, v_session.id, v_session.execution_key,
      p_completed_item_id, p_completed_execution_item_key, p_completed_plan_item_key, p_completed_sequence,
      p_next_item_id, p_next_execution_item_key, p_next_plan_item_key, p_next_sequence,
      p_next_entity_type, p_next_entity_id, p_next_action, null::text, null::text,
      'session_not_progressable'::text, 'Activation execution session is not in a running progressable state.'::text;
    return;
  end if;

  if v_session.execution_owner is distinct from p_claimant_id
     or v_session.ownership_token is distinct from p_ownership_token
     or v_session.lease_expires_at is distinct from p_expected_lease_expires_at then
    return query select
      'conflict'::text, v_session.clinic_id, v_session.deployment_run_key, v_session.id, v_session.execution_key,
      p_completed_item_id, p_completed_execution_item_key, p_completed_plan_item_key, p_completed_sequence,
      p_next_item_id, p_next_execution_item_key, p_next_plan_item_key, p_next_sequence,
      p_next_entity_type, p_next_entity_id, p_next_action, null::text, null::text,
      'ownership_compare_failed'::text, 'Activation execution ownership compare-and-set failed.'::text;
    return;
  end if;

  if v_session.lease_expires_at is null or v_session.lease_expires_at <= p_progressed_at then
    return query select
      'blocked'::text, v_session.clinic_id, v_session.deployment_run_key, v_session.id, v_session.execution_key,
      p_completed_item_id, p_completed_execution_item_key, p_completed_plan_item_key, p_completed_sequence,
      p_next_item_id, p_next_execution_item_key, p_next_plan_item_key, p_next_sequence,
      p_next_entity_type, p_next_entity_id, p_next_action, null::text, null::text,
      'lease_not_active'::text, 'Activation execution lease is not active.'::text;
    return;
  end if;

  select completed_item.*
    into v_completed
    from public.deployment_activation_execution_items completed_item
   where completed_item.id = p_completed_item_id
     and completed_item.session_id = v_session.id
     and completed_item.execution_item_key = p_completed_execution_item_key
     and completed_item.plan_item_key = p_completed_plan_item_key
     and completed_item.sequence = p_completed_sequence
   for update;

  if not found then
    return query select
      'not_found'::text, v_session.clinic_id, v_session.deployment_run_key, v_session.id, v_session.execution_key,
      p_completed_item_id, p_completed_execution_item_key, p_completed_plan_item_key, p_completed_sequence,
      p_next_item_id, p_next_execution_item_key, p_next_plan_item_key, p_next_sequence,
      p_next_entity_type, p_next_entity_id, p_next_action, null::text, null::text,
      'missing_completed_item'::text, 'Completed predecessor execution item was not found.'::text;
    return;
  end if;

  if v_completed.execution_status is distinct from 'succeeded'
     or v_completed.attempt_count is distinct from p_completed_attempt_count
     or v_completed.started_at is distinct from p_completed_started_at
     or v_completed.completed_at is distinct from p_completed_completed_at
     or v_completed.rolled_back_at is not null
     or v_completed.error_code is not null
     or v_completed.error_message is not null then
    return query select
      'blocked'::text, v_session.clinic_id, v_session.deployment_run_key, v_session.id, v_session.execution_key,
      v_completed.id, v_completed.execution_item_key, v_completed.plan_item_key, v_completed.sequence,
      p_next_item_id, p_next_execution_item_key, p_next_plan_item_key, p_next_sequence,
      p_next_entity_type, p_next_entity_id, p_next_action, null::text, null::text,
      'completed_predecessor_invalid'::text, 'Completed predecessor item evidence is not compatible.'::text;
    return;
  end if;

  select next_item.*
    into v_next
    from public.deployment_activation_execution_items next_item
   where next_item.id = p_next_item_id
     and next_item.session_id = v_session.id
     and next_item.execution_item_key = p_next_execution_item_key
     and next_item.plan_item_key = p_next_plan_item_key
     and next_item.sequence = p_next_sequence
   for update;

  if not found then
    return query select
      'not_found'::text, v_session.clinic_id, v_session.deployment_run_key, v_session.id, v_session.execution_key,
      v_completed.id, v_completed.execution_item_key, v_completed.plan_item_key, v_completed.sequence,
      p_next_item_id, p_next_execution_item_key, p_next_plan_item_key, p_next_sequence,
      p_next_entity_type, p_next_entity_id, p_next_action, null::text, null::text,
      'missing_next_item'::text, 'Next deterministic execution item was not found.'::text;
    return;
  end if;

  v_next_status_before := v_next.execution_status;

  if v_next.execution_status = 'ready' and p_expected_next_status = 'ready' then
    return query select
      'already_progressed'::text, v_session.clinic_id, v_session.deployment_run_key, v_session.id, v_session.execution_key,
      v_completed.id, v_completed.execution_item_key, v_completed.plan_item_key, v_completed.sequence,
      v_next.id, v_next.execution_item_key, v_next.plan_item_key, v_next.sequence,
      v_next.entity_type, v_next.entity_id::text, v_next.action, v_next_status_before, v_next.execution_status,
      null::text, 'The next deterministic execution item was already ready. No rows were changed.'::text;
    return;
  end if;

  if v_next.execution_status is distinct from 'pending'
     or p_expected_next_status is distinct from 'pending'
     or v_next.entity_type is distinct from p_next_entity_type
     or v_next.entity_id::text is distinct from p_next_entity_id
     or v_next.action is distinct from p_next_action
     or v_next.attempt_count is distinct from p_expected_next_attempt_count
     or v_next.started_at is not null
     or v_next.completed_at is not null
     or v_next.rolled_back_at is not null
     or v_next.error_code is not null
     or v_next.error_message is not null then
    return query select
      'blocked'::text, v_session.clinic_id, v_session.deployment_run_key, v_session.id, v_session.execution_key,
      v_completed.id, v_completed.execution_item_key, v_completed.plan_item_key, v_completed.sequence,
      v_next.id, v_next.execution_item_key, v_next.plan_item_key, v_next.sequence,
      v_next.entity_type, v_next.entity_id::text, v_next.action, v_next_status_before, v_next.execution_status,
      'next_item_not_progressable'::text, 'Next deterministic execution item is not pending and untouched.'::text;
    return;
  end if;

  if coalesce(v_next.dependency_keys, '[]'::jsonb) is distinct from to_jsonb(coalesce(p_expected_dependency_keys, array[]::text[])) then
    return query select
      'blocked'::text, v_session.clinic_id, v_session.deployment_run_key, v_session.id, v_session.execution_key,
      v_completed.id, v_completed.execution_item_key, v_completed.plan_item_key, v_completed.sequence,
      v_next.id, v_next.execution_item_key, v_next.plan_item_key, v_next.sequence,
      v_next.entity_type, v_next.entity_id::text, v_next.action, v_next_status_before, v_next.execution_status,
      'dependency_integrity_invalid'::text, 'Next deterministic execution item dependency keys changed.'::text;
    return;
  end if;

  select count(*)
    into v_duplicate_count
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

  if v_duplicate_count > 0 then
    return query select
      'blocked'::text, v_session.clinic_id, v_session.deployment_run_key, v_session.id, v_session.execution_key,
      v_completed.id, v_completed.execution_item_key, v_completed.plan_item_key, v_completed.sequence,
      v_next.id, v_next.execution_item_key, v_next.plan_item_key, v_next.sequence,
      v_next.entity_type, v_next.entity_id::text, v_next.action, v_next_status_before, v_next.execution_status,
      'item_integrity_invalid'::text, 'Duplicate execution item identity prevents dependency progression.'::text;
    return;
  end if;

  select count(*)
    into v_succeeded_dependency_count
    from public.deployment_activation_execution_items dependency_item
   where dependency_item.session_id = v_session.id
     and dependency_item.plan_item_key = any(coalesce(p_expected_dependency_keys, array[]::text[]))
     and dependency_item.sequence < v_next.sequence
     and dependency_item.execution_status = 'succeeded'
     and dependency_item.completed_at is not null
     and dependency_item.rolled_back_at is null
     and dependency_item.error_code is null
     and dependency_item.error_message is null;

  if v_succeeded_dependency_count is distinct from cardinality(coalesce(p_expected_dependency_keys, array[]::text[])) then
    return query select
      'blocked'::text, v_session.clinic_id, v_session.deployment_run_key, v_session.id, v_session.execution_key,
      v_completed.id, v_completed.execution_item_key, v_completed.plan_item_key, v_completed.sequence,
      v_next.id, v_next.execution_item_key, v_next.plan_item_key, v_next.sequence,
      v_next.entity_type, v_next.entity_id::text, v_next.action, v_next_status_before, v_next.execution_status,
      'dependency_integrity_invalid'::text, 'Not all dependencies are completed predecessors.'::text;
    return;
  end if;

  update public.deployment_activation_execution_items update_item
     set execution_status = 'ready'
   where update_item.id = v_next.id
     and update_item.session_id = v_session.id
     and update_item.execution_item_key = p_next_execution_item_key
     and update_item.plan_item_key = p_next_plan_item_key
     and update_item.sequence = p_next_sequence
     and update_item.execution_status = 'pending'
     and update_item.attempt_count = p_expected_next_attempt_count
     and update_item.started_at is null
     and update_item.completed_at is null
     and update_item.rolled_back_at is null
     and update_item.error_code is null
     and update_item.error_message is null
   returning update_item.* into v_next;

  if not found then
    return query select
      'conflict'::text, v_session.clinic_id, v_session.deployment_run_key, v_session.id, v_session.execution_key,
      v_completed.id, v_completed.execution_item_key, v_completed.plan_item_key, v_completed.sequence,
      p_next_item_id, p_next_execution_item_key, p_next_plan_item_key, p_next_sequence,
      p_next_entity_type, p_next_entity_id, p_next_action, v_next_status_before, null::text,
      'stale_state'::text, 'Next deterministic execution item changed before dependency progression.'::text;
    return;
  end if;

  return query select
    'progressed'::text, v_session.clinic_id, v_session.deployment_run_key, v_session.id, v_session.execution_key,
    v_completed.id, v_completed.execution_item_key, v_completed.plan_item_key, v_completed.sequence,
    v_next.id, v_next.execution_item_key, v_next.plan_item_key, v_next.sequence,
    v_next.entity_type, v_next.entity_id::text, v_next.action, v_next_status_before, v_next.execution_status,
    null::text, 'Activation execution dependency progression readied the next deterministic item.'::text;
end;
$$;

revoke execute on function public.progress_deployment_activation_execution_dependency(
  uuid, text, uuid, text, text, text, timestamptz, uuid, text, text, integer,
  timestamptz, timestamptz, integer, uuid, text, text, integer, text, text,
  text, text, integer, text[], timestamptz
) from public;

revoke execute on function public.progress_deployment_activation_execution_dependency(
  uuid, text, uuid, text, text, text, timestamptz, uuid, text, text, integer,
  timestamptz, timestamptz, integer, uuid, text, text, integer, text, text,
  text, text, integer, text[], timestamptz
) from anon;

revoke execute on function public.progress_deployment_activation_execution_dependency(
  uuid, text, uuid, text, text, text, timestamptz, uuid, text, text, integer,
  timestamptz, timestamptz, integer, uuid, text, text, integer, text, text,
  text, text, integer, text[], timestamptz
) from authenticated;

grant execute on function public.progress_deployment_activation_execution_dependency(
  uuid, text, uuid, text, text, text, timestamptz, uuid, text, text, integer,
  timestamptz, timestamptz, integer, uuid, text, text, integer, text, text,
  text, text, integer, text[], timestamptz
) to service_role;
