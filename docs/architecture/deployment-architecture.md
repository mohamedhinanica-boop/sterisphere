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
## RC7 Slice 1E Activation Readiness Boundary

Deployment activation readiness is introduced as the final planned read-only safety boundary before a future activation phase. It evaluates whether the deployment run, clinic root, clinic settings, provider shells, sterilizer shells, workstation shells, hardware shells, hardware assignments, assignment target validation evidence, and planned assignment resolution evidence are mutually compatible.

Readiness distinguishes blockers from warnings. Blockers prevent readiness, warnings remain visible without changing a ready result, and unexpected repository failures return an error result. The layer never activates records, persists readiness evidence, writes resolved ids, mutates hardware binding columns, registers agents, or changes deployment execution behavior.

## RC7 Slice 1F Activation Readiness Supabase Snapshot Boundary

The activation-readiness boundary now has a read-only server-only Supabase adapter. `SupabaseDeploymentActivationReadinessRepository` builds a deterministic snapshot from durable deployment source tables only: deployment run, clinic root, clinic settings, provider shells, sterilizer shells, workstation shells, hardware shells, and hardware assignments.

Runtime validation and planned-resolution evidence remains outside the durable snapshot because those results are not persisted today. The repository leaves both evidence fields null rather than deriving success from source rows; a future runtime composition must supply current validation and resolution evidence alongside the durable snapshot before readiness can pass.

This slice adds no activation path, no setup action wiring, no UI changes, no SQL migration, no resolved-id writes, no operational hardware binding, no agent registration, and no `DeploymentEngine.execute()` change. The live preflight SQL reports whether existing durable rows are compatible with the readiness service and whether schema/index assumptions are satisfied.

## RC7 Slice 1G Runtime Activation Readiness Boundary

Setup completion now runs deployment activation readiness immediately after planned assignment resolution succeeds. The stage is read-only and composes `SupabaseDeploymentActivationReadinessRepository` with fresh assignment target validation and planned assignment resolution evidence from the same server action.

The readiness result is returned to the Complete page as evidence: status, checks requested, checks passed, checks failed, blockers, warnings, issues, and zero downstream counters. A ready result does not unlock the platform or activate anything; blocked and error results preserve all upstream durable records and report retry-safe issue details.

Activation readiness remains separate from activation. It does not persist readiness evidence, update deployment runs, change deployment status, resolve or write operational ids, mutate hardware assignments, bind hardware, register agents, create operational records, or change `DeploymentEngine.execute()`.

## RC8 Slice 1A Controlled Activation Plan Boundary

Controlled activation planning is the first RC8 activation-domain layer, but it is still read-only. `DeploymentActivationPlanService` consumes a current durable deployment snapshot, a ready activation-readiness result, and fresh planned assignment resolution evidence to produce an ordered plan contract for later execution slices.

The initial order is clinic activation, provider shell activation, sterilizer shell activation, workstation shell activation, hardware shell activation, proposed hardware binding items, hardware assignment finalization, and deployment-run finalization. Clinic settings are not given a physical activation write in this foundation because no supported activation column is assumed. Execution slices must not invent actions outside the approved plan.

Rollback is modeled, not implemented. Shell activation and proposed bindings are marked reversible before operational use; hardware assignment finalization and deployment-run finalization are marked irreversible until a later rollback design proves otherwise. Warnings document explicit unassigned hardware and future-only binding/finalization limitations without blocking otherwise safe plans.
## RC8 Slice 1B Activation Plan Supabase Snapshot Boundary

The controlled activation plan boundary now has a read-only server-only Supabase adapter for durable source rows. `SupabaseDeploymentActivationPlanRepository` builds the activation-planning snapshot from `public.deployment_runs`, `public.clinics`, `public.clinic_settings`, `public.providers`, `public.sterilizers`, `public.clinical_workstations`, `public.clinical_hardware_devices`, and `public.deployment_hardware_assignments`.

The adapter does not make readiness or resolution claims. Activation readiness and planned assignment resolution remain fresh runtime evidence outside durable storage, so the activation planner must receive those results explicitly before it can produce a ready plan. The repository returns those evidence fields as absent and preserves raw current state for drift checks.

Activation-plan persistence remains future work. This slice adds no activation-plan table, writes no activation-plan rows, executes no plan items, changes no deployment status, activates no records, binds no hardware, registers no agents, and does not change setup runtime wiring or `DeploymentEngine.execute()`.## RC8 Slice 1C Runtime Controlled Activation Planning Boundary

The setup runtime now composes controlled activation planning after activation readiness returns `ready`. The stage uses the durable activation-plan Supabase snapshot, fresh activation-readiness evidence, and fresh planned-assignment resolution evidence to generate deterministic plan evidence for the Complete page and support mail.

Readiness `blocked` or `error` skips planning. Planning `blocked` or `error` returns structured evidence while preserving deployment run, clinic, settings, planned shells, validation, assignments, resolution, and readiness evidence. No activation plan rows are persisted and no plan item is executed.

This runtime slice remains read-only. It does not modify provisioning status, activate clinic-owned records, bind hardware, write agent/default/current workstation ids, finalize deployment runs, register agents, implement rollback, create workers, stream progress, or change `DeploymentEngine.execute()`.## RC8 Slice 1D Controlled Activation Execution Foundation

The activation domain now includes a foundation for `controlled_activation_execution`, positioned after `controlled_activation_plan`. It is an orchestration model, not an executor. It accepts only actions already present in the approved activation plan (`activate`, `link`, `bind`, `finalize`, and `no_op`) and refuses to invent new operational behavior.

Execution preparation enforces deterministic dependency ordering, dependency existence, cycle prevention, finalization last, hardware binding prerequisites, assignment finalization prerequisites, deployment ownership, execution identity, and final pre-execution state drift checks. Sessions and items remain pre-execution only (`ready` or `pending`); no item is marked executed, succeeded, or rolled back by this foundation.

Irreversible boundaries are explicit. Future mutation slices must honor the prepared rollback boundary and re-check durable state immediately before writing. This slice adds no Supabase execution repository, no migrations, no runtime setup wiring, no UI, no activation, no binding, no deployment finalization, no background work, and no `DeploymentEngine.execute()` change.
## RC8 Slice 1E Activation Execution Supabase Snapshot Boundary

`SupabaseDeploymentActivationExecutionRepository` is the read-only server-side adapter for future controlled activation execution preparation. It reads `deployment_runs`, clinic root deployment status, clinic settings identity, planned provider/sterilizer/workstation/hardware shells, hardware operational binding fields, and planned hardware assignments, then returns the compact current-state snapshots required by `DeploymentActivationExecutionService`.

No execution persistence table is introduced in this slice. The execution identity remains deterministic and computed as `activation-execution-${deploymentRunId}` by the execution service, while the Supabase adapter returns no existing execution row. Conflict detection for durable execution sessions is therefore limited until a later slice creates execution-session persistence.

The adapter preserves nullable and operational values for drift detection and does not normalize unsafe state into compatibility. It performs no inserts, updates, deletes, activation, hardware binding, agent registration, deployment finalization, rollback work, runtime wiring, UI changes, or `DeploymentEngine.execute()` changes. The manual preflight script `docs/architecture/deployment-activation-execution-preflight.sql` verifies schema columns, duplicate deployment keys, null-clinic keyed rows, active planned rows, binding distributions, assignment shape, and the current absence or presence of execution persistence tables.

## RC8 Slice 1F Runtime Activation Execution Preparation Boundary

Setup completion now runs controlled activation execution preparation after a ready controlled activation plan. The stage composes `DeploymentActivationExecutionService` with the read-only `SupabaseDeploymentActivationExecutionRepository`, passes the fresh approved plan items unchanged, and returns in-memory execution preparation evidence.

The preparation stage performs final plan integrity, dependency, ownership, current-state drift, execution-identity, and rollback-boundary checks. It may return ready, blocked, skipped, or safe error evidence. It does not persist execution sessions or execution items, execute plan items, activate records, bind hardware, register agents, finalize deployment runs, perform rollback, or change `DeploymentEngine.execute()`.

This is the final in-memory pre-execution safety boundary. A later phase must introduce durable execution control, operator authorization, execution-item persistence, and rollback semantics before any operational mutation is allowed.

## RC8 Slice 1G Activation Current-State Contract

`DeploymentActivationPlanService` and `SupabaseDeploymentActivationExecutionRepository` now use the same typed activation current-state builders before drift validation. Planned current state and live current state are compared as canonical safety records rather than ad hoc JSON summaries.

Safety-relevant fields include durable ids, clinic ids, deployment keys, provisioning source/status, active state, hardware operational status, hardware binding columns, hardware-assignment target/source/status, and deployment-run lifecycle/deployment status. Names, labels, timestamps, descriptions, and display order are outside the drift contract unless a later activation slice proves they are safety-critical.

Execution preparation remains conservative: active changes, provisioning source/status changes, clinic/key/id changes, new hardware bindings, assignment target changes, missing rows, and deployment-run state changes still block. Representation-only differences such as property order or snake_case-to-camelCase mapping do not.

## RC8 Slice 2A Durable Activation Execution Persistence Foundation

The activation execution persistence foundation is the database-domain contract that must exist before controlled activation can mutate operational records. It consumes only successful `controlled_activation_execution_preparation` evidence and produces prepared-session/item persistence evidence through an abstract repository interface.

Session idempotency is scoped by clinic id, deployment run id, and deterministic execution key. A single deployment run may not own multiple incompatible active execution sessions. Immutable session evidence includes clinic/deployment ownership, execution key, plan key, payload hash, prepared status, item counters, rollback boundary, and preparation evidence. Immutable item evidence includes execution item key, plan item key, sequence, entity/action identity, expected current state, target state, dependency keys, reversibility, and rollback action.

The service is prepared-only. It rejects blocked/error preparation, missing identities, duplicate item identities, item count mismatches, running/succeeded/failed items, nonzero attempts, execution timestamps, and invalid rollback-boundary evidence before repository writes. Existing incompatible sessions/items are reported as conflicts and are never repaired or overwritten.

## RC8 Slice 2B Activation Execution Persistence Schema Boundary

Prepared activation execution evidence now has a proposed durable database boundary and server-only Supabase adapter. The domain identity remains the logical `deploymentRunId` string produced by execution preparation; the database stores it as `deployment_run_key` and separately records `deployment_run_record_id` as the UUID foreign key to `public.deployment_runs(id)`.

The session table is the future execution ownership boundary, but Slice 2B only allows prepared evidence insertion. Owner, ownership token, lease, start, completion, and failure fields remain null for prepared sessions. The item table stores approved pre-execution instructions and allows future lifecycle statuses in constraints, but the repository creates only `ready` and `pending` rows with zero attempts and no execution timestamps.

The Supabase adapter is server-only and mutation-limited to insert-only prepared persistence. It does not claim sessions, start items, complete items, fail items, roll back, activate entities, bind hardware, write agent/workstation ids, update provisioning status, or finalize deployment runs. A later runtime slice may wire the persistence service after successful execution preparation, still without executing activation.

## RC8 Slice 2C Prepared Execution Persistence Boundary

Runtime setup now composes the activation execution persistence service after ready execution preparation. The server action resolves the durable `deployment_runs` row for the current clinic and logical deployment run before persisting, then creates or reuses one prepared execution session plus deterministic prepared execution items.

This is a durable evidence boundary, not an execution boundary. The session is not claimed, no ownership token or lease is created, item attempts stay zero, item statuses stay `ready` or `pending`, and no clinic, shell, hardware, assignment, binding, rollback, audit, or deployment-run finalization state is mutated. Partial prepared evidence remains durable for safe retry; future claiming must enforce completeness before ownership.

## RC8 Slice 3A Execution Ownership and Lease Foundation

The deployment domain now has a read-only activation execution claim assessment model. It introduces a repository snapshot contract for prepared execution sessions and aggregate item completeness evidence, plus a service that deterministically decides whether a future executor may propose ownership.

The service does not write ownership. It validates claimant identity, claim timestamp, a bounded lease duration of 30 seconds through 15 minutes, session identity, `preparation_status = ready`, `execution_status = prepared`, null lifecycle timestamps, complete prepared items, one ready root item, pending dependents, zero attempts, and no execution, rollback, or error evidence. Active same-owner leases return `already_owned`; active other-owner leases return conflict; expired leases return `lease_expired_reclaimable` only when all execution evidence remains untouched.

Ownership tokens are produced through an injected token factory. Result objects may carry the proposed token for the future repository handoff, but messages and issues intentionally avoid token values. No Supabase adapter, SQL, setup runtime wiring, UI, execution start, activation, binding, rollback, or deployment finalization is introduced.

## RC8 Slice 3B Supabase Claim Repository and Atomic RPC

The claim architecture now separates policy assessment from database mutation. `DeploymentActivationExecutionClaimService` decides whether ownership is safe from a read-only snapshot. `SupabaseDeploymentActivationExecutionClaimRepository` can load that snapshot and call `public.claim_deployment_activation_execution_session` for an explicit `fresh`, `same_owner`, or `expired_reclaim` mode.

The RPC locks the target session row with `FOR UPDATE`, rechecks session identity, ready/prepared evidence, zero blockers, lease duration, item completeness, ready/pending-only item lifecycle, zero attempts, null execution/rollback timestamps, null errors, and duplicate-free item identities before updating ownership. The only successful fresh/reclaim mutation is owner/token/lease plus `execution_status = claimed`; it does not set `started_at`, update items, increment attempts, activate records, bind hardware, finalize assignments, finalize deployment runs, or run rollback.

RLS remains enabled and no anon or broad authenticated policies are added. The function has a fixed search path and execution is intended for trusted service-role server code only. The RPC result may return the ownership token to server-side code for future executor flow, but messages and issue evidence remain token-sanitized.

## RC8 Slice 3C Runtime Atomic Claim Wiring

Setup completion now wires the activation execution ownership boundary after prepared execution persistence. `claimActivationExecutionForServerDeployment` is server-only and uses the Supabase claim repository plus `DeploymentActivationExecutionClaimService` to assess the current durable snapshot before performing a single atomic RPC claim.

The claimant identity for this setup runtime is the deterministic server-side id `sterisphere-setup-runtime-deployment-executor`. Because Verify / Reuse uses the same id, an active same-owner lease returns `already_owned` and the existing token and lease are preserved. The runtime lease duration is fixed at 300 seconds; this slice does not renew leases or add heartbeat behavior.

The action result and Complete page expose only token-safe evidence: status, session/execution/plan keys, claimant id, persisted owner id, lease expiration, mode/result, claim/reuse/reclaim/conflict counts, issues, warnings, and zero downstream execution counters. The runtime never exposes ownership tokens and never starts sessions, updates items, increments attempts, activates records, writes bindings, or changes `DeploymentEngine.execute()`.

Execution persistence remains immutable evidence reuse only. A session already in `claimed` may be reused by persistence only if it is claim-owned but not started, completed, or failed, and its item rows remain untouched. Same-owner reuse is still decided by the claim stage; persistence never changes owner, token, lease, status, or item rows.

## RC8 Slice 4A Execution Start Foundation

The activation execution domain now includes a TypeScript-only start assessment boundary after atomic ownership claim. `DeploymentActivationExecutionStartService` consumes a read-only snapshot for a claimed session, its ownership evidence, lease expiration, lifecycle timestamps, session counters, and aggregate item integrity before producing start-readiness evidence.

This stage is proposal-only. A `startable` result proposes `proposedExecutionStatus = running` and `proposedStartedAt`, but does not persist either value. `claimed` means exclusive ownership only; it is not a running session. A future atomic session-start repository must perform the durable transition from `claimed` to `running`. A running session still does not imply the first execution item has started.

The start foundation requires matching clinic, deployment-run, session, execution key, claimant, and ownership token, plus an active lease. It blocks missing or mismatched ownership, expired or malformed leases, terminal lifecycle timestamps, item count drift, invalid item lifecycle, attempts, item execution timestamps, rollback timestamps, error evidence, duplicate item identities, and malformed dependency evidence. Same-owner running sessions with matching token and active lease return `already_started` evidence only. The repository contract is read-only and exposes no insert, update, start, heartbeat, renewal, rollback, or item mutation methods.

## RC8 Slice 4B - Supabase Execution-Start Boundary

The execution-start boundary is a server-only Supabase persistence contract for transitioning a claimed prepared activation execution session into `running`. It follows the existing activation preparation and claim boundaries: repository reads gather the start snapshot and item integrity evidence, while `public.start_deployment_activation_execution_session` performs the only mutation in this slice.

The atomic start function updates only `public.deployment_activation_execution_sessions.execution_status` and `started_at` after verifying clinic/run/session identity, same owner/token ownership, active lease, ready preparation state, claimed lifecycle, session counters, item readiness, duplicate item identity, dependency shape, and the single ready root item. It does not start items, increment attempts, activate entities, bind hardware, finalize deployment runs, renew leases, rotate ownership tokens, heartbeat, or perform rollback.

Access remains service-role only. The runtime is not wired in this slice; the next runtime slice may compose the repository after claim evidence without changing `DeploymentEngine.execute()`.

## RC8 Slice 4C - Runtime Atomic Execution Start

The setup runtime now composes execution-start assessment immediately after a successful activation execution ownership claim. Successful claim states (`claimed`, `already_owned`, and `reclaimed`) load a fresh start snapshot, run `DeploymentActivationExecutionStartService`, and route `startable` evidence to `public.start_deployment_activation_execution_session`.

The runtime start boundary may transition only the durable execution session from `claimed` to `running` and set `started_at`. `already_started` reuses a same-owner running session without updating `started_at`, extending the lease, rotating tokens, or starting items. Blocked, conflicted, or errored claim evidence skips start as `not_attempted`.

Ownership tokens remain server-only. The claim server retains the token in process memory for the immediately following start call and action/UI/support evidence exposes only claimant, session, execution key, lease expiration, start result, counts, issues, and messages. Claimed is not running; a running session is not an execution item start.

## RC8 Slice 5A - Execution Item Start Foundation

The activation execution domain now includes a TypeScript-only item-start assessment boundary after a running execution session exists. `DeploymentActivationExecutionItemStartService` consumes a read-only snapshot containing session ownership/lifecycle evidence, one deterministic candidate item, and aggregate item integrity counters before returning token-safe item-start readiness evidence.

This boundary keeps session start and item start separate. `startable` means exactly one deterministic ready item may be proposed for a future atomic item-start mutation; it does not set item `started_at`, increment attempts, execute activation actions, unlock dependents, activate records, bind hardware, finalize deployment, or run rollback. `already_started` is allowed only for one running item that belongs to the same session and still has valid same-owner, same-token, active-lease session evidence.

Dependency validation allows the first item to have no dependencies and models future item progression by requiring candidate dependencies to be satisfied by prior succeeded plan-item keys. The repository contract is read-only and exposes only snapshot loading; no Supabase adapter, SQL, runtime wiring, UI, support mail, workers, queues, polling, streaming, or `DeploymentEngine.execute()` change is introduced.

## RC8 Slice 5B - Atomic Execution Item Start Boundary

The execution item-start boundary now has a server-only Supabase repository and checked-in SQL source for `public.start_deployment_activation_execution_item`. The repository loads the Slice 5A read-only snapshot from durable execution sessions/items, derives deterministic aggregate item evidence, selects the next ready or single running candidate item, and maps token-safe RPC results.

The atomic SQL function locks the running execution session and selected execution item with `FOR UPDATE`, rechecks same-owner token and lease compare-and-set evidence, validates item identity and deterministic next-item integrity, then mutates only the selected item from `ready` to `running` by incrementing `attempt_count` from 0 to 1 and setting `started_at`. It does not mutate the session, renew leases, rotate tokens, execute activation actions, unlock dependent items, activate records, bind hardware, finalize deployment, or run rollback.

Idempotent reuse returns `already_started` only for the same selected running item with attempt count 1, start evidence, matching ownership, active lease, and no completion, rollback, error, or second-running-item evidence. Function execution remains service-role only with a fixed search path and no anon or broad authenticated policies.

## RC8 Slice 5C - Runtime Atomic Execution Item Start

Setup completion now composes `DeploymentActivationExecutionItemStartService` with `SupabaseDeploymentActivationExecutionItemStartRepository` immediately after successful atomic execution-session start. The stage runs only when session start returns `started` or `already_started`; skipped, blocked, conflicted, not-found, or errored session-start evidence leaves item start as `not_attempted`.

The ownership token handoff remains server-only and follows the claim-to-session-start pattern. The token is read from the in-process claim evidence for assessment and RPC compare-and-set, but action results, UI evidence, support mail, messages, and issues expose only token-safe claimant/session/item evidence.

A successful fresh pass atomically marks exactly one deterministic execution item `running`, increments its attempt count to 1, and records the item `started_at`. Verify / Reuse with that same running item returns `already_started` without RPC mutation. This boundary does not execute activation actions, unlock dependencies, activate records, bind hardware, renew leases, rotate tokens, finalize deployment, run rollback, start workers, or change `DeploymentEngine.execute()`.

## RC8 Slice 6A - Clinic Activation Action Foundation

The activation execution domain now includes a TypeScript-only clinic activation assessment boundary for the currently running clinic execution item. DeploymentClinicActivationService consumes a read-only snapshot of same-owner running session evidence, the running clinic activation item, and durable clinic state before returning token-safe activation_ready, already_activated, blocked, conflict, not-found, or error evidence.

Clinic activation eligibility requires matching clinic/run/session/item identities, a running session with same owner, same token, active lease, start evidence, and no terminal timestamps. The candidate item must be sequence 1, entity type clinic, action activate, running with attempt count 1, started, dependency-free, and free of completion, rollback, or error evidence. Durable clinic state must be setup-draft planned, inactive, owned by the deployment run, not archived/deleted, and canonically equal to the item's expected current state.

This foundation supports exactly the existing activation target patch { deploymentStatus: deployed }. It proposes the canonical target state by applying that patch to the canonical current clinic state. already_activated is evidence-only reuse when the durable clinic state already equals the exact proposed target and the session/item lifecycle remains compatible. The service never mutates the clinic, completes an item, unlocks dependencies, activates shells, writes bindings, finalizes deployment, persists Supabase data, exposes ownership tokens, or changes runtime wiring.

## RC8 Slice 6B - Supabase Clinic Activation Boundary

Clinic activation now has a server-only Supabase repository and checked-in atomic SQL source for `public.activate_deployment_clinic`. The repository implements the Slice 6A read-only snapshot contract and exposes one explicit RPC method for atomic clinic activation; it does not expose generic insert, update, upsert, delete, patch, save, item-completion, dependency-unlock, shell-activation, hardware-binding, or finalization methods.

The durable target mapping for the supported activation patch `{ deploymentStatus: deployed }` is `public.clinics.deployment_status = 'deployed'`. The existing `public.clinics.deployed_at` column is written only on the first successful activation as the activation timestamp. Existing activation reuse returns `already_activated` without rewriting `deployed_at`.

The SQL function locks the execution session, execution item, and clinic row in that order. It rechecks same owner, same token, expected lease, running session lifecycle, running sequence-1 clinic item lifecycle, expected item start/attempt evidence, exact item expected/target state evidence, deployment-run clinic link, and current clinic state before mutating the clinic. It leaves the execution session and item rows running and does not activate providers, sterilizers, workstations, hardware, bindings, dependencies, rollback, or deployment finalization.

## RC8 Slice 6C - Runtime Atomic Clinic Activation

Setup completion now composes `DeploymentClinicActivationService` with `SupabaseDeploymentClinicActivationRepository` immediately after successful activation execution item start. The stage runs only when item start returns `started` or `already_started`; skipped, blocked, conflicted, not-found, or errored item-start evidence leaves clinic activation as `not_attempted` and does not load a snapshot or call the RPC.

The ownership token handoff remains server-only and follows the claim, session-start, and item-start pattern. Runtime evidence exposes claimant, clinic/run/session/item identities, current and target clinic state, deployed timestamp, result counts, issues, and downstream zero counters, but never exposes the ownership token.

This is the first runtime activation write, and it is deliberately narrow. A successful fresh pass may update only `public.clinics.deployment_status` to `deployed` and set `public.clinics.deployed_at` through `public.activate_deployment_clinic`. `already_activated` reuses the existing deployed clinic state without rewriting it. The execution item remains running; the runtime does not mark it succeeded, unlock dependencies, activate shells or hardware, write bindings, finalize deployment, renew leases, rotate tokens, run rollback, add workers, or change `DeploymentEngine.execute()`.

## RC8 Slice 7A - Activation Execution Item Completion Foundation

Slice 7A adds a TypeScript-only assessment boundary for the next execution-control step after successful clinic activation. The foundation is scoped to the sequence-1 clinic activation item and determines whether the running item can safely be marked succeeded after the durable clinic action has completed.

The snapshot contract includes running execution-session ownership and lease evidence, the candidate clinic activation item, durable clinic action evidence, and aggregate execution-item integrity counters. Completion is proposed only when the same owned running session has an active lease, the sequence-1 clinic activate item is running with exactly one attempt, the durable clinic row is `deployment_status = deployed` with `deployed_at`, the durable clinic state exactly matches the item target state, and all remaining execution items are still pending and untouched.

`already_completed` is deterministic reuse evidence for the same succeeded item when ownership, lease, item lifecycle, durable clinic state, and aggregate integrity remain compatible. The service is read-only: it does not write `completed_at`, unlock dependencies, activate provider/sterilizer/workstation/hardware shells, bind hardware, finalize deployment, renew leases, rotate tokens, rollback, add workers, or change `DeploymentEngine.execute()`.

## RC8 Slice 7B - Activation Execution Item Completion Persistence

The activation execution domain now includes a server-only Supabase persistence boundary for completing the sequence-1 clinic activation item after the clinic row activation succeeds. `SupabaseDeploymentActivationExecutionItemCompletionRepository` loads the Slice 7A snapshot from durable execution sessions, execution items, and the clinic row, then exposes one explicit RPC method for `public.complete_deployment_activation_execution_item`.

The atomic RPC locks the execution session and selected item, rechecks owner, ownership token, expected lease, running session state, item identity, sequence, entity/action, started timestamp, attempt count, completion absence, rollback absence, error absence, item-count integrity, and duplicate-free item identities. The only successful mutation is `deployment_activation_execution_items.execution_status = 'succeeded'` plus `completed_at = proposed_completed_at` for that one item.

Idempotent reuse returns `already_completed` when the same item is already succeeded with compatible immutable evidence. The boundary does not unlock dependent items, start provider activation, mutate later execution items, complete the session, renew leases, rotate tokens, activate providers, sterilizers, workstations, hardware, write bindings, finalize deployment runs, rollback, or change `DeploymentEngine.execute()`.

## RC8 Slice 8A - Dependency Progression Assessment Foundation

The activation execution domain now includes a read-only dependency progression assessment boundary after successful sequence-1 item completion. `DeploymentActivationExecutionDependencyProgressionService` consumes a snapshot of the running execution session and all execution items, then returns token-safe proposal evidence for whether the next deterministic item may become ready.

Eligibility requires the session to be `preparationStatus = ready`, `executionStatus = running`, same-owner, same-token, actively leased, started, and free of terminal lifecycle evidence. Item evidence must show a contiguous succeeded prefix from sequence 1, exactly one next deterministic pending item, no ready/running ambiguity, no duplicate item identities, no later-item drift, and dependency keys that resolve by `planItemKey` to prior succeeded items only.

`already_progressed` is evidence-only reuse when that same deterministic next item is already ready and untouched. The foundation never mutates execution items, starts the next item, activates providers or other entities, writes bindings, renews leases, rotates tokens, rolls back, completes sessions, finalizes deployment runs, or changes `DeploymentEngine.execute()`.

## RC8 Slice 8B - Dependency Progression Persistence Boundary

The activation execution domain now includes a server-only Supabase repository and atomic SQL boundary for the future dependency progression mutation. `SupabaseDeploymentActivationExecutionDependencyProgressionRepository` loads the running execution session plus all durable execution items in deterministic `sequence, execution_item_key` order, preserving aggregate evidence for duplicate identities, lifecycle drift, and malformed dependency-key evidence.

The SQL source is `docs/architecture/supabase_deployment_activation_execution_dependency_progression.sql`, with read-only verification in `docs/architecture/supabase_deployment_activation_execution_dependency_progression_preflight.sql`. The RPC locks the session, completed predecessor item, and deterministic next item, then compare-and-set checks clinic/run/session/execution identity, owner, ownership token, expected lease, completed predecessor identity and timestamps, next item identity, next item dependency keys, duplicate-free item identities, and succeeded dependency evidence.

A successful fresh mutation updates only the selected next item from `execution_status = pending` to `execution_status = ready`. `already_progressed` reuses the same deterministic next item when it is already ready and untouched. The boundary does not start the next item, increment attempts, write timestamps, mutate dependency arrays, update sessions, activate providers or other entities, bind hardware, renew leases, rotate tokens, rollback, finalize deployment, wire setup runtime, change UI, or modify `DeploymentEngine.execute()`.

## RC8 Slice 8C - Runtime Atomic Dependency Progression

Setup completion now composes `DeploymentActivationExecutionDependencyProgressionService` with `SupabaseDeploymentActivationExecutionDependencyProgressionRepository` immediately after successful activation execution item completion. The stage runs only when item completion returns `completed` or `already_completed`; skipped, blocked, conflicted, not-found, or errored item-completion evidence leaves dependency progression as `not_attempted` and does not load a snapshot or call the RPC.

The runtime progression boundary may transition only one deterministic next execution item from `pending` to `ready` through `public.progress_deployment_activation_execution_dependency`. `already_progressed` reuses a compatible ready next item without RPC mutation. The sequence-2 item remains unstarted with attempt count zero and null execution timestamps, while the session remains running and ownership evidence is preserved.

Ownership tokens stay server-only and are used only for the immediate compare-and-set RPC. Runtime evidence exposes claimant, session, execution key, predecessor item, next item, before/after status, result counts, issues, and downstream zero counters, but never exposes the ownership token. This slice does not start the next item, activate providers or any other entity, bind hardware, renew leases, rotate tokens, complete the session, finalize deployment, rollback, add workers, or change `DeploymentEngine.execute()`.

## RC8 Slice 9A - Next Execution Item Start Assessment Foundation

The activation execution domain now includes a TypeScript-only next-item start assessment boundary after dependency progression has marked the deterministic sequence-2 item ready. `DeploymentActivationExecutionNextItemStartService` consumes a read-only snapshot of the running execution session and all durable execution items, then returns token-safe evidence for whether the single deterministic ready item can safely be started.

The assessment models the verified chain `sequence 1 succeeded -> sequence 2 ready -> next-item start assessment -> future atomic ready-to-running transition`. Eligibility requires same clinic/run/session/execution identity, ready preparation, running session lifecycle, same owner, same ownership token, active lease, complete item count, exactly one ready item, no running ambiguity, a contiguous succeeded prefix, dependency keys that resolve by `planItemKey` to unique prior succeeded items, clean later pending items, duplicate-free item identities, and a supported entity/action with durable entity identity.

`already_started` is read-only reuse evidence for the same deterministic candidate when exactly one item is already running with attempt count 1, valid `started_at`, no completion/rollback/error evidence, compatible ownership and lease evidence, prior items succeeded, and later items untouched. This foundation does not increment attempts, write `started_at`, mutate execution items or sessions, activate providers or other entities, progress dependencies, complete sessions, finalize deployment, create SQL, add Supabase repositories, wire setup actions, change UI, or modify `DeploymentEngine.execute()`.

## RC8 Slice 9B - Next Execution Item Start Supabase Boundary

The next-item start boundary now has a server-only Supabase repository and atomic SQL contract for a future ready-to-running transition. `SupabaseDeploymentActivationExecutionNextItemStartRepository` loads the running execution session and all durable execution items in deterministic `sequence ASC, execution_item_key ASC` order, maps the Slice 9A snapshot contract, derives aggregate item integrity evidence, and exposes one explicit RPC method: `startNextItemAtomically`.

The SQL source is `docs/architecture/supabase_deployment_activation_execution_next_item_start.sql`, with read-only verification in `docs/architecture/supabase_deployment_activation_execution_next_item_start_preflight.sql`. The RPC locks the execution session first and the selected execution item second, then rechecks clinic/run/session/execution identity, same owner, ownership token, expected lease, active lease, running session lifecycle, selected item identity, sequence/entity/action evidence, dependency keys, contiguous succeeded prefix, later-item cleanliness, and duplicate-free item identities.

A successful fresh mutation updates only `public.deployment_activation_execution_items` for the selected deterministic item: `execution_status = 'running'`, `attempt_count = attempt_count + 1`, and `started_at = p_proposed_started_at`. `already_started` reuses the same selected running item without rewriting `started_at` or incrementing attempts. The boundary does not mutate execution sessions, renew leases, rotate tokens, activate providers or entities, progress dependencies, complete items, finalize deployment, rollback, wire setup runtime, change UI, or modify `DeploymentEngine.execute()`.

### RC8 Slice 9C - Next Item Start Boundary

Next-item start is a server-only runtime composition over DeploymentActivationExecutionNextItemStartService and SupabaseDeploymentActivationExecutionNextItemStartRepository. It runs only after dependency progression returns progressed or lready_progressed, reuses compatible already-running evidence without RPC, and otherwise calls the atomic next-item start RPC exactly once for a startable ready item. Evidence remains token-safe and reports downstream activation, completion, binding, rollback, and finalization counters as zero.

## RC8 Slice 10A - Provider Shell Activation Assessment Foundation

The activation execution domain now includes a TypeScript-only provider shell activation assessment boundary for the currently running provider-shell execution item. `DeploymentProviderShellActivationService` consumes a read-only snapshot of the running execution session, ordered execution items, one provider shell candidate, and aggregate integrity evidence before returning token-safe `activatable`, `already_activated`, `blocked`, `conflict`, `not_found`, or `error` evidence.

Eligibility requires a ready, running execution session with same-owner evidence, matching ownership token, active lease, valid start evidence, and no terminal lifecycle timestamps. Item evidence must show exactly one running provider-shell activate item, a clean contiguous succeeded prefix, no duplicate item identities, no rollback/completion/error evidence on the running item, and no later execution drift. The provider shell must be same-clinic, deployment-keyed to the running item, setup-draft sourced, placeholder and inactive for fresh activation, or already active with compatible activation evidence for deterministic reuse.

This foundation is read-only. It does not activate providers, update `public.providers`, complete execution items, progress dependencies, start later items, bind hardware, persist Supabase data, create SQL, wire setup actions, change UI or support email, run rollback, add workers, renew leases, rotate tokens, expose ownership tokens, or change `DeploymentEngine.execute()`.

## RC8 Slice 10B - Provider Shell Activation Supabase Boundary

The provider-shell activation assessment boundary now has a server-only Supabase repository and atomic SQL contract for a future provider activation mutation. `SupabaseDeploymentProviderShellActivationRepository` loads the running execution session, deterministic execution items, and the selected provider shell referenced by the running provider-shell item, then exposes one explicit RPC method: `activateProviderShellAtomically`.

The supported provider target state is the existing deployment-shell lifecycle shape `{ deploymentProviderKey, provisioningSource: setup_draft, provisioningStatus: active, active: true }`. Fresh activation may update only the selected `public.providers` row from inactive setup-draft placeholder/planned state to active setup-draft active state. `already_activated` reuses the same provider row when it already equals the target state and the session/item evidence remains compatible.

The SQL source is `docs/architecture/supabase_deployment_provider_shell_activation.sql`, with read-only verification in `docs/architecture/supabase_deployment_provider_shell_activation_preflight.sql`. The RPC locks the execution session first, the running execution item second, and the selected provider row third. It does not update execution sessions, execution items, clinics, other providers, dependencies, leases, ownership tokens, completion evidence, rollback evidence, hardware bindings, or deployment finalization.

## RC8 Slice 10C - Runtime Provider Shell Activation

Setup completion now composes `DeploymentProviderShellActivationService` with `SupabaseDeploymentProviderShellActivationRepository` immediately after successful next-item start. The stage runs only when next-item start returns `started` or `already_started` for a running `provider_shell` `activate` item; other running entity/action pairs return deterministic `not_attempted` evidence.

Fresh activation calls `public.activate_deployment_provider_shell` exactly once after a fresh provider-shell activation assessment returns `activatable`. `already_activated` reuses compatible provider state without RPC mutation. Evidence remains token-safe and reports provider identity, before/after active/provisioning state, activated/reused/conflict counts, diagnostic issues, and downstream zero counters.

This runtime boundary may activate only the selected provider shell. It does not complete the provider execution item, progress another dependency, start later items, mutate sessions, renew leases, rotate ownership tokens, activate sterilizers/workstations/hardware, bind hardware, finalize deployment, rollback, add workers, or change `DeploymentEngine.execute()`.

## RC8 Slice 11A - Provider-Shell Execution-Item Completion Assessment

After provider-shell activation succeeds, the running provider-shell activation item remains an execution-control boundary. Slice 11A adds a read-only TypeScript assessment that determines whether that running provider-shell item can be completed in a future atomic running-to-succeeded mutation.

The assessment consumes one repository snapshot containing the running execution session, ordered execution items, the selected provider-shell item, the activated provider shell, and aggregate integrity counts. It validates same-clinic/run/session/execution identity, same-owner active-lease evidence, deterministic item identity, provider active setup-draft state, dependency integrity, clean prior succeeded prefix, and untouched later items.

`completable` and `already_completed` are evidence only. This boundary does not mutate execution items, progress dependencies, start another item, activate another entity, bind hardware, complete the execution session, renew leases, rotate tokens, create SQL, wire setup actions, modify UI, or change `DeploymentEngine.execute()`.

## RC8 Slice 11B - Atomic Provider-Shell Execution-Item Completion Boundary

Slice 11B adds the Supabase snapshot repository and atomic RPC boundary for provider-shell execution-item completion. The repository loads the running session, ordered execution items, selected provider-shell item, activated provider shell, and aggregate integrity evidence using server-side service-role access only.

The atomic function `public.complete_deployment_provider_shell_execution_item` may update only the selected `public.deployment_activation_execution_items` row from `running` to `succeeded` and write `completed_at`. It preserves provider UUID versus deployment-provider-key identity, locks session, item, and provider evidence deterministically, and rechecks ownership, lease, item lifecycle, provider active state, dependencies, prior prefix, later-item immutability, and duplicate identities.

No runtime setup wiring is added in this slice. The boundary does not progress dependencies, start another item, activate another entity, mutate provider/session/clinic rows, renew leases, rotate tokens, finalize deployment, rollback, or change `DeploymentEngine.execute()`.

## RC8 Slice 11D - Runtime Post-Provider Dependency Progression

Setup completion now reuses the existing dependency-progression boundary after successful provider-shell execution-item completion. The second invocation is reported separately as `deploymentProviderShellExecutionDependencyProgression` so clinic-post-completion progression evidence remains distinct and unchanged.

The runtime order is now provider shell activated -> provider execution item succeeded -> deterministic next dependency progression -> next item ready -> future next-item start. The stage calls the existing `public.progress_deployment_activation_execution_dependency` RPC only after provider item completion returns `completed` or `already_completed`; `already_progressed` remains idempotent ready-item reuse. It does not start sequence 3, activate another entity, complete another item, mutate sessions, renew leases, rotate tokens, bind hardware, finalize deployment, rollback, add workers, or change `DeploymentEngine.execute()`.

## RC8 Slice 11E - Post-Provider Next Item Start Runtime Wiring

The setup runtime now records a distinct post-provider next-item-start evidence field after provider-shell item completion and post-provider dependency progression. The field reuses the existing next-item-start service and Supabase repository, but is surfaced separately from the first next-item-start stage so support and UI evidence can distinguish sequence-2 start from the later provider-shell item start.

This wiring is mutation-limited to the established next-item-start boundary: at most one deterministic ready execution item may become running with one attempt increment and started_at. It does not activate entities, complete items, progress dependencies again, mutate sessions, renew ownership or leases, bind hardware, finalize deployment, rollback, or change DeploymentEngine.execute().

## RC9 Slice 1A - Generic Activation Executor Foundation

RC9 introduces a TypeScript-only activation executor foundation for future entity/action dispatch. The executor accepts one already-running activation execution item, validates only generic execution lifecycle evidence, derives a canonical dispatch key from entityType and action, and invokes exactly one explicitly registered handler for that pair.

The intended future architecture is: durable running execution item -> generic executor lifecycle validation -> explicit entity/action handler dispatch -> entity-specific atomic business mutation -> separate execution-item completion -> separate dependency progression -> separate next-item start. Slice 1A does not replace the current RC8 setup runtime chain, execute entity mutations, complete items, progress dependencies, start items, iterate through the plan, run background work, add SQL, or call Supabase.

## RC9 Slice 1B - Clinic and Provider-Shell Executor Adapters

The generic activation executor now has explicit dependency-injected adapters for clinic:activate and provider_shell:activate. Each adapter maps one already-running execution item and token-bearing executor context into a narrow activation runner dependency, then maps the activation outcome back into generic handled, already_applied, blocked, conflict, not_found, or error evidence.

The adapters preserve the RC8 separation of concerns: they perform only the entity business mutation through injected activation boundaries. Execution-item completion, dependency progression, next-item start, rollback, finalization, looping, background work, setup action wiring, SQL, and DeploymentEngine.execute() remain unchanged.

## RC9 Slice 1C - Server-Only Generic Executor Composition Boundary

The future controlled migration path is `durable running execution item -> server-only generic executor composition -> generic lifecycle validation -> explicit entityType + action handler dispatch -> existing clinic/provider atomic activation boundary -> token-safe generic result -> stop`. `createServerDeploymentActivationExecutor` explicitly composes only the `clinic:activate` and `provider_shell:activate` handlers from narrow injected server activation runners. `executeActivationItemForServerDeployment` dispatches exactly one supplied item exactly once.

This boundary is not invoked by setup actions, routes, workers, queues, scheduled work, polling, streaming, or UI. It does not replace the verified RC8 runtime, complete an item, progress dependencies, start another item, iterate a plan, mutate a session, finalize a deployment, retry, or roll back. It is a future migration boundary for only the selected entity-specific business mutation; `DeploymentEngine.execute()` remains unchanged.

## RC9 Slice 2A - Generic Execution-Step Orchestrator Foundation

Slice 2A adds TypeScript-only contracts and in-memory coordination for exactly one already-running execution item: `generic lifecycle validation -> entity executor runner -> item-completion runner -> dependency-progression runner -> next-item-start runner -> token-safe structured result -> stop`. Each stage has one narrow injected runner, an explicit typed outcome gate, and at-most-once invocation. Unsafe, thrown, unknown, or malformed outcomes stop before the next runner.

This foundation does not call production activation, completion, progression, or next-start services. It does not claim ownership, renew leases, rotate credentials, find items, query or iterate a plan, retry, recurse, complete sessions, finalize deployments, compensate, roll back, or start background work. The explicit RC8 setup orchestration remains authoritative, and no server production composition is added.

## RC9 Slice 2B - Production Execution-Step Runner Composition Boundary

Slice 2B adds four narrow server-only adapters and an explicit future composition path: `durable already-running item -> server-only execution-step orchestrator -> entity adapter -> existing generic entity executor -> completion adapter -> existing completion boundary wrapper -> progression adapter -> existing progression boundary wrapper -> next-start adapter -> existing next-start boundary wrapper -> token-safe result -> stop`. The entity adapter delegates directly to Slice 1C; the other adapters accept narrow injected wrappers around the verified RC8 production boundaries so database and prerequisite-evidence details do not leak into generic contracts.

The composed helper handles one supplied running item, calls each eligible stage at most once, performs no retry or plan iteration, and remains uninvoked by application runtime. It does not replace RC8 setup orchestration, complete sessions, finalize deployments, roll back, schedule work, or expose Supabase, repositories, RPC payloads, or generic CRUD surfaces.

## RC9 Slice 2C - Controlled Clinic Runtime Migration

The setup runtime now routes only the eligible already-running `clinic:activate` item through the server-only execution-step orchestrator: `setup clinic branch -> generic clinic entity executor -> existing atomic clinic activation -> existing item completion -> existing dependency progression -> existing next-item start -> token-safe structured result -> stop`. The action combines immutable prepared-item state with atomic running-item lifecycle evidence and preserves clinic, entity, deployment, session, execution, plan, and item identities.

The previous direct clinic activation/completion/progression/next-start glue is removed from the setup branch, with no fallback or dual mutation path. Provider shells remain on the explicit RC8 activation, provider completion, post-provider progression, and post-provider next-start path. This slice performs no retry, plan iteration, recursive execution, session completion, deployment finalization, rollback, or background work.

## RC9 Slice 2C Hotfix A - Execution-item evidence contract

`public.deployment_activation_execution_items.execution_evidence` is non-null `jsonb` prepared dependency evidence with an empty-object default. It is not rollback output. Execution-item rollback state is represented by the nullable rollback instruction `rollback_action`, the non-null lifecycle marker `rollback_status` (default `not_started`), and the nullable completion timestamp `rolled_back_at`; there is no `rollback_evidence` column in the authoritative persistence contract.

Hotfix A removes a stale `rollback_evidence` projection from the provider-shell item-completion repository. It changes no runtime sequence: clinic execution remains on the RC9 clinic-only generic step boundary, provider execution remains on the explicit RC8 path, and no fallback, retry, repair, rollback execution, session completion, or deployment finalization is added. A partially activated disposable deployment must be replaced or reset through an existing safe project procedure before validation.
