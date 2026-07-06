-- Phase 9.3 - Deployment Engine core schema planning
-- Migration-ready planning SQL only. Do not apply automatically.
--
-- This file defines the future clinic tenancy root, deployment-run history,
-- and deployment planning records. It does not execute clinic deployment,
-- modify application runtime behavior, or enable row-level security.

create table if not exists public.clinics (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  legal_name text,
  clinic_code text not null unique,
  country text not null,
  province_state text not null,
  timezone text not null,
  primary_language text not null,
  phone text,
  email text,
  website text,
  address_street text,
  address_city text,
  address_postal_code text,
  deployment_status text not null default 'draft',
  deployed_at timestamptz,
  deployment_version text,
  schema_version text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint clinics_deployment_status_check
    check (
      deployment_status in (
        'draft',
        'deploying',
        'deployed',
        'failed',
        'archived'
      )
    )
);

create table if not exists public.deployment_runs (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid references public.clinics(id) on delete cascade,
  status text not null default 'pending',
  idempotency_key text not null,
  draft_version text not null,
  payload_hash text not null,
  reviewed_payload jsonb not null,
  started_by uuid,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  failed_at timestamptz,
  failure_stage text,
  failure_message text,
  created_at timestamptz not null default now(),
  constraint deployment_runs_status_check
    check (
      status in (
        'pending',
        'running',
        'succeeded',
        'failed',
        'cancelled'
      )
    ),
  constraint deployment_runs_clinic_id_idempotency_key_key
    unique (clinic_id, idempotency_key)
);

create table if not exists public.clinic_provider_plans (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid references public.clinics(id) on delete cascade,
  clinic_type text not null,
  dentists integer not null default 0,
  hygienists integer not null default 0,
  assistants integer not null default 0,
  receptionists integer not null default 0,
  treatment_coordinators integer not null default 0,
  sterilization_technicians integer not null default 0,
  office_managers integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint clinic_provider_plans_counts_check
    check (
      dentists >= 0
      and hygienists >= 0
      and assistants >= 0
      and receptionists >= 0
      and treatment_coordinators >= 0
      and sterilization_technicians >= 0
      and office_managers >= 0
    )
);

create table if not exists public.clinic_hardware_plans (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid references public.clinics(id) on delete cascade,
  label_printers integer not null default 0,
  usb_scanners integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint clinic_hardware_plans_counts_check
    check (
      label_printers >= 0
      and usb_scanners >= 0
    )
);

create index if not exists clinics_clinic_code_idx
  on public.clinics (clinic_code);

create index if not exists clinics_deployment_status_idx
  on public.clinics (deployment_status);

create index if not exists deployment_runs_clinic_id_status_idx
  on public.deployment_runs (clinic_id, status);

create index if not exists deployment_runs_started_at_idx
  on public.deployment_runs (started_at);

create index if not exists clinic_provider_plans_clinic_id_idx
  on public.clinic_provider_plans (clinic_id);

create index if not exists clinic_hardware_plans_clinic_id_idx
  on public.clinic_hardware_plans (clinic_id);

-- Existing planning SQL uses self-contained updated_at trigger functions.
-- Keep this function scoped to the deployment schema so it can be created or
-- replaced safely if this planning file is rerun.
create or replace function public.set_deployment_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_clinics_updated_at
  on public.clinics;

create trigger set_clinics_updated_at
before update on public.clinics
for each row
execute function public.set_deployment_updated_at();

drop trigger if exists set_clinic_provider_plans_updated_at
  on public.clinic_provider_plans;

create trigger set_clinic_provider_plans_updated_at
before update on public.clinic_provider_plans
for each row
execute function public.set_deployment_updated_at();

drop trigger if exists set_clinic_hardware_plans_updated_at
  on public.clinic_hardware_plans;

create trigger set_clinic_hardware_plans_updated_at
before update on public.clinic_hardware_plans
for each row
execute function public.set_deployment_updated_at();

comment on table public.clinics is
  'Planning schema for the canonical SteriSphere clinic tenancy and deployment root. Not yet applied automatically.';

comment on table public.deployment_runs is
  'Planning schema for auditable, idempotent SteriSphere deployment attempts.';

comment on table public.clinic_provider_plans is
  'Deployment planning counts only. These rows do not represent operational provider identities.';

comment on table public.clinic_hardware_plans is
  'Deployment planning counts only. These rows do not represent discovered or registered hardware devices.';

-- RLS planning section:
-- Do not enable RLS in Phase 9.3. Policies must be designed alongside
-- clinic_memberships and the first Super Admin bootstrap model.
--
-- Future policy intent:
-- - scope clinic-owned records through authenticated clinic membership;
-- - allow authorized Super Admins to create and recover deployments;
-- - expose deployment diagnostics without leaking reviewed payloads;
-- - define a separate, auditable SafeNebula/SteriSphere support pathway.
