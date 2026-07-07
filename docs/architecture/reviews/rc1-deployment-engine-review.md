# RC1 Deployment Engine Review 2

## Purpose

This review assesses the current Deployment Engine foundation before real
persistence begins. It is documentation-only and evaluates whether the engine
contracts, simulation, transaction model, and planned persistence boundaries
are ready to support v1.0 deployment implementation.

The current system is intentionally not a real deployment executor. It has:

- A canonical `DeploymentDraft` contract.
- A Setup Wizard to draft adapter.
- Pure local draft validation.
- A 14-stage deployment registry and in-memory simulation.
- Dry-run repository payload builders.
- An inert repository abstraction.
- An in-memory transaction model.
- Review-step diagnostics that expose only safe summaries.

It does not currently write to Supabase, execute SQL, call API routes, mutate
auth, enable the Deploy button, or unlock a clinic.

## Readiness Categories

- **Ready for v1.0**: Suitable to carry into the persistence phase with normal
  implementation work.
- **Improve before v1.0**: Must be strengthened before real clinic deployment.
- **Move to v1.1**: Useful, but not required to safely ship the first
  controlled v1.0 deployment.

## Topic Review

| Topic | Current implementation | Strengths | Risks | Recommendation | Priority |
| --- | --- | --- | --- | --- | --- |
| Concurrent deployments | The engine models legal deployment states and simulates a lock stage, but there is no durable lock yet. The planning SQL has `deployment_runs` and status fields, but it is not applied or wired. | The sequence already treats "no deployment is already running" as a precondition. The stage registry has an explicit lock stage and a transaction boundary around persistence-relevant stages. | Two browser tabs, two admins, or a retry worker could start competing persistence attempts unless the real repository atomically acquires a lock. UI-only disabled states will not be enough. | Implement a durable lock before any real writes. Use a database-enforced transition such as `draft` or retryable `failed` to `deploying`, scoped by clinic or deployment target, and reject or resolve competing requests through the existing run. | **Improve before v1.0** |
| Deployment locking | `Lock Deployment` exists as Stage 3 and produces simulated output only. No persisted lock owner, lock timestamp, expiry, or recovery state exists at runtime. | Locking is named in the sequence and isolated as a first-class stage, which makes it easy to replace the simulation with a repository-backed operation. | If persistence starts before real locking, partial duplicate configuration could be created. A stuck `deploying` status could also block recovery if owner and timeout semantics are not designed. | Add lock owner fields through `deployment_runs`, clinic status, or a dedicated lock record. Store the active run ID, lock acquisition time, and failure transition behavior. Avoid time-based auto-unlock unless paired with support verification. | **Improve before v1.0** |
| Browser interruption | The current engine can simulate complete execution locally, but real deployment is not yet server-owned. The Review and Complete screens remain local-only. | The docs already state that a redirect or success toast cannot declare deployment success. The planned `deployment_runs` model can support server-side resume/status display. | If real deployment is driven from a browser request without durable run state, tab close, refresh, or navigation could leave ambiguous execution status. | Make persistence execution server-owned and durable. The browser should submit one idempotent request, then poll or reload deployment-run status. The server-side run status must be the source of truth after interruption. | **Improve before v1.0** |
| Network interruption | No network path exists yet. The inert repository throws intentionally and simulation performs no network calls. | The current absence of network writes avoids hidden partial behavior. Idempotency and deployment-run concepts are already present in the architecture. | Once an API route or server action exists, the client may not know whether a request failed before starting, during commit, or after success response generation. | Require idempotency keys and durable run lookup for every deployment request. Retrying the same request must return the existing pending, running, succeeded, or failed run rather than start a second deployment. | **Improve before v1.0** |
| Duplicate deployment requests | The architecture specifies idempotency and unique deployment-run identity. The payload builders create deterministic dry-run context, but no real duplicate handling is active. | The planned `clinic_id + idempotency_key` uniqueness and payload hash give the right primitive for duplicate suppression. | Without server enforcement, duplicate clicks or retried requests could create duplicate rows for workstations, sterilizers, planning records, or audit entries. | Enforce uniqueness in the database and repository. Treat duplicate idempotency keys with the same payload as safe replay. Treat the same key with a different payload hash as a conflict requiring manual review. | **Improve before v1.0** |
| Idempotency | `DeploymentRepositoryBuildContext` carries `idempotencyKey`, payload hash, deployment version, schema version, and deterministic simulated IDs. `deployment_runs` planning SQL includes an idempotency key. | Idempotency is already modeled at the contract layer and is visible in dry-run payload metadata. | The local draft hash is explicitly non-cryptographic and development-only. Real persistence still needs stable server-side idempotency generation or validation. | Generate or verify idempotency at the trusted server boundary. Store `payload_hash`, `reviewed_payload`, and `draft_version` together. Use cryptographic hashing for durable audit/idempotency evidence. | **Improve before v1.0** |
| Rollback strategy | The sequence defines rollback philosophy. The engine now has simulated rollback intent, rollback dry-run payload metadata, and in-memory transaction checkpoints. Real `rollback()` remains inert. | Rollback is designed before persistence, which is the right direction. The transaction checkpoint model helps identify which stages would need compensating actions. | Simulated rollback does not prove database rollback, external side-effect rollback, or recovery from rollback failure. Audit evidence must survive rollback without falsely claiming success. | Before persistence, define which stages run inside one database transaction and which require compensating rollback. Implement rollback verification and a non-operational recovery state when rollback cannot be confirmed. | **Improve before v1.0** |
| Transaction integrity | The current `DeploymentTransaction` is in-memory only. It begins before persistence-relevant simulated stages, records checkpoints, commits on success, and aborts plus rolls back on simulated failure. | The transaction model cleanly expresses all-or-nothing expectations without prematurely binding the design to a specific database implementation. | There is no real atomicity yet. Some future operations, especially audit, auth, or external workflow triggers, may not fit inside one database transaction. | Map the transaction model to real Supabase/Postgres transaction boundaries wherever possible. Keep non-transactional side effects out of v1.0 deployment, or model them as post-commit steps with explicit recovery behavior. | **Improve before v1.0** |
| Audit completeness | Architecture defines `deployment_runs`, reviewed payload snapshots, failure stage/message, and audit entries. Dry-run payloads include `CreateAuditEntryPayload`. No audit writes occur yet. | The design separates durable run evidence from clinic-owned success audit entries, which avoids erasing failure evidence during rollback. | Audit completeness can be weakened if audit entries are written only after all work succeeds or if rollback removes all evidence. Missing `started_by` or review metadata would reduce accountability. | Persist deployment-run evidence before configuration writes. Store initiator, reviewed payload hash, draft version, deployment version, schema version, stage transitions, final status, and sanitized failures. Clinic-owned success audit entries should be created only when they truthfully describe committed configuration. | **Improve before v1.0** |
| Wizard lifecycle after deployment | Docs state that the first-run wizard should lock after deployment and Settings should own routine reconfiguration. Current UI still remains local-only and the Deploy action is disabled. | The lifecycle boundary is already clear: the wizard plans first deployment; it does not become a live settings editor. | If persistence enables deployment without a durable post-deploy gate, users could rerun setup against a deployed clinic or see stale draft state after success. | Add deployed-state gating before enabling deployment. After success, route normal users to the dashboard, lock first-run setup, and expose any deployment result through run status rather than mutable local wizard state. | **Improve before v1.0** |
| Retry strategy | The state machine allows `failed -> deploying`, and the sequence describes safe retry. There is no persisted retry implementation yet. | Retry is constrained to validated failed states and uses the same reviewed draft boundary, which reduces accidental partial repair paths. | Retrying after rollback uncertainty could make damage worse. Retrying with a changed draft under the same idempotency key could corrupt audit meaning. | Implement retry as a new run or explicit superseding attempt linked to the failed run. Require confirmed rollback or support recovery before retry. Require new review and payload hash if the draft changes. | **Improve before v1.0** |
| Manual recovery strategy | The architecture mentions support intervention and recoverable drafts, but there is no dedicated recovery workflow, run inspection view, or admin repair command. | The docs already preserve failed attempts and avoid exposing partial clinics as operational. | v1.0 could be blocked operationally if a deployment lands in failed recovery and there is no documented operator playbook. | Create a minimal v1.0 manual recovery playbook before real deployment: inspect run, verify clinic status, verify rollback, mark retryable or blocked, and record support audit notes. A full UI can move to v1.1 if run records are queryable by support. | **Improve before v1.0** |

## Deployment Engine Readiness Score

**Score: 7.1 / 10 for pre-persistence architecture readiness.**

The engine is strong as a contract and orchestration foundation. Its current
simulation proves stage order, draft validation, payload mapping, failure
stopping, rollback intent, and transaction metadata shape without risking real
data. That is exactly the right posture before persistence.

It is not yet production-ready as an executor. The remaining gap is not the
stage model; it is durable coordination: locking, idempotent request handling,
database transaction mapping, durable audit, retry safety, and manual recovery
evidence.

## Critical Blockers

The following items block real v1.0 deployment persistence:

1. Durable deployment lock and active-run ownership.
2. Server-side idempotency enforcement with payload-hash conflict handling.
3. Real transaction strategy for clinic configuration writes.
4. Durable `deployment_runs` lifecycle updates for pending, running,
   succeeded, failed, and recovery states.
5. Rollback verification and recovery-state handling.
6. Deployment audit evidence that survives rollback.
7. Post-deployment wizard lock and deployed-state dashboard gating.

## Recommended Implementation Order Before Persistence

1. **Finalize persistence state model.** Apply or refine the planned
   `clinics` and `deployment_runs` schema, including active run ownership,
   deployment status checks, payload hash, idempotency uniqueness, stage
   failure fields, and timestamps.
2. **Implement repository read/write contracts behind tests.** Keep the engine
   orchestration unchanged while adding repository methods for run creation,
   lock acquisition, configuration writes, completion, failure marking, and
   rollback.
3. **Implement durable idempotency first.** A repeated request must resolve to
   an existing run before any configuration write can happen.
4. **Implement lock acquisition and release/failure transitions.** Locking
   must be atomic with run ownership and clinic deployment status.
5. **Map transaction boundaries.** Group clinic creation, settings,
   workstations, sterilizers, planning records, policies, defaults, audit, and
   finalization into the strongest available database transaction. Explicitly
   classify any post-commit steps.
6. **Implement rollback and recovery verification.** Failed configuration
   attempts must leave the clinic non-operational and support-readable.
7. **Persist audit and run-stage evidence.** Record start, stage progression,
   success/failure, initiator, payload identity, versions, and sanitized
   diagnostics.
8. **Add browser/network interruption behavior.** Make the client submit once
   with an idempotency key, then resolve status from the durable run.
9. **Add post-success wizard lifecycle enforcement.** Lock first-run setup and
   route deployed clinics to normal workflows.
10. **Create the v1.0 manual recovery playbook.** Define support steps for
    failed, stuck, or rollback-uncertain deployments before the first real
    clinic deployment.

## Overall RC1 Decision

The Deployment Engine is **ready to proceed into persistence implementation
planning**, but **not ready to execute real v1.0 deployments** until the
critical blockers above are implemented and validated.

The recommended category for the current engine foundation is:

**Improve before v1.0**

No reviewed topic should be moved to v1.1 if it protects against duplicate
deployment, partial deployment, lost audit evidence, or unsafe retry. A richer
manual recovery UI can move to v1.1, but the v1.0 operator playbook and durable
run evidence should exist before persistence is enabled.
