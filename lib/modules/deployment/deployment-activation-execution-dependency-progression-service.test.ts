import {
  DeploymentActivationExecutionDependencyProgressionService,
} from "./deployment-activation-execution-dependency-progression-service";
import {
  buildAlreadyProgressedDependencyProgressionSnapshot,
  buildDependencyProgressionSnapshot,
  InMemoryDeploymentActivationExecutionDependencyProgressionTestRepository,
  item,
  planItemKey,
} from "./deployment-activation-execution-dependency-progression-test-repository";
import type {
  DeploymentActivationExecutionDependencyProgressionCommand,
  DeploymentActivationExecutionDependencyProgressionIssueCode,
  DeploymentActivationExecutionDependencyProgressionResult,
  DeploymentActivationExecutionDependencyProgressionSnapshot,
} from "./deployment-activation-execution-dependency-progression-types";

export interface DeploymentActivationExecutionDependencyProgressionServiceHarnessScenario {
  name: string;
  passed: boolean;
  message: string;
}

export interface DeploymentActivationExecutionDependencyProgressionServiceHarnessResult {
  passed: boolean;
  scenarios: readonly DeploymentActivationExecutionDependencyProgressionServiceHarnessScenario[];
}

const NOW = "2026-01-01T12:03:00.000Z";
const ACTIVE_LEASE = "2026-01-01T12:05:00.000Z";
const EXPIRED_LEASE = "2026-01-01T12:00:00.000Z";
const CLINIC_ID = "clinic-dependency-progression-0001";
const DEPLOYMENT_RUN_KEY = "deployment-run-dependency-progression-0001";
const SESSION_ID = "activation-execution-session-dependency-progression-0001";
const EXECUTION_KEY = "activation-execution-deployment-run-dependency-progression-0001";
const CLAIMANT_ID = "executor-dependency-progression-001";
const OWNERSHIP_TOKEN = "sensitive-dependency-progression-token";
const WRONG_TOKEN = "wrong-sensitive-dependency-progression-token";

export async function runDeploymentActivationExecutionDependencyProgressionServiceHarness(): Promise<DeploymentActivationExecutionDependencyProgressionServiceHarnessResult> {
  const scenarios = [
    await scenarioProgressable(),
    await scenarioAlreadyProgressed(),
    await scenarioMissingSession(),
    await scenarioClinicMismatch(),
    await scenarioDeploymentRunMismatch(),
    await scenarioSessionIdMismatch(),
    await scenarioExecutionKeyMismatch(),
    await scenarioOwnerMismatch(),
    await scenarioTokenMismatch(),
    await scenarioMissingOwner(),
    await scenarioMissingToken(),
    await scenarioMissingLease(),
    await scenarioMalformedLease(),
    await scenarioExpiredLease(),
    await scenarioSessionNotRunning(),
    await scenarioMissingSessionStartedAt(),
    await scenarioCompletedSession(),
    await scenarioFailedSession(),
    await scenarioItemCountMismatch(),
    await scenarioZeroSucceededItems(),
    await scenarioSucceededPrefixGap(),
    await scenarioSequenceTwoSucceededWhileOneNot(),
    await scenarioSucceededAttemptZero(),
    await scenarioSucceededAttemptGreaterThanOne(),
    await scenarioSucceededMissingStartedAt(),
    await scenarioSucceededMissingCompletedAt(),
    await scenarioSucceededCompletedBeforeStarted(),
    await scenarioSucceededRollbackEvidence(),
    await scenarioSucceededErrorEvidence(),
    await scenarioNextItemMissing(),
    await scenarioSequenceGapAfterPrefix(),
    await scenarioNextItemUnsupportedStatus(),
    await scenarioNextAttemptEvidence(),
    await scenarioNextStartedAtEvidence(),
    await scenarioNextCompletedAtEvidence(),
    await scenarioNextRollbackEvidence(),
    await scenarioNextErrorEvidence(),
    await scenarioOneUnrelatedReadyItem(),
    await scenarioTwoReadyItems(),
    await scenarioOneRunningItem(),
    await scenarioLaterAttemptDrift(),
    await scenarioLaterTimestampDrift(),
    await scenarioLaterRollbackDrift(),
    await scenarioLaterErrorDrift(),
    await scenarioMalformedDependencyKeys(),
    await scenarioMissingDependencyItem(),
    await scenarioDependencyOnPendingItem(),
    await scenarioDependencyOnLaterSequence(),
    await scenarioSelfDependency(),
    await scenarioDuplicateDependencyKeys(),
    await scenarioDuplicateExecutionItemKey(),
    await scenarioDuplicatePlanItemKey(),
    await scenarioDuplicateSequence(),
    await scenarioDeterministicNextItemAmbiguity(),
    await scenarioAlreadyReadyAttemptEvidence(),
    await scenarioAlreadyReadyTimestampEvidence(),
    await scenarioTokenRedaction(),
    await scenarioDeterministicIssueOrdering(),
    await scenarioSourceSnapshotImmutability(),
    await scenarioRepositoryFailure(),
    await scenarioDownstreamCountersRemainZero(),
    await scenarioRepositoryInterfaceExposesNoMutationMethod(),
  ];

  return {
    passed: scenarios.every((scenario) => scenario.passed),
    scenarios,
  };
}

async function scenarioProgressable(): Promise<DeploymentActivationExecutionDependencyProgressionServiceHarnessScenario> {
  const result = await assess();
  return expectScenario(
    "sequence 1 succeeded and sequence 2 safely pending is progressable",
    result.ok &&
      result.status === "progressable" &&
      result.completedSequence === 1 &&
      result.nextSequence === 2 &&
      result.currentNextItemStatus === "pending" &&
      result.proposedNextItemStatus === "ready" &&
      result.dependencyKeys[0] === planItemKey(1),
    JSON.stringify(result),
  );
}

async function scenarioAlreadyProgressed(): Promise<DeploymentActivationExecutionDependencyProgressionServiceHarnessScenario> {
  const result = await assess(buildAlreadyProgressedDependencyProgressionSnapshot());
  return expectScenario(
    "same next item already ready is reused",
    result.ok && result.status === "already_progressed" && result.nextSequence === 2 && result.currentNextItemStatus === "ready",
    JSON.stringify(result),
  );
}

async function scenarioMissingSession() { return expectIssue("missing session", snapshot({ session: null }), "missing_session", "not_found"); }
async function scenarioClinicMismatch() { return expectIssue("clinic mismatch", snapshot({ session: { clinicId: "clinic-other" } }), "clinic_identity_mismatch", "conflict"); }
async function scenarioDeploymentRunMismatch() { return expectIssue("deployment run mismatch", snapshot({ session: { deploymentRunKey: "run-other" } }), "deployment_run_identity_mismatch", "conflict"); }
async function scenarioSessionIdMismatch() { return expectIssue("session id mismatch", snapshot({ session: { sessionId: "session-other" } }), "session_identity_mismatch", "conflict"); }
async function scenarioExecutionKeyMismatch() { return expectIssue("execution key mismatch", snapshot({ session: { executionKey: "execution-other" } }), "execution_key_mismatch", "conflict"); }
async function scenarioOwnerMismatch() { return expectIssue("owner mismatch", snapshot({ session: { executionOwner: "other-executor" } }), "session_owned_by_another_executor", "conflict"); }

async function scenarioTokenMismatch(): Promise<DeploymentActivationExecutionDependencyProgressionServiceHarnessScenario> {
  const result = await assess(undefined, { ownershipToken: WRONG_TOKEN });
  return expectScenario(
    "token mismatch is conflict and redacted",
    result.status === "conflict" && hasIssue(result, "ownership_token_mismatch") && !serializedEvidence(result).includes(WRONG_TOKEN),
    serializedEvidence(result),
  );
}

async function scenarioMissingOwner() { return expectIssue("missing owner", snapshot({ session: { executionOwner: null } }), "ownership_shape_inconsistent", "blocked"); }
async function scenarioMissingToken() { return expectIssue("missing token", snapshot({ session: { ownershipToken: null } }), "ownership_shape_inconsistent", "blocked"); }
async function scenarioMissingLease() { return expectIssue("missing lease", snapshot({ session: { leaseExpiresAt: null } }), "lease_missing", "blocked"); }
async function scenarioMalformedLease() { return expectIssue("malformed lease", snapshot({ session: { leaseExpiresAt: "not-a-date" } }), "lease_timestamp_malformed", "blocked"); }
async function scenarioExpiredLease() { return expectIssue("expired lease", snapshot({ session: { leaseExpiresAt: EXPIRED_LEASE } }), "lease_expired", "blocked"); }
async function scenarioSessionNotRunning() { return expectIssue("session not running", snapshot({ session: { executionStatus: "claimed" } }), "session_not_running", "blocked"); }
async function scenarioMissingSessionStartedAt() { return expectIssue("missing session startedAt", snapshot({ session: { startedAt: null } }), "session_timestamp_missing", "blocked"); }
async function scenarioCompletedSession() { return expectIssue("completed session", snapshot({ session: { completedAt: "2026-01-01T12:04:00.000Z" } }), "terminal_session_timestamp_present", "blocked"); }
async function scenarioFailedSession() { return expectIssue("failed session", snapshot({ session: { failedAt: "2026-01-01T12:04:00.000Z" } }), "terminal_session_timestamp_present", "blocked"); }
async function scenarioItemCountMismatch() { return expectIssue("item count mismatch", snapshot({ session: { itemsRequested: 4 } }), "item_count_mismatch", "blocked"); }
async function scenarioZeroSucceededItems() { return expectIssue("zero succeeded items", snapshot({ itemPatches: { 1: { executionStatus: "pending", attemptCount: 0, startedAt: null, completedAt: null } } }), "no_succeeded_prefix", "blocked"); }
async function scenarioSucceededPrefixGap() { return expectIssue("succeeded prefix gap", snapshot({ items: [item(1, { executionStatus: "succeeded", attemptCount: 1, startedAt: "2026-01-01T12:00:00.000Z", completedAt: "2026-01-01T12:02:00.000Z" }), item(3, { executionStatus: "pending", dependencyKeys: [planItemKey(1)] })] }), "next_sequence_gap", "not_found"); }
async function scenarioSequenceTwoSucceededWhileOneNot() { return expectIssue("sequence 2 succeeded while sequence 1 is not", snapshot({ itemPatches: { 1: { executionStatus: "pending", attemptCount: 0, startedAt: null, completedAt: null }, 2: { executionStatus: "succeeded", attemptCount: 1, startedAt: "2026-01-01T12:00:00.000Z", completedAt: "2026-01-01T12:02:00.000Z" } } }), "no_succeeded_prefix", "blocked"); }
async function scenarioSucceededAttemptZero() { return expectIssue("succeeded attempt count 0", snapshot({ itemPatches: { 1: { attemptCount: 0 } } }), "succeeded_item_attempt_invalid", "blocked"); }
async function scenarioSucceededAttemptGreaterThanOne() { return expectIssue("succeeded attempt count greater than 1", snapshot({ itemPatches: { 1: { attemptCount: 2 } } }), "succeeded_item_attempt_invalid", "blocked"); }
async function scenarioSucceededMissingStartedAt() { return expectIssue("succeeded missing startedAt", snapshot({ itemPatches: { 1: { startedAt: null } } }), "succeeded_item_timestamp_missing", "blocked"); }
async function scenarioSucceededMissingCompletedAt() { return expectIssue("succeeded missing completedAt", snapshot({ itemPatches: { 1: { completedAt: null } } }), "succeeded_item_timestamp_missing", "blocked"); }
async function scenarioSucceededCompletedBeforeStarted() { return expectIssue("succeeded completed before started", snapshot({ itemPatches: { 1: { startedAt: "2026-01-01T12:03:00.000Z", completedAt: "2026-01-01T12:02:00.000Z" } } }), "succeeded_item_completion_before_start", "blocked"); }
async function scenarioSucceededRollbackEvidence() { return expectIssue("succeeded rollback evidence", snapshot({ itemPatches: { 1: { rolledBackAt: "2026-01-01T12:04:00.000Z" } } }), "succeeded_item_rollback_evidence_present", "blocked"); }
async function scenarioSucceededErrorEvidence() { return expectIssue("succeeded error evidence", snapshot({ itemPatches: { 1: { errorCode: "item_error", errorMessage: "Item failed." } } }), "succeeded_item_error_present", "blocked"); }
async function scenarioNextItemMissing() { return expectIssue("next item missing", snapshot({ items: [item(1, { executionStatus: "succeeded", attemptCount: 1, startedAt: "2026-01-01T12:00:00.000Z", completedAt: "2026-01-01T12:02:00.000Z" })] }), "next_item_missing", "not_found"); }
async function scenarioSequenceGapAfterPrefix() { return expectIssue("sequence gap after succeeded prefix", snapshot({ items: [item(1, { executionStatus: "succeeded", attemptCount: 1, startedAt: "2026-01-01T12:00:00.000Z", completedAt: "2026-01-01T12:02:00.000Z" }), item(4, { executionStatus: "pending", dependencyKeys: [planItemKey(1)] })] }), "next_sequence_gap", "not_found"); }
async function scenarioNextItemUnsupportedStatus() { return expectIssue("next item unsupported status", snapshot({ itemPatches: { 2: { executionStatus: "blocked" } } }), "next_item_status_invalid", "blocked"); }
async function scenarioNextAttemptEvidence() { return expectIssue("next pending attempt evidence", snapshot({ itemPatches: { 2: { attemptCount: 1 } } }), "next_item_attempt_evidence_present", "blocked"); }
async function scenarioNextStartedAtEvidence() { return expectIssue("next pending startedAt evidence", snapshot({ itemPatches: { 2: { startedAt: "2026-01-01T12:03:00.000Z" } } }), "next_item_timestamp_evidence_present", "blocked"); }
async function scenarioNextCompletedAtEvidence() { return expectIssue("next pending completedAt evidence", snapshot({ itemPatches: { 2: { completedAt: "2026-01-01T12:03:00.000Z" } } }), "next_item_timestamp_evidence_present", "blocked"); }
async function scenarioNextRollbackEvidence() { return expectIssue("next rollback evidence", snapshot({ itemPatches: { 2: { rolledBackAt: "2026-01-01T12:03:00.000Z" } } }), "next_item_rollback_evidence_present", "blocked"); }
async function scenarioNextErrorEvidence() { return expectIssue("next error evidence", snapshot({ itemPatches: { 2: { errorCode: "item_error", errorMessage: "Item failed." } } }), "next_item_error_present", "blocked"); }
async function scenarioOneUnrelatedReadyItem() { return expectIssue("one unrelated ready item", snapshot({ itemPatches: { 3: { executionStatus: "ready" } } }), "later_item_drift", "blocked"); }
async function scenarioTwoReadyItems() { return expectIssue("two ready items", snapshot({ itemPatches: { 2: { executionStatus: "ready" }, 3: { executionStatus: "ready" } } }), "multiple_ready_items", "blocked"); }
async function scenarioOneRunningItem() { return expectIssue("one running item", snapshot({ itemPatches: { 3: { executionStatus: "running" } } }), "running_item_present", "blocked"); }
async function scenarioLaterAttemptDrift() { return expectIssue("later attempt drift", snapshot({ itemPatches: { 3: { attemptCount: 1 } } }), "later_item_drift", "blocked"); }
async function scenarioLaterTimestampDrift() { return expectIssue("later timestamp drift", snapshot({ itemPatches: { 3: { startedAt: "2026-01-01T12:03:00.000Z" } } }), "later_item_drift", "blocked"); }
async function scenarioLaterRollbackDrift() { return expectIssue("later rollback drift", snapshot({ itemPatches: { 3: { rolledBackAt: "2026-01-01T12:03:00.000Z" } } }), "later_item_drift", "blocked"); }
async function scenarioLaterErrorDrift() { return expectIssue("later error drift", snapshot({ itemPatches: { 3: { errorCode: "item_error" } } }), "later_item_drift", "blocked"); }
async function scenarioMalformedDependencyKeys() { return expectIssue("malformed dependency keys", snapshot({ itemPatches: { 2: { dependencyKeys: "bad" as unknown as readonly string[] } } }), "dependency_keys_malformed", "blocked"); }
async function scenarioMissingDependencyItem() { return expectIssue("missing dependency item", snapshot({ itemPatches: { 2: { dependencyKeys: ["missing-plan-item"] } } }), "dependency_item_missing", "blocked"); }
async function scenarioDependencyOnPendingItem() { return expectIssue("dependency on pending item", snapshot({ itemPatches: { 2: { dependencyKeys: [planItemKey(3)] } } }), "dependency_on_later_item", "blocked"); }
async function scenarioDependencyOnLaterSequence() { return expectIssue("dependency on later sequence", snapshot({ itemPatches: { 2: { dependencyKeys: [planItemKey(3)] } } }), "dependency_on_later_item", "blocked"); }
async function scenarioSelfDependency() { return expectIssue("self dependency", snapshot({ itemPatches: { 2: { dependencyKeys: [planItemKey(2)] } } }), "dependency_self_reference", "blocked"); }
async function scenarioDuplicateDependencyKeys() { return expectIssue("duplicate dependency keys", snapshot({ itemPatches: { 2: { dependencyKeys: [planItemKey(1), planItemKey(1)] } } }), "duplicate_dependency_key", "blocked"); }
async function scenarioDuplicateExecutionItemKey() { return expectIssue("duplicate execution item key", snapshot({ itemPatches: { 3: { executionItemKey: `${EXECUTION_KEY}:${planItemKey(2)}` } } }), "duplicate_item_identity", "blocked"); }
async function scenarioDuplicatePlanItemKey() { return expectIssue("duplicate plan item key", snapshot({ itemPatches: { 3: { planItemKey: planItemKey(2) } } }), "duplicate_item_identity", "blocked"); }
async function scenarioDuplicateSequence() { return expectIssue("duplicate sequence", snapshot({ items: [item(1, { executionStatus: "succeeded", attemptCount: 1, startedAt: "2026-01-01T12:00:00.000Z", completedAt: "2026-01-01T12:02:00.000Z" }), item(2, { executionStatus: "pending", dependencyKeys: [planItemKey(1)] }), item(2, { itemId: "dupe-sequence", executionItemKey: "dupe-sequence", planItemKey: "dupe-plan", executionStatus: "pending", dependencyKeys: [planItemKey(1)] })] }), "duplicate_item_identity", "blocked"); }
async function scenarioDeterministicNextItemAmbiguity() { return expectIssue("deterministic next item ambiguity", snapshot({ items: [item(1, { executionStatus: "succeeded", attemptCount: 1, startedAt: "2026-01-01T12:00:00.000Z", completedAt: "2026-01-01T12:02:00.000Z" }), item(2, { executionStatus: "pending", dependencyKeys: [planItemKey(1)] }), item(2, { itemId: "ambiguous-next", executionItemKey: "ambiguous-next", planItemKey: "ambiguous-plan", executionStatus: "pending", dependencyKeys: [planItemKey(1)] })], aggregate: { duplicateSequenceCount: 0 } }), "deterministic_candidate_ambiguity", "blocked"); }
async function scenarioAlreadyReadyAttemptEvidence() { return expectIssue("already-ready attempt evidence", snapshot({ itemPatches: { 2: { executionStatus: "ready", attemptCount: 1 } } }), "next_item_attempt_evidence_present", "blocked"); }
async function scenarioAlreadyReadyTimestampEvidence() { return expectIssue("already-ready timestamp evidence", snapshot({ itemPatches: { 2: { executionStatus: "ready", startedAt: "2026-01-01T12:03:00.000Z" } } }), "next_item_timestamp_evidence_present", "blocked"); }

async function scenarioTokenRedaction(): Promise<DeploymentActivationExecutionDependencyProgressionServiceHarnessScenario> {
  const result = await assess(undefined, { ownershipToken: WRONG_TOKEN });
  const serialized = serializedEvidence(result);
  return expectScenario("token redaction in result/message/issues", !serialized.includes(OWNERSHIP_TOKEN) && !serialized.includes(WRONG_TOKEN), serialized);
}

async function scenarioDeterministicIssueOrdering(): Promise<DeploymentActivationExecutionDependencyProgressionServiceHarnessScenario> {
  const result = await assess(snapshot({ itemPatches: { 1: { attemptCount: 0, errorCode: "item_error" }, 3: { attemptCount: 1 } }, aggregate: { duplicateSequenceCount: 1 } }));
  const codes = result.issues.map((issue) => issue.code).join(",");
  return expectScenario(
    "deterministic issue ordering",
    codes === "duplicate_item_identity,later_item_drift,later_item_drift,succeeded_item_attempt_invalid,succeeded_item_error_present",
    codes,
  );
}

async function scenarioSourceSnapshotImmutability(): Promise<DeploymentActivationExecutionDependencyProgressionServiceHarnessScenario> {
  const source = snapshot();
  const before = JSON.stringify(source);
  await assess(source);
  return expectScenario("source snapshot immutability", JSON.stringify(source) === before, "source snapshot unchanged");
}

async function scenarioRepositoryFailure(): Promise<DeploymentActivationExecutionDependencyProgressionServiceHarnessScenario> {
  const repository = new InMemoryDeploymentActivationExecutionDependencyProgressionTestRepository({ shouldThrow: true });
  const result = await service(repository).assessDependencyProgression(command());
  return expectScenario("repository failure mapping", result.status === "error" && hasIssue(result, "repository_error"), JSON.stringify(result));
}

async function scenarioDownstreamCountersRemainZero(): Promise<DeploymentActivationExecutionDependencyProgressionServiceHarnessScenario> {
  const result = await assess();
  return expectScenario(
    "downstream counters remain zero",
    result.downstream.itemsReadied === 0 &&
      result.downstream.itemsStarted === 0 &&
      result.downstream.itemsSucceeded === 0 &&
      result.downstream.entitiesActivated === 0 &&
      result.downstream.bindingsWritten === 0 &&
      result.downstream.sessionsCompleted === 0 &&
      result.downstream.deploymentsFinalized === 0 &&
      result.downstream.rollbacksExecuted === 0,
    JSON.stringify(result.downstream),
  );
}

async function scenarioRepositoryInterfaceExposesNoMutationMethod(): Promise<DeploymentActivationExecutionDependencyProgressionServiceHarnessScenario> {
  const repository = new InMemoryDeploymentActivationExecutionDependencyProgressionTestRepository({ snapshot: snapshot() });
  await service(repository).assessDependencyProgression(command());
  const prototype = InMemoryDeploymentActivationExecutionDependencyProgressionTestRepository.prototype as Record<string, unknown>;
  const forbiddenMethods = ["insert", "update", "upsert", "patch", "save", "delete", "ready", "start", "activate", "rollback", "complete"];
  return expectScenario(
    "repository interface exposes no mutation method",
    repository.downstreamWriteCount === 0 && forbiddenMethods.every((name) => !(name in prototype)),
    JSON.stringify({ calls: repository.calls, forbidden: forbiddenMethods.filter((name) => name in prototype) }),
  );
}

async function expectIssue(
  name: string,
  progressionSnapshot: DeploymentActivationExecutionDependencyProgressionSnapshot,
  expectedCode: DeploymentActivationExecutionDependencyProgressionIssueCode,
  expectedStatus: DeploymentActivationExecutionDependencyProgressionResult["status"],
): Promise<DeploymentActivationExecutionDependencyProgressionServiceHarnessScenario> {
  const result = await assess(progressionSnapshot);
  return expectScenario(name, result.status === expectedStatus && hasIssue(result, expectedCode), JSON.stringify(result));
}

async function assess(
  progressionSnapshot: DeploymentActivationExecutionDependencyProgressionSnapshot = snapshot(),
  commandPatch: Partial<DeploymentActivationExecutionDependencyProgressionCommand> = {},
): Promise<DeploymentActivationExecutionDependencyProgressionResult> {
  return service(
    new InMemoryDeploymentActivationExecutionDependencyProgressionTestRepository({ snapshot: progressionSnapshot }),
  ).assessDependencyProgression(command(commandPatch));
}

function service(
  repository: InMemoryDeploymentActivationExecutionDependencyProgressionTestRepository,
): DeploymentActivationExecutionDependencyProgressionService {
  return new DeploymentActivationExecutionDependencyProgressionService(repository);
}

function command(input: Partial<DeploymentActivationExecutionDependencyProgressionCommand> = {}): DeploymentActivationExecutionDependencyProgressionCommand {
  return {
    clinicId: CLINIC_ID,
    deploymentRunKey: DEPLOYMENT_RUN_KEY,
    sessionId: SESSION_ID,
    executionKey: EXECUTION_KEY,
    claimantId: CLAIMANT_ID,
    ownershipToken: OWNERSHIP_TOKEN,
    now: NOW,
    ...input,
  };
}

function snapshot(
  input: Parameters<typeof buildDependencyProgressionSnapshot>[0] = {},
): DeploymentActivationExecutionDependencyProgressionSnapshot {
  return buildDependencyProgressionSnapshot(input);
}

function hasIssue(
  result: DeploymentActivationExecutionDependencyProgressionResult,
  code: DeploymentActivationExecutionDependencyProgressionIssueCode,
): boolean {
  return result.issues.some((issue) => issue.code === code);
}

function serializedEvidence(
  result: DeploymentActivationExecutionDependencyProgressionResult,
): string {
  return JSON.stringify({
    message: result.message,
    issues: result.issues,
    result: {
      status: result.status,
      claimantId: result.claimantId,
      sessionId: result.sessionId,
      executionKey: result.executionKey,
      nextExecutionItemKey: result.nextExecutionItemKey,
    },
  });
}

function expectScenario(
  name: string,
  passed: boolean,
  message: string,
): DeploymentActivationExecutionDependencyProgressionServiceHarnessScenario {
  return { name, passed, message };
}