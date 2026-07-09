-- RC4 Slice 2A - providers deployment fields migration draft
--
-- Purpose:
-- Prepare public.providers for future clinic-scoped provider-shell provisioning.
-- This migration does not insert providers and does not force existing global
-- providers into a clinic.

-- ---------------------------------------------------------------------------
-- Preflight checks
-- ---------------------------------------------------------------------------

select to_regclass('public.providers') as providers_table;

select to_regclass('public.clinics') as clinics_table;

select
  column_name,
  data_type,
  is_nullable,
  column_default
from information_schema.columns
where table_schema = 'public'
  and table_name = 'providers'
order by ordinal_position;

select
  conname as constraint_name,
  contype as constraint_type,
  pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = to_regclass('public.providers')
order by conname;

select count(*) as existing_provider_rows
from public.providers;

-- ---------------------------------------------------------------------------
-- Migration
-- ---------------------------------------------------------------------------

alter table if exists public.providers
  add column if not exists clinic_id uuid null,
  add column if not exists deployment_provider_key text null,
  add column if not exists provisioning_source text null,
  add column if not exists provisioning_status text not null default 'active';

do $$
begin
  if to_regclass('public.providers') is not null
    and to_regclass('public.clinics') is not null
    and not exists (
      select 1
      from pg_constraint
      where conname = 'providers_clinic_id_fkey'
        and conrelid = to_regclass('public.providers')
    )
  then
    alter table public.providers
      add constraint providers_clinic_id_fkey
      foreign key (clinic_id)
      references public.clinics(id)
      on delete restrict;
  end if;
end $$;

do $$
begin
  if to_regclass('public.providers') is not null
    and not exists (
      select 1
      from pg_constraint
      where conname = 'providers_provisioning_status_check'
        and conrelid = to_regclass('public.providers')
    )
  then
    alter table public.providers
      add constraint providers_provisioning_status_check
      check (
        provisioning_status in (
          'placeholder',
          'active',
          'archived'
        )
      );
  end if;
end $$;

-- Supports clinic-scoped provider shell lookups without changing global
-- provider behavior.
create index if not exists providers_clinic_id_idx
  on public.providers (clinic_id)
  where clinic_id is not null;

-- Future provider provisioning can use deterministic deployment_provider_key
-- values such as dentist-001/hygienist-001 scoped to the draft clinic.
create unique index if not exists providers_clinic_deployment_key_unique_idx
  on public.providers (clinic_id, deployment_provider_key)
  where deployment_provider_key is not null;

-- ---------------------------------------------------------------------------
-- Post-migration verification
-- ---------------------------------------------------------------------------

select
  column_name,
  data_type,
  is_nullable,
  column_default
from information_schema.columns
where table_schema = 'public'
  and table_name = 'providers'
  and column_name in (
    'clinic_id',
    'deployment_provider_key',
    'provisioning_source',
    'provisioning_status'
  )
order by column_name;

select
  conname as constraint_name,
  pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = to_regclass('public.providers')
  and conname in (
    'providers_clinic_id_fkey',
    'providers_provisioning_status_check'
  )
order by conname;

select
  indexname,
  indexdef
from pg_indexes
where schemaname = 'public'
  and tablename = 'providers'
  and indexname in (
    'providers_clinic_id_idx',
    'providers_clinic_deployment_key_unique_idx'
  )
order by indexname;

select
  count(*) filter (where clinic_id is null) as global_unlinked_provider_rows,
  count(*) filter (where clinic_id is not null) as clinic_scoped_provider_rows
from public.providers;

select
  clinic_id,
  deployment_provider_key,
  count(*) as provider_rows
from public.providers
where deployment_provider_key is not null
group by clinic_id, deployment_provider_key
having count(*) > 1;
