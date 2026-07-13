import {
  DeploymentActivationExecutionStartService,
} from "./deployment-activation-execution-start-service";
import {
  buildStartSnapshot,
  InMemoryDeploymentActivationExecutionStartTestRepository,
} from "./deployment-activation-execution-start-test-repository";
import type {
  DeploymentActivationExecutionStartCommand,
  DeploymentActivationExecutionStartIssueCode,
  DeploymentActivationExecutionStartResult,
  DeploymentActivationExecutionStartSnapshot,
} from "./deployment-activation-execution-start-types";

export interface DeploymentActivationExecutionStartServiceHarnessScenario {
  name: string;
  passed: boolean;
  message: string;
}

export interface DeploymentActivationExecutionStartServiceHarnessResult {
  passed: boolean;
  scenarios: readonly DeploymentActivationExecutionStartServiceHarnessScenario[];
}

const CURRENT_TIME = "2026-01-01T12:00:00.000Z";
const ACTIVE_LEASE = "2026-01-01T12:05:00.000Z";
const EXPIRED_LEASE = "2026-01-01T11:55:00.000Z";
const STARTED_AT = "2026-01-01T11:59:00.000Z";
const CLINIC_ID = "clinic-start-0001";
const DEPLOYMENT_RUN_ID = "deployment-run-start-0001";
const SESSION_ID = "activation-execution-session-start-0001";
const EXECUTION_KEY = "activation-execution-deployment-run-start-0001";
const CLAIMANT_ID = "executor-start-001";
const OWNERSHIP_TOKEN = "sensitive-start-token";

export async function runDeploymentActivationExecutionStartServiceHarness(): Promise<DeploymentActivationExecutionStartServiceHarnessResult> {
  const scenarios = [
    await scenarioValidClaimedSessionStartable(),
    await scenarioDeterministicStartProposal(),
    await scenarioSourceSnapshotUnmodified(),
    await scenarioClinicMismatch(),
    await scenarioDeploymentRunMismatch(),
    await scenarioSessionMismatch(),
    await scenarioExecutionKeyMismatch(),
    await scenarioPreparationNotReady(),
    await scenarioPreparedSessionNotClaimed(),
    await scenarioClaimedMissingOwner(),
    await scenarioClaimedMissingToken(),
    await scenarioClaimedMissingLease(),
    await scenarioClaimantMismatch(),
    await scenarioOwnershipTokenMismatch(),
    await scenarioExpiredLease(),
    await scenarioMalformedLeaseTimestamp(),
    await scenarioAlreadyStartedBySameOwner(),
    await scenarioRunningUnderAnotherOwner(),
    await scenarioCompletedSession(),
    await scenarioFailedSession(),
    await scenarioRequestedItemCountMismatch(),
    await scenarioSessionCounterMismatch(),
    await scenarioZeroReadyRoots(),
    await scenarioMultipleReadyRoots(),
    await scenarioPendingRootItem(),
    await scenarioFirstSequenceNotOne(),
    await scenarioFirstItemNotReady(),
    await scenarioInvalidItemLifecycle(),
    await scenarioNonzeroAttempts(),
    await scenarioItemExecutionTimestamps(),
    await scenarioRollbackTimestamps(),
    await scenarioItemErrorEvidence(),
    await scenarioDuplicateExecutionItemKeys(),
    await scenarioDuplicatePlanItemKeys(),
    await scenarioDuplicateSequences(),
    await scenarioMalformedDependencies(),
    await scenarioRepositoryError(),
    await scenarioTokenRedaction(),
    await scenarioDownstreamCountersRemainZero(),
    await scenarioNoRepositoryMutationMethodsInvoked(),
  ];

  return {
    passed: scenarios.every((scenario) => scenario.passed),
    scenarios,
  };
}

async function scenarioValidClaimedSessionStartable(): Promise<DeploymentActivationExecutionStartServiceHarnessScenario> {
  const result = await assess();

  return expectScenario(
    "valid claimed session is startable",
    result.ok &&
      result.status === "startable" &&
      result.proposedExecutionStatus === "running" &&
      result.proposedStartedAt === CURRENT_TIME &&
      result.currentLeaseExpiresAt === ACTIVE_LEASE &&
      result.itemsReady === 1 &&
      result.itemsPending === 2,
    JSON.stringify(result),
  );
}

async function scenarioDeterministicStartProposal(): Promise<DeploymentActivationExecutionStartServiceHarnessScenario> {
  const first = await assess();
  const second = await assess();

  return expectScenario(
    "deterministic start proposal",
    JSON.stringify(first) === JSON.stringify(second),
    JSON.stringify({ first, second }),
  );
}

async function scenarioSourceSnapshotUnmodified(): Promise<DeploymentActivationExecutionStartServiceHarnessScenario> {
  const source = snapshot();
  const before = JSON.stringify(source);
  await assess(source);

  return expectScenario(
    "source snapshot remains immutable",
    JSON.stringify(source) === before,
    "source snapshot unchanged",
  );
}

async function scenarioClinicMismatch(): Promise<DeploymentActivationExecutionStartServiceHarnessScenario> {
  return expectIssue("clinic mismatch", snapshot({ session: { clinicId: "clinic-other" } }), "clinic_identity_mismatch", "conflict");
}

async function scenarioDeploymentRunMismatch(): Promise<DeploymentActivationExecutionStartServiceHarnessScenario> {
  return expectIssue("deployment-run mismatch", snapshot({ session: { deploymentRunId: "deployment-run-other" } }), "deployment_run_identity_mismatch", "conflict");
}

async function scenarioSessionMismatch(): Promise<DeploymentActivationExecutionStartServiceHarnessScenario> {
  return expectIssue("session mismatch", snapshot({ session: { id: "activation-execution-session-other" } }), "session_identity_mismatch", "conflict");
}

async function scenarioExecutionKeyMismatch(): Promise<DeploymentActivationExecutionStartServiceHarnessScenario> {
  return expectIssue("execution-key mismatch", snapshot({ session: { executionKey: "activation-execution-other" } }), "execution_key_mismatch", "conflict");
}

async function scenarioPreparationNotReady(): Promise<DeploymentActivationExecutionStartServiceHarnessScenario> {
  return expectIssue("preparation status not ready", snapshot({ session: { preparationStatus: "blocked" } }), "preparation_not_ready", "blocked");
}

async function scenarioPreparedSessionNotClaimed(): Promise<DeploymentActivationExecutionStartServiceHarnessScenario> {
  return expectIssue("prepared session is not yet claimed", snapshot({ session: { executionStatus: "prepared", executionOwner: null, ownershipToken: null, leaseExpiresAt: null } }), "execution_status_not_startable", "blocked");
}

async function scenarioClaimedMissingOwner(): Promise<DeploymentActivationExecutionStartServiceHarnessScenario> {
  return expectIssue("claimed session missing owner", snapshot({ session: { executionOwner: null } }), "ownership_shape_inconsistent", "blocked");
}

async function scenarioClaimedMissingToken(): Promise<DeploymentActivationExecutionStartServiceHarnessScenario> {
  return expectIssue("claimed session missing token", snapshot({ session: { ownershipToken: null } }), "ownership_shape_inconsistent", "blocked");
}

async function scenarioClaimedMissingLease(): Promise<DeploymentActivationExecutionStartServiceHarnessScenario> {
  return expectIssue("claimed session missing lease", snapshot({ session: { leaseExpiresAt: null } }), "ownership_shape_inconsistent", "blocked");
}

async function scenarioClaimantMismatch(): Promise<DeploymentActivationExecutionStartServiceHarnessScenario> {
  return expectIssue("claimant mismatch", snapshot({ session: { executionOwner: "executor-other" } }), "session_owned_by_another_executor", "conflict");
}

async function scenarioOwnershipTokenMismatch(): Promise<DeploymentActivationExecutionStartServiceHarnessScenario> {
  const result = await assess(undefined, { ownershipToken: "wrong-sensitive-token" });

  return expectScenario(
    "ownership-token mismatch",
    result.status === "conflict" &&
      hasIssue(result, "ownership_token_mismatch") &&
      !serializedEvidence(result).includes("wrong-sensitive-token"),
    JSON.stringify(result),
  );
}

async function scenarioExpiredLease(): Promise<DeploymentActivationExecutionStartServiceHarnessScenario> {
  return expectIssue("expired lease", snapshot({ session: { leaseExpiresAt: EXPIRED_LEASE } }), "lease_expired", "blocked");
}

async function scenarioMalformedLeaseTimestamp(): Promise<DeploymentActivationExecutionStartServiceHarnessScenario> {
  return expectIssue("malformed lease timestamp", snapshot({ session: { leaseExpiresAt: "not-a-date" } }), "lease_timestamp_malformed", "blocked");
}

async function scenarioAlreadyStartedBySameOwner(): Promise<DeploymentActivationExecutionStartServiceHarnessScenario> {
  const result = await assess(snapshot({ session: { executionStatus: "running", startedAt: STARTED_AT } }));

  return expectScenario(
    "session already started by same owner",
    result.ok &&
      result.status === "already_started" &&
      result.proposedExecutionStatus === null &&
      result.proposedStartedAt === null &&
      result.currentLeaseExpiresAt === ACTIVE_LEASE,
    JSON.stringify(result),
  );
}

async function scenarioRunningUnderAnotherOwner(): Promise<DeploymentActivationExecutionStartServiceHarnessScenario> {
  return expectIssue("running under another owner", snapshot({ session: { executionStatus: "running", startedAt: STARTED_AT, executionOwner: "executor-other" } }), "session_owned_by_another_executor", "conflict");
}

async function scenarioCompletedSession(): Promise<DeploymentActivationExecutionStartServiceHarnessScenario> {
  return expectIssue("completed session blocks", snapshot({ session: { executionStatus: "completed", completedAt: "2026-01-01T12:03:00.000Z" } }), "execution_status_not_startable", "blocked");
}

async function scenarioFailedSession(): Promise<DeploymentActivationExecutionStartServiceHarnessScenario> {
  return expectIssue("failed session blocks", snapshot({ session: { executionStatus: "failed", failedAt: "2026-01-01T12:03:00.000Z" } }), "execution_status_not_startable", "blocked");
}

async function scenarioRequestedItemCountMismatch(): Promise<DeploymentActivationExecutionStartServiceHarnessScenario> {
  return expectIssue("requested/item count mismatch", snapshot({ itemIntegrity: { durableItemCount: 2 } }), "incomplete_item_set", "blocked");
}

async function scenarioSessionCounterMismatch(): Promise<DeploymentActivationExecutionStartServiceHarnessScenario> {
  return expectIssue("session counter mismatch", snapshot({ session: { itemsReady: 2 } }), "session_counter_mismatch", "blocked");
}

async function scenarioZeroReadyRoots(): Promise<DeploymentActivationExecutionStartServiceHarnessScenario> {
  return expectIssue("zero ready roots", snapshot({ itemIntegrity: { readyRootCount: 0 } }), "dependency_integrity_invalid", "blocked");
}

async function scenarioMultipleReadyRoots(): Promise<DeploymentActivationExecutionStartServiceHarnessScenario> {
  return expectIssue("multiple ready roots", snapshot({ itemIntegrity: { readyRootCount: 2 } }), "dependency_integrity_invalid", "blocked");
}

async function scenarioPendingRootItem(): Promise<DeploymentActivationExecutionStartServiceHarnessScenario> {
  return expectIssue("pending root item", snapshot({ itemIntegrity: { pendingRootCount: 1 } }), "dependency_integrity_invalid", "blocked");
}

async function scenarioFirstSequenceNotOne(): Promise<DeploymentActivationExecutionStartServiceHarnessScenario> {
  return expectIssue("first sequence not one", snapshot({ itemIntegrity: { firstSequence: 2 } }), "dependency_integrity_invalid", "blocked");
}

async function scenarioFirstItemNotReady(): Promise<DeploymentActivationExecutionStartServiceHarnessScenario> {
  return expectIssue("first item not ready", snapshot({ itemIntegrity: { firstItemStatus: "pending" } }), "dependency_integrity_invalid", "blocked");
}

async function scenarioInvalidItemLifecycle(): Promise<DeploymentActivationExecutionStartServiceHarnessScenario> {
  return expectIssue("invalid item lifecycle", snapshot({ itemIntegrity: { invalidStatusCount: 1 } }), "invalid_item_lifecycle", "blocked");
}

async function scenarioNonzeroAttempts(): Promise<DeploymentActivationExecutionStartServiceHarnessScenario> {
  return expectIssue("nonzero attempts", snapshot({ itemIntegrity: { attemptedItemCount: 1 } }), "attempt_evidence_present", "blocked");
}

async function scenarioItemExecutionTimestamps(): Promise<DeploymentActivationExecutionStartServiceHarnessScenario> {
  return expectIssue("item execution timestamps", snapshot({ itemIntegrity: { itemExecutionTimestampCount: 1 } }), "execution_timestamp_present", "blocked");
}

async function scenarioRollbackTimestamps(): Promise<DeploymentActivationExecutionStartServiceHarnessScenario> {
  return expectIssue("rollback timestamps", snapshot({ itemIntegrity: { rollbackTimestampCount: 1 } }), "rollback_timestamp_present", "blocked");
}

async function scenarioItemErrorEvidence(): Promise<DeploymentActivationExecutionStartServiceHarnessScenario> {
  return expectIssue("item error evidence", snapshot({ itemIntegrity: { errorEvidenceCount: 1 } }), "item_error_present", "blocked");
}

async function scenarioDuplicateExecutionItemKeys(): Promise<DeploymentActivationExecutionStartServiceHarnessScenario> {
  return expectIssue("duplicate execution-item keys", snapshot({ itemIntegrity: { duplicateExecutionItemKeyCount: 1 } }), "duplicate_item_identity", "blocked");
}

async function scenarioDuplicatePlanItemKeys(): Promise<DeploymentActivationExecutionStartServiceHarnessScenario> {
  return expectIssue("duplicate plan-item keys", snapshot({ itemIntegrity: { duplicatePlanItemKeyCount: 1 } }), "duplicate_item_identity", "blocked");
}

async function scenarioDuplicateSequences(): Promise<DeploymentActivationExecutionStartServiceHarnessScenario> {
  return expectIssue("duplicate sequences", snapshot({ itemIntegrity: { duplicateSequenceCount: 1 } }), "duplicate_item_identity", "blocked");
}

async function scenarioMalformedDependencies(): Promise<DeploymentActivationExecutionStartServiceHarnessScenario> {
  return expectIssue("malformed dependencies", snapshot({ itemIntegrity: { malformedDependencyCount: 1 } }), "dependency_integrity_invalid", "blocked");
}

async function scenarioRepositoryError(): Promise<DeploymentActivationExecutionStartServiceHarnessScenario> {
  const repository = new InMemoryDeploymentActivationExecutionStartTestRepository({ shouldThrow: true });
  const result = await service(repository).assessStart(command());

  return expectScenario(
    "repository error",
    result.status === "error" && hasIssue(result, "repository_error"),
    JSON.stringify(result),
  );
}

async function scenarioTokenRedaction(): Promise<DeploymentActivationExecutionStartServiceHarnessScenario> {
  const result = await assess(undefined, { ownershipToken: "wrong-sensitive-token" });
  const serialized = serializedEvidence(result);

  return expectScenario(
    "ownership token redacted in messages and issues",
    !serialized.includes(OWNERSHIP_TOKEN) &&
      !serialized.includes("wrong-sensitive-token"),
    serialized,
  );
}

async function scenarioDownstreamCountersRemainZero(): Promise<DeploymentActivationExecutionStartServiceHarnessScenario> {
  const result = await assess();

  return expectScenario(
    "downstream counters remain zero",
    result.downstream.sessionsStarted === 0 &&
      result.downstream.itemsStarted === 0 &&
      result.downstream.itemsSucceeded === 0 &&
      result.downstream.itemsFailed === 0 &&
      result.downstream.itemsRolledBack === 0 &&
      result.downstream.entitiesActivated === 0 &&
      result.downstream.bindingsWritten === 0 &&
      result.downstream.deploymentRunsFinalized === 0 &&
      result.downstream.rollbacksExecuted === 0,
    JSON.stringify(result.downstream),
  );
}

async function scenarioNoRepositoryMutationMethodsInvoked(): Promise<DeploymentActivationExecutionStartServiceHarnessScenario> {
  const repository = new InMemoryDeploymentActivationExecutionStartTestRepository({ snapshot: snapshot() });
  await service(repository).assessStart(command());
  const prototype = InMemoryDeploymentActivationExecutionStartTestRepository.prototype as Record<string, unknown>;
  const forbiddenMethods = ["insert", "update", "upsert", "delete", "claim", "start", "heartbeat", "renew", "rollback", "mutateItem"];

  return expectScenario(
    "no repository mutation methods invoked or exposed",
    repository.downstreamWriteCount === 0 &&
      forbiddenMethods.every((name) => !(name in prototype)),
    JSON.stringify({ calls: repository.calls, forbidden: forbiddenMethods.filter((name) => name in prototype) }),
  );
}

async function expectIssue(
  name: string,
  startSnapshot: DeploymentActivationExecutionStartSnapshot,
  expectedCode: DeploymentActivationExecutionStartIssueCode,
  expectedStatus: DeploymentActivationExecutionStartResult["status"],
): Promise<DeploymentActivationExecutionStartServiceHarnessScenario> {
  const result = await assess(startSnapshot);

  return expectScenario(
    name,
    result.status === expectedStatus && hasIssue(result, expectedCode),
    JSON.stringify(result),
  );
}

async function assess(
  startSnapshot: DeploymentActivationExecutionStartSnapshot = snapshot(),
  commandPatch: Partial<DeploymentActivationExecutionStartCommand> = {},
): Promise<DeploymentActivationExecutionStartResult> {
  return service(
    new InMemoryDeploymentActivationExecutionStartTestRepository({
      snapshot: startSnapshot,
    }),
  ).assessStart(command(commandPatch));
}

function service(
  repository: InMemoryDeploymentActivationExecutionStartTestRepository,
): DeploymentActivationExecutionStartService {
  return new DeploymentActivationExecutionStartService(repository);
}

function command(
  input: Partial<DeploymentActivationExecutionStartCommand> = {},
): DeploymentActivationExecutionStartCommand {
  return {
    clinicId: CLINIC_ID,
    deploymentRunId: DEPLOYMENT_RUN_ID,
    sessionId: SESSION_ID,
    executionKey: EXECUTION_KEY,
    claimantId: CLAIMANT_ID,
    ownershipToken: OWNERSHIP_TOKEN,
    currentTimestamp: CURRENT_TIME,
    ...input,
  };
}

function snapshot(
  input: Parameters<typeof buildStartSnapshot>[0] = {},
): DeploymentActivationExecutionStartSnapshot {
  return buildStartSnapshot(input);
}

function hasIssue(
  result: DeploymentActivationExecutionStartResult,
  code: DeploymentActivationExecutionStartIssueCode,
): boolean {
  return result.issues.some((issue) => issue.code === code);
}

function serializedEvidence(
  result: DeploymentActivationExecutionStartResult,
): string {
  return JSON.stringify({
    message: result.message,
    issues: result.issues,
  });
}

function expectScenario(
  name: string,
  passed: boolean,
  message: string,
): DeploymentActivationExecutionStartServiceHarnessScenario {
  return { name, passed, message };
}