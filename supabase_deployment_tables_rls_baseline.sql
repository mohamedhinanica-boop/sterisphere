-- RC6 Infrastructure Cleanup - deployment table RLS baseline
--
-- Purpose:
-- Resolve Supabase Security Advisor "RLS Disabled in Public" warnings for
-- deployment-only public tables while preserving server-only service-role
-- deployment provisioning.
--
-- Scope:
-- - enable RLS on public.deployment_hardware_assignments
-- - enable RLS on public.deployment_runs
-- - do not add anon policies
-- - do not add broad authenticated policies
-- - do not insert, update, delete, backfill, bind, activate, or mutate rows
-- - do not change deployment runtime behavior

alter table public.deployment_hardware_assignments enable row level security;

comment on table public.deployment_hardware_assignments is
  'Setup-draft deployment relationship table for planned hardware shell assignments. RLS is enabled deny-by-default; deployment provisioning uses trusted server-side service-role access.';

alter table public.deployment_runs enable row level security;

comment on table public.deployment_runs is
  'Durable evidence boundary for SteriSphere deployment attempts. RLS is enabled deny-by-default; deployment-run persistence uses trusted server-side service-role access.';