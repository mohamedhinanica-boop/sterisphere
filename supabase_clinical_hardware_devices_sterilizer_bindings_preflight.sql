-- RC10.1 - Hardware Binding Persistence Foundation (V1) preflight
-- Read-only verification for the workstation-or-sterilizer durable binding
-- model. This file does not alter schema or mutate data.
--
-- The row checks use to_jsonb so this preflight remains safe to run before the
-- two sterilizer columns have been added. Missing fields are interpreted as
-- null, which is the unassigned Sterilizer state.

select
  to_regclass('public.clinical_hardware_devices') as hardware_table,
  to_regclass('public.clinical_workstations') as workstation_table,
  to_regclass('public.sterilizers') as sterilizer_table;

select
  column_name,
  data_type,
  is_nullable,
  column_default
from information_schema.columns
where table_schema = 'public'
  and table_name = 'clinical_hardware_devices'
  and column_name in (
    'clinic_id',
    'default_workstation_id',
    'current_workstation_id',
    'default_sterilizer_id',
    'current_sterilizer_id'
  )
order by column_name;

with bindings as (
  select
    h.id,
    h.clinic_id,
    h.default_workstation_id,
    h.current_workstation_id,
    nullif(to_jsonb(h) ->> 'default_sterilizer_id', '')::uuid
      as default_sterilizer_id,
    nullif(to_jsonb(h) ->> 'current_sterilizer_id', '')::uuid
      as current_sterilizer_id
  from public.clinical_hardware_devices h
)
select
  count(*) filter (
    where
      (default_workstation_id is not null or current_workstation_id is not null)
      and
      (default_sterilizer_id is not null or current_sterilizer_id is not null)
  ) as mixed_workstation_sterilizer_bindings,
  count(*) filter (
    where clinic_id is null
      and (
        default_workstation_id is not null
        or current_workstation_id is not null
        or default_sterilizer_id is not null
        or current_sterilizer_id is not null
      )
  ) as bound_rows_without_clinic,
  count(*) filter (
    where default_sterilizer_id is not null
      and current_sterilizer_id is not null
      and default_sterilizer_id <> current_sterilizer_id
  ) as differing_default_and_current_sterilizers
from bindings;

with bindings as (
  select
    h.id,
    h.clinic_id,
    h.default_workstation_id,
    h.current_workstation_id,
    nullif(to_jsonb(h) ->> 'default_sterilizer_id', '')::uuid
      as default_sterilizer_id,
    nullif(to_jsonb(h) ->> 'current_sterilizer_id', '')::uuid
      as current_sterilizer_id
  from public.clinical_hardware_devices h
)
select
  count(*) filter (
    where b.default_workstation_id is not null and dw.id is null
  ) as orphan_default_workstations,
  count(*) filter (
    where b.current_workstation_id is not null and cw.id is null
  ) as orphan_current_workstations,
  count(*) filter (
    where b.default_sterilizer_id is not null and ds.id is null
  ) as orphan_default_sterilizers,
  count(*) filter (
    where b.current_sterilizer_id is not null and cs.id is null
  ) as orphan_current_sterilizers
from bindings b
left join public.clinical_workstations dw
  on dw.id = b.default_workstation_id
left join public.clinical_workstations cw
  on cw.id = b.current_workstation_id
left join public.sterilizers ds
  on ds.id = b.default_sterilizer_id
left join public.sterilizers cs
  on cs.id = b.current_sterilizer_id;

with bindings as (
  select
    h.id,
    h.clinic_id,
    h.default_workstation_id,
    h.current_workstation_id,
    nullif(to_jsonb(h) ->> 'default_sterilizer_id', '')::uuid
      as default_sterilizer_id,
    nullif(to_jsonb(h) ->> 'current_sterilizer_id', '')::uuid
      as current_sterilizer_id
  from public.clinical_hardware_devices h
)
select
  count(*) filter (
    where dw.id is not null and dw.clinic_id is distinct from b.clinic_id
  ) as foreign_clinic_default_workstations,
  count(*) filter (
    where cw.id is not null and cw.clinic_id is distinct from b.clinic_id
  ) as foreign_clinic_current_workstations,
  count(*) filter (
    where ds.id is not null and ds.clinic_id is distinct from b.clinic_id
  ) as foreign_clinic_default_sterilizers,
  count(*) filter (
    where cs.id is not null and cs.clinic_id is distinct from b.clinic_id
  ) as foreign_clinic_current_sterilizers
from bindings b
left join public.clinical_workstations dw
  on dw.id = b.default_workstation_id
left join public.clinical_workstations cw
  on cw.id = b.current_workstation_id
left join public.sterilizers ds
  on ds.id = b.default_sterilizer_id
left join public.sterilizers cs
  on cs.id = b.current_sterilizer_id;

select
  conname as constraint_name,
  pg_get_constraintdef(oid) as constraint_definition
from pg_constraint
where conrelid = 'public.clinical_hardware_devices'::regclass
  and conname in (
    'clinical_hardware_devices_default_sterilizer_id_fkey',
    'clinical_hardware_devices_current_sterilizer_id_fkey',
    'clinical_hardware_devices_single_binding_family_check'
  )
order by conname;

select
  indexname,
  indexdef
from pg_indexes
where schemaname = 'public'
  and tablename = 'clinical_hardware_devices'
  and indexname in (
    'clinical_hardware_devices_current_workstation_id_idx',
    'clinical_hardware_devices_current_sterilizer_id_idx'
  )
order by indexname;
