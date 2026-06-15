-- Phase 4.2 Sprint 1 - Investigation lifecycle fields
-- Run in the Supabase SQL editor.

alter table public.cycles
  add column if not exists investigation_status text default 'Open',
  add column if not exists investigation_closed_at timestamptz;

update public.cycles
set investigation_status = 'Open'
where investigation_status is null;

alter table public.cycles
  drop constraint if exists cycles_investigation_status_check;

alter table public.cycles
  add constraint cycles_investigation_status_check
  check (investigation_status in ('Open', 'In Review', 'Closed'));
