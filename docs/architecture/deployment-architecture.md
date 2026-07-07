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
