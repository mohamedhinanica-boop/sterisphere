/*
 * SteriSphere Authoritative Baseline
 * Architecture Freeze Version: 1.0.0
 * Architecture Freeze Manifest SHA-256:
 * 0B0B1B157035F12AB210ECBD1DC6B7E55FF6DAFFDF652966ACB0396E66963619
 * Architecture Input Commit: 2373ad80d6a86510acde0010ea1bfb1f82d0fe02
 * Freeze Artifact Commit: 12b6b7e2729d95f47c77cb04e1db87130a05adc9
 * Owner Resolution SHA-256: D0CE3D8910EBAA73AF87FD3903851D1207969764473281D5D14715120F26CB1B
 * Production Capture Reference: .tmp/schema-captures/20260723T031930Z/
 * File Role: Authoritative application-owned table creation
 *
 * THIS FILE IS GENERATED FROM THE LOCKED ARCHITECTURE FREEZE.
 * DO NOT EDIT MANUALLY.
 * REGENERATE THROUGH THE APPROVED BASELINE PROCESS.
 *
 * GENERATED ARTIFACT FOR REVIEW ONLY. EXECUTION IS NOT AUTHORIZED.
 */

CREATE TABLE public.clinics (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    legal_name text,
    clinic_code text NOT NULL,
    country text NOT NULL,
    province_state text NOT NULL,
    timezone text NOT NULL,
    primary_language text NOT NULL,
    phone text,
    email text,
    website text,
    address_street text,
    address_city text,
    address_postal_code text,
    deployment_status text DEFAULT 'draft'::text NOT NULL,
    deployed_at timestamp with time zone,
    deployment_version text,
    schema_version text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.platform_operator_roles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    role text NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    activated_at timestamp with time zone,
    activated_by uuid,
    suspended_at timestamp with time zone,
    suspended_by uuid,
    revoked_at timestamp with time zone,
    revoked_by uuid,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL
);

CREATE TABLE public.clinic_memberships (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    clinic_id uuid NOT NULL,
    user_id uuid NOT NULL,
    role text NOT NULL,
    status text DEFAULT 'invited'::text NOT NULL,
    contact_email text,
    invited_at timestamp with time zone DEFAULT now() NOT NULL,
    invited_by uuid,
    accepted_at timestamp with time zone,
    activated_at timestamp with time zone,
    activated_by uuid,
    suspended_at timestamp with time zone,
    suspended_by uuid,
    revoked_at timestamp with time zone,
    revoked_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL
);

CREATE TABLE public.patients (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    external_id text,
    full_name text NOT NULL,
    date_of_birth date,
    source_system text,
    created_at timestamp with time zone DEFAULT now(),
    clinic_id uuid NOT NULL
);

CREATE TABLE public.patient_external_identifiers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    clinic_id uuid NOT NULL,
    patient_id uuid NOT NULL,
    source_system text NOT NULL,
    source_instance_id uuid,
    external_patient_id text NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    integration_metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.providers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    full_name text NOT NULL,
    role text DEFAULT 'Dentist'::text,
    active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    first_name text,
    last_name text,
    title text,
    display_name text,
    updated_at timestamp with time zone,
    clinic_id uuid,
    deployment_provider_key text,
    provisioning_source text,
    provisioning_status text DEFAULT 'active'::text NOT NULL
);

CREATE TABLE public.sterilizers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    type text,
    active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    clinic_id uuid,
    deployment_sterilizer_key text,
    provisioning_source text,
    provisioning_status text DEFAULT 'active'::text NOT NULL
);

CREATE TABLE public.clinical_workstations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    clinic_id uuid,
    name text NOT NULL,
    workstation_type text DEFAULT 'other'::text NOT NULL,
    location_label text,
    room_number text,
    agent_id text,
    agent_url text,
    supports_printer boolean DEFAULT false NOT NULL,
    supports_usb_scanner boolean DEFAULT false NOT NULL,
    supports_camera boolean DEFAULT false NOT NULL,
    supports_sound boolean DEFAULT false NOT NULL,
    supports_sterilizer boolean DEFAULT false NOT NULL,
    status text DEFAULT 'planned'::text NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by uuid,
    display_order integer DEFAULT 100,
    deployment_workstation_key text,
    provisioning_source text,
    provisioning_status text,
    active boolean
);

CREATE TABLE public.clinical_agents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    clinic_id uuid,
    name text NOT NULL,
    agent_key text,
    agent_url text,
    agent_version text,
    host_name text,
    ip_address text,
    assigned_workstation_id uuid,
    status text DEFAULT 'planned'::text NOT NULL,
    last_seen_at timestamp with time zone,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by uuid,
    heartbeat_interval_seconds integer DEFAULT 30,
    heartbeat_timeout_seconds integer DEFAULT 90,
    platform text,
    operating_system text,
    metadata jsonb DEFAULT '{}'::jsonb
);

CREATE TABLE public.clinical_hardware_devices (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    clinic_id uuid,
    agent_id uuid,
    default_workstation_id uuid,
    current_workstation_id uuid,
    device_name text NOT NULL,
    device_type text NOT NULL,
    device_role text,
    manufacturer text,
    model text,
    serial_number text,
    firmware_version text,
    connection_type text,
    connection_identifier text,
    status text DEFAULT 'discovered'::text NOT NULL,
    health text DEFAULT 'unknown'::text NOT NULL,
    last_seen_at timestamp with time zone,
    last_success_at timestamp with time zone,
    last_error_at timestamp with time zone,
    last_error_message text,
    supports_print_labels boolean DEFAULT false NOT NULL,
    supports_scan_qr boolean DEFAULT false NOT NULL,
    supports_scan_barcode boolean DEFAULT false NOT NULL,
    supports_camera boolean DEFAULT false NOT NULL,
    supports_audio boolean DEFAULT false NOT NULL,
    supports_cycle_reading boolean DEFAULT false NOT NULL,
    supports_temperature boolean DEFAULT false NOT NULL,
    supports_humidity boolean DEFAULT false NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deployment_hardware_key text,
    provisioning_source text,
    provisioning_status text,
    active boolean,
    display_order integer,
    default_sterilizer_id uuid,
    current_sterilizer_id uuid
);

CREATE TABLE public.clinic_settings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    clinic_name text,
    clinic_address text,
    clinic_phone text,
    clinic_email text,
    pack_expiration_days integer DEFAULT 365,
    auto_print_labels boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    sound_alerts_enabled boolean DEFAULT false,
    sound_cycle_alerts boolean DEFAULT true,
    sound_failed_cycle_alerts boolean DEFAULT true,
    sound_pack_alerts boolean DEFAULT false,
    sound_alert_cycle_complete boolean DEFAULT true,
    sound_alert_cycle_overdue boolean DEFAULT true,
    sound_alert_failed_cycle boolean DEFAULT true,
    sound_alert_expiring_packs boolean DEFAULT true,
    sound_alert_expired_packs boolean DEFAULT true,
    printer_model text,
    printer_connection_type text,
    printer_ip text,
    printer_port integer,
    printer_label_width_mm integer,
    printer_label_height_mm integer,
    local_print_agent_url text,
    clinic_id uuid
);

CREATE TABLE public.cycles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    cycle_number text NOT NULL,
    sterilizer text NOT NULL,
    operator text NOT NULL,
    load_contents text NOT NULL,
    status text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    created_by text,
    cycle_state text DEFAULT 'Open'::text,
    expected_pack_count integer,
    reviewed_at timestamp with time zone,
    released_by text,
    released_at timestamp with time zone,
    duration_minutes integer,
    expected_finish_at timestamp with time zone,
    investigation_status text DEFAULT 'Open'::text,
    investigation_closed_at timestamp with time zone,
    investigation_root_cause text DEFAULT 'Unknown / Under Investigation'::text,
    investigation_preventive_action text,
    investigation_corrective_action text,
    investigation_checklist jsonb DEFAULT '{}'::jsonb,
    clinic_id uuid NOT NULL
);

CREATE TABLE public.load_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    cycle_id uuid NOT NULL,
    pack_type text NOT NULL,
    quantity integer NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    clinic_id uuid NOT NULL
);

CREATE TABLE public.packs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    pack_number text NOT NULL,
    cycle_number text NOT NULL,
    pack_type text NOT NULL,
    contents text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    cycle_id uuid,
    created_by text,
    status text DEFAULT 'Available'::text,
    sterilized_at timestamp with time zone,
    expires_at timestamp with time zone,
    load_item_index integer,
    load_item_total integer,
    cycle_pack_total integer,
    cycle_load_summary text,
    label_print_count integer DEFAULT 0,
    expired_reviewed boolean DEFAULT false NOT NULL,
    expired_reviewed_at timestamp with time zone,
    expired_reviewed_by text,
    clinic_id uuid NOT NULL
);

CREATE TABLE public.patient_traces (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    patient_name text NOT NULL,
    provider text NOT NULL,
    treatment_room text NOT NULL,
    pack_number text NOT NULL,
    procedure text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    pack_id uuid,
    patient_id uuid,
    created_by text,
    clinic_id uuid NOT NULL
);

CREATE TABLE public.audit_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    action text NOT NULL,
    entity_type text NOT NULL,
    entity_id text,
    description text,
    user_email text,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now(),
    clinic_id uuid,
    scope text DEFAULT 'clinic'::text NOT NULL,
    actor_user_id uuid
);

CREATE TABLE public.deployment_runs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    deployment_run_id text NOT NULL,
    clinic_id uuid,
    idempotency_key text NOT NULL,
    payload_hash text NOT NULL,
    lifecycle_state text NOT NULL,
    deployment_status text NOT NULL,
    draft_snapshot jsonb NOT NULL,
    audit_evidence jsonb NOT NULL,
    rollback_recovery jsonb,
    lifecycle_summary jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    started_at timestamp with time zone,
    completed_at timestamp with time zone,
    failed_at timestamp with time zone,
    blocked_at timestamp with time zone,
    retry_of text,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL
);

CREATE TABLE public.deployment_hardware_assignments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    clinic_id uuid NOT NULL,
    deployment_hardware_key text NOT NULL,
    assignment_key text NOT NULL,
    target_type text NOT NULL,
    target_deployment_key text,
    assignment_status text DEFAULT 'planned'::text NOT NULL,
    assignment_source text DEFAULT 'setup_draft'::text NOT NULL,
    active boolean DEFAULT false NOT NULL,
    display_order integer,
    reason text,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.deployment_activation_execution_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    clinic_id uuid NOT NULL,
    deployment_run_record_id uuid NOT NULL,
    deployment_run_key text NOT NULL,
    execution_key text NOT NULL,
    plan_key text NOT NULL,
    payload_hash text,
    preparation_status text NOT NULL,
    execution_status text NOT NULL,
    execution_owner text,
    ownership_token text,
    lease_expires_at timestamp with time zone,
    items_requested integer NOT NULL,
    items_ready integer NOT NULL,
    items_pending integer NOT NULL,
    items_blocked integer NOT NULL,
    reversible_items integer NOT NULL,
    irreversible_items integer NOT NULL,
    blockers integer NOT NULL,
    warnings integer NOT NULL,
    rollback_boundary jsonb NOT NULL,
    preparation_evidence jsonb NOT NULL,
    execution_metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    started_at timestamp with time zone,
    completed_at timestamp with time zone,
    failed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.deployment_activation_execution_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    session_id uuid NOT NULL,
    clinic_id uuid NOT NULL,
    deployment_run_record_id uuid NOT NULL,
    deployment_run_key text NOT NULL,
    execution_key text NOT NULL,
    execution_item_key text NOT NULL,
    plan_item_key text NOT NULL,
    sequence integer NOT NULL,
    dependency_level integer,
    entity_type text NOT NULL,
    entity_id text,
    deployment_key text,
    action text NOT NULL,
    expected_current_state jsonb NOT NULL,
    target_state jsonb NOT NULL,
    dependency_keys jsonb NOT NULL,
    execution_status text NOT NULL,
    attempt_count integer DEFAULT 0 NOT NULL,
    reversible boolean NOT NULL,
    rollback_action text,
    rollback_status text DEFAULT 'not_started'::text NOT NULL,
    error_code text,
    error_message text,
    execution_evidence jsonb DEFAULT '{}'::jsonb NOT NULL,
    started_at timestamp with time zone,
    completed_at timestamp with time zone,
    rolled_back_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.deployment_recovery_plans (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    clinic_id uuid NOT NULL,
    deployment_run_key text NOT NULL,
    session_id uuid NOT NULL,
    execution_key text NOT NULL,
    plan_key text NOT NULL,
    recovery_key text NOT NULL,
    idempotency_key text NOT NULL,
    payload_hash text NOT NULL,
    recovery_status text NOT NULL,
    rollback_required boolean NOT NULL,
    rollback_executable boolean NOT NULL,
    failure_code text NOT NULL,
    failure_layer text NOT NULL,
    failed_at timestamp with time zone NOT NULL,
    failed_execution_item_key text,
    failed_plan_item_key text,
    failed_sequence integer,
    failed_entity_type text,
    failed_entity_id text,
    failed_action text,
    retryable boolean NOT NULL,
    sanitized_failure jsonb NOT NULL,
    unsupported_compensations jsonb NOT NULL,
    running_items_to_recover jsonb NOT NULL,
    completed_mutation_count integer NOT NULL,
    reversible_mutation_count integer NOT NULL,
    downstream jsonb NOT NULL,
    evidence jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    updated_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL
);

CREATE TABLE public.deployment_recovery_plan_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    recovery_plan_id uuid NOT NULL,
    clinic_id uuid NOT NULL,
    deployment_run_key text NOT NULL,
    session_id uuid NOT NULL,
    execution_key text NOT NULL,
    plan_key text NOT NULL,
    rollback_item_key text NOT NULL,
    source_execution_item_key text NOT NULL,
    source_plan_item_key text NOT NULL,
    source_sequence integer NOT NULL,
    rollback_sequence integer NOT NULL,
    entity_type text NOT NULL,
    entity_id text,
    original_action text NOT NULL,
    compensation_action text,
    compensation_reason text NOT NULL,
    expected_current_state jsonb NOT NULL,
    expected_prior_state jsonb NOT NULL,
    reversible boolean NOT NULL,
    blocked_reason text,
    status text NOT NULL,
    evidence jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    updated_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL
);

CREATE TABLE public.workstation_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    clinic_id uuid,
    workstation_id uuid NOT NULL,
    user_id uuid,
    status text DEFAULT 'planned'::text NOT NULL,
    started_at timestamp with time zone,
    ended_at timestamp with time zone,
    last_activity_at timestamp with time zone,
    device_context jsonb DEFAULT '{}'::jsonb NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
