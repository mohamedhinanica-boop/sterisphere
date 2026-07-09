-- RC4 Slice 4C - clinical_workstations deployment fields migration draft
--
-- Purpose:
-- Prepare public.clinical_workstations for future clinic-scoped deployment
-- workstation planned shells. This migration does not insert workstation
-- shells, backfill legacy/global rows, attach rows to clinics, activate rows,
-- or wire runtime deployment.

-- ---------------------------------------------------------------------------
-- Preflight checks
-- ---------------------------------------------------------------------------

select to_regclass('public.clinical_workstations') as clinical_workstations_table;

select to_regclass('public.clinics') as clinics_table;

select
  column_name,
  data_type,
  is_nullable,
  column_default
from information_schema.columns
where table_schema = 'public'
  and table_name = 'clinical_workstations'
order by ordinal_position;

select
  conname as constraint_name,
  contype as constraint_type,
  pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = to_regclass('public.clinical_workstations')
order by conname;

select
  indexname,
  indexdef
from pg_indexes
where schemaname = 'public'
  and tablename = 'clinical_workstations'
order by indexname;

select count(*) as existing_workstation_rows
from public.clinical_workstations;

select
  count(*) filter (where clinic_id is null) as legacy_global_workstation_rows,
  count(*) filter (where clinic_id is not null) as clinic_scoped_workstation_rows
from public.clinical_workstations;

-- ---------------------------------------------------------------------------
-- Migration
-- ---------------------------------------------------------------------------

alter table if exists public.clinical_workstations
  add column if not exists deployment_workstation_key text null,
  add column if not exists provisioning_source text null,
  add column if not exists provisioning_status text null,
  add column if not exists active boolean null;

do $$
begin
  if to_regclass('public.clinical_workstations') is not null
    and not exists (
      select 1
      from pg_constraint
      where conname = 'clinical_workstations_provisioning_status_check'
        and conrelid = to_regclass('public.clinical_workstations')
    )
  then
    alter table public.clinical_workstations
      add constraint clinical_workstations_provisioning_status_check
      check (
        provisioning_status in (
          'planned',
          'active',
          'archived'
        )
      );
  end if;
end $$;


-- Future workstation provisioning can use deterministic
-- deployment_workstation_key values such as workstation-001 scoped to the
-- draft clinic. Null deployment keys remain unrestricted for legacy rows.
create unique index if not exists clinical_workstations_clinic_deployment_key_unique_idx
  on public.clinical_workstations (clinic_id, deployment_workstation_key)
  where deployment_workstation_key is not null;

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
  and table_name = 'clinical_workstations'
  and column_name in (
    'deployment_workstation_key',
    'provisioning_source',
    'provisioning_status',
    'active'
  )
order by column_name;

select
  conname as constraint_name,
  pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = to_regclass('public.clinical_workstations')
  and conname in (
    'clinical_workstations_provisioning_status_check'
  )
order by conname;

select
  indexname,
  indexdef
from pg_indexes
where schemaname = 'public'
  and tablename = 'clinical_workstations'
  and indexname in (
    'clinical_workstations_clinic_deployment_key_unique_idx'
  )
order by indexname;

select
  count(*) filter (where clinic_id is null) as legacy_global_workstation_rows,
  count(*) filter (where clinic_id is not null) as clinic_scoped_workstation_rows,
  count(*) filter (where deployment_workstation_key is null) as rows_without_deployment_key,
  count(*) filter (where deployment_workstation_key is not null) as deployment_key_rows
from public.clinical_workstations;

select
  clinic_id,
  deployment_workstation_key,
  count(*) as workstation_rows
from public.clinical_workstations
where deployment_workstation_key is not null
group by clinic_id, deployment_workstation_key
having count(*) > 1;
