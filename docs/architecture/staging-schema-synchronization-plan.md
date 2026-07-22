# Phase 10.1 — Staging Schema Synchronization Audit and Execution Plan

## Decision

**Recommendation C: obtain a Production schema-only export and reconcile it with repository SQL before staging execution.**

The repository does not contain a complete clean-database baseline. It contains strong source contracts for the deployment engine, but TypeScript directly expects ten public tables with no authoritative base `CREATE TABLE` source in the repository. Four required files are patches against those missing tables. `supabase_deployment_core.sql` defines earlier, incompatible versions of `clinics` and `deployment_runs` and cannot safely substitute for the evolved sources.

No SQL should be applied to Staging until a schema-only Production export has been reviewed, stripped of environment data/ownership noise, and reconciled into an authoritative baseline plan. This milestone performs no Supabase operation.

## Audit scope and totals

- SQL assets reviewed: **60**.
- Repository-root assets: **29**.
- `docs/architecture` SQL assets: **31**.
- Classification totals:
  - baseline-required: **9**;
  - incremental-required: **17**;
  - read-only-preflight: **27**;
  - testing-only: **0**;
  - repair-only: **1**;
  - historical: **1**;
  - superseded: **1**;
  - uncertain-needs-review: **4**.

The audit also covered TypeScript table/RPC mappings, deployment and recovery repositories, server-only Supabase client construction, Phase 10.0 environment documents, and existing preflights.

## Classification of every SQL asset

### Repository-root assets

| Asset | Classification | Reason |
|---|---|---|
| `supabase_activation_plan_preflight.sql` | read-only-preflight | Validates application-derived activation plan prerequisites; creates nothing. |
| `supabase_activation_readiness_preflight.sql` | read-only-preflight | Readiness diagnostics only. |
| `supabase_assignment_target_validation_preflight.sql` | read-only-preflight | Assignment target diagnostics only. |
| `supabase_clinic_settings_clinic_id.sql` | uncertain-needs-review | Patch-only; requires a missing authoritative `clinic_settings` base definition. |
| `supabase_clinical_agents.sql` | baseline-required | Defines `clinical_agents`; depends on `clinical_workstations` and `auth.users`. |
| `supabase_clinical_hardware_devices.sql` | baseline-required | Defines hardware devices; depends on agents and workstations. |
| `supabase_clinical_hardware_devices_deployment_fields.sql` | incremental-required | Adds deployment hardware identity/status fields after hardware baseline. |
| `supabase_clinical_hardware_devices_deployment_preflight.sql` | read-only-preflight | Hardware deployment field diagnostics. |
| `supabase_clinical_hardware_devices_sterilizer_bindings.sql` | incremental-required | Adds V1 sterilizer binding fields; also requires the missing sterilizer base. |
| `supabase_clinical_hardware_devices_sterilizer_bindings_preflight.sql` | read-only-preflight | Binding migration diagnostics. |
| `supabase_clinical_workstations.sql` | baseline-required | Defines workstations and auth-user audit links. Contains a conditional legacy `type` data conversion. |
| `supabase_clinical_workstations_deployment_fields.sql` | incremental-required | Adds deployment workstation identity/status fields. |
| `supabase_clinical_workstations_deployment_preflight.sql` | read-only-preflight | Workstation deployment field diagnostics. |
| `supabase_clinics.sql` | baseline-required | Authoritative evolved clinic tenancy definition. |
| `supabase_clinics_preflight.sql` | read-only-preflight | Clinic diagnostics. |
| `supabase_deployment_core.sql` | superseded | Earlier planning definitions conflict with evolved `clinics` and `deployment_runs`; not safe to replay. |
| `supabase_deployment_hardware_assignments.sql` | baseline-required | Defines planned hardware assignment persistence. |
| `supabase_deployment_hardware_assignments_preflight.sql` | read-only-preflight | Assignment table diagnostics. |
| `supabase_deployment_runs.sql` | baseline-required | Authoritative evolved deployment-run boundary. |
| `supabase_deployment_tables_rls_baseline.sql` | incremental-required | Enables deny-by-default RLS on runs and assignments. |
| `supabase_deployment_tables_rls_preflight.sql` | read-only-preflight | RLS diagnostics. |
| `supabase_investigation_lifecycle.sql` | repair-only | Requires existing `cycles` and performs top-level row updates before constraints. |
| `supabase_planned_assignment_resolution_preflight.sql` | read-only-preflight | Resolution diagnostics. |
| `supabase_printer_settings.sql` | uncertain-needs-review | Patch-only; requires missing `clinic_settings`; adds `NOT VALID` constraints. |
| `supabase_providers_deployment_fields.sql` | uncertain-needs-review | Patch-only; requires missing `providers` base and queries existing rows. |
| `supabase_providers_preflight.sql` | read-only-preflight | Provider patch diagnostics. |
| `supabase_sterilizers_deployment_fields.sql` | uncertain-needs-review | Patch-only; requires missing `sterilizers` base and queries existing rows. |
| `supabase_sterilizers_preflight.sql` | read-only-preflight | Sterilizer patch diagnostics. |
| `supabase_workstation_sessions.sql` | baseline-required | Defines workstation sessions; depends on workstations and `auth.users`. |

### Architecture SQL assets

| Asset under `docs/architecture/` | Classification | Reason |
|---|---|---|
| `deployment-activation-execution-preflight.sql` | historical | Earlier execution preflight overlaps the evolved `supabase_..._preflight` source. |
| `supabase_deployment_activation_execution.sql` | baseline-required | Defines execution sessions/items, indexes, triggers, and RLS. |
| `supabase_deployment_activation_execution_preflight.sql` | read-only-preflight | Evolved execution persistence diagnostics. |
| `supabase_deployment_activation_execution_claim.sql` | incremental-required | Adds ownership columns/constraint/indexes and defines claim RPC. |
| `supabase_deployment_activation_execution_claim_preflight.sql` | read-only-preflight | Claim RPC diagnostics. |
| `supabase_deployment_activation_execution_dependency_progression.sql` | incremental-required | Defines dependency progression RPC. |
| `supabase_deployment_activation_execution_dependency_progression_preflight.sql` | read-only-preflight | Dependency RPC diagnostics. |
| `supabase_deployment_activation_execution_item_completion.sql` | incremental-required | Defines generic item completion RPC. |
| `supabase_deployment_activation_execution_item_completion_preflight.sql` | read-only-preflight | Generic completion diagnostics. |
| `supabase_deployment_activation_execution_item_start.sql` | incremental-required | Defines selected item start RPC and indexes. |
| `supabase_deployment_activation_execution_item_start_preflight.sql` | read-only-preflight | Item-start diagnostics. |
| `supabase_deployment_activation_execution_next_item_start.sql` | incremental-required | Defines successor start RPC. |
| `supabase_deployment_activation_execution_next_item_start_preflight.sql` | read-only-preflight | Successor diagnostics. |
| `supabase_deployment_activation_execution_start.sql` | incremental-required | Defines session start RPC and indexes. |
| `supabase_deployment_activation_execution_start_preflight.sql` | read-only-preflight | Session-start diagnostics. |
| `supabase_deployment_clinic_activation.sql` | incremental-required | Defines clinic activation RPC. |
| `supabase_deployment_clinic_activation_preflight.sql` | read-only-preflight | Clinic activation diagnostics. |
| `supabase_deployment_hardware_binding.sql` | incremental-required | Defines V1 hardware binding RPC; depends on assignments, hardware, workstations, sterilizers, and execution tables. |
| `supabase_deployment_hardware_binding_preflight.sql` | read-only-preflight | Binding RPC diagnostics. |
| `supabase_deployment_hardware_shell_activation_and_completion.sql` | incremental-required | Defines hardware activation/completion RPCs. |
| `supabase_deployment_hardware_shell_activation_and_completion_preflight.sql` | read-only-preflight | Hardware RPC diagnostics. |
| `supabase_deployment_provider_shell_activation.sql` | incremental-required | Defines provider activation RPC; blocked until provider base reconciliation. |
| `supabase_deployment_provider_shell_activation_preflight.sql` | read-only-preflight | Provider activation diagnostics. |
| `supabase_deployment_provider_shell_execution_item_completion.sql` | incremental-required | Defines provider completion RPC. |
| `supabase_deployment_provider_shell_execution_item_completion_preflight.sql` | read-only-preflight | Provider completion diagnostics. |
| `supabase_deployment_recovery_plan_persistence.sql` | baseline-required | Defines recovery parent/children, security, triggers, and persistence RPC. |
| `supabase_deployment_recovery_plan_persistence_preflight.sql` | read-only-preflight | Recovery persistence diagnostics. |
| `supabase_deployment_sterilizer_shell_activation_and_completion.sql` | incremental-required | Defines sterilizer activation/completion RPCs; blocked until sterilizer base reconciliation. |
| `supabase_deployment_sterilizer_shell_activation_and_completion_preflight.sql` | read-only-preflight | Sterilizer RPC diagnostics. |
| `supabase_deployment_workstation_shell_activation_and_completion.sql` | incremental-required | Defines workstation activation/completion RPCs. |
| `supabase_deployment_workstation_shell_activation_and_completion_preflight.sql` | read-only-preflight | Workstation RPC diagnostics. |

## TypeScript expectations and missing base definitions

Static Supabase calls reference these 18 tables:

`audit_logs`, `clinic_settings`, `clinical_agents`, `clinical_hardware_devices`, `clinical_workstations`, `clinics`, `cycles`, `deployment_activation_execution_items`, `deployment_activation_execution_sessions`, `deployment_hardware_assignments`, `deployment_runs`, `load_items`, `packs`, `patient_traces`, `patients`, `providers`, `sterilizers`, and `user_roles`.

Repository SQL provides base definitions for only eight of those: clinics, workstations, agents, hardware devices, deployment runs, hardware assignments, and the two execution tables. Recovery repositories additionally require the two recovery tables defined in repository SQL.

Missing authoritative base definitions are:

- `audit_logs`;
- `clinic_settings`;
- `cycles`;
- `load_items`;
- `packs`;
- `patient_traces`;
- `patients`;
- `providers`;
- `sterilizers`;
- `user_roles`.

The repository also lacks authoritative sources for any policies attached to those tables, their full indexes/constraints/triggers, and any auth hooks they may use. These objects must come from a schema-only Production export and reconciliation—not inference from application queries.

### RPC mapping

TypeScript names match the 17 repository-defined deployment RPCs:

`activate_deployment_clinic`, `activate_deployment_provider_shell`, `complete_deployment_provider_shell_execution_item`, `activate_deployment_sterilizer_shell`, `complete_deployment_sterilizer_shell_execution_item`, `activate_deployment_workstation_shell`, `complete_deployment_workstation_shell_execution_item`, `activate_deployment_hardware_shell`, `complete_deployment_hardware_shell_execution_item`, `bind_deployment_hardware_target`, `claim_deployment_activation_execution_session`, `start_deployment_activation_execution_session`, `start_deployment_activation_execution_item`, `complete_deployment_activation_execution_item`, `progress_deployment_activation_execution_dependency`, `start_deployment_activation_execution_next_item`, and `persist_deployment_recovery_plan`.

Known deliberate naming mappings:

- domain `deploymentRunId` maps to `deployment_runs.deployment_run_id`;
- execution `deploymentRunKey` maps to `deployment_activation_execution_sessions.deployment_run_key`, while `deployment_run_record_id` is the UUID foreign key;
- TypeScript `operationalStatus` maps to hardware `status`;
- UUID entity identity and deterministic deployment keys remain separate columns.

No repository-defined activation-plan table exists: approved plan identity is persisted as `plan_key` plus execution items. This is consistent with current repositories but must be compared with Production.

## Expected repository-defined final objects

These counts describe the provisional repository-defined set, not the missing Production baseline:

- explicit extensions: **0**;
- tables created by selected sources: **11**;
- named indexes: **74**;
- functions: **25**, comprising 17 operational RPCs and 8 trigger helpers;
- triggers: **10**;
- views: **0**;
- explicitly RLS-enabled tables: **7** (`clinics`, `deployment_runs`, `deployment_hardware_assignments`, both execution tables, and both recovery tables);
- explicit `CREATE POLICY` statements: **0**;
- recovery table grants: `service_role` select only; public/anon/authenticated revoked;
- RPC execution: revoked from public/anon/authenticated and granted to `service_role` by the applicable RPC sources.

The 11 repository-created tables are `clinics`, `deployment_runs`, `clinical_workstations`, `clinical_agents`, `clinical_hardware_devices`, `workstation_sessions`, `deployment_hardware_assignments`, both activation execution tables, and both recovery tables.

Important incremental columns include clinic/deployment keys and provisioning fields on providers, sterilizers, workstations, and hardware; printer and clinic ownership fields on `clinic_settings`; execution ownership/lease fields; and workstation/sterilizer hardware binding fields.

## Duplicate, superseded, and drift analysis

1. **`clinics` duplicate:** `supabase_deployment_core.sql` and `supabase_clinics.sql` both define it. The evolved source has different constraints and lifecycle semantics. Use `supabase_clinics.sql`; do not run both.
2. **`deployment_runs` duplicate:** the core planning file uses a status/reviewed-payload model, while `supabase_deployment_runs.sql` uses deployment-run identity, idempotency, audit, lifecycle, and recovery evidence. They are incompatible.
3. **Trigger helper replacement:** `set_clinics_updated_at` is defined differently in the core and evolved clinic sources. The evolved clinic definition is authoritative.
4. **Execution preflight overlap:** `deployment-activation-execution-preflight.sql` predates the evolved `supabase_deployment_activation_execution_preflight.sql` and should remain historical evidence only.
5. **Patch-only sources:** provider, sterilizer, clinic settings, and printer files silently use `ALTER TABLE IF EXISTS`; on an empty database they may skip essential columns and then later statements or RPCs fail.
6. **Top-level data mutation:** `supabase_investigation_lifecycle.sql` updates existing cycle rows and is excluded from a clean baseline until the missing cycle source and actual need are reviewed.
7. **Conditional compatibility mutation:** `supabase_clinical_workstations.sql` can copy legacy `type` values and drop that column. Empty Staging does not trigger it, but rerun safety is not purely DDL.
8. **No policies:** active repository SQL enables RLS but defines no `CREATE POLICY`. This may be intentional deny-by-default for server-only deployment tables, but Production policies for application tables are missing from source.
9. **No extension declaration:** UUID defaults rely on `gen_random_uuid()`, which is available in supported PostgreSQL versions but installed extension state still requires export comparison.
10. **No storage source:** bucket definitions and storage policies are absent; verify whether Production uses Supabase Storage.
11. **Partial idempotency:** `CREATE IF NOT EXISTS` and `CREATE OR REPLACE` make many files rerunnable, but they do not reconcile mismatched existing objects. Drop/re-add constraints and conditional data updates require review.
12. **Unqualified patch SQL:** `supabase_printer_settings.sql` uses unqualified `clinic_settings`; execution depends on session search path and should be consolidated before automation.

## Provisional execution order after reconciliation

This is the exact proposed order for repository assets once missing base definitions have been supplied and compared. It is **not yet approved for execution**.

| Seq. | SQL file | Category | Objects/dependencies | Empty Staging | Idempotency | Data mutation on apply | Manual review |
|---:|---|---|---|---|---|---|---|
| 1 | `supabase_clinics.sql` | baseline | `clinics` | Yes | Partial | No | Required |
| 2 | `supabase_deployment_runs.sql` | baseline | `deployment_runs` | Yes | Partial | No | Required |
| 3 | Reconciled missing operational baseline | external prerequisite | Ten missing app tables, policies, functions | Unknown until export | Unknown | Must be schema-only | Blocking |
| 4 | `supabase_clinical_workstations.sql` | baseline | Workstations; `auth.users` | Yes | Partial | Conditional legacy conversion | Required |
| 5 | `supabase_clinical_agents.sql` | baseline | Agents; workstations, `auth.users` | Yes | Partial | No | Required |
| 6 | `supabase_clinical_hardware_devices.sql` | baseline | Hardware; agents, workstations | Yes | Partial | No | Required |
| 7 | `supabase_workstation_sessions.sql` | baseline | Sessions; workstations, `auth.users` | Yes | Partial | No | Required |
| 8 | `supabase_deployment_hardware_assignments.sql` | baseline | Assignments; clinics | Yes | Partial | No | Required |
| 9 | `supabase_clinic_settings_clinic_id.sql` | patch | Clinic settings; clinics | Only after reconciled base | Partial | No | Blocking review |
| 10 | `supabase_printer_settings.sql` | patch | Printer columns/constraints | Only after reconciled base | Partial | No | Blocking review |
| 11 | `supabase_providers_deployment_fields.sql` | patch | Provider deployment fields/FK/indexes | Only after reconciled base | Partial | No | Blocking review |
| 12 | `supabase_sterilizers_deployment_fields.sql` | patch | Sterilizer deployment fields/FK/indexes | Only after reconciled base | Partial | No | Blocking review |
| 13 | `supabase_clinical_workstations_deployment_fields.sql` | patch | Workstation deployment fields | Yes after seq. 4 | Partial | No | Required |
| 14 | `supabase_clinical_hardware_devices_deployment_fields.sql` | patch | Hardware deployment fields | Yes after seq. 6 | Partial | No | Required |
| 15 | `supabase_clinical_hardware_devices_sterilizer_bindings.sql` | patch | Sterilizer binding FK/constraints/indexes | After seq. 6 and 12 | Partial | No | Required |
| 16 | `supabase_deployment_tables_rls_baseline.sql` | security | RLS on runs/assignments | After seq. 2 and 8 | Yes | No | Required |
| 17 | `supabase_deployment_activation_execution.sql` | baseline | Execution tables, triggers, RLS | After clinics/runs | Partial | No | Required |
| 18 | `supabase_deployment_activation_execution_claim.sql` | RPC/patch | Ownership columns, indexes, claim RPC | After seq. 17 | Partial | No; runtime DML in function | Required |
| 19 | `supabase_deployment_activation_execution_start.sql` | RPC | Session start | After seq. 18 | Replaceable | No; runtime DML in function | Required |
| 20 | `supabase_deployment_activation_execution_item_start.sql` | RPC | Selected item start | After seq. 18 | Replaceable | No; runtime DML in function | Required |
| 21 | `supabase_deployment_activation_execution_item_completion.sql` | RPC | Generic item completion | After seq. 18 | Replaceable | No; runtime DML in function | Required |
| 22 | `supabase_deployment_activation_execution_dependency_progression.sql` | RPC | Dependency progression | After seq. 18 | Replaceable | No; runtime DML in function | Required |
| 23 | `supabase_deployment_activation_execution_next_item_start.sql` | RPC | Successor start | After seq. 18 | Replaceable | No; runtime DML in function | Required |
| 24 | `supabase_deployment_clinic_activation.sql` | RPC | Clinic activation | Clinics, runs, execution | Replaceable | No; runtime DML in function | Required |
| 25 | `supabase_deployment_provider_shell_activation.sql` | RPC | Provider activation | Providers, execution | Replaceable | No; runtime DML in function | Required |
| 26 | `supabase_deployment_provider_shell_execution_item_completion.sql` | RPC | Provider completion | Providers, execution | Replaceable | No; runtime DML in function | Required |
| 27 | `supabase_deployment_sterilizer_shell_activation_and_completion.sql` | RPC | Sterilizer activation/completion | Sterilizers, execution | Replaceable | No; runtime DML in functions | Required |
| 28 | `supabase_deployment_workstation_shell_activation_and_completion.sql` | RPC | Workstation activation/completion | Workstations, execution | Replaceable | No; runtime DML in functions | Required |
| 29 | `supabase_deployment_hardware_shell_activation_and_completion.sql` | RPC | Hardware activation/completion | Hardware, execution | Replaceable | No; runtime DML in functions | Required |
| 30 | `supabase_deployment_hardware_binding.sql` | RPC | Binding mutation | Hardware, assignments, workstations, sterilizers, execution | Replaceable | No; runtime DML in function | Required |
| 31 | `supabase_deployment_recovery_plan_persistence.sql` | baseline/RPC | Recovery tables, triggers, RLS, persistence RPC | After clinics/runs/execution | Partial | No; runtime inserts in function | Required |

The investigation repair, superseded core file, historical preflight, and every preflight are deliberately excluded from mutation execution.

## Staging application batches

### Batch A — Reconciled foundation (blocking)

- Produce a schema-only Production export covering public schema, functions, grants, policies, triggers, indexes, extensions, and storage metadata.
- Reconcile the ten missing base tables and the two conflicting legacy definitions.
- Expected fresh row count: zero in every public application table.
- Stop if the export reveals a manual Production object with no reviewed source or if auth/storage dependencies are unclear.

### Batch B — Clinic, deployment, and operational persistence

- Proposed sequences 1–16 after Batch A approval.
- Verify tables/columns via `information_schema`, named constraints via `pg_constraint`, indexes via `pg_indexes`, and zero rows.
- Repository-defined contribution: seven core tables before execution/recovery, plus deployment columns and RLS on runs/assignments.
- RLS expected at this point: clinics, deployment runs, and hardware assignments enabled; operational table RLS must match the reconciled Production export.

### Batch C — Execution control

- Proposed sequences 17–23.
- Expected new tables: two; expected rows: zero.
- Expected RPCs: claim, session start, item start, generic item completion, dependency progression, successor start.
- Run the evolved execution preflight and every paired RPC preflight. Require service-role-only execution and fixed search paths where specified.

### Batch D — Entity activation and binding

- Proposed sequences 24–30.
- Expected RPCs: clinic activation; provider activation/completion; sterilizer activation/completion; workstation activation/completion; hardware activation/completion; hardware binding.
- Expected row changes from applying definitions: zero.
- Run all paired activation/binding preflights and verify UUID/deployment-key, ownership, lease, clinic, and selected-row mutation boundaries.

### Batch E — Recovery persistence

- Proposed sequence 31.
- Expected new tables: two; rows: zero.
- Expected functions: recovery updated-at helper and `persist_deployment_recovery_plan`.
- Expected RLS: enabled on both tables; direct public/anon/authenticated access revoked; service role select and RPC execute only.
- Run the 35-case source harness, SQL preflight, then the explicit isolated RC10.9 staging fixture only after the environment safety gate is configured.

### Batch F — Security reconciliation

- Compare every RLS flag, policy, grant, revoke, function owner/security mode, and search path to the approved export.
- Repository SQL expects seven RLS-enabled deployment-owned tables and zero explicit policies; any additional Production policies must be reconciled rather than omitted.
- Verify no browser role can execute service-role RPCs.

### Batch G — Read-only verification

- Run all 27 authoritative read-only preflights in dependency order.
- Run repository/service harnesses, build, and controlled Staging deployment checks.
- Expected public application row counts remain zero except explicit test-owned fixtures, which must clean up successfully.

## Validation queries and stop conditions

For each batch, use read-only catalog queries against:

- `information_schema.tables` and `information_schema.columns` for object/column presence;
- `pg_constraint` for type and normalized definition;
- `pg_indexes` for exact index definitions;
- `pg_proc` plus `pg_get_functiondef`/`pg_get_function_identity_arguments` for signatures and bodies;
- `pg_trigger` for enabled non-internal triggers;
- `pg_class.relrowsecurity` and `pg_policies` for RLS;
- `information_schema.role_table_grants` and function ACLs for grants/revokes;
- `pg_extension` for extensions;
- `pg_views` for views;
- `storage.buckets` and storage policies only if the export proves Storage is used.

Stop immediately when:

- the target project identity is not exactly the approved Staging project `sterisphere-staging`;
- any environment value or project reference points to Production `sterisphere`;
- an expected prerequisite is missing;
- a statement fails or produces an unexpected row mutation;
- object definitions differ from the approved release manifest;
- a preflight reports missing, duplicate, unsafe, or unauthorized objects;
- cleanup of an explicit test fixture fails.

Do not continue later batches after a failure. Record sanitized evidence and prepare a reviewed forward correction.

## Safety plan

- Confirm project name/ref and region through two independent identifiers before any future SQL execution.
- Use a Staging-only operator session; never load a Production service-role key into an integration runner.
- Do not commit URLs, keys, database passwords, access tokens, or exported data.
- Schema export must be schema-only. Do not copy auth users, clinics, hardware, audit history, execution evidence, or tenant rows.
- Do not create real users or clinics in Staging; fixtures must be visibly test-owned and cleanup guarded.
- Never run `supabase_investigation_lifecycle.sql` merely to establish parity; review whether its resulting columns/constraints belong in the consolidated baseline without its row updates.
- Do not initialize Supabase CLI or create migrations until the reconciliation milestone is approved.
- Production remains read-only for audit/export in the future separately authorized step; Phase 10.1 performs neither.

## Required next milestone

Before staged execution:

1. obtain an authorized schema-only Production export;
2. compare it with the 60-file inventory and TypeScript expectations;
3. identify manual Production-only objects, policies, extensions, storage definitions, and auth hooks;
4. select or create reviewed authoritative base definitions for the ten missing tables;
5. consolidate patch-only and superseded history into an ordered, checksum-able baseline proposal;
6. rerun this dependency and count analysis against that proposal;
7. review before applying anything to Staging.

Until then, Staging must be considered **unsynchronized**.
