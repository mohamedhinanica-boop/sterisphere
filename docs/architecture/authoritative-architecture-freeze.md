# Authoritative architecture freeze

## Freeze identity

| Field | Value |
|---|---|
| Freeze version | `1.0.0` |
| Freeze status | `LOCKED` |
| Created at | `2026-07-23T04:39:44.000Z` |
| Baseline generation | `AUTHORIZED` |
| Production migration | `NOT_AUTHORIZED` |
| Frozen inputs | 8 |
| Supporting evidence records | 7 |

Freeze Manifest SHA-256:
`0B0B1B157035F12AB210ECBD1DC6B7E55FF6DAFFDF652966ACB0396E66963619`

The hash is over the exact UTF-8 bytes of
`docs/architecture/authoritative-architecture-freeze.json`: two-space JSON
indentation, one trailing LF, and no BOM. The JSON deliberately contains no
recursive self-hash.

## Repository identity

| Field | Value |
|---|---|
| Branch | `main` |
| HEAD | `2373ad80d6a86510acde0010ea1bfb1f82d0fe02` |
| Short HEAD | `2373ad8` |
| Commit subject | `Phase 10.5D: Resolve authoritative baseline owner decisions` |
| Upstream | `origin/main` |
| Upstream status | Synchronized using the local tracking ref; `git status -sb` reported `main...origin/main` with no ahead/behind marker |
| Working tree before freeze | Clean |

No network fetch was performed. Synchronization records equality to the
available local `origin/main` tracking ref at freeze time, not a claim about
unfetched remote changes.

## Frozen authoritative inputs

All files existed, were Git-tracked, matched their committed HEAD blobs, and
had no working-tree changes before the freeze deliverables were created.

| Relative path | Type | Bytes | SHA-256 | Git blob | Role | State |
|---|---|---:|---|---|---|---|
| `docs/architecture/authoritative-baseline-decision-record.json` | JSON | 121974 | `CF5112BA7B80EB7FB93A8E3BF849DE432CAA06ECE0FBC6E9526F3BCDC99D1871` | `1a38d00903a05ff38b4c91c29212982e0f934a87` | Structured 76-decision authority | FROZEN |
| `docs/architecture/authoritative-baseline-decision-record.md` | Markdown | 24041 | `31B70138B38BD747ECE77A8A8FF6A6420CBCB82103E8B44CCE66B4E8433F625B` | `eed75ce593e42e00a89358013b8a5258a13559e7` | Detailed decision authority | FROZEN |
| `docs/architecture/authoritative-baseline-design.md` | Markdown | 24849 | `5CD8117FD42040C0912FAD8ABA40F01EB4E5DF385EE477DF05972C2722AE39B4` | `a35be40efc3098d5cbddcae2463a7fa85c0995e0` | Baseline scope, strategy, order, validation | FROZEN |
| `docs/architecture/authoritative-baseline-object-registry.json` | JSON | 763678 | `8A0CFEADAC660BAD9797BBB81C87920D3A9C89C8241BBCE96DDF03033B100E9F` | `77896ab1c84233111c052b183af881477852d866` | Factual object registry | FROZEN |
| `docs/architecture/authoritative-baseline-owner-approval.json` | JSON | 34350 | `E44A248B3B4C4616863AB76A98F6121C3C5AB706E6F80DCF44C703B7CC53E99D` | `0570b5c643c45930047fbd1f26c28ae779d4ae29` | Structured approval grouping | FROZEN |
| `docs/architecture/authoritative-baseline-owner-approval.md` | Markdown | 22733 | `8BDFAD2B6107D49273713ABFCDB8C889F7560B5C2D6ABB95210CF575F945E2BB` | `1ddce591209ca51a43c4eb4f2486d0fc1adb6f41` | Owner-readable approval review | FROZEN |
| `docs/architecture/authoritative-baseline-owner-resolution.json` | JSON | 33333 | `D0CE3D8910EBAA73AF87FD3903851D1207969764473281D5D14715120F26CB1B` | `06bebb1090223537a9d954f423d769abcf1c5367` | Structured final owner resolutions | FROZEN |
| `docs/architecture/authoritative-baseline-owner-resolution.md` | Markdown | 19635 | `B4255526CACC880371C1C0BC544DFAE92DA696D3193DB71F7DBCC28FC6B9A8A1` | `8a65b732e2e1a6f7925e9da4170eb2a0337f9321` | Final approved architecture and gates | FROZEN |

Only these eight artifacts may define the authoritative baseline.

## Supporting evidence

Supporting evidence may verify fidelity but may not override frozen owner
resolutions:

- `docs/architecture/deployment-architecture.md`;
- `docs/architecture/deployment-sequence.md`;
- `docs/architecture/environment-management.md`;
- `docs/architecture/environment-synchronization.md`;
- `docs/architecture/production-schema-capture.md`;
- `docs/architecture/production-schema-reconciliation-report.md`;
- `docs/architecture/staging-schema-synchronization-plan.md`.

### Production capture reference

| Field | Value |
|---|---|
| Relative directory | `.tmp/schema-captures/20260723T031930Z/` |
| Capture ID | `20260723T031930Z` |
| Capture timestamp | `2026-07-23T03:19:30Z` |
| Status | `VALIDATED_SCHEMA_ONLY` |
| Mode | `schema-only` |
| Manifest | `.tmp/schema-captures/20260723T031930Z/production-schema-manifest.json` |
| Manifest SHA-256 | `A83855277A55A0B9E67D8028774E9D620A0BF9F06A319B60943C76C0421F299D` |
| Project reference | Not recorded in approved architecture artifacts; intentionally omitted |

Validator summary: 4 schemas, 52 tables, 0 views, 0 materialized views, 1
sequence, 52 functions, 14 triggers, 143 indexes, 355 constraints, 45
RLS-enabled tables, 27 policies, 91 grants, 19 revokes, and 25 RPC candidates.

The exact authoritative capture is established by the Phase 10.4 report and
all later approved artifacts. The capture remains local supporting evidence,
is not copied into this package, and was not modified.

## Excluded artifacts

The following are not baseline-generation authority:

- superseded planning SQL such as `supabase_deployment_core.sql`;
- historical SQL and all diagnostic/preflight queries;
- repair-only SQL such as `supabase_investigation_lifecycle.sql`;
- Production dump SQL as mechanical baseline input;
- application source, runtime defaults, and environment files;
- any unapproved, untracked, or later-created architecture interpretation.

Historical or superseded SQL must never be silently reintroduced.

## Mandatory security gate

### SECURITY-REQ-001

Classification: release-blocking implementation requirement. It is not a
baseline-generation blocker.

Every user-triggered server action or service that constructs or uses a
Supabase service-role client must:

1. authenticate the caller;
2. authorize the caller;
3. resolve permitted clinic scope from durable records;
4. validate the requested target against that scope;
5. only then execute the privileged operation; and
6. emit appropriate audit evidence.

Known finding: `persistDeploymentRunAction` constructs its service-role client
without first verifying the authenticated caller, global operator status, or
clinic membership.

This must be remediated and tested before Staging release and Version 1.0.
Required tests include unauthenticated, unauthorized-role, forged-clinic, and
cross-clinic denial, positive global-operator and clinic-admin paths, and
privileged-operation audit evidence.

## Freeze invalidation rules

1. Any byte change to a frozen input invalidates freeze `1.0.0`.
2. Any architecture change requires a new decision record or amendment,
   explicit owner approval, and a new freeze version.
3. A missing, untracked, modified, or hash-mismatched input invalidates the
   freeze.
4. Supporting evidence may verify fidelity but cannot override approved owner
   resolutions.
5. Baseline generation must not reinterpret owner-approved decisions.
6. Production migration gates remain separate from baseline readiness.

## Authorized actions

This freeze authorizes only:

- generation of a proposed authoritative baseline from exactly the eight
  frozen inputs;
- consultation of supporting Production evidence for fidelity verification;
- baseline traceability and validation artifacts in a separately authorized
  phase.

## Unauthorized actions

This freeze does not authorize:

- Staging initialization;
- Production migration or other database modification;
- Production RLS replacement;
- application release;
- Version 1.0 release;
- reinterpretation of approved decisions;
- Supabase mutation commands;
- reintroduction of excluded SQL.

## Baseline-generation contract

The future baseline:

1. uses only the eight frozen artifacts as architectural authority;
2. treats Production capture and other evidence as fidelity checks only;
3. preserves every final owner resolution without reinterpretation;
4. excludes superseded, historical, repair-only, planning-only, and diagnostic
   SQL from the executable chain;
5. remains separate from forward Production migrations;
6. includes traceability to:
   - freeze version `1.0.0`;
   - freeze manifest SHA-256
     `0B0B1B157035F12AB210ECBD1DC6B7E55FF6DAFFDF652966ACB0396E66963619`;
   - frozen owner-resolution SHA-256
     `D0CE3D8910EBAA73AF87FD3903851D1207969764473281D5D14715120F26CB1B`;
   - Production capture `.tmp/schema-captures/20260723T031930Z/`.

If any recorded hash no longer matches, baseline generation must stop and a
new approved freeze must be created.

AUTHORITATIVE_ARCHITECTURE_FREEZE_LOCKED
