/*
 * SteriSphere Authoritative Baseline
 * Architecture Freeze Version: 1.0.0
 * Architecture Freeze Manifest SHA-256:
 * 0B0B1B157035F12AB210ECBD1DC6B7E55FF6DAFFDF652966ACB0396E66963619
 * Architecture Input Commit: 2373ad80d6a86510acde0010ea1bfb1f82d0fe02
 * Freeze Artifact Commit: 12b6b7e2729d95f47c77cb04e1db87130a05adc9
 * Owner Resolution SHA-256: D0CE3D8910EBAA73AF87FD3903851D1207969764473281D5D14715120F26CB1B
 * Production Capture Reference: .tmp/schema-captures/20260723T031930Z/
 * File Role: Authorization helpers, trigger helpers, and 17 runtime RPCs
 *
 * THIS FILE IS GENERATED FROM THE LOCKED ARCHITECTURE FREEZE.
 * DO NOT EDIT MANUALLY.
 * REGENERATE THROUGH THE APPROVED BASELINE PROCESS.
 *
 * GENERATED ARTIFACT FOR REVIEW ONLY. EXECUTION IS NOT AUTHORIZED.
 */

CREATE FUNCTION public.current_actor_is_global_super_admin() RETURNS boolean
    LANGUAGE sql
    STABLE
    SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $authorization$
  SELECT EXISTS (
    SELECT 1
    FROM public.platform_operator_roles AS por
    WHERE por.user_id = auth.uid()
      AND por.role = 'super_admin'
      AND por.status = 'active'
  );
$authorization$;

CREATE FUNCTION public.current_actor_has_clinic_role(
  p_clinic_id uuid,
  p_roles text[]
) RETURNS boolean
    LANGUAGE sql
    STABLE
    SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $authorization$
  SELECT public.current_actor_is_global_super_admin()
    OR EXISTS (
      SELECT 1
      FROM public.clinic_memberships AS cm
      WHERE cm.user_id = auth.uid()
        AND cm.clinic_id = p_clinic_id
        AND cm.status = 'active'
        AND cm.role = ANY (p_roles)
    );
$authorization$;

CREATE FUNCTION public.current_actor_is_clinic_member(
  p_clinic_id uuid
) RETURNS boolean
    LANGUAGE sql
    STABLE
    SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $authorization$
  SELECT public.current_actor_has_clinic_role(
    p_clinic_id,
    ARRAY['admin', 'clinical_staff', 'doctor', 'auditor']::text[]
  );
$authorization$;

CREATE FUNCTION public.set_clinical_agents_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    VOLATILE
    SECURITY INVOKER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;;

CREATE FUNCTION public.set_clinical_hardware_devices_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    VOLATILE
    SECURITY INVOKER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;;

CREATE FUNCTION public.set_clinical_workstations_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    VOLATILE
    SECURITY INVOKER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;;

CREATE FUNCTION public.set_clinics_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    VOLATILE
    SECURITY INVOKER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;;

CREATE FUNCTION public.set_deployment_activation_execution_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    VOLATILE
    SECURITY INVOKER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;;

CREATE FUNCTION public.set_deployment_hardware_assignments_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    VOLATILE
    SECURITY INVOKER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;;

CREATE FUNCTION public.set_deployment_recovery_plan_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    VOLATILE
    SECURITY INVOKER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
begin
  new.updated_at = clock_timestamp();
  return new;
end;
$$;;

CREATE FUNCTION public.set_workstation_sessions_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    VOLATILE
    SECURITY INVOKER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;;

CREATE FUNCTION public.activate_deployment_clinic(p_clinic_id uuid, p_deployment_run_key text, p_session_id uuid, p_execution_key text, p_claimant_id text, p_ownership_token text, p_expected_lease_expires_at timestamp with time zone, p_item_id uuid, p_execution_item_key text, p_plan_item_key text, p_expected_item_started_at timestamp with time zone, p_expected_attempt_count integer, p_expected_current_state jsonb, p_target_state jsonb, p_proposed_activated_at timestamp with time zone) RETURNS TABLE(status text, clinic_id uuid, deployment_run_key text, session_id uuid, execution_key text, item_id uuid, execution_item_key text, plan_item_key text, clinic_state_before jsonb, clinic_state_after jsonb, activated_at timestamp with time zone, issue_code text, message text)
    LANGUAGE plpgsql
    VOLATILE
    SECURITY INVOKER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
declare
  v_session public.deployment_activation_execution_sessions%rowtype;
  v_item public.deployment_activation_execution_items%rowtype;
  v_clinic public.clinics%rowtype;
  v_run_link public.deployment_runs%rowtype;
  v_state_before jsonb;
  v_state_after jsonb;
  v_expected_clinic_id text;
  v_expected_deployment_status text;
  v_target_deployment_status text;
begin
  if p_claimant_id is null or length(btrim(p_claimant_id)) = 0 then
    return query select 'blocked'::text, p_clinic_id, p_deployment_run_key, p_session_id, p_execution_key,
      p_item_id, p_execution_item_key, p_plan_item_key, null::jsonb, null::jsonb, null::timestamptz,
      'claimant_invalid'::text, 'Claimant id is required.'::text;
    return;
  end if;

  if p_ownership_token is null or length(btrim(p_ownership_token)) = 0 then
    return query select 'blocked'::text, p_clinic_id, p_deployment_run_key, p_session_id, p_execution_key,
      p_item_id, p_execution_item_key, p_plan_item_key, null::jsonb, null::jsonb, null::timestamptz,
      'ownership_token_invalid'::text, 'Ownership token is required.'::text;
    return;
  end if;

  if p_expected_current_state is null or jsonb_typeof(p_expected_current_state) <> 'object' then
    return query select 'blocked'::text, p_clinic_id, p_deployment_run_key, p_session_id, p_execution_key,
      p_item_id, p_execution_item_key, p_plan_item_key, null::jsonb, null::jsonb, null::timestamptz,
      'expected_state_invalid'::text, 'Expected current state must be a JSON object.'::text;
    return;
  end if;

  if p_target_state is null or jsonb_typeof(p_target_state) <> 'object' then
    return query select 'blocked'::text, p_clinic_id, p_deployment_run_key, p_session_id, p_execution_key,
      p_item_id, p_execution_item_key, p_plan_item_key, null::jsonb, null::jsonb, null::timestamptz,
      'target_state_invalid'::text, 'Target state must be a JSON object.'::text;
    return;
  end if;

  select *
  into v_session
  from public.deployment_activation_execution_sessions activation_session
  where activation_session.clinic_id = p_clinic_id
    and activation_session.deployment_run_key = p_deployment_run_key
    and activation_session.id = p_session_id
    and activation_session.execution_key = p_execution_key
  for update;

  if not found then
    return query select 'not_found'::text, p_clinic_id, p_deployment_run_key, p_session_id, p_execution_key,
      p_item_id, p_execution_item_key, p_plan_item_key, null::jsonb, null::jsonb, null::timestamptz,
      'missing_session'::text, 'Activation execution session was not found.'::text;
    return;
  end if;

  select *
  into v_item
  from public.deployment_activation_execution_items activation_item
  where activation_item.session_id = v_session.id
    and activation_item.id = p_item_id
    and activation_item.execution_item_key = p_execution_item_key
    and activation_item.plan_item_key = p_plan_item_key
  for update;

  if not found then
    return query select 'not_found'::text, p_clinic_id, p_deployment_run_key, v_session.id, v_session.execution_key,
      p_item_id, p_execution_item_key, p_plan_item_key, null::jsonb, null::jsonb, null::timestamptz,
      'missing_item'::text, 'Clinic activation execution item was not found.'::text;
    return;
  end if;

  select *
  into v_clinic
  from public.clinics activation_clinic
  where activation_clinic.id = p_clinic_id
  for update;

  if not found then
    return query select 'not_found'::text, p_clinic_id, p_deployment_run_key, v_session.id, v_session.execution_key,
      v_item.id, v_item.execution_item_key, v_item.plan_item_key, null::jsonb, null::jsonb, null::timestamptz,
      'missing_clinic'::text, 'Clinic activation target was not found.'::text;
    return;
  end if;

  select *
  into v_run_link
  from public.deployment_runs activation_run
  where activation_run.deployment_run_id = p_deployment_run_key
    and activation_run.clinic_id = p_clinic_id;

  if not found then
    return query select 'conflict'::text, v_clinic.id, p_deployment_run_key, v_session.id, v_session.execution_key,
      v_item.id, v_item.execution_item_key, v_item.plan_item_key, null::jsonb, null::jsonb, null::timestamptz,
      'deployment_ownership_mismatch'::text, 'Clinic is not linked to the expected deployment run.'::text;
    return;
  end if;

  v_state_before := jsonb_build_object('clinicId', v_clinic.id::text, 'deploymentStatus', v_clinic.deployment_status);
  v_expected_clinic_id := coalesce(p_expected_current_state->>'clinicId', p_expected_current_state->>'clinic_id');
  v_expected_deployment_status := coalesce(p_expected_current_state->>'deploymentStatus', p_expected_current_state->>'deployment_status');
  v_target_deployment_status := coalesce(p_target_state->>'deploymentStatus', p_target_state->>'deployment_status');

  if v_session.execution_owner is distinct from p_claimant_id
    or v_session.ownership_token is distinct from p_ownership_token
    or v_session.lease_expires_at is distinct from p_expected_lease_expires_at
  then
    return query select 'conflict'::text, v_clinic.id, p_deployment_run_key, v_session.id, v_session.execution_key,
      v_item.id, v_item.execution_item_key, v_item.plan_item_key, v_state_before, v_state_before, v_clinic.deployed_at,
      'ownership_compare_failed'::text, 'Execution session ownership compare-and-set failed.'::text;
    return;
  end if;

  if v_session.preparation_status <> 'ready'
    or v_session.execution_status <> 'running'
    or v_session.started_at is null
    or v_session.completed_at is not null
    or v_session.failed_at is not null
  then
    return query select 'blocked'::text, v_clinic.id, p_deployment_run_key, v_session.id, v_session.execution_key,
      v_item.id, v_item.execution_item_key, v_item.plan_item_key, v_state_before, v_state_before, v_clinic.deployed_at,
      'session_not_activation_safe'::text, 'Activation execution session is not activation-safe.'::text;
    return;
  end if;

  if v_session.lease_expires_at is null or v_session.lease_expires_at <= p_proposed_activated_at then
    return query select 'blocked'::text, v_clinic.id, p_deployment_run_key, v_session.id, v_session.execution_key,
      v_item.id, v_item.execution_item_key, v_item.plan_item_key, v_state_before, v_state_before, v_clinic.deployed_at,
      'lease_not_active'::text, 'Activation execution session lease is not active at the proposed clinic activation timestamp.'::text;
    return;
  end if;

  if v_item.sequence <> 1
    or v_item.entity_type <> 'clinic'
    or v_item.action <> 'activate'
    or v_item.execution_status <> 'running'
    or v_item.attempt_count is distinct from p_expected_attempt_count
    or p_expected_attempt_count <> 1
    or v_item.started_at is distinct from p_expected_item_started_at
    or v_item.completed_at is not null
    or v_item.rolled_back_at is not null
    or v_item.error_code is not null
    or v_item.error_message is not null
  then
    return query select 'blocked'::text, v_clinic.id, p_deployment_run_key, v_session.id, v_session.execution_key,
      v_item.id, v_item.execution_item_key, v_item.plan_item_key, v_state_before, v_state_before, v_clinic.deployed_at,
      'item_not_activation_safe'::text, 'Clinic activation item is not activation-safe.'::text;
    return;
  end if;

  if jsonb_typeof(v_item.dependency_keys) <> 'array' or jsonb_array_length(v_item.dependency_keys) <> 0 then
    return query select 'blocked'::text, v_clinic.id, p_deployment_run_key, v_session.id, v_session.execution_key,
      v_item.id, v_item.execution_item_key, v_item.plan_item_key, v_state_before, v_state_before, v_clinic.deployed_at,
      'item_dependency_present'::text, 'Clinic activation item must not have dependencies.'::text;
    return;
  end if;

  -- deployment_key is intentionally not compared to p_clinic_id; it is not a clinic UUID in the activation-plan contract.
  if v_item.entity_id::text is distinct from p_clinic_id::text
  then
    return query select 'conflict'::text, v_clinic.id, p_deployment_run_key, v_session.id, v_session.execution_key,
      v_item.id, v_item.execution_item_key, v_item.plan_item_key, v_state_before, v_state_before, v_clinic.deployed_at,
      'item_clinic_identity_mismatch'::text, 'Clinic activation item identity does not match the clinic.'::text;
    return;
  end if;

  if v_item.expected_current_state is distinct from p_expected_current_state
    or v_item.target_state is distinct from p_target_state
  then
    return query select 'conflict'::text, v_clinic.id, p_deployment_run_key, v_session.id, v_session.execution_key,
      v_item.id, v_item.execution_item_key, v_item.plan_item_key, v_state_before, v_state_before, v_clinic.deployed_at,
      'item_state_compare_failed'::text, 'Clinic activation item state evidence compare-and-set failed.'::text;
    return;
  end if;

  if v_target_deployment_status <> 'deployed'
    or p_target_state not in ('{"deploymentStatus":"deployed"}'::jsonb, '{"deployment_status":"deployed"}'::jsonb)
  then
    return query select 'blocked'::text, v_clinic.id, p_deployment_run_key, v_session.id, v_session.execution_key,
      v_item.id, v_item.execution_item_key, v_item.plan_item_key, v_state_before, v_state_before, v_clinic.deployed_at,
      'unsupported_target_state'::text, 'Clinic activation target state is not supported.'::text;
    return;
  end if;

  if v_clinic.deployment_status = 'deployed' then
    if v_clinic.deployed_at is null then
      return query select 'conflict'::text, v_clinic.id, p_deployment_run_key, v_session.id, v_session.execution_key,
        v_item.id, v_item.execution_item_key, v_item.plan_item_key, v_state_before, v_state_before, v_clinic.deployed_at,
        'already_deployed_incompatible'::text, 'Clinic is deployed without durable activation timestamp evidence.'::text;
      return;
    end if;

    v_state_after := v_state_before;
    return query select 'already_activated'::text, v_clinic.id, p_deployment_run_key, v_session.id, v_session.execution_key,
      v_item.id, v_item.execution_item_key, v_item.plan_item_key, v_state_before, v_state_after, v_clinic.deployed_at,
      null::text, 'Clinic already matches the activation target. No timestamp or execution item was changed.'::text;
    return;
  end if;

  if v_clinic.deployment_status <> 'draft'
    or v_expected_clinic_id is distinct from v_clinic.id::text
    or v_expected_deployment_status is distinct from v_clinic.deployment_status
  then
    return query select 'conflict'::text, v_clinic.id, p_deployment_run_key, v_session.id, v_session.execution_key,
      v_item.id, v_item.execution_item_key, v_item.plan_item_key, v_state_before, v_state_before, v_clinic.deployed_at,
      'clinic_state_compare_failed'::text, 'Clinic current state does not match expected activation evidence.'::text;
    return;
  end if;

  update public.clinics update_clinic
  set deployment_status = 'deployed',
      deployed_at = p_proposed_activated_at
  where update_clinic.id = v_clinic.id
  returning * into v_clinic;

  v_state_after := jsonb_build_object('clinicId', v_clinic.id::text, 'deploymentStatus', v_clinic.deployment_status);

  return query select 'activated'::text, v_clinic.id, p_deployment_run_key, v_session.id, v_session.execution_key,
    v_item.id, v_item.execution_item_key, v_item.plan_item_key, v_state_before, v_state_after, v_clinic.deployed_at,
    null::text, 'Clinic deployment status was deployed. Execution item remains running.'::text;
end;
$$;;

CREATE FUNCTION public.activate_deployment_hardware_shell(p_clinic_id uuid, p_deployment_run_key text, p_session_id uuid, p_execution_key text, p_claimant_id text, p_ownership_token text, p_expected_lease_expires_at timestamp with time zone, p_item_id uuid, p_execution_item_key text, p_plan_item_key text, p_expected_sequence integer, p_expected_entity_type text, p_expected_entity_id text, p_expected_action text, p_expected_item_started_at timestamp with time zone, p_expected_attempt_count integer, p_hardware_id uuid, p_expected_hardware_key text, p_expected_current_state jsonb, p_target_state jsonb, p_proposed_activated_at timestamp with time zone) RETURNS TABLE(status text, clinic_id uuid, deployment_run_key text, session_id uuid, execution_key text, item_id uuid, execution_item_key text, plan_item_key text, sequence integer, hardware_id uuid, deployment_hardware_key text, hardware_state_before jsonb, hardware_state_after jsonb, activated_at timestamp with time zone, issue_code text, message text)
    LANGUAGE plpgsql
    VOLATILE
    SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
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
$$;;

CREATE FUNCTION public.activate_deployment_provider_shell(p_clinic_id uuid, p_deployment_run_key text, p_session_id uuid, p_execution_key text, p_claimant_id text, p_ownership_token text, p_expected_lease_expires_at timestamp with time zone, p_item_id uuid, p_execution_item_key text, p_plan_item_key text, p_expected_sequence integer, p_expected_entity_type text, p_expected_entity_id text, p_expected_action text, p_expected_item_started_at timestamp with time zone, p_expected_attempt_count integer, p_provider_id uuid, p_expected_provider_key text, p_expected_current_state jsonb, p_target_state jsonb, p_proposed_activated_at timestamp with time zone) RETURNS TABLE(status text, clinic_id uuid, deployment_run_key text, session_id uuid, execution_key text, item_id uuid, execution_item_key text, plan_item_key text, sequence integer, provider_id uuid, deployment_provider_key text, provider_state_before jsonb, provider_state_after jsonb, activated_at timestamp with time zone, issue_code text, message text)
    LANGUAGE plpgsql
    VOLATILE
    SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
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
$$;;

CREATE FUNCTION public.activate_deployment_sterilizer_shell(p_clinic_id uuid, p_deployment_run_key text, p_session_id uuid, p_execution_key text, p_claimant_id text, p_ownership_token text, p_expected_lease_expires_at timestamp with time zone, p_item_id uuid, p_execution_item_key text, p_plan_item_key text, p_expected_sequence integer, p_expected_entity_type text, p_expected_entity_id text, p_expected_action text, p_expected_item_started_at timestamp with time zone, p_expected_attempt_count integer, p_sterilizer_id uuid, p_expected_sterilizer_key text, p_expected_current_state jsonb, p_target_state jsonb, p_proposed_activated_at timestamp with time zone) RETURNS TABLE(status text, clinic_id uuid, deployment_run_key text, session_id uuid, execution_key text, item_id uuid, execution_item_key text, plan_item_key text, sequence integer, sterilizer_id uuid, deployment_sterilizer_key text, sterilizer_state_before jsonb, sterilizer_state_after jsonb, activated_at timestamp with time zone, issue_code text, message text)
    LANGUAGE plpgsql
    VOLATILE
    SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
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
$$;;

CREATE FUNCTION public.activate_deployment_workstation_shell(p_clinic_id uuid, p_deployment_run_key text, p_session_id uuid, p_execution_key text, p_claimant_id text, p_ownership_token text, p_expected_lease_expires_at timestamp with time zone, p_item_id uuid, p_execution_item_key text, p_plan_item_key text, p_expected_sequence integer, p_expected_entity_type text, p_expected_entity_id text, p_expected_action text, p_expected_item_started_at timestamp with time zone, p_expected_attempt_count integer, p_workstation_id uuid, p_expected_workstation_key text, p_expected_current_state jsonb, p_target_state jsonb, p_proposed_activated_at timestamp with time zone) RETURNS TABLE(status text, clinic_id uuid, deployment_run_key text, session_id uuid, execution_key text, item_id uuid, execution_item_key text, plan_item_key text, sequence integer, workstation_id uuid, deployment_workstation_key text, workstation_state_before jsonb, workstation_state_after jsonb, activated_at timestamp with time zone, issue_code text, message text)
    LANGUAGE plpgsql
    VOLATILE
    SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
declare
  v_session public.deployment_activation_execution_sessions%rowtype;
  v_item public.deployment_activation_execution_items%rowtype;
  v_workstation public.clinical_workstations%rowtype;
  v_state_before jsonb;
  v_item_transition_state jsonb;
  v_state_after jsonb;
  v_running_count integer;
  v_ready_count integer;
  v_total_items integer;
  v_duplicate_item_identity_count integer;
  v_duplicate_workstation_identity_count integer;
  v_succeeded_prefix_length integer;
  v_later_drift_count integer;
  v_dependency_count integer;
  v_distinct_dependency_count integer;
  v_succeeded_dependency_count integer;
begin
  if p_workstation_id is null or p_expected_workstation_key is null or length(btrim(p_expected_workstation_key)) = 0
     or p_expected_entity_id is null or length(btrim(p_expected_entity_id)) = 0
     or p_proposed_activated_at is null then
    return query select 'blocked'::text, p_clinic_id, p_deployment_run_key, p_session_id, p_execution_key,
      p_item_id, p_execution_item_key, p_plan_item_key, p_expected_sequence, p_workstation_id, p_expected_workstation_key,
      null::jsonb, null::jsonb, null::timestamptz, 'workstation_identity_invalid'::text, 'Workstation UUID, deterministic key, entity identity, and activation timestamp are required.'::text;
    return;
  end if;

  if p_claimant_id is null or length(btrim(p_claimant_id)) = 0 then
    return query select 'blocked'::text, p_clinic_id, p_deployment_run_key, p_session_id, p_execution_key,
      p_item_id, p_execution_item_key, p_plan_item_key, p_expected_sequence, p_workstation_id, p_expected_workstation_key,
      null::jsonb, null::jsonb, null::timestamptz, 'claimant_invalid'::text, 'Claimant id is required.'::text;
    return;
  end if;

  if p_ownership_token is null or length(btrim(p_ownership_token)) = 0 then
    return query select 'blocked'::text, p_clinic_id, p_deployment_run_key, p_session_id, p_execution_key,
      p_item_id, p_execution_item_key, p_plan_item_key, p_expected_sequence, p_workstation_id, p_expected_workstation_key,
      null::jsonb, null::jsonb, null::timestamptz, 'ownership_token_invalid'::text, 'Ownership token is required.'::text;
    return;
  end if;

  if p_expected_current_state is null or jsonb_typeof(p_expected_current_state) <> 'object'
     or p_target_state is null or jsonb_typeof(p_target_state) <> 'object' then
    return query select 'blocked'::text, p_clinic_id, p_deployment_run_key, p_session_id, p_execution_key,
      p_item_id, p_execution_item_key, p_plan_item_key, p_expected_sequence, p_workstation_id, p_expected_workstation_key,
      null::jsonb, null::jsonb, null::timestamptz, 'state_evidence_invalid'::text, 'Workstation activation state evidence must be JSON objects.'::text;
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
      p_item_id, p_execution_item_key, p_plan_item_key, p_expected_sequence, p_workstation_id, p_expected_workstation_key,
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
      p_item_id, p_execution_item_key, p_plan_item_key, p_expected_sequence, p_workstation_id, p_expected_workstation_key,
      null::jsonb, null::jsonb, null::timestamptz, 'missing_item'::text, 'Workstation activation execution item was not found.'::text;
    return;
  end if;

  select workstation_row.*
    into v_workstation
    from public.clinical_workstations workstation_row
   where workstation_row.id = p_workstation_id
     and workstation_row.clinic_id = p_clinic_id
     and workstation_row.deployment_workstation_key = p_expected_workstation_key
   for update;

  if not found then
    return query select 'not_found'::text, v_session.clinic_id, v_session.deployment_run_key, v_session.id, v_session.execution_key,
      v_item.id, v_item.execution_item_key, v_item.plan_item_key, v_item.sequence, p_workstation_id, p_expected_workstation_key,
      null::jsonb, null::jsonb, null::timestamptz, 'missing_workstation_shell'::text, 'Workstation shell activation target was not found.'::text;
    return;
  end if;

  v_state_before := jsonb_build_object(
    'deploymentWorkstationKey', v_workstation.deployment_workstation_key,
    'provisioningSource', v_workstation.provisioning_source,
    'provisioningStatus', v_workstation.provisioning_status,
    'active', v_workstation.active
  );
  v_item_transition_state := jsonb_build_object(
    'deploymentWorkstationKey', v_item.expected_current_state -> 'deploymentWorkstationKey',
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
      v_item.id, v_item.execution_item_key, v_item.plan_item_key, v_item.sequence, v_workstation.id, v_workstation.deployment_workstation_key,
      v_state_before, v_state_before, null::timestamptz, 'session_not_activation_safe'::text, 'Activation execution session is not workstation-activation safe.'::text;
    return;
  end if;

  if v_session.execution_owner is distinct from p_claimant_id
     or v_session.ownership_token is distinct from p_ownership_token
     or v_session.lease_expires_at is distinct from p_expected_lease_expires_at then
    return query select 'conflict'::text, v_session.clinic_id, v_session.deployment_run_key, v_session.id, v_session.execution_key,
      v_item.id, v_item.execution_item_key, v_item.plan_item_key, v_item.sequence, v_workstation.id, v_workstation.deployment_workstation_key,
      v_state_before, v_state_before, null::timestamptz, 'ownership_compare_failed'::text, 'Execution session ownership compare-and-set failed.'::text;
    return;
  end if;

  if v_session.lease_expires_at is null or v_session.lease_expires_at <= p_proposed_activated_at then
    return query select 'blocked'::text, v_session.clinic_id, v_session.deployment_run_key, v_session.id, v_session.execution_key,
      v_item.id, v_item.execution_item_key, v_item.plan_item_key, v_item.sequence, v_workstation.id, v_workstation.deployment_workstation_key,
      v_state_before, v_state_before, null::timestamptz, 'lease_not_active'::text, 'Activation execution lease is not active at the proposed workstation activation timestamp.'::text;
    return;
  end if;

  if v_item.execution_item_key is distinct from p_execution_item_key
     or v_item.plan_item_key is distinct from p_plan_item_key
     or v_item.sequence is distinct from p_expected_sequence
     or v_item.entity_type is distinct from p_expected_entity_type
     or v_item.entity_id::text is distinct from p_expected_entity_id
     or v_item.entity_id::text is distinct from p_workstation_id::text
     or p_expected_entity_id is distinct from p_workstation_id::text
     or v_item.action is distinct from p_expected_action
     or v_item.deployment_key is distinct from p_expected_workstation_key
     or p_expected_entity_type <> 'workstation_shell'
     or p_expected_action <> 'activate' then
    return query select 'conflict'::text, v_session.clinic_id, v_session.deployment_run_key, v_session.id, v_session.execution_key,
      v_item.id, v_item.execution_item_key, v_item.plan_item_key, v_item.sequence, v_workstation.id, v_workstation.deployment_workstation_key,
      v_state_before || jsonb_build_object(
        'identityDiagnostics',
        jsonb_build_object(
          'itemIdMatches', v_item.id = p_item_id,
          'executionItemKeyMatches', v_item.execution_item_key is not distinct from p_execution_item_key,
          'planItemKeyMatches', v_item.plan_item_key is not distinct from p_plan_item_key,
          'sequenceMatches', v_item.sequence is not distinct from p_expected_sequence,
          'entityTypeMatches', v_item.entity_type is not distinct from p_expected_entity_type,
          'entityIdMatchesWorkstationId', v_item.entity_id::text is not distinct from p_workstation_id::text,
          'entityIdMatchesExpected', v_item.entity_id::text is not distinct from p_expected_entity_id,
          'actionMatches', v_item.action is not distinct from p_expected_action,
          'workstationIdMatches', v_workstation.id = p_workstation_id,
          'workstationKeyMatches', v_workstation.deployment_workstation_key is not distinct from p_expected_workstation_key,
          'clinicMatches', v_session.clinic_id = p_clinic_id and v_workstation.clinic_id = p_clinic_id,
          'deploymentRunMatches', v_session.deployment_run_key is not distinct from p_deployment_run_key,
          'executionKeyMatches', v_session.execution_key is not distinct from p_execution_key
        )
      ),
      v_state_before, null::timestamptz, 'item_identity_compare_failed'::text, 'Workstation activation item identity compare-and-set failed.'::text;
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
      v_item.id, v_item.execution_item_key, v_item.plan_item_key, v_item.sequence, v_workstation.id, v_workstation.deployment_workstation_key,
      v_state_before, v_state_before, null::timestamptz, 'item_not_activation_safe'::text, 'Workstation activation item is not activation-safe.'::text;
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

  select count(*)::integer into v_duplicate_workstation_identity_count
    from public.clinical_workstations duplicate_workstation
   where duplicate_workstation.clinic_id = p_clinic_id
     and duplicate_workstation.deployment_workstation_key = p_expected_workstation_key;

  if jsonb_typeof(coalesce(v_item.dependency_keys, '[]'::jsonb)) <> 'array' then
    return query select 'blocked'::text, v_session.clinic_id, v_session.deployment_run_key, v_session.id, v_session.execution_key,
      v_item.id, v_item.execution_item_key, v_item.plan_item_key, v_item.sequence, v_workstation.id, v_workstation.deployment_workstation_key,
      v_state_before, v_state_before, null::timestamptz, 'dependency_integrity_invalid'::text, 'Workstation activation item dependency evidence is malformed.'::text;
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
      v_item.id, v_item.execution_item_key, v_item.plan_item_key, v_item.sequence, v_workstation.id, v_workstation.deployment_workstation_key,
      v_state_before, v_state_before, null::timestamptz, 'item_integrity_invalid'::text, 'Activation execution item set is not workstation-activation safe.'::text;
    return;
  end if;

  if v_duplicate_workstation_identity_count <> 1 then
    return query select 'conflict'::text, v_session.clinic_id, v_session.deployment_run_key, v_session.id, v_session.execution_key,
      v_item.id, v_item.execution_item_key, v_item.plan_item_key, v_item.sequence, v_workstation.id, v_workstation.deployment_workstation_key,
      v_state_before, v_state_before, null::timestamptz, 'duplicate_workstation_identity'::text, 'Workstation deployment identity is not unique for this clinic.'::text;
    return;
  end if;

  if p_target_state is distinct from jsonb_build_object(
       'provisioningStatus', 'active',
       'active', true
     ) then
    return query select 'blocked'::text, v_session.clinic_id, v_session.deployment_run_key, v_session.id, v_session.execution_key,
      v_item.id, v_item.execution_item_key, v_item.plan_item_key, v_item.sequence, v_workstation.id, v_workstation.deployment_workstation_key,
      v_state_before, v_state_before, null::timestamptz, 'unsupported_target_state'::text, 'Workstation activation target state is not supported.'::text;
    return;
  end if;

  if v_workstation.active = true and v_workstation.provisioning_source = 'setup_draft' and v_workstation.provisioning_status = 'active' then
    v_state_after := v_state_before;
    return query select 'already_activated'::text, v_session.clinic_id, v_session.deployment_run_key, v_session.id, v_session.execution_key,
      v_item.id, v_item.execution_item_key, v_item.plan_item_key, v_item.sequence, v_workstation.id, v_workstation.deployment_workstation_key,
      v_state_before, v_state_after, null::timestamptz, null::text, 'Workstation shell already matches the activation target. No rows were changed.'::text;
    return;
  end if;

  if v_state_before is distinct from p_expected_current_state
     or v_item_transition_state is distinct from p_expected_current_state
     or v_item.target_state is distinct from p_target_state
     or v_workstation.active is distinct from false
     or v_workstation.provisioning_source is distinct from 'setup_draft'
     or v_workstation.provisioning_status is distinct from 'planned' then
    return query select 'conflict'::text, v_session.clinic_id, v_session.deployment_run_key, v_session.id, v_session.execution_key,
      v_item.id, v_item.execution_item_key, v_item.plan_item_key, v_item.sequence, v_workstation.id, v_workstation.deployment_workstation_key,
      v_state_before, v_state_before, null::timestamptz, 'workstation_state_compare_failed'::text, 'Workstation shell current state does not match expected activation evidence.'::text;
    return;
  end if;

  update public.clinical_workstations update_workstation
     set active = true,
         provisioning_status = 'active',
         updated_at = p_proposed_activated_at
   where update_workstation.id = v_workstation.id
     and update_workstation.clinic_id = p_clinic_id
     and update_workstation.deployment_workstation_key = p_expected_workstation_key
     and update_workstation.active = false
     and update_workstation.provisioning_source = 'setup_draft'
     and update_workstation.provisioning_status = 'planned'
   returning update_workstation.* into v_workstation;

  if not found then
    return query select 'conflict'::text, v_session.clinic_id, v_session.deployment_run_key, v_session.id, v_session.execution_key,
      p_item_id, p_execution_item_key, p_plan_item_key, p_expected_sequence, p_workstation_id, p_expected_workstation_key,
      v_state_before, v_state_before, null::timestamptz, 'stale_workstation_state'::text, 'Workstation shell changed before atomic activation.'::text;
    return;
  end if;

  v_state_after := jsonb_build_object(
    'deploymentWorkstationKey', v_workstation.deployment_workstation_key,
    'provisioningSource', v_workstation.provisioning_source,
    'provisioningStatus', v_workstation.provisioning_status,
    'active', v_workstation.active
  );

  return query select 'activated'::text, v_session.clinic_id, v_session.deployment_run_key, v_session.id, v_session.execution_key,
    v_item.id, v_item.execution_item_key, v_item.plan_item_key, v_item.sequence, v_workstation.id, v_workstation.deployment_workstation_key,
    v_state_before, v_state_after, p_proposed_activated_at, null::text, 'Workstation shell was activated. Execution item remains running.'::text;
end;
$$;;

CREATE FUNCTION public.bind_deployment_hardware_target(p_clinic_id uuid, p_deployment_run_key text, p_session_id uuid, p_execution_key text, p_claimant_id text, p_ownership_token text, p_expected_lease_expires_at timestamp with time zone, p_item_id uuid, p_execution_item_key text, p_plan_item_key text, p_expected_sequence integer, p_expected_entity_type text, p_expected_entity_id text, p_expected_action text, p_expected_item_started_at timestamp with time zone, p_expected_attempt_count integer, p_hardware_id uuid, p_expected_hardware_key text, p_target_type text, p_target_id uuid, p_expected_target_deployment_key text, p_expected_current_state jsonb, p_target_state jsonb, p_proposed_bound_at timestamp with time zone) RETURNS TABLE(status text, binding_written boolean, clinic_id uuid, deployment_run_key text, session_id uuid, execution_key text, item_id uuid, execution_item_key text, plan_item_key text, sequence integer, hardware_id uuid, deployment_hardware_key text, target_id uuid, target_type text, target_deployment_key text, previous_state jsonb, resulting_state jsonb, binding_timestamp timestamp with time zone, issue_code text, message text)
    LANGUAGE plpgsql
    VOLATILE
    SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
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
$$;;

CREATE FUNCTION public.claim_deployment_activation_execution_session(p_claim_mode text, p_clinic_id uuid, p_deployment_run_key text, p_session_id uuid, p_execution_key text, p_claimant_id text, p_proposed_ownership_token text, p_claimed_at timestamp with time zone, p_lease_expires_at timestamp with time zone, p_expected_item_count integer, p_expected_previous_owner text DEFAULT NULL::text, p_expected_previous_ownership_token text DEFAULT NULL::text, p_expected_previous_lease_expires_at timestamp with time zone DEFAULT NULL::timestamp with time zone) RETURNS TABLE(status text, session_id uuid, execution_key text, execution_owner text, ownership_token text, lease_expires_at timestamp with time zone, execution_status text, item_count integer, issue_code text, message text)
    LANGUAGE plpgsql
    VOLATILE
    SECURITY INVOKER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
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

  v_duration_seconds := extract(epoch from (p_lease_expires_at - p_claimed_at));

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
        select duplicate_item.execution_item_key
        from public.deployment_activation_execution_items duplicate_item
        where duplicate_item.session_id = v_session.id
        group by duplicate_item.execution_item_key
        having count(*) > 1
      ) d
    ) as duplicate_execution_item_key_count,
    (
      select count(*)::integer
      from (
        select duplicate_plan_item.plan_item_key
        from public.deployment_activation_execution_items duplicate_plan_item
        where duplicate_plan_item.session_id = v_session.id
        group by duplicate_plan_item.plan_item_key
        having count(*) > 1
      ) d
    ) as duplicate_plan_item_key_count,
    (
      select count(*)::integer
      from (
        select duplicate_sequence.sequence
        from public.deployment_activation_execution_items duplicate_sequence
        where duplicate_sequence.session_id = v_session.id
        group by duplicate_sequence.sequence
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
          lease_expires_at = p_lease_expires_at,
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
          lease_expires_at = p_lease_expires_at,
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
$$;;

CREATE FUNCTION public.complete_deployment_activation_execution_item(p_clinic_id uuid, p_deployment_run_key text, p_session_id uuid, p_execution_key text, p_claimant_id text, p_ownership_token text, p_expected_lease_expires_at timestamp with time zone, p_item_id uuid, p_execution_item_key text, p_plan_item_key text, p_expected_sequence integer, p_expected_entity_type text, p_expected_action text, p_expected_started_at timestamp with time zone, p_expected_attempt_count integer, p_proposed_completed_at timestamp with time zone) RETURNS TABLE(status text, claimant_id text, clinic_id uuid, deployment_run_key text, session_id uuid, execution_key text, item_id uuid, execution_item_key text, plan_item_key text, sequence integer, entity_type text, action text, started_at timestamp with time zone, completed_at timestamp with time zone, attempt_count integer, execution_status_before text, execution_status_after text, issue_code text, message text)
    LANGUAGE plpgsql
    VOLATILE
    SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
declare
  v_session public.deployment_activation_execution_sessions%rowtype;
  v_item public.deployment_activation_execution_items%rowtype;
  v_item_count integer := 0;
  v_duplicate_execution_item_keys integer := 0;
  v_duplicate_plan_item_keys integer := 0;
  v_duplicate_sequences integer := 0;
  v_rows_updated integer := 0;
  v_completion_timestamp timestamptz;
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

  -- Capture one authoritative database mutation-time value. The caller timestamp remains
  -- in the RPC signature for compatibility but cannot determine persisted completion time.
  v_completion_timestamp := clock_timestamp();

  if v_session.lease_expires_at is null
     or v_session.lease_expires_at is distinct from p_expected_lease_expires_at
     or v_session.lease_expires_at <= v_completion_timestamp
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
         completed_at = v_completion_timestamp
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
    v_completion_timestamp,
    v_item.attempt_count,
    v_item.execution_status,
    'succeeded'::text,
    null::text,
    'Activation execution item was completed. Dependency progression was not attempted.'::text;
end;
$$;;

CREATE FUNCTION public.complete_deployment_hardware_shell_execution_item(p_clinic_id uuid, p_deployment_run_key text, p_session_id uuid, p_execution_key text, p_claimant_id text, p_ownership_token text, p_expected_lease_expires_at timestamp with time zone, p_item_id uuid, p_execution_item_key text, p_plan_item_key text, p_expected_sequence integer, p_expected_entity_type text, p_expected_entity_id text, p_expected_deployment_hardware_key text, p_expected_action text, p_expected_item_started_at timestamp with time zone, p_expected_attempt_count integer, p_hardware_id uuid, p_expected_hardware_state jsonb, p_expected_target_state jsonb, p_proposed_completed_at timestamp with time zone) RETURNS TABLE(status text, claimant_id text, clinic_id uuid, deployment_run_key text, session_id uuid, execution_key text, item_id uuid, execution_item_key text, plan_item_key text, sequence integer, entity_type text, entity_id text, deployment_hardware_key text, action text, hardware_id uuid, item_status_before text, item_status_after text, started_at timestamp with time zone, completed_at timestamp with time zone, attempt_count integer, issue_code text, message text)
    LANGUAGE plpgsql
    VOLATILE
    SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
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
  v_completion_authoritative_state jsonb;
  v_completion_differing_fields jsonb;
  v_completion_differences jsonb;
  v_completion_mismatch_reasons jsonb;
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

  v_completion_authoritative_state := jsonb_build_object(
    'deploymentHardwareKey', v_hardware.deployment_hardware_key,
    'provisioningSource', v_hardware.provisioning_source,
    'provisioningStatus', v_hardware.provisioning_status,
    'active', v_hardware.active
  );
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
     and v_completion_authoritative_state is not distinct from p_expected_hardware_state
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

      (5, 'executionItemTargetState', p_expected_target_state, v_item.target_state),
      (6, 'requiredTargetState', jsonb_build_object('provisioningStatus', 'active', 'active', true), p_expected_target_state),
      (7, 'requiredProvisioningSource', to_jsonb('setup_draft'::text), to_jsonb(v_hardware.provisioning_source)),
      (8, 'requiredProvisioningStatus', to_jsonb('active'::text), to_jsonb(v_hardware.provisioning_status)),
      (9, 'requiredActive', to_jsonb(true), to_jsonb(v_hardware.active))
    ) comparison(ordinal, field_name, expected_value, actual_value)
   where comparison.expected_value is distinct from comparison.actual_value;
  select coalesce(jsonb_object_agg(
    comparison.field_name,
    case
      when not comparison.expected_present
        then 'authoritative_expected_field_missing'
      else 'expected_value_differs_from_persisted_value'
    end
  ), '{}'::jsonb)
    into v_completion_mismatch_reasons
    from (values
      ('deploymentHardwareKey', p_expected_hardware_state -> 'deploymentHardwareKey', v_completion_hardware_state -> 'deploymentHardwareKey', p_expected_hardware_state ? 'deploymentHardwareKey', 'authoritative'),
      ('provisioningSource', p_expected_hardware_state -> 'provisioningSource', v_completion_hardware_state -> 'provisioningSource', p_expected_hardware_state ? 'provisioningSource', 'authoritative'),
      ('provisioningStatus', p_expected_hardware_state -> 'provisioningStatus', v_completion_hardware_state -> 'provisioningStatus', p_expected_hardware_state ? 'provisioningStatus', 'authoritative'),
      ('active', p_expected_hardware_state -> 'active', v_completion_hardware_state -> 'active', p_expected_hardware_state ? 'active', 'authoritative')
    ) comparison(field_name, expected_value, actual_value, expected_present, contract_class)
   where comparison.expected_value is distinct from comparison.actual_value;
  if v_completion_authoritative_state
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
          'authoritativeCompletionFields', jsonb_build_array('deploymentHardwareKey', 'provisioningSource', 'provisioningStatus', 'active'),
          'optionalFields', jsonb_build_array('operationalStatus', 'agentId', 'defaultWorkstationId', 'currentWorkstationId'),
          'fieldsIgnoredByCompletionContract', jsonb_build_array('operationalStatus', 'agentId', 'defaultWorkstationId', 'currentWorkstationId'),
          'requiredDurableHardwareState', p_expected_hardware_state,
          'actualPersistedHardwareState', v_completion_hardware_state,
          'actualAuthoritativeHardwareState', v_completion_authoritative_state,
          'ignoredOptionalFieldObservations', jsonb_build_object('operationalStatus', v_hardware.status, 'agentId', v_hardware.agent_id, 'defaultWorkstationId', v_hardware.default_workstation_id, 'currentWorkstationId', v_hardware.current_workstation_id),
          'differingFields', v_completion_differing_fields,
          'differences', v_completion_differences,
          'mismatchReasons', v_completion_mismatch_reasons,
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
$$;;

CREATE FUNCTION public.complete_deployment_provider_shell_execution_item(p_clinic_id uuid, p_deployment_run_key text, p_session_id uuid, p_execution_key text, p_claimant_id text, p_ownership_token text, p_expected_lease_expires_at timestamp with time zone, p_item_id uuid, p_execution_item_key text, p_plan_item_key text, p_expected_sequence integer, p_expected_entity_type text, p_expected_entity_id text, p_expected_deployment_provider_key text, p_expected_action text, p_expected_item_started_at timestamp with time zone, p_expected_attempt_count integer, p_provider_id uuid, p_expected_provider_state jsonb, p_expected_target_state jsonb, p_proposed_completed_at timestamp with time zone) RETURNS TABLE(status text, claimant_id text, clinic_id uuid, deployment_run_key text, session_id uuid, execution_key text, item_id uuid, execution_item_key text, plan_item_key text, sequence integer, entity_type text, entity_id text, deployment_provider_key text, action text, provider_id uuid, item_status_before text, item_status_after text, started_at timestamp with time zone, completed_at timestamp with time zone, attempt_count integer, issue_code text, message text)
    LANGUAGE plpgsql
    VOLATILE
    SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
declare
  v_session public.deployment_activation_execution_sessions%rowtype;
  v_item public.deployment_activation_execution_items%rowtype;
  v_provider public.providers%rowtype;
  v_total_items integer := 0;
  v_duplicate_item_identity_count integer := 0;
  v_duplicate_provider_identity_count integer := 0;
  v_prior_bad_count integer := 0;
  v_dependency_bad_count integer := 0;
  v_later_drift_count integer := 0;
  v_running_or_ready_other_count integer := 0;
  v_rows_updated integer := 0;
begin
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
      p_expected_entity_id, p_expected_deployment_provider_key, p_expected_action, p_provider_id,
      null::text, null::text, null::timestamptz, null::timestamptz, null::integer,
      'missing_session'::text, 'Provider-shell item-completion session was not found.'::text;
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
      p_expected_entity_id, p_expected_deployment_provider_key, p_expected_action, p_provider_id,
      null::text, null::text, null::timestamptz, null::timestamptz, null::integer,
      'missing_item'::text, 'Provider-shell execution item was not found.'::text;
    return;
  end if;

  select provider_row.* into v_provider
  from public.providers provider_row
  where provider_row.id = p_provider_id
    and provider_row.clinic_id = p_clinic_id
    and provider_row.deployment_provider_key = p_expected_deployment_provider_key
  for update;

  if not found then
    return query select 'not_found'::text, p_claimant_id, v_session.clinic_id, v_session.deployment_run_key, v_session.id, v_session.execution_key,
      v_item.id, v_item.execution_item_key, v_item.plan_item_key, v_item.sequence, v_item.entity_type,
      v_item.entity_id, p_expected_deployment_provider_key, v_item.action, p_provider_id,
      v_item.execution_status, v_item.execution_status, v_item.started_at, v_item.completed_at, v_item.attempt_count,
      'missing_provider_shell'::text, 'Provider shell was not found.'::text;
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

  select count(*)::integer into v_duplicate_provider_identity_count
  from public.providers duplicate_provider
  where duplicate_provider.clinic_id = p_clinic_id
    and duplicate_provider.deployment_provider_key = p_expected_deployment_provider_key;

  if v_total_items is distinct from v_session.items_requested
     or v_duplicate_item_identity_count > 0
     or v_duplicate_provider_identity_count <> 1 then
    return query select 'blocked'::text, p_claimant_id, v_session.clinic_id, v_session.deployment_run_key, v_session.id, v_session.execution_key,
      v_item.id, v_item.execution_item_key, v_item.plan_item_key, v_item.sequence, v_item.entity_type,
      v_item.entity_id, v_provider.deployment_provider_key, v_item.action, v_provider.id,
      v_item.execution_status, v_item.execution_status, v_item.started_at, v_item.completed_at, v_item.attempt_count,
      'duplicate_identity'::text, 'Provider-shell item-completion identity integrity failed.'::text;
    return;
  end if;

  if v_item.execution_status = 'succeeded'
     and v_item.completed_at is not null
     and v_item.completed_at >= v_item.started_at
     and v_item.sequence = p_expected_sequence
     and v_item.entity_type = p_expected_entity_type
     and v_item.entity_id is not distinct from p_expected_entity_id
     and v_item.deployment_key is not distinct from p_expected_deployment_provider_key
     and v_item.action = p_expected_action
     and v_item.started_at is not distinct from p_expected_item_started_at
     and v_item.attempt_count is not distinct from p_expected_attempt_count
     and v_item.rolled_back_at is null
     and v_item.error_code is null
     and v_item.error_message is null
     and v_provider.provisioning_source = 'setup_draft'
     and v_provider.provisioning_status = 'active'
     and v_provider.active = true then
    return query select 'already_completed'::text, p_claimant_id, v_session.clinic_id, v_session.deployment_run_key, v_session.id, v_session.execution_key,
      v_item.id, v_item.execution_item_key, v_item.plan_item_key, v_item.sequence, v_item.entity_type,
      v_item.entity_id, v_provider.deployment_provider_key, v_item.action, v_provider.id,
      'succeeded'::text, 'succeeded'::text, v_item.started_at, v_item.completed_at, v_item.attempt_count,
      null::text, 'Provider-shell execution item was already completed. completed_at was preserved.'::text;
    return;
  end if;

  if v_session.preparation_status is distinct from 'ready'
     or v_session.execution_status is distinct from 'running'
     or v_session.started_at is null
     or v_session.completed_at is not null
     or v_session.failed_at is not null then
    return query select 'blocked'::text, p_claimant_id, v_session.clinic_id, v_session.deployment_run_key, v_session.id, v_session.execution_key,
      v_item.id, v_item.execution_item_key, v_item.plan_item_key, v_item.sequence, v_item.entity_type,
      v_item.entity_id, v_provider.deployment_provider_key, v_item.action, v_provider.id,
      v_item.execution_status, v_item.execution_status, v_item.started_at, v_item.completed_at, v_item.attempt_count,
      'session_not_running'::text, 'Execution session is not provider item-completion safe.'::text;
    return;
  end if;

  if v_session.execution_owner is distinct from p_claimant_id
     or v_session.ownership_token is distinct from p_ownership_token then
    return query select 'conflict'::text, p_claimant_id, v_session.clinic_id, v_session.deployment_run_key, v_session.id, v_session.execution_key,
      v_item.id, v_item.execution_item_key, v_item.plan_item_key, v_item.sequence, v_item.entity_type,
      v_item.entity_id, v_provider.deployment_provider_key, v_item.action, v_provider.id,
      v_item.execution_status, v_item.execution_status, v_item.started_at, v_item.completed_at, v_item.attempt_count,
      'ownership_conflict'::text, 'Provider-shell item-completion ownership compare-and-set failed.'::text;
    return;
  end if;

  if v_session.lease_expires_at is null
     or v_session.lease_expires_at is distinct from p_expected_lease_expires_at
     or v_session.lease_expires_at <= p_proposed_completed_at then
    return query select 'blocked'::text, p_claimant_id, v_session.clinic_id, v_session.deployment_run_key, v_session.id, v_session.execution_key,
      v_item.id, v_item.execution_item_key, v_item.plan_item_key, v_item.sequence, v_item.entity_type,
      v_item.entity_id, v_provider.deployment_provider_key, v_item.action, v_provider.id,
      v_item.execution_status, v_item.execution_status, v_item.started_at, v_item.completed_at, v_item.attempt_count,
      'lease_expired'::text, 'Execution lease is not active for provider item completion.'::text;
    return;
  end if;

  if v_item.execution_item_key is distinct from p_execution_item_key
     or v_item.plan_item_key is distinct from p_plan_item_key
     or v_item.sequence is distinct from p_expected_sequence
     or v_item.entity_type is distinct from p_expected_entity_type
     or v_item.entity_id is distinct from p_expected_entity_id
     or v_item.deployment_key is distinct from p_expected_deployment_provider_key
     or v_item.action is distinct from p_expected_action
     or p_expected_entity_type <> 'provider_shell'
     or p_expected_action <> 'activate'
     or v_provider.id is distinct from p_provider_id
     or v_provider.deployment_provider_key is distinct from p_expected_deployment_provider_key then
    return query select 'conflict'::text, p_claimant_id, v_session.clinic_id, v_session.deployment_run_key, v_session.id, v_session.execution_key,
      v_item.id, v_item.execution_item_key, v_item.plan_item_key, v_item.sequence, v_item.entity_type,
      v_item.entity_id, v_provider.deployment_provider_key, v_item.action, v_provider.id,
      v_item.execution_status, v_item.execution_status, v_item.started_at, v_item.completed_at, v_item.attempt_count,
      'item_identity_compare_failed'::text, 'Provider-shell item identity compare-and-set failed.'::text;
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
      v_item.entity_id, v_provider.deployment_provider_key, v_item.action, v_provider.id,
      v_item.execution_status, v_item.execution_status, v_item.started_at, v_item.completed_at, v_item.attempt_count,
      'stale_state'::text, 'Provider-shell execution item changed before completion.'::text;
    return;
  end if;

  if jsonb_build_object('deploymentProviderKey', v_provider.deployment_provider_key, 'provisioningSource', v_provider.provisioning_source, 'provisioningStatus', v_provider.provisioning_status, 'active', v_provider.active)
       is distinct from p_expected_provider_state
     or p_expected_target_state is distinct from jsonb_build_object('deploymentProviderKey', v_provider.deployment_provider_key, 'provisioningSource', 'setup_draft', 'provisioningStatus', 'active', 'active', true)
     or v_provider.provisioning_source is distinct from 'setup_draft'
     or v_provider.provisioning_status is distinct from 'active'
     or v_provider.active is distinct from true then
    return query select 'blocked'::text, p_claimant_id, v_session.clinic_id, v_session.deployment_run_key, v_session.id, v_session.execution_key,
      v_item.id, v_item.execution_item_key, v_item.plan_item_key, v_item.sequence, v_item.entity_type,
      v_item.entity_id, v_provider.deployment_provider_key, v_item.action, v_provider.id,
      v_item.execution_status, v_item.execution_status, v_item.started_at, v_item.completed_at, v_item.attempt_count,
      'provider_state_invalid'::text, 'Provider shell durable state is not completion-safe.'::text;
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
      v_item.entity_id, v_provider.deployment_provider_key, v_item.action, v_provider.id,
      v_item.execution_status, v_item.execution_status, v_item.started_at, v_item.completed_at, v_item.attempt_count,
      'ordering_integrity_failed'::text, 'Provider-shell item dependency or ordering integrity failed.'::text;
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
     and update_item.entity_type = 'provider_shell'
     and update_item.entity_id = p_expected_entity_id
     and update_item.deployment_key = p_expected_deployment_provider_key
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
      v_item.entity_id, v_provider.deployment_provider_key, v_item.action, v_provider.id,
      v_item.execution_status, v_item.execution_status, v_item.started_at, v_item.completed_at, v_item.attempt_count,
      'stale_state'::text, 'Provider-shell item completion compare-and-set wrote no rows.'::text;
    return;
  end if;

  return query select 'completed'::text, p_claimant_id, v_session.clinic_id, v_session.deployment_run_key, v_session.id, v_session.execution_key,
    v_item.id, v_item.execution_item_key, v_item.plan_item_key, v_item.sequence, v_item.entity_type,
    v_item.entity_id, v_provider.deployment_provider_key, v_item.action, v_provider.id,
    v_item.execution_status, 'succeeded'::text, v_item.started_at, p_proposed_completed_at, v_item.attempt_count,
    null::text, 'Provider-shell execution item was completed. Dependency progression was not attempted.'::text;
end;
$$;;

CREATE FUNCTION public.complete_deployment_sterilizer_shell_execution_item(p_clinic_id uuid, p_deployment_run_key text, p_session_id uuid, p_execution_key text, p_claimant_id text, p_ownership_token text, p_expected_lease_expires_at timestamp with time zone, p_item_id uuid, p_execution_item_key text, p_plan_item_key text, p_expected_sequence integer, p_expected_entity_type text, p_expected_entity_id text, p_expected_deployment_sterilizer_key text, p_expected_action text, p_expected_item_started_at timestamp with time zone, p_expected_attempt_count integer, p_sterilizer_id uuid, p_expected_sterilizer_state jsonb, p_expected_target_state jsonb, p_proposed_completed_at timestamp with time zone) RETURNS TABLE(status text, claimant_id text, clinic_id uuid, deployment_run_key text, session_id uuid, execution_key text, item_id uuid, execution_item_key text, plan_item_key text, sequence integer, entity_type text, entity_id text, deployment_sterilizer_key text, action text, sterilizer_id uuid, item_status_before text, item_status_after text, started_at timestamp with time zone, completed_at timestamp with time zone, attempt_count integer, issue_code text, message text)
    LANGUAGE plpgsql
    VOLATILE
    SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
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
$$;;

CREATE FUNCTION public.complete_deployment_workstation_shell_execution_item(p_clinic_id uuid, p_deployment_run_key text, p_session_id uuid, p_execution_key text, p_claimant_id text, p_ownership_token text, p_expected_lease_expires_at timestamp with time zone, p_item_id uuid, p_execution_item_key text, p_plan_item_key text, p_expected_sequence integer, p_expected_entity_type text, p_expected_entity_id text, p_expected_deployment_workstation_key text, p_expected_action text, p_expected_item_started_at timestamp with time zone, p_expected_attempt_count integer, p_workstation_id uuid, p_expected_workstation_state jsonb, p_expected_target_state jsonb, p_proposed_completed_at timestamp with time zone) RETURNS TABLE(status text, claimant_id text, clinic_id uuid, deployment_run_key text, session_id uuid, execution_key text, item_id uuid, execution_item_key text, plan_item_key text, sequence integer, entity_type text, entity_id text, deployment_workstation_key text, action text, workstation_id uuid, item_status_before text, item_status_after text, started_at timestamp with time zone, completed_at timestamp with time zone, attempt_count integer, issue_code text, message text)
    LANGUAGE plpgsql
    VOLATILE
    SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
declare
  v_session public.deployment_activation_execution_sessions%rowtype;
  v_item public.deployment_activation_execution_items%rowtype;
  v_workstation public.clinical_workstations%rowtype;
  v_total_items integer := 0;
  v_duplicate_item_identity_count integer := 0;
  v_duplicate_workstation_identity_count integer := 0;
  v_prior_bad_count integer := 0;
  v_dependency_bad_count integer := 0;
  v_later_drift_count integer := 0;
  v_running_or_ready_other_count integer := 0;
  v_rows_updated integer := 0;
begin
  if p_workstation_id is null or p_expected_deployment_workstation_key is null or length(btrim(p_expected_deployment_workstation_key)) = 0
     or p_expected_entity_id is null or length(btrim(p_expected_entity_id)) = 0
     or p_claimant_id is null or length(btrim(p_claimant_id)) = 0
     or p_ownership_token is null or length(btrim(p_ownership_token)) = 0
     or p_proposed_completed_at is null
     or p_expected_workstation_state is null or jsonb_typeof(p_expected_workstation_state) <> 'object'
     or p_expected_target_state is null or jsonb_typeof(p_expected_target_state) <> 'object' then
    return query select 'blocked'::text, p_claimant_id, p_clinic_id, p_deployment_run_key, p_session_id, p_execution_key,
      p_item_id, p_execution_item_key, p_plan_item_key, p_expected_sequence, p_expected_entity_type,
      p_expected_entity_id, p_expected_deployment_workstation_key, p_expected_action, p_workstation_id,
      null::text, null::text, null::timestamptz, null::timestamptz, null::integer,
      'completion_evidence_invalid'::text, 'Workstation completion identity, ownership, timestamp, and JSON evidence are required.'::text;
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
      p_expected_entity_id, p_expected_deployment_workstation_key, p_expected_action, p_workstation_id,
      null::text, null::text, null::timestamptz, null::timestamptz, null::integer,
      'missing_session'::text, 'Workstation-shell item-completion session was not found.'::text;
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
      p_expected_entity_id, p_expected_deployment_workstation_key, p_expected_action, p_workstation_id,
      null::text, null::text, null::timestamptz, null::timestamptz, null::integer,
      'missing_item'::text, 'Workstation-shell execution item was not found.'::text;
    return;
  end if;

  select workstation_row.* into v_workstation
  from public.clinical_workstations workstation_row
  where workstation_row.id = p_workstation_id
    and workstation_row.clinic_id = p_clinic_id
    and workstation_row.deployment_workstation_key = p_expected_deployment_workstation_key
  for update;

  if not found then
    return query select 'not_found'::text, p_claimant_id, v_session.clinic_id, v_session.deployment_run_key, v_session.id, v_session.execution_key,
      v_item.id, v_item.execution_item_key, v_item.plan_item_key, v_item.sequence, v_item.entity_type,
      v_item.entity_id, p_expected_deployment_workstation_key, v_item.action, p_workstation_id,
      v_item.execution_status, v_item.execution_status, v_item.started_at, v_item.completed_at, v_item.attempt_count,
      'missing_workstation_shell'::text, 'Workstation shell was not found.'::text;
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

  select count(*)::integer into v_duplicate_workstation_identity_count
  from public.clinical_workstations duplicate_workstation
  where duplicate_workstation.clinic_id = p_clinic_id
    and duplicate_workstation.deployment_workstation_key = p_expected_deployment_workstation_key;

  if v_total_items is distinct from v_session.items_requested
     or v_duplicate_item_identity_count > 0
     or v_duplicate_workstation_identity_count <> 1 then
    return query select 'blocked'::text, p_claimant_id, v_session.clinic_id, v_session.deployment_run_key, v_session.id, v_session.execution_key,
      v_item.id, v_item.execution_item_key, v_item.plan_item_key, v_item.sequence, v_item.entity_type,
      v_item.entity_id, v_workstation.deployment_workstation_key, v_item.action, v_workstation.id,
      v_item.execution_status, v_item.execution_status, v_item.started_at, v_item.completed_at, v_item.attempt_count,
      'duplicate_identity'::text, 'Workstation-shell item-completion identity integrity failed.'::text;
    return;
  end if;

  if v_item.execution_status = 'succeeded'
     and v_item.completed_at is not null
     and v_item.completed_at >= v_item.started_at
     and v_item.sequence = p_expected_sequence
     and v_item.entity_type = p_expected_entity_type
     and v_item.entity_id is not distinct from p_expected_entity_id
     and v_item.deployment_key is not distinct from p_expected_deployment_workstation_key
     and v_item.action = p_expected_action
     and v_item.started_at is not distinct from p_expected_item_started_at
     and v_item.attempt_count is not distinct from p_expected_attempt_count
     and v_item.rolled_back_at is null
     and v_item.error_code is null
     and v_item.error_message is null
     and v_workstation.provisioning_source = 'setup_draft'
     and v_workstation.provisioning_status = 'active'
     and v_workstation.active = true
     and jsonb_build_object('deploymentWorkstationKey', v_workstation.deployment_workstation_key, 'provisioningSource', v_workstation.provisioning_source, 'provisioningStatus', v_workstation.provisioning_status, 'active', v_workstation.active) is not distinct from p_expected_workstation_state
     and p_expected_target_state is not distinct from jsonb_build_object('provisioningStatus', 'active', 'active', true)
     and v_session.preparation_status = 'ready'
     and v_session.execution_status = 'running'
     and v_session.execution_owner is not distinct from p_claimant_id
     and v_session.ownership_token is not distinct from p_ownership_token
     and v_session.lease_expires_at is not distinct from p_expected_lease_expires_at
     and v_session.lease_expires_at > p_proposed_completed_at then
    return query select 'already_completed'::text, p_claimant_id, v_session.clinic_id, v_session.deployment_run_key, v_session.id, v_session.execution_key,
      v_item.id, v_item.execution_item_key, v_item.plan_item_key, v_item.sequence, v_item.entity_type,
      v_item.entity_id, v_workstation.deployment_workstation_key, v_item.action, v_workstation.id,
      'succeeded'::text, 'succeeded'::text, v_item.started_at, v_item.completed_at, v_item.attempt_count,
      null::text, 'Workstation-shell execution item was already completed. completed_at was preserved.'::text;
    return;
  end if;

  if v_session.preparation_status is distinct from 'ready'
     or v_session.execution_status is distinct from 'running'
     or v_session.started_at is null
     or v_session.completed_at is not null
     or v_session.failed_at is not null then
    return query select 'blocked'::text, p_claimant_id, v_session.clinic_id, v_session.deployment_run_key, v_session.id, v_session.execution_key,
      v_item.id, v_item.execution_item_key, v_item.plan_item_key, v_item.sequence, v_item.entity_type,
      v_item.entity_id, v_workstation.deployment_workstation_key, v_item.action, v_workstation.id,
      v_item.execution_status, v_item.execution_status, v_item.started_at, v_item.completed_at, v_item.attempt_count,
      'session_not_running'::text, 'Execution session is not workstation item-completion safe.'::text;
    return;
  end if;

  if v_session.execution_owner is distinct from p_claimant_id
     or v_session.ownership_token is distinct from p_ownership_token then
    return query select 'conflict'::text, p_claimant_id, v_session.clinic_id, v_session.deployment_run_key, v_session.id, v_session.execution_key,
      v_item.id, v_item.execution_item_key, v_item.plan_item_key, v_item.sequence, v_item.entity_type,
      v_item.entity_id, v_workstation.deployment_workstation_key, v_item.action, v_workstation.id,
      v_item.execution_status, v_item.execution_status, v_item.started_at, v_item.completed_at, v_item.attempt_count,
      'ownership_conflict'::text, 'Workstation-shell item-completion ownership compare-and-set failed.'::text;
    return;
  end if;

  if v_session.lease_expires_at is null
     or v_session.lease_expires_at is distinct from p_expected_lease_expires_at
     or v_session.lease_expires_at <= p_proposed_completed_at then
    return query select 'blocked'::text, p_claimant_id, v_session.clinic_id, v_session.deployment_run_key, v_session.id, v_session.execution_key,
      v_item.id, v_item.execution_item_key, v_item.plan_item_key, v_item.sequence, v_item.entity_type,
      v_item.entity_id, v_workstation.deployment_workstation_key, v_item.action, v_workstation.id,
      v_item.execution_status, v_item.execution_status, v_item.started_at, v_item.completed_at, v_item.attempt_count,
      'lease_expired'::text, 'Execution lease is not active for workstation item completion.'::text;
    return;
  end if;

  if v_item.execution_item_key is distinct from p_execution_item_key
     or v_item.plan_item_key is distinct from p_plan_item_key
     or v_item.sequence is distinct from p_expected_sequence
     or v_item.entity_type is distinct from p_expected_entity_type
     or v_item.entity_id is distinct from p_expected_entity_id
     or v_item.entity_id is distinct from p_workstation_id::text
     or p_expected_entity_id is distinct from p_workstation_id::text
     or v_item.deployment_key is distinct from p_expected_deployment_workstation_key
     or v_item.action is distinct from p_expected_action
     or p_expected_entity_type <> 'workstation_shell'
     or p_expected_action <> 'activate'
     or v_workstation.id is distinct from p_workstation_id
     or v_workstation.deployment_workstation_key is distinct from p_expected_deployment_workstation_key then
    return query select 'conflict'::text, p_claimant_id, v_session.clinic_id, v_session.deployment_run_key, v_session.id, v_session.execution_key,
      v_item.id, v_item.execution_item_key, v_item.plan_item_key, v_item.sequence, v_item.entity_type,
      v_item.entity_id, v_workstation.deployment_workstation_key, v_item.action, v_workstation.id,
      v_item.execution_status, v_item.execution_status, v_item.started_at, v_item.completed_at, v_item.attempt_count,
      'item_identity_compare_failed'::text, 'Workstation-shell item identity compare-and-set failed.'::text;
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
      v_item.entity_id, v_workstation.deployment_workstation_key, v_item.action, v_workstation.id,
      v_item.execution_status, v_item.execution_status, v_item.started_at, v_item.completed_at, v_item.attempt_count,
      'stale_state'::text, 'Workstation-shell execution item changed before completion.'::text;
    return;
  end if;

  if jsonb_build_object('deploymentWorkstationKey', v_workstation.deployment_workstation_key, 'provisioningSource', v_workstation.provisioning_source, 'provisioningStatus', v_workstation.provisioning_status, 'active', v_workstation.active)
       is distinct from p_expected_workstation_state
     or v_item.target_state is distinct from p_expected_target_state
     or p_expected_target_state is distinct from jsonb_build_object('provisioningStatus', 'active', 'active', true)
     or v_workstation.provisioning_source is distinct from 'setup_draft'
     or v_workstation.provisioning_status is distinct from 'active'
     or v_workstation.active is distinct from true then
    return query select 'blocked'::text, p_claimant_id, v_session.clinic_id, v_session.deployment_run_key, v_session.id, v_session.execution_key,
      v_item.id, v_item.execution_item_key, v_item.plan_item_key, v_item.sequence, v_item.entity_type,
      v_item.entity_id, v_workstation.deployment_workstation_key, v_item.action, v_workstation.id,
      v_item.execution_status, v_item.execution_status, v_item.started_at, v_item.completed_at, v_item.attempt_count,
      'workstation_state_invalid'::text, 'Workstation shell durable state is not completion-safe.'::text;
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
      v_item.entity_id, v_workstation.deployment_workstation_key, v_item.action, v_workstation.id,
      v_item.execution_status, v_item.execution_status, v_item.started_at, v_item.completed_at, v_item.attempt_count,
      'ordering_integrity_failed'::text, 'Workstation-shell item dependency or ordering integrity failed.'::text;
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
     and update_item.entity_type = 'workstation_shell'
     and update_item.entity_id = p_expected_entity_id
     and update_item.deployment_key = p_expected_deployment_workstation_key
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
      v_item.entity_id, v_workstation.deployment_workstation_key, v_item.action, v_workstation.id,
      v_item.execution_status, v_item.execution_status, v_item.started_at, v_item.completed_at, v_item.attempt_count,
      'stale_state'::text, 'Workstation-shell item completion compare-and-set wrote no rows.'::text;
    return;
  end if;

  return query select 'completed'::text, p_claimant_id, v_session.clinic_id, v_session.deployment_run_key, v_session.id, v_session.execution_key,
    v_item.id, v_item.execution_item_key, v_item.plan_item_key, v_item.sequence, v_item.entity_type,
    v_item.entity_id, v_workstation.deployment_workstation_key, v_item.action, v_workstation.id,
    v_item.execution_status, 'succeeded'::text, v_item.started_at, p_proposed_completed_at, v_item.attempt_count,
    null::text, 'Workstation-shell execution item was completed. Dependency progression was not attempted.'::text;
end;
$$;;

CREATE FUNCTION public.persist_deployment_recovery_plan(p_clinic_id uuid, p_deployment_run_key text, p_session_id uuid, p_execution_key text, p_plan_key text, p_recovery_key text, p_idempotency_key text, p_payload_hash text, p_recovery_status text, p_rollback_required boolean, p_rollback_executable boolean, p_sanitized_failure jsonb, p_unsupported_compensations jsonb, p_running_items_to_recover jsonb, p_completed_mutation_count integer, p_reversible_mutation_count integer, p_downstream jsonb, p_evidence jsonb, p_rollback_items jsonb) RETURNS TABLE(persistence_status text, recovery_plan_id uuid, recovery_key text, recovery_status text, rollback_required boolean, rollback_executable boolean, rollback_items_persisted integer, rollback_items_reused integer, issue_code text, message text, persisted_at timestamp with time zone)
    LANGUAGE plpgsql
    VOLATILE
    SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $_$
declare
  v_session public.deployment_activation_execution_sessions%rowtype;
  v_existing public.deployment_recovery_plans%rowtype;
  v_plan_id uuid;
  v_failure_code text;
  v_failure_layer text;
  v_failed_at timestamptz;
  v_failed_execution_item_key text;
  v_failed_plan_item_key text;
  v_failed_sequence integer;
  v_failed_entity_type text;
  v_failed_entity_id text;
  v_failed_action text;
  v_retryable boolean;
  v_item_count integer;
  v_reversible_count integer;
  v_blocked_count integer;
  v_created_at timestamptz;
  v_item jsonb;
begin
  persistence_status := 'blocked';
  recovery_plan_id := null;
  recovery_key := p_recovery_key;
  recovery_status := p_recovery_status;
  rollback_required := coalesce(p_rollback_required, false);
  rollback_executable := coalesce(p_rollback_executable, false);
  rollback_items_persisted := 0;
  rollback_items_reused := 0;
  issue_code := null;
  persisted_at := null;

  if p_clinic_id is null
     or p_session_id is null
     or p_deployment_run_key is null or length(btrim(p_deployment_run_key)) = 0
     or p_execution_key is null or length(btrim(p_execution_key)) = 0
     or p_plan_key is null or length(btrim(p_plan_key)) = 0
     or p_recovery_key is null or length(btrim(p_recovery_key)) = 0
     or p_idempotency_key is null or length(btrim(p_idempotency_key)) = 0
     or p_payload_hash is null or length(btrim(p_payload_hash)) = 0 then
    issue_code := 'recovery_identity_invalid';
    message := 'Recovery scope, stable request identity, idempotency key, and payload hash are required.';
    return next;
    return;
  end if;

  if p_recovery_status is null
     or p_recovery_status not in ('rollback_required', 'rollback_not_required', 'blocked', 'not_found')
     or p_rollback_required is null
     or p_rollback_executable is null then
    issue_code := 'recovery_decision_invalid';
    message := 'Recovery status and rollback decision flags do not match the RC10.9A contract.';
    return next;
    return;
  end if;

  if p_completed_mutation_count is null or p_completed_mutation_count < 0
     or p_reversible_mutation_count is null or p_reversible_mutation_count < 0
     or p_reversible_mutation_count > p_completed_mutation_count then
    issue_code := 'recovery_counter_invalid';
    message := 'Recovery mutation counters must be non-negative and internally consistent.';
    return next;
    return;
  end if;

  if p_sanitized_failure is null or jsonb_typeof(p_sanitized_failure) <> 'object'
     or not (p_sanitized_failure ?& array[
       'failureCode', 'failureLayer', 'failedAt', 'message',
       'failedExecutionItemKey', 'failedPlanItemKey', 'failedSequence',
       'failedEntityType', 'failedEntityId', 'failedAction', 'retryable', 'diagnostics'
     ])
     or exists (
       select 1 from jsonb_object_keys(p_sanitized_failure) as failure_key(key)
       where key not in (
         'failureCode', 'failureLayer', 'failedAt', 'message',
         'failedExecutionItemKey', 'failedPlanItemKey', 'failedSequence',
         'failedEntityType', 'failedEntityId', 'failedAction', 'retryable', 'diagnostics'
       )
     )
     or jsonb_typeof(p_sanitized_failure->'diagnostics') <> 'object'
     or exists (
       select 1 from jsonb_each(p_sanitized_failure->'diagnostics') as diagnostic(key, value)
       where key not in ('operation', 'status', 'reason', 'attempt', 'sequence', 'entityType', 'action', 'targetType', 'retryAfterSeconds')
          or jsonb_typeof(value) not in ('string', 'number', 'boolean', 'null')
     )
     or jsonb_typeof(p_sanitized_failure->'failureCode') <> 'string'
     or jsonb_typeof(p_sanitized_failure->'failureLayer') <> 'string'
     or jsonb_typeof(p_sanitized_failure->'failedAt') <> 'string'
     or jsonb_typeof(p_sanitized_failure->'message') <> 'string'
     or jsonb_typeof(p_sanitized_failure->'retryable') <> 'boolean'
     or (p_sanitized_failure->>'failedAt') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}([.][0-9]+)?(Z|[+-][0-9]{2}:[0-9]{2})$' then
    issue_code := 'sanitized_failure_invalid';
    message := 'Failure evidence must match the exact sanitized RC10.9A contract.';
    return next;
    return;
  end if;

  if p_unsupported_compensations is null or jsonb_typeof(p_unsupported_compensations) <> 'array'
     or p_running_items_to_recover is null or jsonb_typeof(p_running_items_to_recover) <> 'array'
     or p_downstream is null or jsonb_typeof(p_downstream) <> 'object'
     or p_evidence is null or jsonb_typeof(p_evidence) <> 'object'
     or p_rollback_items is null or jsonb_typeof(p_rollback_items) <> 'array' then
    issue_code := 'recovery_evidence_shape_invalid';
    message := 'Normalized recovery collections and evidence must use the required JSON shapes.';
    return next;
    return;
  end if;

  if p_sanitized_failure->>'message' <> 'Deployment execution failure classified for recovery planning.'
     or (p_sanitized_failure->>'failureCode') !~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{0,199}$'
     or (p_sanitized_failure->>'failureLayer') !~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{0,199}$'
     or exists (
       select 1
       from jsonb_each(p_sanitized_failure->'diagnostics') as diagnostic(key, value)
       where jsonb_typeof(value) = 'string'
         and (
          length(value #>> '{}') > 256
          or (value #>> '{}') ~* '(ownership.?token|service.?role|credential|authorization|bearer[[:space:]]|secret|stack trace|sqlstate)'
        )
    ) then
    issue_code := 'unsafe_failure_diagnostics';
    message := 'Failure evidence contains non-canonical or potentially sensitive diagnostics.';
    return next;
    return;
  end if;

  if not (p_evidence ?& array['message', 'failedItem', 'issues', 'stoppedAtStage'])
     or exists (
       select 1 from jsonb_object_keys(p_evidence) as evidence_key(key)
       where key not in ('message', 'failedItem', 'issues', 'stoppedAtStage')
     )
     or jsonb_typeof(p_evidence->'message') <> 'string'
     or jsonb_typeof(p_evidence->'issues') <> 'array'
     or p_evidence->>'stoppedAtStage' not in (
       'failure_validation', 'identity_validation', 'snapshot_validation',
       'plan_construction', 'decision_complete'
     )
     or jsonb_typeof(p_evidence->'failedItem') not in ('object', 'null')
     or exists (
       select 1
       from jsonb_array_elements(p_evidence->'issues') as recovery_issue(value)
       where jsonb_typeof(value) <> 'object'
          or not (value ?& array[
            'code', 'severity', 'message', 'executionItemKey', 'planItemKey',
            'sequence', 'entityType', 'entityId'
          ])
          or exists (
            select 1 from jsonb_object_keys(value) as issue_key(key)
            where key not in (
              'code', 'severity', 'message', 'executionItemKey', 'planItemKey',
              'sequence', 'entityType', 'entityId'
            )
          )
          or value->>'severity' not in ('blocker', 'warning')
     )
     or (
       jsonb_typeof(p_evidence->'failedItem') = 'object'
       and (
         not ((p_evidence->'failedItem') ?& array[
           'executionItemKey', 'planItemKey', 'sequence', 'entityType', 'entityId', 'action'
         ])
         or exists (
           select 1 from jsonb_object_keys(p_evidence->'failedItem') as failed_item_key(key)
           where key not in ('executionItemKey', 'planItemKey', 'sequence', 'entityType', 'entityId', 'action')
         )
       )
     ) then
    issue_code := 'recovery_evidence_contract_invalid';
    message := 'Recovery result evidence must match the exact safe RC10.9A evidence contract.';
    return next;
    return;
  end if;

  if (p_sanitized_failure::text || p_unsupported_compensations::text ||
      p_running_items_to_recover::text || p_downstream::text ||
      p_evidence::text || p_rollback_items::text)
      ~* '"(stack|sql|hint|details|ownershipToken|ownership_token|claimantToken|serviceRoleKey|credentials|headers|rawException|rawPayload)"[[:space:]]*:' then
    issue_code := 'unsafe_recovery_evidence';
    message := 'Recovery persistence rejected unsafe diagnostic or credential fields.';
    return next;
    return;
  end if;

  if exists (
       select 1
       from jsonb_array_elements(p_unsupported_compensations) as unsupported(value)
       where jsonb_typeof(value) <> 'object'
          or not (value ?& array['entityType', 'action', 'support', 'compensationAction', 'reason'])
          or exists (
            select 1 from jsonb_object_keys(value) as unsupported_key(key)
            where key not in ('entityType', 'action', 'support', 'compensationAction', 'reason')
          )
          or jsonb_typeof(value->'entityType') <> 'string'
          or jsonb_typeof(value->'action') <> 'string'
          or jsonb_typeof(value->'support') <> 'string'
          or jsonb_typeof(value->'reason') <> 'string'
          or jsonb_typeof(value->'compensationAction') not in ('string', 'null')
          or value->>'support' not in ('unsupported', 'conditionally_supported', 'supported')
     ) then
    issue_code := 'unsupported_compensation_evidence_invalid';
    message := 'Unsupported-compensation evidence does not match the normalized classification contract.';
    return next;
    return;
  end if;

  if exists (
       select 1
       from jsonb_array_elements(p_running_items_to_recover) as running(value)
       where jsonb_typeof(value) <> 'object'
          or not (value ?& array['executionItemKey', 'planItemKey', 'sequence', 'entityType', 'entityId', 'action', 'recoveryControl'])
          or exists (
            select 1 from jsonb_object_keys(value) as running_key(key)
            where key not in ('executionItemKey', 'planItemKey', 'sequence', 'entityType', 'entityId', 'action', 'recoveryControl')
          )
          or jsonb_typeof(value->'executionItemKey') <> 'string'
          or jsonb_typeof(value->'planItemKey') <> 'string'
          or jsonb_typeof(value->'entityType') <> 'string'
          or jsonb_typeof(value->'entityId') not in ('string', 'null')
          or jsonb_typeof(value->'action') <> 'string'
          or jsonb_typeof(value->'recoveryControl') <> 'string'
          or value->>'recoveryControl' <> 'cancel_or_reset_required'
          or jsonb_typeof(value->'sequence') <> 'number'
          or (value->>'sequence')::integer <= 0
     ) then
    issue_code := 'running_recovery_evidence_invalid';
    message := 'Running execution-control evidence does not match the RC10.9A contract.';
    return next;
    return;
  end if;

  if not (p_downstream ?& array[
       'failuresClassified', 'rollbackItemsPlanned', 'unsupportedCompensations',
       'runningItemsIdentified', 'rollbackExecuted', 'entitiesCompensated',
       'bindingsRemoved', 'sessionsRecovered', 'finalized'
     ])
     or exists (
       select 1 from jsonb_object_keys(p_downstream) as downstream_key(key)
       where key not in (
         'failuresClassified', 'rollbackItemsPlanned', 'unsupportedCompensations',
         'runningItemsIdentified', 'rollbackExecuted', 'entitiesCompensated',
         'bindingsRemoved', 'sessionsRecovered', 'finalized'
       )
     )
     or exists (
       select 1 from jsonb_each(p_downstream) as downstream_value(key, value)
       where jsonb_typeof(value) <> 'number'
     )
     or coalesce((p_downstream->>'failuresClassified')::integer, -1) <> 1
     or coalesce((p_downstream->>'rollbackExecuted')::integer, -1) <> 0
     or coalesce((p_downstream->>'entitiesCompensated')::integer, -1) <> 0
     or coalesce((p_downstream->>'bindingsRemoved')::integer, -1) <> 0
     or coalesce((p_downstream->>'sessionsRecovered')::integer, -1) <> 0
     or coalesce((p_downstream->>'finalized')::integer, -1) <> 0 then
    issue_code := 'planning_downstream_invalid';
    message := 'Recovery persistence accepts planning counters only; every execution counter must remain zero.';
    return next;
    return;
  end if;

  v_item_count := jsonb_array_length(p_rollback_items);
  v_reversible_count := 0;
  v_blocked_count := 0;

  if coalesce((p_downstream->>'rollbackItemsPlanned')::integer, -1) <> v_item_count
     or coalesce((p_downstream->>'unsupportedCompensations')::integer, -1) <> jsonb_array_length(p_unsupported_compensations)
     or coalesce((p_downstream->>'runningItemsIdentified')::integer, -1) <> jsonb_array_length(p_running_items_to_recover) then
    issue_code := 'planning_counter_mismatch';
    message := 'Planning counters must exactly match normalized recovery collections.';
    return next;
    return;
  end if;

  if exists (
       select 1
       from jsonb_array_elements(p_rollback_items) with ordinality as rollback_item(value, ordinal)
       where jsonb_typeof(value) <> 'object'
          or not (value ?& array[
            'rollbackItemKey', 'sourceExecutionItemKey', 'sourcePlanItemKey',
            'sourceSequence', 'rollbackSequence', 'entityType', 'entityId',
            'originalAction', 'compensationAction', 'compensationReason',
            'expectedCurrentState', 'expectedPriorState', 'reversible', 'blockedReason'
          ])
          or exists (
            select 1 from jsonb_object_keys(value) as item_key(key)
            where key not in (
              'rollbackItemKey', 'sourceExecutionItemKey', 'sourcePlanItemKey',
              'sourceSequence', 'rollbackSequence', 'entityType', 'entityId',
              'originalAction', 'compensationAction', 'compensationReason',
              'expectedCurrentState', 'expectedPriorState', 'reversible', 'blockedReason'
            )
          )
          or jsonb_typeof(value->'rollbackItemKey') <> 'string'
          or jsonb_typeof(value->'sourceExecutionItemKey') <> 'string'
          or jsonb_typeof(value->'sourcePlanItemKey') <> 'string'
          or jsonb_typeof(value->'entityType') <> 'string'
          or jsonb_typeof(value->'entityId') not in ('string', 'null')
          or jsonb_typeof(value->'originalAction') <> 'string'
          or jsonb_typeof(value->'compensationAction') not in ('string', 'null')
          or jsonb_typeof(value->'compensationReason') <> 'string'
          or jsonb_typeof(value->'blockedReason') not in ('string', 'null')
          or jsonb_typeof(value->'sourceSequence') <> 'number'
          or jsonb_typeof(value->'rollbackSequence') <> 'number'
          or jsonb_typeof(value->'reversible') <> 'boolean'
          or jsonb_typeof(value->'expectedCurrentState') <> 'object'
          or jsonb_typeof(value->'expectedPriorState') <> 'object'
          or (value->>'sourceSequence')::integer <= 0
          or (value->>'rollbackSequence')::integer <> ordinal::integer
          or coalesce(length(btrim(value->>'rollbackItemKey')), 0) = 0
          or coalesce(length(btrim(value->>'sourceExecutionItemKey')), 0) = 0
          or coalesce(length(btrim(value->>'sourcePlanItemKey')), 0) = 0
          or coalesce(length(btrim(value->>'entityType')), 0) = 0
          or coalesce(length(btrim(value->>'originalAction')), 0) = 0
          or coalesce(length(btrim(value->>'compensationReason')), 0) = 0
     ) then
    issue_code := 'rollback_item_shape_invalid';
    message := 'Rollback items must match the exact normalized RC10.9A item contract and authoritative array order.';
    return next;
    return;
  end if;

  if (select count(distinct value->>'rollbackItemKey') from jsonb_array_elements(p_rollback_items)) <> v_item_count
     or (select count(distinct value->>'sourceExecutionItemKey') from jsonb_array_elements(p_rollback_items)) <> v_item_count
     or (select count(distinct (value->>'sourceSequence')::integer) from jsonb_array_elements(p_rollback_items)) <> v_item_count
     or (select count(distinct (value->>'rollbackSequence')::integer) from jsonb_array_elements(p_rollback_items)) <> v_item_count then
    issue_code := 'rollback_item_identity_duplicate';
    message := 'Rollback item, source item, source sequence, and rollback sequence identities must be unique.';
    return next;
    return;
  end if;

  if exists (
       select 1
       from (
         select
           (value->>'sourceSequence')::integer as source_sequence,
           lag((value->>'sourceSequence')::integer) over (order by (value->>'rollbackSequence')::integer) as previous_source_sequence
         from jsonb_array_elements(p_rollback_items)
       ) ordered
       where previous_source_sequence is not null
         and previous_source_sequence <= source_sequence
     ) then
    issue_code := 'rollback_item_order_invalid';
    message := 'Source sequences must strictly descend as authoritative rollback sequence increases.';
    return next;
    return;
  end if;

  select
    count(*) filter (where (value->>'reversible')::boolean),
    count(*) filter (where not (value->>'reversible')::boolean or value->'blockedReason' <> 'null'::jsonb)
    into v_reversible_count, v_blocked_count
    from jsonb_array_elements(p_rollback_items);

  if p_reversible_mutation_count <> v_reversible_count then
    issue_code := 'reversible_counter_mismatch';
    message := 'The reversible mutation counter must match persisted rollback-item evidence.';
    return next;
    return;
  end if;

  if p_recovery_status = 'rollback_not_required'
     and (p_rollback_required or p_rollback_executable or v_item_count <> 0) then
    issue_code := 'rollback_not_required_inconsistent';
    message := 'rollback_not_required requires false rollback flags and zero rollback items.';
    return next;
    return;
  end if;

  if p_recovery_status = 'rollback_required'
     and not p_rollback_required then
    issue_code := 'rollback_required_flag_missing';
    message := 'rollback_required status requires rollback_required=true.';
    return next;
    return;
  end if;

  if p_recovery_status <> 'rollback_required' and p_rollback_required then
    issue_code := 'rollback_required_flag_invalid';
    message := 'Only rollback_required status may set rollback_required=true.';
    return next;
    return;
  end if;

  if p_rollback_executable
     and (
       not p_rollback_required
       or v_item_count = 0
       or v_reversible_count <> v_item_count
       or v_blocked_count <> 0
       or jsonb_array_length(p_unsupported_compensations) <> 0
     ) then
    issue_code := 'executable_rollback_inconsistent';
    message := 'Executable rollback requires one or more fully reversible items and no blocked or unsupported compensation.';
    return next;
    return;
  end if;

  if p_recovery_status = 'rollback_required'
     and not p_rollback_executable
     and v_item_count > 0
     and v_blocked_count = 0
     and jsonb_array_length(p_unsupported_compensations) = 0 then
    issue_code := 'non_executable_rollback_unexplained';
    message := 'A non-executable rollback plan requires structured blocked or unsupported compensation evidence.';
    return next;
    return;
  end if;

  if p_recovery_status in ('blocked', 'not_found')
     and (p_rollback_executable or (p_recovery_status = 'not_found' and v_item_count <> 0)) then
    issue_code := 'terminal_recovery_decision_inconsistent';
    message := 'Blocked and not-found decisions cannot be executable; not-found decisions contain no rollback items.';
    return next;
    return;
  end if;

  if exists (
       select 1
       from jsonb_array_elements(p_rollback_items) as hardware(value)
       where value->>'entityType' = 'hardware_binding'
         and (
           value->>'originalAction' <> 'bind'
           or not ((value->'expectedCurrentState') ?& array['hardwareId', 'targetId', 'targetType', 'targetDeploymentKey'])
           or not ((value->'expectedPriorState') ?& array['deploymentHardwareKey', 'hardwareId', 'targetId', 'targetType', 'targetDeploymentKey'])
           or (value->'expectedPriorState'->>'deploymentHardwareKey') !~ '^hardware-[0-9]{3}$'
           or (value->>'reversible')::boolean is not true
           or value->>'compensationAction' <> 'remove_deployment_hardware_binding'
           or value->'blockedReason' <> 'null'::jsonb
           or value->'expectedPriorState'->'targetId' <> 'null'::jsonb
           or jsonb_typeof(value->'expectedCurrentState'->'targetId') <> 'string'
           or (value->'expectedCurrentState'->>'targetId') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
           or jsonb_typeof(value->'expectedCurrentState'->'hardwareId') <> 'string'
           or (value->'expectedCurrentState'->>'hardwareId') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
           or value->'expectedCurrentState'->>'hardwareId' is distinct from value->>'entityId'
           or value->'expectedPriorState'->>'hardwareId' is distinct from value->>'entityId'
           or value->'expectedCurrentState'->>'targetType' not in ('workstation', 'sterilizer')
           or value->'expectedCurrentState'->>'targetType' is distinct from value->'expectedPriorState'->>'targetType'
           or value->'expectedCurrentState'->>'targetDeploymentKey' is distinct from value->'expectedPriorState'->>'targetDeploymentKey'
           or (
             value->'expectedCurrentState'->>'targetType' = 'workstation'
             and (value->'expectedCurrentState'->>'targetDeploymentKey') !~ '^workstation-[0-9]{3}$'
           )
           or (
             value->'expectedCurrentState'->>'targetType' = 'sterilizer'
             and (value->'expectedCurrentState'->>'targetDeploymentKey') !~ '^sterilizer-[0-9]{3}$'
           )
         )
     ) then
    issue_code := 'hardware_binding_rollback_identity_invalid';
    message := 'Executable Hardware Binding compensation requires exact newly-written and previously-unbound identity evidence.';
    return next;
    return;
  end if;

  select session_row.*
    into v_session
    from public.deployment_activation_execution_sessions session_row
    join public.deployment_runs run_row
      on run_row.id = session_row.deployment_run_record_id
     and run_row.deployment_run_id = p_deployment_run_key
     and run_row.clinic_id = p_clinic_id
   where session_row.id = p_session_id
     and session_row.clinic_id = p_clinic_id
     and session_row.deployment_run_key = p_deployment_run_key
     and session_row.execution_key = p_execution_key
     and session_row.plan_key = p_plan_key
   for share of session_row;

  if not found then
    persistence_status := 'not_found';
    issue_code := 'recovery_source_execution_not_found';
    message := 'Exact deployment run and execution-session recovery source evidence was not found.';
    return next;
    return;
  end if;

  select plan_row.*
    into v_existing
    from public.deployment_recovery_plans plan_row
   where plan_row.recovery_key = p_recovery_key
      or (
        plan_row.clinic_id = p_clinic_id
        and plan_row.deployment_run_key = p_deployment_run_key
        and plan_row.idempotency_key = p_idempotency_key
      )
      or (
        plan_row.clinic_id = p_clinic_id
        and plan_row.deployment_run_key = p_deployment_run_key
        and plan_row.execution_key = p_execution_key
        and plan_row.payload_hash = p_payload_hash
      )
   order by plan_row.created_at
   limit 1
   for update;

  if found then
    recovery_plan_id := v_existing.id;
    recovery_key := v_existing.recovery_key;
    recovery_status := v_existing.recovery_status;
    rollback_required := v_existing.rollback_required;
    rollback_executable := v_existing.rollback_executable;
    persisted_at := v_existing.created_at;
    if v_existing.clinic_id = p_clinic_id
       and v_existing.deployment_run_key = p_deployment_run_key
       and v_existing.session_id = p_session_id
       and v_existing.execution_key = p_execution_key
       and v_existing.plan_key = p_plan_key
       and v_existing.recovery_key = p_recovery_key
       and v_existing.idempotency_key = p_idempotency_key
       and v_existing.payload_hash = p_payload_hash then
      persistence_status := 'reused';
      rollback_items_reused := (select count(*) from public.deployment_recovery_plan_items item_row where item_row.recovery_plan_id = v_existing.id);
      message := 'Compatible immutable recovery decision and rollback-plan evidence was reused.';
    else
      persistence_status := 'conflict';
      issue_code := 'recovery_plan_identity_conflict';
      message := 'Stable recovery, idempotency, or payload identity already belongs to incompatible immutable evidence.';
    end if;
    return next;
    return;
  end if;

  v_failure_code := p_sanitized_failure->>'failureCode';
  v_failure_layer := p_sanitized_failure->>'failureLayer';
  v_failed_at := (p_sanitized_failure->>'failedAt')::timestamptz;
  v_failed_execution_item_key := nullif(p_sanitized_failure->>'failedExecutionItemKey', '');
  v_failed_plan_item_key := nullif(p_sanitized_failure->>'failedPlanItemKey', '');
  v_failed_sequence := nullif(p_sanitized_failure->>'failedSequence', '')::integer;
  v_failed_entity_type := nullif(p_sanitized_failure->>'failedEntityType', '');
  v_failed_entity_id := nullif(p_sanitized_failure->>'failedEntityId', '');
  v_failed_action := nullif(p_sanitized_failure->>'failedAction', '');
  v_retryable := (p_sanitized_failure->>'retryable')::boolean;
  v_created_at := clock_timestamp();

  insert into public.deployment_recovery_plans (
    clinic_id, deployment_run_key, session_id, execution_key, plan_key,
    recovery_key, idempotency_key, payload_hash, recovery_status,
    rollback_required, rollback_executable, failure_code, failure_layer,
    failed_at, failed_execution_item_key, failed_plan_item_key, failed_sequence,
    failed_entity_type, failed_entity_id, failed_action, retryable,
    sanitized_failure, unsupported_compensations, running_items_to_recover,
    completed_mutation_count, reversible_mutation_count, downstream, evidence,
    created_at, updated_at
  ) values (
    p_clinic_id, p_deployment_run_key, p_session_id, p_execution_key, p_plan_key,
    p_recovery_key, p_idempotency_key, p_payload_hash, p_recovery_status,
    p_rollback_required, p_rollback_executable, v_failure_code, v_failure_layer,
    v_failed_at, v_failed_execution_item_key, v_failed_plan_item_key, v_failed_sequence,
    v_failed_entity_type, v_failed_entity_id, v_failed_action, v_retryable,
    p_sanitized_failure, p_unsupported_compensations, p_running_items_to_recover,
    p_completed_mutation_count, p_reversible_mutation_count, p_downstream, p_evidence,
    v_created_at, v_created_at
  ) returning id into v_plan_id;

  for v_item in
    select value
    from jsonb_array_elements(p_rollback_items) with ordinality as ordered(value, ordinal)
    order by ordinal
  loop
    insert into public.deployment_recovery_plan_items (
      recovery_plan_id, clinic_id, deployment_run_key, session_id, execution_key,
      plan_key, rollback_item_key, source_execution_item_key, source_plan_item_key,
      source_sequence, rollback_sequence, entity_type, entity_id, original_action,
      compensation_action, compensation_reason, expected_current_state,
      expected_prior_state, reversible, blocked_reason, status, evidence,
      created_at, updated_at
    ) values (
      v_plan_id, p_clinic_id, p_deployment_run_key, p_session_id, p_execution_key,
      p_plan_key, v_item->>'rollbackItemKey', v_item->>'sourceExecutionItemKey',
      v_item->>'sourcePlanItemKey', (v_item->>'sourceSequence')::integer,
      (v_item->>'rollbackSequence')::integer, v_item->>'entityType',
      nullif(v_item->>'entityId', ''), v_item->>'originalAction',
      nullif(v_item->>'compensationAction', ''), v_item->>'compensationReason',
      v_item->'expectedCurrentState', v_item->'expectedPriorState',
      (v_item->>'reversible')::boolean, nullif(v_item->>'blockedReason', ''),
      case
        when (v_item->>'reversible')::boolean
         and v_item->'compensationAction' <> 'null'::jsonb
         and v_item->'blockedReason' = 'null'::jsonb then 'planned'
        else 'blocked'
      end,
      jsonb_build_object(
        'planningOnly', true,
        'newlyWritten', case when v_item->>'entityType' = 'hardware_binding' then true else null end,
        'reused', false
      ),
      v_created_at, v_created_at
    );
    rollback_items_persisted := rollback_items_persisted + 1;
  end loop;

  persistence_status := 'created';
  recovery_plan_id := v_plan_id;
  recovery_key := p_recovery_key;
  recovery_status := p_recovery_status;
  rollback_required := p_rollback_required;
  rollback_executable := p_rollback_executable;
  persisted_at := v_created_at;
  message := 'Immutable recovery decision and deterministic rollback plan were persisted atomically.';
  return next;
  return;
exception
  when unique_violation then
    select plan_row.*
      into v_existing
      from public.deployment_recovery_plans plan_row
     where plan_row.recovery_key = p_recovery_key
        or (
          plan_row.clinic_id = p_clinic_id
          and plan_row.deployment_run_key = p_deployment_run_key
          and plan_row.idempotency_key = p_idempotency_key
        )
        or (
          plan_row.clinic_id = p_clinic_id
          and plan_row.deployment_run_key = p_deployment_run_key
          and plan_row.execution_key = p_execution_key
          and plan_row.payload_hash = p_payload_hash
        )
     order by plan_row.created_at
     limit 1;

    recovery_plan_id := v_existing.id;
    recovery_key := coalesce(v_existing.recovery_key, p_recovery_key);
    recovery_status := coalesce(v_existing.recovery_status, p_recovery_status);
    rollback_required := coalesce(v_existing.rollback_required, p_rollback_required, false);
    rollback_executable := coalesce(v_existing.rollback_executable, p_rollback_executable, false);
    rollback_items_persisted := 0;
    persisted_at := v_existing.created_at;
    if found
       and v_existing.clinic_id = p_clinic_id
       and v_existing.deployment_run_key = p_deployment_run_key
       and v_existing.session_id = p_session_id
       and v_existing.execution_key = p_execution_key
       and v_existing.plan_key = p_plan_key
       and v_existing.recovery_key = p_recovery_key
       and v_existing.idempotency_key = p_idempotency_key
       and v_existing.payload_hash = p_payload_hash then
      persistence_status := 'reused';
      rollback_items_reused := (select count(*) from public.deployment_recovery_plan_items item_row where item_row.recovery_plan_id = v_existing.id);
      issue_code := null;
      message := 'Compatible immutable recovery evidence was reused after a concurrent persistence attempt.';
    else
      persistence_status := 'conflict';
      rollback_items_reused := 0;
      issue_code := 'recovery_plan_identity_conflict';
      message := 'Concurrent persistence found incompatible immutable recovery evidence.';
    end if;
    return next;
    return;
  when others then
    persistence_status := 'error';
    recovery_plan_id := null;
    rollback_items_persisted := 0;
    rollback_items_reused := 0;
    issue_code := 'recovery_plan_persistence_error';
    message := 'Recovery-plan persistence failed atomically; no partial recovery plan was retained.';
    persisted_at := null;
    return next;
    return;
end;
$_$;;

CREATE FUNCTION public.progress_deployment_activation_execution_dependency(p_clinic_id uuid, p_deployment_run_key text, p_session_id uuid, p_execution_key text, p_claimant_id text, p_ownership_token text, p_expected_lease_expires_at timestamp with time zone, p_completed_item_id uuid, p_completed_execution_item_key text, p_completed_plan_item_key text, p_completed_sequence integer, p_completed_started_at timestamp with time zone, p_completed_completed_at timestamp with time zone, p_completed_attempt_count integer, p_next_item_id uuid, p_next_execution_item_key text, p_next_plan_item_key text, p_next_sequence integer, p_next_entity_type text, p_next_entity_id text, p_next_action text, p_expected_next_status text, p_expected_next_attempt_count integer, p_expected_dependency_keys text[], p_progressed_at timestamp with time zone) RETURNS TABLE(status text, clinic_id uuid, deployment_run_key text, session_id uuid, execution_key text, completed_item_id uuid, completed_execution_item_key text, completed_plan_item_key text, completed_sequence integer, next_item_id uuid, next_execution_item_key text, next_plan_item_key text, next_sequence integer, next_entity_type text, next_entity_id text, next_action text, next_status_before text, next_status_after text, issue_code text, message text)
    LANGUAGE plpgsql
    VOLATILE
    SECURITY INVOKER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
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
$$;;

CREATE FUNCTION public.start_deployment_activation_execution_item(p_clinic_id uuid, p_deployment_run_key text, p_session_id uuid, p_execution_key text, p_claimant_id text, p_ownership_token text, p_expected_lease_expires_at timestamp with time zone, p_item_id uuid, p_execution_item_key text, p_plan_item_key text, p_expected_sequence integer, p_expected_action text, p_expected_entity_type text, p_expected_entity_key text, p_proposed_started_at timestamp with time zone, p_expected_attempt_count integer) RETURNS TABLE(status text, session_id uuid, execution_key text, item_id uuid, execution_item_key text, plan_item_key text, sequence integer, action text, entity_type text, entity_key text, execution_status text, attempt_count integer, started_at timestamp with time zone, lease_expires_at timestamp with time zone, issue_code text, message text)
    LANGUAGE plpgsql
    VOLATILE
    SECURITY INVOKER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
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
$$;;

CREATE FUNCTION public.start_deployment_activation_execution_next_item(p_clinic_id uuid, p_deployment_run_key text, p_session_id uuid, p_execution_key text, p_claimant_id text, p_ownership_token text, p_expected_lease_expires_at timestamp with time zone, p_item_id uuid, p_execution_item_key text, p_plan_item_key text, p_expected_sequence integer, p_expected_entity_type text, p_expected_entity_id text, p_expected_action text, p_expected_attempt_count integer, p_expected_dependency_keys text[], p_proposed_started_at timestamp with time zone) RETURNS TABLE(status text, clinic_id uuid, deployment_run_key text, session_id uuid, execution_key text, item_id uuid, execution_item_key text, plan_item_key text, sequence integer, entity_type text, entity_id text, action text, attempt_count integer, started_at timestamp with time zone, lease_expires_at timestamp with time zone, issue_code text, message text)
    LANGUAGE plpgsql
    VOLATILE
    SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
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
$$;;

CREATE FUNCTION public.start_deployment_activation_execution_session(p_clinic_id uuid, p_deployment_run_key text, p_session_id uuid, p_execution_key text, p_claimant_id text, p_ownership_token text, p_expected_lease_expires_at timestamp with time zone, p_proposed_started_at timestamp with time zone, p_expected_item_count integer) RETURNS TABLE(status text, session_id uuid, execution_key text, execution_owner text, lease_expires_at timestamp with time zone, execution_status text, started_at timestamp with time zone, item_count integer, issue_code text, message text)
    LANGUAGE plpgsql
    VOLATILE
    SECURITY INVOKER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
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
$$;;
