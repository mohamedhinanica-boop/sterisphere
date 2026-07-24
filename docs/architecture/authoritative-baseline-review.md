# Authoritative Baseline Verification and Acceptance Review

## 1. Executive Summary

Architecture Freeze 1.0.0 provenance is intact and the executable SQL object
counts independently match the manifest. The baseline is not accepted for
repository authority because four unresolved High findings remain:

1. `100_validation.sql` does not validate the full required object definitions.
2. Twelve runtime functions omit an explicit volatility declaration, and the
   generation report incorrectly describes all runtime RPCs as explicit
   `SECURITY INVOKER` functions.
3. The manifest does not record final hashes and sizes for every generated
   documentation artifact.
4. Policy traceability does not explicitly account for three deny/server-only
   Production decision areas or explain the seven supporting policies.

No reviewed artifact was corrected, reformatted, regenerated, or normalized.
Repository acceptance does not authorize execution, and execution remains
blocked pending isolated PostgreSQL validation.

## 2. Provenance Review

| Item | Expected | Observed | Result |
|---|---|---|---|
| Baseline version | `1.0.0` | `1.0.0` | Pass |
| Freeze version | `1.0.0` | `1.0.0` | Pass |
| Freeze manifest SHA-256 | `0B0B1B157035F12AB210ECBD1DC6B7E55FF6DAFFDF652966ACB0396E66963619` | Same | Pass |
| Owner resolution SHA-256 | `D0CE3D8910EBAA73AF87FD3903851D1207969764473281D5D14715120F26CB1B` | Same | Pass |
| Architecture input commit | `2373ad80d6a86510acde0010ea1bfb1f82d0fe02` | Same | Pass |
| Freeze artifact commit | `12b6b7e2729d95f47c77cb04e1db87130a05adc9` | Same | Pass |
| Frozen input hashes | Eight locked inputs | 8/8 match | Pass |

The manifest SHA-256 independently computes to
`DDD84D8DF1B3B2003D7587F53586830027A783E7A3101F65A2831DBADEBE5783`,
matching the README and generation report.

## 3. Manifest Review

The 11 executable SQL paths are unique, present, ordered from 1 through 11,
and their sizes and SHA-256 hashes match their bytes. The README, manifest, and
generation report each appear once across `files` and `documentation`.

Independent executable-SQL counts:

| Object | SQL-derived | Manifest | README | Generation report | Result |
|---|---:|---:|---:|---:|---|
| Tables | 23 | 23 | Not stated | 23 | Match where stated |
| Constraints | 153 | 153 | Not stated | 153 | Match where stated |
| Indexes | 90 | 90 | Not stated | 90 | Match where stated |
| Functions | 28 | 28 | Not stated | 28 | Match where stated |
| Runtime RPCs | 17 | 17 | Not stated | 17 | Match where stated |
| Triggers | 10 | 10 | Not stated | 10 | Match where stated |
| RLS-enabled tables | 23 | 23 | Not stated | 23 | Match where stated |
| Policies | 33 | 33 | Not stated | 33 | Match where stated |
| ACL statements | 54 | Not stated | Not stated | Not stated | Coverage gap |

Finding `HIGH-003`: the manifest gives full hashes/sizes only for SQL files.
The README has only a pre-manifest canonical hash, the generation report has no
manifest-recorded final hash/size, and the manifest self-hash is external. This
does not satisfy the requirement that every generated file carry path, role,
size, SHA-256, and execution order.

## 4. SQL Structure Review

The file order is dependency-safe:

`prerequisites → schemas → tables → constraints → indexes → functions →
triggers → RLS → policies → ACL → validation`.

Tables precede all constraints and indexes; authorization helpers precede
policies; trigger helpers precede attachments; policy helper dependencies exist
before policy creation. No duplicate CREATE identity or duplicate policy
identity was found. No dependency cycle was identified statically.

## 5. Schema Review

All 23 tables have primary keys and RLS. Twenty-two tenant-owned tables carry
`clinic_id`; `clinics` is the tenant root and `platform_operator_roles` is
deliberately global. The baseline contains:

- global `platform_operator_roles` keyed to `auth.users`;
- multi-clinic `clinic_memberships` with clinic-scoped roles and lifecycle;
- clinic ownership for patients, cycles, loads, packs, traces, and audits;
- explicit audit `clinic/global/system` scope;
- normalized `patient_external_identifiers`;
- planned/inactive-compatible hardware state without authoritative localhost
  defaults.

The table design aligns with approval groups 001, 004, 005, 009, 012, and 015.
Static review found no email-only authorization key.

## 6. Constraint Review

The SQL independently contains 153 named constraints, deterministically ordered
by table and name. It includes primary keys, tenant/auth foreign keys, lifecycle
checks, clinic-scoped provider/sterilizer naming, and patient external-identity
rules. No duplicate constraint name per table or contradictory duplicate
uniqueness was found textually. Cascades are concentrated on ownership-child
relationships; audit actor references use `SET NULL`.

Constraint semantics have not been PostgreSQL-executed. Full catalog validation
is also incomplete under `HIGH-001`.

## 7. Index Review

The SQL independently contains 90 non-constraint indexes. Tenant and runtime
lookup indexes are present, including the non-unique
`clinical_workstations_display_order_name_idx`. The two partial external patient
identity indexes implement source-instance precedence and source-system
fallback. No duplicate index CREATE identity was found.

No query planner or PostgreSQL catalog test was performed.

## 8. Function Review

The baseline contains 28 functions: three authorization helpers, eight trigger
helpers, and 17 runtime RPCs. Every function declares a language, security
mode, and trusted `pg_catalog, public` search path. Fifteen are
`SECURITY DEFINER`; their reviewed table references are schema-qualified and
their browser execution is revoked.

Finding `HIGH-002`: 12 retained `SECURITY DEFINER` runtime RPCs rely on
PostgreSQL's implicit `VOLATILE` default rather than declaring volatility
explicitly. The generation report also says all 17 runtime RPCs were normalized
to explicit invoker security, while the SQL contains 12 definer and five
invoker RPCs. The SQL may preserve approved Production behavior, but the
attribute omission and report contradiction must be resolved before acceptance.

## 9. Trigger Review

Ten trigger attachments are unique and reference eight helpers that are created
earlier. The helpers set `NEW.updated_at` and return `NEW`; two helpers serve
multiple approved attachments. No orphan attachment or duplicate attachment was
found.

## 10. RLS Review

RLS is enabled exactly once on all 23 application tables. Browser-visible
policies target `authenticated`; no policy targets `PUBLIC` or `anon`.
Authorization derives from `auth.uid()` plus durable global roles or active
clinic memberships. The global super-admin path is explicit through the
authorization helpers.

Deployment and recovery tables intentionally have no authenticated policies and
remain service-role-only under RLS/ACL posture.

## 11. Policy Review

All 33 policies target `authenticated`. The source mapping is:

| Policy | Table | Command | Roles | Source decision | Approval group | Classification |
|---|---|---|---|---|---|---|
| `audit_logs_select_authorized` | audit_logs | SELECT | authenticated | RLS-002 | APPROVAL-015 | Direct replacement |
| `clinic_memberships_select_authorized` | clinic_memberships | SELECT | authenticated | AUTH-001, RLS-026 | APPROVAL-001/003 | Intentional split |
| `clinic_settings_insert_admin` | clinic_settings | INSERT | authenticated | RLS-003 | APPROVAL-006 | Direct replacement |
| `clinic_settings_select_members` | clinic_settings | SELECT | authenticated | RLS-005 | APPROVAL-006 | Direct replacement |
| `clinic_settings_update_admin` | clinic_settings | UPDATE | authenticated | RLS-004 | APPROVAL-006 | Direct replacement |
| `clinical_agents_select_admin` | clinical_agents | SELECT | authenticated | AUTH-001 | APPROVAL-001 | Supporting policy |
| `clinical_hardware_devices_select_admin` | clinical_hardware_devices | SELECT | authenticated | AUTH-001 | APPROVAL-001 | Supporting policy |
| `clinical_workstations_select_members` | clinical_workstations | SELECT | authenticated | AUTH-001 | APPROVAL-001 | Supporting policy |
| `clinics_select_members` | clinics | SELECT | authenticated | AUTH-001 | APPROVAL-001 | Supporting policy |
| `cycles_insert_clinical` | cycles | INSERT | authenticated | RLS-006 | APPROVAL-005 | Direct replacement |
| `cycles_select_members` | cycles | SELECT | authenticated | RLS-007 | APPROVAL-005 | Direct replacement |
| `cycles_update_clinical` | cycles | UPDATE | authenticated | RLS-008 | APPROVAL-005 | Direct replacement |
| `load_items_insert_clinical` | load_items | INSERT | authenticated | RLS-009 | APPROVAL-005 | Direct replacement |
| `load_items_select_members` | load_items | SELECT | authenticated | RLS-010 | APPROVAL-005 | Direct replacement |
| `load_items_update_clinical` | load_items | UPDATE | authenticated | RLS-011 | APPROVAL-005 | Direct replacement |
| `packs_insert_clinical` | packs | INSERT | authenticated | RLS-013 | APPROVAL-005 | Direct replacement |
| `packs_select_members` | packs | SELECT | authenticated | RLS-014 | APPROVAL-005 | Direct replacement |
| `packs_update_clinical` | packs | UPDATE | authenticated | RLS-012 | APPROVAL-005 | Direct replacement |
| `patient_external_identifiers_select_clinical` | patient_external_identifiers | SELECT | authenticated | UNIQUE-001 | APPROVAL-009 | Supporting policy |
| `patient_external_identifiers_write_clinical` | patient_external_identifiers | ALL | authenticated | UNIQUE-001 | APPROVAL-009 | Supporting policy |
| `patient_traces_insert_clinical` | patient_traces | INSERT | authenticated | RLS-015 | APPROVAL-004 | Direct replacement |
| `patient_traces_select_clinical` | patient_traces | SELECT | authenticated | RLS-016 | APPROVAL-004 | Direct replacement |
| `patients_insert_clinical` | patients | INSERT | authenticated | RLS-017 | APPROVAL-004 | Direct replacement |
| `patients_select_clinical` | patients | SELECT | authenticated | RLS-018 | APPROVAL-004 | Direct replacement |
| `patients_update_clinical` | patients | UPDATE | authenticated | RLS-017 | APPROVAL-004 | Intentional split |
| `platform_operator_roles_select_authorized` | platform_operator_roles | SELECT | authenticated | AUTH-001, RLS-026 | APPROVAL-001/003 | Intentional split |
| `providers_insert_admin` | providers | INSERT | authenticated | RLS-019 | APPROVAL-006 | Direct replacement |
| `providers_select_members` | providers | SELECT | authenticated | RLS-020 | APPROVAL-006 | Direct replacement |
| `providers_update_admin` | providers | UPDATE | authenticated | RLS-021 | APPROVAL-006 | Direct replacement |
| `sterilizers_insert_admin` | sterilizers | INSERT | authenticated | RLS-022 | APPROVAL-006 | Direct replacement |
| `sterilizers_select_members` | sterilizers | SELECT | authenticated | RLS-023 | APPROVAL-006 | Direct replacement |
| `sterilizers_update_admin` | sterilizers | UPDATE | authenticated | RLS-024 | APPROVAL-006 | Direct replacement |
| `workstation_sessions_select_authorized` | workstation_sessions | SELECT | authenticated | AUTH-001 | APPROVAL-001 | Supporting policy |

The 27 Production policy decisions yield 33 policies as follows: RLS-001,
RLS-025, and RLS-027 intentionally yield no client policy because audit and
role mutations are server-only; the remaining decisions yield 24 policies;
RLS-017 and RLS-026 each split into one additional policy, giving 26; seven
newly required supporting policies for membership-visible operational objects
and normalized external identities give 33.

Finding `HIGH-004`: this complete rationale is absent from the generated
baseline and generation report. The report instead says all 27 decisions are
mapped immediately before replacement policies, which is not literally true
for the three intentional no-policy decisions or the seven supporting policies.

## 12. ACL Review

There are 54 independently counted GRANT/REVOKE statements. Application-table
access is revoked from `PUBLIC`, `anon`, and initially from `authenticated`;
authenticated privileges are then narrowly granted for policy-protected
operations. All 17 runtime RPCs are service-role-only. Trigger helpers have no
direct browser execution. Authorization helpers are executable only by
authenticated/service roles and enforce durable identity.

No anonymous table grant or PUBLIC RPC execution was found textually.

## 13. Boundary Review

The baseline does not create `auth`, `storage`, `extensions`, Supabase roles,
`auth.users`, or platform metadata. Prerequisites assert platform-owned schemas,
roles, `auth.uid()`, `auth.users`, and cryptographic/UUID capabilities without
creating them. This matches APPROVAL-013.

## 14. Validation Review

`100_validation.sql` is read-only: it contains catalog queries and exception
assertions, with no schema/data mutation.

Finding `HIGH-001`: it checks all table names, selected authoritative columns,
function names, policy names, trigger names, RLS, negative ACL posture, platform
prerequisites, selected external-identity indexes, and workstation ordering.
It does not fully validate:

- all expected columns with types, nullability, and defaults;
- all 153 constraints or their PK/FK/UNIQUE/CHECK definitions;
- all 90 indexes or their definitions;
- exact function/RPC signatures and attributes;
- trigger event/timing/function definitions;
- policy commands, roles, `USING`, and `WITH CHECK`;
- the complete positive ACL model.

This is below the frozen baseline validation contract and requires regeneration.

## 15. Security Review

Static review confirms no anonymous policies, no email-only authorization, no
policy trusting only caller-supplied clinic identity, explicit membership
helpers, service-role-only RPC ACLs, and trusted function search paths.

`SECURITY-REQ-001` is carried in the manifest and README. The known
`persistDeploymentRunAction` violation remains a staging-release and Version
1.0 blocker, not a baseline-generation defect. No application change was made.

Security acceptance remains blocked by `HIGH-001`, `HIGH-002`, and isolated
role/membership matrix testing.

## 16. Determinism Review

SQL filenames, execution order, object ordering, names, and formatting are
stable. SQL contains no generated timestamp, `IF NOT EXISTS`, `CREATE OR
REPLACE`, unresolved placeholder, TODO marker, secret, password, or connection
string. Dollar-quote delimiters are balanced and CREATE identities are unique.

The manifest includes permitted `generatedAt` metadata. SQL reproducibility was
not regenerated during this immutable review.

## 17. Architecture Drift

No unexpected architecture was identified. New normalized membership, operator,
external-identity, tenant-ownership, and audit-scope objects are supported by
the locked owner resolution. The seven supporting policies are justified by
those approved objects, but their generated traceability documentation is
insufficient under `HIGH-004`.

Unexpected objects: none.

## 18. Risk Summary

| Severity | Count | Findings |
|---|---:|---|
| Critical | 0 | None |
| High | 4 | Incomplete validation; function attribute/report mismatch; incomplete manifest documentation hashes; incomplete policy rationale |
| Medium | 0 | None |
| Low | 0 | None |

## 19. Repository Acceptance Decision

`REQUIRES_REVISION`.

The architecture itself is not reopened. Regeneration should correct the four
High implementation/traceability defects while preserving the locked inputs.

## 20. Remaining Release Gates

- Regenerate and re-review the baseline for all High findings.
- Perform offline parser validation if a suitable parser becomes available.
- Execute and validate only in a separately authorized isolated fresh database.
- Complete application authorization work, especially `SECURITY-REQ-001`.
- Complete tenant ownership, collision, and external-identity data preflights.
- Run role, tenant-isolation, RPC, trigger, RLS, ACL, and concurrency tests.
- Obtain separate staging and Production authorizations.

## 21. Final Conclusion

Textual/static validation was performed. No PostgreSQL-compatible offline parser
was available, so parser validation was not performed. PostgreSQL execution
validation was not performed and remains an explicit staging blocker.

AUTHORITATIVE_BASELINE_REQUIRES_REVISION
