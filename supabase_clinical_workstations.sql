-- Smart Clinical Workstations planning table.
-- Run in the Supabase SQL editor only when workstation management is ready
-- to move beyond the Settings placeholder.

create table if not exists public.clinical_workstations (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null,
  name text not null,
  type text not null default 'other',
  room_number text,
  agent_id text,
  status text not null default 'not_registered',
  last_seen timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

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
      'not_registered',
      'online',
      'offline',
      'maintenance',
      'unknown'
    )
  );

create index if not exists clinical_workstations_clinic_id_idx
  on public.clinical_workstations (clinic_id);

create index if not exists clinical_workstations_agent_id_idx
  on public.clinical_workstations (agent_id)
  where agent_id is not null;

create unique index if not exists clinical_workstations_clinic_agent_id_key
  on public.clinical_workstations (clinic_id, agent_id)
  where agent_id is not null;
