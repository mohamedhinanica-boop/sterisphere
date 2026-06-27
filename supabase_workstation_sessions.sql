-- Phase 7.6C - Workstation Session foundation
-- Run in the Supabase SQL editor only when session persistence is ready.
--
-- Workstation Sessions own clinical room context. Input devices contribute
-- data to a session but do not define the room used for clinical care.

create table if not exists public.workstation_sessions (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid,
  workstation_id uuid not null references public.clinical_workstations(id) on delete restrict,
  user_id uuid references auth.users(id) on delete set null,
  status text not null default 'planned',
  started_at timestamptz,
  ended_at timestamptz,
  last_activity_at timestamptz,
  device_context jsonb not null default '{}'::jsonb,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.workstation_sessions
  add column if not exists clinic_id uuid,
  add column if not exists workstation_id uuid references public.clinical_workstations(id) on delete restrict,
  add column if not exists user_id uuid references auth.users(id) on delete set null,
  add column if not exists status text not null default 'planned',
  add column if not exists started_at timestamptz,
  add column if not exists ended_at timestamptz,
  add column if not exists last_activity_at timestamptz,
  add column if not exists device_context jsonb not null default '{}'::jsonb,
  add column if not exists notes text,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

alter table public.workstation_sessions
  alter column workstation_id set not null,
  alter column status set default 'planned',
  alter column status set not null,
  alter column device_context set default '{}'::jsonb,
  alter column device_context set not null,
  alter column created_at set default now(),
  alter column created_at set not null,
  alter column updated_at set default now(),
  alter column updated_at set not null;

alter table public.workstation_sessions
  drop constraint if exists workstation_sessions_status_check;

alter table public.workstation_sessions
  add constraint workstation_sessions_status_check
  check (
    status in (
      'planned',
      'active',
      'idle',
      'ended',
      'abandoned'
    )
  );

alter table public.workstation_sessions
  drop constraint if exists workstation_sessions_time_order_check;

alter table public.workstation_sessions
  add constraint workstation_sessions_time_order_check
  check (
    ended_at is null
    or started_at is null
    or ended_at >= started_at
  );

create index if not exists workstation_sessions_clinic_id_idx
  on public.workstation_sessions (clinic_id);

create index if not exists workstation_sessions_workstation_id_idx
  on public.workstation_sessions (workstation_id);

create index if not exists workstation_sessions_user_id_idx
  on public.workstation_sessions (user_id)
  where user_id is not null;

create index if not exists workstation_sessions_status_idx
  on public.workstation_sessions (status);

create index if not exists workstation_sessions_last_activity_at_idx
  on public.workstation_sessions (last_activity_at desc);

comment on table public.workstation_sessions is
  'Clinical context sessions bound to configured workstations and users.';

comment on column public.workstation_sessions.workstation_id is
  'Authoritative clinical room context for workflows performed in this session.';

comment on column public.workstation_sessions.device_context is
  'Non-authoritative diagnostic context for input devices available to the session. Avoid PHI and credentials.';

create or replace function public.set_workstation_sessions_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_workstation_sessions_updated_at
  on public.workstation_sessions;

create trigger set_workstation_sessions_updated_at
before update on public.workstation_sessions
for each row
execute function public.set_workstation_sessions_updated_at();

-- RLS planning section:
-- Existing project SQL patches do not consistently define role-aware policies.
-- Leave RLS disabled until session lifecycle permissions and clinic scoping are
-- implemented together.
--
-- Future policy intent:
-- - super_admin can inspect and manage workstation session configuration.
-- - authenticated clinical users may create and use their own allowed sessions.
-- - users may access only sessions in their clinic and authorized workstation.
-- - Clinic Agents and input devices cannot independently choose clinical room
--   context or patient context.
--
-- Example future direction only:
-- alter table public.workstation_sessions enable row level security;
-- create policy "Users can access authorized workstation sessions" ...

