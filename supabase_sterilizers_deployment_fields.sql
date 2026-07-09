-- RC4 Slice 3A - sterilizers deployment fields migration draft
--
-- Purpose:
-- Prepare public.sterilizers for future clinic-scoped sterilizer provisioning.
-- This migration does not insert sterilizers and does not force existing
-- global sterilizers into a clinic.

-- ---------------------------------------------------------------------------
-- Preflight checks
-- ---------------------------------------------------------------------------

select to_regclass('public.sterilizers') as sterilizers_table;

select to_regclass('public.clinics') as clinics_table;

select
  column_name,
  data_type,
  is_nullable,
  column_default
from information_schema.columns
where table_schema = 'public'
  and table_name = 'sterilizers'
order by ordinal_position;

select
  conname as constraint_name,
  contype as constraint_type,
  pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = to_regclass('public.sterilizers')
order by conname;

select
  indexname,
  indexdef
from pg_indexes
where schemaname = 'public'
  and tablename = 'sterilizers'
order by indexname;

select count(*) as existing_sterilizer_rows
from public.sterilizers;

select
  active,
  count(*) as sterilizer_rows
from public.sterilizers
group by active
order by active;

-- ---------------------------------------------------------------------------
-- Migration
-- ---------------------------------------------------------------------------

alter table if exists public.sterilizers
  add column if not exists clinic_id uuid null,
  add column if not exists deployment_sterilizer_key text null,
  add column if not exists provisioning_source text null,
  add column if not exists provisioning_status text not null default 'active';

do $$
begin
  if to_regclass('public.sterilizers') is not null
    and to_regclass('public.clinics') is not null
    and not exists (
      select 1
      from pg_constraint
      where conname = 'sterilizers_clinic_id_fkey'
        and conrelid = to_regclass('public.sterilizers')
    )
  then
    alter table public.sterilizers
      add constraint sterilizers_clinic_id_fkey
      foreign key (clinic_id)
      references public.clinics(id)
      on delete restrict;
  end if;
end $$;

do $$
begin
  if to_regclass('public.sterilizers') is not null
    and not exists (
      select 1
      from pg_constraint
      where conname = 'sterilizers_provisioning_status_check'
        and conrelid = to_regclass('public.sterilizers')
    )
  then
    alter table public.sterilizers
      add constraint sterilizers_provisioning_status_check
      check (
        provisioning_status in (
          'planned',
          'active',
          'archived'
        )
      );
  end if;
end $$;

-- Supports clinic-scoped sterilizer lookup without changing legacy global
-- sterilizer behavior.
create index if not exists sterilizers_clinic_id_idx
  on public.sterilizers (clinic_id)
  where clinic_id is not null;

-- Future sterilizer provisioning can use deterministic
-- deployment_sterilizer_key values such as sterilizer-001 scoped to the draft
-- clinic.
create unique index if not exists sterilizers_clinic_deployment_key_unique_idx
  on public.sterilizers (clinic_id, deployment_sterilizer_key)
  where deployment_sterilizer_key is not null;

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
  and table_name = 'sterilizers'
  and column_name in (
    'clinic_id',
    'deployment_sterilizer_key',
    'provisioning_source',
    'provisioning_status'
  )
order by column_name;

select
  conname as constraint_name,
  pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = to_regclass('public.sterilizers')
  and conname in (
    'sterilizers_clinic_id_fkey',
    'sterilizers_provisioning_status_check'
  )
order by conname;

select
  indexname,
  indexdef
from pg_indexes
where schemaname = 'public'
  and tablename = 'sterilizers'
  and indexname in (
    'sterilizers_clinic_id_idx',
    'sterilizers_clinic_deployment_key_unique_idx'
  )
order by indexname;

select
  count(*) filter (where clinic_id is null) as global_unlinked_sterilizer_rows,
  count(*) filter (where clinic_id is not null) as clinic_scoped_sterilizer_rows
from public.sterilizers;

select
  clinic_id,
  deployment_sterilizer_key,
  count(*) as sterilizer_rows
from public.sterilizers
where deployment_sterilizer_key is not null
group by clinic_id, deployment_sterilizer_key
having count(*) > 1;
