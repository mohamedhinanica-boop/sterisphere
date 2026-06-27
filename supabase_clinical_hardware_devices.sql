-- Phase 7.6B - Clinical hardware discovery foundation
-- Run in the Supabase SQL editor only when cloud-side device persistence is ready.
--
-- This file creates hardware digital-twin records only. It does not add local
-- discovery, scanner support, device control, pairing, or workflow routing.

create table if not exists public.clinical_hardware_devices (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid,
  agent_id uuid references public.clinical_agents(id) on delete set null,
  default_workstation_id uuid references public.clinical_workstations(id) on delete set null,
  current_workstation_id uuid references public.clinical_workstations(id) on delete set null,
  device_name text not null,
  device_type text not null,
  device_role text,
  manufacturer text,
  model text,
  serial_number text,
  firmware_version text,
  connection_type text,
  connection_identifier text,
  status text not null default 'discovered',
  health text not null default 'unknown',
  last_seen_at timestamptz,
  last_success_at timestamptz,
  last_error_at timestamptz,
  last_error_message text,
  supports_print_labels boolean not null default false,
  supports_scan_qr boolean not null default false,
  supports_scan_barcode boolean not null default false,
  supports_camera boolean not null default false,
  supports_audio boolean not null default false,
  supports_cycle_reading boolean not null default false,
  supports_temperature boolean not null default false,
  supports_humidity boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.clinical_hardware_devices
  add column if not exists clinic_id uuid,
  add column if not exists agent_id uuid references public.clinical_agents(id) on delete set null,
  add column if not exists default_workstation_id uuid references public.clinical_workstations(id) on delete set null,
  add column if not exists current_workstation_id uuid references public.clinical_workstations(id) on delete set null,
  add column if not exists device_name text,
  add column if not exists device_type text,
  add column if not exists device_role text,
  add column if not exists manufacturer text,
  add column if not exists model text,
  add column if not exists serial_number text,
  add column if not exists firmware_version text,
  add column if not exists connection_type text,
  add column if not exists connection_identifier text,
  add column if not exists status text not null default 'discovered',
  add column if not exists health text not null default 'unknown',
  add column if not exists last_seen_at timestamptz,
  add column if not exists last_success_at timestamptz,
  add column if not exists last_error_at timestamptz,
  add column if not exists last_error_message text,
  add column if not exists supports_print_labels boolean not null default false,
  add column if not exists supports_scan_qr boolean not null default false,
  add column if not exists supports_scan_barcode boolean not null default false,
  add column if not exists supports_camera boolean not null default false,
  add column if not exists supports_audio boolean not null default false,
  add column if not exists supports_cycle_reading boolean not null default false,
  add column if not exists supports_temperature boolean not null default false,
  add column if not exists supports_humidity boolean not null default false,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists notes text,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

alter table public.clinical_hardware_devices
  alter column device_name set not null,
  alter column device_type set not null,
  alter column status set default 'discovered',
  alter column status set not null,
  alter column health set default 'unknown',
  alter column health set not null,
  alter column supports_print_labels set default false,
  alter column supports_print_labels set not null,
  alter column supports_scan_qr set default false,
  alter column supports_scan_qr set not null,
  alter column supports_scan_barcode set default false,
  alter column supports_scan_barcode set not null,
  alter column supports_camera set default false,
  alter column supports_camera set not null,
  alter column supports_audio set default false,
  alter column supports_audio set not null,
  alter column supports_cycle_reading set default false,
  alter column supports_cycle_reading set not null,
  alter column supports_temperature set default false,
  alter column supports_temperature set not null,
  alter column supports_humidity set default false,
  alter column supports_humidity set not null,
  alter column metadata set default '{}'::jsonb,
  alter column metadata set not null,
  alter column created_at set default now(),
  alter column created_at set not null,
  alter column updated_at set default now(),
  alter column updated_at set not null;

alter table public.clinical_hardware_devices
  drop constraint if exists clinical_hardware_devices_device_type_check;

alter table public.clinical_hardware_devices
  add constraint clinical_hardware_devices_device_type_check
  check (
    device_type in (
      'printer',
      'usb_scanner',
      'camera',
      'speaker',
      'sterilizer',
      'environment_sensor',
      'rfid_reader',
      'nfc_reader',
      'future_custom'
    )
  );

alter table public.clinical_hardware_devices
  drop constraint if exists clinical_hardware_devices_status_check;

alter table public.clinical_hardware_devices
  add constraint clinical_hardware_devices_status_check
  check (
    status in (
      'discovered',
      'registered',
      'assigned',
      'active',
      'maintenance',
      'retired',
      'offline',
      'needs_attention'
    )
  );

alter table public.clinical_hardware_devices
  drop constraint if exists clinical_hardware_devices_health_check;

alter table public.clinical_hardware_devices
  add constraint clinical_hardware_devices_health_check
  check (
    health in (
      'unknown',
      'healthy',
      'warning',
      'error',
      'offline'
    )
  );

create index if not exists clinical_hardware_devices_clinic_id_idx
  on public.clinical_hardware_devices (clinic_id);

create index if not exists clinical_hardware_devices_agent_id_idx
  on public.clinical_hardware_devices (agent_id)
  where agent_id is not null;

create index if not exists clinical_hardware_devices_default_workstation_id_idx
  on public.clinical_hardware_devices (default_workstation_id)
  where default_workstation_id is not null;

create index if not exists clinical_hardware_devices_current_workstation_id_idx
  on public.clinical_hardware_devices (current_workstation_id)
  where current_workstation_id is not null;

create index if not exists clinical_hardware_devices_device_type_idx
  on public.clinical_hardware_devices (device_type);

create index if not exists clinical_hardware_devices_status_idx
  on public.clinical_hardware_devices (status);

create index if not exists clinical_hardware_devices_health_idx
  on public.clinical_hardware_devices (health);

create index if not exists clinical_hardware_devices_last_seen_at_idx
  on public.clinical_hardware_devices (last_seen_at desc);

create index if not exists clinical_hardware_devices_serial_number_idx
  on public.clinical_hardware_devices (serial_number)
  where serial_number is not null;

comment on table public.clinical_hardware_devices is
  'Cloud-side digital twins for hardware observed by SteriSphere Clinic Agents.';

comment on column public.clinical_hardware_devices.default_workstation_id is
  'Stable home workstation; temporary movement does not change this identity.';

comment on column public.clinical_hardware_devices.current_workstation_id is
  'Current operational assignment, which may differ from the default workstation.';

comment on column public.clinical_hardware_devices.connection_identifier is
  'Agent-reported local identifier such as USB path, network address, or port. Do not store credentials.';

comment on column public.clinical_hardware_devices.metadata is
  'Non-secret extensible discovery metadata. Avoid credentials and clinical payloads.';

create or replace function public.set_clinical_hardware_devices_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_clinical_hardware_devices_updated_at
  on public.clinical_hardware_devices;

create trigger set_clinical_hardware_devices_updated_at
before update on public.clinical_hardware_devices
for each row
execute function public.set_clinical_hardware_devices_updated_at();

-- RLS planning section:
-- Existing project SQL patches do not consistently define role-aware policies.
-- Leave RLS disabled until clinic scoping and authenticated agent writes are
-- implemented together.
--
-- Future policy intent:
-- - super_admin can manage device registration and assignment.
-- - authorized clinic users may read limited readiness information later.
-- - Clinic Agents may report devices only for their own clinic and identity.
-- - hardware metadata must not expose credentials or unnecessary PHI.
--
-- Example future direction only:
-- alter table public.clinical_hardware_devices enable row level security;
-- create policy "Super admins can manage clinical hardware devices" ...
-- create policy "Registered agents can report their discovered devices" ...

