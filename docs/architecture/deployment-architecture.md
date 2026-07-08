# SteriSphere v1 Deployment Architecture

## 1. Purpose

This document defines the target deployment architecture for SteriSphere v1
before migrations or persistence code are introduced. It establishes the
tenancy root, deployment state model, persistence boundaries, access gating,
audit strategy, and update model needed to turn a reviewed Setup Wizard draft
into an operational clinic.

SteriSphere Lab remains the development and validation environment. A real
clinic deployment must use an isolated environment and a repeatable process
that does not depend on pre-existing Lab data.

## 2. Tenancy Root: `clinics`

`clinics` should be the canonical root for clinic identity, tenancy, and
deployment lifecycle. Clinic-owned configuration and operational records
should reference `clinics.id` through `clinic_id`.

Proposed fields:

| Field | Purpose |
| --- | --- |
| `id` | Stable clinic identifier and primary key. |
| `name` | Operational display name. |
| `legal_name` | Registered legal name, when different. |
| `clinic_code` | Human-readable unique deployment code. |
| `country` | Country used for regional defaults. |
| `province_state` | Province, state, or equivalent region. |
| `timezone` | Clinic-local IANA time zone. |
| `primary_language` | Default clinic language. |
| `phone` | Primary clinic phone number. |
| `email` | Primary clinic email address. |
| `website` | Clinic website. |
| Address fields | Structured street, unit, city, postal/ZIP code, and related address values. |
| `deployment_status` | Current deployment lifecycle status. |
| `deployed_at` | Timestamp of the first successful deployment. |
| `created_at` | Record creation timestamp. |
| `updated_at` | Last modification timestamp. |

The exact database types, indexes, uniqueness constraints, and address column
names belong to the migration design. The architectural requirement is that
clinic identity has one durable root rather than being inferred from settings,
users, or environment variables.

## 3. Deployment Status

`clinics.deployment_status` should use these states:

- `draft`: the clinic exists as a deployment target but is not operational.
- `deploying`: an atomic deployment attempt is in progress.
- `deployed`: required configuration was created successfully and the live
  workspace may be opened.
- `failed`: the latest deployment attempt failed and requires review or retry.
- `archived`: the clinic is intentionally inactive and cannot enter normal
  operations.

The dashboard must remain blocked until the clinic is `deployed`. The Setup
Wizard is available during first deployment and may later support an explicit
reconfiguration mode. A successful deployment locks the first-run wizard; it
does not delete the wizard or its architecture.

State changes must be controlled by the deployment service rather than by
client-side navigation. A retry may transition `failed` back to `deploying`,
but only through a validated deployment run.

## 4. Deployment Runs

`deployment_runs` should record every reviewed deployment attempt and provide
the basis for idempotency, audit, diagnostics, and safe retry.

Proposed fields:

| Field | Purpose |
| --- | --- |
| `id` | Stable deployment-attempt identifier. |
| `clinic_id` | Clinic being deployed. |
| `status` | Attempt state, such as pending, running, succeeded, or failed. |
| `idempotency_key` | Unique caller-supplied key preventing duplicate execution. |
| `draft_version` | Version of the Setup Wizard draft contract. |
| `payload_hash` | Deterministic hash used to identify the reviewed input. |
| `reviewed_payload` | Immutable snapshot of the configuration approved for deployment. |
| `started_by` | Authenticated user who initiated the run. |
| `started_at` | Attempt start timestamp. |
| `completed_at` | Successful completion timestamp. |
| `failed_at` | Failure timestamp. |
| `failure_stage` | Named deployment stage that failed. |
| `failure_message` | Sanitized diagnostic message for support and retry. |

A repeated request with the same clinic and idempotency key must return the
existing run rather than create duplicate configuration. The reviewed payload
snapshot and hash establish what was approved without making mutable local
wizard state the audit source of truth.

## 5. First Super Admin Bootstrap

The current application requires an existing active `super_admin`. For v1,
SafeNebula may need to create the first Super Admin before the Setup Wizard can
be opened in a clean environment.

User identities and clinic administrator accounts must be created through
Supabase Auth. SteriSphere must not implement custom password storage. Initial
password policy should require at least 12 characters, with passkeys and
two-factor authentication reserved as future enhancements.

Every clinic should retain a controlled SafeNebula/SteriSphere support Super
Admin pathway for deployment recovery and support. That pathway must be
auditable, least-privileged in use, and must not depend on sharing clinic-user
credentials.

## 6. Clinic Membership and RBAC

A future `clinic_memberships` relation should connect an authenticated user to
a clinic and role. This replaces global role inference as the long-term
authorization model.

The current `user_roles` model is email-based and global. It can support the
initial transition, but it does not express clinic ownership or safe
multi-clinic access. Clinic-scoped roles remain:

- `super_admin`
- `admin`
- `clinical_staff`
- `doctor`
- `auditor`

The membership design should permit one user to belong to more than one clinic
later without duplicating their Supabase Auth identity. Multi-clinic ownership
and switching are not required in the initial v1 UI.

## 7. Clinic Scoping Strategy

Core operational tables must eventually carry `clinic_id`. Newer planned tables
that already have a nullable `clinic_id` should make it required once existing
data has been safely backfilled and the deployment root is available.

Tables to scope include:

- `clinic_settings`
- `providers`
- `sterilizers`
- `cycles`
- `load_items`
- `packs`
- `patients`
- `patient_traces`
- `audit_logs`
- `clinical_workstations`
- `clinical_agents`
- `clinical_hardware_devices`
- `workstation_sessions`

The initial v1 release may support one clinic per deployment environment.
Nevertheless, ownership must be explicit in the schema so that environment
isolation is a deployment choice rather than an implicit tenancy mechanism.
Future RLS policies should derive access from clinic membership and record
ownership.

## 8. Deployment Data Mapping

The reviewed Setup Wizard draft should map to persistence as follows:

| Wizard area | Future persistence target |
| --- | --- |
| Clinic Profile | `clinics` and `clinic_settings` |
| Workstations | `clinical_workstations` |
| Provider counts | Provider planning records, not fabricated `providers` |
| Sterilizers | `sterilizers` |
| Pack expiration | `clinic_settings` |
| Hardware quantities | Hardware planning records, not `clinical_hardware_devices` |
| Review / Complete | `deployment_runs` and `audit_logs` |

Planning quantities describe expected clinic structure. They must not create
fake people or pretend physical devices have been discovered, registered, or
validated. Operational provider identities and hardware-device records belong
to their respective post-deployment workflows.

## 9. Atomic Deployment and Rollback

Deployment should be all-or-nothing wherever the data platform permits. The
deployment service should validate the complete reviewed payload before writes,
acquire the clinic deployment transition, and create required configuration in
a database transaction or equivalent atomic server-side operation.

Duplicate deployment must be prevented through clinic status, a unique
idempotency key, and constraints on the created clinic-owned records. A failure
must roll back partial configuration and must not expose a half-created clinic
workspace.

Failed attempts remain in `deployment_runs` and the audit trail with a
sanitized failure stage and message. Rollback must not erase evidence of the
attempt. The local draft should remain recoverable so deployment staff can
correct it and retry without rebuilding the clinic plan.

## 10. Dashboard Gating

After authentication, application routing should resolve the user's clinic and
its deployment status before granting access to normal clinic routes:

- An authenticated Super Admin for an incomplete clinic is redirected to
  `/setup`.
- A Super Admin for a `deployed` clinic enters the normal dashboard.
- A non-Super Admin for an incomplete clinic sees a locked or
  setup-in-progress state and cannot access `/setup` or the dashboard.
- An archived clinic does not enter normal operations.

Client redirects improve the experience, but server-side authorization and
data access must remain authoritative. Hiding dashboard navigation alone is not
a security boundary.

## 11. Setup Wizard Lifecycle

The Setup Wizard is the first-run deployment workspace. It owns draft
collection, validation, review, and the explicit launch action before the
clinic becomes operational.

After successful deployment, the first-run wizard is locked. Routine
reconfiguration belongs in role-appropriate Settings workflows rather than
rerunning setup against live data. A future "new clinic deployment" mode may
create a separate clinic draft and deployment run, but it must not mutate an
existing deployed clinic implicitly.

Keeping the wizard available in the codebase preserves the deployment
capability, supports audit and support views, and leaves room for a deliberate
future reconfiguration experience.

## 12. Update Rollout Model

SteriSphere Lab remains the permanent testing ground. Product and schema
updates flow through:

`Lab -> validation -> clinic rollout`

Schema migrations must be versioned, repeatable, and tested against realistic
data before clinic rollout. Each clinic should record its deployment version
and schema version so support can determine its current state and required
upgrade path.

Future clinic updates should be smooth and reversible when possible. Changes
that cannot be rolled back safely require an explicit forward-recovery plan,
backup or restore validation where appropriate, and clear rollout evidence.

## 13. Non-Goals for Phase 9.1

- No database migrations.
- No deployment persistence code.
- No RLS implementation.
- No full multi-clinic UI.
- No provider identity rewrite.
- No hardware discovery changes.

## 14. Decisions Summary

- Add `clinics` as the canonical tenancy and deployment root.
- Add `deployment_runs` for idempotency, audit, failure diagnostics, and retry.
- Do not delete the Setup Wizard after deployment; lock its first-run mode.
- Gate dashboard access by clinic deployment status.
- Keep provider and hardware quantities as planning data.
- Use Supabase Auth for all user identities and passwords.
- Move toward clinic-scoped memberships and roles.
- Add explicit `clinic_id` ownership to operational data.
- Prefer atomic deployment with auditable failed attempts and recoverable
  drafts.
- Preserve SteriSphere Lab as the permanent staging and test ground.

## Deployment Engine Module

The implementation foundation lives in `lib/modules/deployment`. It defines the
shared deployment contracts, ordered stage registry, legal status transitions,
pure precondition helpers, and the `DeploymentEngine` interface.

The engine performs no SQL, Supabase access, network calls, authentication
changes, or persistence. Its current `execute()` method runs only the in-memory
simulation and cannot move a clinic out of draft state. Future persistence work
must implement the workflow described by this document and the deployment
sequence without weakening these boundaries.

The state machine permits `draft -> deploying`, followed by either
`deploying -> deployed` or `deploying -> failed`. A failed deployment may retry
through `failed -> deploying`. Draft, failed, or deployed clinics may be
archived; `archived` is terminal. Every other transition is illegal.

## Deployment Core Planning SQL

`supabase_deployment_core.sql` is the migration-ready planning artifact for the
initial Deployment Engine schema. It defines the proposed `clinics`,
`deployment_runs`, `clinic_provider_plans`, and `clinic_hardware_plans` tables,
including lifecycle checks, planning-count checks, idempotency, indexes, and
`updated_at` maintenance.

The SQL is not applied automatically and is not connected to application
runtime behavior. RLS remains deliberately deferred until clinic memberships,
bootstrap authorization, and support access are designed together. A later
migration phase must review the planning file against the target Supabase
environment before applying it.

## Canonical Deployment Draft

The Deployment Engine consumes one canonical, versioned `DeploymentDraft`.
This reviewed payload contains clinic identity, workstations, provider planning
counts, sterilizers, baseline policies, hardware planning counts, and review
metadata. It is the contract between deployment planning and execution.

The Setup Wizard may continue to organize local state for its UI, but that
state must eventually be transformed and validated into `DeploymentDraft`
before execution. Persistence must never infer deployment data directly from
scattered component state, form controls, or the currently visible wizard
step.

The local foundation includes a deterministic non-cryptographic draft-input
hash for development and contract testing. A future persistence phase must
produce or verify a cryptographic payload hash at the trusted server boundary
before treating it as durable audit or idempotency evidence.

## Deployment Draft Adapter

The planning-to-execution boundary is:

`Setup Wizard local state -> Deployment Draft Adapter -> DeploymentDraft -> Deployment Engine`

The adapter maps the wizard's clinic profile and its separate workstation,
provider, sterilizer, policy, hardware, and review planning state into one
fully populated canonical draft. It applies canonical empty defaults where
optional local values are absent and returns local draft-validation results
alongside the generated payload.

The Deployment Engine never reads React state, page components, form controls,
or Setup Wizard stores directly. The adapter is pure and contains no UI,
Supabase, persistence, route, authentication, or deployment-execution behavior.

The Setup Wizard Review step may use this adapter to preview the canonical
draft version, local payload hash, summary counts, and validation issues before
confirmation. This preview is visibility-only local validation. It does not
persist the draft, invoke the Deployment Engine, enable the Deploy action, or
unlock the clinic workspace.

## Simulated Deployment Execution

The Deployment Engine now supports a complete in-memory simulation of the
ordered stage registry. Each stage produces timestamps, duration, status,
messages, and warnings, while the overall result records completed, failed,
and skipped stages plus rollback intent and the deployment summary.

Simulation proves orchestration, validation stops, failure handling, and report
shape without writing data. `execute()` intentionally delegates to
`simulate()` until persistence is implemented. Future real stage handlers will
replace simulated handlers behind the same ordered contracts; simulation does
not enable the Setup Wizard Deploy action or change runtime clinic state.

## Persistence Repository Layer

The deployment architecture now separates three implementation layers:

`Deployment Engine -> Simulation Layer | Persistence Layer -> DeploymentRepository`

The engine owns validation, stage ordering, stop conditions, rollback intent,
and result reporting. The simulation layer proves that orchestration entirely
in memory. The future persistence layer will implement real stage handlers by
calling the typed `DeploymentRepository` contract rather than issuing database
writes directly from the engine.

The repository contract provides explicit operations for clinic creation,
deployment runs, clinic settings, workstations, sterilizers, provider and
hardware plans, audit entries, completion, and rollback. The current
`SupabaseDeploymentRepository` is intentionally inert: every operation throws
`Deployment persistence has not been implemented.` and contains no Supabase
client or mutation code.

`DeploymentEngine` accepts a repository through dependency injection and uses
the inert repository by default. It does not call that dependency during
simulation. Future phases can replace individual simulated stage handlers with
repository-backed handlers while preserving the stage registry, execution
report, and failure semantics.

### Repository Payload Builders

Pure repository payload builders transform the canonical `DeploymentDraft`
into the typed input for each repository operation. Persistence stages must
consume these payloads rather than reading Setup Wizard state or interpreting
draft fields independently in multiple handlers.

`DeploymentRepositoryBuildContext` supplies externally generated clinic and
deployment-run identifiers, the initiating user, idempotency key, timestamp,
deployment version, and schema version. Builders never generate random IDs,
read the clock, access Supabase, or perform side effects. When an optional
value is not supplied, the builder preserves an omitted or nullable
schema-compatible value instead of inventing persistence metadata.

### Repository Payload Dry Run

The simulation layer now calls the pure payload builders at each corresponding
stage. Deterministic simulated clinic and deployment-run identifiers,
idempotency, timestamp, deployment version, and schema version are supplied
through `DeploymentRepositoryBuildContext`.

This dry run validates that one canonical `DeploymentDraft` can produce the
repository inputs needed by future persistence without invoking repository
methods. Stage results expose only payload type, generation status, and a safe
count or label summary for diagnostics. Full payload values remain internal to
the simulation and are not exposed in the Setup Wizard.

### Simulated Deployment Transactions

The Deployment Engine now models the all-or-nothing deployment boundary with an
in-memory `DeploymentTransaction`. The simulated transaction begins before the
first persistence-relevant stage, records checkpoints after each successful
persistence-relevant stage, commits when the full deployment simulation
succeeds, and aborts plus rolls back its recorded checkpoints when a simulated
stage fails.

This transaction layer does not create a database transaction, call Supabase,
write SQL, or invoke repository methods. It exists to prove the orchestration
contract that real persistence must later honor: create a durable run, apply
clinic configuration as one atomic unit where possible, and use safe
compensating rollback where a future persistence provider cannot guarantee a
single atomic database operation across every side effect.

Stage results may include transaction metadata for diagnostics: transaction
identity, checkpoint identity, current transaction status, and rollback
checkpoint count. The metadata is intentionally structural and contains no full
repository payloads or persisted data.

### Deployment Lock Foundation

Durable deployment locking is a required v1.0 safeguard before real
persistence can be enabled. The local foundation now defines typed deployment
lock contracts for lock status, lock requests, lock results, failure reasons,
and auditable lock metadata. The simulation can attach safe lock metadata to
the `Lock Deployment` stage without writing data.

The current lock layer is deterministic and in memory only. It models the
expected rules:

- If no active lock exists, the deployment run may acquire the lock.
- If the same idempotency key reaches an active lock, the existing deployment
  run should be reused.
- If a different idempotency key reaches an active lock for the same clinic,
  the duplicate deployment request should be rejected.
- If a lock is expired, the clinic should enter careful recovery review before
  retry rather than automatically proceeding.

Real v1.0 locking must be server-side and database-enforced. Disabling a
button in the Setup Wizard is not a concurrency control. Future persistence
must atomically connect the lock to clinic identity, deployment-run identity,
idempotency key, requester, acquired/released timestamps, failure reason, and
audit evidence before any clinic configuration writes can occur.

### Server-Side Idempotency Foundation

Server-side idempotency is a required v1.0 safeguard before real persistence
can be enabled. The local foundation now defines typed idempotency contracts
for idempotency status, request metadata, result metadata, conflict reasons,
and safe stage diagnostics. The simulation can attach idempotency metadata to
the `Create Deployment Run` stage without creating a run in storage.

The current idempotency layer is deterministic and in memory only. It models
the expected rules:

- A missing or invalid idempotency key is rejected.
- The same idempotency key with the same payload hash replays the existing
  deployment run.
- The same idempotency key with a different payload hash is a conflict.
- An expired idempotency key requires a new key or manual recovery review.
- A new key may create a new deployment run only when no active deployment
  conflict exists.

Idempotency complements deployment locking; it does not replace it. Real v1.0
idempotency must be enforced by the server and backed by durable database
constraints or equivalent atomic operations. Duplicate Deploy clicks, browser
retries, and network retries must return or reuse the original deployment run
instead of creating duplicate clinic configuration. Idempotency results,
payload hash comparisons, requester identity, expiry, and conflict decisions
must remain auditable through deployment-run evidence.

### Rollback Verification and Recovery Foundation

Rollback verification is mandatory before a failed deployment may be retried.
The local foundation now defines typed rollback verification and recovery
contracts for rollback status, rollback steps, rollback checkpoints,
verification evidence, recovery plans, and recovery results. When the
simulation rolls back an in-memory transaction, the result can include safe
rollback verification metadata without calling repositories or writing data.

The current rollback layer is deterministic and in memory only. It models the
expected rules:

- A completed rollback with verified checkpoints is safe to retry.
- A partial rollback requires manual cleanup before retry.
- A rollback failure blocks deployment until administrator or engineering
  intervention completes.
- Manual recovery is preferable to silently accepting inconsistent deployment
  state.

Recovery plans classify the next action as automatic retry, manual
verification, manual cleanup, or engineering support. Real v1.0 persistence
must keep rollback evidence auditable through deployment-run records and
sanitized recovery notes. Rollback verification must not erase the failed
attempt, the reviewed payload identity, or the reason support intervention was
required.

### Deployment Audit Evidence Envelope

The Deployment Audit Evidence Envelope is the canonical future persistence
boundary for deployment evidence. The local foundation now defines typed
contracts for the evidence envelope, events, subject, actor, snapshot,
integrity metadata, and summary. The envelope describes what happened during a
deployment attempt; it does not cause side effects, write audit records, unlock
routes, or change deployment behavior.

The envelope is immutable in concept. Future real audit persistence should
store the generated envelope or a durable equivalent so support can explain:

- Which deployment draft snapshot was reviewed.
- Which dry-run repository payload diagnostics were prepared.
- Which idempotency and lock decisions occurred.
- Which transaction checkpoints were recorded.
- Whether rollback was required and verified.
- Which recovery plan was selected.
- Which stages completed, failed, or were skipped.
- Whether retry is safe, blocked, or requires manual recovery.

Silent deployment inconsistency is unacceptable. Failed, partial, blocked, and
successful outcomes must all leave auditable evidence. Retry decisions must be
explainable from the evidence envelope rather than inferred from UI state,
console output, or scattered operational records.

### Deployment Lifecycle State Machine

The deployment lifecycle state machine is the canonical model for deployment
progress and recovery decisions. It is separate from the older coarse
`clinics.deployment_status` values and describes the internal deployment
attempt lifecycle from draft review through validation, locking, execution,
rollback, verification, recovery, and completion.

The local foundation now defines typed lifecycle states, transition rules,
transition results, state snapshots, and lifecycle summaries. Only legal
transitions are allowed by the pure helper layer. Persistence will later store
or derive durable lifecycle transitions from trusted server-side execution,
but the current implementation remains in-memory and descriptive only.

Rollback verification must pass before retry can be considered safe. A blocked
lifecycle state requires administrator intervention. A manual recovery state
requires evidence-backed recovery before returning to ready. Audit evidence may
reference lifecycle summaries so retry decisions are explainable from recorded
deployment evidence rather than inferred from UI state.

### RC2 deployment_runs Persistence Boundary

RC2 persistence readiness starts with `deployment_runs` only. The deployment
run is the durable evidence boundary for a deployment attempt: it owns
idempotency identity, payload hash, lifecycle state, coarse deployment status,
the canonical reviewed draft snapshot, the audit evidence envelope,
rollback/recovery evidence, lifecycle summary, and safe metadata.

This boundary is intentionally evidence-first rather than clinic-creation-first.
`clinic_id` remains nullable because a deployment attempt may be reviewed,
blocked, failed, or deduplicated before any clinic tenancy root exists. Future
clinic creation, tenant setup, settings persistence, user creation, and
downstream stage persistence remain out of scope until their own RC2 slices.

The deployment module now defines deployment-run-only types, payload builders,
and an inert `DeploymentRunRepository` contract. Same idempotency key plus the
same payload hash should read the existing run. Same idempotency key plus a
different payload hash must be rejected as a conflict. The repository contract
does not write data yet, and the Deployment Engine continues to run as a
simulation-first orchestrator.

`supabase_deployment_runs.sql` is the RC2 Slice 2 migration draft for this
boundary. It creates the `deployment_runs` table only, with unique run and
idempotency identifiers, lifecycle/status checks, evidence JSON columns, retry
lineage, and lookup indexes. The SQL is not wired at runtime and does not
create operational clinic records. Idempotency conflict handling remains a
server-side repository design until a later slice explicitly connects runtime
Supabase persistence.

RC2 Slice 3 adds an unused `SupabaseDeploymentRunRepository` implementation for
the same boundary. The implementation may call Supabase internally when a
future server-side deployment path explicitly instantiates it, but no current
runtime path does so. Its write surface is limited to `deployment_runs`
evidence/status fields: lifecycle state, deployment status, audit evidence,
rollback recovery, lifecycle summary, terminal timestamps, retry lineage, and
metadata. It does not create clinics, tenants, settings, users, or downstream
deployment-stage records.

RC2 Slice 4 defines the server-owned `DeploymentRunService` boundary for
deployment-run orchestration. The service receives a repository through
dependency injection, evaluates idempotency decisions, builds deployment-run
payloads, and can resume an existing deployment run from evidence. It is not
called by UI, routes, or the Deployment Engine. The deployment module exports
the service command/result types for review, while the service implementation
must be imported explicitly by a future trusted server-side wiring slice.

RC2 Slice 5 adds an in-memory test harness for that service boundary. The fake
repository implements only `DeploymentRunRepository`, records call counts, and
keeps explicit forbidden-boundary counters at zero for clinic, tenant,
settings, user, stage, and engine activity. The harness is compile-checked but
does not introduce a runtime test runner, Supabase calls, UI wiring, API
routes, or deployment execution.

### RC2.5 Server-only Deployment Run Wiring

`deployment-run-server.ts` is the first runtime composition point for the RC2 `deployment_runs` boundary. It is marked with `server-only`, accepts a trusted server-side Supabase client, and composes `SupabaseDeploymentRunRepository` with `DeploymentRunService`.

This wiring is intentionally private. It is not exported from the deployment module barrel and is not reachable from the Setup Wizard, UI components, public API routes, or the Deploy button. The Deployment Engine remains simulation-first, and `execute()` continues to delegate to the simulated sequence.

The helper may create or reuse only a `deployment_runs` evidence record. It must not create clinics, tenants, settings, users, providers, sterilizers, packs, cycles, traces, audit logs, or any downstream deployment-stage records.

### RC2.5 Server Boundary Smoke Harness

`deployment-run-smoke-harness.ts` is a private server-only verification helper for the deployment-run wiring. It uses `createOrReuseServerDeploymentRun()` to prove create, reuse, and conflict behavior against `deployment_runs` without exposing a route, changing UI, or importing the Deployment Engine.

The harness assumes a trusted server Supabase client with permission to select and insert `deployment_runs`. In an RLS-enabled environment, manual execution should use a service-role server client and the smoke row should be removed with the cleanup query documented in the deployment persistence plan.

### RC2.5 First Runtime Deployment Run Persistence

The Deployment Workspace Complete step now has a guarded real persistence action for `deployment_runs`. It calls a server action, which uses the server-only deployment-run helper to create or reuse one evidence row for the reviewed canonical draft.

This is not real clinic deployment. The Deployment Engine stage sequence remains simulated, `execute()` is unchanged, and no downstream repository or operational table is wired. The UI must continue to tell users that the deployment run was persisted while clinic creation remains simulated and not activated.

### RC2.5 Deployment Session Identity

Deployment run identity is based on the immutable setup session, not the editable clinic code. The clinic code remains clinic profile data and may be changed without changing which setup session owns the deployment run idempotency key.

The completion UX now models the post-deployment handoff before real clinic creation: previous steps lock after run persistence, Access SteriSphere Platform is reserved for future activation, Start Over creates a new session, and Contact Support carries the deployment/session context needed for troubleshooting.
