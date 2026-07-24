/*
 * SteriSphere Authoritative Baseline
 * Architecture Freeze Version: 1.0.0
 * Architecture Freeze Manifest SHA-256:
 * 0B0B1B157035F12AB210ECBD1DC6B7E55FF6DAFFDF652966ACB0396E66963619
 * Architecture Input Commit: 2373ad80d6a86510acde0010ea1bfb1f82d0fe02
 * Freeze Artifact Commit: 12b6b7e2729d95f47c77cb04e1db87130a05adc9
 * Owner Resolution SHA-256: D0CE3D8910EBAA73AF87FD3903851D1207969764473281D5D14715120F26CB1B
 * Production Capture Reference: .tmp/schema-captures/20260723T031930Z/
 * File Role: Authoritative non-constraint and tenant-scope indexes
 *
 * THIS FILE IS GENERATED FROM THE LOCKED ARCHITECTURE FREEZE.
 * DO NOT EDIT MANUALLY.
 * REGENERATE THROUGH THE APPROVED BASELINE PROCESS.
 *
 * GENERATED ARTIFACT FOR REVIEW ONLY. EXECUTION IS NOT AUTHORIZED.
 */

CREATE INDEX audit_logs_clinic_created_at_idx ON public.audit_logs USING btree (clinic_id, created_at DESC) WHERE (clinic_id IS NOT NULL);

CREATE INDEX audit_logs_scope_created_at_idx ON public.audit_logs USING btree (scope, created_at DESC);

CREATE INDEX clinic_memberships_clinic_role_status_idx ON public.clinic_memberships USING btree (clinic_id, role, status, user_id);

CREATE INDEX clinic_memberships_user_status_idx ON public.clinic_memberships USING btree (user_id, status, clinic_id);

CREATE UNIQUE INDEX clinic_settings_clinic_id_unique_idx ON public.clinic_settings USING btree (clinic_id) WHERE (clinic_id IS NOT NULL);

CREATE UNIQUE INDEX clinical_agents_agent_key_key ON public.clinical_agents USING btree (agent_key) WHERE (agent_key IS NOT NULL);

CREATE INDEX clinical_agents_assigned_workstation_id_idx ON public.clinical_agents USING btree (assigned_workstation_id) WHERE (assigned_workstation_id IS NOT NULL);

CREATE INDEX clinical_agents_clinic_id_idx ON public.clinical_agents USING btree (clinic_id);

CREATE INDEX clinical_agents_last_seen_at_idx ON public.clinical_agents USING btree (last_seen_at DESC);

CREATE INDEX clinical_agents_status_idx ON public.clinical_agents USING btree (status);

CREATE INDEX clinical_hardware_devices_agent_id_idx ON public.clinical_hardware_devices USING btree (agent_id) WHERE (agent_id IS NOT NULL);

CREATE UNIQUE INDEX clinical_hardware_devices_clinic_deployment_key_uidx ON public.clinical_hardware_devices USING btree (clinic_id, deployment_hardware_key) WHERE (deployment_hardware_key IS NOT NULL);

CREATE INDEX clinical_hardware_devices_clinic_id_idx ON public.clinical_hardware_devices USING btree (clinic_id);

CREATE INDEX clinical_hardware_devices_current_sterilizer_id_idx ON public.clinical_hardware_devices USING btree (current_sterilizer_id) WHERE (current_sterilizer_id IS NOT NULL);

CREATE INDEX clinical_hardware_devices_current_workstation_id_idx ON public.clinical_hardware_devices USING btree (current_workstation_id) WHERE (current_workstation_id IS NOT NULL);

CREATE INDEX clinical_hardware_devices_default_workstation_id_idx ON public.clinical_hardware_devices USING btree (default_workstation_id) WHERE (default_workstation_id IS NOT NULL);

CREATE INDEX clinical_hardware_devices_device_type_idx ON public.clinical_hardware_devices USING btree (device_type);

CREATE INDEX clinical_hardware_devices_health_idx ON public.clinical_hardware_devices USING btree (health);

CREATE INDEX clinical_hardware_devices_last_seen_at_idx ON public.clinical_hardware_devices USING btree (last_seen_at DESC);

CREATE INDEX clinical_hardware_devices_serial_number_idx ON public.clinical_hardware_devices USING btree (serial_number) WHERE (serial_number IS NOT NULL);

CREATE INDEX clinical_hardware_devices_status_idx ON public.clinical_hardware_devices USING btree (status);

CREATE INDEX clinical_workstations_agent_id_idx ON public.clinical_workstations USING btree (agent_id) WHERE (agent_id IS NOT NULL);

CREATE UNIQUE INDEX clinical_workstations_clinic_agent_id_key ON public.clinical_workstations USING btree (clinic_id, agent_id) WHERE ((clinic_id IS NOT NULL) AND (agent_id IS NOT NULL));

CREATE UNIQUE INDEX clinical_workstations_clinic_deployment_key_unique_idx ON public.clinical_workstations USING btree (clinic_id, deployment_workstation_key) WHERE (deployment_workstation_key IS NOT NULL);

CREATE INDEX clinical_workstations_clinic_id_idx ON public.clinical_workstations USING btree (clinic_id);

CREATE UNIQUE INDEX clinical_workstations_clinic_name_key ON public.clinical_workstations USING btree (clinic_id, lower(name)) WHERE (clinic_id IS NOT NULL);

CREATE INDEX clinical_workstations_display_order_name_idx ON public.clinical_workstations USING btree (display_order, name);

CREATE INDEX clinical_workstations_status_idx ON public.clinical_workstations USING btree (status);

CREATE UNIQUE INDEX clinical_workstations_unscoped_agent_id_key ON public.clinical_workstations USING btree (agent_id) WHERE ((clinic_id IS NULL) AND (agent_id IS NOT NULL));

CREATE UNIQUE INDEX clinical_workstations_unscoped_name_key ON public.clinical_workstations USING btree (lower(name)) WHERE (clinic_id IS NULL);

CREATE INDEX clinical_workstations_workstation_type_idx ON public.clinical_workstations USING btree (workstation_type);

CREATE INDEX clinics_created_at_idx ON public.clinics USING btree (created_at);

CREATE INDEX clinics_deployment_status_idx ON public.clinics USING btree (deployment_status);

CREATE INDEX cycles_clinic_created_at_idx ON public.cycles USING btree (clinic_id, created_at DESC);

CREATE INDEX deployment_activation_execution_items_claim_status_idx ON public.deployment_activation_execution_items USING btree (session_id, execution_status, sequence);

CREATE INDEX deployment_activation_execution_items_clinic_execution_idx ON public.deployment_activation_execution_items USING btree (clinic_id, execution_key);

CREATE INDEX deployment_activation_execution_items_item_start_lookup_idx ON public.deployment_activation_execution_items USING btree (session_id, execution_status, sequence, execution_item_key);

CREATE INDEX deployment_activation_execution_items_run_sequence_idx ON public.deployment_activation_execution_items USING btree (deployment_run_record_id, sequence);

CREATE UNIQUE INDEX deployment_activation_execution_items_session_execution_item_ui ON public.deployment_activation_execution_items USING btree (session_id, execution_item_key);

CREATE UNIQUE INDEX deployment_activation_execution_items_session_plan_item_uidx ON public.deployment_activation_execution_items USING btree (session_id, plan_item_key);

CREATE UNIQUE INDEX deployment_activation_execution_items_session_sequence_uidx ON public.deployment_activation_execution_items USING btree (session_id, sequence);

CREATE INDEX deployment_activation_execution_items_start_status_idx ON public.deployment_activation_execution_items USING btree (session_id, execution_status, sequence);

CREATE INDEX deployment_activation_execution_items_status_sequence_idx ON public.deployment_activation_execution_items USING btree (session_id, execution_status, sequence);

CREATE INDEX deployment_activation_execution_sessions_claim_lookup_idx ON public.deployment_activation_execution_sessions USING btree (clinic_id, deployment_run_key, execution_key);

CREATE UNIQUE INDEX deployment_activation_execution_sessions_clinic_execution_key_u ON public.deployment_activation_execution_sessions USING btree (clinic_id, execution_key);

CREATE UNIQUE INDEX deployment_activation_execution_sessions_clinic_run_key_uidx ON public.deployment_activation_execution_sessions USING btree (clinic_id, deployment_run_key);

CREATE UNIQUE INDEX deployment_activation_execution_sessions_clinic_run_record_uidx ON public.deployment_activation_execution_sessions USING btree (clinic_id, deployment_run_record_id);

CREATE INDEX deployment_activation_execution_sessions_lease_idx ON public.deployment_activation_execution_sessions USING btree (execution_status, lease_expires_at);

CREATE INDEX deployment_activation_execution_sessions_owner_lease_idx ON public.deployment_activation_execution_sessions USING btree (clinic_id, execution_owner, lease_expires_at);

CREATE INDEX deployment_activation_execution_sessions_start_lookup_idx ON public.deployment_activation_execution_sessions USING btree (clinic_id, deployment_run_key, execution_key, execution_status);

CREATE INDEX deployment_activation_execution_sessions_status_idx ON public.deployment_activation_execution_sessions USING btree (clinic_id, execution_status, created_at);

CREATE UNIQUE INDEX deployment_hardware_assignments_clinic_assignment_key_unique_id ON public.deployment_hardware_assignments USING btree (clinic_id, assignment_key);

CREATE UNIQUE INDEX deployment_hardware_assignments_clinic_hardware_key_unique_idx ON public.deployment_hardware_assignments USING btree (clinic_id, deployment_hardware_key);

CREATE INDEX deployment_hardware_assignments_clinic_id_idx ON public.deployment_hardware_assignments USING btree (clinic_id);

CREATE INDEX deployment_hardware_assignments_target_idx ON public.deployment_hardware_assignments USING btree (clinic_id, target_type, target_deployment_key) WHERE (target_deployment_key IS NOT NULL);

CREATE UNIQUE INDEX deployment_recovery_plan_items_plan_item_key_uidx ON public.deployment_recovery_plan_items USING btree (recovery_plan_id, rollback_item_key);

CREATE UNIQUE INDEX deployment_recovery_plan_items_plan_rollback_sequence_uidx ON public.deployment_recovery_plan_items USING btree (recovery_plan_id, rollback_sequence);

CREATE UNIQUE INDEX deployment_recovery_plan_items_plan_source_item_uidx ON public.deployment_recovery_plan_items USING btree (recovery_plan_id, source_execution_item_key);

CREATE UNIQUE INDEX deployment_recovery_plan_items_plan_source_sequence_uidx ON public.deployment_recovery_plan_items USING btree (recovery_plan_id, source_sequence);

CREATE INDEX deployment_recovery_plan_items_scope_order_idx ON public.deployment_recovery_plan_items USING btree (clinic_id, deployment_run_key, execution_key, rollback_sequence);

CREATE UNIQUE INDEX deployment_recovery_plans_recovery_key_uidx ON public.deployment_recovery_plans USING btree (recovery_key);

CREATE UNIQUE INDEX deployment_recovery_plans_scope_idempotency_uidx ON public.deployment_recovery_plans USING btree (clinic_id, deployment_run_key, idempotency_key);

CREATE UNIQUE INDEX deployment_recovery_plans_scope_payload_uidx ON public.deployment_recovery_plans USING btree (clinic_id, deployment_run_key, execution_key, payload_hash);

CREATE INDEX deployment_recovery_plans_session_created_idx ON public.deployment_recovery_plans USING btree (session_id, created_at);

CREATE INDEX deployment_recovery_plans_status_created_idx ON public.deployment_recovery_plans USING btree (clinic_id, recovery_status, created_at);

CREATE INDEX deployment_runs_clinic_id_idx ON public.deployment_runs USING btree (clinic_id) WHERE (clinic_id IS NOT NULL);

CREATE INDEX deployment_runs_created_at_idx ON public.deployment_runs USING btree (created_at);

CREATE INDEX deployment_runs_deployment_status_idx ON public.deployment_runs USING btree (deployment_status);

CREATE INDEX deployment_runs_lifecycle_state_idx ON public.deployment_runs USING btree (lifecycle_state);

CREATE INDEX deployment_runs_retry_of_idx ON public.deployment_runs USING btree (retry_of) WHERE (retry_of IS NOT NULL);

CREATE INDEX load_items_clinic_cycle_idx ON public.load_items USING btree (clinic_id, cycle_id);

CREATE INDEX packs_clinic_cycle_idx ON public.packs USING btree (clinic_id, cycle_id);

CREATE INDEX packs_clinic_status_idx ON public.packs USING btree (clinic_id, status);

CREATE UNIQUE INDEX patient_external_identifiers_default_source_uidx ON public.patient_external_identifiers USING btree (clinic_id, source_system, external_patient_id) WHERE (source_instance_id IS NULL);

CREATE UNIQUE INDEX patient_external_identifiers_instance_source_uidx ON public.patient_external_identifiers USING btree (clinic_id, source_system, source_instance_id, external_patient_id) WHERE (source_instance_id IS NOT NULL);

CREATE INDEX patient_external_identifiers_patient_idx ON public.patient_external_identifiers USING btree (clinic_id, patient_id, status);

CREATE INDEX patient_traces_clinic_created_at_idx ON public.patient_traces USING btree (clinic_id, created_at DESC);

CREATE INDEX patients_clinic_created_at_idx ON public.patients USING btree (clinic_id, created_at DESC);

CREATE INDEX platform_operator_roles_status_idx ON public.platform_operator_roles USING btree (status, user_id);

CREATE UNIQUE INDEX providers_clinic_deployment_key_unique_idx ON public.providers USING btree (clinic_id, deployment_provider_key) WHERE (deployment_provider_key IS NOT NULL);

CREATE INDEX providers_clinic_id_idx ON public.providers USING btree (clinic_id) WHERE (clinic_id IS NOT NULL);

CREATE UNIQUE INDEX providers_clinic_normalized_name_uidx ON public.providers USING btree (clinic_id, regexp_replace(lower(btrim(full_name)), '^(dr\\.?|dre\\.?)\\s+'::text, ''::text)) WHERE (clinic_id IS NOT NULL);

CREATE UNIQUE INDEX sterilizers_clinic_deployment_key_unique_idx ON public.sterilizers USING btree (clinic_id, deployment_sterilizer_key) WHERE (deployment_sterilizer_key IS NOT NULL);

CREATE INDEX sterilizers_clinic_id_idx ON public.sterilizers USING btree (clinic_id) WHERE (clinic_id IS NOT NULL);

CREATE UNIQUE INDEX sterilizers_clinic_normalized_name_uidx ON public.sterilizers USING btree (clinic_id, lower(btrim(name))) WHERE (clinic_id IS NOT NULL);

CREATE INDEX workstation_sessions_clinic_id_idx ON public.workstation_sessions USING btree (clinic_id);

CREATE INDEX workstation_sessions_last_activity_at_idx ON public.workstation_sessions USING btree (last_activity_at DESC);

CREATE INDEX workstation_sessions_status_idx ON public.workstation_sessions USING btree (status);

CREATE INDEX workstation_sessions_user_id_idx ON public.workstation_sessions USING btree (user_id) WHERE (user_id IS NOT NULL);

CREATE INDEX workstation_sessions_workstation_id_idx ON public.workstation_sessions USING btree (workstation_id);
