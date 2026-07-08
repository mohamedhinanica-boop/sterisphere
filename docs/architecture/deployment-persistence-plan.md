# SteriSphere Deployment Persistence Plan

## RC2 Slice 1: deployment_runs Boundary

RC2 begins persistence readiness with the smallest durable boundary:
`deployment_runs`. This table is evidence-first, not clinic-creation-first.
It records the reviewed deployment attempt, idempotency identity, lifecycle
state, audit evidence, rollback/recovery evidence, and status metadata before
any downstream clinic configuration stages are allowed to persist.

This slice does not create clinics, tenants, settings, users, workstations,
sterilizers, provider plans, hardware plans, audit-log rows, or any other
deployment-stage records. It also does not enable the Setup Wizard Deploy
button or change runtime deployment behavior.

## Durable Run Model

The planned `deployment_runs` record contains:

- `id`
- `deployment_run_id`
- `clinic_id` nullable
- `idempotency_key`
- `payload_hash`
- `lifecycle_state`
- `deployment_status`
- `draft_snapshot jsonb`
- `audit_evidence jsonb`
- `rollback_recovery jsonb` nullable
- `lifecycle_summary jsonb` nullable
- `created_at`
- `started_at` nullable
- `completed_at` nullable
- `failed_at` nullable
- `blocked_at` nullable
- `retry_of` nullable
- `metadata jsonb`

The TypeScript boundary is defined by:

- `DeploymentRunRecord`
- `CreateDeploymentRunPersistencePayload`
- `StoreDeploymentRunAuditEvidencePayload`
- `DeploymentRunRepository`
- pure deployment-run payload/idempotency helpers

## RC2 Slice 2 SQL Migration Draft

`supabase_deployment_runs.sql` now contains the standalone SQL migration draft
for the `deployment_runs` table only. The SQL exists in the repository for
review and migration readiness, but it is not wired at runtime, not executed by
the app, and not connected to any Supabase client calls.

The SQL creates no operational clinic records. It does not create tenants,
settings, users, workstations, sterilizers, provider plans, hardware plans, or
stage-specific deployment records.

## Migration-ready SQL Planning

The following SQL shape is represented by `supabase_deployment_runs.sql`. It
must not be applied until the RC2 persistence implementation phase explicitly
enables migrations.

```sql
create table if not exists deployment_runs (
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
  constraint deployment_runs_deployment_run_id_non_empty_check check (length(trim(deployment_run_id)) > 0),
  constraint deployment_runs_idempotency_key_non_empty_check check (length(trim(idempotency_key)) > 0),
  constraint deployment_runs_payload_hash_required check (length(trim(payload_hash)) > 0),
  constraint deployment_runs_lifecycle_state_required check (length(trim(lifecycle_state)) > 0),
  constraint deployment_runs_deployment_status_required check (length(trim(deployment_status)) > 0),
  constraint deployment_runs_lifecycle_state_check check (
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
  constraint deployment_runs_deployment_status_check check (
    deployment_status in ('draft', 'deploying', 'deployed', 'failed', 'archived')
  ),
  constraint deployment_runs_retry_of_fkey
    foreign key (retry_of)
    references deployment_runs (deployment_run_id)
    on delete restrict
);

create index if not exists deployment_runs_lifecycle_state_idx
  on deployment_runs (lifecycle_state);

create index if not exists deployment_runs_deployment_status_idx
  on deployment_runs (deployment_status);

create index if not exists deployment_runs_created_at_idx
  on deployment_runs (created_at);

create index if not exists deployment_runs_clinic_id_idx
  on deployment_runs (clinic_id)
  where clinic_id is not null;
```

`clinic_id` is intentionally nullable in this slice. A foreign key to a future
clinic tenancy root should be added only when the clinic creation boundary is
implemented. Until then, `deployment_runs` can safely record pre-clinic
deployment evidence and blocked/failed attempts.

`retry_of` uses a self-reference to `deployment_run_id` because retry lineage is
owned by deployment-run evidence and does not require any downstream deployment
tables.

## Idempotency Rules

Server-side idempotency must be enforced before any real deployment execution:

- Same `idempotency_key` plus same `payload_hash` means the request is a safe
  retry/read of the existing deployment run.
- Same `idempotency_key` plus different `payload_hash` is a conflict and must
  be rejected.
- A new key may create a new deployment run only after lock and lifecycle
  checks prove there is no active deployment conflict.
- UI disabling is never sufficient duplicate-request protection.

The unique `idempotency_key` constraint is the durable guardrail. The payload
hash comparison explains whether a duplicate request is a replay or a conflict.
This conflict handling remains designed only; it will not execute until a later
repository wiring slice connects trusted server-side runtime code to the
deployment-run repository.

## Audit Evidence Storage Design

`draft_snapshot` stores the canonical reviewed `DeploymentDraft` consumed by
the Deployment Engine.

`audit_evidence` stores the canonical Deployment Audit Evidence Envelope. The
envelope is immutable in concept and should explain:

- reviewed draft identity
- dry-run payload diagnostics
- idempotency result
- deployment lock result
- transaction checkpoints
- lifecycle transitions
- rollback verification
- recovery plan
- final deployment outcome

`rollback_recovery` and `lifecycle_summary` are nullable because a newly
created run may not have reached rollback or terminal lifecycle evaluation.
When present, they make retry safety auditable without reading UI state or
downstream deployment tables.

## Boundary Confirmation

This plan introduces no real persistence. The repository contract is inert,
and the existing simulated Deployment Engine remains simulation-first. Future
RC2 work may replace only the `Create Deployment Run` simulated stage with
repository-backed deployment-run persistence while leaving clinic creation and
all downstream stages simulated until their own slices are explicitly approved.

## RC2 Slice 3 Supabase Repository Implementation

`deployment-run-supabase-repository.ts` now contains a concrete
`SupabaseDeploymentRunRepository` for `deployment_runs` only. The repository is
available as an implementation boundary but is not wired into the Deployment
Engine, Setup Wizard, routes, API handlers, or any runtime deployment path.

The implementation supports:

- `findByDeploymentRunId()`
- `findByIdempotencyKey()`
- `createDeploymentRun()`
- `updateLifecycleState()`
- `updateAuditEvidence()`
- `attachRollbackRecovery()`
- `markCompleted()`
- `markFailed()`
- `markBlocked()`

It maps between the TypeScript deployment-run contracts and the SQL
`deployment_runs` column shape. It does not create clinic records, execute
deployment stages, mutate draft contents, or persist any downstream stage data.

Idempotency behavior remains evidence-scoped:

- same idempotency key and same payload hash returns the existing run;
- same idempotency key and different payload hash throws a typed conflict;
- unique-constraint races re-read the existing run before deciding whether the
  request is a safe replay or a conflict.

Because no runtime code calls this repository yet, conflict handling is
implemented but not operationally executed by the application.

## RC2 Slice 4 Server Boundary Design

`deployment-run-service.ts` defines the server-only orchestration boundary that
will later own `deployment_runs` persistence. The service is intentionally not
barrel-exported from the deployment module, not used by the Deployment Engine,
not exposed through an API route, and not called by the Setup Wizard or any UI.
Only its type contracts are exported for planning and review.

The service accepts an injected `DeploymentRunRepository` and supports:

- `createOrReuseDeploymentRun()`
- `resumeDeploymentRun()`
- `evaluateDeploymentRunPersistenceDecision()`

The type boundary includes:

- `DeploymentRunCreateCommand`
- `DeploymentRunCreateResult`
- `DeploymentRunResumeCommand`
- `DeploymentRunResumeResult`
- `DeploymentRunPersistenceDecision`

The server decision flow is:

1. Normalize and validate the idempotency key.
2. Reject missing or invalid idempotency before any repository write.
3. Resolve the payload hash from the command or canonical deployment draft.
4. Read the existing deployment run by idempotency key.
5. Reuse the existing run when the payload hash matches.
6. Return a conflict when the same key points to a different payload hash.
7. Build and persist only a `deployment_runs` payload when the key is new.

The service does not create clinic records, execute deployment stages, mutate
draft contents, call `DeploymentEngine.execute()`, or persist anything outside
`deployment_runs`.

## RC2 Slice 5 Service Harness

`deployment-run-test-repository.ts` and `deployment-run-service.test.ts` define
an in-memory validation harness for the server boundary. The harness is pure
TypeScript and compile-checked by the normal build; it does not call Supabase,
does not create API routes, and does not import UI or the Deployment Engine.

The harness covers:

- new idempotency key creates a `deployment_runs` evidence record;
- same idempotency key plus same payload hash reuses the existing run;
- same idempotency key plus different payload hash returns conflict;
- missing idempotency key rejects before write;
- missing payload hash rejects before write;
- resuming an existing deployment run succeeds;
- resuming a missing deployment run returns not found;
- forbidden clinic, tenant, settings, user, stage, and engine counters remain
  zero.

The repository fake is intentionally limited to the `DeploymentRunRepository`
interface. It cannot create clinic records or execute deployment stages, which
keeps the test harness aligned with the RC2 persistence-readiness boundary.

## RC2.5 Slice 1 Server-only Runtime Wiring

`deployment-run-server.ts` is the private server-only composition point for deployment-run persistence. It imports `server-only`, accepts a trusted server-side Supabase client, creates a `SupabaseDeploymentRunRepository`, and returns a `DeploymentRunService`.

The helper `createOrReuseServerDeploymentRun()` maps a server command into the existing `DeploymentRunCreateCommand`, filling only deployment-run identifiers and the creation timestamp when they are not provided. The service still owns idempotency validation, payload-hash comparison, create/reuse/conflict decisions, and the final repository call.

This slice wires runtime persistence for `deployment_runs` only. It does not export the helper through the deployment barrel, expose an API route, change the Setup Wizard, change the Deploy button, call `DeploymentEngine.execute()`, or create clinics, tenants, settings, users, providers, sterilizers, packs, cycles, traces, audit logs, or downstream stage records.

## RC2.5 Slice 2 Server Boundary Smoke Harness

`deployment-run-smoke-harness.ts` is a private server-only smoke harness for the RC2.5 runtime wiring. It imports `server-only`, uses `createOrReuseServerDeploymentRun()`, and exercises only the `deployment_runs` repository path.

The harness verifies:

- a new idempotency key creates one `deployment_runs` row;
- the same idempotency key and same payload hash reuses that row;
- the same idempotency key and a different payload hash returns conflict.

The harness is not exported from `lib/modules/deployment/index.ts`, not used by the app runtime, and not reachable from UI, routes, the Setup Wizard, the Deploy button, or `DeploymentEngine`.

### Manual Smoke Execution

Run this only from a trusted local/server environment with a Supabase client that can select and insert `deployment_runs`. With RLS enabled, this normally means using the service-role key on the server. Never expose the service-role key to browser code.

1. Set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in the local server shell.
2. Create a temporary local script outside app routes that imports `createClient` from `@supabase/supabase-js` and imports `runDeploymentRunSmokeHarness()` plus `createDeploymentRunSmokeHarnessInput()` from `lib/modules/deployment/deployment-run-smoke-harness`.
3. Build a label such as `rc25-slice2-YYYYMMDD-HHMM`.
4. Create the server Supabase client with the service-role key.
5. Call `runDeploymentRunSmokeHarness(client, createDeploymentRunSmokeHarnessInput(label))`.
6. Confirm the result has `passed: true` and step statuses `created`, `reused`, and `conflict`.
7. Confirm Supabase contains exactly one smoke row for the generated `idempotencyKey`.

Example verification SQL:

```sql
select deployment_run_id, idempotency_key, payload_hash, metadata
from deployment_runs
where idempotency_key = 'deployment-run-smoke-rc25-slice2-YYYYMMDD-HHMM';
```

Expected result: one row. The row should have `metadata->>'smokeHarness' = 'deployment_runs_only'`.

Cleanup SQL:

```sql
delete from deployment_runs
where idempotency_key = 'deployment-run-smoke-rc25-slice2-YYYYMMDD-HHMM'
  and deployment_run_id = 'deployment-run-smoke-rc25-slice2-YYYYMMDD-HHMM'
  and metadata->>'smokeHarness' = 'deployment_runs_only';
```

## RC2.5 Slice 3 First Runtime Deployment Run Persistence

The Setup Wizard Complete step now performs the first real runtime persistence operation: it calls a server action that creates or reuses exactly one `deployment_runs` record for the reviewed `DeploymentDraft`. The action uses the existing server-only `DeploymentRunService` wiring and `SupabaseDeploymentRunRepository`.

Runtime behavior remains deployment-run-only:

- the Review step freezes the canonical reviewed `DeploymentDraft` snapshot;
- the Complete step calls the server action with that reviewed draft;
- the server computes the payload hash and deterministic idempotency key;
- the server builds simulated audit evidence and lifecycle summary;
- the server creates or reuses a `deployment_runs` row;
- the UI reports whether the run was persisted, reused, rejected, or conflicted;
- clinic creation and operational setup remain simulated and inactive.

The deterministic idempotency key is scoped to the reviewed deployment target. Retrying the same reviewed draft reuses the existing deployment run. Reusing the same deployment target with a different payload hash returns a safe conflict and does not create operational clinic data.

Security and RLS assumptions remain server-only. The server action creates its Supabase client from `SUPABASE_URL` or `NEXT_PUBLIC_SUPABASE_URL` plus `SUPABASE_SERVICE_ROLE_KEY`. The service-role key must never be exposed to browser code. This slice does not add a public API route.

Manual verification SQL for the expected deployment run:

```sql
select deployment_run_id, idempotency_key, payload_hash, clinic_id, metadata
from deployment_runs
where idempotency_key = 'setup-deployment:YOUR-CLINIC-CODE';
```

Expected result: one row. `clinic_id` must be null, and metadata should include `boundary = 'deployment_runs_only'` and `clinicCreationSimulated = true`.

Manual boundary checks should confirm that no clinic, tenant, settings, user, provider, sterilizer, workstation, pack, cycle, trace, audit-log, or downstream deployment-stage records were created by the Complete-step action.
