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
