-- Phase 4.2 - Investigation lifecycle and documentation fields
-- Run in the Supabase SQL editor.

alter table public.cycles
  add column if not exists investigation_status text default 'Open',
  add column if not exists investigation_closed_at timestamptz,
  add column if not exists investigation_root_cause text default 'Unknown / Under Investigation',
  add column if not exists investigation_preventive_action text,
  add column if not exists investigation_corrective_action text,
  add column if not exists investigation_checklist jsonb default '{}'::jsonb;

update public.cycles
set investigation_status = 'Open'
where investigation_status is null;

update public.cycles
set investigation_root_cause = 'Unknown / Under Investigation'
where investigation_root_cause is null;

alter table public.cycles
  drop constraint if exists cycles_investigation_status_check;

alter table public.cycles
  add constraint cycles_investigation_status_check
  check (investigation_status in ('Open', 'In Review', 'Closed'));

alter table public.cycles
  drop constraint if exists cycles_investigation_root_cause_check;

alter table public.cycles
  add constraint cycles_investigation_root_cause_check
  check (
    investigation_root_cause in (
      'Operator Error',
      'Packaging Issue',
      'Sterilizer Malfunction',
      'Chemical Indicator Failure',
      'Biological Indicator Failure',
      'Maintenance Issue',
      'Load Configuration Issue',
      'Unknown / Under Investigation'
    )
  );
