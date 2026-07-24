# Authoritative Baseline Re-Verification and Repository Acceptance

## 1. Executive Summary

The corrected baseline is not accepted as the canonical repository baseline.
HIGH-003 is resolved, but HIGH-001, HIGH-002, and HIGH-004 are only partially
resolved. No Critical finding, architecture drift, or new independent defect
was identified; the three unresolved High findings are sufficient to block
acceptance.

This review performed static and textual verification only. No suitable
offline PostgreSQL parser was installed, and no SQL was executed.

## 2. Review Scope

The review covered all 13 external manifest artifacts, the correction report,
the immutable Phase 10.6A review evidence, and all ten locked architecture
references. No baseline, prior review, correction, application, capture,
migration, configuration, staging, or Production object was modified.

## 3. Review Independence

Each correction claim was checked directly against executable SQL, manifest
metadata, the generation report, owner-resolution JSON, and the freeze. The
correction report was treated as a claim, not proof.

## 4. Provenance Verification

| Provenance item | Verified value | Result |
|---|---|---|
| Baseline/freeze version | `1.0.0` | Pass |
| Architecture input commit | `2373ad80d6a86510acde0010ea1bfb1f82d0fe02` | Pass |
| Freeze artifact commit | `12b6b7e2729d95f47c77cb04e1db87130a05adc9` | Pass |
| Freeze manifest SHA-256 | `0B0B1B157035F12AB210ECBD1DC6B7E55FF6DAFFDF652966ACB0396E66963619` | Pass |
| Owner-resolution SHA-256 | `D0CE3D8910EBAA73AF87FD3903851D1207969764473281D5D14715120F26CB1B` | Pass |
| Corrected manifest SHA-256 | `2D17CCA2DEE8A76EDCB1D105C451A8760B40771907B7EC70C9BDEBAB6512506D` | Pass |
| Eight frozen input hashes | 8/8 match | Pass |

## 5. Immutability Verification

Pre-review sizes and SHA-256 values were recorded for every baseline artifact,
the generation/correction/prior-review artifacts, and all frozen references.
Post-review verification confirmed that every subject and protected artifact
remained byte-for-byte unchanged. Only this Markdown file and its JSON
companion were created.

## 6. HIGH-001 Re-Verification

Status: **PARTIALLY_RESOLVED**.

`100_validation.sql` materially improves coverage. It embeds expected tables,
columns, types, nullability, defaults, all constraints, non-constraint indexes,
function signatures/attributes, trigger attachments, RLS tables, policies,
selected ACL restrictions, membership structures, tenant ownership, platform
prerequisites, and approved uniqueness/order indexes. It is a single read-only
`DO` assertion block and contains no schema/data mutation.

Material gaps remain:

- table verification counts only expected names and does not reject an
  unexpected application table;
- constraint verification checks expected definitions but does not assert the
  exact actual constraint set/count or reject unexpected constraints;
- function verification checks expected identities but does not reject
  unexpected application functions;
- trigger verification checks expected attachments but does not assert the
  exact actual trigger count/set;
- RLS verification counts only expected table names and does not reject an
  unexpected RLS-enabled application table;
- index verification counts only expected index names, so an unexpected
  non-constraint index is not detected;
- ACL verification is primarily negative: it does not prove required
  authenticated grants, required service-role table privileges, or required
  service-role EXECUTE on every runtime RPC;
- application-owned schema identity is not independently enumerated;
- absence of Supabase-owned CREATE statements is not asserted by the validation
  script (it was checked only by external static review).

These omissions leave the fresh-database validator materially below the
required exact identity and positive ACL coverage.

## 7. HIGH-002 Re-Verification

Status: **PARTIALLY_RESOLVED**.

Executable SQL contains exactly 28 functions and 17 service-role runtime RPCs.
All 28 explicitly declare language, volatility, security posture, and fixed
search path. Independently derived totals are 15 `SECURITY DEFINER`, 13
`SECURITY INVOKER`, and 28/28 explicit volatility. The generation report has a
28-row function matrix matching these totals.

However, the manifest contains only aggregate `functionSecurityPosture`; it
contains no complete per-function matrix. README likewise contains totals but
no complete matrix. This fails the re-verification requirement to compare SQL
against the complete function matrix in the manifest, README, and generation
report. The report also gives only a category-wide definer rationale rather
than a per-definer-function rationale.

Static inspection found controlled `pg_catalog, public` search paths and
schema-qualified application-object references in reviewed definer bodies.
Runtime safety was not execution-tested.

## 8. HIGH-003 Re-Verification

Status: **RESOLVED**.

The manifest lists all 13 external artifacts exactly once with path, role,
execution order, size, SHA-256, algorithm, content status, freeze version, and
hash representation. Every file exists; all final sizes and exact or
reference-normalized hashes independently match.

The canonicalization method specifies UTF-8 without BOM, LF endings,
deterministic object/array ordering, two-space JSON indentation, one final LF,
reference normalization for README/report, and self-hash exclusion.
`manifestHashRecordedExternally` is true and the algorithm is SHA-256.

The independently recomputed manifest hash is
`2D17CCA2DEE8A76EDCB1D105C451A8760B40771907B7EC70C9BDEBAB6512506D`;
README and the generation report contain the same value.

## 9. HIGH-004 Re-Verification

Status: **PARTIALLY_RESOLVED**.

The manifest contains 33 forward entries and 27 reverse entries, and all 33
policy SQL identities, tables, commands, and roles can be paired to a forward
record. Every decision ID is represented or has a deny/server-only rationale.
The 27-to-33 arithmetic is supportable: 24 decision areas yield a policy,
RLS-017 and RLS-026 add two intentional splits, and seven approved supporting
policies produce 33; RLS-001, RLS-025, and RLS-027 intentionally produce no
client mutation policy.

Traceability metadata is nevertheless inaccurate/incomplete:

- all 33 entries record `ownerResolutionDisposition: "APPROVED"`, while the
  authoritative owner-resolution groups used by these policies record
  `APPROVE_WITH_REFINEMENT`; the disposition is not copied accurately;
- all 27 reverse `productionPolicyArea` values are generic labels such as
  `Phase 10.5B RLS-001`, not the actual Production policy-area subjects from
  the decision record;
- predecessor areas in forward entries are decision IDs rather than the
  required Production policy-area descriptions.

Thus the mapping counts are complete, but the required owner disposition and
Production-area traceability are not.

## 10. Independent Object Counts

| Object | SQL-derived | Manifest/report | Result |
|---|---:|---:|---|
| Tables | 23 | 23 | Pass |
| Constraints | 153 | 153 | Pass |
| Non-constraint indexes | 90 | 90 | Pass |
| Functions | 28 | 28 | Pass |
| Runtime RPCs | 17 | 17 | Pass |
| Triggers | 10 | 10 | Pass |
| RLS-enabled tables | 23 | 23 | Pass |
| Policies | 33 | 33 | Pass |
| ACL statements | 54 | 54 | Pass |

## 11. SQL Structure and Dependency Review

Cross-file order remains:

`prerequisites → schemas → tables → constraints → indexes → functions →
triggers → RLS → policies → ACL → validation`.

Authorization helpers precede policies, trigger helpers precede attachments,
tables precede referencing objects, ACL targets precede ACL statements, and
validation is last. No circular or unresolved static dependency was found.

## 12. Schema and Constraint Integrity

The correction did not change tables, constraints, or indexes. Their hashes
match Phase 10.6A evidence. Clinic ownership, auth linkage, global operator,
multi-clinic membership, patient external identity, audit scope, lifecycle,
name reservation, and workstation ordering remain consistent with the freeze.

## 13. Function and RPC Review

The only executable function correction was making previously implicit
`VOLATILE` behavior explicit. No function count, signature, body, grant, or
category changed. All runtime RPC execution grants remain service-role-only.
The incomplete manifest/README matrix remains the blocking HIGH-002 issue.

## 14. Trigger Review

Ten unique trigger attachments still reference eight helpers created earlier.
Trigger SQL and behavior are byte-for-byte unchanged from Phase 10.6A.

## 15. RLS and Policy Review

RLS remains enabled on all 23 application tables. All 33 policies target
`authenticated`; none targets `PUBLIC` or `anon`. Policy SQL is unchanged.
Tenant authorization continues through durable membership/global operator
helpers. The blocking issue is traceability metadata, not policy logic.

## 16. ACL Review

There are 54 ACL statements. Application tables are revoked from `PUBLIC` and
`anon`; authenticated grants remain bounded and RLS-protected; all 17 runtime
RPCs are service-role-only; trigger helpers are not browser executable. ACL SQL
is unchanged. Positive ACL validation remains incomplete under HIGH-001.

## 17. Validation Script Review

The script is deterministic and read-only and fails with named exceptions.
It does not rely only on counts and checks many definitions. It has not been
parsed by a PostgreSQL-compatible parser or executed. The exact-set and positive
ACL omissions listed under HIGH-001 remain material.

## 18. Supabase Boundary Review

No baseline SQL creates `auth`, `storage`, `extensions`, Supabase roles,
`auth.users`, platform helpers, or internal metadata/tables. References are
prerequisite checks or foreign references only.

## 19. Security Review

`SECURITY-REQ-001` remains unchanged. No email-only authorization, anonymous
application policy, caller-clinic-only policy, PUBLIC runtime RPC execution,
secret, password, key, or connection string was found. RLS and durable
membership/global operator authorization remain intact. Corrections introduced
no privilege expansion.

`persistDeploymentRunAction` remains a staging-release and Version 1.0 blocker,
not a repository-baseline blocker.

## 20. Architecture Drift Review

No unexpected object or behavior was found. Corrected function attributes,
validation assertions, hashing metadata, and traceability metadata do not alter
the frozen schema architecture. Expected/justified objects remain those
approved by the locked owner resolution.

## 21. Determinism Review

File/object ordering and names remain stable. Executable SQL contains no
timestamp, random identifier, localhost default, unresolved placeholder, TODO,
silent authoritative `IF NOT EXISTS`, unapproved `CREATE OR REPLACE`, password,
secret, or connection string. No silent exception swallowing was found.

Deterministic manifest hashing verifies, but the unresolved metadata/validation
findings prevent repository acceptance.

## 22. New Findings

No new independent Critical, High, Medium, or Low finding was opened. The
issues above are incomplete resolutions of HIGH-001, HIGH-002, and HIGH-004.

## 23. Risk Summary

| Severity | Count | Disposition |
|---|---:|---|
| Critical | 0 | None |
| High | 3 | Prior findings partially resolved; acceptance blocked |
| Medium | 0 | None |
| Low | 0 | None |

## 24. Repository Acceptance Decision

`NOT_ACCEPTED_REQUIRES_REVISION`.

Repository acceptance rules require all four previous High findings to be
fully resolved. Three remain partially resolved.

## 25. Remaining Release Gates

- Complete exact-set and positive ACL validation coverage.
- Add accurate complete function matrices to manifest and README and retain the
  generation-report matrix.
- Replace generic/inaccurate policy owner dispositions and Production areas
  with authoritative owner-resolution statuses and decision subjects.
- Run a new independent repository acceptance review.
- Perform separately authorized isolated parsing/execution and security tests.
- Remediate `SECURITY-REQ-001`, complete application authorization and data
  preflights, and obtain separate Staging/Production authorizations.

## 26. Final Conclusion

Repository acceptance does not authorize and has not performed SQL execution,
Staging initialization, Production migration, or application release.

AUTHORITATIVE_BASELINE_REQUIRES_REVISION
