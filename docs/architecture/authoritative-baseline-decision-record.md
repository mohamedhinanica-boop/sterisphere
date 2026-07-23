# Authoritative baseline decision record

## Status and scope

This decision package resolves the architectural choices identified in Phase
10.5A. It is analysis and design only. It does not generate baseline SQL,
modify the immutable object registry, alter schema captures, or authorize a
database operation.

Evidence:

- Production capture: `.tmp/schema-captures/20260723T031930Z/`
- Immutable registry:
  `docs/architecture/authoritative-baseline-object-registry.json`
- Registry SHA-256:
  `8A0CFEADAC660BAD9797BBB81C87920D3A9C89C8241BBCE96DDF03033B100E9F`
- Structured decisions:
  `docs/architecture/authoritative-baseline-decision-record.json`

The JSON record contains exact related object identities, including full RPC
signatures, alternatives, compatibility classification, migration
requirements, validation requirements, risks, and approval flags.

## Decision summary

| Decision | Subject | Risk | Recommendation | Production impact | Blocker | Approval |
|---|---|---|---|---|---|---|
| RLS-001–027 | Every Production policy | Critical/high | Replace with membership- and tenant-scoped policies | Tightens; later migration | Yes | Yes |
| AUTH-001 | Roles and clinic membership | Critical | Auth-user-linked clinic memberships as database authority | Changes/tightens; later migration | Yes | Yes |
| AUTH-002 | Public and service-role access | Critical | No anon table access; service role restricted to trusted server | Tightens; later migration | Yes | Yes |
| UNIQUE-001 | Patient external identity | Critical | One clinic/source-scoped partial identity rule | Changes; later migration | Yes | Yes |
| UNIQUE-002 | Provider uniqueness | High | Clinic-scoped active normalized name and deployment key | Changes; later migration | Yes | Yes |
| UNIQUE-003 | Sterilizer uniqueness | High | Clinic-scoped non-archived normalized name and deployment key | Changes; later migration | Yes | Yes |
| UNIQUE-004 | Workstation ordering | Medium | Keep Production `(display_order, name)` non-unique index | Preserves; no migration for baseline | Yes | Yes |
| HARDWARE-001 | Printer checks | Medium | Valid constraints in clean baseline | Tightens; Production validation | Yes | Yes |
| HARDWARE-002 | Localhost print-agent default | High | Move endpoint default to environment/deployment configuration | Changes; later migration | Yes | Yes |
| HARDWARE-003 | Printer network defaults | Medium | Connection-aware application/deployment defaults | Changes; later migration | Yes | Yes |
| HARDWARE-004 | Agent URLs | Medium | Nullable when planned; HTTPS active, explicit local exception | Tightens; later migration | Yes | Yes |
| HARDWARE-005 | Provisioning lifecycle | Medium | State-dependent required fields and assignment rules | Tightens; later migration | Yes | Yes |
| RPC-001–017 | Runtime RPC ACLs | High | Service-role-only, fixed path, durable tenant checks | Codifies Production | Yes | Yes |
| RPC-H01–H08 | Trigger helpers | Medium | Non-client-callable invoker helpers with fixed path | Tightens ACL | Yes | Yes |
| PLATFORM-001–006 | Platform prerequisites | Critical–low | Assert platform; never recreate managed internals | Mostly preserves | Yes | Yes |
| NORMALIZE-001–007 | Normalized definitions | High/medium | Production-normalized evolved definitions | Mixed | Yes | Yes |

## A. RLS and tenant authorization

### Current behavior

All 21 application tables have RLS enabled. Ten tables have 27 permissive
policies; each `USING` or `WITH CHECK` expression, when present, is literal
`true`. No policy uses `auth.uid()`, a membership lookup, a JWT claim, or a
tenant predicate.

Several policy names say “admins,” but the database role is merely
`authenticated`. Current role checks are largely client-side:
`AuthGuard`, `AppShell`, settings, assistant, and investigation UI read
`user_roles` by email. This is navigation behavior, not a database security
boundary.

### Proposed authorization model

| Principal | Authoritative scope |
|---|---|
| `super_admin` | Platform-wide administrative role, tightly assigned and audited |
| `admin` | Administrative control only for clinics with active membership |
| `clinical_staff` | Clinic-scoped operational cycles, loads, packs, and trace workflows |
| `doctor` | Clinic-scoped patient/trace workflows and approved clinical reads; no infrastructure administration |
| `auditor` | Clinic-scoped read-only reports, investigations, trace and audit access |
| `service_role` | Trusted server/deployment operations only; never exposed to browser clients |
| `authenticated` without membership | No tenant data access |
| `anon`/PUBLIC | No application-table access |

The database source of truth should be an auth-user-linked clinic membership
relation keyed to `auth.users.id`, not mutable email. Policies derive the
caller from `auth.uid()` and require an active membership with an allowed
role. Client-supplied `clinic_id`, email, or role is never authorization.

Tenant-root rows must carry a non-null `clinic_id`. Child rows may derive
tenant ownership through an immutable, indexed parent relationship only when
the policy can do so safely and efficiently. The baseline design should add
direct clinic ownership to `audit_logs`, `cycles`, `patients`,
`patient_traces`, `packs` where nullable parentage prevents reliable
derivation, and the membership replacement for `user_roles`.

### Individual policy decisions

All 27 are `REPLACE_IN_BASELINE` and require human approval.

| ID | Schema/table | Policy | Command/roles | USING / CHECK | Current scope and tenant boundary | Runtime dependency | Recommendation |
|---|---|---|---|---|---|---|---|
| RLS-001 | `public.audit_logs` | Allow authenticated users to insert audit logs | INSERT / authenticated | — / `true` | Any authenticated user; no `clinic_id` | Audit writer/activity | Add tenant key; service-role insert only |
| RLS-002 | `public.audit_logs` | Allow authenticated users to read audit logs | SELECT / authenticated | `true` / — | All audit rows; no tenant boundary | Audit page, dashboard, reports | Clinic-scoped super_admin/admin/auditor read |
| RLS-003 | `public.clinic_settings` | Allow admins to insert clinic settings | INSERT / authenticated | — / `true` | Policy name overstates enforcement | Settings/deployment | Active clinic admin/super_admin or service role |
| RLS-004 | `public.clinic_settings` | Allow admins to update clinic settings | UPDATE / authenticated | `true` / `true` | Cross-clinic authenticated update | Settings/deployment | Clinic admin/super_admin only |
| RLS-005 | `public.clinic_settings` | Allow authenticated users to read clinic settings | SELECT / authenticated | `true` / — | Cross-clinic authenticated read | Settings/printer/deployment | Membership-scoped read |
| RLS-006 | `public.cycles` | Allow public insert cycles | INSERT / PUBLIC | — / `true` | Anonymous global write; no `clinic_id` | Cycle creation | Add clinic key; clinic staff/admin write |
| RLS-007 | `public.cycles` | Allow public read cycles | SELECT / PUBLIC | `true` / — | Anonymous global clinical read | Cycle, dashboard, investigation | Membership/role-scoped read |
| RLS-008 | `public.cycles` | Allow public update cycles | UPDATE / PUBLIC | `true` / `true` | Anonymous global clinical mutation | Cycle/review/investigation | Clinic staff/admin workflow update |
| RLS-009 | `public.load_items` | Allow authenticated users to insert load items | INSERT / authenticated | — / `true` | Cross-clinic; tenant only through cycle | Cycle creation | Authorize through parent clinic |
| RLS-010 | `public.load_items` | Allow authenticated users to read load items | SELECT / authenticated | `true` / — | Cross-clinic | Cycle/investigation | Parent-clinic membership read |
| RLS-011 | `public.load_items` | Allow authenticated users to update load items | UPDATE / authenticated | `true` / `true` | Cross-clinic mutation | Cycle workflow | Parent-clinic staff/admin update |
| RLS-012 | `public.packs` | Allow authenticated users to review expired packs | UPDATE / authenticated | `true` / `true` | Any pack; tenant derivation may be nullable | Inventory/pack review | Clinic staff/admin review |
| RLS-013 | `public.packs` | Allow public insert packs | INSERT / PUBLIC | — / `true` | Anonymous global write | Pack generation | Trusted workflow; clinic staff/service role |
| RLS-014 | `public.packs` | Allow public read packs | SELECT / PUBLIC | `true` / — | Anonymous global read | Inventory/trace/reports | Membership/role-scoped read |
| RLS-015 | `public.patient_traces` | Allow public insert patient traces | INSERT / PUBLIC | — / `true` | Anonymous clinical write; no clinic key | Trace creation | Clinic doctor/staff/admin create |
| RLS-016 | `public.patient_traces` | Allow public read patient traces | SELECT / PUBLIC | `true` / — | Anonymous patient trace read | History/reports/investigation | Membership/role-scoped read |
| RLS-017 | `public.patients` | Allow public insert patients | INSERT / PUBLIC | — / `true` | Anonymous patient write; no clinic key | Patient import/create | Clinic doctor/staff/admin create |
| RLS-018 | `public.patients` | Allow public read patients | SELECT / PUBLIC | `true` / — | Anonymous patient read | Patient and trace pages | Membership/role-scoped read |
| RLS-019 | `public.providers` | Allow authenticated users to insert providers | INSERT / authenticated | — / `true` | Cross-clinic write despite clinic key | Settings/deployment | Clinic admin/super_admin/service role |
| RLS-020 | `public.providers` | Allow authenticated users to read providers | SELECT / authenticated | `true` / — | Cross-clinic read | Settings/trace/deployment | Membership-scoped read |
| RLS-021 | `public.providers` | Allow authenticated users to update providers | UPDATE / authenticated | `true` / `true` | Cross-clinic update | Settings/deployment | Clinic admin/super_admin/service role |
| RLS-022 | `public.sterilizers` | Allow authenticated users to insert sterilizers | INSERT / authenticated | — / `true` | Cross-clinic write despite clinic key | Settings/deployment | Clinic admin/super_admin/service role |
| RLS-023 | `public.sterilizers` | Allow authenticated users to read sterilizers | SELECT / authenticated | `true` / — | Cross-clinic read | Cycles/settings/deployment | Membership-scoped read |
| RLS-024 | `public.sterilizers` | Allow authenticated users to update sterilizers | UPDATE / authenticated | `true` / `true` | Cross-clinic update | Settings/deployment | Clinic admin/super_admin/service role |
| RLS-025 | `public.user_roles` | Allow public insert user roles | INSERT / PUBLIC | — / `true` | Anonymous privilege assignment; email identity | Settings/auth UI | Replace with server-managed membership |
| RLS-026 | `public.user_roles` | Allow public read user roles | SELECT / PUBLIC | `true` / — | Anonymous role enumeration | AuthGuard/AppShell/settings | Authorized membership/self read only |
| RLS-027 | `public.user_roles` | Allow public update user roles | UPDATE / PUBLIC | `true` / `true` | Anonymous privilege escalation | Settings/auth UI | Super-admin-controlled server mutation |

The policy recommendations tighten Production and require a later Production
migration. Validation must test every command as anon, authenticated
non-member, each member role, disabled member, cross-clinic member, and service
role; it must test both `USING` visibility and `WITH CHECK` tenant-key changes.

The 11 deployment/operational tables with RLS and no policies should remain
deny-by-default for browser roles. Trusted deployment mutations occur through
service-role repositories and RPCs.

## B. Uniqueness and identity

### UNIQUE-001 — patient external identity

Production has two equivalent global UNIQUE constraints on nullable
`patients.external_id`. PostgreSQL permits multiple nulls. The likely identity
is external-system-local, not globally universal.

Recommendation: keep one canonical partial uniqueness rule scoped by
`clinic_id`, `source_system`, and non-null `external_id`. Null external IDs
remain valid for manual/setup drafts. This changes Production and requires a
migration. Before migration, inventory same-clinic/source duplicates,
cross-clinic duplicates, nulls, and mismatched source systems.

### UNIQUE-002 — provider identity

Production globally uniquifies lower/trimmed full name and a Dr/Dre-stripped
normalized variant, while deployment key is unique per clinic when non-null.

Recommendation: retain the clinic/deployment-key rule and make normalized name
uniqueness clinic-scoped for active/non-archived providers. Planned drafts may
have null deployment keys. This changes Production; validate prefixes,
punctuation, case, cross-clinic homonyms, archived rows, and concurrent inserts.

### UNIQUE-003 — sterilizer identity

Production globally uniquifies lower/trimmed name and separately clinic-scopes
non-null deployment key.

Recommendation: make normalized name unique per clinic for non-archived rows;
keep the partial clinic/deployment-key rule. Planned drafts may have null
deployment keys. This changes Production; inventory collisions before a
migration.

### UNIQUE-004 — workstation ordering

Production has a non-unique `(display_order, name)` index. Repository SQL has
a non-unique `display_order` index. This is an ordering/performance index, not
an ordering uniqueness rule.

Recommendation: use Production's composite index and allow tied/null display
positions. It preserves Production and gives deterministic secondary ordering.
Validate query plans and tie behavior.

## C. Printer and hardware semantics

### Source-of-truth allocation

| Concern | Source of truth |
|---|---|
| Valid stored state and lifecycle invariants | Database constraints |
| Provisioning transitions and selected device configuration | Deployment engine |
| User-selectable product defaults | Application configuration |
| Hostnames, ports, local/remote topology, credentials | Environment configuration |
| Persisted clinic/device choice after provisioning | Database row |

### Decisions

- **HARDWARE-001:** printer model/connection checks become valid constraints in
  a clean baseline. Production's `NOT VALID` checks require violation preflight
  and later validation/replacement.
- **HARDWARE-002:** remove `http://localhost:8787` as a database default.
  Environment/deployment configuration supplies the endpoint; store it only
  after provisioning.
- **HARDWARE-003:** do not make Wi-Fi/port 9100 universal schema defaults.
  Connection-aware application/deployment defaults allow nullable IP/port for
  USB and unplanned devices.
- **HARDWARE-004:** URL remains nullable for planned/inactive rows. Active
  remote agents require normalized HTTPS; loopback HTTP is permitted only in
  an explicitly selected local deployment mode.
- **HARDWARE-005:** planned drafts may have nullable deployment identities.
  Active objects require clinic ownership and operational identity. Archived
  objects cannot accept new assignments.

These decisions require lifecycle transition, invalid-combination, local-mode,
remote HTTPS, and inactive-assignment tests.

## D. RPC and function authorization

### Runtime RPC ACL matrix

Every entry below has an exact full signature in its `relatedObjects` field in
the JSON decision record. All are currently captured as security invoker
functions. The common authoritative ACL is: `service_role` execute only;
PUBLIC, `anon`, and `authenticated` execute revoked; fixed trusted
`search_path`; fully qualified objects.

| ID | RPC and signature summary | Durable validation | Client clinic flag |
|---|---|---|---|
| RPC-001 | `activate_deployment_clinic(clinic, run, session, execution, owner, item, states, activated_at)` | Clinic/run/session/item identity, lease, token, state CAS | Yes |
| RPC-002 | `activate_deployment_hardware_shell(..., hardware_id/key, states, activated_at)` | All execution checks plus hardware clinic/key | Yes |
| RPC-003 | `activate_deployment_provider_shell(..., provider_id/key, states, activated_at)` | All execution checks plus provider clinic/key | Yes |
| RPC-004 | `activate_deployment_sterilizer_shell(..., sterilizer_id/key, states, activated_at)` | All execution checks plus sterilizer clinic/key | Yes |
| RPC-005 | `activate_deployment_workstation_shell(..., workstation_id/key, states, activated_at)` | All execution checks plus workstation clinic/key | Yes |
| RPC-006 | `bind_deployment_hardware_target(..., hardware, target type/id/key, states)` | Hardware/target same-clinic, allowed type, CAS | Yes |
| RPC-007 | `claim_deployment_activation_execution_session(mode, clinic, run, session, claimant, token, lease, counts, prior owner defaults)` | Claim mode, session clinic/run, lease/CAS/idempotency | Yes |
| RPC-008 | `complete_deployment_activation_execution_item(..., item identity, sequence, expected start/attempt)` | Ownership, lease, item/session, transition and replay | Yes |
| RPC-009 | `complete_deployment_hardware_shell_execution_item(..., hardware identity/states)` | Execution plus hardware same-clinic state CAS | Yes |
| RPC-010 | `complete_deployment_provider_shell_execution_item(..., provider identity/states)` | Execution plus provider same-clinic state CAS | Yes |
| RPC-011 | `complete_deployment_sterilizer_shell_execution_item(..., sterilizer identity/states)` | Execution plus sterilizer same-clinic state CAS | Yes |
| RPC-012 | `complete_deployment_workstation_shell_execution_item(..., workstation identity/states)` | Execution plus workstation same-clinic state CAS | Yes |
| RPC-013 | `persist_deployment_recovery_plan(clinic, run, session, keys, hashes, status, evidence, rollback arrays)` | Clinic/run/session identity, payload hash, idempotency, JSON limits | Yes |
| RPC-014 | `progress_deployment_activation_execution_dependency(..., completed item, next item, dependencies, time)` | Both items/session/clinic, dependency set, lease/CAS | Yes |
| RPC-015 | `start_deployment_activation_execution_item(..., item/action/entity, time, attempt)` | Ownership, lease, item identity, transition/CAS | Yes |
| RPC-016 | `start_deployment_activation_execution_next_item(..., item/entity/dependencies, time)` | Successor and dependency eligibility, ownership/CAS | Yes |
| RPC-017 | `start_deployment_activation_execution_session(clinic, run, session, owner, lease, time, count)` | Session/run/clinic identity, ownership, count/CAS | Yes |

All 17 accept `p_clinic_id`. Each is flagged because a client-supplied clinic
identifier is only a lookup assertion. Authorization must be derived from the
trusted service role plus durable equality across every affected row.

Required negative tests include wrong clinic/run/session/item/entity,
cross-clinic target, malformed/oversized JSON, stale lease, wrong ownership
token, replay, duplicate idempotency key, invalid lifecycle transition, and
concurrent claims/completions. Attribute validation compares exact argument
names/types/defaults, result columns, body hash, volatility, security,
configuration/search path, owner, and ACL.

### Trigger helper ACLs

| ID | Helper | Recommendation |
|---|---|---|
| RPC-H01 | `set_clinical_agents_updated_at` | Invoker trigger helper; no browser-role direct execute; fixed path |
| RPC-H02 | `set_clinical_hardware_devices_updated_at` | Same |
| RPC-H03 | `set_clinical_workstations_updated_at` | Same |
| RPC-H04 | `set_clinics_updated_at` | Same; evolved Production definition authoritative |
| RPC-H05 | `set_deployment_activation_execution_updated_at` | Same |
| RPC-H06 | `set_deployment_hardware_assignments_updated_at` | Same |
| RPC-H07 | `set_deployment_recovery_plan_updated_at` | Same |
| RPC-H08 | `set_workstation_sessions_updated_at` | Same |

Trigger behavior is preserved; direct function ACLs are tightened, requiring a
later Production ACL migration.

## E. Platform prerequisites

| ID | Classification | Decision |
|---|---|---|
| PLATFORM-001 | Environment assertion | Require compatible PostgreSQL/Supabase and availability of `gen_random_uuid()`; do not guess an extension owner |
| PLATFORM-002 | Supabase-owned | Assert `auth`, `storage`, and `extensions`; never recreate their internal objects |
| PLATFORM-003 | Referenced, not created | Reference `auth.users` and `auth.uid()`; membership FK uses auth user UUID |
| PLATFORM-004 | Supabase-owned/not currently required | Exclude Storage configuration until a SteriSphere bucket/policy dependency is proven |
| PLATFORM-005 | Environment assertion | Require platform roles `postgres`, `anon`, `authenticated`, `service_role`; baseline creates no roles |
| PLATFORM-006 | Referenced function | Assert UUID v4 generation; no additional cryptographic dependency without evidence |

The application-owned baseline is limited to normalized SteriSphere `public`
objects and their approved ACLs. Preflight must fail before mutation if a
required platform identity, role, schema, or function is absent.

## F. Normalized definitions

- **NORMALIZE-001:** `clinics` authority is Production plus
  `supabase_clinics.sql`; exclude the core planning definition.
- **NORMALIZE-002:** `deployment_runs` authority is Production plus
  `supabase_deployment_runs.sql`; exclude the core model and indexes.
- **NORMALIZE-003:** use one Production/evolved
  `set_clinics_updated_at`, fixed path, restricted direct execution.
- **NORMALIZE-004:** PostgreSQL-truncated index identifiers are not drift when
  method, uniqueness, keys, expressions, predicates, includes, and opclasses
  match. Select explicit canonical names at most 63 bytes.
- **NORMALIZE-005:** normalize every function/RPC signature, defaults, return
  shape, language, body, volatility, strictness, parallel safety, security
  mode, search path, owner, and ACL. Production behavior wins until a genuine
  difference is approved.
- **NORMALIZE-006:** preserve Production constraints except the approved
  patient uniqueness and printer validation decisions. A clean zero-row
  baseline should not create `NOT VALID` checks.
- **NORMALIZE-007:** include the ten live Production triggers, exclude two
  planning triggers, preserve domain defaults, and move environment/deployment
  defaults according to HARDWARE-002/003.

Genuine differences require forward Production migrations; name truncation
alone does not.

## Validation and approval gate

The JSON package must remain deterministically sorted by category and decision
ID. Approval must record accept/reject/amend for every decision. Baseline
generation remains blocked until:

1. all RLS replacements and required tenant columns/membership structures are
   approved;
2. role capabilities and service-role boundaries are approved;
3. uniqueness and hardware/default decisions are approved;
4. every RPC/helper ACL and normalized definition decision is approved;
5. platform assertions are approved;
6. migration-required decisions have a separate forward Production evolution
   plan and data preflight strategy.

## Approval-required decision IDs

Every decision in this package requires human approval:

RLS-001, RLS-002, RLS-003, RLS-004, RLS-005, RLS-006, RLS-007, RLS-008,
RLS-009, RLS-010, RLS-011, RLS-012, RLS-013, RLS-014, RLS-015, RLS-016,
RLS-017, RLS-018, RLS-019, RLS-020, RLS-021, RLS-022, RLS-023, RLS-024,
RLS-025, RLS-026, RLS-027, AUTH-001, AUTH-002, UNIQUE-001, UNIQUE-002,
UNIQUE-003, UNIQUE-004, HARDWARE-001, HARDWARE-002, HARDWARE-003,
HARDWARE-004, HARDWARE-005, RPC-001, RPC-002, RPC-003, RPC-004, RPC-005,
RPC-006, RPC-007, RPC-008, RPC-009, RPC-010, RPC-011, RPC-012, RPC-013,
RPC-014, RPC-015, RPC-016, RPC-017, RPC-H01, RPC-H02, RPC-H03, RPC-H04,
RPC-H05, RPC-H06, RPC-H07, RPC-H08, PLATFORM-001, PLATFORM-002,
PLATFORM-003, PLATFORM-004, PLATFORM-005, PLATFORM-006, NORMALIZE-001,
NORMALIZE-002, NORMALIZE-003, NORMALIZE-004, NORMALIZE-005, NORMALIZE-006,
NORMALIZE-007.

Recommended choice for each ID is the `recommendation` stated in this document
and the structured JSON record.

READY_PENDING_HUMAN_APPROVAL
