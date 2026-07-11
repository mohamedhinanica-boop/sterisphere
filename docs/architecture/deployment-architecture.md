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

### RC3 Clinic Root Boundary

RC3 introduces the clinic root as the first real clinic persistence design, but not as active runtime execution. The clinic root boundary is separate from the full DeploymentRepository and separate from DeploymentEngine.execute().

DeploymentClinicService composes a clinic-root repository with the existing deployment-run repository. It requires an existing deployment run, maps the reviewed DeploymentDraft.clinicProfile into a CreateDeploymentClinicPayload, creates or reuses one draft clinic root, and links that clinic to deployment_runs.clinic_id only after the clinic root is known to exist.

The clinic profile fields mapped into clinics are display name, legal name, clinic code, country, province/state, timezone, primary language, contact fields, address fields, deployment version, schema version, and timestamps. The clinic starts with deployment_status = 'draft', with no deployed timestamp and no operational access.

This boundary does not create clinic_settings, users, memberships, providers, sterilizers, workstations, hardware devices, packs, cycles, traces, audit logs, or planning records. Those remain separate future deployment stages. The full SupabaseDeploymentRepository remains inert until a later slice explicitly replaces simulated stage handling.

The server-only repository and service files import server-only and are not exported from the deployment barrel. Pure type and payload files may be imported for compile-time design review, but runtime clinic creation must later be composed only from trusted server code with service-role Supabase access and explicit authorization checks.

### RC3 Server-only Clinic Root Helper

RC3 now has a private server-only clinic-root helper that composes the Supabase clinic repository, Supabase deployment-run repository, and DeploymentClinicService. This is a composition boundary only; it is not exported from the deployment barrel and is not imported by UI, routes, Setup Wizard code, or DeploymentEngine.

The helper may create or reuse one draft clinic root for an existing deployment run and link deployment_runs.clinic_id to the clinic id. The clinic remains non-operational with deployment_status = draft. Settings, users, memberships, providers, sterilizers, workstations, packs, cycles, traces, audit logs, planning records, finalization, dashboard unlock, and redirect behavior remain outside this boundary.

## RC3 Slice 6 Runtime Boundary

The first Setup runtime clinic-root wiring remains server-only. `app/setup/actions.ts` creates the trusted Supabase service-role client, persists/reuses the deployment run through `deployment-run-server.ts`, and then calls `deployment-clinic-server.ts` to create/reuse one draft clinic root and link `deployment_runs.clinic_id`.

This boundary does not expose a public API route and does not call `DeploymentEngine.execute()`. The DeploymentEngine simulation path remains unchanged. The only runtime writes introduced by this slice are `public.clinics` inserts/reuse and `deployment_runs.clinic_id` linking.

The Complete step displays both deployment-run status and clinic-root status. Platform access stays disabled because clinic configuration and all downstream operational records are still simulated.

## RC4 Slice 1 Provisioning Boundary

Clinic settings provisioning is implemented as a server-only deployment module. The setup server action calls the settings helper only after clinic-root provisioning succeeds and a clinic id is available.

The provisioner composes `SupabaseDeploymentClinicSettingsRepository` and `DeploymentClinicSettingsService`. It reads `public.clinics` to require the clinic root and writes only `public.clinic_settings`. It does not call `DeploymentEngine.execute()`, does not change the full DeploymentRepository, and does not provision providers, sterilizers, workstations, hardware, packs, cycles, traces, users, or audit logs.

The Complete step reports Clinic Root and Clinic Settings independently. Platform access remains disabled because clinic activation and operational provisioning are still future slices.

## RC4 Slice 2A Provider Provisioning Design Boundary

Provider provisioning is not runtime-wired yet. The current setup draft provides provider counts only, while `public.providers` represents real named people used by Settings and Traceability. RC4 provider provisioning must therefore use clinic-scoped provider shells with explicit placeholder semantics in a later slice.

The schema draft preserves global providers and adds nullable clinic/provisioning metadata so a later server-only provisioner can safely create deterministic shell records per draft clinic without changing current Settings behavior or Traceability reads.

## RC4 Slice 2B Provider Provisioning Foundation

The provider provisioning foundation now defines provider-shell types, a pure payload builder, an inert repository contract, a server-only service, and an in-memory harness. It remains unwired from runtime deployment and does not change UI, Setup Wizard behavior, the Deploy button, or `DeploymentEngine`.

Provider counts map to clinic-scoped placeholder shells, not staff identities. The deterministic key space is per clinic and uses category sequences such as `dentist-001`, `hygienist-001`, `assistant-001`, `receptionist-001`, `treatment-coordinator-001`, `sterilization-technician-001`, and `office-manager-001`. Shell display fields clearly show placeholder status; `title` uses a role label such as `Dentist Placeholder`, while `display_name` and `full_name` include the sequence plus a short clinic-id suffix such as `Dentist Placeholder 001 - <clinic-id-short>` so separate clinics do not collide on the global full-name uniqueness index. First and last names remain null.

The service requires a real clinic root and existing `clinic_settings` before provider shells can be provisioned. Shells are written with `provisioning_source = setup_draft`, `provisioning_status = placeholder`, and `active = false`. Keeping placeholders inactive prevents them from leaking into legacy active-provider traceability workflows before a later naming/activation workflow intentionally promotes them.

Retry behavior is deterministic: existing shells with matching deployment keys are reused, only missing shells are created, duplicate keys in the same clinic are reported as conflicts, and global legacy providers with `clinic_id = null` do not participate in deployment-shell matching.

## RC4 Slice 2C Provider Supabase Repository

The provider-shell boundary now has an unused server-only Supabase adapter. It implements only provider-shell lookup, insert, and listing against `public.providers`; prerequisite checks and orchestration remain owned by the service layer and future trusted composition.

The adapter enforces shell semantics before insert: `setup_draft`, `placeholder`, inactive, clinic-scoped, deterministic deployment key, and no first/last names. Duplicate clinic/key handling is explicit and idempotent for existing placeholders, while non-placeholder collisions are surfaced as conflicts. This does not wire provider provisioning into setup completion or advance the deployment sequence beyond clinic settings.

## RC4 Slice 2E Runtime Provider Shell Boundary

Setup completion now includes provider-shell provisioning after deployment-run evidence, draft clinic root linkage, and clinic settings are durable. The runtime write surface expands only to inactive placeholder rows in `public.providers`; no operational named staff identities are created.

The Complete step reports Provider Shells status and requested, created, reused, and conflict counts. Retry/reuse is keyed by `(clinic_id, deployment_provider_key)`, so repeated setup confirmation can verify existing shells without duplicating rows. Platform access stays disabled and downstream configuration remains simulated.

## RC4 Slice 3 Sterilizer Provisioning Design Boundary

Sterilizer provisioning is designed but not runtime-wired. The current pipeline remains `deployment_run -> clinic root -> clinic_settings -> provider placeholder shells`; sterilizer inserts are still blocked.

The setup draft already contains itemized sterilizer planning rows. Unlike provider counts, sterilizer rows can describe real planned equipment through display name, type, manufacturer, model, serial number, workstation assignment, and status. Runtime provisioning must still keep them inactive until a later operational readiness step because existing cycle-start screens list `public.sterilizers` where `active = true` and then store the selected sterilizer name on cycle records.

Future sterilizer provisioning must be clinic-scoped and deterministic. It should require a durable deployment run, linked draft clinic root, linked clinic settings, and completed provider shell provisioning before creating any sterilizer rows. Each reviewed draft item should receive a key such as `sterilizer-001`, and retries must reuse by `(clinic_id, deployment_sterilizer_key)`. Legacy global sterilizers where `clinic_id is null` remain untouched and are not auto-attached to new clinics.

The next approved work should be schema-first: inspect the live `public.sterilizers` table, then draft nullable clinic/deployment/provisioning metadata plus a partial unique index for `(clinic_id, deployment_sterilizer_key)`. Only after that should a server-only sterilizer type/payload/repository/service foundation be added. No workstation, hardware, pack, cycle, trace, user, audit, activation, Deploy button, or `DeploymentEngine.execute()` behavior belongs in the sterilizer design slice.

## RC4 Slice 3A Sterilizer Schema Preparation

The sterilizer schema preparation is SQL-only. `supabase_sterilizers_preflight.sql` inspects the existing operational sterilizer table before changes, including active distribution and global name uniqueness risk. `supabase_sterilizers_deployment_fields.sql` prepares nullable clinic/deployment metadata while preserving legacy rows with `clinic_id = null`.

The planned schema guardrail is `(clinic_id, deployment_sterilizer_key)` uniqueness for deterministic setup-created keys such as `sterilizer-001`. Future setup-created sterilizers must remain inactive (`active = false`) and use `provisioning_status = planned` until an explicit operational activation workflow enables cycle use. Workstation assignment remains deferred until workstation persistence exists.

## RC4 Slice 3B Sterilizer Provisioning Foundation

The sterilizer provisioning foundation is now defined as an inert deployment module boundary. It adds type contracts, a pure payload builder, repository interfaces, a server-only service, and an in-memory harness, but it is not imported by runtime setup completion and does not call Supabase.

The model treats setup draft sterilizer rows as planned equipment records, not operational devices. Payloads use deterministic deployment keys such as `sterilizer-001`, generate globally unique readable names with a clinic suffix, write future rows as `provisioning_source = setup_draft`, `provisioning_status = planned`, and `active = false`, and leave workstation assignment null/deferred.

The service requires clinic root, clinic settings, and provider shells before provisioning can proceed. Retry behavior is anchored on `(clinic_id, deployment_sterilizer_key)`, while legacy global sterilizers with `clinic_id = null` stay outside matching and are never mutated. Workstations, hardware, packs, cycles, traces, users, audit logs, clinic activation, Deploy button behavior, and `DeploymentEngine.execute()` remain outside this boundary.

## RC4 Slice 3C Sterilizer Supabase Repository

The sterilizer-shell boundary now has an unused server-only Supabase adapter. It implements only deployment-key lookup, inactive planned shell insert, and clinic shell listing against `public.sterilizers`; prerequisite checks and orchestration remain owned by the service layer and future trusted composition.

The adapter enforces shell semantics before insert: clinic-scoped, deterministic deployment key, generated name, type, `setup_draft`, `planned`, and inactive. Duplicate deployment-key races are converted into safe reuse when the matching planned shell exists. Global name uniqueness collisions remain safe conflicts unless the same clinic/key can be re-read and reused. This does not wire sterilizer provisioning into setup completion or advance the deployment sequence beyond provider shells.

## RC4 Slice 3E Runtime Sterilizer Shell Boundary

Setup completion now includes sterilizer-shell provisioning after deployment-run evidence, draft clinic root linkage, clinic settings, and provider shells are durable. The runtime write surface expands only to inactive planned rows in `public.sterilizers`; no operational sterilizer activation or workstation assignment is performed.

The Complete step reports Sterilizer Shells status and requested, created, reused, and conflict counts. Retry/reuse is keyed by `(clinic_id, deployment_sterilizer_key)`, so repeated setup confirmation can verify existing shells without duplicating rows. Generated names keep a clinic-specific suffix to avoid the legacy global sterilizer name uniqueness constraint.

Platform access stays disabled. Workstation persistence, hardware persistence, pack/cycle/trace records, users, audit logs, clinic activation, public routes, full deployment repository wiring, and `DeploymentEngine.execute()` remain outside this boundary.

## RC4 Slice 4A Workstation Provisioning Foundation

The workstation provisioning foundation is now defined as an inert deployment module boundary. It adds type contracts, a pure payload builder, repository interfaces, a server-only service, and an in-memory harness, but it is not imported by setup completion and does not call Supabase.

The planned persistence order is now documented as `deployment_run -> clinic_root -> clinic_settings -> provider_shells -> sterilizer_shells -> workstation_shells`. Workstation shell provisioning requires clinic root, clinic settings, provider shells, and sterilizer shells before any future trusted server composition may create planned workstation rows.

The model treats setup draft workstation rows as planned deployment shells, not active clinical workstations or enrolled agents. Payloads use deterministic deployment keys such as `workstation-001`, `workstation-002`, and `workstation-003`, preserve reviewed workstation name/type/location/capability data, set `display_order` from reviewed order, set `agent_url = null`, and write future rows as `provisioning_source = setup_draft`, `provisioning_status = planned`, `status = planned`, and `active = false`.

Retry behavior is anchored on `(clinic_id, deployment_workstation_key)`, while legacy global workstations with `clinic_id = null` stay outside matching and are never attached, renamed, activated, or mutated. Supabase repositories, setup action wiring, UI changes, SQL migrations, smoke runners, hardware devices, packs, cycles, traces, users, audit logs, clinic activation, and `DeploymentEngine.execute()` remain outside this foundation.

## RC5 Slice 1A Hardware Planned Shell Foundation

The hardware planned-shell foundation is now defined as an inert deployment module boundary. It adds type contracts, a pure payload builder, repository interfaces, a server-only service, and an in-memory harness, but it is not imported by setup completion and does not call Supabase.

The planned persistence order is now documented as `deployment_run -> clinic_root -> clinic_settings -> provider_shells -> sterilizer_shells -> workstation_shells -> hardware_shells`. Hardware shell provisioning requires clinic root, clinic settings, provider shells, sterilizer shells, and workstation shells before any future trusted server composition may create planned hardware rows.

The model treats setup draft hardware quantities as planned deployment shells, not registered physical devices. Payloads use deterministic deployment keys such as `hardware-001`, `hardware-002`, and `hardware-003`, generate one planned shell per counted printer or scanner, set `quantity = 1`, carry logical capability labels, and keep `provisioning_source = setup_draft`, `provisioning_status = planned`, `status = planned`, and `active = false`.

Logical assignment fields carry deterministic workstation or sterilizer deployment keys only. They do not resolve durable ids, bind printers or scanners, enroll agents, register hardware devices, activate devices, or mutate workstation or sterilizer records. Schema details remain assumptions until a later hardware schema preflight confirms the existing persistence surface.

Retry behavior is anchored on `(clinic_id, deployment_hardware_key)`, while legacy global hardware with `clinic_id = null` stays outside matching and is never attached, assigned, activated, renamed, or mutated. Supabase repositories, setup action wiring, UI changes, SQL migrations, smoke runners, packs, cycles, traces, users, audit logs, clinic activation, and `DeploymentEngine.execute()` remain outside this foundation.

## RC5 Slice 1B Hardware Schema Bridge

The first hardware Supabase adapter targets the existing `public.clinical_hardware_devices` table, which currently represents hardware digital twins observed by clinic agents. That table does not yet have first-class deployment planned-shell columns for `deployment_hardware_key`, quantity, display order, provisioning status, active state, or logical assignment keys.

Until a later schema-hardening slice creates physical deployment metadata and a partial unique constraint, the adapter stores deployment shell metadata in the existing `metadata jsonb` column and writes only existing physical fields. It keeps device rows non-active by using the existing `status = discovered` and `health = unknown`, leaves agent and workstation id fields null, and preserves assignment keys only as logical metadata. This bridge is repository-only and remains unused by setup runtime.

The missing durable guardrail is still `(clinic_id, deployment_hardware_key)`. Runtime wiring must not proceed until schema preflight and migration work confirms a first-class idempotency constraint or an approved equivalent.

## RC5 Slice 1C Hardware Deployment Metadata

The hardware schema migration draft adds first-class deployment metadata to `public.clinical_hardware_devices` for future planned-shell persistence: `deployment_hardware_key`, `provisioning_source`, `provisioning_status`, `active`, and `display_order`. The fields are nullable so existing discovered hardware and legacy rows remain untouched.

The durable idempotency rule is a partial unique index on `(clinic_id, deployment_hardware_key)` where the deployment key is present. The hardware Supabase adapter now uses that first-class key instead of `metadata.deployment_hardware_key`; metadata remains a temporary home only for logical fields that still have no physical columns, such as quantity and assignment keys.

This remains schema and repository preparation only. Runtime setup actions, UI evidence, device binding, assignment resolution, activation, smoke runners, and `DeploymentEngine.execute()` remain unchanged.

## RC5 Slice 1E Runtime Hardware Shell Boundary

Setup completion now includes hardware planned-shell provisioning after deployment-run evidence, draft clinic root linkage, clinic settings, provider shells, sterilizer shells, and workstation shells are durable. The runtime write surface expands only to inactive setup-draft planned rows in `public.clinical_hardware_devices`; no physical device registration, agent enrollment, workstation binding, sterilizer binding, printer/scanner/camera/sound pairing, or hardware activation is performed.

The Complete step reports Hardware Shells status and requested, created, reused, and conflict counts alongside the prior provider, sterilizer, and workstation evidence cards. Retry/reuse is keyed by `(clinic_id, deployment_hardware_key)`, so repeated setup confirmation can verify existing planned shells without duplicating rows.

Platform access stays disabled. Hardware shells remain deployment-planned evidence only; assignment resolution, physical binding, packs, cycles, traces, users, audit logs, clinic activation, public routes, full DeploymentRepository wiring, and `DeploymentEngine.execute()` remain outside this boundary.

## RC6 Slice 1A Hardware Assignment Foundation

The hardware assignment foundation introduces a deployment-domain relationship layer after hardware shells. The model records planned clinic-scoped relationships from a deployment hardware key to a logical target deployment key, not to durable workstation, sterilizer, hardware, or agent ids.

The future relationship order is `deployment_run -> clinic_root -> clinic_settings -> provider_shells -> sterilizer_shells -> workstation_shells -> hardware_shells -> hardware_assignments`. Assignment records remain inactive setup-draft planned relationships with `assignment_status = planned`, `assignment_source = setup_draft`, and `active = false`.

Supported target kinds are `workstation`, `sterilizer`, and `unassigned`. The deterministic assignment key format is `hardware-assignment-${deployment_hardware_key}`. Idempotency is scoped by `(clinic_id, deployment_hardware_key)`, so a hardware shell can have at most one planned assignment in a clinic while the same hardware key may appear in another clinic.

This slice does not create a Supabase repository, migration, runtime composition, UI wiring, assignment id resolution, hardware binding update, activation path, clinic agent registration, smoke runner, or `DeploymentEngine.execute()` change.

## RC6 Slice 1B Hardware Assignment Persistence Decision

The durable planned-assignment model should use a dedicated `public.deployment_hardware_assignments` table. The existing `public.clinical_hardware_devices` binding columns are operational: `default_workstation_id` is the stable home workstation, `current_workstation_id` is the current operational assignment, and `agent_id` links observed devices to clinic agents. Using those fields for setup-draft planned relationships would resolve ids too early and would mutate operational hardware state.

The Supabase repository boundary for hardware assignments is server-only and repository-only. It maps the logical assignment key to a physical `assignment_key` column, preserves logical deployment keys in `target_deployment_key`, treats explicit `unassigned` as a valid planned relationship, and requires compatibility across clinic id, deployment hardware key, assignment key, target type, target deployment key, assignment source, assignment status, and inactive state before reuse.

A future migration must create the dedicated table and partial uniqueness rule before runtime wiring. Until then, setup actions, UI, runtime composition, binding columns, activation, and `DeploymentEngine.execute()` remain unchanged.

## RC6 Slice 1C Hardware Assignment Schema Boundary

The planned hardware assignment persistence model now has a dedicated schema artifact: `public.deployment_hardware_assignments`. The table keeps setup-draft assignment evidence separate from operational hardware binding columns on `public.clinical_hardware_devices`, so `default_workstation_id`, `current_workstation_id`, and `agent_id` remain untouched until a later explicit binding workflow.

The schema preserves deterministic relationship identity with unique `(clinic_id, deployment_hardware_key)` and `(clinic_id, assignment_key)` indexes. Target relationships remain logical deployment-key references only; workstation, sterilizer, hardware, and agent database ids are not resolved by this slice.

Runtime composition, setup actions, UI, activation, smoke runners, and `DeploymentEngine.execute()` remain unchanged. Hardware assignment rows will not be created until a later approved runtime wiring slice.

## RC6 Slice 1D Hardware Assignment Runtime Boundary

Hardware assignment provisioning is now part of the trusted setup-completion runtime chain after hardware shells. The stage persists inactive setup-draft planned relationships in `public.deployment_hardware_assignments` and reports requested, created, reused, skipped, and conflict evidence back to the Complete page.

The stage remains relationship-only. It does not resolve or write workstation ids, sterilizer ids, hardware ids, or agent ids, and it does not mutate operational hardware binding columns. Conflicting assignment rows stop the assignment stage safely while upstream deployment evidence and shell rows remain durable.

## RC6 Slice 2A Assignment Target Validation Foundation

Assignment target validation is introduced as a read-only deployment-domain foundation before planned hardware assignment persistence. The future order is `deployment_run -> clinic_root -> clinic_settings -> provider_shells -> sterilizer_shells -> workstation_shells -> hardware_shells -> assignment_target_validation -> hardware_assignments`.

The validator confirms that planned assignment targets are logical, scoped, and compatible before a later runtime slice resolves or binds anything. Workstation targets must point to same-clinic inactive setup-draft planned workstation shells. Sterilizer targets must point to same-clinic inactive setup-draft planned sterilizer shells. Unassigned hardware is a valid explicit state and must not carry a target key.

This foundation deliberately avoids Supabase repositories, SQL migrations, runtime setup wiring, UI changes, ID resolution, hardware binding columns, activation, agent registration, device enrollment, smoke runners, and `DeploymentEngine.execute()` changes. It reports structured validation issues and zero downstream counters only.
## RC6 Slice 2C Runtime Assignment Target Validation Gate

Setup completion now includes a read-only assignment target validation gate between hardware shell persistence and hardware assignment persistence. The trusted server action composes `deployment-assignment-target-validation-server.ts` with the Supabase validation repository and validates the deterministic assignment payloads for the reviewed draft before any assignment rows are created.

The gate is evidence-only and mutation-free: workstation and sterilizer targets are checked by logical deployment key, clinic scope, inactive state, `setup_draft` source, and `planned` status. It does not resolve workstation ids, sterilizer ids, hardware ids, or agent ids and does not write operational hardware binding columns. Validation failures are returned as structured evidence on the Setup Complete page and prevent `public.deployment_hardware_assignments` writes for that attempt while preserving upstream durable records.
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
## RC7 Slice 1C Runtime Planned Assignment Resolution Boundary

Setup completion now includes a read-only planned assignment resolution stage after `public.deployment_hardware_assignments` persistence. The stage converts logical deployment assignment references into durable row identities in memory and returns evidence to the Complete page.

The boundary remains mutation-free: resolved hardware, workstation, and sterilizer ids are not written back to assignment rows or operational hardware binding columns. Incomplete resolution preserves all upstream durable evidence and reports structured issues so retry can succeed after the durable reference problem is corrected. Activation, hardware binding, agent registration, packs, cycles, traces, users, audit-log rows, dashboard unlock, redirect behavior, and `DeploymentEngine.execute()` remain outside this slice.
