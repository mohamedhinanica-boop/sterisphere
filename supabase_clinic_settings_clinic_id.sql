-- RC4 Slice 1B - clinic_settings clinic_id linkage migration draft
--
-- Purpose:
-- Add optional per-clinic linkage to the existing public.clinic_settings table
-- without breaking any current global/default settings row that has no clinic_id.
--
-- Safe rollout model:
-- 1. Run preflight checks below.
-- 2. Apply nullable clinic_id, FK, and unique partial index.
-- 3. Verify linked rows can be unique per clinic while legacy NULL rows remain.
-- 4. A later cleanup migration can decide how to migrate or retire legacy NULL rows.

-- ---------------------------------------------------------------------------
-- Preflight checks
-- ---------------------------------------------------------------------------

select to_regclass('public.clinic_settings') as clinic_settings_table;

select to_regclass('public.clinics') as clinics_table;

select
  column_name,
  data_type,
  is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'clinic_settings'
order by ordinal_position;

select
  conname as constraint_name,
  contype as constraint_type,
  pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = to_regclass('public.clinic_settings')
order by conname;

select
  indexname,
  indexdef
from pg_indexes
where schemaname = 'public'
  and tablename = 'clinic_settings'
order by indexname;


select count(*) as total_legacy_settings_rows
from public.clinic_settings;

-- ---------------------------------------------------------------------------
-- Migration
-- ---------------------------------------------------------------------------

alter table if exists public.clinic_settings
  add column if not exists clinic_id uuid null;

do $$
begin
  if to_regclass('public.clinic_settings') is not null
    and to_regclass('public.clinics') is not null
    and not exists (
      select 1
      from pg_constraint
      where conname = 'clinic_settings_clinic_id_fkey'
        and conrelid = to_regclass('public.clinic_settings')
    )
  then
    alter table public.clinic_settings
      add constraint clinic_settings_clinic_id_fkey
      foreign key (clinic_id)
      references public.clinics(id)
      on delete restrict;
  end if;
end $$;

-- A partial unique index keeps legacy NULL clinic_id rows compatible while
-- enforcing exactly one linked settings row per clinic for RC4 provisioning.
create unique index if not exists clinic_settings_clinic_id_unique_idx
  on public.clinic_settings (clinic_id)
  where clinic_id is not null;

-- ---------------------------------------------------------------------------
-- Post-migration verification
-- ---------------------------------------------------------------------------

select
  column_name,
  data_type,
  is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'clinic_settings'
  and column_name = 'clinic_id';

select
  conname as constraint_name,
  pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = to_regclass('public.clinic_settings')
  and conname = 'clinic_settings_clinic_id_fkey';

select
  indexname,
  indexdef
from pg_indexes
where schemaname = 'public'
  and tablename = 'clinic_settings'
  and indexname = 'clinic_settings_clinic_id_unique_idx';

select
  clinic_id,
  count(*) as settings_rows
from public.clinic_settings
where clinic_id is not null
group by clinic_id
having count(*) > 1;

select
  count(*) as unlinked_legacy_rows
from public.clinic_settings
where clinic_id is null;
