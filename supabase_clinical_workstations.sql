-- Smart Clinical Workstations planning table.
-- Run in the Supabase SQL editor only when workstation management is ready
-- to move beyond the Settings placeholder.

create table if not exists public.clinical_workstations (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null,
  name text not null,
  type text not null default 'other',
  room_number text,
  location_label text,
  agent_id text,
  agent_url text,
  supports_printer boolean not null default false,
  supports_usb_scanner boolean not null default false,
  supports_camera boolean not null default false,
  supports_sound boolean not null default false,
  supports_sterilizer boolean not null default false,
  status text not null default 'planned',
  last_seen timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  created_by text,
  updated_at timestamptz,
  updated_by text
);

alter table public.clinical_workstations
  add column if not exists clinic_id uuid,
  add column if not exists name text,
  add column if not exists type text default 'other',
  add column if not exists room_number text,
  add column if not exists location_label text,
  add column if not exists agent_id text,
  add column if not exists agent_url text,
  add column if not exists supports_printer boolean not null default false,
  add column if not exists supports_usb_scanner boolean not null default false,
  add column if not exists supports_camera boolean not null default false,
  add column if not exists supports_sound boolean not null default false,
  add column if not exists supports_sterilizer boolean not null default false,
  add column if not exists status text not null default 'planned',
  add column if not exists last_seen timestamptz,
  add column if not exists notes text,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists created_by text,
  add column if not exists updated_at timestamptz,
  add column if not exists updated_by text;

alter table public.clinical_workstations
  drop constraint if exists clinical_workstations_type_check;

alter table public.clinical_workstations
  add constraint clinical_workstations_type_check
  check (
    type in (
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

create index if not exists clinical_workstations_agent_id_idx
  on public.clinical_workstations (agent_id)
  where agent_id is not null;

create unique index if not exists clinical_workstations_clinic_agent_id_key
  on public.clinical_workstations (clinic_id, agent_id)
  where agent_id is not null;

create unique index if not exists clinical_workstations_clinic_name_key
  on public.clinical_workstations (clinic_id, lower(name));

comment on table public.clinical_workstations is
  'Planning table for Smart Clinical Workstations. Do not apply until workstation management is implemented.';

comment on column public.clinical_workstations.agent_url is
  'Future SteriSphere Clinic Agent local URL for this workstation. Planning only.';

comment on column public.clinical_workstations.supports_usb_scanner is
  'Future hardware capability flag. Scanner ingestion is not implemented by this planning SQL.';

-- RLS planning note:
-- When this table is enabled, add row-level policies that restrict access to
-- authenticated users with super_admin/admin roles for the matching clinic.
-- This planning file intentionally does not enable RLS or create policies until
-- the app has real workstation reads/writes and a clinic scoping strategy.
