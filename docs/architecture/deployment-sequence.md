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
