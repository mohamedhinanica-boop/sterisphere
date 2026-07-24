/*
 * SteriSphere Authoritative Baseline
 * Architecture Freeze Version: 1.0.0
 * Architecture Freeze Manifest SHA-256:
 * 0B0B1B157035F12AB210ECBD1DC6B7E55FF6DAFFDF652966ACB0396E66963619
 * Architecture Input Commit: 2373ad80d6a86510acde0010ea1bfb1f82d0fe02
 * Freeze Artifact Commit: 12b6b7e2729d95f47c77cb04e1db87130a05adc9
 * Owner Resolution SHA-256: D0CE3D8910EBAA73AF87FD3903851D1207969764473281D5D14715120F26CB1B
 * Production Capture Reference: .tmp/schema-captures/20260723T031930Z/
 * File Role: RLS enablement separated from policy creation
 *
 * THIS FILE IS GENERATED FROM THE LOCKED ARCHITECTURE FREEZE.
 * DO NOT EDIT MANUALLY.
 * REGENERATE THROUGH THE APPROVED BASELINE PROCESS.
 *
 * GENERATED ARTIFACT FOR REVIEW ONLY. EXECUTION IS NOT AUTHORIZED.
 */

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clinic_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clinic_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clinical_agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clinical_hardware_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clinical_workstations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clinics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cycles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deployment_activation_execution_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deployment_activation_execution_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deployment_hardware_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deployment_recovery_plan_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deployment_recovery_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deployment_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.load_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.packs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patient_external_identifiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patient_traces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_operator_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sterilizers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workstation_sessions ENABLE ROW LEVEL SECURITY;
