# Production schema reconciliation report

## 1. Executive Summary

This report reconciles the validated schema-only Production capture at
`.tmp/schema-captures/20260723T031930Z/` with the repository SQL and the
non-test TypeScript database boundary. It is analysis only. No SQL, capture,
Supabase configuration, database, or environment was changed.

Production contains 21 `public` application tables, 25 `public` functions, 10
application triggers, 77 `public` indexes, 27 policies, and no views,
materialized views, or `public` sequences. Every `public` table has RLS
enabled. The complete capture, including Supabase-managed `auth`,
`extensions`, and `storage`, contains 52 tables, 52 functions, 14 triggers,
143 indexes, 355 constraints, 45 RLS-enabled tables, and 27 policies.

The principal conclusions are:

- All 19 table names directly referenced by non-test TypeScript and all 17
  deployment RPCs exist in Production. There is no object-name-level runtime
  mismatch. The two remaining Production application tables are recovery
  persistence tables reached through an RPC.
- The repository is not a clean-database schema source. Its active SQL defines
  11 of the 21 Production application tables. Ten Production tables have no
  authoritative base `CREATE TABLE` source.
- All 25 Production `public` functions have a repository definition. Seventeen
  are application RPCs and eight are trigger helpers.
- Production has 27 application-table policies; repository SQL defines zero
  policies. This is the largest security reconstruction gap.
- `supabase_deployment_core.sql` is superseded. Its
  `clinic_provider_plans` and `clinic_hardware_plans` tables, associated
  triggers/indexes, and `set_deployment_updated_at` helper are repository-only
  and must not enter the future baseline without a new product decision.
- Four apparent index-name differences are PostgreSQL 63-byte truncations, not
  structural differences. One workstation ordering index is a real definition
  drift: repository SQL specifies `display_order`, while Production has
  `display_order, name`.
- Production is the best available structural evidence for the ten unsourced
  legacy/application tables and their security objects. It should not be
  copied mechanically: platform-managed schemas, ownership/ACL noise,
  superseded repository history, and patch ordering must be normalized.

The recommended future baseline is a reviewed, immutable, clean-database
definition assembled from the Production `public` capture plus the
authoritative deployment SQL lineage, with explicit provenance and normalized
security. Staging is not ready for initialization until that artifact exists
and the unresolved differences below are decided.

## 2. Production Inventory

### Capture evidence

| Evidence | Result |
|---|---|
| Capture directory | `.tmp/schema-captures/20260723T031930Z/` |
| Public/extension dump | `production-public-schema.sql` |
| Auth/storage dump | `production-auth-storage-schema.sql` |
| Manifest | `production-schema-manifest.json`, format version 1 |
| Capture kind | Schema-only |
| Views/materialized views | 0 / 0 |
| Extensions emitted | 0 |

The zero extension count means no `CREATE EXTENSION` statement was emitted by
this filtered capture. It does not prove that Production has no installed
extensions; extension membership and Supabase platform provisioning remain
outside this manifest's coverage.

### Manifest counts

| Object type | Whole capture | `public` application scope |
|---|---:|---:|
| Schemas | 4 | 1 |
| Tables | 52 | 21 |
| Views | 0 | 0 |
| Materialized views | 0 | 0 |
| Sequences | 1 | 0 |
| Functions | 52 | 25 |
| Triggers | 14 | 10 |
| Indexes | 143 | 77 |
| Constraints | 355 | Not separately schema-counted by manifest |
| RLS-enabled tables | 45 | 21 |
| Policies | 27 | 27 |
| Grants / revokes | 91 / 19 | Present; target arrays require ACL review |
| RPC candidates | 25 | 25 |

The sole sequence is `auth.refresh_tokens_id_seq`, a platform-managed object.
There are no application views or sequences to reconcile.

### Production application tables

| Domain | Tables |
|---|---|
| Legacy application/traceability | `audit_logs`, `clinic_settings`, `cycles`, `load_items`, `packs`, `patient_traces`, `patients`, `providers`, `sterilizers`, `user_roles` |
| Clinic operations | `clinics`, `clinical_agents`, `clinical_hardware_devices`, `clinical_workstations`, `workstation_sessions` |
| Deployment | `deployment_runs`, `deployment_hardware_assignments`, `deployment_activation_execution_sessions`, `deployment_activation_execution_items` |
| Recovery | `deployment_recovery_plans`, `deployment_recovery_plan_items` |

### Production security

All 21 `public` tables have RLS enabled. The 27 policies exist only on ten
legacy/application tables:

- `audit_logs`: 2;
- `clinic_settings`: 3;
- `cycles`: 3;
- `load_items`: 3;
- `packs`: 3;
- `patient_traces`: 2;
- `patients`: 2;
- `providers`: 3;
- `sterilizers`: 3;
- `user_roles`: 3.

The other 11 application tables are RLS-enabled with no policy in the capture,
which is consistent with deny-by-default direct access and server/service-role
operation. That security boundary must be preserved deliberately in a
baseline, not inferred from the absence of policy SQL in the repository.

The policy names include several “Allow public” rules. A future security
review must inspect their exact roles, commands, `USING`, and `WITH CHECK`
expressions. Names alone are not proof of acceptable tenant isolation.

## 3. Repository Coverage

### SQL inventory interpretation

The existing inventory contains 60 SQL assets: 29 at repository root and 31
under `docs/architecture`. They are fragments, patches, RPC definitions,
preflights, repair history, and superseded history—not an ordered migration
chain.

The active definition lineage covers:

- 11 table definitions;
- all 25 live `public` functions;
- all 10 live application triggers;
- most deployment/operations indexes and constraints;
- RLS enabling for deployment-owned tables;
- no application policies;
- no views, materialized views, or sequences.

The 11 covered Production tables are:

`clinics`, `clinical_agents`, `clinical_hardware_devices`,
`clinical_workstations`, `workstation_sessions`, `deployment_runs`,
`deployment_hardware_assignments`,
`deployment_activation_execution_sessions`,
`deployment_activation_execution_items`, `deployment_recovery_plans`, and
`deployment_recovery_plan_items`.

### TypeScript table contract

Static inspection of non-test `.from()` calls found 19 distinct table names.
Every one exists in the Production manifest:

| Table | Main repository/service consumers | Production |
|---|---|---|
| `audit_logs` | audit, dashboard, reports, assistant activity | Exists |
| `clinic_settings` | settings, printer agent, deployment readiness/plan/settings | Exists |
| `clinical_agents` | heartbeat route, settings | Exists |
| `clinical_hardware_devices` | deployment hardware, binding, readiness/plan | Exists |
| `clinical_workstations` | room hook, deployment workstation/readiness/plan | Exists |
| `clinics` | deployment clinic and activation services | Exists |
| `cycles` | cycle, investigation, traceability, dashboard/report services | Exists |
| `deployment_activation_execution_items` | execution and entity activation repositories | Exists |
| `deployment_activation_execution_sessions` | execution and entity activation repositories | Exists |
| `deployment_hardware_assignments` | assignment, readiness, plan, resolution | Exists |
| `deployment_runs` | deployment run/execution/readiness/plan | Exists |
| `load_items` | cycle generation and investigation | Exists |
| `packs` | cycle, inventory, traceability, reports | Exists |
| `patient_traces` | traceability, dashboard, investigation, reports | Exists |
| `patients` | patient and traceability services | Exists |
| `providers` | settings, traceability, deployment provider flows | Exists |
| `sterilizers` | cycle/settings and deployment sterilizer flows | Exists |
| `user_roles` | authorization-facing pages/components | Exists |
| `workstation_sessions` | workstation-session settings | Exists |

`deployment_recovery_plans` and `deployment_recovery_plan_items` are not
directly named by non-test `.from()` calls. They are indirect runtime
dependencies of `persist_deployment_recovery_plan`, which exists in
Production and is invoked by the recovery Supabase repository.

No TypeScript reference was found to the repository-only
`clinic_provider_plans` or `clinic_hardware_plans` tables.

### TypeScript RPC contract

The deployment Supabase repositories name 17 RPCs. Every name exists in
Production and has a repository function definition:

`activate_deployment_clinic`,
`activate_deployment_provider_shell`,
`complete_deployment_provider_shell_execution_item`,
`activate_deployment_sterilizer_shell`,
`complete_deployment_sterilizer_shell_execution_item`,
`activate_deployment_workstation_shell`,
`complete_deployment_workstation_shell_execution_item`,
`activate_deployment_hardware_shell`,
`complete_deployment_hardware_shell_execution_item`,
`bind_deployment_hardware_target`,
`claim_deployment_activation_execution_session`,
`start_deployment_activation_execution_session`,
`start_deployment_activation_execution_item`,
`complete_deployment_activation_execution_item`,
`progress_deployment_activation_execution_dependency`,
`start_deployment_activation_execution_next_item`, and
`persist_deployment_recovery_plan`.

Object-name coverage is complete. This analysis does not execute RPCs, so
argument names/types, overload resolution, returned record shape, role
permissions, and runtime behavior must still be verified in Staging against
the future normalized baseline.

## 4. Object Differences

### Production-only objects

#### Tables

These ten Production tables have no authoritative base definition in
repository SQL:

`audit_logs`, `clinic_settings`, `cycles`, `load_items`, `packs`,
`patient_traces`, `patients`, `providers`, `sterilizers`, and `user_roles`.

Four of them have partial repository patches:

- `clinic_settings`: clinic tenancy and printer-setting patches;
- `cycles`: investigation lifecycle repair SQL;
- `providers`: deployment identity/status patch;
- `sterilizers`: deployment identity/status patch.

Those patches do not replace a base definition.

#### Policies

All 27 Production policies are Production-only. Repository SQL has no
`CREATE POLICY` statements. This includes every policy listed in Production
for the ten legacy/application tables.

#### Indexes

Three clearly Production-only indexes belong to missing base definitions:

- `providers_full_name_unique_idx`;
- `providers_normalized_name_unique_idx`;
- `sterilizers_name_unique_idx`.

Other indexes on the ten unsourced tables may be represented as constraints
rather than standalone `CREATE INDEX` statements. Their ownership must be
carried forward with the corresponding table definition.

#### Views, functions, triggers, and sequences

- Views/materialized views: none.
- `public` functions: none are Production-only by name.
- Application triggers: none are Production-only by name.
- `public` sequences: none.
- The `auth` sequence and all `auth`, `storage`, and `extensions` functions,
  triggers, indexes, and tables are platform-managed Production-only objects
  relative to application SQL. They should be treated as platform
  prerequisites, not copied into an application baseline.

### Repository-only objects

The meaningful repository-only objects all come from the superseded
`supabase_deployment_core.sql` planning model:

- tables `clinic_provider_plans` and `clinic_hardware_plans`;
- function `set_deployment_updated_at`;
- triggers `set_clinic_provider_plans_updated_at` and
  `set_clinic_hardware_plans_updated_at`;
- indexes `clinic_provider_plans_clinic_id_idx` and
  `clinic_hardware_plans_clinic_id_idx`;
- legacy indexes `clinics_clinic_code_idx`,
  `deployment_runs_clinic_id_status_idx`, and
  `deployment_runs_started_at_idx`.

They have no Production counterpart and no non-test TypeScript consumer.
Their correct disposition is historical/superseded exclusion, not migration.

There are no repository-only views, policies, or sequences.

### Shared objects with significant differences

| Object | Difference | Assessment |
|---|---|---|
| `clinics` | Defined both in `supabase_deployment_core.sql` and evolved `supabase_clinics.sql`; lifecycle and constraint models differ | Evolved file and Production are authoritative; core version is superseded |
| `deployment_runs` | Core planning status/review payload differs from evolved identity, idempotency, lifecycle, audit, and recovery model | Evolved file and Production are authoritative; core version is superseded |
| `set_clinics_updated_at` | Duplicate helper definition in core and evolved clinic SQL | Use evolved definition; exclude core copy |
| `clinical_workstations` ordering index | Repository: `clinical_workstations_display_order_idx` on `display_order`; Production: `clinical_workstations_display_order_name_idx` on `display_order, name` | Real drift; prefer Production behavior unless product review chooses otherwise |
| Missing-table definitions | Production has complete tables/constraints/security; repository has no base or only patches | Production capture is source evidence for baseline authorship |
| RLS policies | Production has 27; repository has zero | Significant security-source drift |

Four index differences are naming artifacts caused by PostgreSQL's identifier
length limit. They represent the same intended repository indexes and should
be normalized to their actual catalog names:

| Repository spelling | Production catalog name |
|---|---|
| `deployment_activation_execution_items_session_execution_item_uidx` | `deployment_activation_execution_items_session_execution_item_ui` |
| `deployment_activation_execution_sessions_clinic_execution_key_uidx` | `deployment_activation_execution_sessions_clinic_execution_key_u` |
| `deployment_hardware_assignments_clinic_assignment_key_unique_idx` | `deployment_hardware_assignments_clinic_assignment_key_unique_id` |

The first two rows are 63-byte truncations. The hardware assignment spelling
also reflects the captured catalog identifier; definition comparison, rather
than name-only comparison, is required before normalization.

Shared function identity is complete, but identity equality is not enough to
declare byte-for-byte equivalence. The future baseline review must compare
`pg_get_functiondef`, identity arguments, volatility, security definer/invoker,
owner, search path, configuration, ACL, and result shape for all 25 functions.

## 5. Missing Definitions

The repository cannot recreate Production because it lacks:

1. complete base DDL for the ten Production-only application tables;
2. all 27 Production policies and their exact role/command/expressions;
3. the complete constraint and index lineage for those ten tables;
4. a declarative form of the final `cycles` investigation columns and
   constraints without the repair file's top-level data mutation;
5. consolidated final definitions for patch-only clinic settings, printer,
   provider, and sterilizer changes;
6. a platform prerequisite contract for `auth.users`, `auth.uid()`,
   `gen_random_uuid()`, service roles, and required Supabase-managed schemas;
7. a normalized ACL manifest for tables, sequences, and functions;
8. an ordered migration ledger with immutable versions/checksums;
9. explicit column-level TypeScript contract verification for all selects,
   inserts, updates, RPC arguments, and returned records.

The manifest is intentionally object/count oriented. It does not provide
per-schema constraint counts, column counts, enum/domain/type inventory,
function overload counts, function security metadata, policy expressions,
index definitions, trigger definitions, or table ACL semantics. Those details
exist in the raw capture and must be normalized during baseline authorship.

## 6. Duplicate Definitions

### Authoritative/current

The following are the strongest current repository sources for their domains:

- `supabase_clinics.sql`;
- `supabase_clinical_agents.sql`;
- `supabase_clinical_workstations.sql`;
- `supabase_clinical_hardware_devices.sql`;
- `supabase_deployment_runs.sql`;
- `supabase_deployment_hardware_assignments.sql`;
- `supabase_workstation_sessions.sql`;
- `docs/architecture/supabase_deployment_activation_execution.sql`;
- `docs/architecture/supabase_deployment_recovery_plan_persistence.sql`;
- the paired deployment RPC SQL files under `docs/architecture`;
- incremental deployment-field, binding, claim, and RLS SQL after their base
  dependencies.

“Authoritative” here means best repository source, not independently replayable
baseline. Several still contain compatibility logic or depend on prior
patches.

### Duplicated or overlapping

- `clinics` is defined in both `supabase_deployment_core.sql` and
  `supabase_clinics.sql`.
- `deployment_runs` is defined in both `supabase_deployment_core.sql` and
  `supabase_deployment_runs.sql`.
- `set_clinics_updated_at` is repeated across the two clinic lineages.
- `clinical_hardware_devices` is referenced/conditionally created from the
  workstation SQL and has its own authoritative hardware file; the final
  baseline should contain only one complete definition.
- `deployment-activation-execution-preflight.sql` overlaps the evolved
  `supabase_deployment_activation_execution_preflight.sql`.
- Preflight files repeat object names and expected definitions for validation;
  they are not duplicate migration ownership.

### Obsolete, superseded, or historical

| File | Classification | Baseline disposition |
|---|---|---|
| `supabase_deployment_core.sql` | Superseded planning model | Exclude |
| `docs/architecture/deployment-activation-execution-preflight.sql` | Historical preflight | Retain as history or archive; do not execute |
| `supabase_investigation_lifecycle.sql` | Repair-only and data-mutating | Convert desired final schema into baseline DDL; exclude repair procedure |
| Every `*_preflight.sql` | Read-only verification | Keep as verification assets; exclude from migration chain |

Patch-only files are neither obsolete nor independently authoritative. Their
desired final state should be folded into complete table definitions:

`supabase_clinic_settings_clinic_id.sql`,
`supabase_printer_settings.sql`,
`supabase_providers_deployment_fields.sql`,
`supabase_sterilizers_deployment_fields.sql`, and the operational
deployment-field/binding patches.

## 7. Repository Health

### Strengths

- Production capture is validated, schema-only, deterministic, and separated
  into application and platform evidence.
- Runtime table/RPC object names have complete Production coverage.
- Deployment and recovery SQL has extensive paired read-only preflights.
- The evolved deployment lineage is substantially represented in source.
- RLS is enabled on every Production application table.
- No application view or sequence dependency is hidden from repository code.

### Weaknesses

- There is no migration directory, version history, or clean baseline.
- Ten runtime tables and all 27 policies are not source-controlled as
  authoritative definitions.
- File naming does not encode a single execution order.
- SQL mixes baselines, patches, compatibility transformations, RPCs,
  preflights, repair DML, and historical models.
- `IF NOT EXISTS` and conditional `ALTER` blocks can hide drift instead of
  reconciling it.
- Application and server-only security models coexist without one reviewed
  ACL/policy specification.
- Long identifiers create catalog-name ambiguity.
- Production/platform prerequisites are implicit.

### Manifest expectations and coverage gap

| Expectation | Production | Repository expectation | Gap |
|---|---:|---:|---|
| Application tables | 21 (19 directly named by TypeScript) | 11 active base definitions | 10 missing |
| Public functions | 25 | 25 live definitions | Identity covered; semantic/ACL comparison pending |
| Application triggers | 10 | 10 live definitions | Identity covered; semantic comparison pending |
| Public indexes | 77 | Most operational indexes | Three missing-base unique indexes; one real ordering drift; long-name normalization |
| Policies | 27 | 0 | 27 missing |
| RLS-enabled application tables | 21 | Partial explicit enablement | Missing-table RLS source plus final-state consolidation |
| Views/materialized views | 0 | 0 | None |
| Public sequences | 0 | 0 | None |

## 8. Recommended Baseline Strategy

The future baseline should be a new reviewed artifact, not a concatenation of
the capture or existing files.

Recommended composition:

1. **Platform contract:** document Supabase-provided schemas, roles, auth
   functions, UUID support, and ownership assumptions without recreating
   `auth`, `storage`, or `extensions` internals.
2. **Legacy/application foundation:** normalize the ten unsourced Production
   tables, their final columns, constraints, indexes, RLS, policies, grants,
   and revokes from the capture.
3. **Clinic/operations foundation:** consolidate final definitions for
   `clinics`, workstations, agents, hardware devices, workstation sessions,
   provider/sterilizer deployment fields, clinic settings, and printer
   settings.
4. **Deployment persistence:** define final `deployment_runs` and
   `deployment_hardware_assignments` structures with deny-by-default RLS.
5. **Execution persistence:** define execution sessions/items in their final
   post-claim/post-start shape rather than replaying evolutionary patches.
6. **Recovery persistence:** define recovery plans/items in final form.
7. **Functions and triggers:** install normalized helper functions and all 17
   service RPCs after their table dependencies.
8. **Security:** apply explicit RLS, policies, grants, revokes, function
   security mode, owners, and fixed search paths as reviewed final state.
9. **Verification:** retain preflights outside the mutation chain and compare
   a fresh schema dump/manifest with the approved baseline expectation.

The baseline should:

- be immutable once approved;
- create an empty application schema from scratch;
- contain no tenant/application row data and no repair backfill;
- contain one owner per object;
- use explicit schema qualification;
- use names that account for PostgreSQL's identifier length limit;
- separate Supabase-managed platform objects from application-managed objects;
- include a machine-readable inventory/checksum;
- record why each Production-only object was adopted, changed, or rejected.

Production should not be forced to “re-run” the baseline. After Staging proves
the baseline, Production evolution should use reviewed forward-only
migrations from the captured Production state.

## 9. Staging Initialization Readiness

Current status: **not ready**.

Blocking conditions:

- the ten missing base definitions have not been normalized into source;
- the 27 policies and ACLs have not been reviewed as code;
- the workstation ordering-index drift is undecided;
- function signatures/bodies/security attributes have not received a
  normalized capture-to-source comparison;
- long index names have not been normalized;
- no immutable baseline artifact or expected manifest exists;
- the baseline has not been proven on an empty isolated database.

### Recommended execution order

#### Repository

1. Freeze this capture as reconciliation evidence; do not edit it.
2. Decide object authority and disposition using this report.
3. Author the normalized baseline in a later, explicitly authorized phase.
4. Separate baseline DDL, forward migrations, and read-only preflights.
5. Generate expected object/security manifests from the reviewed baseline.
6. Review and checksum the complete ordered artifact.

#### Baseline

1. Provision only approved platform prerequisites.
2. Apply legacy/application foundations.
3. Apply clinic and operational foundations.
4. Apply deployment, execution, and recovery persistence.
5. Apply helper functions, triggers, then RPCs.
6. Apply RLS, policies, grants, revokes, and function ACL/security settings.
7. Run all read-only catalog/preflight validation.
8. Dump the resulting empty schema and compare it to the expected manifest.

#### Staging

1. Verify Staging identity through independent environment/project checks.
2. Initialize a clean isolated Staging database from the approved baseline.
3. Require exact schema, security, and checksum validation.
4. Run repository/service tests and RPC contract tests.
5. Run controlled fixtures only after schema parity; require cleanup.
6. Perform application smoke and tenancy/authorization tests.
7. Record immutable evidence and approve the baseline version.

#### Production evolution

1. Take a new authorized schema-only pre-change capture.
2. Compare it to the approved prior Production manifest; stop on unexplained
   drift.
3. Generate a separate forward-only migration proposal from the actual
   Production state.
4. Prove that migration on a Production-like Staging copy with security and
   rollback/forward-correction plans.
5. Review and approve a deployment window.
6. Apply only the approved forward migration; never apply the clean baseline
   to an existing Production database.
7. Run read-only post-deployment validation and capture a new manifest.
8. Make the new manifest the reference for the next evolution.

## 10. Remaining Risks

1. **Policy semantics:** 27 policies exist, but permissiveness and tenant
   isolation require expression-level review.
2. **Column-level contracts:** table-name existence does not prove that every
   selected/inserted/updated TypeScript field has the required type,
   nullability, default, or constraint.
3. **RPC contracts:** name existence does not prove exact arguments, returned
   columns, overload behavior, ownership-token handling, or privilege safety.
4. **ACL and ownership drift:** grants/revokes are captured but not yet reduced
   to an application security specification.
5. **Platform coupling:** the capture includes current Supabase-managed
   `auth`/`storage` structures that may vary by platform release and must not be
   application-managed.
6. **Extension ambiguity:** a zero extension count in this filtered dump is
   insufficient evidence for all function/default prerequisites.
7. **Identifier truncation:** long names can make name-based comparison
   misleading and can create future collisions.
8. **Historical DML:** the investigation repair and workstation compatibility
   logic are not safe baseline material without extracting their intended
   final schema.
9. **Production manual drift:** the capture is a point-in-time snapshot. A new
   capture is required before any later Production migration.
10. **No behavioral validation:** this phase performed static, read-only
    reconciliation only; no query, RPC, policy, or migration was executed.
11. **Storage usage:** platform storage structures exist, but the capture does
    not establish whether application bucket configuration or storage policies
    are required.
12. **Manifest granularity:** raw dump review is still needed for columns,
    constraints, index expressions, function attributes, trigger enablement,
    policy expressions, and ACLs.

The next authorized phase should resolve these risks by producing and
reviewing a baseline proposal. It should not modify Production or initialize
Staging until all blocking decisions are recorded.
