/*
 * SteriSphere Authoritative Baseline
 * Architecture Freeze Version: 1.0.0
 * Architecture Freeze Manifest SHA-256:
 * 0B0B1B157035F12AB210ECBD1DC6B7E55FF6DAFFDF652966ACB0396E66963619
 * Architecture Input Commit: 2373ad80d6a86510acde0010ea1bfb1f82d0fe02
 * Freeze Artifact Commit: 12b6b7e2729d95f47c77cb04e1db87130a05adc9
 * Owner Resolution SHA-256: D0CE3D8910EBAA73AF87FD3903851D1207969764473281D5D14715120F26CB1B
 * Production Capture Reference: .tmp/schema-captures/20260723T031930Z/
 * File Role: Authoritative trigger attachments
 *
 * THIS FILE IS GENERATED FROM THE LOCKED ARCHITECTURE FREEZE.
 * DO NOT EDIT MANUALLY.
 * REGENERATE THROUGH THE APPROVED BASELINE PROCESS.
 *
 * GENERATED ARTIFACT FOR REVIEW ONLY. EXECUTION IS NOT AUTHORIZED.
 */

CREATE TRIGGER set_clinical_agents_updated_at BEFORE UPDATE ON public.clinical_agents FOR EACH ROW EXECUTE FUNCTION public.set_clinical_agents_updated_at();

CREATE TRIGGER set_clinical_hardware_devices_updated_at BEFORE UPDATE ON public.clinical_hardware_devices FOR EACH ROW EXECUTE FUNCTION public.set_clinical_hardware_devices_updated_at();

CREATE TRIGGER set_clinical_workstations_updated_at BEFORE UPDATE ON public.clinical_workstations FOR EACH ROW EXECUTE FUNCTION public.set_clinical_workstations_updated_at();

CREATE TRIGGER set_clinics_updated_at BEFORE UPDATE ON public.clinics FOR EACH ROW EXECUTE FUNCTION public.set_clinics_updated_at();

CREATE TRIGGER set_deployment_activation_execution_items_updated_at BEFORE UPDATE ON public.deployment_activation_execution_items FOR EACH ROW EXECUTE FUNCTION public.set_deployment_activation_execution_updated_at();

CREATE TRIGGER set_deployment_activation_execution_sessions_updated_at BEFORE UPDATE ON public.deployment_activation_execution_sessions FOR EACH ROW EXECUTE FUNCTION public.set_deployment_activation_execution_updated_at();

CREATE TRIGGER set_deployment_hardware_assignments_updated_at BEFORE UPDATE ON public.deployment_hardware_assignments FOR EACH ROW EXECUTE FUNCTION public.set_deployment_hardware_assignments_updated_at();

CREATE TRIGGER set_deployment_recovery_plan_items_updated_at BEFORE UPDATE ON public.deployment_recovery_plan_items FOR EACH ROW EXECUTE FUNCTION public.set_deployment_recovery_plan_updated_at();

CREATE TRIGGER set_deployment_recovery_plans_updated_at BEFORE UPDATE ON public.deployment_recovery_plans FOR EACH ROW EXECUTE FUNCTION public.set_deployment_recovery_plan_updated_at();

CREATE TRIGGER set_workstation_sessions_updated_at BEFORE UPDATE ON public.workstation_sessions FOR EACH ROW EXECUTE FUNCTION public.set_workstation_sessions_updated_at();
