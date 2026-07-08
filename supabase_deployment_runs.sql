-- RC2 Slice 2 - Deployment runs persistence boundary
-- Apply only when deployment_runs persistence is explicitly approved.
--
-- Scope:
-- - deployment_runs table only
-- - no clinic creation
-- - no tenant setup
-- - no settings, user, or deployment-stage persistence
-- - no runtime wiring by this SQL draft

create table if not exists public.deployment_runs (
  id uuid primary key default gen_random_uuid(),
  deployment_run_id text not null unique,
  clinic_id uuid null,
  idempotency_key text not null unique,
  payload_hash text not null,
  lifecycle_state text not null,
  deployment_status text not null,
  draft_snapshot jsonb not null,
  audit_evidence jsonb not null,
  rollback_recovery jsonb null,
  lifecycle_summary jsonb null,
  created_at timestamptz not null default now(),
  started_at timestamptz null,
  completed_at timestamptz null,
  failed_at timestamptz null,
  blocked_at timestamptz null,
  retry_of text null,
  metadata jsonb not null default '{}'::jsonb,
  constraint deployment_runs_deployment_run_id_non_empty_check
    check (length(trim(deployment_run_id)) > 0),
  constraint deployment_runs_idempotency_key_non_empty_check
    check (length(trim(idempotency_key)) > 0),
  constraint deployment_runs_payload_hash_non_empty_check
    check (length(trim(payload_hash)) > 0),
  constraint deployment_runs_lifecycle_state_check
    check (
      lifecycle_state in (
        'draft',
        'validating',
        'ready',
        'locked',
        'executing',
        'rolling_back',
        'rollback_verification',
        'completed',
        'failed',
        'blocked',
        'manual_recovery',
        'cancelled'
      )
    ),
  constraint deployment_runs_deployment_status_check
    check (
      deployment_status in (
        'draft',
        'deploying',
        'deployed',
        'failed',
        'archived'
      )
    ),
  constraint deployment_runs_retry_of_fkey
    foreign key (retry_of)
    references public.deployment_runs (deployment_run_id)
    on delete restrict
);

-- Unique constraints on deployment_run_id and idempotency_key provide the
-- required lookup indexes for direct run reads and duplicate request checks.

create index if not exists deployment_runs_lifecycle_state_idx
  on public.deployment_runs (lifecycle_state);

create index if not exists deployment_runs_deployment_status_idx
  on public.deployment_runs (deployment_status);

create index if not exists deployment_runs_created_at_idx
  on public.deployment_runs (created_at);

create index if not exists deployment_runs_clinic_id_idx
  on public.deployment_runs (clinic_id)
  where clinic_id is not null;

create index if not exists deployment_runs_retry_of_idx
  on public.deployment_runs (retry_of)
  where retry_of is not null;

comment on table public.deployment_runs is
  'Durable evidence boundary for SteriSphere deployment attempts. Does not create operational clinic records.';

comment on column public.deployment_runs.deployment_run_id is
  'Stable deployment attempt identifier used by idempotency, audit evidence, retry, and recovery flows.';

comment on column public.deployment_runs.clinic_id is
  'Nullable until a later clinic tenancy slice creates and wires the durable clinic root.';

comment on column public.deployment_runs.idempotency_key is
  'Server-side duplicate request guard. Same key with same payload hash reads this run; same key with different payload hash is a conflict.';

comment on column public.deployment_runs.draft_snapshot is
  'Canonical reviewed DeploymentDraft snapshot used for the deployment attempt.';

comment on column public.deployment_runs.audit_evidence is
  'Canonical deployment audit evidence envelope describing what happened without causing side effects.';

comment on column public.deployment_runs.retry_of is
  'Optional self-reference to the prior deployment_run_id when this run is an approved retry.';

-- RLS planning section:
-- Do not enable RLS in RC2 Slice 2. Policies must be designed alongside
-- server-side deployment execution, super-admin authorization, support access,
-- and clinic tenancy scoping.
