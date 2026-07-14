import {
  DeploymentActivationExecutionItemStartService,
} from "./deployment-activation-execution-item-start-service";
import {
  buildItemStartSnapshot,
  InMemoryDeploymentActivationExecutionItemStartTestRepository,
} from "./deployment-activation-execution-item-start-test-repository";
import type {
  DeploymentActivationExecutionItemStartCommand,
  DeploymentActivationExecutionItemStartIssueCode,
  DeploymentActivationExecutionItemStartResult,
  DeploymentActivationExecutionItemStartSnapshot,
} from "./deployment-activation-execution-item-start-types";

export interface DeploymentActivationExecutionItemStartServiceHarnessScenario {
  name: string;
  passed: boolean;
  message: string;
}

export interface DeploymentActivationExecutionItemStartServiceHarnessResult {
  passed: boolean;
  scenarios: readonly DeploymentActivationExecutionItemStartServiceHarnessScenario[];
}

const ASSESSMENT_TIME = "2026-01-01T12:00:00.000Z";
const ACTIVE_LEASE = "2026-01-01T12:05:00.000Z";
const EXPIRED_LEASE = "2026-01-01T11:55:00.000Z";
const STARTED_AT = "2026-01-01T11:59:00.000Z";
const ITEM_STARTED_AT = "2026-01-01T12:00:30.000Z";
const CLINIC_ID = "clinic-item-start-0001";
const DEPLOYMENT_RUN_ID = "deployment-run-item-start-0001";
const SESSION_ID = "activation-execution-session-item-start-0001";
const EXECUTION_KEY = "activation-execution-deployment-run-item-start-0001";
const CLAIMANT_ID = "executor-item-start-001";
const OWNERSHIP_TOKEN = "sensitive-item-start-token";
const WRONG_TOKEN = "wrong-sensitive-item-token";

export async function runDeploymentActivationExecutionItemStartServiceHarness(): Promise<DeploymentActivationExecutionItemStartServiceHarnessResult> {
  const scenarios = [
    await scenarioValidFirstItemStartable(),
    await scenarioAlreadyRunningSingleItem(),
    await scenarioSessionNotFound(),
    await scenarioIdentityMismatch(),
    await scenarioSessionNotRunning(),
    await scenarioOwnerMismatch(),
    await scenarioTokenMismatch(),
    await scenarioMissingLease(),
    await scenarioExpiredLease(),
    await scenarioMalformedLease(),
    await scenarioMissingSessionStartedAt(),
    await scenarioCompletedSession(),
    await scenarioFailedSession(),
    await scenarioZeroReadyItems(),
    await scenarioMultipleReadyItems(),
    await scenarioMultipleRunningItems(),
    await scenarioInvalidItemStatus(),
    await scenarioNonzeroAttempt(),
    await scenarioItemStartedTimestamp(),
    await scenarioItemCompletedTimestamp(),
    await scenarioRollbackEvidence(),
    await scenarioErrorEvidence(),
    await scenarioDuplicateExecutionItemKey(),
    await scenarioDuplicatePlanItemKey(),
    await scenarioDuplicateSequence(),
    await scenarioMalformedDependencies(),
    await scenarioFirstItemDependencyViolation(),
    await scenarioCandidateIdentityMismatch(),
    await scenarioCandidateSequenceMismatch(),
    await scenarioSourceSnapshotImmutability(),
    await scenarioOwnershipTokenRedaction(),
    await scenarioDeterministicIssueOrdering(),
    await scenarioRepositoryFailure(),
    await scenarioDownstreamCountersRemainZero(),
    await scenarioRepositoryExposesNoMutationMethods(),
  ];

  return {
    passed: scenarios.every((scenario) => scenario.passed),
    scenarios,
  };
}

async function scenarioValidFirstItemStartable(): Promise<DeploymentActivationExecutionItemStartServiceHarnessScenario> {
  const result = await assess();

  return expectScenario(
    "valid first item is startable",
    result.ok &&
      result.status === "startable" &&
      result.itemId === "activation-execution-item-0001" &&
      result.executionItemKey !== null &&
      result.planItemKey === "activation-plan-deployment-run-item-start-0001:clinic" &&
      result.sequence === 1 &&
      result.dependencyCount === 0 &&
      result.reversible === true &&
      result.downstream.itemsStarted === 0,
    JSON.stringify(result),
  );
}

async function scenarioAlreadyRunningSingleItem(): Promise<DeploymentActivationExecutionItemStartServiceHarnessScenario> {
  const result = await assess(runningItemSnapshot());

  return expectScenario(
    "already-running single item returns already started",
    result.ok &&
      result.status === "already_started" &&
      result.itemId === "activation-execution-item-0001" &&
      result.sequence === 1 &&
      result.leaseExpiresAt === ACTIVE_LEASE &&`n      result.attemptCount === 1 &&`n      result.startedAt === ITEM_STARTED_AT,
    JSON.stringify(result),
  );
}

async function scenarioSessionNotFound(): Promise<DeploymentActivationExecutionItemStartServiceHarnessScenario> {
  return expectIssue("session not found", snapshot({ session: null }), "missing_session", "not_found");
}

async function scenarioIdentityMismatch(): Promise<DeploymentActivationExecutionItemStartServiceHarnessScenario> {
  return expectIssue("clinic identity mismatch", snapshot({ session: { clinicId: "clinic-other" } }), "clinic_identity_mismatch", "conflict");
}

async function scenarioSessionNotRunning(): Promise<DeploymentActivationExecutionItemStartServiceHarnessScenario> {
  return expectIssue("session not running", snapshot({ session: { executionStatus: "claimed" } }), "execution_status_not_running", "blocked");
}

async function scenarioOwnerMismatch(): Promise<DeploymentActivationExecutionItemStartServiceHarnessScenario> {
  return expectIssue("owner mismatch", snapshot({ session: { executionOwner: "executor-other" } }), "session_owned_by_another_executor", "conflict");
}

async function scenarioTokenMismatch(): Promise<DeploymentActivationExecutionItemStartServiceHarnessScenario> {
  const result = await assess(undefined, { ownershipToken: WRONG_TOKEN });

  return expectScenario(
    "ownership token mismatch",
    result.status === "conflict" &&
      hasIssue(result, "ownership_token_mismatch") &&
      !serializedEvidence(result).includes(WRONG_TOKEN),
    JSON.stringify(result),
  );
}

async function scenarioMissingLease(): Promise<DeploymentActivationExecutionItemStartServiceHarnessScenario> {
  return expectIssue("missing lease", snapshot({ session: { leaseExpiresAt: null } }), "lease_missing", "blocked");
}

async function scenarioExpiredLease(): Promise<DeploymentActivationExecutionItemStartServiceHarnessScenario> {
  return expectIssue("expired lease", snapshot({ session: { leaseExpiresAt: EXPIRED_LEASE } }), "lease_expired", "blocked");
}

async function scenarioMalformedLease(): Promise<DeploymentActivationExecutionItemStartServiceHarnessScenario> {
  return expectIssue("malformed lease", snapshot({ session: { leaseExpiresAt: "not-a-date" } }), "lease_timestamp_malformed", "blocked");
}

async function scenarioMissingSessionStartedAt(): Promise<DeploymentActivationExecutionItemStartServiceHarnessScenario> {
  return expectIssue("missing session startedAt", snapshot({ session: { startedAt: null } }), "session_timestamp_missing", "blocked");
}

async function scenarioCompletedSession(): Promise<DeploymentActivationExecutionItemStartServiceHarnessScenario> {
  return expectIssue("completed session", snapshot({ session: { completedAt: "2026-01-01T12:03:00.000Z" } }), "terminal_timestamp_present", "blocked");
}

async function scenarioFailedSession(): Promise<DeploymentActivationExecutionItemStartServiceHarnessScenario> {
  return expectIssue("failed session", snapshot({ session: { failedAt: "2026-01-01T12:03:00.000Z" } }), "terminal_timestamp_present", "blocked");
}

async function scenarioZeroReadyItems(): Promise<DeploymentActivationExecutionItemStartServiceHarnessScenario> {
  return expectIssue("zero ready items", snapshot({ aggregate: { readyItemCount: 0, pendingItemCount: 3, firstExecutionStatus: "pending" } }), "no_ready_item", "blocked");
}

async function scenarioMultipleReadyItems(): Promise<DeploymentActivationExecutionItemStartServiceHarnessScenario> {
  return expectIssue("multiple ready items", snapshot({ aggregate: { readyItemCount: 2, pendingItemCount: 1 } }), "multiple_ready_items", "blocked");
}

async function scenarioMultipleRunningItems(): Promise<DeploymentActivationExecutionItemStartServiceHarnessScenario> {
  return expectIssue("multiple running items", snapshot({ aggregate: { readyItemCount: 0, pendingItemCount: 1, runningItemCount: 2, firstExecutionStatus: "running" }, candidateItem: { executionStatus: "running", startedAt: ITEM_STARTED_AT } }), "multiple_running_items", "blocked");
}

async function scenarioInvalidItemStatus(): Promise<DeploymentActivationExecutionItemStartServiceHarnessScenario> {
  return expectIssue("invalid item status", snapshot({ aggregate: { failedItemCount: 1 } }), "invalid_item_lifecycle", "blocked");
}

async function scenarioNonzeroAttempt(): Promise<DeploymentActivationExecutionItemStartServiceHarnessScenario> {
  return expectIssue("nonzero attempt", snapshot({ aggregate: { attemptedItemCount: 1 }, candidateItem: { attemptCount: 1 } }), "attempt_evidence_present", "blocked");
}

async function scenarioItemStartedTimestamp(): Promise<DeploymentActivationExecutionItemStartServiceHarnessScenario> {
  return expectIssue("item started timestamp", snapshot({ aggregate: { timestampedItemCount: 1 }, candidateItem: { startedAt: ITEM_STARTED_AT } }), "candidate_timestamp_present", "blocked");
}

async function scenarioItemCompletedTimestamp(): Promise<DeploymentActivationExecutionItemStartServiceHarnessScenario> {
  return expectIssue("item completed timestamp", snapshot({ candidateItem: { completedAt: "2026-01-01T12:04:00.000Z" } }), "candidate_timestamp_present", "blocked");
}

async function scenarioRollbackEvidence(): Promise<DeploymentActivationExecutionItemStartServiceHarnessScenario> {
  return expectIssue("rollback evidence", snapshot({ aggregate: { rollbackEvidenceCount: 1 }, candidateItem: { rolledBackAt: "2026-01-01T12:04:00.000Z" } }), "rollback_evidence_present", "blocked");
}

async function scenarioErrorEvidence(): Promise<DeploymentActivationExecutionItemStartServiceHarnessScenario> {
  return expectIssue("error evidence", snapshot({ aggregate: { errorEvidenceCount: 1 }, candidateItem: { errorCode: "item_error", errorMessage: "Item failed." } }), "candidate_error_present", "blocked");
}

async function scenarioDuplicateExecutionItemKey(): Promise<DeploymentActivationExecutionItemStartServiceHarnessScenario> {
  return expectIssue("duplicate execution item key", snapshot({ aggregate: { duplicateExecutionItemKeyCount: 1 } }), "duplicate_item_identity", "blocked");
}

async function scenarioDuplicatePlanItemKey(): Promise<DeploymentActivationExecutionItemStartServiceHarnessScenario> {
  return expectIssue("duplicate plan item key", snapshot({ aggregate: { duplicatePlanItemKeyCount: 1 } }), "duplicate_item_identity", "blocked");
}

async function scenarioDuplicateSequence(): Promise<DeploymentActivationExecutionItemStartServiceHarnessScenario> {
  return expectIssue("duplicate sequence", snapshot({ aggregate: { duplicateSequenceCount: 1 } }), "duplicate_item_identity", "blocked");
}

async function scenarioMalformedDependencies(): Promise<DeploymentActivationExecutionItemStartServiceHarnessScenario> {
  return expectIssue("malformed dependencies", snapshot({ aggregate: { malformedDependencyCount: 1 } }), "dependency_integrity_invalid", "blocked");
}

async function scenarioFirstItemDependencyViolation(): Promise<DeploymentActivationExecutionItemStartServiceHarnessScenario> {
  return expectIssue("first item dependency violation", snapshot({ candidateItem: { dependencyKeys: ["activation-plan-deployment-run-item-start-0001:provider"] } }), "dependency_integrity_invalid", "blocked");
}

async function scenarioCandidateIdentityMismatch(): Promise<DeploymentActivationExecutionItemStartServiceHarnessScenario> {
  return expectIssue("candidate identity mismatch", snapshot({ candidateItem: { sessionId: "activation-execution-session-other" } }), "candidate_identity_mismatch", "conflict");
}

async function scenarioCandidateSequenceMismatch(): Promise<DeploymentActivationExecutionItemStartServiceHarnessScenario> {
  return expectIssue("candidate sequence mismatch", snapshot({ aggregate: { firstSequence: 2 } }), "candidate_sequence_mismatch", "blocked");
}

async function scenarioSourceSnapshotImmutability(): Promise<DeploymentActivationExecutionItemStartServiceHarnessScenario> {
  const source = snapshot();
  const before = JSON.stringify(source);
  await assess(source);

  return expectScenario(
    "source snapshot remains immutable",
    JSON.stringify(source) === before,
    "source snapshot unchanged",
  );
}

async function scenarioOwnershipTokenRedaction(): Promise<DeploymentActivationExecutionItemStartServiceHarnessScenario> {
  const result = await assess(undefined, { ownershipToken: WRONG_TOKEN });
  const serialized = serializedEvidence(result);

  return expectScenario(
    "ownership token redacted",
    !serialized.includes(OWNERSHIP_TOKEN) && !serialized.includes(WRONG_TOKEN),
    serialized,
  );
}

async function scenarioDeterministicIssueOrdering(): Promise<DeploymentActivationExecutionItemStartServiceHarnessScenario> {
  const result = await assess(snapshot({
    aggregate: {
      duplicateSequenceCount: 1,
      errorEvidenceCount: 1,
      attemptedItemCount: 1,
    },
    candidateItem: {
      errorCode: "item_error",
      errorMessage: "Item failed.",
      attemptCount: 1,
    },
  }));
  const codes = result.issues.map((issue) => issue.code).join(",");

  return expectScenario(
    "issue ordering is deterministic",
    codes === "attempt_evidence_present,candidate_attempt_present,candidate_error_present,duplicate_item_identity,item_error_present",
    codes,
  );
}

async function scenarioRepositoryFailure(): Promise<DeploymentActivationExecutionItemStartServiceHarnessScenario> {
  const repository = new InMemoryDeploymentActivationExecutionItemStartTestRepository({ shouldThrow: true });
  const result = await service(repository).assessItemStart(command());

  return expectScenario(
    "repository failure returns safe error",
    result.status === "error" && hasIssue(result, "repository_error"),
    JSON.stringify(result),
  );
}

async function scenarioDownstreamCountersRemainZero(): Promise<DeploymentActivationExecutionItemStartServiceHarnessScenario> {
  const result = await assess();

  return expectScenario(
    "downstream counters remain zero",
    result.downstream.itemsStarted === 0 &&
      result.downstream.itemsSucceeded === 0 &&
      result.downstream.entitiesActivated === 0 &&
      result.downstream.bindingsWritten === 0 &&
      result.downstream.deploymentFinalized === 0,
    JSON.stringify(result.downstream),
  );
}

async function scenarioRepositoryExposesNoMutationMethods(): Promise<DeploymentActivationExecutionItemStartServiceHarnessScenario> {
  const repository = new InMemoryDeploymentActivationExecutionItemStartTestRepository({ snapshot: snapshot() });
  await service(repository).assessItemStart(command());
  const prototype = InMemoryDeploymentActivationExecutionItemStartTestRepository.prototype as Record<string, unknown>;
  const forbiddenMethods = ["insert", "update", "upsert", "delete", "claim", "start", "incrementAttempt", "complete", "fail", "rollback"];

  return expectScenario(
    "repository exposes no mutation methods",
    repository.downstreamWriteCount === 0 &&
      forbiddenMethods.every((name) => !(name in prototype)),
    JSON.stringify({ calls: repository.calls, forbidden: forbiddenMethods.filter((name) => name in prototype) }),
  );
}

async function expectIssue(
  name: string,
  itemStartSnapshot: DeploymentActivationExecutionItemStartSnapshot,
  expectedCode: DeploymentActivationExecutionItemStartIssueCode,
  expectedStatus: DeploymentActivationExecutionItemStartResult["status"],
): Promise<DeploymentActivationExecutionItemStartServiceHarnessScenario> {
  const result = await assess(itemStartSnapshot);

  return expectScenario(
    name,
    result.status === expectedStatus && hasIssue(result, expectedCode),
    JSON.stringify(result),
  );
}

async function assess(
  itemStartSnapshot: DeploymentActivationExecutionItemStartSnapshot = snapshot(),
  commandPatch: Partial<DeploymentActivationExecutionItemStartCommand> = {},
): Promise<DeploymentActivationExecutionItemStartResult> {
  return service(
    new InMemoryDeploymentActivationExecutionItemStartTestRepository({
      snapshot: itemStartSnapshot,
    }),
  ).assessItemStart(command(commandPatch));
}

function service(
  repository: InMemoryDeploymentActivationExecutionItemStartTestRepository,
): DeploymentActivationExecutionItemStartService {
  return new DeploymentActivationExecutionItemStartService(repository);
}

function command(
  input: Partial<DeploymentActivationExecutionItemStartCommand> = {},
): DeploymentActivationExecutionItemStartCommand {
  return {
    clinicId: CLINIC_ID,
    deploymentRunId: DEPLOYMENT_RUN_ID,
    sessionId: SESSION_ID,
    executionKey: EXECUTION_KEY,
    claimantId: CLAIMANT_ID,
    ownershipToken: OWNERSHIP_TOKEN,
    assessmentTimestamp: ASSESSMENT_TIME,
    ...input,
  };
}

function snapshot(
  input: Parameters<typeof buildItemStartSnapshot>[0] = {},
): DeploymentActivationExecutionItemStartSnapshot {
  return buildItemStartSnapshot(input);
}

function runningItemSnapshot(): DeploymentActivationExecutionItemStartSnapshot {
  return snapshot({
    candidateItem: {
      executionStatus: "running",
      startedAt: ITEM_STARTED_AT,
    },
    aggregate: {
      readyItemCount: 0,
      pendingItemCount: 2,
      runningItemCount: 1,
      timestampedItemCount: 1,
      firstExecutionStatus: "running",
    },
  });
}

function hasIssue(
  result: DeploymentActivationExecutionItemStartResult,
  code: DeploymentActivationExecutionItemStartIssueCode,
): boolean {
  return result.issues.some((issue) => issue.code === code);
}

function serializedEvidence(
  result: DeploymentActivationExecutionItemStartResult,
): string {
  return JSON.stringify({
    message: result.message,
    issues: result.issues,
    result: {
      status: result.status,
      claimantId: result.claimantId,
      sessionId: result.sessionId,
      executionKey: result.executionKey,
      itemId: result.itemId,
    },
  });
}

function expectScenario(
  name: string,
  passed: boolean,
  message: string,
): DeploymentActivationExecutionItemStartServiceHarnessScenario {
  return { name, passed, message };
}