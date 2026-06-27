-- Phase 7.3B - Smart Clinical Workstations persistence planning
-- Run in the Supabase SQL editor only when workstation persistence is ready.
--
-- This file finalizes the planned clinical_workstations schema. It does not
-- connect the Settings UI to Supabase, add scanner behavior, or change Clinic
-- Agent runtime behavior.

create table if not exists public.clinical_workstations (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid,
  name text not null,
  workstation_type text not null default 'other',
  display_order integer not null default 100,
  location_label text,
  room_number text,
  agent_id text,
  agent_url text,
  supports_printer boolean not null default false,
  supports_usb_scanner boolean not null default false,
  supports_camera boolean not null default false,
  supports_sound boolean not null default false,
  supports_sterilizer boolean not null default false,
  status text not null default 'planned',
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

alter table public.clinical_workstations
  add column if not exists clinic_id uuid,
  add column if not exists name text,
  add column if not exists workstation_type text not null default 'other',
  add column if not exists display_order integer not null default 100,
  add column if not exists location_label text,
  add column if not exists room_number text,
  add column if not exists agent_id text,
  add column if not exists agent_url text,
  add column if not exists supports_printer boolean not null default false,
  add column if not exists supports_usb_scanner boolean not null default false,
  add column if not exists supports_camera boolean not null default false,
  add column if not exists supports_sound boolean not null default false,
  add column if not exists supports_sterilizer boolean not null default false,
  add column if not exists status text not null default 'planned',
  add column if not exists notes text,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists updated_by uuid references auth.users(id) on delete set null;

-- Compatibility cleanup for the earlier planning-only draft, which used
-- "type" before the model was finalized as "workstation_type".
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'clinical_workstations'
      and column_name = 'type'
  )
  then
    execute '
      update public.clinical_workstations
      set workstation_type = type
      where workstation_type is null
        or workstation_type = ''other''
    ';

    alter table public.clinical_workstations
      drop column type;
  end if;
end $$;

alter table public.clinical_workstations
  alter column name set not null,
  alter column workstation_type set default 'other',
  alter column workstation_type set not null,
  alter column display_order set default 100,
  alter column display_order set not null,
  alter column status set default 'planned',
  alter column status set not null,
  alter column supports_printer set default false,
  alter column supports_printer set not null,
  alter column supports_usb_scanner set default false,
  alter column supports_usb_scanner set not null,
  alter column supports_camera set default false,
  alter column supports_camera set not null,
  alter column supports_sound set default false,
  alter column supports_sound set not null,
  alter column supports_sterilizer set default false,
  alter column supports_sterilizer set not null,
  alter column created_at set default now(),
  alter column created_at set not null,
  alter column updated_at set default now(),
  alter column updated_at set not null;

alter table public.clinical_workstations
  drop constraint if exists clinical_workstations_type_check;

alter table public.clinical_workstations
  drop constraint if exists clinical_workstations_workstation_type_check;

alter table public.clinical_workstations
  add constraint clinical_workstations_workstation_type_check
  check (
    workstation_type in (
      'reception',
      'sterilization',
      'operatory',
      'admin',
      'other'
    )
  );

alter table public.clinical_workstations
  drop constraint if exists clinical_workstations_status_check;

alter table public.clinical_workstations
  add constraint clinical_workstations_status_check
  check (
    status in (
      'planned',
      'active',
      'inactive',
      'needs_attention'
    )
  );

alter table public.clinical_workstations
  drop constraint if exists clinical_workstations_agent_url_check;

alter table public.clinical_workstations
  add constraint clinical_workstations_agent_url_check
  check (
    agent_url is null
    or agent_url ~* '^https?://'
  );

create index if not exists clinical_workstations_clinic_id_idx
  on public.clinical_workstations (clinic_id);

create index if not exists clinical_workstations_status_idx
  on public.clinical_workstations (status);

create index if not exists clinical_workstations_workstation_type_idx
  on public.clinical_workstations (workstation_type);

create index if not exists clinical_workstations_display_order_idx
  on public.clinical_workstations (display_order, name);

create index if not exists clinical_workstations_agent_id_idx
  on public.clinical_workstations (agent_id)
  where agent_id is not null;

drop index if exists public.clinical_workstations_clinic_name_key;

create unique index if not exists clinical_workstations_clinic_name_key
  on public.clinical_workstations (clinic_id, lower(name))
  where clinic_id is not null;

create unique index if not exists clinical_workstations_unscoped_name_key
  on public.clinical_workstations (lower(name))
  where clinic_id is null;

drop index if exists public.clinical_workstations_clinic_agent_id_key;

create unique index if not exists clinical_workstations_clinic_agent_id_key
  on public.clinical_workstations (clinic_id, agent_id)
  where clinic_id is not null
    and agent_id is not null;

create unique index if not exists clinical_workstations_unscoped_agent_id_key
  on public.clinical_workstations (agent_id)
  where clinic_id is null
    and agent_id is not null;

comment on table public.clinical_workstations is
  'Planning table for Smart Clinical Workstations. Apply only when workstation persistence is implemented.';

comment on column public.clinical_workstations.clinic_id is
  'Nullable until SteriSphere has a finalized multi-clinic ownership table. Use clinic-scoped uniqueness when present.';

comment on column public.clinical_workstations.workstation_type is
  'Clinical location type: reception, sterilization, operatory, admin, or other.';

comment on column public.clinical_workstations.display_order is
  'Stable ordering for workstation dropdowns, dashboards, selectors, and future scanner assignment.';

comment on column public.clinical_workstations.agent_url is
  'Future SteriSphere Clinic Agent local URL for this workstation.';

comment on column public.clinical_workstations.supports_usb_scanner is
  'Future hardware capability flag. Scanner ingestion is not implemented by this planning SQL.';

-- updated_at planning section:
-- The current project SQL files do not define a standard updated_at trigger
-- function. This self-contained trigger is included for the future migration
-- that activates workstation persistence.
create or replace function public.set_clinical_workstations_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_clinical_workstations_updated_at
  on public.clinical_workstations;

create trigger set_clinical_workstations_updated_at
before update on public.clinical_workstations
for each row
execute function public.set_clinical_workstations_updated_at();

-- RLS planning section:
-- Existing project SQL patches do not currently define role-aware RLS policies.
-- Leave RLS disabled in this planning file until workstation reads/writes are
-- implemented and clinic scoping is finalized.
--
-- Future policy intent:
-- - super_admin/admin can insert, update, and retire workstations.
-- - clinical_staff/doctor/auditor may read active workstations if needed by
--   Assistant Workstation or reporting workflows.
-- - Clinic Agent service credentials should be scoped separately from browser
--   users before allowing agent-originated heartbeat writes.
--
-- Example future direction only:
-- alter table public.clinical_workstations enable row level security;
-- create policy "Admins can manage clinical workstations" ...
-- create policy "Clinical users can read active workstations" ...

-- Future hardware-device planning block:
-- Hardware persistence belongs in a later phase and should attach devices to
-- workstations, not directly to workflows. Keep this as a skeleton until
-- Phase 7.3C finalizes hardware persistence.
--
-- create table if not exists public.clinical_hardware_devices (
--   id uuid primary key default gen_random_uuid(),
--   clinic_id uuid,
--   workstation_id uuid references public.clinical_workstations(id) on delete set null,
--   device_name text not null,
--   device_type text not null,
--   manufacturer text,
--   model text,
--   serial_number text,
--   firmware_version text,
--   connection_type text,
--   agent_id text,
--   status text not null default 'discovered',
--   last_seen timestamptz,
--   health jsonb not null default '{}'::jsonb,
--   capabilities text[] not null default array[]::text[],
--   created_at timestamptz not null default now(),
--   updated_at timestamptz not null default now()
-- );
