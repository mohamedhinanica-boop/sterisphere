/*
 * SteriSphere Authoritative Baseline
 * Architecture Freeze Version: 1.0.0
 * Architecture Freeze Manifest SHA-256:
 * 0B0B1B157035F12AB210ECBD1DC6B7E55FF6DAFFDF652966ACB0396E66963619
 * Architecture Input Commit: 2373ad80d6a86510acde0010ea1bfb1f82d0fe02
 * Freeze Artifact Commit: 12b6b7e2729d95f47c77cb04e1db87130a05adc9
 * Owner Resolution SHA-256: D0CE3D8910EBAA73AF87FD3903851D1207969764473281D5D14715120F26CB1B
 * Production Capture Reference: .tmp/schema-captures/20260723T031930Z/
 * File Role: Owner-approved replacement RLS policies with Phase 10.5B traceability
 *
 * THIS FILE IS GENERATED FROM THE LOCKED ARCHITECTURE FREEZE.
 * DO NOT EDIT MANUALLY.
 * REGENERATE THROUGH THE APPROVED BASELINE PROCESS.
 *
 * GENERATED ARTIFACT FOR REVIEW ONLY. EXECUTION IS NOT AUTHORIZED.
 */

-- Replaces RLS-002
CREATE POLICY audit_logs_select_authorized ON public.audit_logs FOR SELECT TO authenticated USING ((scope = 'clinic'::text AND public.current_actor_has_clinic_role(clinic_id, ARRAY['admin', 'auditor']::text[])) OR (scope = ANY (ARRAY['global'::text, 'system'::text]) AND public.current_actor_is_global_super_admin()));

-- Replaces AUTH-001, RLS-026
CREATE POLICY clinic_memberships_select_authorized ON public.clinic_memberships FOR SELECT TO authenticated USING ((user_id = auth.uid()) OR public.current_actor_has_clinic_role(clinic_id, ARRAY['admin']::text[]));

-- Replaces RLS-003
CREATE POLICY clinic_settings_insert_admin ON public.clinic_settings FOR INSERT TO authenticated WITH CHECK (public.current_actor_has_clinic_role(clinic_id, ARRAY['admin']::text[]));

-- Replaces RLS-005
CREATE POLICY clinic_settings_select_members ON public.clinic_settings FOR SELECT TO authenticated USING (public.current_actor_is_clinic_member(clinic_id));

-- Replaces RLS-004
CREATE POLICY clinic_settings_update_admin ON public.clinic_settings FOR UPDATE TO authenticated USING (public.current_actor_has_clinic_role(clinic_id, ARRAY['admin']::text[])) WITH CHECK (public.current_actor_has_clinic_role(clinic_id, ARRAY['admin']::text[]));

-- Replaces AUTH-001
CREATE POLICY clinical_agents_select_admin ON public.clinical_agents FOR SELECT TO authenticated USING (public.current_actor_has_clinic_role(clinic_id, ARRAY['admin']::text[]));

-- Replaces AUTH-001
CREATE POLICY clinical_hardware_devices_select_admin ON public.clinical_hardware_devices FOR SELECT TO authenticated USING (public.current_actor_has_clinic_role(clinic_id, ARRAY['admin']::text[]));

-- Replaces AUTH-001
CREATE POLICY clinical_workstations_select_members ON public.clinical_workstations FOR SELECT TO authenticated USING (public.current_actor_is_clinic_member(clinic_id));

-- Replaces AUTH-001
CREATE POLICY clinics_select_members ON public.clinics FOR SELECT TO authenticated USING (public.current_actor_is_clinic_member(id));

-- Replaces RLS-006
CREATE POLICY cycles_insert_clinical ON public.cycles FOR INSERT TO authenticated WITH CHECK (public.current_actor_has_clinic_role(clinic_id, ARRAY['admin', 'clinical_staff']::text[]));

-- Replaces RLS-007
CREATE POLICY cycles_select_members ON public.cycles FOR SELECT TO authenticated USING (public.current_actor_is_clinic_member(clinic_id));

-- Replaces RLS-008
CREATE POLICY cycles_update_clinical ON public.cycles FOR UPDATE TO authenticated USING (public.current_actor_has_clinic_role(clinic_id, ARRAY['admin', 'clinical_staff']::text[])) WITH CHECK (public.current_actor_has_clinic_role(clinic_id, ARRAY['admin', 'clinical_staff']::text[]));

-- Replaces RLS-009
CREATE POLICY load_items_insert_clinical ON public.load_items FOR INSERT TO authenticated WITH CHECK (public.current_actor_has_clinic_role(clinic_id, ARRAY['admin', 'clinical_staff']::text[]));

-- Replaces RLS-010
CREATE POLICY load_items_select_members ON public.load_items FOR SELECT TO authenticated USING (public.current_actor_is_clinic_member(clinic_id));

-- Replaces RLS-011
CREATE POLICY load_items_update_clinical ON public.load_items FOR UPDATE TO authenticated USING (public.current_actor_has_clinic_role(clinic_id, ARRAY['admin', 'clinical_staff']::text[])) WITH CHECK (public.current_actor_has_clinic_role(clinic_id, ARRAY['admin', 'clinical_staff']::text[]));

-- Replaces RLS-013
CREATE POLICY packs_insert_clinical ON public.packs FOR INSERT TO authenticated WITH CHECK (public.current_actor_has_clinic_role(clinic_id, ARRAY['admin', 'clinical_staff']::text[]));

-- Replaces RLS-014
CREATE POLICY packs_select_members ON public.packs FOR SELECT TO authenticated USING (public.current_actor_is_clinic_member(clinic_id));

-- Replaces RLS-012
CREATE POLICY packs_update_clinical ON public.packs FOR UPDATE TO authenticated USING (public.current_actor_has_clinic_role(clinic_id, ARRAY['admin', 'clinical_staff']::text[])) WITH CHECK (public.current_actor_has_clinic_role(clinic_id, ARRAY['admin', 'clinical_staff']::text[]));

-- Replaces UNIQUE-001
CREATE POLICY patient_external_identifiers_select_clinical ON public.patient_external_identifiers FOR SELECT TO authenticated USING (public.current_actor_has_clinic_role(clinic_id, ARRAY['admin', 'clinical_staff', 'doctor', 'auditor']::text[]));

-- Replaces UNIQUE-001
CREATE POLICY patient_external_identifiers_write_clinical ON public.patient_external_identifiers FOR ALL TO authenticated USING (public.current_actor_has_clinic_role(clinic_id, ARRAY['admin', 'clinical_staff', 'doctor']::text[])) WITH CHECK (public.current_actor_has_clinic_role(clinic_id, ARRAY['admin', 'clinical_staff', 'doctor']::text[]));

-- Replaces RLS-015
CREATE POLICY patient_traces_insert_clinical ON public.patient_traces FOR INSERT TO authenticated WITH CHECK (public.current_actor_has_clinic_role(clinic_id, ARRAY['admin', 'clinical_staff', 'doctor']::text[]));

-- Replaces RLS-016
CREATE POLICY patient_traces_select_clinical ON public.patient_traces FOR SELECT TO authenticated USING (public.current_actor_has_clinic_role(clinic_id, ARRAY['admin', 'clinical_staff', 'doctor', 'auditor']::text[]));

-- Replaces RLS-017
CREATE POLICY patients_insert_clinical ON public.patients FOR INSERT TO authenticated WITH CHECK (public.current_actor_has_clinic_role(clinic_id, ARRAY['admin', 'clinical_staff', 'doctor']::text[]));

-- Replaces RLS-018
CREATE POLICY patients_select_clinical ON public.patients FOR SELECT TO authenticated USING (public.current_actor_has_clinic_role(clinic_id, ARRAY['admin', 'clinical_staff', 'doctor', 'auditor']::text[]));

-- Replaces RLS-017
CREATE POLICY patients_update_clinical ON public.patients FOR UPDATE TO authenticated USING (public.current_actor_has_clinic_role(clinic_id, ARRAY['admin', 'clinical_staff', 'doctor']::text[])) WITH CHECK (public.current_actor_has_clinic_role(clinic_id, ARRAY['admin', 'clinical_staff', 'doctor']::text[]));

-- Replaces AUTH-001, RLS-026
CREATE POLICY platform_operator_roles_select_authorized ON public.platform_operator_roles FOR SELECT TO authenticated USING ((user_id = auth.uid()) OR public.current_actor_is_global_super_admin());

-- Replaces RLS-019
CREATE POLICY providers_insert_admin ON public.providers FOR INSERT TO authenticated WITH CHECK (public.current_actor_has_clinic_role(clinic_id, ARRAY['admin']::text[]));

-- Replaces RLS-020
CREATE POLICY providers_select_members ON public.providers FOR SELECT TO authenticated USING (public.current_actor_is_clinic_member(clinic_id));

-- Replaces RLS-021
CREATE POLICY providers_update_admin ON public.providers FOR UPDATE TO authenticated USING (public.current_actor_has_clinic_role(clinic_id, ARRAY['admin']::text[])) WITH CHECK (public.current_actor_has_clinic_role(clinic_id, ARRAY['admin']::text[]));

-- Replaces RLS-022
CREATE POLICY sterilizers_insert_admin ON public.sterilizers FOR INSERT TO authenticated WITH CHECK (public.current_actor_has_clinic_role(clinic_id, ARRAY['admin']::text[]));

-- Replaces RLS-023
CREATE POLICY sterilizers_select_members ON public.sterilizers FOR SELECT TO authenticated USING (public.current_actor_is_clinic_member(clinic_id));

-- Replaces RLS-024
CREATE POLICY sterilizers_update_admin ON public.sterilizers FOR UPDATE TO authenticated USING (public.current_actor_has_clinic_role(clinic_id, ARRAY['admin']::text[])) WITH CHECK (public.current_actor_has_clinic_role(clinic_id, ARRAY['admin']::text[]));

-- Replaces AUTH-001
CREATE POLICY workstation_sessions_select_authorized ON public.workstation_sessions FOR SELECT TO authenticated USING ((user_id = auth.uid()) OR public.current_actor_has_clinic_role(clinic_id, ARRAY['admin']::text[]));
