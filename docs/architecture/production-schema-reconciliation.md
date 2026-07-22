# Production schema reconciliation

## Decision boundary

Phase 10.1 selected Production schema capture and reconciliation before any Staging application. Phase 10.2 provides the comparison framework only. It does not make the repository authoritative, rewrite SQL, produce a migration baseline, or authorize a Staging or Production change.

The comparison has three independent evidence sets:

```text
reviewed Production schema capture
  vs. repository SQL inventory (60 assets)
  vs. application TypeScript persistence expectations
```

A match between any two sets does not resolve a disagreement with the third. Every object must have an explicit classification and source decision.

## Inputs

### Production evidence

Use only a schema-only capture that passed `validate-production-schema-capture.cjs` and manual review. The deterministic manifest provides object-name inventory; the reviewed raw DDL supplies columns, types, defaults, constraints, function signatures/bodies, grants, RLS, policies, triggers, and extension configuration.

Do not use a data export, dashboard screenshot, inferred API response, or stale local schema as Production evidence.

### Repository evidence

`staging-schema-synchronization-plan.md` is the current complete classification of all **60 SQL assets**:

- 29 repository-root SQL files;
- 31 files under `docs/architecture`;
- 9 baseline-required;
- 17 incremental-required;
- 27 read-only-preflight;
- 1 repair-only;
- 1 historical;
- 1 superseded;
- 4 uncertain-needs-review.

Run `node scripts/check-sql-inventory.cjs` before reconciliation. It fails if the 60 documented entries and SQL files on disk diverge. A changed count requires Phase 10.1 inventory review before continuing.

### TypeScript evidence

Static repository access currently references these 18 tables:

`audit_logs`, `clinic_settings`, `clinical_agents`, `clinical_hardware_devices`, `clinical_workstations`, `clinics`, `cycles`, `deployment_activation_execution_items`, `deployment_activation_execution_sessions`, `deployment_hardware_assignments`, `deployment_runs`, `load_items`, `packs`, `patient_traces`, `patients`, `providers`, `sterilizers`, and `user_roles`.

Ten lack authoritative base-table SQL in the repository: `audit_logs`, `clinic_settings`, `cycles`, `load_items`, `packs`, `patient_traces`, `patients`, `providers`, `sterilizers`, and `user_roles`. Production capture is expected to provide evidence about their actual definitions; it does not automatically turn generated dump text into approved repository source.

TypeScript currently maps 17 deployment RPC names:

- `activate_deployment_clinic`;
- provider, sterilizer, workstation, and hardware activation/completion RPCs;
- `bind_deployment_hardware_target`;
- execution claim, session start, item start, item completion, dependency progression, and successor start RPCs;
- `persist_deployment_recovery_plan`.

Compare exact function identity, argument names/order/types/defaults, return type/shape, volatility, `SECURITY DEFINER`, fixed `search_path`, grants, revokes, and relevant body contract. Name equality alone is not a match.

## Reconciliation record

Create one row per independently deployable object in a separately reviewed reconciliation artifact. Use these fields:

| Field | Meaning |
|---|---|
| Object category | schema, extension, table, column set, constraint, view, function/RPC, trigger, index, RLS, policy, grant/revoke, storage definition. |
| Object identity | Fully qualified object name; include function argument types for overloads. |
| Production evidence | Manifest/raw-DDL location and normalized fingerprint. Never include data or credentials. |
| Repository evidence | Owning SQL asset(s), classification, and relevant source location. |
| TypeScript evidence | Repository/service/type references, or `none`. |
| Classification | One category from the authoritative list below. |
| Conflict details | Structural difference stated without tenant data. |
| Proposed authority | Production, repository, new reviewed definition, environment-specific, or unresolved. |
| Action | Preserve, normalize, author baseline, author forward migration, retire historical source, or manual review. |
| Validation | Required preflight, integration harness, and security check. |
| Approval | Reviewer and decision record outside generated manifest. |

Never place passwords, keys, connection strings, table values, user identities, or tenant identifiers in a reconciliation row.

## Difference categories

| Classification | Rule | Required disposition |
|---|---|---|
| `matching` | Production and the current repository owner are structurally equivalent, and TypeScript expectations are compatible. | Mark the repository owner candidate for the future baseline; still verify security and dependencies. |
| `production-only` | Production contains an object with no repository owner and no established environment-specific reason. | Determine runtime dependency and provenance; author reviewed source or explicitly retire later. |
| `repository-only` | Repository defines an object absent from Production. | Decide whether it is unapplied future work, historical, superseded, or invalid; never apply automatically. |
| `conflicting` | Same identity has different structure, semantics, or security across evidence sets. | Stop; choose authority explicitly and produce a reviewed forward definition. |
| `missing authoritative source` | Application or dependent SQL requires an object whose base definition is not owned by repository SQL. | Use Production as evidence, then author a deliberate baseline definition. |
| `historical` | Asset records an obsolete model and is not a current deployment source. | Retain or relocate as history; exclude from executable baseline. |
| `environment-specific` | Difference is intentionally project-owned, such as platform-managed roles/configuration. | Document ownership and comparison rule; do not force convergence blindly. |
| `requires manual review` | Evidence is incomplete, ambiguous, sensitive, or tool parsing cannot establish equivalence. | Block baseline and Staging application until resolved. |

## Comparison passes

### Pass 1: inventory and identity

1. Validate both raw captures and regenerate the deterministic manifest.
2. Run the 60-asset inventory check.
3. Extract repository object owners from the Phase 10.1 selected source set, excluding preflight, historical, superseded, and repair-only files from ownership.
4. Compare schemas, extensions, tables, views, sequences, functions, triggers, indexes, constraints, RLS-enabled tables, policies, and privilege targets by qualified identity.
5. Record Production-only and repository-only objects without changing either environment.

### Pass 2: tables and columns

For every Production and TypeScript-referenced table, compare:

- column names, order only where semantically relevant, types, array/domain/enum identity;
- nullability, defaults, generated/identity behavior;
- primary, unique, check, exclusion, and foreign-key constraints;
- referenced schemas/tables and delete/update actions;
- indexes, expressions, predicates, include columns, uniqueness, and operator classes;
- triggers and trigger helpers;
- RLS enabled/forced state, policies, and table/sequence privileges.

Give priority to Phase 10.1 conflicts around `clinics`, `deployment_runs`, and `set_clinics_updated_at`, plus the ten TypeScript tables without base SQL. `CREATE ... IF NOT EXISTS` is not evidence of equivalence.

### Pass 3: functions and RPCs

For each function, compare the full identity and normalized definition. Separate trigger helpers from externally callable RPC candidates. Confirm:

- application RPC names exist with expected signatures;
- body dependencies resolve to reconciled columns and tables;
- `SECURITY DEFINER` and fixed `search_path` contracts match source expectations;
- executable privileges are revoked from browser/public roles where required and granted only to intended roles;
- mutation boundaries remain the ones verified by paired read-only preflights.

Production-only functions require provenance review. Repository-only functions remain unapplied proposals until their dependencies and Staging plan are approved.

### Pass 4: platform security and storage

A public-schema comparison is insufficient. Compare the structural auth/storage capture for:

- custom policies and functions touching `auth` or `storage`;
- storage bucket definitions expected to be release-owned, if any are later identified;
- grants/revokes spanning platform schemas;
- extensions installed outside `public`;
- platform-managed objects that must be classified `environment-specific` rather than copied.

Never compare auth user rows, storage object rows, JWT/config values, or bucket contents. Phase 10.1 found no repository storage definition or explicit `CREATE POLICY`; absence in source must be reconciled, not assumed safe.

### Pass 5: TypeScript contract

For each `.from()` and `.rpc()` boundary, map selected/inserted/updated fields to reconciled database definitions. Confirm casing transformations, nullable/default expectations, UUID/deployment-key distinctions, evidence JSON shape, and returned RPC columns. Classify a code-only expectation as `missing authoritative source` or `conflicting`, not as proof that Production is wrong.

### Pass 6: proposed baseline

Only after every blocking row is resolved, prepare a separate proposal containing:

1. canonical baseline definitions;
2. immutable forward migrations for differences that must change an existing environment;
3. an ordered dependency graph;
4. security ownership and policy definitions;
5. paired preflights and disposable-database validation;
6. explicit Staging batches and stop conditions.

Do not mechanically concatenate the Production dump or the 60 SQL files. Generated dump ordering, platform ownership, repeated helpers, patch-only assets, historical definitions, and `IF NOT EXISTS` clauses require normalization and review.

## Security comparison rules

A function or table is not `matching` until privileges and RLS are compared. Record separately:

- RLS enabled and forced flags;
- every policy name, command, roles, `USING`, and `WITH CHECK` expression;
- table, sequence, schema, and function grants/revokes;
- function security mode and `search_path`;
- extension schema and version requirement;
- trigger function ownership without copying environment-specific owner names into a baseline.

The manifest intentionally records names/targets rather than bodies. Security equivalence requires reviewed raw DDL.

## Stop conditions

Stop reconciliation and do not prepare Staging SQL when:

- capture validation or manual review fails;
- Production identity or capture completeness is uncertain;
- the 60-asset inventory check fails;
- sensitive values or data appear in evidence;
- an application-referenced table/RPC cannot be mapped;
- conflicts in tenancy, RLS, grants, or service-role boundaries are unresolved;
- generated platform objects cannot be distinguished from custom objects;
- an object is proposed for deletion or mutation without a separate approved migration;
- anyone proposes applying the raw dump directly.

## Completion criteria and next milestone

Reconciliation is complete only when every Production manifest object, every current repository-owned object, every TypeScript table/RPC expectation, and every security/storage category has a disposition. The output must identify the canonical owner and future validation for each object without changing either database.

The later authoritative-baseline milestone may then author migrations and validate them in a disposable database. Staging remains untouched until that baseline is reviewed, dependency-ordered, and approved under the release workflow in `environment-synchronization.md`.
