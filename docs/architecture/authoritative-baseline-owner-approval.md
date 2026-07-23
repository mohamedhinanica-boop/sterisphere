# Authoritative baseline owner approval package

## Purpose

This package reduces the 76 Phase 10.5B decisions to 15 owner approvals while
preserving exact traceability. It prepares approval only; it does not generate
SQL or authorize a database operation.

Authoritative detail remains in:

- `authoritative-baseline-decision-record.md`;
- `authoritative-baseline-decision-record.json`;
- immutable `authoritative-baseline-object-registry.json`.

Every decision ID has exactly one primary approval group. The companion JSON
contains the complete impact, preflight, tests, rollback consideration,
alternative, and owner fields. Every `ownerDecision` is `PENDING`.

Owner options for every group:

- `APPROVE_RECOMMENDATION`
- `REJECT_RECOMMENDATION`
- `DEFER`
- `REQUIRE_REVISION`

## Executive approval summary

| Group | Decisions | Highest risk | Recommendation | Production impact | Primary migration classification |
|---|---:|---|---|---|---|
| APPROVAL-001 Tenant identity/membership | 1 | Critical | Auth-user-linked clinic memberships | New schema/application model | `REQUIRES_APPLICATION_CHANGE_FIRST` |
| APPROVAL-002 Anonymous access removal | 1 | Critical | No anon application-table access | Tightens policies; may break browser flows | `REQUIRES_SECURITY_REVIEW_FIRST` |
| APPROVAL-003 Role administration | 3 | Critical | Server-managed scoped roles | Replaces PUBLIC role mutation | `REQUIRES_APPLICATION_CHANGE_FIRST` |
| APPROVAL-004 Patient/trace access | 4 | Critical | Clinic-scoped clinical access | New tenant keys/backfill/policies | `REQUIRES_SECURITY_REVIEW_FIRST` |
| APPROVAL-005 Cycle/load/pack access | 9 | Critical | Clinic/role-scoped workflow access | New ownership/backfill/policies | `REQUIRES_SECURITY_REVIEW_FIRST` |
| APPROVAL-006 Deployment/setup access | 9 | Critical | Admin reads/writes; trusted service deployment | Policy alignment required | `BASELINE_AND_PRODUCTION_MUST_ALIGN_BEFORE_RELEASE` |
| APPROVAL-007 Runtime RPC ACLs | 17 | High | Service-role only | Preserves current server path | `BASELINE_ONLY_NO_PRODUCTION_CHANGE` |
| APPROVAL-008 Trigger helpers | 8 | Medium | Trigger-only, fixed path, restricted direct execute | Later ACL normalization | `BASELINE_FIRST_PRODUCTION_MIGRATION_LATER` |
| APPROVAL-009 Patient external ID | 1 | Critical | Clinic/source-scoped uniqueness | Data/constraint migration | `REQUIRES_DATA_PREFLIGHT_FIRST` |
| APPROVAL-010 Provider/sterilizer uniqueness | 2 | High | Clinic-scoped active names/keys | Data/index migration | `REQUIRES_DATA_PREFLIGHT_FIRST` |
| APPROVAL-011 Workstation ordering | 1 | Medium | Production composite index | No Production change | `BASELINE_ONLY_NO_PRODUCTION_CHANGE` |
| APPROVAL-012 Hardware/defaults | 5 | High | Split DB/deployment/app/environment authority | Application first, then migration | `REQUIRES_APPLICATION_CHANGE_FIRST` |
| APPROVAL-013 Platform prerequisites | 6 | Critical | Assert Supabase platform; do not recreate it | No application schema change | `BASELINE_ONLY_NO_PRODUCTION_CHANGE` |
| APPROVAL-014 Definition normalization | 7 | High | Production-normalized evolved lineage | Migrate genuine differences only | `BASELINE_FIRST_PRODUCTION_MIGRATION_LATER` |
| APPROVAL-015 Audit ownership/access | 2 | Critical | Tenant-owned, server-written audit | Backfill/policy/application changes | `REQUIRES_SECURITY_REVIEW_FIRST` |

## Approval groups

### APPROVAL-001 — Tenant identity and clinic membership model

- Decisions: `AUTH-001`
- Current: `user_roles` maps a globally unique email to one role. It has no
  `auth.users` FK, clinic key, or membership rows.
- Recommend: auth-user-linked active clinic memberships; explicitly global
  `super_admin`; all other roles clinic-scoped.
- Why: the current database cannot enforce tenant membership.
- Impact: client role consumers require server-authoritative membership data.
  Historical roles need mapping.
- Migration: application change first; data preflight and security review also
  required.
- Preflight/tests: reconcile auth users to emails; identify orphan/duplicate
  roles; test zero/one/multiple clinics, disabled membership, cross-clinic
  denial, and global-admin auditing.
- Recovery: retain a reversible role mapping and audited break-glass owner
  path. Never restore PUBLIC role mutation.
- Codex recommendation: approve only with explicit bootstrap and migration
  mapping.
- Strongest alternative: JWT-only roles, which still need clinic membership
  and add claim-staleness risk.

### APPROVAL-002 — Anonymous and PUBLIC access removal

- Decisions: `AUTH-002`
- Current: sensitive tables have PUBLIC policies; browser code uses the anon
  Supabase client directly.
- Recommend: no anon application-table access. Authenticated access is
  role/membership scoped; service role is server-only.
- Why: PUBLIC patient, trace, cycle, pack, and role access bypasses tenant
  security.
- Impact: direct browser flows may fail until sessions, policies, and server
  boundaries are ready. Supabase Auth login itself remains public.
- Migration: security review first; application change and coordinated
  baseline/Production alignment are secondary.
- Preflight/tests: trace every browser query; verify scanner/workstation/setup
  session behavior; assert anon denial on all 21 tables and login continuity.
- Recovery: use feature-gated rollout; never recover by reopening role
  mutation or broad clinical-table access.
- Codex recommendation: approve conditionally on compatibility work.
- Strongest alternative: narrow anonymous workflow RPCs for a proven kiosk
  requirement, never direct table access.

### APPROVAL-003 — Role authorization and privilege administration

- Decisions: `RLS-025`, `RLS-026`, `RLS-027`
- Current: PUBLIC can create, enumerate, and change `user_roles`; UI checks
  interpret role strings by email.
- Recommend: server-controlled membership mutation, authorized self/membership
  reads, audited super-admin bootstrap and bounded clinic-admin delegation.
- Impact: settings and all direct `user_roles` reads/writes need replacement.
- Migration: application first; critical security review required.
- Tests: delegation matrix, unauthorized reads/writes, last-super-admin,
  self-demotion, inactive membership, and cross-clinic cases.
- Recovery: audited break-glass owner workflow.
- Codex recommendation: approve with a server authorization API.

### APPROVAL-004 — Patient and traceability access

- Decisions: `RLS-015`–`RLS-018`
- Current: PUBLIC can insert/read patients and traces; neither has explicit
  clinic ownership.
- Recommend: enforce clinic ownership; member clinical roles read;
  doctor/clinical_staff/admin create; no public access.
- Impact: patient pages/import, trace creation/history, reports, and pack
  details need authenticated membership context.
- Migration: security and data preflight before schema/backfill/policy rollout.
- Tests: role matrix, cross-clinic denial, import/create/trace workflows, and
  clinic-restricted history/reports.
- Recovery: reversible ownership mapping; quarantine ambiguous rows rather than
  expose them.
- Codex recommendation: approve only with complete tenant backfill evidence.
- Alternative: derive trace tenant through a mandatory immutable parent chain.

### APPROVAL-005 — Cycle, load, and pack access

- Decisions: `RLS-006`–`RLS-014`
- Current: cycles/packs expose PUBLIC operations; load items are globally
  accessible to authenticated users; tenant ownership is missing or nullable.
- Recommend: required clinic ownership; clinical_staff/admin mutations;
  approved clinical/auditor reads; trusted pack generation.
- Impact: CycleWizard, pack generation/review, inventory, dashboard, and
  investigations may need authenticated server actions.
- Migration: security review plus data preflight and application changes.
- Tests: full lifecycle by role, anonymous/cross-clinic denial, concurrent pack
  generation, and expired-review authorization.
- Recovery: preserve cycle-pack consistency and feature-gate writes.
- Codex recommendation: approve coordinated server/browser workflow changes.

### APPROVAL-006 — Deployment and setup authorization

- Decisions: `RLS-003`–`RLS-005`, `RLS-019`–`RLS-024`
- Current: authenticated users can read/write settings, providers, and
  sterilizers across clinics. Setup server actions use service role.
- Recommend: membership-scoped reads; admin/super_admin writes; deployment
  remains trusted service-role server work with durable clinic checks.
- Impact: settings browser queries require membership policies. Service
  deployment should remain compatible.
- Migration: baseline and Production must align before membership-dependent
  setup UI release.
- Preflight/tests: clinic-key completeness; caller authorization before service
  client creation; admin/member/non-member matrix and end-to-end deployment.
- Recovery: rely on deployment idempotency/recovery plans, not weakened tenant
  policies.
- Codex recommendation: approve with an explicit setup server-action caller
  authorization gate.

### APPROVAL-007 — RPC and service-role execution

- Decisions: `RPC-001`–`RPC-017`
- Current: all runtime RPCs are called through server modules from the setup
  server action using `SUPABASE_SERVICE_ROLE_KEY`. No browser `.rpc()` call was
  found.
- Recommend: service-role-only execute; revoke PUBLIC/anon/authenticated; fixed
  path; validate clinic/run/session/item/entity from durable rows.
- Impact: preserves current call path; caller authorization before constructing
  the service client still needs review.
- Migration: baseline-only if ACL/attributes already match; drift requires a
  separate Production migration.
- Tests: all RPC success paths, execute denial, tenant mismatch, stale
  token/lease, replay, malformed input, and concurrency.
- Recovery: existing idempotency and recovery evidence; never broaden roles.
- Codex recommendation: approve service-only ACLs and require caller audit.

### APPROVAL-008 — Trigger-helper permissions

- Decisions: `RPC-H01`–`RPC-H08`
- Current: eight updated-at helpers support ten live triggers; direct execute
  ACL and search path need normalization.
- Recommend: invoker trigger helpers, fixed trusted path, no browser-role direct
  execute.
- Impact: transparent to application when trigger behavior is preserved.
- Migration: baseline first, later Production ACL/path normalization.
- Tests: event attachment, updated timestamp, returned `NEW`, and direct
  execute denial.
- Recovery: restore verified trigger attachment, not broad function access.
- Codex recommendation: approve.

### APPROVAL-009 — Patient external-ID uniqueness

- Decisions: `UNIQUE-001`
- Current: two equivalent global unique constraints cover nullable external ID.
- Recommend: one non-null `(clinic_id, source_system, external_id)` rule.
- Impact: import conflict semantics change and clinic ownership is required.
- Migration: data preflight first.
- Tests: same-clinic collision, cross-clinic/source reuse, null drafts, and
  concurrency.
- Recovery: retain duplicate-resolution evidence and reversible transition.
- Codex recommendation: approve after inventory.

### APPROVAL-010 — Provider and sterilizer uniqueness

- Decisions: `UNIQUE-002`, `UNIQUE-003`
- Current: normalized names are globally unique; deployment keys are
  clinic-scoped.
- Recommend: clinic-scoped active/non-archived normalized names; retain
  clinic-scoped non-null deployment keys and planned null-key drafts.
- Migration: data preflight first.
- Tests: normalized collisions, cross-clinic names, lifecycle changes, null
  keys, and concurrent writes.
- Recovery: preserve resolved identities; do not restore global coupling.
- Codex recommendation: approve clinic-scoped identity.

### APPROVAL-011 — Workstation ordering

- Decisions: `UNIQUE-004`
- Current: Production indexes `(display_order, name)`; repository indexes
  `display_order`. Neither is unique.
- Recommend: Production composite index, allowing ties/nulls.
- Impact: no Production change; deterministic secondary ordering.
- Tests: normalized definition, query plan, ties and nulls.
- Codex recommendation: approve.

### APPROVAL-012 — Hardware, printer, and agent defaults

- Decisions: `HARDWARE-001`–`HARDWARE-005`
- Current: printer checks are `NOT VALID`; schema defaults include localhost,
  Wi-Fi and port 9100; lifecycle fields are nullable.
- Recommend: database enforces valid persisted state; deployment engine owns
  provisioning; application owns product defaults; environment owns endpoints
  and topology. Planned rows may remain nullable; active rows must be complete.
- Impact: local installs require explicit mode/configuration.
- Migration: application/configuration first, then data/default/constraint
  migration.
- Tests: local/remote, USB/network, planned/active/archived and invalid states.
- Recovery: retain last explicit device configuration and deployment recovery
  plan.
- Codex recommendation: approve source-of-truth split with documented local
  mode.

### APPROVAL-013 — Platform and Supabase prerequisites

- Decisions: `PLATFORM-001`–`PLATFORM-006`
- Current: Supabase provides schemas, roles, auth identity, and UUID generation;
  no application-owned extension or Storage dependency is proven.
- Recommend: assert platform compatibility; reference but never create managed
  objects; exclude Storage configuration until proven.
- Impact: clean initialization fails early on incompatibility.
- Migration: baseline-only assertion, no Production application change.
- Tests: prerequisite success/failure and proof the baseline creates no
  platform object.
- Codex recommendation: approve.

### APPROVAL-014 — Function, index, constraint, trigger, and default normalization

- Decisions: `NORMALIZE-001`–`NORMALIZE-007`
- Current: evolved and superseded sources coexist; long names truncate;
  genuine ACL/constraint/default differences exist.
- Recommend: Production-normalized evolved clinic/run/functions/triggers;
  ignore name-only truncation; migrate semantic differences only.
- Impact: deployed behavior remains unless separately approved uniqueness or
  hardware decisions change it.
- Migration: baseline first; forward Production migration later.
- Tests: normalized hashes, dependency graph, signatures, triggers,
  constraints, defaults, and object counts.
- Recovery: versioned forward correction, never baseline replay.
- Codex recommendation: approve.

### APPROVAL-015 — Audit access and tenant ownership

- Decisions: `RLS-001`, `RLS-002`
- Current: any authenticated user can insert/read every audit row; no clinic
  key exists.
- Recommend: tenant ownership, trusted server inserts, clinic-scoped
  super_admin/admin/auditor reads, no client update/delete.
- Impact: audit writer/page, reports, dashboard and assistant activity change;
  history needs tenant classification.
- Migration: security review and data preflight first.
- Tests: append-only integrity, server insert, role/clinic reads,
  cross-clinic denial, and client mutation denial.
- Recovery: quarantine unassigned rows; never restore broad write access.
- Codex recommendation: approve only with a historical ownership plan.

## Special security review: eliminating anonymous table access

### Workflows at risk

The browser client in `lib/supabase.ts` is created with
`NEXT_PUBLIC_SUPABASE_ANON_KEY`. Pages/components directly query cycles, loads,
packs, patients, traces, roles, settings, providers, sterilizers, audit data,
workstations, agents, hardware, and sessions. The current PUBLIC policies may
allow some pages to function without a verified authenticated membership.

- Login uses Supabase Auth and does not require PUBLIC application-table
  access.
- Setup UI is browser-facing, while mutations/orchestration in
  `app/setup/actions.ts` run server-side and construct a service-role client.
  The human caller must still be authorized before that construction.
- Deployment RPCs are server-side; their ACL is compatible with service-only.
- Scanner/workstation pages and agents use mixed browser/API/server paths.
  A durable device/workstation authentication model is not fully specified.
- Onboarding and first clinic creation currently have no captured membership
  bootstrap object.

### Required new dependencies

The proposed model requires objects that do not exist:

- an auth-user-linked clinic membership relation;
- clinic tenant keys/backfills on several legacy tables;
- membership/role lookup policy helpers or equivalent normalized predicates;
- server APIs/actions replacing unauthorized direct role writes;
- potentially authenticated workstation/device principals or narrowly scoped
  server endpoints.

JWT claims are not required if policies query membership. If claims are later
used for performance, the database membership remains authority and claim
refresh/revocation behavior must be tested.

### Bootstrap problems

First super administrator: no existing secure rule can create the first global
owner without circular authorization. Use a one-time, environment-gated,
audited server/service-role bootstrap tied to a verified `auth.users.id`;
disable it permanently after success and protect the last super administrator.

First clinic: creation and initial admin membership must be one trusted,
idempotent server transaction or orchestration. The requesting user cannot
authorize themselves merely by supplying a clinic or role. Record the
bootstrap actor, clinic, membership, and idempotency evidence.

Service role remains tenant-safe only when trusted server code authorizes the
human/device caller first and every mutation checks durable clinic equality.
Service role bypassing RLS makes those application checks mandatory.

## Runtime RPC compatibility review

All RPC repositories are under `lib/modules/deployment/*-supabase-repository.ts`;
paired `*-server.ts` modules orchestrate them through
`app/setup/actions.ts`. Current and proposed credential context is service
role. No direct browser `.rpc()` call was found.

| RPC | Calling repository/service | Context | ACL preserves flow | Code change | Required test |
|---|---|---|---|---|---|
| `activate_deployment_clinic` | clinic activation repository/server | Server/service role | Yes | Caller authorization audit | Clinic/run/item/token/state CAS |
| `activate_deployment_hardware_shell` | hardware-shell activation repository/server | Server/service role | Yes | Same | Hardware clinic/key/state |
| `activate_deployment_provider_shell` | provider-shell activation repository/server | Server/service role | Yes | Same | Provider clinic/key/state |
| `activate_deployment_sterilizer_shell` | sterilizer-shell activation repository/server | Server/service role | Yes | Same | Sterilizer clinic/key/state |
| `activate_deployment_workstation_shell` | workstation-shell activation repository/server | Server/service role | Yes | Same | Workstation clinic/key/state |
| `bind_deployment_hardware_target` | hardware-binding repository/execution server | Server/service role | Yes | Same | Hardware/target same clinic/type |
| `claim_deployment_activation_execution_session` | execution-claim repository/server | Server/service role | Yes | Same | Claim mode, owner, lease, replay |
| `complete_deployment_activation_execution_item` | item-completion repository/server | Server/service role | Yes | Same | Item/session ownership/CAS |
| `complete_deployment_hardware_shell_execution_item` | hardware completion repository/server | Server/service role | Yes | Same | Hardware and execution state |
| `complete_deployment_provider_shell_execution_item` | provider completion repository/server | Server/service role | Yes | Same | Provider and execution state |
| `complete_deployment_sterilizer_shell_execution_item` | sterilizer completion repository/server | Server/service role | Yes | Same | Sterilizer and execution state |
| `complete_deployment_workstation_shell_execution_item` | workstation completion repository/server | Server/service role | Yes | Same | Workstation and execution state |
| `persist_deployment_recovery_plan` | recovery repository/server/integration runner | Server/service role | Yes | Same | Idempotency/hash/JSON/replay |
| `progress_deployment_activation_execution_dependency` | dependency repository/server | Server/service role | Yes | Same | Dependency graph and two-item CAS |
| `start_deployment_activation_execution_item` | item-start repository/server | Server/service role | Yes | Same | Transition, attempt, lease |
| `start_deployment_activation_execution_next_item` | next-item repository/server | Server/service role | Yes | Same | Eligibility/dependencies/CAS |
| `start_deployment_activation_execution_session` | execution-start repository/server | Server/service role | Yes | Same | Session/run/count/owner |

Every RPC accepts `p_clinic_id`; none may trust it alone.

## Membership model verification

### Verified current state

- `auth.users` exists, but `user_roles` has no FK to it.
- `user_roles` fields are `id`, `user_email`, `role`, `created_at`, `active`.
- `user_email` is globally unique, so one row/role per email is representable.
- `user_roles` has no clinic relationship.
- `clinics` has no captured user-membership relationship.
- TypeScript recognizes `super_admin`, `admin`, `clinical_staff`, `doctor`,
  and `auditor`, but primarily uses them for client routing/UI.
- The database cannot represent multiple clinic memberships.
- The database does not state whether `super_admin` is global or scoped.
- No membership table or membership policy helper exists.

### Unsupported assumptions requiring owner decisions

- That `super_admin` should be global.
- That a user may belong to multiple clinics.
- How historical tenant ownership is derived for legacy rows.
- How scanners/workstations authenticate as principals.
- Whether any anonymous clinical workflow is actually required.
- Whether Storage will be used.
- Whether setup currently performs sufficient human-caller authorization
  before creating its service-role client.

The recommendation is compatible with current role names but not with current
direct `user_roles` TypeScript queries; those require application changes.

## Coverage and migration distribution

- Approval groups: 15
- Decisions covered exactly once: 76
- Critical groups: 9; high: 4; medium: 2
- Migration classifications:
  - `BASELINE_ONLY_NO_PRODUCTION_CHANGE`: 3
  - `BASELINE_FIRST_PRODUCTION_MIGRATION_LATER`: 2
  - `BASELINE_AND_PRODUCTION_MUST_ALIGN_BEFORE_RELEASE`: 1
  - `REQUIRES_APPLICATION_CHANGE_FIRST`: 3
  - `REQUIRES_DATA_PREFLIGHT_FIRST`: 2
  - `REQUIRES_SECURITY_REVIEW_FIRST`: 4

OWNER_APPROVAL_PACKAGE_READY
