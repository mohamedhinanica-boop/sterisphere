-- RC3 Slice 2B - Clinics persistence boundary
-- Apply only when clinic-root persistence is explicitly approved.
--
-- Scope:
-- - clinics table only
-- - no deployment_runs mutation
-- - no clinic inserts
-- - no tenant setup
-- - no settings, user, or deployment-stage persistence
-- - no runtime wiring by this SQL draft

create table if not exists public.clinics (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  legal_name text null,
  clinic_code text not null unique,
  country text not null,
  province_state text not null,
  timezone text not null,
  primary_language text not null,
  phone text null,
  email text null,
  website text null,
  address_street text null,
  address_city text null,
  address_postal_code text null,
  deployment_status text not null default 'draft',
  deployed_at timestamptz null,
  deployment_version text null,
  schema_version text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint clinics_name_non_empty_check
    check (length(trim(name)) > 0),
  constraint clinics_clinic_code_non_empty_check
    check (length(trim(clinic_code)) > 0),
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

-- The clinic_code unique table constraint creates the required unique index.

create index if not exists clinics_deployment_status_idx
  on public.clinics (deployment_status);

create index if not exists clinics_created_at_idx
  on public.clinics (created_at);

create or replace function public.set_clinics_updated_at()
returns trigger
language plpgsql
set search_path = public
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
execute function public.set_clinics_updated_at();

alter table public.clinics enable row level security;

comment on table public.clinics is
  'Canonical SteriSphere clinic tenancy and deployment root. RC3 creates this table before any clinic-root runtime writes.';

comment on column public.clinics.clinic_code is
  'Human-readable unique clinic code. It is clinic profile data, not deployment session identity.';

comment on column public.clinics.deployment_status is
  'Clinic deployment lifecycle status. New RC3 clinic roots start as draft and non-operational.';

-- RLS is enabled immediately. No policies are created in this slice.
-- RC3 clinic-root runtime writes must use a trusted server-side service-role
-- Supabase client with explicit application authorization checks. Browser
-- clients must not insert or update clinics.
