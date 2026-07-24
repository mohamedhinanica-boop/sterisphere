# Authoritative Baseline Correction Report

## 1. Correction phase identity

Phase 10.6B targeted corrections for baseline/freeze 1.0.0. Source review:
`authoritative-baseline-review.md/json`, conclusion
`AUTHORITATIVE_BASELINE_REQUIRES_REVISION`.

## 2. Initial artifact hashes

The complete pre-correction snapshot was recorded before writes. Relevant old
hashes:

- `000_manifest.json`: `DDD84D8DF1B3B2003D7587F53586830027A783E7A3101F65A2831DBADEBE5783`
- `050_functions.sql`: `2A32C4AEF90888BA8E786AD6EDAE7D85DF2537463734BD7DCFAA38CAAA161CBF`
- `100_validation.sql`: `353F610D306342716F2BD4FFE53A72B9BA327FAB81354D2726509FBA07F4C1FF`
- `README.md`: `DCAE43AD409D066A8D0FF577875201AB57AC918AA63A0DE345BB8F2302249B0F`
- `authoritative-baseline-generation-report.md`: `2240914382CC6A3C2E1D42A75E1619620AFF78087F896E6EB70A3158C8017BA2`

Review artifacts were snapshotted and remain immutable:
`B80BCC8173C43A4D8857E687BCA69BE4A9D4C56363F605881DD8EF9EF90AB61F`
(Markdown) and
`426954FCDEE913FB794F7AF0F1B9CB35E083BAFC6051967BE9E1899AEEDCA370`
(JSON).

## 3. HIGH-001 resolution

`100_validation.sql` now contains deterministic, read-only assertions for
schemas/platform prerequisites; exact table/column type/null/default identities;
all constraints/FK actions; all non-constraint indexes; exact function
signatures and attributes; RPC/helper counts; trigger attachments; exact RLS
tables; policy command/role/USING/WITH CHECK definitions; negative and bounded
positive ACL posture; membership/auth/global role structures; tenant ownership;
audit scope; patient external identity; clinic-name uniqueness; and non-unique
workstation ordering.

## 4. HIGH-002 resolution

All 28 functions explicitly declare volatility and security posture. The 12
runtime SECURITY DEFINER functions that relied on PostgreSQL's default now
declare `VOLATILE`, preserving behavior. Final posture: 15 SECURITY DEFINER,
13 SECURITY INVOKER. The complete matrix is in the generation report.

## 5. HIGH-003 resolution

The manifest lists all 13 non-manifest artifacts with role, execution order,
final size, SHA-256, hash algorithm, content status, and freeze version.
README/report use the documented reference-normalized canonical representation
to break the otherwise impossible manifest-hash reference cycle. The manifest
self-hash is excluded and recorded externally.

Old manifest SHA-256: `DDD84D8DF1B3B2003D7587F53586830027A783E7A3101F65A2831DBADEBE5783`  
New manifest SHA-256: `2D17CCA2DEE8A76EDCB1D105C451A8760B40771907B7EC70C9BDEBAB6512506D`

## 6. HIGH-004 resolution

The manifest and generation report contain 33 forward policy mappings and 27
reverse Production-decision mappings. They record command, roles, clause
purpose, source decision/group, owner disposition, classification, predecessor,
justification, tenant effect, and privilege effect. The documented arithmetic
is 24 direct decision policies + two intentional split additions + seven
supporting policies = 33, with three server-only/deny outcomes.

## 7. Files modified

- `supabase/baseline/v1.0.0/000_manifest.json`
- `supabase/baseline/v1.0.0/050_functions.sql`
- `supabase/baseline/v1.0.0/100_validation.sql`
- `supabase/baseline/v1.0.0/README.md`
- `docs/architecture/authoritative-baseline-generation-report.md`

Created: `docs/architecture/authoritative-baseline-correction-report.md`.

## 8. Files intentionally unchanged

`001_prerequisites.sql`, `010_schemas.sql`, `020_tables.sql`,
`030_constraints.sql`, `040_indexes.sql`, `060_triggers.sql`,
`070_rls.sql`, `080_policies.sql`, and `090_acl.sql` remain unchanged.
All frozen architecture, review, application, migration, capture, and
configuration artifacts remain unchanged.

## 9. Architecture fidelity and new findings

No architecture, object count, function body, policy logic, ACL logic, table,
constraint, index, trigger, or RLS behavior changed. No additional defect was
discovered.

## 10. Remaining blockers and re-review readiness

Offline PostgreSQL parser validation was unavailable. PostgreSQL execution was
not performed. Independent re-review, isolated fresh-database execution,
`SECURITY-REQ-001`, application authorization, data preflights, security
tests, and separate Staging/Production authorization remain blockers.

The corrected artifacts are ready for Phase 10.6C independent verification.

Validation results: npm.cmd run build passed; git diff --check passed; freeze/review/manifest JSON parsing passed; all eight frozen hashes and both review-artifact hashes matched; all 13 manifest artifact sizes and canonical hashes matched; independent counts, 28/28 explicit function attributes, and 33/27 policy mappings passed. No offline PostgreSQL parser was available and PostgreSQL execution was not performed.

AUTHORITATIVE_BASELINE_CORRECTIONS_READY_FOR_REVIEW
