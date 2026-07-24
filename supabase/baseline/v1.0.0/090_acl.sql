/*
 * SteriSphere Authoritative Baseline
 * Architecture Freeze Version: 1.0.0
 * Architecture Freeze Manifest SHA-256:
 * 0B0B1B157035F12AB210ECBD1DC6B7E55FF6DAFFDF652966ACB0396E66963619
 * Architecture Input Commit: 2373ad80d6a86510acde0010ea1bfb1f82d0fe02
 * Freeze Artifact Commit: 12b6b7e2729d95f47c77cb04e1db87130a05adc9
 * Owner Resolution SHA-256: D0CE3D8910EBAA73AF87FD3903851D1207969764473281D5D14715120F26CB1B
 * Production Capture Reference: .tmp/schema-captures/20260723T031930Z/
 * File Role: Least-privilege table and function ACLs complementing RLS
 *
 * THIS FILE IS GENERATED FROM THE LOCKED ARCHITECTURE FREEZE.
 * DO NOT EDIT MANUALLY.
 * REGENERATE THROUGH THE APPROVED BASELINE PROCESS.
 *
 * GENERATED ARTIFACT FOR REVIEW ONLY. EXECUTION IS NOT AUTHORIZED.
 */

REVOKE ALL ON TABLE public.clinics, public.platform_operator_roles, public.clinic_memberships, public.patients, public.patient_external_identifiers, public.providers, public.sterilizers, public.clinical_workstations, public.clinical_agents, public.clinical_hardware_devices, public.clinic_settings, public.cycles, public.load_items, public.packs, public.patient_traces, public.audit_logs, public.deployment_runs, public.deployment_hardware_assignments, public.deployment_activation_execution_sessions, public.deployment_activation_execution_items, public.deployment_recovery_plans, public.deployment_recovery_plan_items, public.workstation_sessions FROM PUBLIC;

REVOKE ALL ON TABLE public.clinics, public.platform_operator_roles, public.clinic_memberships, public.patients, public.patient_external_identifiers, public.providers, public.sterilizers, public.clinical_workstations, public.clinical_agents, public.clinical_hardware_devices, public.clinic_settings, public.cycles, public.load_items, public.packs, public.patient_traces, public.audit_logs, public.deployment_runs, public.deployment_hardware_assignments, public.deployment_activation_execution_sessions, public.deployment_activation_execution_items, public.deployment_recovery_plans, public.deployment_recovery_plan_items, public.workstation_sessions FROM anon;

REVOKE ALL ON TABLE public.clinics, public.platform_operator_roles, public.clinic_memberships, public.patients, public.patient_external_identifiers, public.providers, public.sterilizers, public.clinical_workstations, public.clinical_agents, public.clinical_hardware_devices, public.clinic_settings, public.cycles, public.load_items, public.packs, public.patient_traces, public.audit_logs, public.deployment_runs, public.deployment_hardware_assignments, public.deployment_activation_execution_sessions, public.deployment_activation_execution_items, public.deployment_recovery_plans, public.deployment_recovery_plan_items, public.workstation_sessions FROM authenticated;

GRANT SELECT ON TABLE public.audit_logs, public.clinic_memberships, public.clinic_settings, public.clinical_agents, public.clinical_hardware_devices, public.clinical_workstations, public.clinics, public.cycles, public.load_items, public.packs, public.patient_external_identifiers, public.patient_traces, public.patients, public.platform_operator_roles, public.providers, public.sterilizers, public.workstation_sessions TO authenticated;

GRANT INSERT, UPDATE ON TABLE public.clinic_settings, public.cycles, public.load_items, public.packs, public.patient_external_identifiers, public.patient_traces, public.patients, public.providers, public.sterilizers TO authenticated;

GRANT ALL ON TABLE public.clinics, public.platform_operator_roles, public.clinic_memberships, public.patients, public.patient_external_identifiers, public.providers, public.sterilizers, public.clinical_workstations, public.clinical_agents, public.clinical_hardware_devices, public.clinic_settings, public.cycles, public.load_items, public.packs, public.patient_traces, public.audit_logs, public.deployment_runs, public.deployment_hardware_assignments, public.deployment_activation_execution_sessions, public.deployment_activation_execution_items, public.deployment_recovery_plans, public.deployment_recovery_plan_items, public.workstation_sessions TO service_role;

REVOKE ALL ON FUNCTION public.current_actor_is_global_super_admin() FROM PUBLIC, anon;

REVOKE ALL ON FUNCTION public.current_actor_has_clinic_role(uuid, text[]) FROM PUBLIC, anon;

REVOKE ALL ON FUNCTION public.current_actor_is_clinic_member(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.current_actor_is_global_super_admin() TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.current_actor_has_clinic_role(uuid, text[]) TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.current_actor_is_clinic_member(uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.activate_deployment_clinic(uuid, text, uuid, text, text, text, timestamp with time zone, uuid, text, text, timestamp with time zone, integer, jsonb, jsonb, timestamp with time zone) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.activate_deployment_clinic(uuid, text, uuid, text, text, text, timestamp with time zone, uuid, text, text, timestamp with time zone, integer, jsonb, jsonb, timestamp with time zone) TO service_role;

REVOKE ALL ON FUNCTION public.activate_deployment_hardware_shell(uuid, text, uuid, text, text, text, timestamp with time zone, uuid, text, text, integer, text, text, text, timestamp with time zone, integer, uuid, text, jsonb, jsonb, timestamp with time zone) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.activate_deployment_hardware_shell(uuid, text, uuid, text, text, text, timestamp with time zone, uuid, text, text, integer, text, text, text, timestamp with time zone, integer, uuid, text, jsonb, jsonb, timestamp with time zone) TO service_role;

REVOKE ALL ON FUNCTION public.activate_deployment_provider_shell(uuid, text, uuid, text, text, text, timestamp with time zone, uuid, text, text, integer, text, text, text, timestamp with time zone, integer, uuid, text, jsonb, jsonb, timestamp with time zone) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.activate_deployment_provider_shell(uuid, text, uuid, text, text, text, timestamp with time zone, uuid, text, text, integer, text, text, text, timestamp with time zone, integer, uuid, text, jsonb, jsonb, timestamp with time zone) TO service_role;

REVOKE ALL ON FUNCTION public.activate_deployment_sterilizer_shell(uuid, text, uuid, text, text, text, timestamp with time zone, uuid, text, text, integer, text, text, text, timestamp with time zone, integer, uuid, text, jsonb, jsonb, timestamp with time zone) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.activate_deployment_sterilizer_shell(uuid, text, uuid, text, text, text, timestamp with time zone, uuid, text, text, integer, text, text, text, timestamp with time zone, integer, uuid, text, jsonb, jsonb, timestamp with time zone) TO service_role;

REVOKE ALL ON FUNCTION public.activate_deployment_workstation_shell(uuid, text, uuid, text, text, text, timestamp with time zone, uuid, text, text, integer, text, text, text, timestamp with time zone, integer, uuid, text, jsonb, jsonb, timestamp with time zone) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.activate_deployment_workstation_shell(uuid, text, uuid, text, text, text, timestamp with time zone, uuid, text, text, integer, text, text, text, timestamp with time zone, integer, uuid, text, jsonb, jsonb, timestamp with time zone) TO service_role;

REVOKE ALL ON FUNCTION public.bind_deployment_hardware_target(uuid, text, uuid, text, text, text, timestamp with time zone, uuid, text, text, integer, text, text, text, timestamp with time zone, integer, uuid, text, text, uuid, text, jsonb, jsonb, timestamp with time zone) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.bind_deployment_hardware_target(uuid, text, uuid, text, text, text, timestamp with time zone, uuid, text, text, integer, text, text, text, timestamp with time zone, integer, uuid, text, text, uuid, text, jsonb, jsonb, timestamp with time zone) TO service_role;

REVOKE ALL ON FUNCTION public.claim_deployment_activation_execution_session(text, uuid, text, uuid, text, text, text, timestamp with time zone, timestamp with time zone, integer, text, text, timestamp with time zone) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.claim_deployment_activation_execution_session(text, uuid, text, uuid, text, text, text, timestamp with time zone, timestamp with time zone, integer, text, text, timestamp with time zone) TO service_role;

REVOKE ALL ON FUNCTION public.complete_deployment_activation_execution_item(uuid, text, uuid, text, text, text, timestamp with time zone, uuid, text, text, integer, text, text, timestamp with time zone, integer, timestamp with time zone) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.complete_deployment_activation_execution_item(uuid, text, uuid, text, text, text, timestamp with time zone, uuid, text, text, integer, text, text, timestamp with time zone, integer, timestamp with time zone) TO service_role;

REVOKE ALL ON FUNCTION public.complete_deployment_hardware_shell_execution_item(uuid, text, uuid, text, text, text, timestamp with time zone, uuid, text, text, integer, text, text, text, text, timestamp with time zone, integer, uuid, jsonb, jsonb, timestamp with time zone) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.complete_deployment_hardware_shell_execution_item(uuid, text, uuid, text, text, text, timestamp with time zone, uuid, text, text, integer, text, text, text, text, timestamp with time zone, integer, uuid, jsonb, jsonb, timestamp with time zone) TO service_role;

REVOKE ALL ON FUNCTION public.complete_deployment_provider_shell_execution_item(uuid, text, uuid, text, text, text, timestamp with time zone, uuid, text, text, integer, text, text, text, text, timestamp with time zone, integer, uuid, jsonb, jsonb, timestamp with time zone) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.complete_deployment_provider_shell_execution_item(uuid, text, uuid, text, text, text, timestamp with time zone, uuid, text, text, integer, text, text, text, text, timestamp with time zone, integer, uuid, jsonb, jsonb, timestamp with time zone) TO service_role;

REVOKE ALL ON FUNCTION public.complete_deployment_sterilizer_shell_execution_item(uuid, text, uuid, text, text, text, timestamp with time zone, uuid, text, text, integer, text, text, text, text, timestamp with time zone, integer, uuid, jsonb, jsonb, timestamp with time zone) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.complete_deployment_sterilizer_shell_execution_item(uuid, text, uuid, text, text, text, timestamp with time zone, uuid, text, text, integer, text, text, text, text, timestamp with time zone, integer, uuid, jsonb, jsonb, timestamp with time zone) TO service_role;

REVOKE ALL ON FUNCTION public.complete_deployment_workstation_shell_execution_item(uuid, text, uuid, text, text, text, timestamp with time zone, uuid, text, text, integer, text, text, text, text, timestamp with time zone, integer, uuid, jsonb, jsonb, timestamp with time zone) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.complete_deployment_workstation_shell_execution_item(uuid, text, uuid, text, text, text, timestamp with time zone, uuid, text, text, integer, text, text, text, text, timestamp with time zone, integer, uuid, jsonb, jsonb, timestamp with time zone) TO service_role;

REVOKE ALL ON FUNCTION public.persist_deployment_recovery_plan(uuid, text, uuid, text, text, text, text, text, text, boolean, boolean, jsonb, jsonb, jsonb, integer, integer, jsonb, jsonb, jsonb) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.persist_deployment_recovery_plan(uuid, text, uuid, text, text, text, text, text, text, boolean, boolean, jsonb, jsonb, jsonb, integer, integer, jsonb, jsonb, jsonb) TO service_role;

REVOKE ALL ON FUNCTION public.progress_deployment_activation_execution_dependency(uuid, text, uuid, text, text, text, timestamp with time zone, uuid, text, text, integer, timestamp with time zone, timestamp with time zone, integer, uuid, text, text, integer, text, text, text, text, integer, text[], timestamp with time zone) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.progress_deployment_activation_execution_dependency(uuid, text, uuid, text, text, text, timestamp with time zone, uuid, text, text, integer, timestamp with time zone, timestamp with time zone, integer, uuid, text, text, integer, text, text, text, text, integer, text[], timestamp with time zone) TO service_role;

REVOKE ALL ON FUNCTION public.set_clinical_agents_updated_at() FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.set_clinical_hardware_devices_updated_at() FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.set_clinical_workstations_updated_at() FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.set_clinics_updated_at() FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.set_deployment_activation_execution_updated_at() FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.set_deployment_hardware_assignments_updated_at() FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.set_deployment_recovery_plan_updated_at() FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.set_workstation_sessions_updated_at() FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.start_deployment_activation_execution_item(uuid, text, uuid, text, text, text, timestamp with time zone, uuid, text, text, integer, text, text, text, timestamp with time zone, integer) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.start_deployment_activation_execution_item(uuid, text, uuid, text, text, text, timestamp with time zone, uuid, text, text, integer, text, text, text, timestamp with time zone, integer) TO service_role;

REVOKE ALL ON FUNCTION public.start_deployment_activation_execution_next_item(uuid, text, uuid, text, text, text, timestamp with time zone, uuid, text, text, integer, text, text, text, integer, text[], timestamp with time zone) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.start_deployment_activation_execution_next_item(uuid, text, uuid, text, text, text, timestamp with time zone, uuid, text, text, integer, text, text, text, integer, text[], timestamp with time zone) TO service_role;

REVOKE ALL ON FUNCTION public.start_deployment_activation_execution_session(uuid, text, uuid, text, text, text, timestamp with time zone, timestamp with time zone, integer) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.start_deployment_activation_execution_session(uuid, text, uuid, text, text, text, timestamp with time zone, timestamp with time zone, integer) TO service_role;
