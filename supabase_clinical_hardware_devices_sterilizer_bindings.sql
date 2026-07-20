-- RC10.1 - Hardware Binding Persistence Foundation (V1)
--
-- Adds only the durable sterilizer binding fields required by the V1
-- workstation-or-sterilizer operational binding model. Apply manually in the
-- Supabase SQL Editor after the read-only preflight succeeds.
--
-- This migration does not bind hardware, mutate execution items, progress
-- dependencies, execute rollback, or change deployment runtime behavior.

alter table public.clinical_hardware_devices
  add column if not exists default_sterilizer_id uuid null,
  add column if not exists current_sterilizer_id uuid null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'clinical_hardware_devices_default_sterilizer_id_fkey'
      and conrelid = 'public.clinical_hardware_devices'::regclass
  ) then
    alter table public.clinical_hardware_devices
      add constraint clinical_hardware_devices_default_sterilizer_id_fkey
      foreign key (default_sterilizer_id)
      references public.sterilizers(id)
      on delete set null;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'clinical_hardware_devices_current_sterilizer_id_fkey'
      and conrelid = 'public.clinical_hardware_devices'::regclass
  ) then
    alter table public.clinical_hardware_devices
      add constraint clinical_hardware_devices_current_sterilizer_id_fkey
      foreign key (current_sterilizer_id)
      references public.sterilizers(id)
      on delete set null;
  end if;
end $$;

alter table public.clinical_hardware_devices
  drop constraint if exists clinical_hardware_devices_single_binding_family_check;

alter table public.clinical_hardware_devices
  add constraint clinical_hardware_devices_single_binding_family_check
  check (
    not (
      (default_workstation_id is not null or current_workstation_id is not null)
      and
      (default_sterilizer_id is not null or current_sterilizer_id is not null)
    )
  );

create index if not exists clinical_hardware_devices_current_workstation_id_idx
  on public.clinical_hardware_devices (current_workstation_id)
  where current_workstation_id is not null;

create index if not exists clinical_hardware_devices_current_sterilizer_id_idx
  on public.clinical_hardware_devices (current_sterilizer_id)
  where current_sterilizer_id is not null;

comment on column public.clinical_hardware_devices.default_sterilizer_id is
  'Stable home sterilizer for V1 hardware binding; mutually exclusive with workstation bindings.';

comment on column public.clinical_hardware_devices.current_sterilizer_id is
  'Current operational sterilizer assignment; mutually exclusive with workstation bindings.';
