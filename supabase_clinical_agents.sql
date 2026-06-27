-- Phase 7.5A - SteriSphere Clinic Agent registration foundation
-- Run in the Supabase SQL editor only when cloud-side agent persistence is ready.
--
-- This file creates the cloud registration model only. It does not add agent
-- pairing, heartbeat, device discovery, printing changes, or local agent
-- runtime behavior.

create table if not exists public.clinical_agents (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid,
  name text not null,
  agent_key text,
  agent_url text,
  agent_version text,
  host_name text,
  ip_address text,
  assigned_workstation_id uuid references public.clinical_workstations(id) on delete set null,
  status text not null default 'planned',
  last_seen_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

alter table public.clinical_agents
  add column if not exists clinic_id uuid,
  add column if not exists name text,
  add column if not exists agent_key text,
  add column if not exists agent_url text,
  add column if not exists agent_version text,
  add column if not exists host_name text,
  add column if not exists ip_address text,
  add column if not exists assigned_workstation_id uuid references public.clinical_workstations(id) on delete set null,
  add column if not exists status text not null default 'planned',
  add column if not exists last_seen_at timestamptz,
  add column if not exists notes text,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists updated_by uuid references auth.users(id) on delete set null;

alter table public.clinical_agents
  alter column name set not null,
  alter column status set default 'planned',
  alter column status set not null,
  alter column created_at set default now(),
  alter column created_at set not null,
  alter column updated_at set default now(),
  alter column updated_at set not null;

alter table public.clinical_agents
  drop constraint if exists clinical_agents_status_check;

alter table public.clinical_agents
  add constraint clinical_agents_status_check
  check (
    status in (
      'planned',
      'registered',
      'online',
      'offline',
      'needs_attention',
      'retired'
    )
  );

alter table public.clinical_agents
  drop constraint if exists clinical_agents_agent_url_check;

alter table public.clinical_agents
  add constraint clinical_agents_agent_url_check
  check (
    agent_url is null
    or agent_url ~* '^https?://'
  );

create index if not exists clinical_agents_clinic_id_idx
  on public.clinical_agents (clinic_id);

create index if not exists clinical_agents_status_idx
  on public.clinical_agents (status);

create index if not exists clinical_agents_assigned_workstation_id_idx
  on public.clinical_agents (assigned_workstation_id)
  where assigned_workstation_id is not null;

create unique index if not exists clinical_agents_agent_key_key
  on public.clinical_agents (agent_key)
  where agent_key is not null;

create index if not exists clinical_agents_last_seen_at_idx
  on public.clinical_agents (last_seen_at desc);

comment on table public.clinical_agents is
  'Cloud-side registration records for SteriSphere Clinic Agents.';

comment on column public.clinical_agents.clinic_id is
  'Nullable until SteriSphere has a finalized multi-clinic ownership table.';

comment on column public.clinical_agents.agent_key is
  'Globally unique future registration identity. Authentication secrets must be stored separately and securely.';

comment on column public.clinical_agents.assigned_workstation_id is
  'Optional default workstation assignment. Pairing behavior is not implemented in Phase 7.5A.';

create or replace function public.set_clinical_agents_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_clinical_agents_updated_at
  on public.clinical_agents;

create trigger set_clinical_agents_updated_at
before update on public.clinical_agents
for each row
execute function public.set_clinical_agents_updated_at();

-- RLS planning section:
-- Existing project SQL patches do not consistently define role-aware policies.
-- Leave RLS disabled until clinic scoping and agent credential flows are
-- finalized.
--
-- Future policy intent:
-- - super_admin can manage Clinic Agent registration records.
-- - authorized clinic users may read limited readiness information later.
-- - Clinic Agents use separately scoped registration credentials for heartbeat
--   and diagnostics; browser sessions must not impersonate an agent.
-- - agent_key is an identifier, not a plaintext pairing secret.
--
-- Example future direction only:
-- alter table public.clinical_agents enable row level security;
-- create policy "Super admins can manage clinical agents" ...
-- create policy "Authorized users can read clinical agent readiness" ...

