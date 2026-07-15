# SteriSphere v1 Deployment Sequence

## 1. Purpose

This document defines the SteriSphere Deployment Engine: the business workflow
that begins when an implementation specialist presses **Deploy SteriSphere**.
The engine transforms a reviewed Deployment Workspace draft into an operational
SteriSphere clinic.

The sequence defines:

- Execution order.
- Validation and authorization gates.
- Rollback boundaries.
- Failure and recovery behavior.
- Completion criteria.

It intentionally remains independent of SQL, database functions, API routes,
and other implementation details.

## 2. Deployment Philosophy

- Deployment is intentional. It begins only after explicit Super Admin
  confirmation of the reviewed draft.
- Deployment is atomic whenever possible.
- Deployment is auditable from initiation through success or failure.
- Deployment is repeatable across clean clinic environments.
- Deployment must never expose or represent a partial clinic as operational.
- Deployment should be deterministic: the same valid reviewed input and
  supported platform version should produce the same clinic configuration.
- The Deployment Workspace is planning; the Deployment Engine is execution.
- A retry must be safe and must not create duplicate configuration.
- Operational access is an outcome of successful deployment, never a substitute
  for deployment validation.

## 3. Deployment Preconditions

All preconditions must pass before deployment execution starts:

- The user is authenticated.
- The user is an active Super Admin authorized to deploy the target clinic.
- The deployment draft has reached Review and has explicit approval.
- Every required draft section is complete and valid.
- The reviewed draft version is supported by the Deployment Engine.
- The deployment target is in `draft` state, or in an explicitly retryable
  failed state.
- No deployment is already running for the target.
- The request has an idempotency identity and has not already completed.
- Required platform infrastructure and services are available.
- The target environment is compatible with the expected deployment and schema
  versions.

If any precondition fails, deployment cannot start. No operational clinic data
is created. The user remains in the Deployment Workspace with a clear
explanation of the blocking condition.

The draft may carry a deployment-target identity before a durable clinic record
is created. References to a target's `draft` status in this sequence describe
that pre-deployment lifecycle; the persistence design will determine how it is
represented without weakening the canonical `clinics` root.

## 4. Deployment Sequence

### Stage 1: Validate Deployment Draft

**Purpose:** Revalidate the exact reviewed snapshot at the trusted deployment
boundary, including required sections, cross-section consistency, supported
draft version, and configuration rules.

**Expected outcome:** One immutable, deployment-ready input is accepted. The
payload identity and any non-blocking warnings are known.

**Rollback boundary:** No operational writes have occurred. Validation failure
ends the request without rollback.

### Stage 2: Create Deployment Run

**Purpose:** Establish the durable attempt record used for idempotency, audit,
timing, diagnostics, and retry.

**Expected outcome:** A unique deployment run identifies the reviewed payload,
initiating Super Admin, target clinic draft, start time, and current stage.

**Rollback boundary:** The run is durable evidence and is never removed by
later rollback. If run creation fails, deployment does not continue.

### Stage 3: Lock Deployment

**Purpose:** Prevent concurrent or duplicate execution for the same deployment
target.

**Expected outcome:** The target is exclusively marked as deploying for this
run. Repeated requests resolve to the active or previously completed run
instead of starting another.

**Rollback boundary:** Failure to acquire the lock creates no clinic
configuration. A lock owned by this run must be released or moved to a
retryable failure state if a later stage fails.

### Stage 4: Create Clinic

**Purpose:** Materialize the canonical clinic identity and tenancy root from the
reviewed Clinic Profile.

**Expected outcome:** The clinic has one stable identifier, remains
non-operational, and is associated with the deployment run.

**Rollback boundary:** The clinic and all configuration created from this point
through Stage 10 belong to the atomic deployment unit. Failure removes or
reverts them unless the implementation retains a clearly non-operational shell
for recovery.

### Stage 5: Create Clinic Settings

**Purpose:** Create the clinic-owned regional, language, contact, pack
expiration, and other baseline settings approved in the draft.

**Expected outcome:** One complete, clinic-scoped settings baseline exists.

**Rollback boundary:** Settings are part of the atomic deployment unit and are
rolled back with the clinic configuration.

### Stage 6: Create Workstations

**Purpose:** Convert the reviewed workstation plan into operational clinical
workstations.

**Expected outcome:** Every approved room or workstation exists once, belongs
to the clinic, and carries its reviewed name, type, and capabilities.

**Rollback boundary:** All workstations created by the run are rolled back if
this or any later atomic stage fails.

### Stage 7: Create Sterilizers

**Purpose:** Create the reviewed sterilizer records and their approved clinic
or workstation relationships.

**Expected outcome:** Each planned operational sterilizer exists once with its
reviewed identity, status, and assignment.

**Rollback boundary:** All sterilizers created by the run are part of the
atomic deployment unit.

### Stage 8: Create Planning Records

**Purpose:** Preserve provider counts and hardware quantities as deployment
planning data.

**Expected outcome:** The clinic retains its reviewed staffing and equipment
plan without creating fake providers or undiscovered hardware devices.

**Rollback boundary:** Planning records are rolled back with clinic
configuration. No provider identity, hardware registration, pairing, or device
claim occurs here.

### Stage 9: Apply Baseline Policies

**Purpose:** Initialize the reviewed clinic policy choices and required
SteriSphere safeguards.

**Expected outcome:** The clinic has a complete baseline policy configuration,
including the reviewed pack expiration rule. Non-optional clinical safeguards
remain enforced.

**Rollback boundary:** Policy records and changes are part of the atomic
deployment unit.

### Stage 10: Initialize Default Configuration

**Purpose:** Add required deterministic defaults that are not individual
Deployment Workspace planning records.

**Expected outcome:** The clinic has all supported defaults needed to open the
v1 workspace safely, with no missing configuration dependency.

**Rollback boundary:** Defaults are rolled back with the clinic configuration.
A missing or invalid default is a deployment failure, not a post-deployment
repair task.

### Stage 11: Create Initial Audit Entries

**Purpose:** Record who approved and initiated deployment, which reviewed
payload and platform versions were used, and which material configuration
domains were created.

**Expected outcome:** The clinic audit history begins with traceable deployment
evidence linked to the deployment run.

**Rollback boundary:** Clinic-owned success entries participate in the atomic
unit and must not claim completion if deployment fails. Durable run-level
attempt and failure evidence remains outside that rollback.

### Stage 12: Mark Clinic Deployed

**Purpose:** Perform the final operational state transition only after every
required configuration stage succeeds.

**Expected outcome:** The clinic becomes `deployed`, deployment and schema
versions are recorded, completion time is set, and the deployment run is
successful.

**Rollback boundary:** This is the atomic commit boundary. If the transition
cannot complete, the clinic remains unavailable and all operational
configuration created by the attempt is rolled back.

### Stage 13: Unlock Dashboard

**Purpose:** Allow normal application authorization and routing to recognize
the successfully deployed clinic.

**Expected outcome:** Eligible clinic users may access the operational
workspace according to RBAC. The first-run Setup Wizard becomes locked.

**Rollback boundary:** This stage changes access eligibility rather than clinic
configuration. If access evaluation fails, the deployed clinic remains safe
and inaccessible while the failure is diagnosed; deployment must not be
silently repeated.

### Stage 14: Redirect to Dashboard

**Purpose:** Complete the initiating Super Admin's experience and leave the
Deployment Workspace.

**Expected outcome:** The user receives the successful deployment result and is
redirected to the normal dashboard, where recommended next actions may be
shown.

**Rollback boundary:** Redirect failure does not roll back a successful
deployment. The user can refresh or navigate to the dashboard after deployment
status is confirmed.

## 5. Rollback Philosophy

If any execution stage fails, the engine stops immediately. It does not skip
the failed stage, continue with partial configuration, or unlock the dashboard.

The engine rolls back everything created by the failed deployment's atomic
configuration unit. It retains:

- The deployment run.
- Attempt and failure audit evidence.
- Sanitized failure diagnostics and the last reached stage.
- The reviewed deployment snapshot and payload identity.
- The recoverable Deployment Workspace draft.

Rollback itself must be observable. If automatic rollback cannot be confirmed,
the clinic remains locked in a non-operational recovery state and requires
controlled support intervention before retry.

## 6. Success Criteria

Deployment is complete only when all of the following are true:

- The canonical clinic exists.
- Clinic settings exist and are valid.
- Reviewed workstations exist.
- Reviewed sterilizers exist.
- Baseline policies are initialized.
- Provider and hardware planning records are created.
- Required default configuration is initialized.
- Deployment audit evidence is recorded.
- Deployment and schema versions are recorded.
- The deployment run is successful.
- Clinic deployment status is `deployed`.
- Dashboard authorization recognizes the clinic as available.

A redirect, success toast, or completed progress indicator cannot independently
declare deployment success.

## 7. Failure States

### Validation Failed

**Description:** The reviewed payload is incomplete, inconsistent, changed
after review, or uses an unsupported draft version.

**User-facing behavior:** Remain in the Deployment Workspace, identify the
affected section, and show actionable validation guidance.

**Recovery strategy:** Correct the draft, review the new snapshot, and start a
new or safely superseding attempt.

### Authorization Failed

**Description:** The user is unauthenticated, inactive, lacks Super Admin
authority, or cannot deploy the target clinic.

**User-facing behavior:** Deny deployment without exposing sensitive
configuration or diagnostics. Direct the user to sign in or contact an
authorized Super Admin.

**Recovery strategy:** Restore the correct authenticated role or support
pathway, then explicitly initiate deployment again.

### Persistence Failed

**Description:** A required clinic, settings, workstation, sterilizer,
planning, policy, default, or audit write cannot complete.

**User-facing behavior:** Show that deployment did not complete, confirm the
dashboard remains locked, and provide the deployment run identifier for
support.

**Recovery strategy:** Roll back the atomic configuration unit, retain failure
evidence and the reviewed draft, correct the underlying condition, and retry
idempotently.

### Configuration Failed

**Description:** Persisted or derived configuration cannot satisfy the required
operational invariants, even if individual writes were accepted.

**User-facing behavior:** Report a configuration-stage failure without
presenting the clinic as partially usable.

**Recovery strategy:** Roll back, correct the draft rule or platform default,
revalidate the complete snapshot, and retry.

### Unexpected Exception

**Description:** An unclassified platform or infrastructure error interrupts
execution.

**User-facing behavior:** Show a safe general failure message, the deployment
run identifier, and confirmation that the clinic remains locked. Do not expose
secrets or raw internal errors.

**Recovery strategy:** Capture sanitized diagnostics, verify rollback and lock
state, investigate the cause, and retry only after the deployment target is
confirmed safe.

## 8. Deployment Result

The Deployment Engine conceptually returns a `DeploymentResult` containing:

- Success or failure.
- Clinic ID, when one is durably available.
- Deployment Run ID.
- Final deployment stage and status.
- Duration.
- Non-blocking warnings.
- Sanitized failure information when unsuccessful.
- Next recommended actions.

The result communicates outcome; it does not override persisted deployment
status. Clients must not unlock the dashboard solely because a local response
claims success.

## 9. Future Expansion

The following are post-deployment workflows, not v1 Deployment Engine stages:

- Hardware registration.
- Clinic Agent enrollment.
- Printer pairing.
- Scanner pairing.
- Provider identity creation or import.
- Patient import.

These workflows may be recommended after deployment and may have their own
validation, audit, and retry models. Their absence must not cause the engine to
fabricate operational records during initial clinic creation.

## 10. Relationship with the Deployment Workspace

The boundary is:

`Deployment Workspace -> Planning -> Review -> Deployment Engine -> Operational Clinic`

The Deployment Workspace gathers and validates an editable local draft. Review
produces the exact approved snapshot. The Deployment Engine accepts that
snapshot, revalidates it at a trusted boundary, and executes the controlled
state transition. After success, normal Settings and operational workflows own
future clinic changes.

## 11. Architecture Notes

The sequence is documented before SQL because the business workflow should
drive persistence, not the opposite. Transaction boundaries, constraints, API
contracts, and migrations should be selected to enforce this sequence.

This separation also makes the intended behavior reviewable before
implementation choices make it harder to change. SQL design may refine how
stages are grouped atomically, but it must preserve their ordering, evidence,
failure semantics, and completion rules.

## 12. Phase Relationship

This document works with three existing references:

- [Deployment Architecture](./deployment-architecture.md) defines the tenancy
  root, deployment states, ownership model, data mapping, and audit entities.
- [v1.0 Deployment Validation Plan](./v1-deployment-validation-plan.md) defines
  the clean-environment scenario, Phase 9 roadmap, and end-to-end acceptance
  criteria.
- [Clinic Setup Wizard](./clinic-setup-wizard.md) defines the Deployment
  Workspace, its planning steps, review behavior, and current local-draft
  boundary.

Together they define the deployment state model, the ordered execution
workflow, the planning input, and the validation exercise. Persistence design
and implementation follow these documents rather than redefining them.

## Deployment Engine Foundation

`lib/modules/deployment` provides the typed `DeploymentEngine` foundation for
this sequence. Its stage registry is the implementation source of truth for the
14 stages above, while its state machine and pure validators represent legal
status changes and deployment preconditions.

The methods `validate()`, `prepare()`, `simulate()`, `execute()`, and
`rollback()` currently operate in memory only. They do not persist data, call
Supabase, unlock the dashboard, or change the Deployment Workspace. Real
execution remains disabled until a later persistence phase implements the
documented rollback and audit guarantees.

## Deployment Draft Boundary

The input to `DeploymentEngine` is a canonical, versioned
`DeploymentDraft`, not live component state. Before Stage 1 begins, the
Deployment Workspace must transform its local clinic profile, workstation,
provider-plan, sterilizer, policy, hardware-plan, and review state into this
single contract.

Stage 1 validates the resulting payload as a whole. Later persistence stages
must consume that reviewed snapshot without reaching back into wizard state or
reconstructing configuration from separate UI stores. Reviewer metadata may be
absent while the contract is local-only, but execution will eventually require
an explicitly reviewed snapshot.

## In-Memory Sequence Simulation

`DeploymentEngine.simulate()` runs the complete stage registry in order and
returns a structured execution report without persistence. A draft-validation
failure skips every stage before execution begins. A simulated stage failure or
exception stops the sequence, identifies the failed stage, marks remaining
stages skipped, and indicates whether completed execution work would require
rollback.

For this phase, `execute()` delegates to `simulate()` and `rollback()` reports
an inert simulated rollback. The deterministic stage messages demonstrate the
business orchestration only. Real persistence handlers will replace the
simulated handlers in a later phase without changing the documented order or
failure semantics.

The Setup Wizard Review step may locally preview this simulation after the
canonical draft passes validation. The preview shows aggregate status and the
outcome of every stage, but validates orchestration only. It does not invoke
persistence, enable deployment, save clinic data, or change Confirm Review
from its existing local transition to the Complete placeholder.

Relevant simulated stages also generate their future repository payloads in
memory. This dry run exercises the same pure mapping that persistence handlers
will consume later, while stage reports retain only safe payload metadata.
Repository methods are not called, full payloads are not displayed, and the
sequence remains write-free.

The Review simulation panel may display these safe diagnostics per stage:
whether a payload was generated, its contract type, and a short count or label
summary. This helps implementation staff validate future persistence coverage
before repository execution is enabled. Full reviewed payloads and payload JSON
remain internal to the engine.

The simulation also creates an in-memory `DeploymentTransaction` for the
persistence-relevant portion of the sequence, from deployment-run creation
through finalization. The transaction begins before the first such stage,
records a checkpoint after each successful persistence-relevant stage, commits
when the full simulation succeeds, and aborts plus rolls back checkpoints when
a simulated stage fails.

This is not a Supabase transaction and it performs no writes. It is a foundation
for the eventual persistence implementation to map onto real atomic operations
or safe compensating rollback while preserving the documented sequence and
failure semantics.

## Deployment Locking Foundation

The in-memory simulation now models lock metadata during Stage 3, `Lock
Deployment`. This metadata includes the clinic, deployment run, idempotency key,
requester, acquisition/expiry/release timestamps, status, failure reason, and a
safe message. The lock model is local-only and does not call Supabase, create a
database lock, or mutate deployment state.

The required v1.0 persistence behavior remains stricter than the simulation:

- Lock acquisition must be server-side and database-enforced.
- UI disabling alone must never be treated as duplicate-deployment prevention.
- A repeated request with the same idempotency key should reuse the existing
  deployment run.
- A request with a different idempotency key while an active lock exists should
  be rejected.
- Expired locks should require recovery review before retry, because the system
  must first determine whether work started, failed, committed, or rolled back.
- Lock metadata must remain auditable through deployment-run evidence and
  sanitized failure diagnostics.

This lock foundation is intended to guide the future repository-backed lock
operation without enabling real deployment execution.

## Server-Side Idempotency Foundation

The in-memory simulation now models idempotency metadata during Stage 2,
`Create Deployment Run`. This metadata includes the idempotency key, optional
clinic and deployment-run identifiers, payload hash, requester, request time,
expiry, existing run status, existing payload hash, result status, conflict
reason, and a safe message. The model is local-only and does not call Supabase,
create a database row, or mutate deployment state.

The required v1.0 persistence behavior remains stricter than the simulation:

- Idempotency must be enforced server-side and database-backed before any real
  clinic configuration writes occur.
- UI disabling alone must never be treated as duplicate-request prevention.
- Duplicate clicks and network retries with the same key and same payload hash
  must return or reuse the original deployment run.
- The same key with a different payload hash must be rejected as a conflict.
- Expired keys require a new key or manual recovery review.
- Idempotency decisions must be auditable through deployment-run evidence and
  sanitized diagnostics.

Idempotency answers whether a request should create, replay, or reject a
deployment run. Deployment locking answers whether that run may currently
execute for the clinic. Both safeguards are required before real persistence is
enabled.

## Rollback Verification and Recovery Foundation

The in-memory simulation now models rollback verification when a simulated
deployment transaction rolls back. Verification metadata includes the
transaction, deployment run, clinic, failed stage, rollback start/completion
timestamps, verification timestamp, rollback status, manual-recovery flag,
checkpoint evidence, step evidence, and safe messages.

The required v1.0 persistence behavior remains stricter than the simulation:

- Rollback verification is mandatory before deployment retry.
- A completed and verified rollback may proceed to retry through the normal
  deployment gates.
- A partial rollback requires manual cleanup before retry.
- A rollback failure blocks deployment until administrator or engineering
  intervention completes.
- Manual recovery is preferable to silent inconsistency or automatic unlock.
- Rollback evidence must remain auditable through deployment-run records and
  sanitized diagnostics.

Recovery plans classify follow-up as automatic retry, manual verification,
manual cleanup, or engineering support. The current implementation only models
that evidence in memory; it does not call repositories, persist recovery
records, or alter deployment execution semantics.

## Deployment Audit Evidence Envelope

The in-memory simulation now produces a deployment audit evidence envelope as
descriptive metadata. The envelope captures the reviewed draft snapshot,
stage execution summary, dry-run diagnostics, transaction metadata, lock
metadata, idempotency metadata, rollback verification, recovery plan, and final
deployment outcome.

The required v1.0 persistence behavior remains stricter than the simulation:

- Real audit persistence should store the evidence envelope or a durable
  equivalent after the trusted deployment boundary evaluates the request.
- Evidence must be immutable in concept and describe what happened rather than
  causing side effects.
- Failed, partial, blocked, and successful attempts must all leave evidence.
- Rollback and recovery evidence must survive rollback.
- Retry safety must be explainable from evidence.
- Silent deployment inconsistency is unacceptable.

The audit evidence envelope complements deployment runs. A deployment run owns
durable attempt identity and status; the envelope provides the structured
explanation of decisions, safeguards, rollback verification, and retry safety.

## Deployment Lifecycle State Machine

The deployment lifecycle state machine is the canonical sequence model for
deployment execution and recovery. The in-memory simulation may attach a
lifecycle summary to the execution result without changing orchestration
semantics.

Lifecycle states include draft, validating, ready, locked, executing,
rolling_back, rollback_verification, completed, failed, blocked,
manual_recovery, and cancelled. Only explicit transitions are valid. For
example, a draft enters validating, validation can become ready or failed,
ready can lock, locked can execute, execution can complete or roll back, and
rollback verification decides whether the deployment is completed-for-retry,
requires manual recovery, or is blocked.

Persistence will later store lifecycle transitions as durable deployment-run
evidence. Audit evidence references lifecycle summaries so support can explain
why retry is allowed, blocked, or waiting for manual recovery. Rollback
verification must pass before retry; silent inconsistency is not a valid state.

## RC2 Slice 1: Durable Deployment Run Boundary

The first persistence-ready slice is limited to `deployment_runs`. It prepares
the durable record that a future server-side deployment request will create or
read before any downstream deployment stage can persist data.

The future persistent sequence begins with:

1. Normalize and validate the server-side idempotency key.
2. Compare the reviewed deployment draft payload hash.
3. Read an existing deployment run when the same idempotency key and payload
   hash are already recorded.
4. Reject the request when the same idempotency key points to a different
   payload hash.
5. Create an evidence-first deployment run only when no conflict exists.

No clinic creation, tenant setup, settings persistence, user creation, or
stage-specific persistence is introduced by this slice. The current engine
still simulates every deployment stage. A later RC2 implementation may replace
only the `Create Deployment Run` simulated stage with the deployment-run
repository while keeping all downstream stages simulated until explicitly
approved.

`supabase_deployment_runs.sql` now contains the SQL migration draft for this
first durable boundary. The file is reviewable and migration-ready, but the
application does not call it, does not wire Supabase runtime persistence, and
does not execute idempotency conflict handling yet. The sequence remains
simulation-first until a later repository-wiring slice is approved.

RC2 Slice 3 adds the concrete but unused Supabase repository implementation for
`deployment_runs`. A future repository-wiring slice can replace only the
deployment-run evidence step with this implementation. Until that explicit
wiring happens, the sequence still runs through simulation and no runtime code
creates, updates, completes, fails, or blocks deployment runs in Supabase.

RC2 Slice 4 adds the server-only `DeploymentRunService` design. The service
models the future server sequence for creating, reusing, or resuming a durable
deployment run, but it is not exposed through a public API route and is not
called by the Setup Wizard. The decision model rejects missing or invalid
idempotency before repository writes, reuses a run when the same key and
payload hash are found, and reports a conflict when the same key maps to a
different payload hash. It never calls `DeploymentEngine.execute()` and never
persists downstream deployment stages.

RC2 Slice 5 adds an in-memory harness that validates the service decision flow
before any runtime wiring. The harness proves the deployment-run branch can
create, reuse, reject, conflict, and resume using only the repository contract.
It also records that no clinic, tenant, settings, user, stage, or engine
boundary is touched by the service tests.

## RC2.5 Runtime Boundary Note

RC2.5 Slice 1 wires only the Stage 2 deployment-run evidence boundary behind a private server-only helper. Trusted server code can create a `DeploymentRunService` backed by `SupabaseDeploymentRunRepository`, then create or reuse a `deployment_runs` record through the existing idempotency decision flow.

This does not change the documented deployment sequence or enable real deployment execution. Stage 2 remains simulated inside `DeploymentEngine`, and every downstream stage, including clinic creation, tenant setup, settings, users, providers, sterilizers, packs, cycles, traces, audit logs, dashboard unlock, and redirect behavior, remains simulated or unwired until a later approved slice.

## RC2.5 Smoke Harness Note

The RC2.5 smoke harness verifies only the private Stage 2 deployment-run persistence boundary. It can create or reuse one `deployment_runs` evidence row and confirm an idempotency conflict, but it does not advance the Deployment Engine sequence or execute any downstream stage.

Clinic creation, tenant setup, settings, users, providers, sterilizers, packs, cycles, traces, audit logs, dashboard unlock, and redirect behavior remain outside this smoke harness.

## RC2.5 First Runtime Persistence Note

The first real runtime persistence path is limited to Stage 2 evidence: the Complete step can persist or reuse a `deployment_runs` row after Review freezes the canonical draft snapshot. The server action still builds evidence from the simulated sequence and stores only deployment-run evidence.

The ordered Deployment Engine sequence is not advanced into real execution. Validation, clinic creation, locking, settings, workstations, sterilizers, planning records, policies, defaults, audit entries, dashboard unlock, and redirect behavior remain simulated or unwired until their own approved slices.

## RC2.5 Session Identity Note

Stage 2 runtime persistence now uses a setup-session idempotency boundary. The reviewed draft and editable clinic code are evidence in the deployment run, but the session id owns retry/reuse/conflict behavior for the deployment attempt.

Completion remains pre-clinic-creation. Persisting or reusing the deployment run locks previous setup steps, presents future access and fallback actions, and keeps every downstream deployment stage simulated or unwired.

## RC3 Slice 1 Clinic Root Design Note

RC3 Slice 1 designs the future Stage 4 Create Clinic persistence boundary without enabling it. The ordered deployment sequence remains unchanged and simulated inside DeploymentEngine.

The future server sequence for this narrow boundary is:

1. Stage 2 has already persisted or reused a deployment_runs row.
2. Trusted server code loads that deployment run by deployment_run_id.
3. If the run already has clinic_id, the linked clinic is loaded and reused.
4. If the run has no clinic link, the reviewed draft clinic profile is mapped to one draft clinics insert payload.
5. If the same clinic code already exists for another session, the request conflicts and no link is written.
6. If the clinic root is inserted or safely reused, deployment_runs.clinic_id is updated to the clinic id.
7. All downstream stages remain simulated or unwired.

A successful RC3 clinic-root operation is not full deployment success. The clinic remains non-operational until settings, workstations, sterilizers, planning records, policies, defaults, audit evidence, finalization, dashboard unlock, and redirect stages are deliberately implemented in later slices.

Rollback and recovery remain conservative. If clinic insert fails, the deployment run remains as evidence with no clinic link. If clinic insert succeeds but linking fails in a later implementation, the safest production design is a transaction or RPC that inserts and links atomically; otherwise the draft clinic shell must remain non-operational and require explicit recovery before retry.

## RC3 Slice 5 Server-only Clinic Root Helper Note

RC3 Slice 5 prepares the first trusted server helper for the future Stage 4 Create Clinic boundary without advancing the public deployment sequence. The helper requires Stage 2 deployment-run evidence to already exist and can create or reuse the draft clinic root, then link deployment_runs.clinic_id after the clinic root is known.

The ordered Deployment Engine sequence remains simulated and unchanged. Stage 5 and later deployment stages remain unwired, including settings, workstations, sterilizers, planning records, policies, defaults, audit entries, finalization, dashboard unlock, and redirect.

## RC3 Slice 6 Setup Completion Sequence

1. User confirms deployment from the Setup Complete step.
2. The server action validates the reviewed draft and setup session identity.
3. The server action creates/reuses `deployment_runs` by idempotency key and payload hash.
4. If deployment-run persistence conflicts, clinic-root persistence is skipped.
5. If deployment-run persistence succeeds, the server action calls the server-only clinic-root helper.
6. The helper requires the existing deployment run, creates/reuses one draft `public.clinics` row, and links `deployment_runs.clinic_id`.
7. The UI reports deployment-run status, clinic-root status, linked `clinic_id`, and the continuing simulation boundary.

Retry behavior: the same setup session and same payload hash reuses the deployment run; if that run already has `clinic_id`, the clinic-root helper reuses the linked draft clinic. A different setup session using the same clinic code conflicts and does not create a duplicate clinic.

## RC4 Slice 1 Clinic Settings Sequence

1. User confirms deployment from Setup Complete.
2. The server action creates/reuses `deployment_runs`.
3. The server action creates/reuses the draft clinic root and links `deployment_runs.clinic_id`.
4. The server action provisions `clinic_settings` for the linked `clinic_id`.
5. If `clinic_settings` already exists for that clinic, the settings row is reused.
6. If settings provisioning fails, the deployment run and clinic root remain durable and the UI reports a safe settings failure.

The sequence stops after clinic settings. Providers, sterilizers, workstations, hardware, packs, cycles, traces, users, audit logs, activation, and real workspace access remain out of scope.

## RC4 Slice 2B Provider Foundation Sequence Note

RC4 Slice 2B prepares the future provider-shell step but does not add it to the runtime sequence. The Complete action still stops after clinic settings, and the Deployment Engine sequence remains simulated.

The future provider-shell sequence is designed to run only after:

1. `deployment_runs` exists or is reused.
2. The draft clinic root exists and `deployment_runs.clinic_id` is linked.
3. `clinic_settings` exists for that `clinic_id`.

At that point, trusted server code may derive deterministic placeholder shells from the reviewed draft provider counts and create/reuse only missing `public.providers` rows for that clinic. No fake named people, users, sterilizers, workstations, hardware devices, packs, cycles, traces, audit entries, activation, dashboard unlock, or redirect behavior is introduced by this foundation.

## RC4 Slice 2E Provider Shell Runtime Sequence

The Setup Complete action now performs the first runtime provider-shell provisioning step after clinic settings succeeds:

1. Persist or reuse `deployment_runs`.
2. Create or reuse the draft clinic root and link `deployment_runs.clinic_id`.
3. Create or reuse `clinic_settings` for that clinic.
4. Create or reuse inactive provider placeholder shells in `public.providers` from the reviewed provider counts.

This does not advance the Deployment Engine into full execution. Provider shells are placeholders only; sterilizers, workstations, hardware devices, packs, cycles, traces, users, audit logs, activation, dashboard unlock, and redirect behavior remain outside this runtime boundary.

## RC4 Slice 3B Sterilizer Foundation Sequence Note

RC4 Slice 3B prepares the future sterilizer-shell step but does not add it to the runtime sequence. The current Setup Complete action still stops after provider shell provisioning, and the Deployment Engine sequence remains simulated.

The future sterilizer-shell sequence is designed to run only after:

1. `deployment_runs` exists or is reused.
2. The draft clinic root exists and `deployment_runs.clinic_id` is linked.
3. `clinic_settings` exists for that clinic.
4. Provider shells have been provisioned or reused for that clinic.

At that point, trusted server code may derive deterministic inactive sterilizer shells from the reviewed draft sterilizer list and create/reuse only missing `public.sterilizers` rows for that clinic. Names must include a clinic-specific suffix because global sterilizer name uniqueness exists. No workstation assignment, hardware device, pack, cycle, trace, user, audit entry, activation, dashboard unlock, redirect behavior, or `DeploymentEngine.execute()` change is introduced by this foundation.

## RC4 Slice 3E Sterilizer Shell Runtime Sequence

The Setup Complete action now performs sterilizer-shell provisioning after provider shells succeed:

1. Persist or reuse `deployment_runs`.
2. Create or reuse the draft clinic root and link `deployment_runs.clinic_id`.
3. Create or reuse `clinic_settings` for that clinic.
4. Create or reuse inactive provider placeholder shells in `public.providers`.
5. Create or reuse inactive planned sterilizer shells in `public.sterilizers` from the reviewed sterilizer draft list.

This does not advance the Deployment Engine into full execution. Sterilizer rows remain inactive planned shells with deterministic deployment keys and clinic-specific generated names. Workstation assignment, hardware devices, packs, cycles, traces, users, audit logs, activation, dashboard unlock, redirect behavior, and `DeploymentEngine.execute()` remain outside this runtime boundary.

## RC4 Slice 4A Workstation Foundation Sequence Note

RC4 Slice 4A prepares the future workstation-shell step but does not add it to the runtime sequence. The current Setup Complete action still stops after sterilizer shell provisioning, and the Deployment Engine sequence remains simulated.

The future workstation-shell sequence is designed to run only after:

1. `deployment_runs` exists or is reused.
2. The draft clinic root exists and `deployment_runs.clinic_id` is linked.
3. `clinic_settings` exists for that clinic.
4. Provider shells have been provisioned or reused for that clinic.
5. Sterilizer shells have been provisioned or reused for that clinic.

At that point, trusted server code may derive deterministic inactive workstation shells from the reviewed draft workstation list and create/reuse only missing future `clinical_workstations` rows for that clinic. The planned runtime order is `deployment_run -> clinic_root -> clinic_settings -> provider_shells -> sterilizer_shells -> workstation_shells`.

Workstation shells use deterministic keys such as `workstation-001`, `workstation-002`, and `workstation-003`, remain `status = planned`, `provisioning_source = setup_draft`, `provisioning_status = planned`, and `active = false`, and do not enroll local agents or create hardware records. No Supabase repository, setup action wiring, UI change, SQL migration, smoke runner, hardware device, pack, cycle, trace, user, audit entry, activation, dashboard unlock, redirect behavior, or `DeploymentEngine.execute()` change is introduced by this foundation.

## RC5 Slice 1A Hardware Foundation Sequence Note

RC5 Slice 1A prepares the future hardware-shell step but does not add it to the runtime sequence. The current Setup Complete action still stops after workstation shell provisioning, and the Deployment Engine sequence remains simulated.

The future hardware-shell sequence is designed to run only after:

1. `deployment_runs` exists or is reused.
2. The draft clinic root exists and `deployment_runs.clinic_id` is linked.
3. `clinic_settings` exists for that clinic.
4. Provider shells have been provisioned or reused for that clinic.
5. Sterilizer shells have been provisioned or reused for that clinic.
6. Workstation shells have been provisioned or reused for that clinic.

At that point, trusted server code may derive deterministic inactive hardware shells from the reviewed hardware quantities and create/reuse only missing future hardware planned-shell rows for that clinic. The planned runtime order is `deployment_run -> clinic_root -> clinic_settings -> provider_shells -> sterilizer_shells -> workstation_shells -> hardware_shells`.

Hardware shells use deterministic keys such as `hardware-001`, `hardware-002`, and `hardware-003`, remain `status = planned`, `provisioning_source = setup_draft`, `provisioning_status = planned`, and `active = false`, and carry assignment keys only as logical deployment-key references. No Supabase repository, setup action wiring, UI change, SQL migration, smoke runner, printer/scanner/camera/sound binding, workstation or sterilizer assignment, device activation, pack, cycle, trace, user, audit entry, dashboard unlock, redirect behavior, or `DeploymentEngine.execute()` change is introduced by this foundation.

## RC5 Slice 1E Hardware Shell Runtime Sequence

The Setup Complete action now performs hardware-shell provisioning after workstation shells succeed:

1. Persist or reuse `deployment_runs`.
2. Create or reuse the draft clinic root and link `deployment_runs.clinic_id`.
3. Create or reuse `clinic_settings` for that clinic.
4. Create or reuse inactive provider placeholder shells in `public.providers`.
5. Create or reuse inactive planned sterilizer shells in `public.sterilizers`.
6. Create or reuse inactive planned workstation shells in `public.clinical_workstations`.
7. Create or reuse inactive planned hardware shells in `public.clinical_hardware_devices` from the reviewed hardware quantities.

This does not advance the Deployment Engine into full execution. Hardware rows remain inactive setup-draft planned shells with deterministic deployment keys such as `hardware-001`, `hardware-002`, and `hardware-003`. Logical assignment keys remain metadata only and are not resolved to workstation or sterilizer ids. Clinic agent registration, printer/scanner/camera/sound binding, device activation, packs, cycles, traces, users, audit logs, dashboard unlock, redirect behavior, and `DeploymentEngine.execute()` remain outside this runtime boundary.

## RC6 Slice 1A Hardware Assignment Foundation Sequence Note

RC6 Slice 1A prepares the future hardware-assignment relationship step but does not add it to the runtime sequence. The current Setup Complete action still stops after hardware shell provisioning, and the Deployment Engine sequence remains simulated.

The future hardware-assignment sequence is designed to run only after:

1. `deployment_runs` exists or is reused.
2. The draft clinic root exists and `deployment_runs.clinic_id` is linked.
3. `clinic_settings` exists for that clinic.
4. Provider shells have been provisioned or reused for that clinic.
5. Sterilizer shells have been provisioned or reused for that clinic.
6. Workstation shells have been provisioned or reused for that clinic.
7. Hardware shells have been provisioned or reused for that clinic.

At that point, trusted server code may derive inactive planned hardware assignment relationships from the reviewed hardware shell plan. The future order is `deployment_run -> clinic_root -> clinic_settings -> provider_shells -> sterilizer_shells -> workstation_shells -> hardware_shells -> hardware_assignments`.

Hardware assignment payloads use deterministic keys such as `hardware-assignment-hardware-001`, remain `assignment_status = planned`, `assignment_source = setup_draft`, and `active = false`, and target only logical deployment keys. Workstation id resolution, sterilizer id resolution, hardware row id resolution, agent registration, printer/scanner/camera/sound binding, device activation, packs, cycles, traces, users, audit logs, dashboard unlock, redirect behavior, and `DeploymentEngine.execute()` remain outside this foundation.

## RC6 Slice 1C Hardware Assignment Schema Readiness

The future `hardware_assignments` relationship step now has a dedicated durable table, `public.deployment_hardware_assignments`, for inactive setup-draft planned relationships. The sequence remains `deployment_run -> clinic_root -> clinic_settings -> provider_shells -> sterilizer_shells -> workstation_shells -> hardware_shells -> hardware_assignments`, but this slice creates only the schema boundary.

No setup action, runtime composition, UI, hardware binding, target id resolution, activation, smoke runner, dashboard unlock, redirect behavior, or `DeploymentEngine.execute()` change is introduced. The table is ready for a later runtime slice to create or reuse planned assignment rows after hardware shell persistence.

## RC6 Slice 1D Hardware Assignment Runtime Sequence

Setup completion now persists `hardware_assignments` immediately after `hardware_shells`. The order is `deployment_run -> clinic_root -> clinic_settings -> provider_shells -> sterilizer_shells -> workstation_shells -> hardware_shells -> hardware_assignments`.

If hardware assignment provisioning fails or detects conflicts, the action returns safely with upstream durable records intact and no downstream work. Assignment rows remain inactive setup-draft planned relationships using logical deployment keys only.

## RC6 Slice 2A Assignment Target Validation Foundation Sequence Note

RC6 Slice 2A prepares the future assignment-target validation step but does not add it to setup completion or `DeploymentEngine.execute()`. The current runtime sequence still stops after `hardware_assignments`.

The future validation step is designed to run only after:

1. `deployment_runs` exists or is reused.
2. The draft clinic root exists and `deployment_runs.clinic_id` is linked.
3. `clinic_settings` exists for that clinic.
4. Provider shells have been provisioned or reused for that clinic.
5. Sterilizer shells have been provisioned or reused for that clinic.
6. Workstation shells have been provisioned or reused for that clinic.
7. Hardware shells have been provisioned or reused for that clinic.
8. Hardware assignments have been provisioned or reused for that clinic.

At that point, trusted server code may validate logical assignment targets before any later ID resolution or hardware binding workflow. The future order is `deployment_run -> clinic_root -> clinic_settings -> provider_shells -> sterilizer_shells -> workstation_shells -> hardware_shells -> assignment_target_validation -> hardware_assignments`.

Validation checks only logical deployment keys. It does not resolve workstation ids, sterilizer ids, hardware ids, or agent ids; does not write operational hardware binding columns; does not activate hardware or assignments; and does not create packs, cycles, traces, users, audit logs, dashboard access, redirect behavior, or deployment engine execution changes.
## RC6 Slice 2C Assignment Target Validation Runtime Sequence

Setup completion now validates logical assignment targets immediately after `hardware_shells` and before `hardware_assignments`:

1. Persist or reuse `deployment_runs`.
2. Create or reuse the draft clinic root and link `deployment_runs.clinic_id`.
3. Create or reuse `clinic_settings` for that clinic.
4. Create or reuse inactive provider placeholder shells.
5. Create or reuse inactive planned sterilizer shells.
6. Create or reuse inactive planned workstation shells.
7. Create or reuse inactive planned hardware shells.
8. Validate assignment targets from the deterministic hardware assignment payloads.
9. Create or reuse inactive planned hardware assignment rows only when validation passes.

Validation failure stops the sequence safely at step 8. Upstream durable evidence remains intact, hardware assignment persistence is skipped, no downstream work is attempted, and no operational binding, activation, or `DeploymentEngine.execute()` behavior changes are introduced.
## RC7 Slice 1A - Planned Assignment Resolution Foundation

RC7 Slice 1A introduces a read-only in-memory resolution foundation after planned hardware assignment persistence. The future order is now `deployment_run -> clinic_root -> clinic_settings -> provider_shells -> sterilizer_shells -> workstation_shells -> hardware_shells -> assignment_target_validation -> hardware_assignments -> planned_assignment_resolution`.

Planned assignment resolution converts clinic-scoped logical deployment keys into durable row identities in memory only. A planned hardware assignment can resolve `deployment_hardware_key` to a planned hardware shell row id, resolve workstation or sterilizer `target_deployment_key` values to same-clinic planned shell row ids, or preserve explicit `unassigned` with a null target id. The layer returns structured resolved/unresolved records, batch counters, and issues; it does not persist resolution evidence or write ids back to assignments.

Compatibility remains setup-draft and inactive. Hardware, workstation, and sterilizer shells must be same-clinic planned rows with `provisioning_source = setup_draft`, `provisioning_status = planned`, and `active = false`. Hardware shells with `agent_id`, `default_workstation_id`, or `current_workstation_id` are rejected as already operationally bound. The foundation does not create a Supabase repository, SQL migration, setup action wiring, UI evidence, operational binding, activation, agent registration, or `DeploymentEngine.execute()` change.
## RC7 Slice 1C Runtime Planned Assignment Resolution Sequence

Setup completion now runs read-only planned assignment resolution immediately after `hardware_assignments`:

1. Persist or reuse `deployment_runs`.
2. Create or reuse the draft clinic root and link `deployment_runs.clinic_id`.
3. Create or reuse `clinic_settings` for that clinic.
4. Create or reuse inactive provider placeholder shells.
5. Create or reuse inactive planned sterilizer shells.
6. Create or reuse inactive planned workstation shells.
7. Create or reuse inactive planned hardware shells.
8. Validate assignment targets from deterministic hardware assignment payloads.
9. Create or reuse inactive planned hardware assignment rows when validation passes.
10. Resolve persisted planned assignments to durable hardware and target row ids in memory only.

Resolution failure or incomplete resolution stops the runtime chain safely after upstream evidence and planned assignment rows are durable. The response includes structured resolution issues, but no resolved ids are persisted, no hardware binding columns are written, no records are activated, and no `DeploymentEngine.execute()` behavior changes.
## RC7 Slice 1E Activation Readiness Foundation Sequence

A future read-only `deployment_activation_readiness` stage is documented after planned assignment resolution:

1. Persist or reuse `deployment_runs`.
2. Create or reuse the draft clinic root and link `deployment_runs.clinic_id`.
3. Create or reuse `clinic_settings` for that clinic.
4. Create or reuse inactive provider placeholder shells.
5. Create or reuse inactive planned sterilizer shells.
6. Create or reuse inactive planned workstation shells.
7. Create or reuse inactive planned hardware shells.
8. Validate assignment targets.
9. Create or reuse inactive planned hardware assignment rows.
10. Resolve planned assignments to durable ids in memory only.
11. Assess deployment activation readiness without writing or activating anything.

Activation readiness is not activation. It is the final read-only safety boundary before any future phase may bind hardware, persist resolved ids, activate clinic records, register agents, or update deployment status.

## RC7 Slice 1G Runtime Activation Readiness Sequence

Setup completion now appends the final read-only readiness assessment after successful planned assignment resolution:

1. Persist or reuse `deployment_runs`.
2. Create or reuse the draft clinic root and link `deployment_runs.clinic_id`.
3. Create or reuse `clinic_settings` for that clinic.
4. Create or reuse inactive provider placeholder shells.
5. Create or reuse inactive planned sterilizer shells.
6. Create or reuse inactive planned workstation shells.
7. Create or reuse inactive planned hardware shells.
8. Validate logical assignment targets using fresh runtime evidence.
9. Create or reuse inactive planned hardware assignment rows.
10. Resolve planned assignments to durable ids in memory only.
11. Assess deployment activation readiness from the durable snapshot plus fresh validation and resolution evidence.

Readiness failure stops the sequence at the final safety boundary with upstream evidence preserved. No activation, binding, resolved-id persistence, agent registration, dashboard unlock, redirect behavior, or `DeploymentEngine.execute()` change is introduced.

## RC8 Slice 1A Controlled Activation Plan Sequence

A future controlled activation plan stage is documented after activation readiness:

1. Persist or reuse `deployment_runs`.
2. Create or reuse the draft clinic root and link `deployment_runs.clinic_id`.
3. Create or reuse `clinic_settings` for that clinic.
4. Create or reuse inactive provider placeholder shells.
5. Create or reuse inactive planned sterilizer shells.
6. Create or reuse inactive planned workstation shells.
7. Create or reuse inactive planned hardware shells.
8. Validate logical assignment targets.
9. Create or reuse inactive planned hardware assignment rows.
10. Resolve planned assignments to durable ids in memory only.
11. Assess deployment activation readiness.
12. Build a deterministic controlled activation plan without executing it.

The activation plan is the contract for later execution and rollback slices. This foundation creates no Supabase repository, SQL migration, setup action wiring, UI, activation, hardware binding, resolved-id persistence, agent registration, deployment finalization, rollback execution, or `DeploymentEngine.execute()` change.
## RC8 Slice 1B Activation Plan Supabase Snapshot Sequence Boundary

RC8 Slice 1B does not change runtime ordering. It adds the read-only Supabase snapshot adapter that a future controlled activation plan stage can use after activation readiness:

1. Load the deployment run and clinic-owned source rows deterministically.
2. Preserve current shell, hardware binding, and assignment target state for drift comparison.
3. Leave activation-readiness evidence and planned-assignment resolution evidence external to the durable snapshot.
4. Return no persisted activation-plan identity because activation-plan persistence is not introduced in this slice.

The documented future order remains `deployment_run -> clinic_root -> clinic_settings -> provider_shells -> sterilizer_shells -> workstation_shells -> hardware_shells -> assignment_target_validation -> hardware_assignments -> planned_assignment_resolution -> deployment_activation_readiness -> controlled_activation_plan`. This slice adds no runtime registration, setup action wiring, UI evidence card, activation, hardware binding, deployment finalization, rollback execution, or `DeploymentEngine.execute()` change.## RC8 Slice 1C Runtime Controlled Activation Planning Sequence

Setup completion now appends a read-only controlled activation plan stage after activation readiness succeeds:

1. Persist or reuse `deployment_runs`.
2. Create or reuse the draft clinic root and link `deployment_runs.clinic_id`.
3. Create or reuse `clinic_settings` for that clinic.
4. Create or reuse inactive provider placeholder shells.
5. Create or reuse inactive planned sterilizer shells.
6. Create or reuse inactive planned workstation shells.
7. Create or reuse inactive planned hardware shells.
8. Validate logical assignment targets.
9. Create or reuse inactive planned hardware assignment rows.
10. Resolve planned assignments to durable ids in memory only.
11. Assess deployment activation readiness from durable rows plus fresh validation and resolution evidence.
12. Build a deterministic controlled activation plan when readiness is ready.

Blocked or error readiness skips activation planning. Blocked or error planning preserves every upstream durable record and returns structured evidence only. The runtime does not persist activation plans, execute plan items, activate records, bind hardware, finalize deployment runs, register agents, implement rollback, or change `DeploymentEngine.execute()`.## RC8 Slice 1D Controlled Activation Execution Foundation Sequence

The documented future order now extends to controlled activation execution:

`deployment_run -> clinic_root -> clinic_settings -> provider_shells -> sterilizer_shells -> workstation_shells -> hardware_shells -> assignment_target_validation -> hardware_assignments -> planned_assignment_resolution -> deployment_activation_readiness -> controlled_activation_plan -> controlled_activation_execution`

This slice does not wire a runtime stage. It defines the future execution boundary that will consume an approved controlled activation plan, verify dependency integrity and current durable state, and return pre-execution session evidence. Actual activation, hardware binding, deployment finalization, execution persistence, rollback execution, workers, polling, streaming, and `DeploymentEngine.execute()` remain outside this foundation.
## RC8 Slice 1E Activation Execution Supabase Snapshot Sequence Boundary

RC8 Slice 1E does not change runtime ordering. It adds the read-only Supabase adapter that a future controlled activation execution stage can use after a ready controlled activation plan:

1. Load the deployment run and current durable source rows deterministically.
2. Return compact current-state snapshots for clinic, planned shells, hardware binding proposals, hardware assignment finalization, and deployment-run finalization.
3. Report no existing execution session because no execution persistence table is introduced in this slice.
4. Leave rollback capability as unsupported schema evidence only.

The documented future order remains `deployment_run -> clinic_root -> clinic_settings -> provider_shells -> sterilizer_shells -> workstation_shells -> hardware_shells -> assignment_target_validation -> hardware_assignments -> planned_assignment_resolution -> deployment_activation_readiness -> controlled_activation_plan -> controlled_activation_execution`. This slice adds no runtime registration, setup action wiring, UI evidence, activation, binding, deployment finalization, execution rows, rollback execution, workers, polling, streaming, or `DeploymentEngine.execute()` change.

## RC8 Slice 1F Runtime Activation Execution Preparation Sequence

Setup completion now appends the final pre-execution safety stage after a ready controlled activation plan:

1. Persist or reuse `deployment_runs`.
2. Create or reuse the draft clinic root and link `deployment_runs.clinic_id`.
3. Create or reuse `clinic_settings` for that clinic.
4. Create or reuse provider shells.
5. Create or reuse sterilizer shells.
6. Create or reuse workstation shells.
7. Create or reuse hardware shells.
8. Validate logical assignment targets.
9. Create or reuse planned hardware assignments.
10. Resolve planned assignments to durable ids in memory only.
11. Assess deployment activation readiness from durable rows plus fresh validation and resolution evidence.
12. Build a deterministic controlled activation plan when readiness is ready.
13. Prepare controlled activation execution from the approved plan and live read-only snapshot.

The runtime order is now `deployment_run -> clinic_root -> clinic_settings -> provider_shells -> sterilizer_shells -> workstation_shells -> hardware_shells -> assignment_target_validation -> hardware_assignments -> planned_assignment_resolution -> deployment_activation_readiness -> controlled_activation_plan -> controlled_activation_execution_preparation`.

Execution preparation is not activation. It creates no execution rows, executes no plan items, writes no bindings, changes no provisioning status, finalizes no deployment run, performs no rollback, and does not change `DeploymentEngine.execute()`.

## RC8 Slice 1G Execution Drift Contract Alignment

The runtime order remains unchanged: `controlled_activation_plan -> controlled_activation_execution_preparation`. The handoff now uses one canonical current-state contract for both the activation plan and the live execution snapshot.

Execution preparation verifies the pre-execution state of clinic, planned provider/sterilizer/workstation/hardware shells, proposed hardware bindings, planned hardware assignments, and deployment-run finalization with safety-relevant fields only. Proposed binding items compare against the pre-binding durable state, so unbound hardware with a still-valid planned target does not falsely require an existing operational binding.

A true durable change still stops the sequence with `state_drift_detected`. Representation differences, omitted presentation fields, or property ordering no longer create false blockers. The stage remains read-only and still performs no activation, binding, execution persistence, rollback, deployment finalization, or `DeploymentEngine.execute()` change.

## RC8 Slice 2A Durable Execution Persistence Foundation Sequence

A future `activation_execution_persistence` stage is documented after execution preparation:

1. Persist or reuse `deployment_runs`.
2. Create or reuse the draft clinic root and link `deployment_runs.clinic_id`.
3. Create or reuse `clinic_settings`.
4. Create or reuse provider shells.
5. Create or reuse sterilizer shells.
6. Create or reuse workstation shells.
7. Create or reuse hardware shells.
8. Validate assignment targets.
9. Create or reuse planned hardware assignments.
10. Resolve planned assignments to durable ids in memory only.
11. Assess deployment activation readiness.
12. Build a deterministic controlled activation plan.
13. Prepare controlled activation execution from the approved plan and live read-only snapshot.
14. Persist prepared execution-session and execution-item evidence before any future mutation.

This slice does not add the runtime stage, SQL tables, Supabase persistence, ownership locks, execution claims, activation, hardware binding, rollback execution, dashboard unlock, workers, streaming, or `DeploymentEngine.execute()` changes. It defines the immutable prepared evidence that a later schema and repository slice must make durable.

## RC8 Slice 2B Activation Execution Persistence Schema Sequence

The future order remains `controlled_activation_execution_preparation -> activation_execution_persistence`. Slice 2B adds the schema and repository needed by that future stage, but it does not register the stage in setup completion.

When wired later, successful ready execution preparation can create or reuse one prepared execution session and its prepared execution items. The durable rows will be idempotency and ownership evidence before any later controlled executor may claim work. The rows themselves do not authorize activation and do not execute plan items.

No runtime action, UI, SQL application confirmation, ownership claim, running state, attempt update, activation, binding, deployment finalization, rollback execution, worker, polling, streaming, or `DeploymentEngine.execute()` change is included in this slice.

## RC8 Slice 2C Runtime Prepared Execution Persistence Sequence

Setup completion now appends durable prepared execution persistence after successful activation execution preparation:

`deployment_run -> clinic_root -> clinic_settings -> provider_shells -> sterilizer_shells -> workstation_shells -> hardware_shells -> assignment_target_validation -> hardware_assignments -> planned_assignment_resolution -> deployment_activation_readiness -> controlled_activation_plan -> controlled_activation_execution_preparation -> activation_execution_persistence`

The new stage persists prepared execution evidence only into `public.deployment_activation_execution_sessions` and `public.deployment_activation_execution_items`. Sessions remain `prepared`; items remain `ready` or `pending`; ownership, leases, attempts, execution timestamps, activation, hardware binding, rollback, dashboard unlock, deployment finalization, and `DeploymentEngine.execute()` remain unchanged.

Prepared persistence is retry-safe. A retry reuses compatible immutable session and item evidence, partial durable item state creates only missing compatible items, and conflicts are reported without repair or overwrite. Future execution claiming must verify the session exists, every expected item exists, no item conflict exists, and persisted item count matches session evidence before any ownership claim or mutation.

## RC8 Slice 3A Activation Execution Claim Assessment Foundation

A future claim assessment stage is documented after prepared execution persistence:

`activation_execution_persistence -> activation_execution_claim_assessment -> future durable ownership claim`

Slice 3A is TypeScript-only and performs no runtime wiring. It answers whether a prepared activation execution session can be safely claimed by one executor without allowing concurrent execution. The service checks session identity, prepared lifecycle, ownership/lease shape, bounded lease duration, item completeness, dependency readiness, and existing lease state, then returns proposal evidence only.

No ownership is persisted, no token is stored, no lease is written, no session status changes, no item starts, no attempts increment, no activation or binding occurs, and `DeploymentEngine.execute()` remains unchanged. Active leases owned by another executor block concurrent claim proposals. Expired leases are only reclaimable when session and item evidence remain untouched and complete. A future Slice 3B should add Supabase schema preflight and an atomic ownership repository; actual activation remains prohibited.

## RC8 Slice 3B Atomic Activation Execution Claim Boundary

The future sequence now extends the ownership boundary as:

`activation_execution_persistence -> activation_execution_claim_assessment -> atomic_activation_execution_claim`

Claim assessment remains the policy layer. The atomic Supabase RPC is the compare-and-set mutation boundary that locks the prepared execution session row, rechecks critical lifecycle and item-completeness predicates, and writes ownership only when the row still matches the assessed state. `claimed` means exclusive ownership only; it does not mean running, does not start any item, and does not authorize activation by itself.

Fresh claims require an unowned `prepared` session. Same-owner checks are idempotent and do not extend the lease or issue a new token. Active competing leases return conflict. Expired reclaim requires untouched execution evidence plus stale-owner/token/lease compare-and-set values. The next slice may wire server composition for claim assessment plus atomic claim, still without starting execution items.

## RC8 Slice 3C Runtime Atomic Activation Execution Claim Sequence

Setup completion now appends the ownership claim boundary after prepared execution persistence:

`deployment_run -> clinic_root -> clinic_settings -> provider_shells -> sterilizer_shells -> workstation_shells -> hardware_shells -> assignment_target_validation -> hardware_assignments -> planned_assignment_resolution -> deployment_activation_readiness -> controlled_activation_plan -> controlled_activation_execution_preparation -> activation_execution_persistence -> activation_execution_claim_assessment -> atomic_activation_execution_claim -> stop`

The claim stage runs only when prepared execution persistence is complete and compatible. Fresh unowned sessions are atomically claimed. Verify / Reuse with the stable setup claimant reuses same-owner active ownership without replacing the token or extending the lease. Expired reclaim uses stale owner/token/lease evidence as compare-and-set inputs and succeeds only if session and item evidence remain untouched.

A skipped, blocked, conflicted, or errored claim preserves all upstream durable evidence and starts no execution. Claimed means exclusive ownership only; no item starts, no attempts increment, no activation, binding, assignment finalization, rollback, worker, queue, polling, streaming, dashboard unlock, deployment finalization, or `DeploymentEngine.execute()` change is introduced.

A subsequent Verify / Reuse may pass through activation execution persistence with an existing compatible `claimed` session. That pass-through is not a new claim and does not alter owner, token, lease, lifecycle timestamps, or items; it only allows the following claim assessment/RPC stage to return same-owner `already_owned`.

## RC8 Slice 4A Execution Start Assessment Sequence

The documented execution-control sequence now extends to:

`prepared execution persistence -> atomic ownership claim -> execution-start assessment -> future atomic session start -> future item execution`

Slice 4A adds only the TypeScript assessment for the `execution-start assessment` step. It reads a future repository snapshot and returns `startable`, `already_started`, `blocked`, `conflict`, or `error` evidence. `startable` proposes a future session-only transition to `running`; it does not write `execution_status`, set `started_at`, start items, increment attempts, activate records, bind hardware, finalize deployment, or execute rollback.

The boundary keeps three concepts separate: `claimed` is exclusive ownership, `running` is a future session lifecycle transition, and first-item execution is a later item-level boundary. Same-owner running sessions may return `already_started` evidence when the token and lease still match, but no resume or item execution is performed.

## RC8 Slice 4B - Execution Start Boundary

The planned execution lifecycle now has a prepared Supabase start boundary after the atomic claim boundary:

1. Prepared activation execution persistence
2. Atomic ownership claim
3. Execution start assessment
4. Atomic session start through `public.start_deployment_activation_execution_session`
5. Future first-item execution start

Step 4 is session-only. It transitions a claimed, ready, actively leased session to `running` and writes `started_at` only after item-integrity verification. It does not start the first item and is not wired into setup runtime in this slice.

## RC8 Slice 4C - Runtime Start Sequence

The runtime execution-control sequence is now:

1. Prepared activation execution persistence
2. Atomic ownership claim
3. Execution-start assessment
4. Atomic execution-session start
5. Future first-item execution start

Step 4 runs only after a successful claim result (`claimed`, `already_owned`, or `reclaimed`). Claim `blocked`, `conflict`, `error`, or `not_attempted` leaves execution start as `not_attempted`. Start `started` means the session row is running; start `already_started` means the same owner/token running session was reused. Neither state starts the first execution item.

## RC8 Slice 5A - Execution Item Start Assessment Sequence

The documented execution-control sequence now extends to:

1. Prepared activation execution persistence
2. Atomic ownership claim
3. Atomic execution-session start
4. Execution item-start assessment
5. Future atomic execution item start
6. Future activation action execution

Slice 5A adds only the TypeScript assessment for step 4. It reads a future repository snapshot and returns `startable`, `already_started`, `blocked`, `conflict`, `not_found`, or `error` evidence. `startable` proposes the next deterministic ready item but performs no item mutation, attempt increment, activation, hardware binding, dependency unlock, deployment finalization, rollback, runtime registration, UI update, worker, queue, polling, streaming, or `DeploymentEngine.execute()` change.

The boundary preserves the lifecycle separation: `claimed` means ownership, `running` means the execution session has started, and item start is a later item-level boundary. A single already-running item may be reported as `already_started` only when the same owner/token/lease session evidence is still valid and the item belongs to the same session.

## RC8 Slice 5B - Atomic Execution Item Start Boundary Sequence

The planned execution-control sequence now extends to:

1. Prepared activation execution persistence
2. Atomic ownership claim
3. Atomic execution-session start
4. Execution item-start assessment
5. Atomic execution item start through `public.start_deployment_activation_execution_item`
6. Future activation action execution

Slice 5B adds the repository and SQL boundary for step 5 only. The atomic RPC may transition exactly one selected item from `ready` to `running`, increment its attempt count from 0 to 1, and set its start timestamp after locking the session and item and rechecking ownership, lease, item identity, item-integrity, duplicate, and dependency evidence.

No runtime setup action is wired in this slice. The boundary does not activate any entity, bind hardware, unlock dependents, mark items succeeded or failed, complete the session, finalize deployment, renew leases, rotate tokens, heartbeat, rollback, add workers, add queues, poll, stream, or change `DeploymentEngine.execute()`.

## RC8 Slice 5C - Runtime Atomic Execution Item Start Sequence

Setup completion now extends the live execution-control sequence to:

1. Prepared activation execution persistence
2. Atomic ownership claim
3. Atomic execution-session start
4. Atomic execution item start
5. Future activation action execution

Step 4 runs only when step 3 returns `started` or `already_started`. It loads the item-start snapshot, assesses same-owner active-lease item-start safety, and calls `public.start_deployment_activation_execution_item` only for a `startable` item. `already_started` returns reuse evidence without a second RPC mutation.

The setup response and Complete page show item-start evidence separately from session-start evidence. `started` means the first execution item is running under exclusive ownership; it does not mean the item action executed. No dependency progression, entity activation, binding write, rollback, finalization, background worker, polling, streaming, activation button, or `DeploymentEngine.execute()` change is introduced.

## RC8 Slice 6A - Clinic Activation Action Assessment Sequence

The documented execution-control sequence now extends to:

1. Prepared activation execution persistence
2. Atomic ownership claim
3. Atomic execution-session start
4. Atomic execution item start
5. Clinic activation action assessment
6. Future atomic clinic activation

Slice 6A adds only the TypeScript assessment for step 5. It answers whether the currently running sequence-1 clinic activation item may safely propose the clinic transition from canonical draft state to { deploymentStatus: deployed }. The assessment checks session ownership, token, lease, lifecycle timestamps, item identity/lifecycle, dependency absence, clinic deployment ownership, planned inactive provisioning evidence, archival/deletion state, and canonical expected-current-state equality.

activation_ready is proposal evidence only. already_activated is deterministic reuse evidence only. Neither status activates the clinic, marks the item succeeded, unlocks dependencies, starts another item, mutates shells, writes bindings, finalizes deployment, performs rollback, adds runtime wiring, creates SQL, or changes DeploymentEngine.execute().

## RC8 Slice 6B - Atomic Clinic Activation Boundary Sequence

The planned execution-control sequence now extends to:

1. Prepared activation execution persistence
2. Atomic ownership claim
3. Atomic execution-session start
4. Atomic execution item start
5. Clinic activation action assessment
6. Atomic clinic activation through `public.activate_deployment_clinic`
7. Future item completion and dependency progression

Slice 6B adds the repository and SQL boundary for step 6 only. The SQL may mutate only the clinic activation fields corresponding to `{ deploymentStatus: deployed }`: `clinics.deployment_status` and, on first activation only, `clinics.deployed_at`. It does not complete the running clinic item, unlock the next item, mutate the execution session, activate downstream shells or hardware, write bindings, finalize deployment, rollback, or change runtime ordering.

No setup action is wired in this slice. Runtime will need a later slice to call the 6A assessment and then this atomic RPC while preserving token secrecy and all compare-and-set evidence.

## RC8 Slice 6C - Runtime Atomic Clinic Activation Sequence

Setup completion now extends the live execution-control sequence to:

1. Prepared activation execution persistence
2. Atomic ownership claim
3. Atomic execution-session start
4. Atomic execution item start
5. Atomic clinic activation
6. Future item completion and dependency progression

Step 5 runs only when step 4 returns `started` or `already_started`. It loads the clinic activation snapshot, assesses same-owner active-lease clinic activation safety, and calls `public.activate_deployment_clinic` only for `activation_ready`. `already_activated` returns reuse evidence without a second clinic mutation.

The setup response and Complete page show clinic activation separately from item start. `activated` means the clinic row deployment status is deployed, but the sequence-1 execution item is still running. It does not mean item completion, dependency progression, shell activation, hardware binding, rollback, deployment finalization, background execution, polling, streaming, activation buttons, or `DeploymentEngine.execute()` changes.

## RC8 Slice 7A - Activation Execution Item Completion Foundation Sequence

The planned execution-control sequence now extends to:

1. Prepared activation execution persistence
2. Atomic ownership claim
3. Atomic execution-session start
4. Atomic execution item start
5. Atomic clinic activation
6. Activation execution item completion assessment
7. Future atomic item completion and dependency progression

Slice 7A implements step 6 as read-only TypeScript. It assesses whether the sequence-1 clinic activation item may be completed after the clinic row has already reached `deployment_status = deployed` with `deployed_at`. The service returns `completable`, `already_completed`, `blocked`, `conflict`, `not_found`, or `error` evidence and keeps all downstream counters at zero.

No runtime order changes are made in this slice. It does not update the execution item, write `completed_at`, unlock dependent items, activate downstream entities, bind hardware, finalize deployment, create SQL, add a Supabase repository, wire setup actions, or change `DeploymentEngine.execute()`.

## RC8 Slice 7B - Runtime Atomic Item Completion Sequence

Setup completion now extends the live execution-control sequence to:

1. Prepared activation execution persistence
2. Atomic ownership claim
3. Atomic execution-session start
4. Atomic execution item start
5. Atomic clinic activation
6. Atomic activation execution item completion
7. Future dependency progression

Step 6 runs only after clinic activation returns `activated` or `already_activated`. It loads the item-completion snapshot, reassesses the same-owner active-lease sequence-1 clinic activation item, and calls `public.complete_deployment_activation_execution_item` only for a `completable` item. `already_completed` returns reuse evidence without rewriting `completed_at`, ownership, lease, started timestamp, or attempt count.

A successful fresh pass updates only the running clinic execution item to `execution_status = succeeded` and writes `completed_at`. It does not unlock dependencies, start provider activation, mutate later items, complete the execution session, renew leases, rotate tokens, activate shells or hardware, write bindings, finalize deployment, rollback, add workers, or change `DeploymentEngine.execute()`.

## RC8 Slice 8A - Dependency Progression Assessment Sequence

The planned execution-control sequence now extends to:

1. Prepared activation execution persistence
2. Atomic ownership claim
3. Atomic execution-session start
4. Atomic execution item start
5. Atomic clinic activation
6. Atomic activation execution item completion
7. Dependency progression assessment foundation
8. Future atomic pending-to-ready transition

Slice 8A adds only the TypeScript assessment for step 7. It reads a future repository snapshot for the running execution session and all durable execution items, verifies same-owner active-lease evidence, validates the contiguous succeeded prefix, and determines whether exactly one deterministic next pending item can be proposed for transition to ready.

This slice does not write item status, mark any item ready, start the next item, activate providers, renew leases, rotate tokens, execute rollback, complete the session, finalize deployment, add workers, poll, stream, modify setup actions, or change `DeploymentEngine.execute()`.

## RC8 Slice 8B - Atomic Dependency Progression Boundary Sequence

The planned execution-control sequence now extends to:

1. Prepared activation execution persistence
2. Atomic ownership claim
3. Atomic execution-session start
4. Atomic execution item start
5. Atomic clinic activation
6. Atomic activation execution item completion
7. Dependency progression assessment
8. Atomic dependency progression SQL boundary
9. Future next-item start

Slice 8B adds the repository and SQL boundary for step 8 only. The future runtime will call it only after a successful dependency progression assessment. A fresh progression can mark exactly one deterministic next item `ready`; `already_progressed` reports deterministic reuse when that item is already ready.

No setup action is wired in this slice. It does not start the next item, activate providers or downstream entities, increment attempts, write item timestamps, mutate dependencies, complete sessions, finalize deployment, rollback, add workers, poll, stream, modify UI, or change `DeploymentEngine.execute()`.

## RC8 Slice 8C - Runtime Atomic Dependency Progression Sequence

Setup completion now extends the live execution-control sequence to:

1. Prepared activation execution persistence
2. Atomic ownership claim
3. Atomic execution-session start
4. Atomic execution item start
5. Atomic clinic activation
6. Atomic activation execution item completion
7. Atomic dependency progression
8. Future next-item start

Step 7 runs only after item completion returns `completed` or `already_completed`. It loads the dependency-progression snapshot, reassesses same-owner active-lease dependency safety, and calls `public.progress_deployment_activation_execution_dependency` only for `progressable` evidence. `already_progressed` returns reuse evidence without a second RPC mutation.

A successful fresh pass updates only the deterministic next execution item from `pending` to `ready`. It does not start that item, increment attempts, write item execution timestamps, activate providers or downstream entities, bind hardware, complete the execution session, renew leases, rotate tokens, finalize deployment, rollback, add workers, poll, stream, or change `DeploymentEngine.execute()`.

## RC8 Slice 9A - Next Execution Item Start Assessment Sequence

The planned execution-control sequence now extends to:

1. Prepared activation execution persistence
2. Atomic ownership claim
3. Atomic execution-session start
4. Atomic sequence-1 execution item start
5. Atomic clinic activation
6. Atomic sequence-1 execution item completion
7. Atomic dependency progression
8. Next execution-item start assessment foundation
9. Future atomic next-item start

Slice 9A implements step 8 as read-only TypeScript. It assesses whether the single deterministic ready item, currently expected to be sequence 2 provider shell activation after sequence 1 succeeds, can safely be proposed for a future ready-to-running transition. It also returns `already_started` evidence when the same deterministic item is already running with compatible ownership, lease, attempt, timestamp, and downstream item integrity evidence.

No runtime order changes are made in this slice. It does not update item status, increment attempts, write `started_at`, activate providers or other entities, progress dependencies, complete the execution session, create SQL, add a Supabase repository, wire setup actions, modify UI/support mail, or change `DeploymentEngine.execute()`.

## RC8 Slice 9B - Atomic Next Execution Item Start Boundary Sequence

The planned execution-control sequence now extends to:

1. Prepared activation execution persistence
2. Atomic ownership claim
3. Atomic execution-session start
4. Atomic sequence-1 execution item start
5. Atomic clinic activation
6. Atomic sequence-1 execution item completion
7. Atomic dependency progression
8. Next execution-item start assessment
9. Atomic next execution-item start SQL boundary
10. Future entity activation

Slice 9B adds the repository and SQL boundary for step 9 only. The future runtime will call it only after a successful next-item start assessment. A fresh start can transition exactly one deterministic next item from `ready` to `running`, increment its attempt count once, and write its `started_at`. `already_started` reports deterministic reuse when that same item is already running with compatible ownership, lease, attempt, timestamp, dependency, and item-integrity evidence.

No setup action is wired in this slice. It does not activate providers or downstream entities, complete the item, progress another dependency, mutate sessions, renew leases, rotate tokens, finalize deployment, rollback, add workers, poll, stream, modify UI/support mail, or change `DeploymentEngine.execute()`.

### RC8 Slice 9C - Runtime Next Item Start

The runtime sequence now appends ctivation_execution_next_item_start immediately after successful dependency progression. The stage may atomically transition one deterministic ready execution item to running, preserving the running session, owner, token, and lease evidence. It does not activate the provider/entity, complete the item, progress another dependency, finalize the session, renew leases, rotate tokens, or invoke DeploymentEngine.execute().

## RC8 Slice 10A - Provider Shell Activation Assessment Sequence

The planned execution-control sequence now extends to:

1. Prepared activation execution persistence
2. Atomic ownership claim
3. Atomic execution-session start
4. Atomic sequence-1 execution item start
5. Atomic clinic activation
6. Atomic sequence-1 execution item completion
7. Atomic dependency progression
8. Atomic next execution-item start
9. Provider shell activation assessment foundation
10. Future atomic provider shell activation

Slice 10A implements step 9 as read-only TypeScript. It assesses whether the single currently running provider-shell activation item can safely propose a future provider shell activation, or whether the provider is already activated with compatible evidence. The assessment checks same-owner active-lease session evidence, running item identity and lifecycle, clean prior succeeded prefix, later-item immutability, duplicate-free execution identities, same-clinic provider identity, setup-draft placeholder semantics, inactive planned/placeholder provider state, and already-active reuse state.

No runtime order changes are made in this slice. It does not update provider rows, complete the running item, progress dependencies, start later items, bind hardware, create SQL, add a Supabase repository, wire setup actions, modify UI/support mail, perform rollback, add workers, or change `DeploymentEngine.execute()`.
