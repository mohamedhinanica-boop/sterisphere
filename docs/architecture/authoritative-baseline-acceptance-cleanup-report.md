# Authoritative Baseline Acceptance Cleanup Report

## 1. Phase identity

Phase 10.6D narrow repository-acceptance cleanup, sourced from Phase 10.6C
reverification `AUTHORITATIVE_BASELINE_REQUIRES_REVISION`.

## 2. Initial artifact hashes

The complete pre-cleanup hash/size snapshot was recorded before modification.
Key old hashes: manifest `2D17CCA2DEE8A76EDCB1D105C451A8760B40771907B7EC70C9BDEBAB6512506D`, validation
`4838EEDB2FB7DAE0FC2708B89032B6DFF1EEDD00669EF17DCD15D502B993277A`,
README `0234E82E41E02396F09B211ADA680AD5D6646F1B9E84933A884D0F35BD04C525`,
and generation report
`EDCAD241FCAC98D52DF696D6F1F610C7A0AABA89F7FBB4057DAEE00F22F25AA0`.

## 3. HIGH-001 cleanup

Resolved in cleanup evidence: validation now rejects unexpected and missing
tables, constraints, indexes, function signatures, triggers, and RLS sets. It
compares exact direct non-owner table/function ACL tuples using
`aclexplode`, with distinct missing/unexpected exceptions. Expected ACLs cover
PUBLIC, anon, authenticated, service_role, 23 tables, 17 RPCs, three
authorization helpers, and eight trigger helpers.

## 4. HIGH-002 cleanup

Resolved in cleanup evidence: manifest and README now contain all 28 functions
with exact identity, return, category, language, volatility, security, search
path, strictness, execution grantees, purpose, decision, dependency, tenant,
and caller-trust fields. Totals remain 15 definer, 13 invoker, 28 explicit
volatility, and 17 RPCs.

## 5. HIGH-004 cleanup

Resolved in cleanup evidence: 33 forward and 27 reverse mappings now use exact
decision-record subjects/Production behavior, owner approval `PENDING`, and
owner resolution `APPROVE_WITH_REFINEMENT` for the involved approval groups.
All splits, supporting policies, and server-only omissions remain documented.

## 6. HIGH-003 preservation and manifest regeneration

All 13 external artifacts remain listed and use the existing deterministic
canonicalization/self-hash exclusion contract. Affected sizes/hashes were
recomputed.

Old manifest SHA-256: `2D17CCA2DEE8A76EDCB1D105C451A8760B40771907B7EC70C9BDEBAB6512506D`  
New manifest SHA-256: `C5ACAD3326A94E3F87BB81EBC102E76F7FACD9AB6882C2B10BB1C76EA236310E`

## 7. Files modified and unchanged

Modified only: `000_manifest.json`, `100_validation.sql`, `README.md`,
and the generation report. Created only this cleanup report. All other
executable SQL, frozen architecture, prior review/correction/reverification,
application, migration, capture, and configuration files remain unchanged.

## 8. Architecture fidelity and new issues

No object-definition SQL, count, policy logic, function behavior, trigger, RLS,
or ACL behavior changed. No new issue was discovered.

## 9. Remaining blockers and final-review readiness

Repository acceptance remains `NOT_YET_AUTHORIZED`. Offline PostgreSQL parser
validation was unavailable and PostgreSQL execution was not performed.
Phase 10.6E independent acceptance, isolated execution/security testing,
`SECURITY-REQ-001`, application authorization, data preflights, and separate
Staging/Production authorization remain required.

The cleanup artifacts are ready for final independent acceptance review.

AUTHORITATIVE_BASELINE_ACCEPTANCE_CLEANUP_READY
