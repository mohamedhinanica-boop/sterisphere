-- RC6 Slice 1C - deployment hardware assignments table
--
-- Purpose:
-- Create the dedicated setup-draft relationship table for planned hardware
-- assignments. This migration does not insert assignment rows, resolve
-- workstation or sterilizer ids, mutate clinical_hardware_devices, bind
-- hardware, activate assignments, or wire runtime behavior.

create table if not exists public.deployment_hardware_assignments (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null,
  deployment_hardware_key text not null,
  assignment_key text not null,
  target_type text not null,
  target_deployment_key text null,
  assignment_status text not null default 'planned',
  assignment_source text not null default 'setup_draft',
  active boolean not null default false,
  display_order integer null,
  reason text null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if to_regclass('public.deployment_hardware_assignments') is not null
    and to_regclass('public.clinics') is not null
    and not exists (
      select 1
      from pg_constraint
      where conname = 'deployment_hardware_assignments_clinic_id_fkey'
        and conrelid = to_regclass('public.deployment_hardware_assignments')
    )
  then
    alter table public.deployment_hardware_assignments
      add constraint deployment_hardware_assignments_clinic_id_fkey
      foreign key (clinic_id)
      references public.clinics(id)
      on delete restrict;
  end if;
end $$;

alter table public.deployment_hardware_assignments
  drop constraint if exists deployment_hardware_assignments_deployment_hardware_key_non_empty_check,
  drop constraint if exists deployment_hardware_assignments_assignment_key_non_empty_check,
  drop constraint if exists deployment_hardware_assignments_target_type_check,
  drop constraint if exists deployment_hardware_assignments_assignment_status_check,
  drop constraint if exists deployment_hardware_assignments_assignment_source_check,
  drop constraint if exists deployment_hardware_assignments_display_order_positive_check,
  drop constraint if exists deployment_hardware_assignments_target_key_shape_check;

alter table public.deployment_hardware_assignments
  add constraint deployment_hardware_assignments_deployment_hardware_key_non_empty_check
    check (length(trim(deployment_hardware_key)) > 0),
  add constraint deployment_hardware_assignments_assignment_key_non_empty_check
    check (length(trim(assignment_key)) > 0),
  add constraint deployment_hardware_assignments_target_type_check
    check (target_type in ('workstation', 'sterilizer', 'unassigned')),
  add constraint deployment_hardware_assignments_assignment_status_check
    check (assignment_status in ('planned', 'active', 'archived')),
  add constraint deployment_hardware_assignments_assignment_source_check
    check (assignment_source in ('setup_draft')),
  add constraint deployment_hardware_assignments_display_order_positive_check
    check (display_order is null or display_order > 0),
  add constraint deployment_hardware_assignments_target_key_shape_check
    check (
      (
        target_type = 'unassigned'
        and target_deployment_key is null
      )
      or (
        target_type in ('workstation', 'sterilizer')
        and target_deployment_key is not null
        and length(trim(target_deployment_key)) > 0
      )
    );

create unique index if not exists deployment_hardware_assignments_clinic_hardware_key_unique_idx
  on public.deployment_hardware_assignments (clinic_id, deployment_hardware_key);

create unique index if not exists deployment_hardware_assignments_clinic_assignment_key_unique_idx
  on public.deployment_hardware_assignments (clinic_id, assignment_key);

create index if not exists deployment_hardware_assignments_clinic_id_idx
  on public.deployment_hardware_assignments (clinic_id);

create index if not exists deployment_hardware_assignments_target_idx
  on public.deployment_hardware_assignments (clinic_id, target_type, target_deployment_key)
  where target_deployment_key is not null;

create or replace function public.set_deployment_hardware_assignments_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_deployment_hardware_assignments_updated_at
  on public.deployment_hardware_assignments;

create trigger set_deployment_hardware_assignments_updated_at
before update on public.deployment_hardware_assignments
for each row
execute function public.set_deployment_hardware_assignments_updated_at();

comment on table public.deployment_hardware_assignments is
  'Setup-draft deployment relationship table for planned hardware shell assignments to logical workstation or sterilizer deployment keys.';

comment on column public.deployment_hardware_assignments.deployment_hardware_key is
  'Deterministic hardware shell key, such as hardware-001. Idempotent with clinic_id.';

comment on column public.deployment_hardware_assignments.assignment_key is
  'Deterministic assignment key, such as hardware-assignment-hardware-001. Unique within a clinic.';

comment on column public.deployment_hardware_assignments.target_deployment_key is
  'Logical deployment target key only. This does not reference workstation, sterilizer, hardware, or agent ids.';
