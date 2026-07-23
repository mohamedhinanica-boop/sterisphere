# Authoritative baseline owner resolution

## Resolution status

The owner approved all 15 architecture groups:

- 6 `APPROVE_RECOMMENDATION`;
- 9 `APPROVE_WITH_REFINEMENT`;
- 0 pending, deferred, rejected, or revision-required groups.

All 76 Phase 10.5B decisions remain mapped exactly once. All 15 groups are
ready to inform authoritative baseline generation. Readiness means the target
schema is defined; it does not waive application, data, security, Staging, or
Production-migration gates.

## APPROVAL-001 — Tenant identity and clinic membership model

**Final status:** `APPROVE_WITH_REFINEMENT`  
**Decisions:** `AUTH-001`

The authoritative model uses two distinct authorities:

1. a global platform-operator authority keyed to `auth.users.id`, containing
   the global `super_admin` role for the platform owner and authorized
   technicians; and
2. clinic memberships keyed to both `auth.users.id` and `clinics.id`, carrying
   clinic-scoped `admin`, `clinical_staff`, `doctor`, or `auditor` roles.

A user may belong to multiple clinics and hold different roles in each.
Email remains contact/profile data, never the authorization key. Memberships
need invitation/activation/suspension/revocation lifecycle state, timestamps,
audit actors, and auditable changes. A nullable clinic membership must not be
used to represent a global operator.

Required objects/services, without implementation:

- an application-owned global operator table;
- an application-owned clinic membership table and constraints;
- membership-policy lookup functions or equivalent normalized predicates;
- a server authorization-context resolver;
- audited membership administration and invitation-acceptance services;
- controlled, one-time, audited first-super-admin bootstrap;
- last-global-admin protection and break-glass recovery;
- atomic or recoverably idempotent clinic plus initial-admin creation.

Production currently has only email-keyed `user_roles`, so schema, data, policy,
and application migrations are required. Existing records must be mapped to a
global operator or explicit clinic membership; clinic scope must never be
guessed. Baseline generation is ready.

## APPROVAL-002 — Anonymous and PUBLIC access removal

**Final status:** `APPROVE_RECOMMENDATION`  
**Decisions:** `AUTH-002`

No anonymous principal may directly access SteriSphere application tables.
Browsers require an authenticated session and valid authorization. Trusted
server operations may use service role only behind explicit caller
authorization. Any future public workflow must use a narrow server/API
boundary.

This tightens current Production PUBLIC policies and can break anon-key browser
queries. Before release, inventory every browser Supabase query and define
authentication for shared workstations, scanners, kiosks, onboarding, and
clinical flows. Tests must prove anonymous denial across all application
tables while Supabase Auth login remains functional. Baseline generation is
ready; application compatibility and Production policy rollout remain gates.

## APPROVAL-003 — Role authorization and privilege administration

**Final status:** `APPROVE_WITH_REFINEMENT`  
**Decisions:** `RLS-025`, `RLS-026`, `RLS-027`

Role and membership changes use audited server authorization operations.
Global `super_admin` manages platform operators and clinic memberships.
Clinic `admin` manages only permitted memberships in assigned active clinics
and cannot grant `super_admin`. Assignment, removal, invitation acceptance,
suspension, reactivation, and revocation emit audit evidence.

Direct PUBLIC role administration and current browser mutations must be
removed. Required work includes server membership services, bounded delegation
UI, authorization tests, last-admin safeguards, and break-glass documentation.
Production role records require reviewed mapping before migration. Baseline
generation is ready.

## APPROVAL-004 — Patient and traceability access

**Final status:** `APPROVE_WITH_REFINEMENT`  
**Decisions:** `RLS-015`–`RLS-018`

Every ordinary patient belongs to exactly one clinic. Every trace uses the
same clinic as its patient and pack/cycle evidence. Authorized clinic members
and trusted server workflows receive clinic-scoped access. Global technical
support uses audited `super_admin` access.

Historical ownership must not be guessed. A read-only preflight must classify:

- resolvable rows with consistent clinic evidence;
- missing ownership;
- conflicting patient/pack/cycle ownership;
- orphan relationships;
- cross-clinic relationships;
- ambiguous rows requiring quarantine or explicit owner resolution.

The quarantine record must identify the row, evidence, reason, review status,
and resolution without exposing it through ordinary clinic policies. No strict
non-null/FK/policy enforcement occurs before resolution. Patient/import/trace,
history, pack detail, and report flows require trusted clinic context.
Baseline generation is ready; data resolution and application/security work
remain release and migration gates.

## APPROVAL-005 — Cycle, load, and pack access

**Final status:** `APPROVE_WITH_REFINEMENT`  
**Decisions:** `RLS-006`–`RLS-014`

Every cycle has one clinic. Load items and generated packs derive ownership
from durable cycle/deployment context, not client input. Reads and writes are
clinic-scoped. Trusted server workflows may generate packs and perform state
transitions only after caller authorization.

A read-only preflight must identify cycles, load items, and packs with missing,
orphaned, nullable, or conflicting ownership. Ambiguous rows need explicit
resolution or quarantine before tenant constraints. CycleWizard, pack
generation/review, inventory, dashboard, and investigation workflows require
membership-aware access or server boundaries. Baseline generation is ready.

## APPROVAL-006 — Deployment and setup authorization

**Final status:** `APPROVE_WITH_REFINEMENT`  
**Decisions:** `RLS-003`–`RLS-005`, `RLS-019`–`RLS-024`

Only global `super_admin` creates a clinic tenant or new clinic deployment.
Clinic `admin` may manage permitted settings for active assigned clinics only.
Every service-role setup/deployment operation requires authenticated caller
authorization and durable target-clinic scope checks. Client clinic IDs are
assertions, not authorization. Deployment remains idempotent and auditable.

Current evidence identifies a missing gate:
`app/setup/actions.ts::persistDeploymentRunAction` validates the draft and
session identifier, then reads `SUPABASE_SERVICE_ROLE_KEY` and constructs the
service client. It contains no `auth.getUser()`, global-operator check, clinic
membership check, or equivalent caller authorization first.

Required application work:

- resolve the authenticated caller before service-client construction;
- distinguish global new-clinic creation from existing-clinic administration;
- verify global operator or active clinic-admin authority from durable records;
- carry trusted caller/clinic authorization evidence into audit records;
- reject unauthenticated, forged-clinic, non-member, and cross-clinic calls.

Production policy alignment must precede release of membership-dependent setup.
Baseline generation is ready.

## APPROVAL-007 — RPC and service-role execution

**Final status:** `APPROVE_RECOMMENDATION`  
**Decisions:** `RPC-001`–`RPC-017`

All 17 runtime RPCs remain server-side service-role operations. PUBLIC, anon,
and authenticated execute privileges are removed unless a separately approved
need exists. Functions use trusted search paths and validate clinic, run,
session, item, entity, target, ownership, lease, and idempotency state from
durable rows rather than trusting `p_clinic_id`.

The Phase 10.5C finding is reconfirmed: all non-test `.rpc()` calls occur in
deployment Supabase repositories; no browser `.rpc()` call exists. RPC call
sites do not require redesign, but the setup caller gate in APPROVAL-006 is
mandatory. Positive and negative tests cover all 17 RPCs, cross-clinic input,
execute denial, stale lease/token, replay, malformed data, and concurrency.
Baseline generation is ready.

## APPROVAL-008 — Trigger-helper permissions

**Final status:** `APPROVE_RECOMMENDATION`  
**Decisions:** `RPC-H01`–`RPC-H08`

The eight timestamp helpers remain trigger-only invoker infrastructure with
trusted search paths. Direct anon/browser execution is prohibited while live
trigger attachments and `NEW` timestamp behavior are preserved. Production
receives forward ACL/search-path corrections only where normalized comparison
shows drift. Baseline generation is ready.

## APPROVAL-009 — Patient external-ID uniqueness

**Final status:** `APPROVE_WITH_REFINEMENT`  
**Decisions:** `UNIQUE-001`

External patient IDs are not global. Prefer a normalized
patient-external-identifier mapping with:

- clinic ownership;
- durable SteriSphere patient ID;
- source-system type;
- external patient ID;
- optional durable source-instance/connection ID;
- lifecycle/status;
- integration metadata.

The uniqueness boundary is clinic + source instance + external patient ID, or
clinic + source system + external patient ID when only one instance can exist.
Patients without an external system need no mapping.

This avoids coupling the core patient to one vendor and supports future
AbelDent or other practice-management integrations. A future connector may
resolve the mapping and associate note delivery/retry/failure/audit evidence
with durable identities. This phase does not design a connector, API client,
outbox, note synchronization, or delivery schema.

Before Production enforcement, inventory external-ID duplicates, nulls,
source systems/instances, and clinic ownership. Migrate only verified
identities, then retire or relax duplicate global constraints. Baseline
generation is ready.

## APPROVAL-010 — Provider and sterilizer uniqueness

**Final status:** `APPROVE_WITH_REFINEMENT`  
**Decisions:** `UNIQUE-002`, `UNIQUE-003`

Provider and sterilizer names are never globally unique. Deployment keys are
immutable and clinic-scoped. Historical relations use durable IDs.

Safest archived-name rule: an archived/inactive record continues reserving its
normalized name within its clinic. This prevents ambiguous historical support,
accidental reactivation collisions, and name-based operator confusion. A
future explicit merge/rename/release operation may free a name; simple archival
does not. Cross-clinic identical names remain allowed.

Preflight must identify same-clinic normalized collisions across all lifecycle
states before index migration. Setup/settings validation must include clinic
and lifecycle. Baseline generation is ready with no remaining owner decision.

## APPROVAL-011 — Workstation ordering

**Final status:** `APPROVE_RECOMMENDATION`  
**Decisions:** `UNIQUE-004`

Use the Production-compatible non-unique `(display_order, name)` index. It
provides deterministic secondary ordering and creates no uniqueness rule.
No application change or intended Production migration is required. Baseline
generation is ready.

## APPROVAL-012 — Hardware, printer, and agent defaults

**Final status:** `APPROVE_WITH_REFINEMENT`  
**Decisions:** `HARDWARE-001`–`HARDWARE-005`

Source-of-truth boundaries are approved:

- database: durable hardware state, relationships, lifecycle invariants;
- deployment engine: idempotent planned defaults, templates, and target
  associations;
- application: display and user validation of product choices;
- environment/deployment configuration: endpoints, protocols, ports, secrets,
  agent locations, and local-mode enablement.

Planned/inactive rows may be incomplete; active rows must be operationally
valid. Loopback or private-network HTTP is accepted only in explicit local
deployment mode. Cloud/public mode never silently defaults to localhost or
arbitrary HTTP.

Before activation, document local-mode CIDR/hostname/protocol rules, endpoint
validation, configuration authority, and transition requirements. Inventory
invalid printer checks, localhost/private/HTTP URLs, and active incomplete
hardware. Application/environment support precedes Production default and
constraint migration. Baseline generation is ready because the ownership
model is defined; local activation rules remain an application-release gate.

## APPROVAL-013 — Platform and Supabase prerequisites

**Final status:** `APPROVE_RECOMMENDATION`  
**Decisions:** `PLATFORM-001`–`PLATFORM-006`

Supabase owns `auth`, `storage`, managed extensions, and platform roles. The
application baseline asserts compatible schemas, roles, auth helpers, and UUID
generation but never recreates platform internals. Referenced platform objects
remain explicit. Storage is excluded unless runtime evidence proves use.
Baseline generation is ready.

## APPROVAL-014 — Definition normalization

**Final status:** `APPROVE_RECOMMENDATION`  
**Decisions:** `NORMALIZE-001`–`NORMALIZE-007`

Use normalized Production-compatible evolved definitions. Ignore PostgreSQL
identifier truncation only when semantic definitions match. Genuine function,
RPC, index, constraint, trigger, default, ACL, or search-path differences
become explicit forward migrations. Superseded/history assets remain excluded
from executable baseline while retaining provenance. Exact normalized
definition and dependency validation is mandatory. Baseline generation is
ready.

## APPROVAL-015 — Audit access and tenant ownership

**Final status:** `APPROVE_WITH_REFINEMENT`  
**Decisions:** `RLS-001`, `RLS-002`

Ordinary audit events belong to one clinic. Global/system events may omit
clinic only when explicitly classified with a global/system scope; nullable
`clinic_id` alone never implies global scope. Trusted server/database paths
write audits. Clinic admin/auditor may read allowed clinic events, and global
super_admin has audited platform-wide support access.

Audit records preserve actor identity where available, explicit clinic/scope,
action, target/entity, timestamp, and relevant metadata. Service role must
still attribute logical tenant/scope.

A read-only historical preflight classifies events as clinic-owned,
explicitly global/system, or quarantined unknown. No ownership is guessed.
Audit writers/readers require scoped application services before Production
policy migration. Baseline generation is ready.

## Final readiness matrix

| Group | Final status | Baseline ready | App change | Data preflight | Security review | Production migration | Blocking unresolved architecture |
|---|---|---:|---:|---:|---:|---:|---|
| APPROVAL-001 | APPROVE_WITH_REFINEMENT | Yes | Yes | Yes | Yes | Yes | None |
| APPROVAL-002 | APPROVE_RECOMMENDATION | Yes | Yes | No | Yes | Yes | None |
| APPROVAL-003 | APPROVE_WITH_REFINEMENT | Yes | Yes | Yes | Yes | Yes | None |
| APPROVAL-004 | APPROVE_WITH_REFINEMENT | Yes | Yes | Yes | Yes | Yes | None |
| APPROVAL-005 | APPROVE_WITH_REFINEMENT | Yes | Yes | Yes | Yes | Yes | None |
| APPROVAL-006 | APPROVE_WITH_REFINEMENT | Yes | Yes | Yes | Yes | Yes | None |
| APPROVAL-007 | APPROVE_RECOMMENDATION | Yes | Yes | No | Yes | No* | None |
| APPROVAL-008 | APPROVE_RECOMMENDATION | Yes | No | No | Yes | Yes | None |
| APPROVAL-009 | APPROVE_WITH_REFINEMENT | Yes | Yes | Yes | Yes | Yes | None |
| APPROVAL-010 | APPROVE_WITH_REFINEMENT | Yes | Yes | Yes | No | Yes | None |
| APPROVAL-011 | APPROVE_RECOMMENDATION | Yes | No | No | No | No | None |
| APPROVAL-012 | APPROVE_WITH_REFINEMENT | Yes | Yes | Yes | Yes | Yes | None |
| APPROVAL-013 | APPROVE_RECOMMENDATION | Yes | No | No | Yes | No | None |
| APPROVAL-014 | APPROVE_RECOMMENDATION | Yes | No | No | Yes | No* | None |
| APPROVAL-015 | APPROVE_WITH_REFINEMENT | Yes | Yes | Yes | Yes | Yes | None |

`*` Production migration is conditional on normalized ACL/semantic drift.

## Gate classification

### Baseline-generation blockers

None. The target authoritative architecture is defined for all 15 groups.

### Application-release blockers

- membership/global-operator services and updated authorization consumers;
- secure bootstrap, invitation, role administration, and break-glass paths;
- authenticated replacements for anonymous browser workflows;
- patient/trace and cycle/load/pack clinic-context propagation;
- setup caller authorization before service-role construction;
- scoped audit write/read services;
- external-patient mapping usage in import/resolution;
- clinic-aware provider/sterilizer validation;
- explicit local deployment mode and device configuration ownership.

### Production-migration blockers

- reviewed user/role-to-membership mapping;
- patient/trace/cycle/load/pack/audit ownership preflights and quarantines;
- patient external-identity and provider/sterilizer collision inventories;
- hardware/default/check validation;
- approved forward migration and rollback/forward-correction plans;
- application compatibility deployed before restrictive policies;
- fresh authorized Production capture and normalized drift comparison.

### Staging-validation requirements

- empty-database baseline creation and deterministic manifest comparison;
- all role, membership, tenant, anon-denial, and bootstrap tests;
- all 17 RPC positive/negative/concurrency tests;
- trigger-helper regressions;
- patient/trace/cycle/pack ownership and quarantine fixtures;
- setup authorization and idempotency tests;
- external identity and uniqueness concurrency tests;
- local/cloud hardware configuration matrix;
- platform prerequisite and normalized-definition checks.

### Future-version considerations

- practice-management connectors such as AbelDent;
- patient resolution through normalized external identifiers;
- sterilization/traceability note generation and delivery;
- connector source-instance configuration;
- delivery retry/failure/audit evidence;
- explicit archived-name release/merge workflows;
- any proven narrow public/kiosk API.

These are compatibility considerations only. No connector, note
synchronization, outbox, API client, or vendor integration is designed or
implemented in this phase.

## Mandatory gates before Staging release

1. Generate and review the authoritative baseline separately.
2. Implement membership/global-operator and caller-authorization foundations.
3. Replace anonymous-dependent application flows.
4. Implement setup authorization before service-role client construction.
5. Implement tenant-context application changes and scoped audit services.
6. Define local-mode authentication and endpoint rules.
7. Pass the full Staging validation suite and manifest comparison.

## Mandatory gates before Production migration

1. Complete all read-only data/ownership/collision preflights.
2. Resolve or quarantine ambiguous records without guessing.
3. Deploy compatible application/server authorization first where required.
4. Take a fresh authorized Production schema capture and reconcile drift.
5. Prove forward migrations and rollback/forward-correction plans in Staging.
6. Approve the migration window and post-migration validation plan.

## Mandatory gates before Version 1.0 release

1. Complete both Staging-release and Production-migration gates.
2. Verify every role and cross-clinic security path.
3. Verify scanner/workstation/shared-device authentication.
4. Verify audit attribution, global support access, and break-glass recovery.
5. Verify deployment idempotency, recovery, and all RPC ACLs.
6. Remove or disable bootstrap-only capabilities after audited success.
7. Record final manifests, evidence, and owner sign-off.

READY_FOR_AUTHORITATIVE_BASELINE_GENERATION
