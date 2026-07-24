/*
 * SteriSphere Authoritative Baseline
 * Architecture Freeze Version: 1.0.0
 * Architecture Freeze Manifest SHA-256:
 * 0B0B1B157035F12AB210ECBD1DC6B7E55FF6DAFFDF652966ACB0396E66963619
 * Architecture Input Commit: 2373ad80d6a86510acde0010ea1bfb1f82d0fe02
 * Freeze Artifact Commit: 12b6b7e2729d95f47c77cb04e1db87130a05adc9
 * Owner Resolution SHA-256: D0CE3D8910EBAA73AF87FD3903851D1207969764473281D5D14715120F26CB1B
 * Production Capture Reference: .tmp/schema-captures/20260723T031930Z/
 * File Role: Primary, foreign, unique, check, and lifecycle constraints
 *
 * THIS FILE IS GENERATED FROM THE LOCKED ARCHITECTURE FREEZE.
 * DO NOT EDIT MANUALLY.
 * REGENERATE THROUGH THE APPROVED BASELINE PROCESS.
 *
 * GENERATED ARTIFACT FOR REVIEW ONLY. EXECUTION IS NOT AUTHORIZED.
 */

ALTER TABLE public.audit_logs
  ADD CONSTRAINT audit_logs_actor_user_id_fkey FOREIGN KEY (actor_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.audit_logs
  ADD CONSTRAINT audit_logs_clinic_id_fkey FOREIGN KEY (clinic_id) REFERENCES public.clinics(id) ON DELETE RESTRICT;

ALTER TABLE public.audit_logs
  ADD CONSTRAINT audit_logs_pkey PRIMARY KEY (id);

ALTER TABLE public.audit_logs
  ADD CONSTRAINT audit_logs_scope_check CHECK ((scope = 'clinic'::text AND clinic_id IS NOT NULL) OR (scope = ANY (ARRAY['global'::text, 'system'::text]) AND clinic_id IS NULL));

ALTER TABLE public.clinic_memberships
  ADD CONSTRAINT clinic_memberships_activated_by_fkey FOREIGN KEY (activated_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.clinic_memberships
  ADD CONSTRAINT clinic_memberships_clinic_id_fkey FOREIGN KEY (clinic_id) REFERENCES public.clinics(id) ON DELETE RESTRICT;

ALTER TABLE public.clinic_memberships
  ADD CONSTRAINT clinic_memberships_clinic_user_key UNIQUE (clinic_id, user_id);

ALTER TABLE public.clinic_memberships
  ADD CONSTRAINT clinic_memberships_invited_by_fkey FOREIGN KEY (invited_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.clinic_memberships
  ADD CONSTRAINT clinic_memberships_lifecycle_check CHECK ((status = 'invited'::text AND accepted_at IS NULL AND revoked_at IS NULL) OR (status = 'active'::text AND accepted_at IS NOT NULL AND activated_at IS NOT NULL AND revoked_at IS NULL) OR (status = 'suspended'::text AND suspended_at IS NOT NULL AND revoked_at IS NULL) OR (status = 'revoked'::text AND revoked_at IS NOT NULL));

ALTER TABLE public.clinic_memberships
  ADD CONSTRAINT clinic_memberships_pkey PRIMARY KEY (id);

ALTER TABLE public.clinic_memberships
  ADD CONSTRAINT clinic_memberships_revoked_by_fkey FOREIGN KEY (revoked_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.clinic_memberships
  ADD CONSTRAINT clinic_memberships_role_check CHECK (role = ANY (ARRAY['admin'::text, 'clinical_staff'::text, 'doctor'::text, 'auditor'::text]));

ALTER TABLE public.clinic_memberships
  ADD CONSTRAINT clinic_memberships_status_check CHECK (status = ANY (ARRAY['invited'::text, 'active'::text, 'suspended'::text, 'revoked'::text]));

ALTER TABLE public.clinic_memberships
  ADD CONSTRAINT clinic_memberships_suspended_by_fkey FOREIGN KEY (suspended_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.clinic_memberships
  ADD CONSTRAINT clinic_memberships_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.clinic_settings
  ADD CONSTRAINT clinic_settings_clinic_id_fkey FOREIGN KEY (clinic_id) REFERENCES public.clinics(id) ON DELETE RESTRICT;

ALTER TABLE public.clinic_settings
  ADD CONSTRAINT clinic_settings_pkey PRIMARY KEY (id);

ALTER TABLE public.clinic_settings
  ADD CONSTRAINT clinic_settings_printer_connection_type_check CHECK ((printer_connection_type = ANY (ARRAY['wifi'::text, 'ethernet'::text, 'usb'::text])));

ALTER TABLE public.clinic_settings
  ADD CONSTRAINT clinic_settings_printer_model_check CHECK ((printer_model = ANY (ARRAY['brother_ql_820nwb'::text, 'brother_td_4550dnwb'::text, 'zywell_zy_series'::text, 'custom'::text])));

ALTER TABLE public.clinical_agents
  ADD CONSTRAINT clinical_agents_agent_url_check CHECK (((agent_url IS NULL) OR (agent_url ~* '^https?://'::text)));

ALTER TABLE public.clinical_agents
  ADD CONSTRAINT clinical_agents_assigned_workstation_id_fkey FOREIGN KEY (assigned_workstation_id) REFERENCES public.clinical_workstations(id) ON DELETE SET NULL;

ALTER TABLE public.clinical_agents
  ADD CONSTRAINT clinical_agents_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.clinical_agents
  ADD CONSTRAINT clinical_agents_heartbeat_interval_positive CHECK (((heartbeat_interval_seconds IS NULL) OR (heartbeat_interval_seconds > 0)));

ALTER TABLE public.clinical_agents
  ADD CONSTRAINT clinical_agents_heartbeat_timeout_valid CHECK (((heartbeat_timeout_seconds IS NULL) OR (heartbeat_interval_seconds IS NULL) OR (heartbeat_timeout_seconds >= heartbeat_interval_seconds)));

ALTER TABLE public.clinical_agents
  ADD CONSTRAINT clinical_agents_pkey PRIMARY KEY (id);

ALTER TABLE public.clinical_agents
  ADD CONSTRAINT clinical_agents_status_check CHECK ((status = ANY (ARRAY['planned'::text, 'registered'::text, 'online'::text, 'offline'::text, 'needs_attention'::text, 'retired'::text])));

ALTER TABLE public.clinical_agents
  ADD CONSTRAINT clinical_agents_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.clinical_hardware_devices
  ADD CONSTRAINT clinical_hardware_devices_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES public.clinical_agents(id) ON DELETE SET NULL;

ALTER TABLE public.clinical_hardware_devices
  ADD CONSTRAINT clinical_hardware_devices_current_sterilizer_id_fkey FOREIGN KEY (current_sterilizer_id) REFERENCES public.sterilizers(id) ON DELETE SET NULL;

ALTER TABLE public.clinical_hardware_devices
  ADD CONSTRAINT clinical_hardware_devices_current_workstation_id_fkey FOREIGN KEY (current_workstation_id) REFERENCES public.clinical_workstations(id) ON DELETE SET NULL;

ALTER TABLE public.clinical_hardware_devices
  ADD CONSTRAINT clinical_hardware_devices_default_sterilizer_id_fkey FOREIGN KEY (default_sterilizer_id) REFERENCES public.sterilizers(id) ON DELETE SET NULL;

ALTER TABLE public.clinical_hardware_devices
  ADD CONSTRAINT clinical_hardware_devices_default_workstation_id_fkey FOREIGN KEY (default_workstation_id) REFERENCES public.clinical_workstations(id) ON DELETE SET NULL;

ALTER TABLE public.clinical_hardware_devices
  ADD CONSTRAINT clinical_hardware_devices_device_type_check CHECK ((device_type = ANY (ARRAY['printer'::text, 'usb_scanner'::text, 'camera'::text, 'speaker'::text, 'sterilizer'::text, 'environment_sensor'::text, 'rfid_reader'::text, 'nfc_reader'::text, 'future_custom'::text])));

ALTER TABLE public.clinical_hardware_devices
  ADD CONSTRAINT clinical_hardware_devices_display_order_check CHECK (((display_order IS NULL) OR (display_order > 0)));

ALTER TABLE public.clinical_hardware_devices
  ADD CONSTRAINT clinical_hardware_devices_health_check CHECK ((health = ANY (ARRAY['unknown'::text, 'healthy'::text, 'warning'::text, 'error'::text, 'offline'::text])));

ALTER TABLE public.clinical_hardware_devices
  ADD CONSTRAINT clinical_hardware_devices_pkey PRIMARY KEY (id);

ALTER TABLE public.clinical_hardware_devices
  ADD CONSTRAINT clinical_hardware_devices_provisioning_status_check CHECK (((provisioning_status IS NULL) OR (provisioning_status = ANY (ARRAY['planned'::text, 'active'::text, 'archived'::text]))));

ALTER TABLE public.clinical_hardware_devices
  ADD CONSTRAINT clinical_hardware_devices_single_binding_family_check CHECK ((NOT (((default_workstation_id IS NOT NULL) OR (current_workstation_id IS NOT NULL)) AND ((default_sterilizer_id IS NOT NULL) OR (current_sterilizer_id IS NOT NULL)))));

ALTER TABLE public.clinical_hardware_devices
  ADD CONSTRAINT clinical_hardware_devices_status_check CHECK ((status = ANY (ARRAY['discovered'::text, 'registered'::text, 'assigned'::text, 'active'::text, 'maintenance'::text, 'retired'::text, 'offline'::text, 'needs_attention'::text])));

ALTER TABLE public.clinical_workstations
  ADD CONSTRAINT clinical_workstations_agent_url_check CHECK (((agent_url IS NULL) OR (agent_url ~* '^https?://'::text)));

ALTER TABLE public.clinical_workstations
  ADD CONSTRAINT clinical_workstations_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.clinical_workstations
  ADD CONSTRAINT clinical_workstations_pkey PRIMARY KEY (id);

ALTER TABLE public.clinical_workstations
  ADD CONSTRAINT clinical_workstations_provisioning_status_check CHECK ((provisioning_status = ANY (ARRAY['planned'::text, 'active'::text, 'archived'::text])));

ALTER TABLE public.clinical_workstations
  ADD CONSTRAINT clinical_workstations_status_check CHECK ((status = ANY (ARRAY['planned'::text, 'active'::text, 'inactive'::text, 'needs_attention'::text])));

ALTER TABLE public.clinical_workstations
  ADD CONSTRAINT clinical_workstations_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.clinical_workstations
  ADD CONSTRAINT clinical_workstations_workstation_type_check CHECK ((workstation_type = ANY (ARRAY['reception'::text, 'sterilization'::text, 'operatory'::text, 'admin'::text, 'other'::text])));

ALTER TABLE public.clinics
  ADD CONSTRAINT clinics_clinic_code_key UNIQUE (clinic_code);

ALTER TABLE public.clinics
  ADD CONSTRAINT clinics_clinic_code_non_empty_check CHECK ((length(TRIM(BOTH FROM clinic_code)) > 0));

ALTER TABLE public.clinics
  ADD CONSTRAINT clinics_deployment_status_check CHECK ((deployment_status = ANY (ARRAY['draft'::text, 'deploying'::text, 'deployed'::text, 'failed'::text, 'archived'::text])));

ALTER TABLE public.clinics
  ADD CONSTRAINT clinics_name_non_empty_check CHECK ((length(TRIM(BOTH FROM name)) > 0));

ALTER TABLE public.clinics
  ADD CONSTRAINT clinics_pkey PRIMARY KEY (id);

ALTER TABLE public.cycles
  ADD CONSTRAINT cycles_clinic_id_fkey FOREIGN KEY (clinic_id) REFERENCES public.clinics(id) ON DELETE RESTRICT;

ALTER TABLE public.cycles
  ADD CONSTRAINT cycles_clinic_id_id_key UNIQUE (clinic_id, id);

ALTER TABLE public.cycles
  ADD CONSTRAINT cycles_investigation_root_cause_check CHECK ((investigation_root_cause = ANY (ARRAY['Operator Error'::text, 'Packaging Issue'::text, 'Sterilizer Malfunction'::text, 'Chemical Indicator Failure'::text, 'Biological Indicator Failure'::text, 'Maintenance Issue'::text, 'Load Configuration Issue'::text, 'Unknown / Under Investigation'::text])));

ALTER TABLE public.cycles
  ADD CONSTRAINT cycles_investigation_status_check CHECK ((investigation_status = ANY (ARRAY['Open'::text, 'In Review'::text, 'Closed'::text])));

ALTER TABLE public.cycles
  ADD CONSTRAINT cycles_pkey PRIMARY KEY (id);

ALTER TABLE public.deployment_activation_execution_items
  ADD CONSTRAINT deployment_activation_execution_items_action_check CHECK ((action = ANY (ARRAY['activate'::text, 'link'::text, 'bind'::text, 'finalize'::text, 'no_op'::text])));

ALTER TABLE public.deployment_activation_execution_items
  ADD CONSTRAINT deployment_activation_execution_items_clinic_fk FOREIGN KEY (clinic_id) REFERENCES public.clinics(id) ON DELETE RESTRICT;

ALTER TABLE public.deployment_activation_execution_items
  ADD CONSTRAINT deployment_activation_execution_items_pkey PRIMARY KEY (id);

ALTER TABLE public.deployment_activation_execution_items
  ADD CONSTRAINT deployment_activation_execution_items_prepared_shape_check CHECK (((execution_status <> ALL (ARRAY['ready'::text, 'pending'::text])) OR ((attempt_count = 0) AND (started_at IS NULL) AND (completed_at IS NULL) AND (rolled_back_at IS NULL) AND (error_code IS NULL) AND (error_message IS NULL))));

ALTER TABLE public.deployment_activation_execution_items
  ADD CONSTRAINT deployment_activation_execution_items_reversible_rollback_check CHECK (((reversible AND (rollback_action IS NOT NULL) AND (rollback_status <> 'not_supported'::text)) OR (NOT reversible)));

ALTER TABLE public.deployment_activation_execution_items
  ADD CONSTRAINT deployment_activation_execution_items_rollback_status_check CHECK ((rollback_status = ANY (ARRAY['not_started'::text, 'not_supported'::text, 'pending'::text, 'completed'::text, 'failed'::text])));

ALTER TABLE public.deployment_activation_execution_items
  ADD CONSTRAINT deployment_activation_execution_items_run_fk FOREIGN KEY (deployment_run_record_id) REFERENCES public.deployment_runs(id) ON DELETE RESTRICT;

ALTER TABLE public.deployment_activation_execution_items
  ADD CONSTRAINT deployment_activation_execution_items_session_fk FOREIGN KEY (session_id) REFERENCES public.deployment_activation_execution_sessions(id) ON DELETE RESTRICT;

ALTER TABLE public.deployment_activation_execution_items
  ADD CONSTRAINT deployment_activation_execution_items_shape_check CHECK (((sequence > 0) AND ((dependency_level IS NULL) OR (dependency_level >= 0)) AND (attempt_count >= 0) AND (jsonb_typeof(expected_current_state) = 'object'::text) AND (jsonb_typeof(target_state) = 'object'::text) AND (jsonb_typeof(dependency_keys) = 'array'::text) AND (jsonb_typeof(execution_evidence) = 'object'::text)));

ALTER TABLE public.deployment_activation_execution_items
  ADD CONSTRAINT deployment_activation_execution_items_status_check CHECK ((execution_status = ANY (ARRAY['ready'::text, 'pending'::text, 'running'::text, 'succeeded'::text, 'failed'::text, 'skipped'::text, 'rollback_pending'::text, 'rolled_back'::text])));

ALTER TABLE public.deployment_activation_execution_sessions
  ADD CONSTRAINT deployment_activation_execution_sessions_clinic_fk FOREIGN KEY (clinic_id) REFERENCES public.clinics(id) ON DELETE RESTRICT;

ALTER TABLE public.deployment_activation_execution_sessions
  ADD CONSTRAINT deployment_activation_execution_sessions_counter_check CHECK (((items_requested >= 0) AND (items_ready >= 0) AND (items_pending >= 0) AND (items_blocked >= 0) AND (reversible_items >= 0) AND (irreversible_items >= 0) AND (blockers >= 0) AND (warnings >= 0) AND (((items_ready + items_pending) + items_blocked) = items_requested) AND ((reversible_items + irreversible_items) = items_requested)));

ALTER TABLE public.deployment_activation_execution_sessions
  ADD CONSTRAINT deployment_activation_execution_sessions_execution_status_check CHECK ((execution_status = ANY (ARRAY['prepared'::text, 'claimed'::text, 'running'::text, 'partially_completed'::text, 'completed'::text, 'failed'::text, 'rollback_required'::text, 'rolling_back'::text, 'rolled_back'::text, 'cancelled'::text])));

ALTER TABLE public.deployment_activation_execution_sessions
  ADD CONSTRAINT deployment_activation_execution_sessions_json_shape_check CHECK (((jsonb_typeof(rollback_boundary) = 'object'::text) AND (jsonb_typeof(preparation_evidence) = 'object'::text) AND (jsonb_typeof(execution_metadata) = 'object'::text)));

ALTER TABLE public.deployment_activation_execution_sessions
  ADD CONSTRAINT deployment_activation_execution_sessions_ownership_shape_check CHECK ((((execution_status = 'prepared'::text) AND (execution_owner IS NULL) AND (ownership_token IS NULL) AND (lease_expires_at IS NULL)) OR ((execution_status = 'claimed'::text) AND (execution_owner IS NOT NULL) AND (length(btrim(execution_owner)) > 0) AND (ownership_token IS NOT NULL) AND (length(btrim(ownership_token)) > 0) AND (lease_expires_at IS NOT NULL) AND (started_at IS NULL) AND (completed_at IS NULL) AND (failed_at IS NULL)) OR (execution_status = ANY (ARRAY['running'::text, 'partially_completed'::text, 'completed'::text, 'failed'::text, 'rollback_required'::text, 'rolling_back'::text, 'rolled_back'::text, 'cancelled'::text]))));

ALTER TABLE public.deployment_activation_execution_sessions
  ADD CONSTRAINT deployment_activation_execution_sessions_pkey PRIMARY KEY (id);

ALTER TABLE public.deployment_activation_execution_sessions
  ADD CONSTRAINT deployment_activation_execution_sessions_preparation_status_che CHECK ((preparation_status = 'ready'::text));

ALTER TABLE public.deployment_activation_execution_sessions
  ADD CONSTRAINT deployment_activation_execution_sessions_prepared_shape_check CHECK (((execution_status <> 'prepared'::text) OR ((preparation_status = 'ready'::text) AND (execution_owner IS NULL) AND (ownership_token IS NULL) AND (lease_expires_at IS NULL) AND (started_at IS NULL) AND (completed_at IS NULL) AND (failed_at IS NULL) AND (blockers = 0) AND (items_blocked = 0))));

ALTER TABLE public.deployment_activation_execution_sessions
  ADD CONSTRAINT deployment_activation_execution_sessions_run_fk FOREIGN KEY (deployment_run_record_id) REFERENCES public.deployment_runs(id) ON DELETE RESTRICT;

ALTER TABLE public.deployment_hardware_assignments
  ADD CONSTRAINT deployment_hardware_assignments_assignment_key_non_empty_check CHECK ((length(TRIM(BOTH FROM assignment_key)) > 0));

ALTER TABLE public.deployment_hardware_assignments
  ADD CONSTRAINT deployment_hardware_assignments_assignment_source_check CHECK ((assignment_source = 'setup_draft'::text));

ALTER TABLE public.deployment_hardware_assignments
  ADD CONSTRAINT deployment_hardware_assignments_assignment_status_check CHECK ((assignment_status = ANY (ARRAY['planned'::text, 'active'::text, 'archived'::text])));

ALTER TABLE public.deployment_hardware_assignments
  ADD CONSTRAINT deployment_hardware_assignments_clinic_id_fkey FOREIGN KEY (clinic_id) REFERENCES public.clinics(id) ON DELETE RESTRICT;

ALTER TABLE public.deployment_hardware_assignments
  ADD CONSTRAINT deployment_hardware_assignments_deployment_hardware_key_non_emp CHECK ((length(TRIM(BOTH FROM deployment_hardware_key)) > 0));

ALTER TABLE public.deployment_hardware_assignments
  ADD CONSTRAINT deployment_hardware_assignments_display_order_positive_check CHECK (((display_order IS NULL) OR (display_order > 0)));

ALTER TABLE public.deployment_hardware_assignments
  ADD CONSTRAINT deployment_hardware_assignments_pkey PRIMARY KEY (id);

ALTER TABLE public.deployment_hardware_assignments
  ADD CONSTRAINT deployment_hardware_assignments_target_key_shape_check CHECK ((((target_type = 'unassigned'::text) AND (target_deployment_key IS NULL)) OR ((target_type = ANY (ARRAY['workstation'::text, 'sterilizer'::text])) AND (target_deployment_key IS NOT NULL) AND (length(TRIM(BOTH FROM target_deployment_key)) > 0))));

ALTER TABLE public.deployment_hardware_assignments
  ADD CONSTRAINT deployment_hardware_assignments_target_type_check CHECK ((target_type = ANY (ARRAY['workstation'::text, 'sterilizer'::text, 'unassigned'::text])));

ALTER TABLE public.deployment_recovery_plan_items
  ADD CONSTRAINT deployment_recovery_plan_items_clinic_fk FOREIGN KEY (clinic_id) REFERENCES public.clinics(id) ON DELETE RESTRICT;

ALTER TABLE public.deployment_recovery_plan_items
  ADD CONSTRAINT deployment_recovery_plan_items_identity_check CHECK (((length(btrim(deployment_run_key)) > 0) AND (length(btrim(execution_key)) > 0) AND (length(btrim(plan_key)) > 0) AND (length(btrim(rollback_item_key)) > 0) AND (length(btrim(source_execution_item_key)) > 0) AND (length(btrim(source_plan_item_key)) > 0) AND (length(btrim(entity_type)) > 0) AND (length(btrim(original_action)) > 0) AND (length(btrim(compensation_reason)) > 0) AND (source_sequence > 0) AND (rollback_sequence > 0)));

ALTER TABLE public.deployment_recovery_plan_items
  ADD CONSTRAINT deployment_recovery_plan_items_json_shape_check CHECK (((jsonb_typeof(expected_current_state) = 'object'::text) AND (jsonb_typeof(expected_prior_state) = 'object'::text) AND (jsonb_typeof(evidence) = 'object'::text)));

ALTER TABLE public.deployment_recovery_plan_items
  ADD CONSTRAINT deployment_recovery_plan_items_pkey PRIMARY KEY (id);

ALTER TABLE public.deployment_recovery_plan_items
  ADD CONSTRAINT deployment_recovery_plan_items_plan_fk FOREIGN KEY (recovery_plan_id) REFERENCES public.deployment_recovery_plans(id) ON DELETE RESTRICT;

ALTER TABLE public.deployment_recovery_plan_items
  ADD CONSTRAINT deployment_recovery_plan_items_planning_shape_check CHECK ((((status = 'planned'::text) AND reversible AND (compensation_action IS NOT NULL) AND (length(btrim(compensation_action)) > 0) AND (blocked_reason IS NULL)) OR ((status = 'blocked'::text) AND ((NOT reversible) OR (compensation_action IS NULL) OR (blocked_reason IS NOT NULL)))));

ALTER TABLE public.deployment_recovery_plan_items
  ADD CONSTRAINT deployment_recovery_plan_items_session_fk FOREIGN KEY (session_id) REFERENCES public.deployment_activation_execution_sessions(id) ON DELETE RESTRICT;

ALTER TABLE public.deployment_recovery_plan_items
  ADD CONSTRAINT deployment_recovery_plan_items_status_check CHECK ((status = ANY (ARRAY['planned'::text, 'blocked'::text])));

ALTER TABLE public.deployment_recovery_plans
  ADD CONSTRAINT deployment_recovery_plans_clinic_fk FOREIGN KEY (clinic_id) REFERENCES public.clinics(id) ON DELETE RESTRICT;

ALTER TABLE public.deployment_recovery_plans
  ADD CONSTRAINT deployment_recovery_plans_counter_check CHECK (((completed_mutation_count >= 0) AND (reversible_mutation_count >= 0) AND (reversible_mutation_count <= completed_mutation_count) AND ((failed_sequence IS NULL) OR (failed_sequence > 0))));

ALTER TABLE public.deployment_recovery_plans
  ADD CONSTRAINT deployment_recovery_plans_decision_shape_check CHECK (((rollback_required = (recovery_status = 'rollback_required'::text)) AND ((NOT rollback_executable) OR rollback_required) AND ((recovery_status <> ALL (ARRAY['blocked'::text, 'not_found'::text, 'rollback_not_required'::text])) OR (NOT rollback_executable))));

ALTER TABLE public.deployment_recovery_plans
  ADD CONSTRAINT deployment_recovery_plans_identity_check CHECK (((length(btrim(deployment_run_key)) > 0) AND (length(btrim(execution_key)) > 0) AND (length(btrim(plan_key)) > 0) AND (length(btrim(recovery_key)) > 0) AND (length(btrim(idempotency_key)) > 0) AND (length(btrim(payload_hash)) > 0) AND (length(btrim(failure_code)) > 0) AND (length(btrim(failure_layer)) > 0)));

ALTER TABLE public.deployment_recovery_plans
  ADD CONSTRAINT deployment_recovery_plans_json_shape_check CHECK (((jsonb_typeof(sanitized_failure) = 'object'::text) AND (jsonb_typeof(unsupported_compensations) = 'array'::text) AND (jsonb_typeof(running_items_to_recover) = 'array'::text) AND (jsonb_typeof(downstream) = 'object'::text) AND (jsonb_typeof(evidence) = 'object'::text)));

ALTER TABLE public.deployment_recovery_plans
  ADD CONSTRAINT deployment_recovery_plans_pkey PRIMARY KEY (id);

ALTER TABLE public.deployment_recovery_plans
  ADD CONSTRAINT deployment_recovery_plans_session_fk FOREIGN KEY (session_id) REFERENCES public.deployment_activation_execution_sessions(id) ON DELETE RESTRICT;

ALTER TABLE public.deployment_recovery_plans
  ADD CONSTRAINT deployment_recovery_plans_status_check CHECK ((recovery_status = ANY (ARRAY['rollback_required'::text, 'rollback_not_required'::text, 'blocked'::text, 'not_found'::text])));

ALTER TABLE public.deployment_runs
  ADD CONSTRAINT deployment_runs_deployment_run_id_key UNIQUE (deployment_run_id);

ALTER TABLE public.deployment_runs
  ADD CONSTRAINT deployment_runs_deployment_run_id_non_empty_check CHECK ((length(TRIM(BOTH FROM deployment_run_id)) > 0));

ALTER TABLE public.deployment_runs
  ADD CONSTRAINT deployment_runs_deployment_status_check CHECK ((deployment_status = ANY (ARRAY['draft'::text, 'deploying'::text, 'deployed'::text, 'failed'::text, 'archived'::text])));

ALTER TABLE public.deployment_runs
  ADD CONSTRAINT deployment_runs_idempotency_key_key UNIQUE (idempotency_key);

ALTER TABLE public.deployment_runs
  ADD CONSTRAINT deployment_runs_idempotency_key_non_empty_check CHECK ((length(TRIM(BOTH FROM idempotency_key)) > 0));

ALTER TABLE public.deployment_runs
  ADD CONSTRAINT deployment_runs_lifecycle_state_check CHECK ((lifecycle_state = ANY (ARRAY['draft'::text, 'validating'::text, 'ready'::text, 'locked'::text, 'executing'::text, 'rolling_back'::text, 'rollback_verification'::text, 'completed'::text, 'failed'::text, 'blocked'::text, 'manual_recovery'::text, 'cancelled'::text])));

ALTER TABLE public.deployment_runs
  ADD CONSTRAINT deployment_runs_payload_hash_non_empty_check CHECK ((length(TRIM(BOTH FROM payload_hash)) > 0));

ALTER TABLE public.deployment_runs
  ADD CONSTRAINT deployment_runs_pkey PRIMARY KEY (id);

ALTER TABLE public.deployment_runs
  ADD CONSTRAINT deployment_runs_retry_of_fkey FOREIGN KEY (retry_of) REFERENCES public.deployment_runs(deployment_run_id) ON DELETE RESTRICT;

ALTER TABLE public.load_items
  ADD CONSTRAINT load_items_cycle_tenant_fkey FOREIGN KEY (clinic_id, cycle_id) REFERENCES public.cycles(clinic_id, id) ON DELETE CASCADE;

ALTER TABLE public.load_items
  ADD CONSTRAINT load_items_pkey PRIMARY KEY (id);

ALTER TABLE public.packs
  ADD CONSTRAINT packs_clinic_id_fkey FOREIGN KEY (clinic_id) REFERENCES public.clinics(id) ON DELETE RESTRICT;

ALTER TABLE public.packs
  ADD CONSTRAINT packs_clinic_id_id_key UNIQUE (clinic_id, id);

ALTER TABLE public.packs
  ADD CONSTRAINT packs_cycle_tenant_fkey FOREIGN KEY (clinic_id, cycle_id) REFERENCES public.cycles(clinic_id, id);

ALTER TABLE public.packs
  ADD CONSTRAINT packs_pack_number_unique UNIQUE (pack_number);

ALTER TABLE public.packs
  ADD CONSTRAINT packs_pkey PRIMARY KEY (id);

ALTER TABLE public.patient_external_identifiers
  ADD CONSTRAINT patient_external_identifiers_external_id_check CHECK (length(btrim(external_patient_id)) > 0);

ALTER TABLE public.patient_external_identifiers
  ADD CONSTRAINT patient_external_identifiers_patient_fkey FOREIGN KEY (clinic_id, patient_id) REFERENCES public.patients(clinic_id, id) ON DELETE CASCADE;

ALTER TABLE public.patient_external_identifiers
  ADD CONSTRAINT patient_external_identifiers_pkey PRIMARY KEY (id);

ALTER TABLE public.patient_external_identifiers
  ADD CONSTRAINT patient_external_identifiers_source_system_check CHECK (length(btrim(source_system)) > 0);

ALTER TABLE public.patient_external_identifiers
  ADD CONSTRAINT patient_external_identifiers_status_check CHECK (status = ANY (ARRAY['active'::text, 'inactive'::text, 'superseded'::text]));

ALTER TABLE public.patient_traces
  ADD CONSTRAINT patient_traces_clinic_id_fkey FOREIGN KEY (clinic_id) REFERENCES public.clinics(id) ON DELETE RESTRICT;

ALTER TABLE public.patient_traces
  ADD CONSTRAINT patient_traces_pack_number_unique UNIQUE (pack_number);

ALTER TABLE public.patient_traces
  ADD CONSTRAINT patient_traces_pack_tenant_fkey FOREIGN KEY (clinic_id, pack_id) REFERENCES public.packs(clinic_id, id);

ALTER TABLE public.patient_traces
  ADD CONSTRAINT patient_traces_patient_tenant_fkey FOREIGN KEY (clinic_id, patient_id) REFERENCES public.patients(clinic_id, id);

ALTER TABLE public.patient_traces
  ADD CONSTRAINT patient_traces_pkey PRIMARY KEY (id);

ALTER TABLE public.patient_traces
  ADD CONSTRAINT unique_pack_assignment UNIQUE (pack_id);

ALTER TABLE public.patients
  ADD CONSTRAINT patients_clinic_id_fkey FOREIGN KEY (clinic_id) REFERENCES public.clinics(id) ON DELETE RESTRICT;

ALTER TABLE public.patients
  ADD CONSTRAINT patients_clinic_id_id_key UNIQUE (clinic_id, id);

ALTER TABLE public.patients
  ADD CONSTRAINT patients_pkey PRIMARY KEY (id);

ALTER TABLE public.platform_operator_roles
  ADD CONSTRAINT platform_operator_roles_activated_by_fkey FOREIGN KEY (activated_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.platform_operator_roles
  ADD CONSTRAINT platform_operator_roles_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.platform_operator_roles
  ADD CONSTRAINT platform_operator_roles_lifecycle_check CHECK ((status = 'active'::text AND revoked_at IS NULL) OR (status = 'suspended'::text AND suspended_at IS NOT NULL AND revoked_at IS NULL) OR (status = 'revoked'::text AND revoked_at IS NOT NULL));

ALTER TABLE public.platform_operator_roles
  ADD CONSTRAINT platform_operator_roles_pkey PRIMARY KEY (id);

ALTER TABLE public.platform_operator_roles
  ADD CONSTRAINT platform_operator_roles_revoked_by_fkey FOREIGN KEY (revoked_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.platform_operator_roles
  ADD CONSTRAINT platform_operator_roles_role_check CHECK (role = 'super_admin'::text);

ALTER TABLE public.platform_operator_roles
  ADD CONSTRAINT platform_operator_roles_status_check CHECK (status = ANY (ARRAY['active'::text, 'suspended'::text, 'revoked'::text]));

ALTER TABLE public.platform_operator_roles
  ADD CONSTRAINT platform_operator_roles_suspended_by_fkey FOREIGN KEY (suspended_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.platform_operator_roles
  ADD CONSTRAINT platform_operator_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.platform_operator_roles
  ADD CONSTRAINT platform_operator_roles_user_role_key UNIQUE (user_id, role);

ALTER TABLE public.providers
  ADD CONSTRAINT providers_active_clinic_check CHECK (provisioning_status <> 'active'::text OR clinic_id IS NOT NULL);

ALTER TABLE public.providers
  ADD CONSTRAINT providers_clinic_id_fkey FOREIGN KEY (clinic_id) REFERENCES public.clinics(id) ON DELETE RESTRICT;

ALTER TABLE public.providers
  ADD CONSTRAINT providers_pkey PRIMARY KEY (id);

ALTER TABLE public.providers
  ADD CONSTRAINT providers_provisioning_status_check CHECK ((provisioning_status = ANY (ARRAY['placeholder'::text, 'active'::text, 'archived'::text])));

ALTER TABLE public.sterilizers
  ADD CONSTRAINT sterilizers_active_clinic_check CHECK (provisioning_status <> 'active'::text OR clinic_id IS NOT NULL);

ALTER TABLE public.sterilizers
  ADD CONSTRAINT sterilizers_clinic_id_fkey FOREIGN KEY (clinic_id) REFERENCES public.clinics(id) ON DELETE RESTRICT;

ALTER TABLE public.sterilizers
  ADD CONSTRAINT sterilizers_pkey PRIMARY KEY (id);

ALTER TABLE public.sterilizers
  ADD CONSTRAINT sterilizers_provisioning_status_check CHECK ((provisioning_status = ANY (ARRAY['planned'::text, 'active'::text, 'archived'::text])));

ALTER TABLE public.workstation_sessions
  ADD CONSTRAINT workstation_sessions_pkey PRIMARY KEY (id);

ALTER TABLE public.workstation_sessions
  ADD CONSTRAINT workstation_sessions_status_check CHECK ((status = ANY (ARRAY['planned'::text, 'active'::text, 'idle'::text, 'ended'::text, 'abandoned'::text])));

ALTER TABLE public.workstation_sessions
  ADD CONSTRAINT workstation_sessions_time_order_check CHECK (((ended_at IS NULL) OR (started_at IS NULL) OR (ended_at >= started_at)));

ALTER TABLE public.workstation_sessions
  ADD CONSTRAINT workstation_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.workstation_sessions
  ADD CONSTRAINT workstation_sessions_workstation_id_fkey FOREIGN KEY (workstation_id) REFERENCES public.clinical_workstations(id) ON DELETE RESTRICT;
