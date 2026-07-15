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

## RC2.5 Slice 4 Deployment Session Identity and Completion UX

Deployment identity is now separated from editable clinic profile data. The Setup Wizard owns an immutable `setupSessionId` for the local deployment session, and the server action derives `deployment_runs.idempotency_key` from that session identity rather than from `clinicProfile.clinicCode`.

Session identity model:

- `setupSessionId` is created when `SetupState` is created.
- `clinicCode` remains editable clinic profile data only.
- The runtime idempotency key is `setup-deployment-session:{setupSessionId}`.
- The deployment run identifier is `deployment-run-{setupSessionId}`.
- The deployment run metadata stores both `deploymentSessionId` and the current clinic code for support context, but clinic code is not the idempotency boundary.

After a deployment run is persisted or reused, the Complete step locks previous wizard navigation by disabling Back to Review. The explicit Start Over fallback creates a fresh setup state and a new session identity.

Completion UX is designed for later clinic activation without enabling it now. The Complete step includes a disabled Access SteriSphere Platform button for future automatic redirect/workspace access, a Start Over fallback, and a Contact Support link. Contact Support pre-fills deployment/session context: deployment session id, deployment run id, idempotency key, payload hash, status, and server message.

The persistence boundary remains `deployment_runs` only. No clinic, tenant, settings, user, provider, sterilizer, workstation, pack, cycle, trace, audit-log, or downstream deployment-stage record is created by this slice.

## RC3 Slice 1 Clinic Root Persistence Design

RC3 starts with a design-only clinic-root boundary. The new TypeScript foundation describes how a reviewed DeploymentDraft.clinicProfile will later become one non-operational clinics row and how the existing deployment_runs.clinic_id value will be linked after the clinic root exists.

The boundary is represented by:

- deployment-clinic-types.ts
- deployment-clinic-payload.ts
- deployment-clinic-repository.ts
- deployment-clinic-service.ts

The model is intentionally narrow. It supports DeploymentClinicRecord, CreateDeploymentClinicPayload, DeploymentClinicCreateCommand, DeploymentClinicCreateResult, and DeploymentClinicLinkResult. The service can build the clinic insert payload, create or reuse a clinic root for an existing deployment run, link the clinic to deployment_runs.clinic_id, and perform the combined clinic-root flow.

Rules for the future implementation:

- the deployment_runs record must already exist;
- an existing deployment_runs.clinic_id reuses the linked clinic;
- a matching clinic_code from another deployment session conflicts;
- new clinics start as draft and non-operational;
- deployment_runs.clinic_id is linked only after clinic insert or reuse succeeds;
- no settings, users, providers, sterilizers, workstations, packs, cycles, traces, audit logs, or downstream deployment stages are created.

This slice does not wire runtime execution. DeploymentEngine.execute() remains simulated, the full deployment repository remains inert, no UI or Setup Wizard path imports the clinic service, and no Supabase clinic writes are enabled yet.

## RC3 Slice 2 Clinics SQL / Schema Verification

supabase_clinics_preflight.sql is a select-only production preflight script for the future clinic-root persistence slice. It inspects public.clinics, its columns, constraints, indexes, triggers, RLS policies, and the existing deployment_runs.clinic_id link column. It must not insert clinics or mutate deployment data.

The RC3 clinic-root boundary expects public.clinics to provide:

- id uuid primary key default gen_random_uuid();
- name text not null;
- legal_name text;
- clinic_code text not null with a unique constraint or unique index;
- country text not null;
- province_state text not null;
- timezone text not null;
- primary_language text not null;
- nullable phone, email, website, address_street, address_city, and address_postal_code;
- deployment_status text not null default 'draft' constrained to draft, deploying, deployed, failed, and archived;
- nullable deployed_at, deployment_version, and schema_version;
- created_at timestamptz not null default now();
- updated_at timestamptz not null default now() with update maintenance.

The existing supabase_deployment_core.sql planning shape matches the current clinic-root TypeScript payload shape. RC3 Slice 3 remains blocked until the production preflight confirms that public.clinics exists, clinic_code is unique, deployment_runs.clinic_id exists and is nullable, and the RLS posture is intentionally approved for server-only service-role writes.

## RC3 Slice 2B Clinics SQL Migration Draft

Production Supabase does not currently have public.clinics, so RC3 adds a dedicated clinics-only migration draft in supabase_clinics.sql. The file creates only the canonical clinic root table and does not mutate deployment_runs, insert clinic rows, create settings, users, memberships, providers, sterilizers, workstations, packs, cycles, traces, audit logs, or any downstream deployment-stage records.

The migration includes:

- public.clinics with uuid primary key, required clinic profile fields, nullable contact and address fields, deployment lifecycle fields, deployment/schema versions, and created/updated timestamps;
- non-empty checks for name and clinic_code;
- allowed deployment_status values of draft, deploying, deployed, failed, and archived;
- unique clinic_code through the table constraint;
- lookup indexes for deployment_status and created_at;
- an updated_at trigger using public.set_clinics_updated_at();
- a trigger function with a fixed search_path for security hardening;
- RLS enabled immediately.

No RLS policies are created in this slice. RC3 clinic-root writes are expected to use trusted server-only service-role Supabase access plus explicit application authorization checks. Browser clients must not insert or update clinics.

After applying supabase_clinics.sql, run supabase_clinics_preflight.sql to verify table existence, columns, constraints, indexes, trigger registration, RLS status, and the existing deployment_runs.clinic_id link column before enabling any clinic-root runtime persistence.

## RC3 Slice 3 Inert Supabase Clinic Repository

RC3 Slice 3 adds deployment-clinic-supabase-repository.ts as a concrete Supabase adapter for the clinic-root repository contract. The adapter is server-only and remains unused by runtime deployment until a later approved server composition slice explicitly imports it.

The repository supports:

- findClinicById() against public.clinics;
- findClinicByCode() against public.clinics;
- createClinic() with inserts limited to public.clinics;
- linkClinicToDeploymentRun() with updates limited to deployment_runs.clinic_id.

Clinic creation maps the TypeScript clinic-root payload to the public.clinics columns and always writes deployment_status as draft with deployed_at null. It does not mark a clinic deployed and does not create clinic settings, users, providers, sterilizers, workstations, packs, cycles, traces, audit logs, planning records, or any downstream deployment-stage records.

Duplicate clinic_code handling is explicit. The repository pre-reads by clinic code before insert and also converts unique-constraint races into DeploymentClinicCodeConflictError with the existing clinic attached when available. Deployment-run linking rejects missing runs, missing clinics, and attempts to attach a run that is already linked to a different clinic root.

## RC3 Slice 4 Clinic Root Service Harness

RC3 Slice 4 adds a pure TypeScript in-memory harness for the clinic-root service before any runtime wiring. deployment-clinic-test-repository.ts implements the DeploymentClinicRepository contract with local maps only, and deployment-clinic-service.test.ts compile-checks the create, link, retry, and conflict scenarios.

The harness verifies that a deployment run must exist before clinic creation, a clinic root can be created from an existing run, deployment_runs.clinic_id is linked after clinic creation, retrying the same run reuses the linked clinic, the same clinic_code from a different session conflicts, and linking a run already attached to another clinic returns an explicit conflict.

The in-memory repository tracks forbidden-boundary counters for settings, providers, sterilizers, workstations, packs, cycles, traces, and audit logs. These counters remain zero in the harness. The harness does not call Supabase, does not import UI or Setup Wizard code, does not call DeploymentEngine.execute(), and does not create downstream deployment records.

## RC3 Slice 5 Server-only Clinic Root Runtime Helper

RC3 Slice 5 adds deployment-clinic-server.ts as the private server-only composition point for first real clinic-root persistence. It accepts a trusted server Supabase client, composes SupabaseDeploymentClinicRepository, SupabaseDeploymentRunRepository, and DeploymentClinicService, and can create or reuse a draft clinic root for an existing deployment run.

The helper remains private. It is not exported from the deployment barrel, not imported by UI, not exposed through a route, and not wired to the Setup Wizard, Deploy button, or DeploymentEngine.execute(). It may touch only public.clinics and deployment_runs.clinic_id.

RC3 Slice 5 also adds deployment-clinic-smoke-harness.ts. The smoke harness requires caller-provided deployment_run ids. It does not create deployment_runs. It can verify create/reuse for one existing run and, when a second existing run id is supplied, conflict behavior for the same clinic_code from a different deployment run.

Manual smoke steps:

1. Apply supabase_clinics.sql if public.clinics is not already present.
2. Run supabase_clinics_preflight.sql and confirm public.clinics exists, RLS is enabled, clinic_code is unique, and deployment_runs.clinic_id exists.
3. Create or identify one existing deployment_runs row with clinic_id null for the smoke target.
4. Optionally create or identify a second existing deployment_runs row with clinic_id null for the same clinic_code conflict check.
5. From a trusted local/server-only script, create a service-role Supabase client and call runDeploymentClinicSmokeHarness() with the existing deployment_run id, optional conflictDeploymentRunId, and reviewed DeploymentDraft.
6. Confirm the first step creates or reuses one draft clinic root.
7. Confirm the retry step returns reused and creates no duplicate clinic.
8. Confirm the optional conflict step returns conflict.
9. Confirm no settings, users, providers, sterilizers, workstations, packs, cycles, traces, audit logs, or downstream records were created.

Verification SQL:

`sql
select id, clinic_code, deployment_status, deployed_at, deployment_version, schema_version, created_at
from public.clinics
where clinic_code = 'YOUR_SMOKE_CLINIC_CODE';

select deployment_run_id, clinic_id, idempotency_key, payload_hash
from public.deployment_runs
where deployment_run_id in ('YOUR_DEPLOYMENT_RUN_ID', 'YOUR_OPTIONAL_CONFLICT_RUN_ID');
`

Expected result: one clinic row for the smoke clinic_code with deployment_status = 'draft' and deployed_at is null. The primary smoke deployment_runs row should have clinic_id equal to that clinic id. The optional conflict deployment run should remain clinic_id null.

Cleanup SQL for a test clinic root:

`sql
update public.deployment_runs
set clinic_id = null
where deployment_run_id in ('YOUR_DEPLOYMENT_RUN_ID', 'YOUR_OPTIONAL_CONFLICT_RUN_ID')
  and clinic_id = 'YOUR_TEST_CLINIC_ID';

delete from public.clinics
where id = 'YOUR_TEST_CLINIC_ID'
  and deployment_status = 'draft'
  and deployed_at is null
  and clinic_code = 'YOUR_SMOKE_CLINIC_CODE';
`

Recovery if clinic insert succeeds but deployment_run linking fails:

1. Keep the deployment run as durable evidence.
2. Query for a draft clinic with the reviewed clinic_code and deployed_at is null.
3. If the clinic belongs to the failed smoke attempt and no operational records exist, either link the deployment run to that clinic id through a controlled server repair or delete the draft clinic shell with the cleanup query above.
4. Do not mark the clinic deployed.
5. Do not create downstream records as part of recovery.

## RC3 Slice 6 - Setup Runtime Clinic Root Wiring

The Setup Complete server action now persists runtime evidence in two ordered server-only steps:

1. Create or reuse the `deployment_runs` row using the immutable setup session id idempotency key and reviewed draft payload hash.
2. Only after the deployment run succeeds, create or reuse one draft `public.clinics` root and link `deployment_runs.clinic_id` to that clinic id.

The runtime boundary is limited to `public.clinics` and `deployment_runs.clinic_id`. The clinic root remains `deployment_status = 'draft'`; it is not marked deployed and it does not activate platform access. Settings, users, providers, sterilizers, workstations, packs, cycles, traces, audit logs, and downstream stage records remain simulated/not persisted.

If clinic-root persistence fails after the deployment run is durable, the UI reports the deployment run as durable evidence and reports the clinic root as unlinked or conflicted. The safe recovery path is to inspect the deployment run and draft clinic shell, then either retry the same setup session or manually link only after confirming the clinic root belongs to that deployment run.

Manual verification queries:

```sql
select deployment_run_id, idempotency_key, payload_hash, clinic_id, created_at
from public.deployment_runs
where deployment_run_id = '<deployment-run-id>';

select id, name, clinic_code, deployment_status, deployed_at, deployment_version, schema_version, created_at, updated_at
from public.clinics
where id = '<clinic-id>';

select id, clinic_code, deployment_status, deployed_at
from public.clinics
where clinic_code = '<clinic-code>';
```

## RC4 Slice 1 - Clinic Settings Provisioning

After a deployment run and draft clinic root are successfully created or reused, the setup server action now provisions exactly one `public.clinic_settings` row for the linked draft clinic.

Runtime write order:

1. `deployment_runs` create/reuse by setup session idempotency key and payload hash.
2. `public.clinics` create/reuse in `deployment_status = 'draft'`.
3. `deployment_runs.clinic_id` link/reuse.
4. `public.clinic_settings` create/reuse by `clinic_id`.

The clinic settings provisioner requires an existing clinic root before it inserts settings. On retry it looks up `clinic_settings` by `clinic_id` and reuses the existing row. If settings creation fails, the durable deployment run and draft clinic root remain in place; no rollback is performed and no additional downstream records are created.

Manual verification queries:

```sql
select deployment_run_id, clinic_id
from public.deployment_runs
where deployment_run_id = '<deployment-run-id>';

select id, clinic_code, deployment_status
from public.clinics
where id = '<clinic-id>';

select id, clinic_id, clinic_name, pack_expiration_days, created_at, updated_at
from public.clinic_settings
where clinic_id = '<clinic-id>';
```

RC4 Slice 1 schema assumption: `public.clinic_settings.clinic_id` must exist and be unique for strict duplicate prevention. The provisioner pre-reads by `clinic_id` and resolves unique conflicts as reuse; production verification should confirm the `clinic_id` uniqueness constraint before broad rollout.

## RC4 Slice 1B - clinic_settings clinic_id Migration

Production `public.clinic_settings` currently exists as a legacy/global settings table without `clinic_id`. RC4 Slice 1 provisioning needs per-clinic linkage before it can safely create exactly one settings row for each deployed draft clinic.

Migration draft: `supabase_clinic_settings_clinic_id.sql`.

The draft keeps compatibility with the existing global/default settings row by adding `clinic_id uuid null` first. It then adds a foreign key to `public.clinics(id)` with `on delete restrict` and a partial unique index on `clinic_id where clinic_id is not null`. This allows legacy rows with `clinic_id is null` to remain untouched while enforcing one linked clinic-specific settings row per clinic for RC4 provisioning.

RC4 provisioning behavior after this migration:

- Existing unlinked legacy settings remain unlinked.
- New deployment-created clinics receive linked clinic-specific settings rows.
- Retry for the same clinic reuses the linked settings row.
- A different deployment cannot create a duplicate settings row for the same clinic id.
- A later cleanup/migration can decide whether to migrate, archive, or keep the legacy unlinked settings row.

Preflight and verification queries are included in the SQL draft. The key post-migration checks are:

```sql
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'clinic_settings'
  and column_name = 'clinic_id';

select conname, pg_get_constraintdef(oid)
from pg_constraint
where conrelid = 'public.clinic_settings'::regclass
  and conname = 'clinic_settings_clinic_id_fkey';

select indexname, indexdef
from pg_indexes
where schemaname = 'public'
  and tablename = 'clinic_settings'
  and indexname = 'clinic_settings_clinic_id_unique_idx';

select clinic_id, count(*)
from public.clinic_settings
where clinic_id is not null
group by clinic_id
having count(*) > 1;
```

## RC4 Slice 2A - Providers Schema Preflight and Migration Draft

Provider provisioning remains design-only. The reviewed setup draft currently contains provider counts, not named operational people. `public.providers` is used by Settings and Traceability as a named provider directory with fields such as `first_name`, `last_name`, `title`, `display_name`, `full_name`, `role`, and `active`.

Created SQL drafts:

- `supabase_providers_preflight.sql` inspects provider columns, constraints, indexes, RLS status, triggers, row counts, role/active distribution, and whether deployment linkage columns already exist.
- `supabase_providers_deployment_fields.sql` prepares future clinic-scoped provider-shell provisioning by adding nullable deployment metadata only.

Migration draft behavior:

- Adds `clinic_id uuid null` with FK to `public.clinics(id)` using `on delete restrict`.
- Adds `deployment_provider_key text null` for deterministic future shell keys such as `dentist-001`.
- Adds `provisioning_source text null` for provenance such as `setup_draft`.
- Adds `provisioning_status text not null default 'active'` with allowed values `placeholder`, `active`, and `archived`.
- Adds `providers_clinic_id_idx` for clinic-scoped provider lookups.
- Adds partial unique index `(clinic_id, deployment_provider_key) where deployment_provider_key is not null` for idempotent future deployment-created shells.

Legacy compatibility:

- Existing global providers remain valid with `clinic_id is null`.
- Existing Settings-managed named providers are not forced into a clinic.
- Existing provider app behavior is not changed by this draft.
- Manually named providers remain Settings-managed.
- Future deployment-created provider shells must be explicitly marked with placeholder semantics and deterministic keys.
- No fake person rows should be created from count-only draft data without placeholder semantics.

Future runtime provider provisioning should run only after `deployment_runs`, draft clinic root, and `clinic_settings` are durable. It should create or reuse clinic-scoped placeholder/provider-shell records by deterministic `deployment_provider_key`; it should not create operational named staff from counts alone.

## RC4 Slice 2B - Provider Provisioning Foundation

RC4 Slice 2B adds the inert TypeScript foundation for clinic-scoped provider shell provisioning. It is not wired into runtime execution, the Setup Wizard, the Deploy button, `DeploymentEngine.execute()`, routes, UI, or the deployment barrel.

Provider shells are placeholders derived only from reviewed draft counts. They require an existing `clinic_id` and an already-provisioned `clinic_settings` row before any shell creation is allowed. Shell keys are deterministic per clinic:

- `dentist-001`, `dentist-002`, ...
- `hygienist-001`, ...
- `assistant-001`, ...
- `receptionist-001`, ...
- `treatment-coordinator-001`, ...
- `sterilization-technician-001`, ...
- `office-manager-001`, ...

The field mapping intentionally avoids fake people:

- `clinic_id` = existing draft clinic id.
- `deployment_provider_key` = deterministic shell key.
- `provisioning_source` = `setup_draft`.
- `provisioning_status` = `placeholder`.
- `first_name` / `last_name` = null.
- `title` = role placeholder label such as `Dentist Placeholder`; `display_name` and `full_name` = globally unique placeholder labels such as `Dentist Placeholder 001 - <clinic-id-short>`.
- `role` = the planned provider category label.
- `active` = false so shells do not appear in legacy active-provider clinical selection before a future activation/naming workflow.

Idempotency is key-based. Retrying the same clinic/draft reuses existing shells, partial retries create only missing keys, duplicate keys within one clinic are treated as conflicts/skips, and the same key may exist for different clinics. Legacy global providers with `clinic_id is null` are ignored. The foundation creates no downstream sterilizer, workstation, hardware, pack, cycle, trace, user, or audit records.

## RC4 Slice 2C - Provider Supabase Repository Implementation

RC4 Slice 2C adds `deployment-provider-supabase-repository.ts` as the concrete Supabase adapter for the provider-shell repository contract. The adapter is server-only and remains unused by runtime deployment, Setup Wizard actions, UI, routes, the Deploy button, and `DeploymentEngine.execute()`.

The repository write surface is limited to `public.providers` inserts for inactive setup-draft placeholders. It maps provider shell payloads to:

- `clinic_id`
- `deployment_provider_key`
- `provisioning_source = setup_draft`
- `provisioning_status = placeholder`
- `first_name = null`
- `last_name = null`
- placeholder `title`, plus globally unique placeholder `display_name` and `full_name`
- provider category `role`
- `active = false`

The adapter never updates or deletes provider rows and never mutates legacy global providers where `clinic_id is null`. It pre-reads `(clinic_id, deployment_provider_key)` before insert, reuses an existing inactive setup-draft placeholder, and reports a conflict if that key belongs to a non-placeholder provider record. Unique constraint races are handled by re-reading the same clinic/key pair and resolving to reuse or safe conflict. No sterilizer, workstation, hardware, pack, cycle, trace, user, audit, activation, or downstream records are created.

## RC4 Slice 2E - Setup Runtime Provider Shell Provisioning

The Setup Complete server action now provisions provider placeholder shells after the prior runtime persistence boundaries succeed. The ordered runtime path is:

1. Create or reuse `deployment_runs` by setup-session idempotency key and payload hash.
2. Create or reuse the draft `public.clinics` root and link `deployment_runs.clinic_id`.
3. Create or reuse the linked `public.clinic_settings` row.
4. Create or reuse inactive provider placeholder shells in `public.providers` for the linked `clinic_id`.

Provider shell provisioning consumes the reviewed `DeploymentDraft.providerPlan` counts and produces deterministic keys such as `dentist-001`, `hygienist-001`, and `assistant-001`. Runtime-created shell rows remain placeholders: `provisioning_source = setup_draft`, `provisioning_status = placeholder`, first/last names are null, `title` is the role placeholder, `display_name` and `full_name` include a short clinic-id suffix for the global full-name uniqueness index, and `active = false`.

Retry behavior is idempotent through `(clinic_id, deployment_provider_key)`. Re-running the same reviewed setup session reuses existing shells, while partial existing shells create only missing keys. Legacy global providers with `clinic_id is null` are not updated, deleted, or reused for deployment shell matching.

This slice does not create sterilizers, workstations, hardware devices, packs, cycles, traces, users, audit logs, activation records, or downstream deployment-stage records. Access to the SteriSphere platform remains disabled and downstream provisioning remains simulated.

Manual verification queries:

```sql
select deployment_run_id, clinic_id
from public.deployment_runs
where deployment_run_id = '<deployment-run-id>';

select id, clinic_code, deployment_status
from public.clinics
where id = '<clinic-id>';

select id, clinic_id
from public.clinic_settings
where clinic_id = '<clinic-id>';

select clinic_id, deployment_provider_key, provisioning_source, provisioning_status, active, first_name, last_name, display_name, full_name
from public.providers
where clinic_id = '<clinic-id>'
order by deployment_provider_key;

select clinic_id, deployment_provider_key, count(*)
from public.providers
where clinic_id = '<clinic-id>'
  and deployment_provider_key is not null
group by clinic_id, deployment_provider_key
having count(*) > 1;

select count(*) as legacy_global_provider_rows
from public.providers
where clinic_id is null;
```

## RC4 Slice 3 - Sterilizer Provisioning Design

Sterilizer provisioning remains design-only in this slice. No runtime path, Setup Wizard action, Deploy button, UI, route, `DeploymentEngine.execute()`, repository wiring, or sterilizer insert is changed.

### Readiness verdict

Not ready for runtime provisioning until a sterilizer schema preflight and migration draft are completed. The local app contract shows `public.sterilizers` is currently used as an operational equipment directory with `id`, `name`, `type`, `active`, and `created_at`. No checked-in SQL definition for `public.sterilizers` was found in this repo, so the live table must be verified before implementation.

### Current usage findings

Settings reads all sterilizers, inserts new rows with `name`, `type`, and `active = true`, toggles `active`, and treats duplicate name errors (`23505`) as existing sterilizers. Cycle-start flows read only `active = true` sterilizers and store the selected sterilizer as a string on cycle records. Because active sterilizers are selectable in clinical workflows, deployment-created sterilizer rows must start inactive and must not be marked operational by setup provisioning.

The reviewed `DeploymentDraft.sterilizers` shape is itemized rather than count-only. Each draft row carries a local draft id, display name, type, manufacturer, model, serial number, optional assigned workstation draft id, and status. When display name or equipment identifiers were reviewed, the row represents planned real equipment. If the row only contains generated/default setup values or lacks identifying details, the provisioned row should be treated as a draft equipment shell, not as verified operational hardware.

### Required schema changes

A safe sterilizer deployment migration should preserve legacy/global sterilizers and add nullable deployment metadata:

- `clinic_id uuid null` with a foreign key to `public.clinics(id)` using `on delete restrict`.
- `deployment_sterilizer_key text null` for deterministic keys such as `sterilizer-001`.
- `provisioning_source text null`, expected value `setup_draft` for setup-created rows.
- `provisioning_status text not null default 'active'` with allowed values `planned`, `active`, and `archived`.
- Equipment detail columns should be handled in a later slice only after the live schema proves whether manufacturer, model, serial-number, or workstation-link fields already exist.

Expected indexes and constraints:

```sql
create index if not exists sterilizers_clinic_id_idx
  on public.sterilizers (clinic_id)
  where clinic_id is not null;

create unique index if not exists sterilizers_clinic_deployment_key_unique_idx
  on public.sterilizers (clinic_id, deployment_sterilizer_key)
  where deployment_sterilizer_key is not null;

-- A clinic-scoped name uniqueness change is intentionally deferred until the
-- preflight proves whether current name uniqueness is global or absent.
```

Do not remove any existing global name uniqueness constraint until a separate compatibility migration is designed. If a global unique index on `lower(trim(name))` exists, deployment-generated names must include a readable clinic suffix or the migration must move uniqueness to a clinic-scoped partial index without breaking legacy rows. That decision requires live preflight evidence.

### Field mapping

Future payload mapping from `DeploymentDraftSterilizer` to `public.sterilizers` should be:

- `clinic_id` = existing draft clinic id.
- `deployment_sterilizer_key` = deterministic sequence key in reviewed draft order: `sterilizer-001`, `sterilizer-002`, etc.
- `name` = reviewed `displayName` when non-empty; if generated/default, keep readable shell naming and include a short clinic suffix if global name uniqueness requires it.
- `type` = reviewed `sterilizerType` / setup `type`.
- `manufacturer` = reviewed manufacturer/brand when the column exists.
- `model` = reviewed model when the column exists.
- `serial_number` = reviewed serial number when the column exists.
- `assigned_workstation_id` = null until workstation persistence creates durable workstation ids; retain only draft assignment in deployment evidence or future metadata.
- `provisioning_source` = `setup_draft`.
- `provisioning_status` = `planned` for future setup-created sterilizer rows until a later activation workflow changes it.
- `active` = false for all setup-created rows in this slice family, regardless of draft status, because activation requires a later operational readiness workflow.

### Idempotency and conflicts

Retry and partial retry must be keyed by `(clinic_id, deployment_sterilizer_key)`. A retry reuses existing rows with matching clinic/key and compatible `provisioning_source = setup_draft`. Missing keys may be created later by the implementation slice. Duplicate keys within the same clinic are conflicts and should be skipped with explicit counts. The same deterministic key may exist in different clinics.

Existing legacy/global sterilizers with `clinic_id is null` must never be auto-attached, renamed, updated, activated, or reused for deployment matching. Name or serial-number collisions against legacy rows should surface as conflicts unless the future migration proves they are safely clinic-scoped.

### Recovery model

If a future sterilizer insert fails after deployment run, clinic root, clinic settings, and provider shells are durable, those upstream records remain evidence and are not rolled back by this slice family. Recovery is retry-first for missing deterministic keys. If a name or unique-key conflict blocks retry, support should inspect the linked clinic, deployment run, and sterilizer rows, then either resolve the conflicting row manually or rerun after a migration fix. No recovery path should activate sterilizers, create cycles, create workstations, or attach legacy global sterilizers automatically.

### Safest next implementation slice

The safest next slice is `RC4 Slice 3A - Sterilizers Schema Preflight and Migration Draft`:

1. Create a select-only preflight for `public.sterilizers` columns, constraints, indexes, triggers, RLS, active/name distribution, and duplicate lower-trimmed names.
2. Draft a nullable metadata migration that adds clinic/deployment/provisioning fields without changing existing legacy rows.
3. Decide from live evidence whether global `name` uniqueness exists and whether setup-created names need a clinic suffix.
4. Do not add a TypeScript repository or runtime provisioning until the schema is verified.

## RC4 Slice 3A - Sterilizers Schema Preflight and Migration Draft

RC4 Slice 3A adds SQL-only preparation for future sterilizer provisioning. It does not wire runtime execution, change UI, change the Setup Wizard, change the Deploy button, call `DeploymentEngine.execute()`, insert sterilizers, or persist workstations, hardware, packs, cycles, traces, users, or audit records.

Created SQL drafts:

- `supabase_sterilizers_preflight.sql` is read-only and inspects today's `public.sterilizers` table.
- `supabase_sterilizers_deployment_fields.sql` adds nullable deployment metadata for a later sterilizer provisioner.

The preflight checks:

- table existence;
- columns, constraints, indexes, RLS status, and triggers;
- total existing sterilizer row count;
- active/inactive distribution through the existing `active` field;
- whether `clinic_id`, `deployment_sterilizer_key`, `provisioning_source`, and `provisioning_status` already exist;
- whether any unique index appears to enforce global lower-trimmed `name` uniqueness;
- duplicate lower-trimmed sterilizer names in current data.

The migration draft preserves existing rows and current app behavior:

- Adds `clinic_id uuid null` with FK to `public.clinics(id)` using `on delete restrict`.
- Adds `deployment_sterilizer_key text null`.
- Adds `provisioning_source text null`.
- Adds `provisioning_status text not null default 'active'`.
- Adds `sterilizers_provisioning_status_check` for `planned`, `active`, and `archived`.
- Adds `sterilizers_clinic_id_idx` for clinic-scoped lookup.
- Adds partial unique index `(clinic_id, deployment_sterilizer_key) where deployment_sterilizer_key is not null`.

Legacy compatibility:

- Existing sterilizers remain valid with `clinic_id is null`.
- Existing global sterilizers are not forced into a clinic.
- Existing Settings-created sterilizers keep `provisioning_status = active` by default.
- The migration does not change existing active/inactive behavior.
- Any future setup-created sterilizer rows should be clinic-scoped, use deterministic deployment keys such as `sterilizer-001`, keep `active = false`, and use `provisioning_status = planned` until a later activation workflow intentionally enables operational use.

Workstation assignment remains deferred because workstation persistence does not yet create durable workstation ids. Setup draft workstation assignment can remain deployment evidence, but no `assigned_workstation_id` write belongs in this schema-prep slice.

## RC4 Slice 3B - Sterilizer Provisioning Foundation

RC4 Slice 3B adds the inert TypeScript foundation for clinic-scoped sterilizer shell provisioning. It is not wired into runtime execution, the Setup Wizard, the Deploy button, `DeploymentEngine.execute()`, routes, UI, or the deployment barrel. It performs no Supabase writes and inserts no sterilizers.

Created foundation files:

- `deployment-sterilizer-types.ts`
- `deployment-sterilizer-payload.ts`
- `deployment-sterilizer-repository.ts`
- `deployment-sterilizer-service.ts`
- `deployment-sterilizer-test-repository.ts`
- `deployment-sterilizer-service.test.ts`

Sterilizer shell provisioning requires the ordered upstream RC4 persistence chain to be complete before any future insert can occur:

1. Existing clinic root.
2. Existing clinic settings row for that clinic.
3. Provider shells already provisioned for that clinic.

Provider shells are an explicit prerequisite because RC4 Slice 2E made them the durable stage immediately before sterilizer provisioning in the setup-completion pipeline. This foundation therefore models the approved order rather than allowing sterilizers to follow clinic settings directly.

The payload builder consumes the reviewed `DeploymentDraft.sterilizers` array in order and creates deterministic keys:

- `sterilizer-001`
- `sterilizer-002`
- etc.

Field mapping:

- `clinicId` -> `public.sterilizers.clinic_id`.
- `deploymentSterilizerKey` -> `deployment_sterilizer_key`.
- `name` -> reviewed draft display name, or `Sterilizer Placeholder NNN` when blank, suffixed with a compact clinic id segment to avoid global name uniqueness collisions.
- `type` -> reviewed draft sterilizer type, or `Steam Autoclave` when blank to match existing app expectations.
- `active` -> false.
- `provisioningSource` -> `setup_draft`.
- `provisioningStatus` -> `planned`.
- `createdAt` / `updatedAt` -> supplied timestamp when provided.

Assigned workstation remains deferred. The draft workstation assignment is not mapped to a durable workstation id because workstation persistence is not implemented in this slice. This foundation creates no workstation, hardware, pack, cycle, trace, user, audit, activation, or downstream records.

Idempotency is key-based. Retrying the same clinic/draft reuses existing shells by `(clinic_id, deployment_sterilizer_key)`, partial retries create only missing keys, duplicate keys within one clinic are conflicts/skips, and the same key may exist for different clinics. Legacy global sterilizers with `clinic_id is null` are ignored and are never attached, updated, deleted, activated, or reused for deployment matching.

The in-memory harness covers create, retry reuse, partial existing rows, empty drafts, duplicate same-clinic keys, same keys across clinics, generated-name divergence across clinics, ignored global legacy sterilizers, and forbidden downstream counters remaining zero.

## RC4 Slice 3C - Sterilizer Supabase Repository Implementation

RC4 Slice 3C adds `deployment-sterilizer-supabase-repository.ts` as the concrete Supabase adapter for the sterilizer-shell repository contract. The adapter is server-only and remains unused by runtime deployment, Setup Wizard actions, UI, routes, the Deploy button, and `DeploymentEngine.execute()`.

The repository write surface is limited to `public.sterilizers` inserts for inactive setup-draft planned shells. It maps sterilizer shell payloads to:

- `clinic_id`
- `deployment_sterilizer_key`
- `name`
- `type`
- `active = false`
- `provisioning_source = setup_draft`
- `provisioning_status = planned`
- optional `created_at` / `updated_at` when supplied by the service payload

The adapter never updates or deletes sterilizer rows and never mutates legacy global sterilizers where `clinic_id is null`. It pre-reads `(clinic_id, deployment_sterilizer_key)` before insert, reuses an existing inactive setup-draft planned shell, and reports a conflict if that key belongs to a non-planned or active sterilizer record.

Unique constraint races are handled by re-reading the same clinic/key pair. If the re-read finds a reusable planned shell, the adapter returns reuse. If the re-read does not find a matching shell, the adapter returns a safe unresolved conflict. This covers both duplicate `(clinic_id, deployment_sterilizer_key)` races and global name uniqueness collisions without attaching, renaming, activating, or mutating any existing row.

No workstation, hardware, pack, cycle, trace, user, audit, activation, runtime setup provisioning, or downstream records are created by this adapter.

## RC4 Slice 3E - Setup Runtime Sterilizer Shell Provisioning

The Setup Complete server action now provisions sterilizer planned shells after provider shell provisioning succeeds. The ordered runtime path is:

1. Create or reuse `deployment_runs` by setup-session idempotency key and payload hash.
2. Create or reuse the draft `public.clinics` root and link `deployment_runs.clinic_id`.
3. Create or reuse the linked `public.clinic_settings` row.
4. Create or reuse inactive provider placeholder shells in `public.providers`.
5. Create or reuse inactive planned sterilizer shells in `public.sterilizers`.

Sterilizer shell provisioning consumes the reviewed `DeploymentDraft.sterilizers` array and assigns deterministic keys such as `sterilizer-001` and `sterilizer-002`. Runtime-created rows are clinic-scoped planned equipment shells: `clinic_id` is linked, `deployment_sterilizer_key` is present, `provisioning_source = setup_draft`, `provisioning_status = planned`, generated names include a clinic-specific suffix for global name uniqueness, and `active = false`.

Retry behavior is idempotent through `(clinic_id, deployment_sterilizer_key)`. Re-running the same reviewed setup session reuses existing shells, while partial existing shells create only missing keys. Legacy global sterilizers with `clinic_id is null` are not updated, activated, deleted, attached, or reused for deployment shell matching.

This slice does not create or mutate workstation assignments, hardware devices, packs, cycles, traces, users, audit logs, clinic activation records, dashboard access, public API routes, full deployment repository wiring, or `DeploymentEngine.execute()`. Access to the SteriSphere platform remains disabled and downstream workstation/hardware/pack/cycle/trace provisioning remains simulated.

Manual verification queries:

```sql
select deployment_run_id, clinic_id
from public.deployment_runs
where deployment_run_id = '<deployment-run-id>';

select id, clinic_code, deployment_status
from public.clinics
where id = '<clinic-id>';

select id, clinic_id
from public.clinic_settings
where clinic_id = '<clinic-id>';

select clinic_id, deployment_provider_key, provisioning_source, provisioning_status, active
from public.providers
where clinic_id = '<clinic-id>'
order by deployment_provider_key;

select clinic_id, deployment_sterilizer_key, name, type, provisioning_source, provisioning_status, active
from public.sterilizers
where clinic_id = '<clinic-id>'
order by deployment_sterilizer_key;

select clinic_id, deployment_sterilizer_key, count(*)
from public.sterilizers
where clinic_id = '<clinic-id>'
  and deployment_sterilizer_key is not null
group by clinic_id, deployment_sterilizer_key
having count(*) > 1;

select count(*) as legacy_global_sterilizer_rows
from public.sterilizers
where clinic_id is null;
```

## RC4 Slice 4A - Workstation Runtime Provisioning Foundation

RC4 Slice 4A adds the inert TypeScript foundation for clinic-scoped workstation shell provisioning. It is not wired into runtime execution, the Setup Wizard, the Deploy button, `DeploymentEngine.execute()`, routes, UI, SQL migrations, smoke harnesses, or the deployment barrel. It performs no Supabase writes and inserts no runtime workstation records.

Created foundation files:

- `deployment-workstation-types.ts`
- `deployment-workstation-payload.ts`
- `deployment-workstation-repository.ts`
- `deployment-workstation-service.ts`
- `deployment-workstation-test-repository.ts`
- `deployment-workstation-service.test.ts`

Workstation shell provisioning is planned after sterilizers in the ordered setup persistence chain:

1. `deployment_run`
2. `clinic_root`
3. `clinic_settings`
4. `provider_shells`
5. `sterilizer_shells`
6. `workstation_shells`

The payload builder consumes the reviewed `DeploymentDraft.workstations` array in order and creates deterministic keys:

- `workstation-001`
- `workstation-002`
- `workstation-003`

Field mapping:

- `clinicId` -> future `clinical_workstations.clinic_id`.
- `deploymentWorkstationKey` -> future `deployment_workstation_key`.
- `name` -> reviewed draft workstation name, or `Workstation Placeholder NNN` when blank.
- `workstationType` -> reviewed draft workstation type.
- `displayOrder` -> reviewed draft order, starting at 1.
- `status` -> `planned`.
- `capabilities` -> canonical workstation capability map.
- `locationLabel` -> reviewed location label, falling back to room number when needed.
- `agentUrl` -> null.
- `active` -> false.
- `provisioningSource` -> `setup_draft`.
- `provisioningStatus` -> `planned`.
- `createdAt` / `updatedAt` -> supplied timestamp when provided.

Idempotency is key-based. Retrying the same clinic/draft reuses existing shells by `(clinic_id, deployment_workstation_key)`, partial retries create only missing keys, duplicate keys within one clinic are conflicts/skips, and the same key may exist for different clinics. Legacy global workstations with `clinic_id is null` are ignored and are never attached, updated, renamed, activated, or reused for deployment matching.

The in-memory harness covers fresh create, retry reuse, partial existing rows, empty drafts, duplicate same-clinic keys, same keys across clinics, deterministic payload generation, ignored global legacy workstations, and forbidden downstream counters remaining zero. Workstation provisioning remains a foundation boundary only; hardware devices, packs, cycles, traces, users, audit logs, activation, dashboard access, public API routes, full deployment repository wiring, and `DeploymentEngine.execute()` remain outside this slice.

## RC4 Slice 4B - Workstation Schema Preflight and Supabase Repository

RC4 Slice 4B adds schema verification and the unused server-only Supabase repository for workstation planned shells. It does not wire setup actions, UI, `DeploymentEngine.execute()`, runtime server composition, SQL migrations, smoke runners, or deployment inserts.

Created verification and repository files:

- `supabase_clinical_workstations_deployment_preflight.sql`
- `deployment-workstation-supabase-repository.ts`

Schema verification against the checked-in `supabase_clinical_workstations.sql` shows that `public.clinical_workstations` already has the operational workstation shape used by Settings: `clinic_id`, `name`, `workstation_type`, `display_order`, `location_label`, `room_number`, `agent_url`, `supports_printer`, `supports_usb_scanner`, `supports_camera`, `supports_sound`, `supports_sterilizer`, `status`, audit fields, clinic/name uniqueness, and agent uniqueness. The Slice 4A deployment-shell model still requires deployment metadata that is not present in that older planning SQL: `deployment_workstation_key`, `provisioning_source`, `provisioning_status`, and an explicit `active` guardrail. No migration is added in this slice.

The repository maps the Slice 4A logical `capabilities` object to the existing workstation support columns rather than assuming a `capabilities` JSON column. A future schema slice must add nullable deployment metadata and a partial unique guardrail for `(clinic_id, deployment_workstation_key)` before this repository can be safely wired at runtime.

Repository behavior follows the provider and sterilizer adapters: it finds by `(clinic_id, deployment_workstation_key)`, validates that payloads are inactive setup-draft planned shells, inserts only missing shells, reuses existing compatible planned shells, and treats non-planned or activated records as conflicts. It never updates, renames, attaches, activates, deletes, or reuses legacy/global workstations where `clinic_id is null`.

## RC4 Slice 4C - Workstation Schema Migration and Live Preflight

RC4 Slice 4C adds the minimal SQL migration draft needed to prepare `public.clinical_workstations` for future deployment workstation planned shells. It does not wire setup actions, UI, `DeploymentEngine.execute()`, runtime server composition, deployment inserts, smoke runners, or unrelated provider/sterilizer behavior.

Created SQL file:

- `supabase_clinical_workstations_deployment_fields.sql`

The migration adds nullable deployment metadata only: `deployment_workstation_key`, `provisioning_source`, `provisioning_status`, and `active`. Existing workstation rows remain valid without deployment keys, and the migration does not backfill legacy/global rows or mark them active/inactive. A provisioning-status check allows `planned`, `active`, and `archived` when a status is present.

The idempotency guardrail is a partial unique index on `(clinic_id, deployment_workstation_key) where deployment_workstation_key is not null`. This permits multiple legacy rows with null deployment keys while preventing duplicate deterministic setup keys such as `workstation-001` within the same clinic.

## RC4 Slice 4D - Runtime Workstation Shell Provisioning

RC4 Slice 4D wires workstation planned-shell provisioning into the Setup Complete server action after sterilizer shell persistence. The runtime order is now `deployment_run -> clinic_root -> clinic_settings -> provider_shells -> sterilizer_shells -> workstation_shells`.

Runtime composition is server-only through `deployment-workstation-server.ts`, which composes `SupabaseDeploymentWorkstationRepository` with `DeploymentWorkstationService` and checks the upstream clinic root, clinic settings, provider shells, and sterilizer shells before provisioning workstation shells.

The Setup Complete action now records workstation-shell stage evidence with requested, created, reused, skipped, and conflict counts. Workstation shell failures are reported after upstream records remain durable; no downstream hardware, pack, cycle, trace, user, audit, activation, agent registration, printer/scanner persistence, camera binding, sound binding, or `DeploymentEngine.execute()` behavior is introduced.

Retry/reuse remains keyed by `(clinic_id, deployment_workstation_key)`. Fresh deployments create missing planned shells, repeat verification reuses compatible setup-draft planned shells, partial existing states create only missing keys, and conflicts are reported without mutating existing workstation rows or legacy/global rows.

## RC5 Slice 1A - Hardware Planned Shell Foundation

RC5 Slice 1A adds the inert TypeScript foundation for clinic-scoped hardware planned-shell provisioning. It is not wired into runtime execution, the Setup Wizard, the Deploy button, `DeploymentEngine.execute()`, routes, UI, SQL migrations, smoke harnesses, runtime server composition, Supabase repositories, or the deployment barrel. It performs no Supabase writes and inserts no hardware records.

Created foundation files:

- `deployment-hardware-types.ts`
- `deployment-hardware-payload.ts`
- `deployment-hardware-repository.ts`
- `deployment-hardware-service.ts`
- `deployment-hardware-test-repository.ts`
- `deployment-hardware-service.test.ts`

Hardware planned-shell provisioning is planned after workstation shells in the ordered setup persistence chain:

1. `deployment_run`
2. `clinic_root`
3. `clinic_settings`
4. `provider_shells`
5. `sterilizer_shells`
6. `workstation_shells`
7. `hardware_shells`

The payload builder consumes the reviewed `DeploymentDraft.hardwarePlan` quantities and creates deterministic unit shells in order:

- `hardware-001`
- `hardware-002`
- `hardware-003`

Field mapping is logical until a later schema-verification slice confirms the physical table shape:

- `clinicId` -> future clinic ownership field.
- `deploymentHardwareKey` -> future deployment idempotency key field.
- `name` -> generated hardware shell label such as `Label Printer 001` or `USB Scanner 002`.
- `hardwareType` -> reviewed hardware category such as `label_printer` or `usb_scanner`.
- `quantity` -> `1` per deterministic planned shell.
- `displayOrder` -> reviewed generated order, starting at 1.
- `status` -> `planned`.
- `capabilities` -> logical hardware capabilities only.
- `assignedWorkstationKey` -> logical deterministic workstation key when the reviewed workstation capabilities provide a match.
- `assignedSterilizerKey` -> null in this foundation because the current hardware draft has printer and scanner quantities only.
- `active` -> false.
- `provisioningSource` -> `setup_draft`.
- `provisioningStatus` -> `planned`.
- `createdAt` / `updatedAt` -> supplied timestamp when provided.

Assignment keys are carried as logical deployment keys only. This foundation does not resolve them to durable workstation or sterilizer ids, does not bind hardware to workstations or sterilizers, and does not register printers, scanners, cameras, sound devices, clinic agents, packs, cycles, traces, users, or audit records.

Idempotency is key-based. Retrying the same clinic/draft reuses existing shells by `(clinic_id, deployment_hardware_key)`, partial retries create only missing keys, duplicate keys within one clinic are conflicts/skips, and the same key may exist for different clinics. Legacy global hardware with `clinic_id is null` is ignored and is never attached, updated, renamed, activated, assigned, or reused for deployment matching.

Schema assumptions remain intentionally uncommitted in this slice. A later schema preflight must inspect the existing hardware persistence surface before choosing table names, column names, indexes, or migration SQL. The logical model expects nullable deployment metadata and a partial unique guardrail for `(clinic_id, deployment_hardware_key)` when physical persistence is approved.

The in-memory harness covers fresh create, retry reuse, partial existing rows, empty drafts, duplicate same-clinic keys, same keys across clinics, deterministic payload generation for `hardware-001..003`, ignored global legacy hardware, logical assignment keys without durable resolution, and forbidden downstream counters remaining zero.

## RC5 Slice 1B - Hardware Schema Preflight and Supabase Repository

RC5 Slice 1B adds schema verification notes and an unused server-only Supabase repository for hardware planned shells. It does not wire setup actions, UI, `DeploymentEngine.execute()`, runtime server composition, SQL migrations, smoke runners, deployment inserts, or previous provider/sterilizer/workstation behavior.

Created verification and repository files:

- `supabase_clinical_hardware_devices_deployment_preflight.sql`
- `deployment-hardware-supabase-repository.ts`

Schema verification against the checked-in `supabase_clinical_hardware_devices.sql` shows that `public.clinical_hardware_devices` is an operational hardware digital-twin table, not a deployment planned-shell table. It already has `clinic_id`, device identity columns, device type/status/health checks, agent/workstation id references, support booleans, `metadata jsonb`, notes, and audit timestamps. The RC5 Slice 1A logical shell model is not fully represented as first-class columns: `deployment_hardware_key`, `hardware_type`, `quantity`, `display_order`, `capabilities`, `assigned_workstation_key`, `assigned_sterilizer_key`, `provisioning_source`, `provisioning_status`, and `active` are absent. The existing `status` check also does not allow `planned`; it allows device lifecycle states such as `discovered`, `registered`, `assigned`, and `active`.

The repository therefore maps only to existing physical columns. It stores deployment shell identity and logical planned-shell fields in `metadata`, maps `label_printer` to existing `device_type = printer`, maps `usb_scanner` to `device_type = usb_scanner`, maps logical capabilities to support booleans, leaves `agent_id`, `default_workstation_id`, and `current_workstation_id` null, and writes device `status = discovered` / `health = unknown` as the closest non-active physical state. Logical assignment keys are preserved only in metadata and are not resolved to durable workstation or sterilizer ids.

This metadata bridge is not a final schema contract. It has no database-level uniqueness guardrail for `(clinic_id, deployment_hardware_key)` until a later schema migration adds first-class deployment metadata or an equivalent partial unique index. The repository still pre-reads by clinic plus metadata deployment key, reuses compatible setup-draft planned shells, lists existing metadata-backed shells for duplicate detection, and treats active/non-planned/conflicting rows as conflicts without updating them.

Legacy/global hardware rows with `clinic_id is null` or without `metadata.deployment_hardware_key` are ignored. The repository never attaches, mutates, renames, activates, deletes, assigns, or reuses those rows for deployment matching.

## RC5 Slice 1C - Hardware Schema Migration and Live Preflight

RC5 Slice 1C adds the minimal schema migration draft to make `public.clinical_hardware_devices` ready for durable deployment hardware planned-shell idempotency. It does not wire setup actions, UI, `DeploymentEngine.execute()`, runtime server composition, smoke runners, setup inserts, activation, hardware binding, or provider/sterilizer/workstation behavior.

Created SQL migration file:

- `supabase_clinical_hardware_devices_deployment_fields.sql`

The migration adds nullable deployment metadata only: `deployment_hardware_key`, `provisioning_source`, `provisioning_status`, `active`, and `display_order`. Existing discovered or legacy hardware rows remain valid because every new field is nullable and the migration does not backfill rows, change device status, assign agents, assign workstations, or activate hardware.

The durable idempotency guardrail is a partial unique index on `(clinic_id, deployment_hardware_key) where deployment_hardware_key is not null`. This permits existing rows with null deployment keys while preventing duplicate deterministic setup keys such as `hardware-001` within one clinic.

`SupabaseDeploymentHardwareRepository` now uses first-class `deployment_hardware_key`, `provisioning_source`, `provisioning_status`, `active`, and `display_order` columns for lookup, insert, mapping, and reuse checks. Metadata remains only for logical fields that still do not have physical columns in this slice: hardware type, quantity, capabilities, assigned workstation key, and assigned sterilizer key.

The hardware preflight SQL now verifies required deployment columns, the partial unique index, duplicate `(clinic_id, deployment_hardware_key)` groups, legacy rows with null deployment keys, and whether any deployment-keyed row appears activated, bound, or otherwise outside inactive setup-draft planned-shell semantics.

## RC5 Slice 1E - Runtime Hardware Shell Provisioning

RC5 Slice 1E wires hardware planned-shell provisioning into the Setup Complete server action after workstation shell persistence succeeds. The ordered runtime path is now:

1. `deployment_run`
2. `clinic_root`
3. `clinic_settings`
4. `provider_shells`
5. `sterilizer_shells`
6. `workstation_shells`
7. `hardware_shells`

Runtime composition is server-only through `deployment-hardware-server.ts`, which composes `SupabaseDeploymentHardwareRepository` with `DeploymentHardwareService` and checks the upstream clinic root, clinic settings, provider shells, sterilizer shells, and workstation shells before provisioning hardware shells.

The Setup Complete action records hardware-shell stage evidence with requested, created, reused, skipped, and conflict counts. Hardware failures are reported after upstream records remain durable; no workstation assignment resolution, sterilizer assignment resolution, clinic agent registration, printer/scanner/camera/sound binding, activation, packs, cycles, traces, users, audit-log rows, or `DeploymentEngine.execute()` behavior is introduced.

Retry/reuse remains keyed by `(clinic_id, deployment_hardware_key)`. Fresh deployments create missing inactive setup-draft planned shells, repeat verification reuses compatible planned shells, partial existing states create only missing keys, and conflicts are reported without mutating existing hardware rows, discovered device rows, or legacy/global rows.

## RC6 Slice 1A - Hardware Assignment Foundation

RC6 Slice 1A adds the inert TypeScript foundation for clinic-scoped planned hardware assignment relationships. It is not wired into runtime execution, the Setup Wizard action, UI behavior, Supabase repositories, SQL migrations, smoke runners, or `DeploymentEngine.execute()`. It performs no Supabase writes and does not mutate hardware shell binding columns.

Created foundation files:

- `deployment-hardware-assignment-types.ts`
- `deployment-hardware-assignment-payload.ts`
- `deployment-hardware-assignment-repository.ts`
- `deployment-hardware-assignment-service.ts`
- `deployment-hardware-assignment-test-repository.ts`
- `deployment-hardware-assignment-service.test.ts`

The future planned relationship order is:

1. `deployment_run`
2. `clinic_root`
3. `clinic_settings`
4. `provider_shells`
5. `sterilizer_shells`
6. `workstation_shells`
7. `hardware_shells`
8. `hardware_assignments`

Hardware assignments are planned relationships between a deployment hardware shell and a logical deployment target. Supported target kinds in this foundation are `workstation`, `sterilizer`, and `unassigned`. Assignment payloads use the deterministic assignment key format `hardware-assignment-${deployment_hardware_key}`, for example `hardware-assignment-hardware-001`.

The idempotency boundary is `(clinic_id, deployment_hardware_key)`, allowing at most one planned assignment per hardware shell per clinic. Existing compatible inactive setup-draft planned assignments are reused. Missing assignments are created through the repository contract. Duplicate same-clinic hardware keys and conflicting target assignments are reported as conflicts without mutation.

Assignment payloads carry only logical deployment keys. They do not resolve workstation ids, sterilizer ids, hardware row ids, or agent ids. Explicit `unassigned` remains a valid planned state when a hardware shell has no logical target. Legacy/global assignments remain outside matching and are never attached, activated, mutated, or reused.

## RC6 Slice 1B - Hardware Assignment Schema Preflight and Supabase Repository

RC6 Slice 1B selects a dedicated `public.deployment_hardware_assignments` table as the safest future persistence model for planned hardware assignment relationships. The existing `public.clinical_hardware_devices` columns `default_workstation_id`, `current_workstation_id`, and `agent_id` represent operational device binding and must not store setup-draft planned assignment evidence. No existing checked-in assignment or junction table cleanly represents clinic-scoped deployment hardware-to-logical-target relationships without mutating operational bindings.

The server-only `SupabaseDeploymentHardwareAssignmentRepository` is implemented against the dedicated table shape but remains unused by runtime setup completion. It finds by `(clinic_id, deployment_hardware_key)`, inserts only inactive setup-draft planned assignments, reuses compatible planned rows, and returns conflicts for incompatible, active, non-planned, or differently targeted rows. It never updates, retargets, activates, deletes, resolves durable workstation/sterilizer/hardware ids, or writes `clinical_hardware_devices` binding columns.

The expected table columns for the next schema slice are `clinic_id`, `deployment_hardware_key`, `assignment_key`, `target_type`, `target_deployment_key`, `assignment_status`, `assignment_source`, `active`, optional `display_order`, optional `reason`, optional `metadata`, and audit timestamps. The required durable guardrail is a partial unique index on `(clinic_id, deployment_hardware_key) where deployment_hardware_key is not null`. Target type should allow `workstation`, `sterilizer`, and `unassigned`; `target_deployment_key` should be null for `unassigned` and non-null for workstation or sterilizer targets.

`supabase_deployment_hardware_assignments_preflight.sql` is a read-only schema assessment for this future table. It verifies the current operational hardware binding columns, searches for existing assignment-like tables, checks the expected dedicated table columns and indexes when present, and reports planned hardware shell rows that already carry operational bindings.

## RC6 Slice 1C - Hardware Assignment Schema Migration

RC6 Slice 1C creates the dedicated `public.deployment_hardware_assignments` table for setup-draft planned hardware relationships. The table stores clinic-scoped relationships from `deployment_hardware_key` to a logical `target_deployment_key`, with `target_type` limited to `workstation`, `sterilizer`, or `unassigned`. It does not reference workstation, sterilizer, hardware, or agent ids.

The table is owned by the deployment relationship layer and uses `clinic_id references public.clinics(id) on delete restrict`, matching the restrictive delete behavior used by other deployment-owned clinic-scoped rows. It enforces inactive setup-draft defaults, positive `display_order` when present, target-key shape rules for assigned versus unassigned rows, and uniqueness on both `(clinic_id, deployment_hardware_key)` and `(clinic_id, assignment_key)`.

The migration does not backfill assignment rows, mutate `clinical_hardware_devices`, write `default_workstation_id`, write `current_workstation_id`, write `agent_id`, resolve target ids, activate assignments, or wire runtime behavior. The updated preflight verifies the table shape, constraints, indexes, duplicate guards, target-key invariants, inactive planned state, and that the migration itself introduced zero assignment rows.

## RC6 Slice 1D - Hardware Assignment Runtime Wiring

RC6 Slice 1D wires hardware assignment persistence into setup completion immediately after hardware shell provisioning. The runtime order is now `deployment_run -> clinic_root -> clinic_settings -> provider_shells -> sterilizer_shells -> workstation_shells -> hardware_shells -> hardware_assignments`.

Runtime composition is server-only through `deployment-hardware-assignment-server.ts`, which composes `SupabaseDeploymentHardwareAssignmentRepository` with `DeploymentHardwareAssignmentService` and verifies the upstream clinic root, clinic settings, provider shells, sterilizer shells, workstation shells, and hardware shells before creating or reusing assignment rows.

The setup action records hardware-assignment stage evidence with requested, created, reused, skipped, and conflict counts. Assignment persistence remains logical only: it writes `deployment_hardware_key`, `assignment_key`, `target_type`, and `target_deployment_key` without resolving workstation ids, sterilizer ids, hardware ids, or agent ids. It never writes `clinical_hardware_devices.default_workstation_id`, `current_workstation_id`, or `agent_id`, and does not activate hardware or assignments.

## RC6 Slice 2A - Assignment Target Validation Foundation

RC6 Slice 2A adds an inert deployment-domain validation boundary for planned hardware assignment targets. It does not wire setup actions, UI, `DeploymentEngine.execute()`, runtime composition, Supabase repositories, SQL migrations, smoke runners, durable ID resolution, or hardware binding writes.

The future ordered relationship chain is now documented as:

1. `deployment_run`
2. `clinic_root`
3. `clinic_settings`
4. `provider_shells`
5. `sterilizer_shells`
6. `workstation_shells`
7. `hardware_shells`
8. `hardware_assignments`
9. `assignment_target_validation`

The validation service reads planned hardware assignments for one clinic and checks only logical deployment targets. Workstation targets must reference a same-clinic inactive setup-draft planned workstation shell using a `workstation-###` key. Sterilizer targets must reference a same-clinic inactive setup-draft planned sterilizer shell using a `sterilizer-###` key. Explicit `unassigned` relationships remain valid only when `target_deployment_key` is null and require no target lookup.

Structured issues distinguish missing keys, unexpected unassigned target keys, unsupported target types, malformed deterministic keys, missing targets, cross-clinic or legacy targets, and incompatible targets. Batch results report requested, valid, invalid, missing target, and incompatible target counts, plus zero downstream write counters. Validation is read-only and does not mutate assignments, workstation shells, sterilizer shells, hardware rows, operational binding columns, activation state, agents, packs, cycles, traces, users, or audit records.

## RC6 Slice 2B - Assignment Target Validation Supabase Repository

RC6 Slice 2B adds a read-only server-only Supabase repository for the assignment target validation foundation. It remains unused by setup runtime and does not wire setup actions, UI, `DeploymentEngine.execute()`, validation-result persistence, ID resolution, operational binding writes, activation, SQL migrations, or smoke runners.

`SupabaseDeploymentAssignmentTargetValidationRepository` reads planned hardware assignments from `public.deployment_hardware_assignments`, workstation target fields from `public.clinical_workstations`, and sterilizer target fields from `public.sterilizers`. It selects only the fields needed by validation: clinic ownership, deterministic deployment keys, provisioning source/status, planned status where applicable, and inactive state.

The schema assumption for runtime compatibility is that `public.clinical_workstations` exposes `clinic_id`, `deployment_workstation_key`, `status`, `provisioning_source`, `provisioning_status`, and `active`, while `public.sterilizers` exposes `clinic_id`, `deployment_sterilizer_key`, `provisioning_source`, `provisioning_status`, and `active`. Same-clinic duplicate deployment keys are treated as repository errors because they prevent deterministic validation. Cross-clinic or legacy/global keyed rows are surfaced through the any-target lookup path so the validation service can report them separately from missing targets.

`supabase_assignment_target_validation_preflight.sql` is read-only and verifies required columns, deployment-key indexes, duplicate same-clinic deployment keys, deployment-keyed rows with null clinic ids, active setup-draft planned rows, malformed planned deployment keys, and current planned hardware assignment compatibility with the validation rules. If a live environment fails any required-column check, the next slice must add the missing nullable deployment metadata columns or indexes before runtime validation can be wired.

## RC6 Infrastructure Cleanup - Deployment Table RLS Baseline

The first deployment-table security hardening target is `public.deployment_hardware_assignments`, which is deployment-only persistence owned by trusted server-side service-role repositories. Browser code does not need direct anonymous or authenticated access to this table, so the baseline security posture is RLS enabled with no permissive policies.

`supabase_deployment_tables_rls_baseline.sql` enables row level security on `public.deployment_hardware_assignments` and `public.deployment_runs` and intentionally creates no anon or broad authenticated policies. Service-role deployment provisioning continues to rely on Supabase service-role bypass plus application-level server authorization checks. The migration does not insert, update, delete, backfill, bind, activate, or mutate deployment rows.

Audit summary for the Phase 9 deployment-related tables:

| Table | Current access model | Cleanup decision |
| --- | --- | --- |
| `public.deployment_hardware_assignments` | Server-only service-role deployment repositories. | Enable RLS deny-by-default in this cleanup. |
| `public.deployment_runs` | Server-only service-role deployment evidence. | Enable RLS deny-by-default in this cleanup. |
| `public.clinics` | Server-only deployment root in checked-in schema; RLS already enabled with no policies. | No change. |
| `public.clinic_settings` | Existing Settings UI reads and writes directly from the browser. | Defer until authenticated clinic-scoped policies are designed. |
| `public.providers` | Existing Settings UI reads and writes directly from the browser; deployment shells share the table with operational provider settings. | Defer until authenticated clinic-scoped policies are designed. |
| `public.sterilizers` | Existing cycle and Settings UI read/write paths use this table directly. | Defer until operational policies are designed. |
| `public.clinical_workstations` | Existing browser hook reads clinical rooms/workstations directly. | Defer until workstation read policies are designed. |
| `public.clinical_hardware_devices` | Operational device/digital-twin table with future agent workflows. | Defer until agent and admin policies are designed. |

`supabase_deployment_tables_rls_preflight.sql` audits RLS state, policies, assignment-table policy exposure, row counts, constraints, indexes, and duplicate assignment key groups. It should be run before and after applying the RLS migration, followed by Supabase Security Advisor verification.
## RC6 Slice 2C - Runtime Assignment Target Validation

RC6 Slice 2C wires assignment target validation into setup completion immediately after hardware shell provisioning and before hardware assignment persistence. The runtime order is now `deployment_run -> clinic_root -> clinic_settings -> provider_shells -> sterilizer_shells -> workstation_shells -> hardware_shells -> assignment_target_validation -> hardware_assignments`.

The server-only validation helper builds the same deterministic planned assignment payloads that assignment persistence would write, maps them into validation inputs, and validates logical workstation or sterilizer target deployment keys against same-clinic inactive setup-draft planned shells. Explicit `unassigned` remains valid without a target lookup.

If validation passes, setup completion proceeds to `public.deployment_hardware_assignments` persistence. If validation finds invalid targets or the read-only validation repository fails unexpectedly, the action returns safely with deployment run, clinic root, clinic settings, provider shells, sterilizer shells, workstation shells, and hardware shells preserved as durable upstream evidence. No assignment rows are created, no downstream counters advance, no durable ids are resolved, and no operational hardware binding or activation columns are written.
## RC6 Slice 2D - Assignment Repository Integrity

RC6 Slice 2D keeps runtime behavior and ordering unchanged while tightening the repository integrity boundary for `public.deployment_hardware_assignments`. Repository create paths now share the same compatibility predicate used by the service: a row is reusable only when clinic id, deployment hardware key, assignment key, target type, target deployment key, setup-draft source, planned status, and inactive state all match.

The repository remains deterministic and mutation-free for existing rows. Compatible existing rows are returned as reuse, incompatible same-clinic deployment hardware keys are reported as conflicts, unique-index races are resolved by re-reading the scoped assignment before deciding reuse versus conflict, and list operations preserve deployment hardware key ordering. The boundary still does not resolve workstation ids, sterilizer ids, hardware ids, or agent ids, and it does not write operational hardware binding or activation columns.
## RC7 Slice 1A - Planned Assignment Resolution Foundation

RC7 Slice 1A introduces a read-only in-memory resolution foundation after planned hardware assignment persistence. The future order is now `deployment_run -> clinic_root -> clinic_settings -> provider_shells -> sterilizer_shells -> workstation_shells -> hardware_shells -> assignment_target_validation -> hardware_assignments -> planned_assignment_resolution`.

Planned assignment resolution converts clinic-scoped logical deployment keys into durable row identities in memory only. A planned hardware assignment can resolve `deployment_hardware_key` to a planned hardware shell row id, resolve workstation or sterilizer `target_deployment_key` values to same-clinic planned shell row ids, or preserve explicit `unassigned` with a null target id. The layer returns structured resolved/unresolved records, batch counters, and issues; it does not persist resolution evidence or write ids back to assignments.

Compatibility remains setup-draft and inactive. Hardware, workstation, and sterilizer shells must be same-clinic planned rows with `provisioning_source = setup_draft`, `provisioning_status = planned`, and `active = false`. Hardware shells with `agent_id`, `default_workstation_id`, or `current_workstation_id` are rejected as already operationally bound. The foundation does not create a Supabase repository, SQL migration, setup action wiring, UI evidence, operational binding, activation, agent registration, or `DeploymentEngine.execute()` change.
## RC7 Slice 1B - Planned Assignment Resolution Supabase Repository

RC7 Slice 1B adds a read-only server-only `SupabaseDeploymentPlannedAssignmentResolutionRepository` for the planned assignment resolution foundation. It reads compatible inactive setup-draft planned rows from `public.deployment_hardware_assignments`, resolves hardware shells from `public.clinical_hardware_devices`, resolves workstation shells from `public.clinical_workstations`, and resolves sterilizer shells from `public.sterilizers`.

The repository assumes first-class deployment key columns are present and does not fall back to metadata. Resolution requires `clinical_hardware_devices` to expose `deployment_hardware_key`, `provisioning_source`, `provisioning_status`, `active`, `agent_id`, `default_workstation_id`, and `current_workstation_id`; `clinical_workstations` to expose `deployment_workstation_key`, `status`, `provisioning_source`, `provisioning_status`, and `active`; and `sterilizers` to expose `deployment_sterilizer_key`, `provisioning_source`, `provisioning_status`, and `active`. Duplicate same-clinic deployment keys throw deterministic repository errors because resolution cannot safely choose one durable id.

`supabase_planned_assignment_resolution_preflight.sql` verifies those required columns, duplicate key guards, active planned rows, malformed deterministic keys, assignment target combinations, operational hardware bindings, and cross-entity compatibility. This slice does not add migrations, runtime wiring, resolved-id persistence, hardware binding writes, activation, agent registration, UI, smoke runners, or `DeploymentEngine.execute()` changes.
## RC7 Slice 1C - Runtime Planned Assignment Resolution

RC7 Slice 1C wires planned assignment resolution into setup completion immediately after hardware assignment persistence. The ordered runtime path is now `deployment_run -> clinic_root -> clinic_settings -> provider_shells -> sterilizer_shells -> workstation_shells -> hardware_shells -> assignment_target_validation -> hardware_assignments -> planned_assignment_resolution`.

The runtime composition is server-only through `deployment-planned-assignment-resolution-server.ts`, which composes `SupabaseDeploymentPlannedAssignmentResolutionRepository` with `DeploymentPlannedAssignmentResolutionService`. It reads persisted inactive setup-draft planned relationships from `public.deployment_hardware_assignments`, resolves `deployment_hardware_key` to the planned hardware shell row id, resolves workstation or sterilizer target deployment keys to matching same-clinic planned shell row ids, and preserves explicit `unassigned` relationships with `targetId = null`.

Resolution is activation preparation evidence only. It returns requested, resolved, unresolved, missing-hardware, missing-target, incompatible-hardware, and incompatible-target counters plus safe resolved-record and issue details. It never persists resolved ids, mutates `deployment_hardware_assignments`, mutates `clinical_hardware_devices`, writes operational binding columns, activates rows, registers agents, or changes `DeploymentEngine.execute()`.
## RC7 Slice 1D - Planned Hardware Resolution Compatibility

RC7 Slice 1D clarifies the authoritative compatibility contract for planned hardware assignment resolution. `public.clinical_hardware_devices.status` remains the operational/device lifecycle value used by the hardware table, and planned hardware shells created by deployment provisioning may persist as `status = discovered` while their deployment shell state is represented by `provisioning_source = setup_draft`, `provisioning_status = planned`, `active = false`, and null operational binding columns.

Planned assignment resolution therefore treats same-clinic hardware rows as compatible when the deployment key matches, provisioning metadata is setup-draft planned, the row is inactive, and `agent_id`, `default_workstation_id`, and `current_workstation_id` are null. It still rejects active, archived, wrong-source, cross-clinic, legacy/global, or operationally bound hardware rows and never mutates persisted hardware or assignment data.
## RC7 Slice 1E - Deployment Activation Readiness Foundation

RC7 Slice 1E adds an inert activation-readiness domain foundation after planned assignment resolution. The future order is now `deployment_run -> clinic_root -> clinic_settings -> provider_shells -> sterilizer_shells -> workstation_shells -> hardware_shells -> assignment_target_validation -> hardware_assignments -> planned_assignment_resolution -> deployment_activation_readiness`.

Activation readiness is a read-only safety assessment that verifies durable deployment evidence, planned shells, planned assignments, assignment target validation evidence, and planned assignment resolution evidence before any later activation phase. The assessment returns ready, blocked, or error with deterministic blocker and warning issues plus zero downstream counters.

This foundation does not create a Supabase repository, SQL migration, setup action wiring, UI evidence, resolved-id persistence, operational binding, activation, agent registration, deployment-status changes, smoke runners, or `DeploymentEngine.execute()` changes.

## RC7 Slice 1F - Activation Readiness Supabase Repository

RC7 Slice 1F adds a read-only server-only `SupabaseDeploymentActivationReadinessRepository` for building activation-readiness snapshots from durable deployment source rows. It reads `public.deployment_runs`, `public.clinics`, `public.clinic_settings`, `public.providers`, `public.sterilizers`, `public.clinical_workstations`, `public.clinical_hardware_devices`, and `public.deployment_hardware_assignments`.

The durable snapshot boundary is intentionally source-row only. Assignment target validation evidence and planned assignment resolution evidence are currently runtime action results, not persisted tables. The repository therefore returns those readiness evidence fields as null so the readiness service blocks until a future runtime composition supplies current evidence explicitly; it does not reconstruct, infer, or falsify successful validation/resolution evidence from durable rows.

Hardware readiness preserves `clinical_hardware_devices.status` as the operational/device lifecycle value. A deployment hardware shell with `status = discovered` remains compatible when `provisioning_source = setup_draft`, `provisioning_status = planned`, `active = false`, and `agent_id`, `default_workstation_id`, and `current_workstation_id` are null.

`supabase_activation_readiness_preflight.sql` is read-only and verifies required columns, deployment-key indexes, duplicate same-clinic keys, deployment-keyed rows without clinic scope, active setup-draft planned rows, operational hardware binding leaks, deterministic key shapes, assignment target compatibility, and durable readiness snapshot counts. It intentionally does not require persisted validation or resolution evidence because no such durable evidence table exists yet.

## RC7 Slice 1G - Runtime Activation Readiness Assessment

RC7 Slice 1G wires deployment activation readiness as the final read-only runtime preparation stage after successful planned assignment resolution. The runtime order is now `deployment_run -> clinic_root -> clinic_settings -> provider_shells -> sterilizer_shells -> workstation_shells -> hardware_shells -> assignment_target_validation -> hardware_assignments -> planned_assignment_resolution -> deployment_activation_readiness`.

The runtime composition combines the durable Supabase readiness snapshot with fresh assignment target validation evidence and fresh planned assignment resolution evidence from the same setup action. Readiness does not re-run validation or infer resolution success from durable rows alone. It returns structured status, check counters, blockers, warnings, issues, and zero downstream counters.

Readiness remains a safety boundary, not activation. It persists no readiness rows, changes no deployment status, writes no resolved ids, mutates no hardware assignment rows, writes no operational hardware binding columns, registers no agents, and activates no clinic, provider, sterilizer, workstation, hardware, or assignment records. Blocked or error readiness preserves upstream durable evidence and keeps retry available.

## RC8 Slice 1A - Controlled Activation Plan Foundation

RC8 Slice 1A introduces a read-only controlled activation planning foundation after deployment activation readiness. The future order is now `deployment_run -> clinic_root -> clinic_settings -> provider_shells -> sterilizer_shells -> workstation_shells -> hardware_shells -> assignment_target_validation -> hardware_assignments -> planned_assignment_resolution -> deployment_activation_readiness -> controlled_activation_plan`.

The activation planner converts a ready deployment into an explicit deterministic plan. It describes proposed activation, binding, assignment finalization, and deployment finalization items with required current state, intended target state, dependencies, reversibility, rollback intent, blockers, and warnings. It does not execute any plan item, persist the plan key, update provisioning status, activate rows, bind hardware, write resolved ids, register agents, finalize deployment runs, or implement rollback.

The plan is drift-protected. It requires readiness status `ready`, zero readiness blockers, matching clinic ownership, current inactive setup-draft planned or placeholder shell states, unbound hardware shells, matching planned assignments, and resolved hardware/target identities for binding items. Explicit unassigned hardware is valid and produces a warning plus no binding item.
## RC8 Slice 1B - Activation Plan Supabase Snapshot Boundary

Controlled activation planning now has a read-only server-only Supabase snapshot adapter. `SupabaseDeploymentActivationPlanRepository` loads only durable source rows required by `DeploymentActivationPlanService`: deployment run, clinic root, clinic settings, provider shells, sterilizer shells, workstation shells, hardware shells, and hardware assignments.

The adapter deliberately does not persist activation plans, infer readiness, or reconstruct planned-assignment resolution evidence. Fresh activation-readiness and planned-assignment resolution results remain runtime evidence supplied outside the durable snapshot. The repository preserves active flags, provisioning source/status, hardware binding columns, assignment target keys, durable ids, clinic ownership, and deployment-run state so the activation plan service can detect drift against that fresh evidence.

`supabase_activation_plan_preflight.sql` verifies the live schema and data assumptions needed for deterministic activation planning, including source columns, deterministic-key indexes, duplicate-key checks, active setup-draft drift, hardware operational binding drift, assignment target shape, and same-clinic assignment target compatibility. No SQL migration, runtime wiring, UI change, activation, hardware binding, plan persistence, rollback execution, or `DeploymentEngine.execute()` change is included in this slice.## RC8 Slice 1C Runtime Controlled Activation Plan Evidence

Runtime setup completion now returns `deploymentActivationPlan` evidence after activation readiness succeeds. The evidence contains status, deterministic plan key, item counts, reversible and irreversible counts, blockers, warnings, issues, plan items, message, and zero downstream counters.

The stage is evidence-only. It uses service-role reads through `SupabaseDeploymentActivationPlanRepository` but performs no inserts, updates, deletes, activation, binding, deployment finalization, rollback execution, or activation-plan persistence. Blocked/error planning leaves all upstream durable deployment evidence intact for retry and support review.## RC8 Slice 1D Controlled Activation Execution Foundation

Controlled activation execution now has an inert domain foundation after controlled activation planning. The execution service consumes an approved activation plan and a read-only repository snapshot to prepare a deterministic execution session model. The model validates plan readiness, deployment ownership, execution identity, unique item keys, sequence uniqueness, dependency integrity, topological order, finalization ordering, binding dependencies, current-state drift, supported actions, and rollback intent before any future executor may run.

The execution foundation does not persist execution sessions or items, perform Supabase writes, activate records, bind hardware, write resolved ids, update provisioning status, register agents, finalize deployment runs, or execute rollback. Repository checks are modeled as read-only drift and identity inputs so a later persistence slice can provide live state without weakening the safety contract.

Rollback is represented as evidence only: last reversible sequence, first irreversible sequence, rollback-supported item keys, rollback-unsupported item keys, and whether execution would cross an irreversible boundary. Actual execution and rollback remain future incremental slices.
## RC8 Slice 1E Activation Execution Snapshot Preflight

Controlled activation execution preparation now has a read-only Supabase snapshot repository, but no execution persistence table is created. The deterministic execution identity is `activation-execution-${deploymentRunId}` and remains service-computed evidence only until a later schema slice introduces durable execution sessions/items.

The snapshot repository reads only existing deployment-owned tables: `deployment_runs`, `clinics`, `clinic_settings`, `providers`, `sterilizers`, `clinical_workstations`, `clinical_hardware_devices`, and `deployment_hardware_assignments`. It returns compact current-state envelopes for drift detection and preserves nullable `active` values plus hardware binding columns without writing them.

`deployment-activation-execution-preflight.sql` is the manual live preflight for this boundary. It verifies required read columns, duplicate same-clinic deployment keys, null-clinic deployment-keyed rows, active planned rows, hardware binding drift inputs, assignment shape, and whether any execution persistence table already exists. No migration, insert, update, activation, binding, rollback, or runtime wiring is part of this slice.

## RC8 Slice 1F Activation Execution Preparation Runtime Evidence

The setup runtime now includes `controlled_activation_execution_preparation` after `controlled_activation_plan`. The stage reads durable state through the activation-execution Supabase snapshot repository and returns evidence only: execution key, item counters, issues, prepared execution items, rollback-boundary summary, downstream zero counters, and a support-oriented message.

No execution identity is durable yet. `activation-execution-${deploymentRunId}` is deterministic in-memory evidence only, and no execution/session/item rows are created. No activation, provisioning-status change, hardware binding, agent registration, deployment finalization, cleanup, rollback, or migration occurs in this slice.

The next persistence phase must add durable execution-session and execution-item control before any prepared item can become an operational write.

## RC8 Slice 1G Activation Current-State Contract Alignment

Activation planning and execution preparation now share a canonical current-state contract in `deployment-activation-current-state.ts`. The contract records only safety-relevant durable fields: clinic ownership and deployment status, deployment-run identity/lifecycle/deployment status, planned shell ids, clinic ids, deployment keys, provisioning source/status, active state, hardware operational status and binding columns, and hardware-assignment identity/target/source/status/active state.

The drift comparison canonicalizes field names and property order, preserves null and false as distinct safety values, preserves `clinical_hardware_devices.status = discovered`, and excludes presentation fields such as names, labels, timestamps, and display order. Equivalent representations no longer block execution preparation, but genuine durable drift still blocks with `state_drift_detected` and a safe list of changed safety-field paths.

Controlled activation execution preparation remains read-only. It creates no execution rows, activates no records, writes no hardware bindings, changes no provisioning status, finalizes no deployment run, performs no rollback, and does not change `DeploymentEngine.execute()`.

## RC8 Slice 2A Durable Activation Execution Persistence Foundation

RC8 Slice 2A introduces the TypeScript-only durable persistence contract for future activation execution sessions and execution items. The future runtime order extends to `deployment_run -> clinic_root -> clinic_settings -> provider_shells -> sterilizer_shells -> workstation_shells -> hardware_shells -> assignment_target_validation -> hardware_assignments -> planned_assignment_resolution -> deployment_activation_readiness -> controlled_activation_plan -> controlled_activation_execution_preparation -> activation_execution_persistence`.

The foundation defines prepared execution sessions keyed by clinic id, deployment run id, and deterministic execution key `activation-execution-${deploymentRunId}`. A prepared session stores plan identity, payload hash, ready preparation status, prepared execution status, nullable future ownership placeholders, item counters, rollback-boundary evidence, preparation evidence, execution metadata, and timestamps. It may only create or reuse sessions in `prepared`; claim, running, completion, failure, cancellation, and rollback transitions remain future work.

Each prepared execution item stores the immutable plan-item identity, sequence, dependency level, entity/action identity, expected current state, target state, dependencies, pre-execution status, zero attempt count, rollback evidence, and nullable execution timestamps/errors. Compatible retry reuses immutable rows, partial retry creates only missing rows, and incompatible retry returns structured conflicts without overwriting existing records.

No SQL table, Supabase repository, setup action wiring, UI, ownership lock, execution claim, item start, activation, binding, provisioning-status change, deployment-run finalization, rollback execution, worker, queue, polling, streaming, or `DeploymentEngine.execute()` change exists in this slice. The next schema slice should define the execution-session and execution-item tables plus database uniqueness/immutability constraints before any live persistence is introduced.

## RC8 Slice 2B Activation Execution Persistence Schema and Supabase Repository

RC8 Slice 2B adds the SQL migration draft and server-only Supabase repository for durable activation execution persistence. The schema uses two identities deliberately: `deployment_run_key text` preserves the Slice 2A TypeScript/domain `deploymentRunId` contract, while `deployment_run_record_id uuid` stores the foreign key to `public.deployment_runs(id)` resolved by the server-only repository.

The migration creates `public.deployment_activation_execution_sessions` and `public.deployment_activation_execution_items`. Sessions store prepared execution identity, plan key, payload hash, counters, ownership placeholders, rollback-boundary JSON, preparation evidence, execution metadata, lifecycle status, and timestamps. Items store approved pre-execution instructions: execution item key, plan item key, sequence, dependency level, entity/action identity, expected current state, target state, dependency keys, ready/pending status, zero attempt count, rollback evidence, and nullable execution timestamps/errors.

Database guards include clinic/deployment-run foreign keys, status checks, non-negative counter checks, JSON shape checks, prepared-shape checks, unique `(clinic_id, execution_key)`, unique `(clinic_id, deployment_run_record_id)`, unique `(clinic_id, deployment_run_key)`, unique item keys/plan keys/sequences per session, and supporting status/order indexes. RLS is enabled on both tables with no anon or broad authenticated policies, keeping these deployment-control tables server-only for service-role repositories.

`SupabaseDeploymentActivationExecutionPersistenceRepository` implements only the Slice 2A prepared persistence repository contract. It resolves `deployment_run_record_id` from `deployment_runs.deployment_run_id`, inserts only ready/prepared sessions and ready/pending items, never upserts or updates, re-reads on uniqueness races, and exposes incompatible durable rows to the service for conflict handling. Runtime setup wiring remains future work; no activation, claiming, binding, lifecycle transition, attempt increment, rollback, or deployment-run finalization occurs in this slice.

## RC8 Slice 2C Prepared Execution Persistence Runtime

The planned runtime persistence chain now reaches `activation_execution_persistence` after `controlled_activation_execution_preparation`. Successful ready preparation is persisted into `public.deployment_activation_execution_sessions` and `public.deployment_activation_execution_items` as immutable prepared evidence.

Idempotency is scoped by the deployment run and execution key. Compatible prepared sessions and items are reused; missing compatible items are inserted in deterministic sequence order; conflicting immutable evidence is reported without updates, deletes, repair, activation, ownership claims, leases, attempts, execution timestamps, binding writes, rollback work, or deployment-run finalization. The next ownership slice must treat completeness as a hard gate before claiming any prepared execution work.

## RC8 Slice 3A Claim Assessment Persistence Boundary

Prepared activation execution persistence remains the last durable runtime stage. Slice 3A adds only the TypeScript decision boundary for the next planned order:

`activation_execution_persistence -> activation_execution_claim_assessment -> future durable ownership claim`

Claim assessment reads a proposed prepared-session snapshot and item-integrity counters, then returns claimability evidence without persisting ownership. The future durable claim must be atomic and must re-check the same completeness gates before writing any owner, token, lease, or status transition. Active leases protect against concurrent executors; expired leases require untouched prepared evidence before reclaim can even be proposed.

No SQL migration, Supabase repository, runtime wiring, setup UI, session update, item update, attempt increment, activation, hardware binding, rollback, worker, polling, or deployment-run finalization is part of this slice.

## RC8 Slice 3B Atomic Claim Persistence Boundary

The persistence plan now includes the future order:

`activation_execution_persistence -> activation_execution_claim_assessment -> atomic_activation_execution_claim`

Slice 3B adds the Supabase snapshot adapter, atomic claim RPC migration, and read-only preflight SQL. The repository never falls back to read-then-update; ownership writes must go through the RPC so the database can lock the row and re-check compare-and-set predicates. Fresh claim, same-owner idempotent check, and expired reclaim are explicit modes, not generic lifecycle updates.

The session ownership shape allows `claimed` sessions with owner/token/lease and null start/completion/failure timestamps while preserving `prepared` sessions as unowned. Supporting indexes cover claim lookup, lease scans, owner/lease inspection, and item status ordering. No setup runtime wiring, item execution, activation, binding, rollback, heartbeat, lease renewal, worker, polling, streaming, or deployment finalization is introduced.

## RC8 Slice 3C Runtime Atomic Claim Wiring

The runtime persistence chain now appends `activation_execution_claim` immediately after successful `activation_execution_persistence`:

`activation_execution_persistence -> activation_execution_claim_assessment -> atomic_activation_execution_claim -> stop`

The setup runtime composes `DeploymentActivationExecutionClaimService` with `SupabaseDeploymentActivationExecutionClaimRepository`. It first reads the durable prepared session and item-completeness snapshot, assesses claim safety, and then calls only the atomic RPC for `fresh`, `same_owner`, or `expired_reclaim` ownership. There is no read-then-update fallback.

The setup path uses stable claimant id `sterisphere-setup-runtime-deployment-executor` so Verify / Reuse requests from the same setup runtime reuse active ownership instead of conflicting. The lease duration is fixed at 300 seconds, within the existing 30-900 second claim bounds. Same-owner reuse does not renew or extend the lease. Expired reclaim is allowed only when the assessed prepared evidence remains untouched and the RPC compare-and-set still matches the previous owner, token, and lease.

Claimed means exclusive ownership only. It does not mean running: no `started_at` is set, no execution item is claimed or started, no attempts increment, no activation occurs, no hardware binding is written, no rollback executes, and deployment runs are not finalized. Ownership tokens remain server-only and are not returned in Setup Complete evidence or support mail.

Verify / Reuse after a successful atomic claim treats a compatible `claimed` session as reusable immutable persistence evidence when owner, token, and lease are present, lifecycle timestamps remain null, and all items remain ready/pending with zero attempts and no execution, rollback, or error evidence. Persistence does not downgrade the session to `prepared`, renew the lease, rotate the token, or mutate items; the downstream claim stage returns same-owner `already_owned`.

## RC8 Slice 4A Execution Start Foundation

RC8 Slice 4A extends the planned execution-control chain with an assessment-only start foundation:

`prepared execution persistence -> atomic ownership claim -> execution-start assessment -> future atomic session start -> future item execution`

The new TypeScript service and repository interface assess whether a claimed activation execution session may safely be proposed for a future `running` transition. The snapshot contract includes session identity, owner/token/lease evidence, preparation and execution lifecycle status, start/completion/failure timestamps, session counters, and aggregate item-integrity evidence.

Startability requires a same-owner, same-token, actively leased `claimed` session with no lifecycle timestamps and untouched ready/pending items. Exactly one root item must be ready, no root item may be pending, the first sequence must be `1`, the first item must be `ready`, and all attempts, item timestamps, rollback timestamps, errors, duplicate keys, duplicate sequences, invalid statuses, and malformed dependencies must be absent.

This slice creates no Supabase repository, SQL, runtime wiring, setup UI, support mail changes, session updates, item updates, attempts, activation, binding, finalization, rollback, heartbeat, workers, queues, polling, streaming, or `DeploymentEngine.execute()` changes. `claimed` is ownership evidence only, `running` session start remains a future atomic mutation, and running the session remains separate from starting the first execution item.

## RC8 Slice 4B - Execution Start Persistence Boundary

`public.start_deployment_activation_execution_session` is the durable boundary for starting a claimed activation execution session. The checked-in SQL source is `docs/architecture/supabase_deployment_activation_execution_start.sql`; the read-only live verification script is `docs/architecture/supabase_deployment_activation_execution_start_preflight.sql`.

The persistence mutation is intentionally narrow: a successful call sets the session to `running` and records `started_at`. It requires the caller to present the current clinic/run/session/execution identity, owner, ownership token, lease timestamp, proposed start timestamp, and expected item count. The function performs compare-and-set ownership checks plus item-integrity checks before mutating the session row.

No execution item rows are mutated by this boundary. Attempts, item timestamps, rollback evidence, activation writes, hardware bindings, deployment run finalization, lease renewal, token rotation, heartbeat, and background execution remain out of scope.

## RC8 Slice 4C - Runtime Start Persistence

Runtime deployment now appends the atomic session-start boundary after ownership claim:

`prepared execution persistence -> atomic ownership claim -> execution-start assessment -> atomic execution-session start`

The only new durable mutation is the existing Supabase start RPC updating `public.deployment_activation_execution_sessions.execution_status` to `running` and setting `started_at`. The runtime does not mutate `public.deployment_activation_execution_items`, increment attempts, set item timestamps, renew leases, rotate tokens, activate entities, bind hardware, finalize assignments, finalize deployment runs, or execute rollback.

Start evidence is returned in `deploymentActivationExecutionStart` with start status, session id, execution key, plan key, claimant, started timestamp, lease expiration, start result, started/reused/conflict counts, blockers, warnings, issues, and zero downstream item/activation/binding counters. The ownership token is never serialized into setup action results, UI, support mail, issues, messages, or logs.

## RC8 Slice 5A - Execution Item Start Foundation

RC8 Slice 5A extends the planned execution-control chain with an assessment-only item-start boundary:

`prepared execution persistence -> atomic ownership claim -> atomic execution-session start -> execution_item_start_assessment -> future atomic item start -> future activation action execution`

The TypeScript foundation defines token-safe command, snapshot, repository, service, result, issue, downstream-counter, and in-memory test repository contracts. The snapshot includes running session identity/ownership/lease/start evidence, a deterministic candidate item, and aggregate item-integrity counters for ready, pending, running, succeeded, failed, blocked, attempted, timestamped, rollback, error, duplicate, and dependency evidence.

Item startability requires a same-owner, same-token, actively leased running session with started evidence and no terminal session timestamps. A candidate is startable only when exactly one item is ready, the candidate is that ready item, attempts and timestamps are absent, item identities are unique, dependency arrays are valid, and dependencies are empty for the first item or satisfied by prior succeeded plan-item keys for future progression. A single already-running item returns `already_started` evidence without proposing a second item.

This slice creates no SQL, migration, Supabase repository, runtime wiring, setup UI, support mail changes, session updates, item updates, attempt increments, activation writes, hardware bindings, dependency progression writes, deployment finalization, rollback execution, workers, queues, polling, streaming, activation buttons, or `DeploymentEngine.execute()` changes.

## RC8 Slice 5B - Atomic Execution Item Start Repository and SQL

RC8 Slice 5B adds the first durable item-level execution mutation boundary after a running execution session:

`prepared execution persistence -> atomic ownership claim -> atomic execution-session start -> execution_item_start_assessment -> atomic_execution_item_start -> future activation action execution`

`SupabaseDeploymentActivationExecutionItemStartRepository` implements the Slice 5A read-only snapshot contract and exposes one explicit RPC method for `public.start_deployment_activation_execution_item`. Snapshot loading reads the matching execution session and all items in deterministic sequence order, maps candidate item evidence, derives aggregate counts, and derives succeeded dependency keys for future dependency progression checks.

The SQL function updates only `public.deployment_activation_execution_items` for the selected item: `execution_status = running`, `attempt_count = attempt_count + 1`, and `started_at = p_proposed_started_at`. It performs compare-and-set checks for session identity, owner, ownership token, lease expiration, item identity, expected sequence/action/entity, expected attempt count, item set integrity, duplicate identities, dependency JSON shape, and deterministic first-ready item selection. It starts no activation action, changes no session row, unlocks no dependent item, and writes no operational entity state.

The checked-in preflight script verifies the table/column surface, exact RPC signature, fixed search path, execute privileges, absence of anon/authenticated policies, qualified nested item queries, duplicate item identities, lifecycle counts, malformed dependency JSON, orphan items, and unsafe running/attempt/timestamp/error/rollback evidence. Live application remains manual and is not performed by this code slice.

## RC8 Slice 5C - Runtime Atomic Execution Item Start Wiring

The runtime deployment chain now appends the item-start boundary after atomic execution-session start:

`prepared execution persistence -> atomic ownership claim -> atomic execution-session start -> atomic execution item start -> future activation action execution`

`deploymentActivationExecutionItemStart` evidence includes status, claimant, session and execution keys, item identity, plan item key, sequence, entity/action identity, item execution status, attempt count, item started timestamp, lease expiration, dependency count, reversibility, started/reused/conflict counts, blockers, warnings, issues, and downstream zero counters.

The stage uses one server timestamp for assessment and the proposed item `started_at`. It starts only the selected item through the atomic RPC, never through direct update/upsert fallback. `already_started` is idempotent reuse evidence and does not issue a second RPC mutation, rotate ownership, renew lease, change the item timestamp, or start another item.

The boundary remains item-start only. It does not execute the activation action, mark items succeeded or failed, unlock dependent items, mutate clinic/provider/sterilizer/workstation/hardware rows, write bindings, register agents, finalize deployment runs, rollback, add workers/queues/polling/streaming, or modify `DeploymentEngine.execute()`.

## RC8 Slice 6A - Clinic Activation Action Foundation

RC8 Slice 6A extends the execution-control plan with an assessment-only clinic activation action boundary:

prepared execution persistence -> atomic ownership claim -> atomic execution-session start -> atomic execution item start -> clinic_activation_action_assessment -> future atomic clinic activation

The TypeScript foundation defines token-safe command, snapshot, repository, service, result, issue, downstream-counter, and in-memory test repository contracts. The snapshot includes the running session ownership/lease evidence, the running sequence-1 clinic activation item, and durable clinic state. The repository interface is read-only and exists only to load evidence for a future Supabase implementation.

Clinic activation readiness requires a same-owner, same-token, actively leased running session, a running clinic activation item with attempt count 1 and no dependencies, and a durable clinic row whose canonical current state matches the item expected current state. The only supported target patch is { deploymentStatus: deployed }; already-deployed reuse is allowed only when durable clinic state equals the exact proposed target and no lifecycle conflicts exist.

This slice creates no SQL, migration, Supabase repository, runtime wiring, setup UI, support mail changes, clinic updates, item completion, dependency progression, shell activation, hardware binding, deployment finalization, rollback execution, workers, queues, polling, streaming, activation buttons, or DeploymentEngine.execute() changes. Ownership tokens remain input-only sensitive values and are not exposed in results, issues, messages, or tests.

## RC8 Slice 6B - Clinic Activation Persistence Boundary

RC8 Slice 6B adds the Supabase persistence boundary for the future clinic activation action stage:

`atomic execution item start -> clinic_activation_action_assessment -> atomic_clinic_activation -> future item completion`

The repository can load the Slice 6A snapshot from `public.deployment_activation_execution_sessions`, `public.deployment_activation_execution_items`, `public.clinics`, and the `public.deployment_runs` clinic link. The atomic RPC payload includes clinic/run/session/item identity, claimant, ownership token, expected lease, expected item start/attempt evidence, expected current clinic state, target state, and proposed activation timestamp. Returned evidence is token-safe.

The only supported durable mutation is `public.clinics.deployment_status` from `draft` to `deployed`, with `public.clinics.deployed_at` set to the proposed activation timestamp. No schema migration is introduced. The current clinic schema does not expose first-class `active`, `provisioning_source`, `provisioning_status`, `archived_at`, or `deleted_at`; the repository maps Slice 6A logical planning evidence from `deployment_status` and the deployment-run link, and the preflight records that schema assumption.

This slice does not wire setup runtime, mark the execution item succeeded, unlock dependencies, update sessions/items, activate provider/sterilizer/workstation/hardware shells, bind hardware, finalize deployment, rollback, renew leases, rotate tokens, heartbeat, add workers/queues/polling/streaming, or modify `DeploymentEngine.execute()`.

## RC8 Slice 6C - Runtime Atomic Clinic Activation Wiring

The runtime deployment chain now appends the clinic activation boundary after atomic execution item start:

`prepared execution persistence -> atomic ownership claim -> atomic execution-session start -> atomic execution item start -> atomic clinic activation -> future item completion`

`deploymentClinicActivation` evidence includes status, claimant, clinic id, deployment run key, session id, execution key, item id, execution item key, plan item key, current and target clinic states, deployed timestamp, activation result, activated/reused/conflict counts, blockers, warnings, issues, and downstream zero counters. Setup Complete and support mail report this evidence without ownership tokens.

The stage uses one server timestamp for assessment and the proposed clinic `deployed_at`. It calls `public.activate_deployment_clinic` only after a successful item-start result and a ready clinic-activation assessment. `already_activated` is idempotent reuse evidence and does not rewrite `deployed_at`, renew ownership, rotate tokens, complete the item, or unlock another item.

The boundary remains clinic-row only. It does not mark the execution item succeeded or failed, unlock dependent items, mutate provider/sterilizer/workstation/hardware rows, write hardware bindings, register agents, finalize deployment runs, rollback, add workers/queues/polling/streaming/buttons, or modify `DeploymentEngine.execute()`.

## RC8 Slice 7A - Activation Execution Item Completion Assessment Boundary

RC8 Slice 7A creates the item-completion foundation without SQL, Supabase persistence, setup runtime wiring, UI changes, or execution mutation. It introduces item-completion types, a read-only repository interface, an assessment service, an in-memory test repository, and compile-checked harness coverage under `lib/modules/deployment/`.

The assessment reads session evidence, the current clinic activation item, durable clinic state, and aggregate item-integrity counters. `completable` requires a running same-owner session with a valid lease, exactly one running sequence-1 clinic activate item, attempt count 1, valid item start evidence, no rollback or error evidence, empty dependencies, durable clinic state `deploymentStatus = deployed`, non-null deployed timestamp, exact target-state equality, no duplicate item identities, and no execution evidence on unrelated items.

`already_completed` allows idempotent reuse when the same clinic activation item is already `succeeded`, started and completed timestamps are present, attempt count remains 1, durable clinic evidence still matches, and all downstream items remain untouched. Warning issues document only future boundaries: atomic completion persistence, dependency progression, and rollback execution remain unavailable.

## RC8 Slice 7B - Activation Execution Item Completion Persistence Boundary

The runtime deployment chain now appends item completion after atomic clinic activation:

`prepared execution persistence -> atomic ownership claim -> atomic execution-session start -> atomic execution item start -> atomic clinic activation -> atomic execution item completion -> future dependency progression`

`SupabaseDeploymentActivationExecutionItemCompletionRepository` performs read-only snapshot loading plus one explicit RPC call to `public.complete_deployment_activation_execution_item`. The checked-in SQL source is `docs/architecture/supabase_deployment_activation_execution_item_completion.sql`, with read-only verification notes in `docs/architecture/supabase_deployment_activation_execution_item_completion_preflight.sql`.

The RPC compare-and-set requires the same clinic/run/session/execution identity, owner, ownership token, expected lease, item id, execution item key, plan item key, sequence 1, clinic activate action, expected started timestamp, expected attempt count, and null completion/rollback/error evidence. A successful mutation marks only that execution item `succeeded` and writes `completed_at`; `already_completed` reuses the prior succeeded item without rewriting timestamps or ownership evidence.

This slice does not unlock dependencies, mark downstream items ready, start provider activation, complete or finalize the execution session, mutate the deployment run, activate provider/sterilizer/workstation/hardware shells, write hardware bindings, renew leases, rotate tokens, rollback, create UI changes, or modify `DeploymentEngine.execute()`.
