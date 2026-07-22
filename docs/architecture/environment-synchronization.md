# Environment Synchronization and SQL Inventory

## Synchronization contract

Staging and Production share one structural contract but never share operational data. Synchronization promotes reviewed definitions—schema, RLS, grants, RPCs, indexes, extensions, and future storage policy—not rows from tenant or control tables.

The repository currently has standalone SQL assets rather than an ordered migration ledger. Consequently, the current process is manual and must be evidence-driven. Filenames do not constitute a safe execution order, and files using `create ... if not exists` are not proof that existing definitions match.

## Current manual process

For each database change:

1. Identify the exact source SQL and its paired read-only preflight.
2. Record review approval, file checksums, prerequisites, expected objects, and rollback/forward-fix notes in the release record.
3. Apply the reviewed SQL to Staging only.
4. Run the paired preflight and relevant application integration tests in Staging.
5. Compare the Staging definition to the reviewed source, including function bodies, signatures, grants, RLS, indexes, constraints, triggers, extensions, and storage policies where applicable.
6. Freeze the application artifact and SQL checksums approved for promotion.
7. Apply the identical SQL to Production in dependency order during the approved release window.
8. Run read-only Production preflights and bounded smoke validation.
9. Record results, timestamps, operator, environment/project identity, and any drift. Never record credentials or raw sensitive errors.

If Staging and Production differ unexpectedly, stop promotion. Reconcile through a new reviewed forward migration; do not edit Production manually and later alter source to resemble it.

## Dependency ordering principles

The repository inventory is not itself a migration plan. When constructing a reviewed release manifest, order assets by dependency:

1. required extensions;
2. tenancy/root tables such as clinics;
3. deployment-run and planning tables;
4. operational entity columns and constraints;
5. execution/recovery tables;
6. indexes and triggers;
7. RLS enablement and policies;
8. functions/RPCs;
9. grants and revokes;
10. read-only preflights.

RPC replacements must follow schema changes they reference. Security grants must follow function creation. Preflights run after their source asset and again after the complete release set.

## SQL category definitions

- **Schema/baseline:** creates core tables, columns, constraints, indexes, triggers, or extensions.
- **Schema migration:** additive evolution of an existing object. It is not a repeatable substitute for migration tracking.
- **RPC/security:** defines atomic functions, grants/revokes, fixed search paths, or RLS controls.
- **Preflight/testing:** read-only diagnostics; must not be promoted as mutation SQL.
- **Seed:** deterministic non-production reference/test data. None is currently identified.
- **Repair:** bounded data correction for an established defect. None is currently identified as an authoritative repair asset.
- **Maintenance:** recurring administrative SQL. None is currently identified.

## Complete SQL inventory

The inventory contains **60 assets**: 29 repository-root files and 31 architecture files. There are 28 named preflights and 32 non-preflight schema/security/RPC assets.

### Repository-root SQL

| Asset | Category | Purpose / promotion note |
|---|---|---|
| `supabase_activation_plan_preflight.sql` | Preflight/testing | Activation-plan schema and data diagnostics. |
| `supabase_activation_readiness_preflight.sql` | Preflight/testing | Activation-readiness contract diagnostics. |
| `supabase_assignment_target_validation_preflight.sql` | Preflight/testing | Assignment target validation diagnostics. |
| `supabase_clinical_agents.sql` | Schema + RLS/security | Clinical-agent persistence, triggers, and access controls. |
| `supabase_clinical_hardware_devices.sql` | Schema + RLS/security | Clinical hardware baseline. |
| `supabase_clinical_hardware_devices_deployment_fields.sql` | Schema migration | Deployment identity/provisioning fields for hardware. |
| `supabase_clinical_hardware_devices_deployment_preflight.sql` | Preflight/testing | Hardware deployment-field diagnostics. |
| `supabase_clinical_hardware_devices_sterilizer_bindings.sql` | Schema migration | V1 sterilizer binding columns, constraints, and indexes. |
| `supabase_clinical_hardware_devices_sterilizer_bindings_preflight.sql` | Preflight/testing | Sterilizer-binding migration diagnostics. |
| `supabase_clinical_workstations.sql` | Schema + RLS/security | Clinical workstation baseline. |
| `supabase_clinical_workstations_deployment_fields.sql` | Schema migration | Workstation deployment identity/provisioning fields. |
| `supabase_clinical_workstations_deployment_preflight.sql` | Preflight/testing | Workstation deployment-field diagnostics. |
| `supabase_clinic_settings_clinic_id.sql` | Schema migration | Clinic ownership link for clinic settings. |
| `supabase_clinics.sql` | Schema + RLS/security | Canonical clinic tenancy root. |
| `supabase_clinics_preflight.sql` | Preflight/testing | Clinic schema and readiness diagnostics. |
| `supabase_deployment_core.sql` | Legacy schema planning | Early deployment-engine planning schema. Reconcile before migration adoption; do not apply blindly over the evolved model. |
| `supabase_deployment_hardware_assignments.sql` | Schema/function | Durable planned hardware assignments. |
| `supabase_deployment_hardware_assignments_preflight.sql` | Preflight/testing | Hardware-assignment diagnostics. |
| `supabase_deployment_runs.sql` | Schema/baseline | Deployment-run persistence boundary. |
| `supabase_deployment_tables_rls_baseline.sql` | RLS/security | Deny-by-default RLS baseline for deployment tables. |
| `supabase_deployment_tables_rls_preflight.sql` | Preflight/testing | Deployment-table RLS and policy diagnostics. |
| `supabase_investigation_lifecycle.sql` | Schema migration | Investigation lifecycle fields and related definitions. |
| `supabase_planned_assignment_resolution_preflight.sql` | Preflight/testing | Planned assignment resolution diagnostics. |
| `supabase_printer_settings.sql` | Schema migration | Printer settings persistence definitions. |
| `supabase_providers_deployment_fields.sql` | Schema migration | Provider deployment identity/provisioning fields. |
| `supabase_providers_preflight.sql` | Preflight/testing | Provider deployment-field diagnostics. |
| `supabase_sterilizers_deployment_fields.sql` | Schema migration | Sterilizer deployment identity/provisioning fields. |
| `supabase_sterilizers_preflight.sql` | Preflight/testing | Sterilizer deployment-field diagnostics. |
| `supabase_workstation_sessions.sql` | Schema + RLS/security | Workstation session persistence and triggers. |

### Architecture SQL

| Asset under `docs/architecture/` | Category | Purpose / promotion note |
|---|---|---|
| `deployment-activation-execution-preflight.sql` | Preflight/testing | Earlier read-only activation-execution readiness checks. Retain as historical/diagnostic evidence until consolidated. |
| `supabase_deployment_activation_execution.sql` | Schema + RLS/security | Execution session/item tables, constraints, indexes, triggers, and security baseline. |
| `supabase_deployment_activation_execution_preflight.sql` | Preflight/testing | Execution persistence contract diagnostics. |
| `supabase_deployment_activation_execution_claim.sql` | RPC/security | Atomic execution-session claim boundary. |
| `supabase_deployment_activation_execution_claim_preflight.sql` | Preflight/testing | Claim RPC signature, security, and mutation-boundary diagnostics. |
| `supabase_deployment_activation_execution_dependency_progression.sql` | RPC/security | Atomic dependency progression. |
| `supabase_deployment_activation_execution_dependency_progression_preflight.sql` | Preflight/testing | Dependency progression diagnostics. |
| `supabase_deployment_activation_execution_item_completion.sql` | RPC/security | Generic execution-item completion. |
| `supabase_deployment_activation_execution_item_completion_preflight.sql` | Preflight/testing | Generic completion diagnostics. |
| `supabase_deployment_activation_execution_item_start.sql` | RPC/security | Atomic selected execution-item start. |
| `supabase_deployment_activation_execution_item_start_preflight.sql` | Preflight/testing | Item-start diagnostics. |
| `supabase_deployment_activation_execution_next_item_start.sql` | RPC/security | Atomic eligible successor start. |
| `supabase_deployment_activation_execution_next_item_start_preflight.sql` | Preflight/testing | Successor-start diagnostics. |
| `supabase_deployment_activation_execution_start.sql` | RPC/security | Execution-session start boundary. |
| `supabase_deployment_activation_execution_start_preflight.sql` | Preflight/testing | Session-start diagnostics. |
| `supabase_deployment_clinic_activation.sql` | RPC/security | Clinic activation transition. |
| `supabase_deployment_clinic_activation_preflight.sql` | Preflight/testing | Clinic activation diagnostics. |
| `supabase_deployment_hardware_binding.sql` | RPC/security | Atomic V1 workstation/sterilizer hardware binding. |
| `supabase_deployment_hardware_binding_preflight.sql` | Preflight/testing | Hardware-binding schema, security, and mutation diagnostics. |
| `supabase_deployment_hardware_shell_activation_and_completion.sql` | RPC/security | Hardware shell activation and same-item completion RPCs. |
| `supabase_deployment_hardware_shell_activation_and_completion_preflight.sql` | Preflight/testing | Hardware activation/completion diagnostics. |
| `supabase_deployment_provider_shell_activation.sql` | RPC/security | Provider shell activation. |
| `supabase_deployment_provider_shell_activation_preflight.sql` | Preflight/testing | Provider activation diagnostics. |
| `supabase_deployment_provider_shell_execution_item_completion.sql` | RPC/security | Provider same-item completion. |
| `supabase_deployment_provider_shell_execution_item_completion_preflight.sql` | Preflight/testing | Provider completion diagnostics. |
| `supabase_deployment_recovery_plan_persistence.sql` | Schema + RPC + RLS/security | Immutable recovery parent/children and atomic persistence RPC. Planning persistence only. |
| `supabase_deployment_recovery_plan_persistence_preflight.sql` | Preflight/testing | Recovery persistence schema, security, ordering, and mutation-boundary diagnostics. |
| `supabase_deployment_sterilizer_shell_activation_and_completion.sql` | RPC/security | Sterilizer activation and same-item completion. |
| `supabase_deployment_sterilizer_shell_activation_and_completion_preflight.sql` | Preflight/testing | Sterilizer activation/completion diagnostics. |
| `supabase_deployment_workstation_shell_activation_and_completion.sql` | RPC/security | Workstation activation and same-item completion. |
| `supabase_deployment_workstation_shell_activation_and_completion_preflight.sql` | Preflight/testing | Workstation activation/completion diagnostics. |

### Inventory gaps and controls

- **Seeds:** none. Staging fixtures are created through explicit, safety-gated application fixtures, not Production-promoted seed SQL.
- **Storage:** no bucket or `storage.objects` definitions are present. Before using Supabase Storage, add repository-managed bucket, policy, RLS, and preflight definitions and include them in the structural synchronization contract.
- **Extensions:** no consolidated extension manifest exists. Future baseline work must inventory installed extensions in both projects and manage required extensions through migrations.
- **Repairs/maintenance:** no authoritative repair or scheduled-maintenance category exists. Future files must be clearly named, scoped, idempotency-reviewed, environment-restricted, and kept separate from ordinary migrations.
- **Legacy overlap:** `supabase_deployment_core.sql` and the older activation execution preflight reflect earlier planning. Baseline reconciliation must choose authoritative evolved definitions rather than replaying every historical file.

## Future migration lifecycle

```text
feature requirement
  -> immutable SQL migration
  -> code/schema/security review
  -> disposable database apply and preflight
  -> Staging apply
  -> Staging repository/service/integration validation
  -> release approval and immutable checksum manifest
  -> Production apply of the identical migration set
  -> read-only Production verification
```

Future migrations should be timestamped, append-only, transaction-aware, and paired with automated assertions. Applied migrations must never be edited. Corrections use a new forward migration. Destructive changes require an explicit expand/migrate/contract plan and independent data-recovery review.

## Drift detection target

Automated synchronization should compare metadata, not tenant rows:

- tables, columns, types, nullability, defaults, generated values, constraints, and foreign keys;
- indexes, triggers, sequences, and required extensions;
- normalized function definitions, argument types, return types, volatility, security mode, and search path;
- RLS enablement, policies, grants, and revokes;
- storage buckets and policies when introduced;
- ordered migration versions and checksums.

Any drift blocks promotion until reconciled. Intentional environment differences must be represented as configuration, never as undocumented schema divergence.

## Release evidence

Each promotion record should identify:

- source commit and immutable build identifier;
- migration versions and checksums;
- target Supabase project/environment identity without credentials;
- Staging validation results and approver;
- Production application and read-only verification results;
- known limitations and forward-fix procedure.

Database rollback is not defined by Phase 10.0. Failed promotion handling remains stop, assess, and apply a reviewed forward fix unless a separately approved recovery procedure exists.
