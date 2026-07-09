-- RC5 Slice 1C - clinical_hardware_devices deployment metadata fields
-- Minimal migration for deployment hardware planned-shell persistence readiness.
-- Apply manually in the Supabase SQL Editor after reviewing the preflight.
--
-- This migration does not backfill legacy rows, insert hardware shells, activate
-- hardware, bind devices, resolve assignments, or change runtime behavior.

alter table public.clinical_hardware_devices
  add column if not exists deployment_hardware_key text null,
  add column if not exists provisioning_source text null,
  add column if not exists provisioning_status text null,
  add column if not exists active boolean null,
  add column if not exists display_order integer null;

alter table public.clinical_hardware_devices
  drop constraint if exists clinical_hardware_devices_provisioning_status_check;

alter table public.clinical_hardware_devices
  add constraint clinical_hardware_devices_provisioning_status_check
  check (
    provisioning_status is null
    or provisioning_status in ('planned', 'active', 'archived')
  );

alter table public.clinical_hardware_devices
  drop constraint if exists clinical_hardware_devices_display_order_check;

alter table public.clinical_hardware_devices
  add constraint clinical_hardware_devices_display_order_check
  check (display_order is null or display_order > 0);

create unique index if not exists clinical_hardware_devices_clinic_deployment_key_uidx
  on public.clinical_hardware_devices (clinic_id, deployment_hardware_key)
  where deployment_hardware_key is not null;