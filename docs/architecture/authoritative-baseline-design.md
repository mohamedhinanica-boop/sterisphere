# Authoritative baseline design

## Purpose and decision boundary

This document designs the future clean-environment SteriSphere database
baseline. It does not generate a migration and does not authorize execution.
It uses the validated Production schema-only capture
`.tmp/schema-captures/20260723T031930Z/`, repository SQL, the Phase 10.4
reconciliation report, and non-test TypeScript database references.

The machine-readable companion is
`docs/architecture/authoritative-baseline-object-registry.json`. It contains
structured metadata rather than executable SQL or embedded dump text.

## Baseline authority model

Authority is selected per object:

1. The Production capture is structural authority for objects missing from
   repository SQL and evidence of the deployed final state.
2. Evolved repository SQL is design authority where it clearly supersedes an
   older repository definition and matches Production.
3. TypeScript is runtime-usage evidence, not schema authority.
4. Supabase-managed `auth`, `storage`, and `extensions` internals are platform
   prerequisites, not application baseline DDL.
5. Security objects require explicit review even when Production is their only
   source. Existing deployment is evidence, not automatic approval.

Each registry entry records identity, presence, runtime use, source,
dependencies, disposition, risk, notes, and unresolved decisions. Columns,
constraints, indexes, functions, policies, triggers, RLS state, and ACLs add
typed `details`.

## Registry scope and counts

| Object type | Entries |
|---|---:|
| Schemas | 4 |
| Explicit-extension set | 1 |
| Public custom-type set | 1 |
| Tables | 23 |
| Columns | 385 |
| Primary keys | 21 |
| Foreign keys | 31 |
| Unique constraints | 9 |
| Check constraints | 58 |
| Indexes | 82 |
| Functions | 9 |
| RPCs | 17 |
| Triggers | 12 |
| RLS enablements | 21 |
| Policies | 27 |
| Grants | 104 |
| Revokes | 17 |
| Excluded/validation SQL assets | 29 |
| **Total** | **851** |

The 23 table entries comprise 21 Production application tables and two
repository-only planning tables marked `exclude`. The 82 indexes comprise 77
Production indexes and five repository-only indexes marked `exclude`.

No public `CREATE TYPE`, `CREATE DOMAIN`, view, materialized view, or sequence
exists in the capture. The sole captured sequence is
`auth.refresh_tokens_id_seq` and remains platform-managed. All application UUID
keys use `gen_random_uuid()` defaults rather than application sequences.

The capture emitted zero explicit extension objects. Clean initialization must
still confirm the platform prerequisite that supplies `gen_random_uuid()` and
any other installed-function dependency.

## Schema and platform boundary

| Schema | Baseline treatment |
|---|---|
| `public` | Application-managed; include normalized SteriSphere objects |
| `auth` | Supabase platform prerequisite; reference `auth.users`/auth helpers, do not recreate internals |
| `storage` | Supabase platform prerequisite; no SteriSphere bucket/policy definition was found |
| `extensions` | Supabase platform prerequisite; do not copy platform helper functions |

The future baseline must fail early if required platform schemas, roles, or
functions are unavailable. It must not attempt to own Supabase platform
migrations.

## Ten Production tables without authoritative repository bases

All ten are directly referenced by runtime TypeScript and must be included.
Production is the proposed structural authority, subject to the security and
duplicate-constraint decisions below.

### `audit_logs`

- Columns: `id uuid NOT NULL DEFAULT gen_random_uuid()`, `action text NOT
  NULL`, `entity_type text NOT NULL`, `entity_id text`, `description text`,
  `user_email text`, `metadata jsonb`, `created_at timestamptz DEFAULT now()`.
- Constraints: primary key `audit_logs_pkey(id)`.
- Standalone indexes/triggers: none.
- RLS: enabled.
- Policies: authenticated insert with `WITH CHECK (true)`; authenticated
  select with `USING (true)`.
- Consumers: audit writer/page, assistant activity, dashboard, reports.
- Dependent functions: no captured public function dependency.
- Disposition: include; approve captured definition and policy semantics.

### `clinic_settings`

- Columns: 25 captured columns covering clinic identity/contact, pack expiry,
  sound settings, printer model/connection/address/label dimensions, local
  print-agent URL, timestamps, and `clinic_id`.
- Key types/defaults: UUID key via `gen_random_uuid()`; Boolean feature
  defaults; `pack_expiration_days` 365; printer model
  `brother_ql_820nwb`; connection `wifi`; port 9100; label 50x30 mm; local
  agent `http://localhost:8787`.
- Constraints: primary key; FK `clinic_id -> clinics.id ON DELETE RESTRICT`;
  printer model and connection checks are `NOT VALID`.
- Index: partial unique `clinic_settings_clinic_id_unique_idx(clinic_id)`.
- Triggers: none. RLS: enabled.
- Policies: authenticated insert/update/select, all predicates literal `true`.
- Consumers: settings UI, printer agent, deployment planning/readiness and
  clinic-settings repository.
- Dependent functions: deployment execution/plan/readiness read this table.
- Disposition: include after deciding whether `NOT VALID`, localhost default,
  and unrestricted authenticated policy semantics are intentional.

### `cycles`

- Columns: 21 captured columns covering cycle identity/state, load/operator,
  timing/release/review, expected pack count, and investigation lifecycle.
- Defaults: UUID key, timestamps, `cycle_state='Open'`,
  `investigation_status='Open'`, root cause
  `Unknown / Under Investigation`, checklist `{}`.
- Constraints: primary key; investigation status and root-cause checks.
- Standalone indexes/triggers: none. RLS: enabled.
- Policies: PUBLIC insert/select/update with literal `true`.
- Consumers: cycle, inventory, investigation, dashboard, traceability, patient,
  pack, and report modules.
- Dependent functions: no captured public function dependency.
- Disposition: include final captured shape; do not replay the repair DML in
  `supabase_investigation_lifecycle.sql`. PUBLIC write access is a critical
  approval decision.

### `load_items`

- Columns: `id uuid`, `cycle_id uuid`, `pack_type text`, `quantity integer`,
  `created_at timestamptz`.
- Constraints: primary key; cascading FK to `cycles`.
- Standalone indexes/triggers: none. RLS: enabled.
- Policies: authenticated insert/select/update, all predicates literal `true`.
- Consumers: cycle creation, pack generation, investigation.
- Disposition: include; approve policy and whether a quantity check/index is
  intentionally absent.

### `packs`

- Columns: 20 captured columns covering pack identity/type/contents, cycle and
  load position, sterilization/expiry/status, label count, and expired-review
  evidence.
- Constraints: primary key; FK to `cycles`; unique `pack_number`.
- Standalone indexes/triggers: none. RLS: enabled.
- Policies: PUBLIC insert/select; authenticated update for expired review;
  all predicates literal `true`.
- Consumers: inventory, cycles, patients, traceability, labels, dashboard,
  investigation, and reports.
- Disposition: include; policy boundary requires critical review.

### `patient_traces`

- Columns: trace UUID, patient and pack UUIDs/names/numbers, procedure,
  provider, treatment room, creator and timestamp.
- Constraints: primary key; FKs to `packs` and `patients`; unique
  `pack_number`; unique `pack_id`.
- Standalone indexes/triggers: none. RLS: enabled.
- Policies: PUBLIC insert/select with literal `true`.
- Consumers: patient history, trace pages, pack detail, dashboard,
  investigation, reports, and traceability services.
- Disposition: include; approve PUBLIC access and confirm both uniqueness
  rules reflect one-pack/one-trace intent.

### `patients`

- Columns: `id uuid`, `external_id text`, `full_name text NOT NULL`,
  `date_of_birth date`, `source_system text`, `created_at timestamptz`.
- Constraints: primary key and two captured unique constraints on
  `external_id`: `patients_external_id_unique` and
  `unique_patient_external_id`.
- Standalone indexes/triggers: none. RLS: enabled.
- Policies: PUBLIC insert/select with literal `true`.
- Consumers: patient pages/import and traceability services.
- Disposition: include, but consolidate the duplicate equivalent unique
  constraints to one named authority and critically review public access to
  patient data.

### `providers`

- Columns: UUID, name/title/role fields, active flag, timestamps, clinic FK,
  deployment key, provisioning status/source.
- Defaults: UUID, `role='Dentist'`, `active=true`,
  `provisioning_status='active'`.
- Constraints: primary key; clinic FK with restricted delete; provisioning
  status check.
- Indexes: clinic/deployment-key partial unique; clinic lookup; case-insensitive
  trimmed full-name unique; normalized name unique that strips Dr/Dre prefix.
- Triggers: none. RLS: enabled.
- Policies: authenticated insert/select/update with literal `true`.
- Consumers: settings, traceability, deployment provider and related entity
  flows.
- Dependent functions: provider activation/completion and deployment planning.
- Disposition: include captured base plus evolved deployment fields; approve
  name uniqueness semantics and policy scope.

### `sterilizers`

- Columns: UUID, name/type, active flag, creation time, clinic FK, deployment
  key and provisioning fields.
- Defaults: UUID, `active=true`, `provisioning_status='active'`.
- Constraints: primary key; clinic FK with restricted delete; provisioning
  status check.
- Indexes: clinic/deployment-key partial unique, clinic lookup, normalized
  lower/trimmed name unique.
- Triggers: none. RLS: enabled.
- Policies: authenticated insert/select/update with literal `true`.
- Consumers: settings/cycle flows and deployment sterilizer, hardware, and
  workstation planning.
- Dependent functions: sterilizer activation/completion and hardware binding.
- Disposition: include; decide whether name uniqueness should be global or
  clinic-scoped and approve policy scope.

### `user_roles`

- Columns: UUID, `user_email text NOT NULL`, `role text NOT NULL`,
  `active boolean DEFAULT true`, timestamp.
- Constraints: primary key; unique `user_email`.
- Standalone indexes/triggers: none. RLS: enabled.
- Policies: PUBLIC insert/select/update with literal `true`.
- Consumers: authorization-facing pages and components.
- Disposition: include only after critical security review. Anonymous/public
  role mutation is not acceptable as an implicit baseline decision.

## Production RLS policy registry

All 27 policies are Production-only relative to repository SQL. PostgreSQL
defaults them to `PERMISSIVE`. Every captured predicate is literal `true`;
there are no helper-function or JWT-claim dependencies.

| Table | Policy | Command | Roles | USING | WITH CHECK | Proposed status |
|---|---|---|---|---|---|---|
| `audit_logs` | Allow authenticated users to insert audit logs | INSERT | `authenticated` | — | `true` | Decision required |
| `audit_logs` | Allow authenticated users to read audit logs | SELECT | `authenticated` | `true` | — | Decision required |
| `clinic_settings` | Allow admins to insert clinic settings | INSERT | `authenticated` | — | `true` | Decision required; name does not enforce admin |
| `clinic_settings` | Allow admins to update clinic settings | UPDATE | `authenticated` | `true` | `true` | Decision required; name does not enforce admin |
| `clinic_settings` | Allow authenticated users to read clinic settings | SELECT | `authenticated` | `true` | — | Decision required |
| `cycles` | Allow public insert cycles | INSERT | `PUBLIC` | — | `true` | Critical review |
| `cycles` | Allow public read cycles | SELECT | `PUBLIC` | `true` | — | Critical review |
| `cycles` | Allow public update cycles | UPDATE | `PUBLIC` | `true` | `true` | Critical review |
| `load_items` | Allow authenticated users to insert load items | INSERT | `authenticated` | — | `true` | Decision required |
| `load_items` | Allow authenticated users to read load items | SELECT | `authenticated` | `true` | — | Decision required |
| `load_items` | Allow authenticated users to update load items | UPDATE | `authenticated` | `true` | `true` | Decision required |
| `packs` | Allow authenticated users to review expired packs | UPDATE | `authenticated` | `true` | `true` | Decision required |
| `packs` | Allow public insert packs | INSERT | `PUBLIC` | — | `true` | Critical review |
| `packs` | Allow public read packs | SELECT | `PUBLIC` | `true` | — | Critical review |
| `patient_traces` | Allow public insert patient traces | INSERT | `PUBLIC` | — | `true` | Critical review |
| `patient_traces` | Allow public read patient traces | SELECT | `PUBLIC` | `true` | — | Critical review |
| `patients` | Allow public insert patients | INSERT | `PUBLIC` | — | `true` | Critical review |
| `patients` | Allow public read patients | SELECT | `PUBLIC` | `true` | — | Critical review |
| `providers` | Allow authenticated users to insert providers | INSERT | `authenticated` | — | `true` | Decision required |
| `providers` | Allow authenticated users to read providers | SELECT | `authenticated` | `true` | — | Decision required |
| `providers` | Allow authenticated users to update providers | UPDATE | `authenticated` | `true` | `true` | Decision required |
| `sterilizers` | Allow authenticated users to insert sterilizers | INSERT | `authenticated` | — | `true` | Decision required |
| `sterilizers` | Allow authenticated users to read sterilizers | SELECT | `authenticated` | `true` | — | Decision required |
| `sterilizers` | Allow authenticated users to update sterilizers | UPDATE | `authenticated` | `true` | `true` | Decision required |
| `user_roles` | Allow public insert user roles | INSERT | `PUBLIC` | — | `true` | Critical review |
| `user_roles` | Allow public read user roles | SELECT | `PUBLIC` | `true` | — | Critical review |
| `user_roles` | Allow public update user roles | UPDATE | `PUBLIC` | `true` | `true` | Critical review |

Proposed baseline status is `decision-required` for every policy. None should
be copied merely to achieve count parity. The approved baseline must either
preserve, tighten, replace, or intentionally omit each policy and record why.

The other 11 application tables have RLS enabled and no policies. The proposed
baseline should preserve deny-by-default direct access and grant only the
reviewed service-role/function boundary.

## Conflicting definitions

### `clinics`

Proposed authority: the captured Production definition reconciled with
`supabase_clinics.sql`.

`supabase_deployment_core.sql` is an earlier planning model. Its clinic
definition and planning-table relationships are excluded. The evolved clinic
model supplies current deployment lifecycle constraints, audit fields,
indexes, RLS expectation, and trigger behavior visible in Production.

### `deployment_runs`

Proposed authority: the captured Production definition reconciled with
`supabase_deployment_runs.sql`.

The superseded core file's planning status/review-payload model is incompatible
with Production's run identity, idempotency, lifecycle, audit, retry, recovery,
and evidence model. No core-only run field or index should enter the baseline
without a separate product decision.

### `set_clinics_updated_at`

Proposed authority: Production plus the evolved helper in
`supabase_clinics.sql`.

The deployed helper is a trigger function that sets `NEW.updated_at = now()`,
returns `NEW`, uses PL/pgSQL, and fixes `search_path` to `public`. The duplicate
core definition is superseded. The baseline should include one normalized
helper and one clinic trigger.

## Index reconciliation

### Material drift

- Production:
  `clinical_workstations_display_order_name_idx` on
  `(display_order, name)`.
- Repository:
  `clinical_workstations_display_order_idx` on `(display_order)`.
- Classification: semantic, not naming-only. Production adds deterministic
  name ordering within equal display positions and can support ordered queries
  better.
- Proposed authority: Production composite `(display_order, name)`, because it
  is deployed and is a strict useful extension of the repository index.
- Blocking decision: approve the composite index and its catalog name.

### Identifier truncation

These catalog names are PostgreSQL-length outcomes and must not be treated as
drift when normalized definitions match:

| Repository spelling | Production catalog identity |
|---|---|
| `deployment_activation_execution_items_session_execution_item_uidx` | `deployment_activation_execution_items_session_execution_item_ui` |
| `deployment_activation_execution_sessions_clinic_execution_key_uidx` | `deployment_activation_execution_sessions_clinic_execution_key_u` |
| `deployment_hardware_assignments_clinic_assignment_key_unique_idx` | `deployment_hardware_assignments_clinic_assignment_key_unique_id` |

The baseline should use explicitly selected names no longer than 63 bytes and
validate index uniqueness, key expressions, predicates, included columns, and
access method—not only names.

## Baseline exclusions

| Object/asset | Reason | Treatment |
|---|---|---|
| `clinic_provider_plans`, `clinic_hardware_plans` | Repository-only planning tables; no runtime consumer or Production object | Exclude |
| Their two triggers and two indexes | Planning-only dependencies | Exclude |
| `set_deployment_updated_at` | Superseded core helper | Exclude |
| Core-only clinic/run indexes | Superseded model | Exclude |
| `supabase_deployment_core.sql` | Conflicting, superseded aggregate | Never execute as baseline |
| `deployment-activation-execution-preflight.sql` | Historical overlap | Retain as history only |
| All `*_preflight.sql` | Diagnostics/read-only assertions | Keep outside mutation baseline |
| `supabase_investigation_lifecycle.sql` | Repair-only, contains top-level data mutation | Exclude; encode final cycle shape declaratively |
| Compatibility data transformations | Upgrade/repair behavior, not empty-schema DDL | Exclude from baseline; retain only in forward migrations if needed |
| Supabase `auth`/`storage` tables/functions/triggers/indexes | Platform-managed | Prerequisite only |
| Capture ownership/platform ACL noise | Environment-specific | Normalize to approved role contract |

## Proposed baseline execution order

1. **Environment assertions:** target identity, PostgreSQL/Supabase
   compatibility, required roles and platform schemas.
2. **Schemas:** establish application ownership/use of `public`; assert
   platform schemas without recreating them.
3. **Extensions and functions supplied by platform:** assert approved
   prerequisites such as `gen_random_uuid()`.
4. **Custom types:** none currently; preserve an explicit empty phase.
5. **Foundation tables:** clinics and the ten Production-derived legacy
   application tables in FK-safe order.
6. **Operational tables:** workstations, agents, hardware, workstation
   sessions, settings/provider/sterilizer final shapes.
7. **Deployment tables:** runs and hardware assignments.
8. **Execution and recovery tables:** sessions/items, recovery plans/items.
9. **Defaults/identity behavior:** install defaults with table creation;
   assert no application sequence ownership is required.
10. **Primary/unique/check constraints:** create non-FK invariants; decide and
    remove duplicate-equivalent constraints.
11. **Foreign keys:** add in dependency order after all referenced tables.
12. **Indexes:** create normalized final indexes, including approved partial
    and expression indexes.
13. **Trigger-helper functions:** create the eight current helpers with
    reviewed search paths.
14. **RPC functions:** create all 17 after table/constraint dependencies,
    preserving exact signatures and security properties.
15. **Triggers:** attach the ten included Production triggers.
16. **RLS enablement:** enable on all 21 application tables.
17. **Policies:** apply only the individually approved 27-policy replacement
    set.
18. **Grants/revokes:** establish schema/table/function privileges and
    service-role-only RPC execution from an explicit ACL matrix.
19. **Validation assertions:** run read-only catalog checks and preflights.
20. **Deterministic capture:** dump the empty initialized schema and compare a
    normalized registry/manifest with the approved expectation.

The future baseline should be single-application on an empty database, not
idempotent repair of an arbitrary partially initialized schema.
`CREATE IF NOT EXISTS` must not hide definition differences. Rerunning the
baseline may fail clearly or be rejected by a migration ledger; forward
migrations should own evolution.

## Validation requirements

### Object and definition parity

- Compare per-schema counts for tables, columns, types, sequences, constraints,
  indexes, functions, triggers, RLS, policies, grants, and revokes.
- Compare normalized definitions, not raw dump ordering or owners.
- Resolve dependencies topologically and reject unresolved references.
- Compare column types, typmods, collation, nullability, defaults, generated
  expressions, identity/sequence ownership, and comments where contractual.
- Compare constraints by type, columns, actions, deferrability, validation
  state, expression, and referenced identity.
- Compare indexes by method, uniqueness, key/expression order, predicate,
  included columns, opclasses, and null semantics.

### Functions and RPCs

- Compare identity arguments, argument modes/defaults, result type/columns,
  language, body hash, volatility, strictness, parallel safety, security mode,
  leakproof flag, configuration/search path, owner, and ACL.
- Require exactly the 17 runtime RPC identities and validate TypeScript payload
  keys and returned record fields.
- Assert `PUBLIC` execute is revoked wherever the service-role boundary
  requires it.

### RLS and ACLs

- Require RLS on all 21 application tables.
- Account for each of the 27 Production policy identities with an explicit
  preserve/replace/omit decision.
- Compare command, roles, permissive/restrictive mode, `USING`, and
  `WITH CHECK` expressions.
- Test anon, authenticated, service-role, and relevant owner behavior.
- Verify grants and revokes as effective privileges, including role
  inheritance and owner bypass.

### Runtime coverage

- Every non-test `.from()` table must exist: current expected count 19.
- Indirect recovery tables must be covered through
  `persist_deployment_recovery_plan`.
- Every runtime RPC constant must resolve: current expected count 17.
- Every selected, inserted, or updated column and every RPC argument/result
  must have a compatible database contract.
- No included baseline table/function may be unexplained and no excluded
  planning object may be referenced.

### Determinism and safety

- Registry and expected manifest must use stable ordering and parse cleanly.
- An empty-database baseline run must create zero application rows.
- A second baseline application must not silently accept drift.
- Preflights must be read-only and separate from mutation artifacts.
- No Production identifiers, secrets, rows, or auth/storage data may enter the
  baseline.
- A fresh Production capture is required before any later Production
  evolution; the clean baseline is never applied wholesale to existing
  Production.

## Blocking decisions

1. Approve Production as structural authority for all ten missing base tables.
2. Decide each of the 27 policies, especially PUBLIC access to `cycles`,
   `packs`, `patient_traces`, `patients`, and `user_roles`.
3. Define the intended tenant/admin authorization model; current policy names
   do not enforce admin or clinic isolation.
4. Approve the Production composite workstation ordering index.
5. Consolidate the duplicate `patients.external_id` unique constraints.
6. Decide whether provider and sterilizer normalized-name uniqueness is global
   or clinic-scoped.
7. Decide whether the two `clinic_settings` printer checks should remain
   `NOT VALID` in a clean baseline.
8. Approve or replace the localhost print-agent default.
9. Approve the normalized grants/revokes and service-role RPC execution matrix.
10. Confirm platform/extension prerequisites for `gen_random_uuid()`, auth
    references, roles, and Supabase-managed schemas.
11. Complete normalized, attribute-level comparison for all functions/RPCs,
    indexes, constraints, and ACLs before SQL generation.

## Readiness conclusion

**READY_WITH_EXPLICIT_DECISIONS_REQUIRED**

The object inventory is sufficiently complete to design a baseline and no
runtime object-name gap remains. Baseline SQL generation may begin only after
the eleven blocking decision groups above are explicitly resolved and recorded.
