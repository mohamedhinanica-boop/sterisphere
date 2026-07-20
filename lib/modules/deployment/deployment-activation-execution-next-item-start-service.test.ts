import {
  DeploymentActivationExecutionNextItemStartService,
} from "./deployment-activation-execution-next-item-start-service";
import {
  buildAlreadyStartedNextItemStartSnapshot,
  buildNextItemStartSnapshot,
  InMemoryDeploymentActivationExecutionNextItemStartTestRepository,
  item,
  NEXT_ITEM_START_TEST_IDS,
  planItemKey,
} from "./deployment-activation-execution-next-item-start-test-repository";
import type {
  DeploymentActivationExecutionNextItemStartCommand,
  DeploymentActivationExecutionNextItemStartIssueCode,
  DeploymentActivationExecutionNextItemStartResult,
  DeploymentActivationExecutionNextItemStartSnapshot,
} from "./deployment-activation-execution-next-item-start-types";

export interface DeploymentActivationExecutionNextItemStartServiceHarnessScenario {
  name: string;
  passed: boolean;
  message: string;
}

export interface DeploymentActivationExecutionNextItemStartServiceHarnessResult {
  passed: boolean;
  scenarios: readonly DeploymentActivationExecutionNextItemStartServiceHarnessScenario[];
}

const NOW = "2026-01-01T12:05:00.000Z";
const EXPIRED_LEASE = "2026-01-01T12:00:00.000Z";
const WRONG_TOKEN = "wrong-sensitive-next-item-start-token";

export async function runDeploymentActivationExecutionNextItemStartServiceHarness(): Promise<DeploymentActivationExecutionNextItemStartServiceHarnessResult> {
  const scenarios = [
    await scenarioStartable(),
    await scenarioAlreadyStarted(),
    await scenarioMissingSession(),
    await scenarioClinicMismatch(),
    await scenarioDeploymentRunMismatch(),
    await scenarioSessionMismatch(),
    await scenarioExecutionKeyMismatch(),
    await scenarioOwnerMismatch(),
    await scenarioTokenMismatch(),
    await scenarioMalformedLease(),
    await scenarioExpiredLease(),
    await scenarioMissingSessionStartedAt(),
    await scenarioCompletedSession(),
    await scenarioFailedSession(),
    await scenarioItemCountMismatch(),
    await scenarioZeroReadyItems(),
    await scenarioTwoReadyItems(),
    await scenarioReadyRunningAmbiguity(),
    await scenarioTwoRunningItems(),
    await scenarioNonContiguousSucceededPrefix(),
    await scenarioLowerPendingBeforeReady(),
    await scenarioReadyCandidateWrongSequence(),
    await scenarioReadyCandidateAttempted(),
    await scenarioReadyCandidateStartedAt(),
    await scenarioReadyCandidateCompletedAt(),
    await scenarioReadyCandidateRollback(),
    await scenarioReadyCandidateError(),
    await scenarioMalformedDependencyKeys(),
    await scenarioMissingDependency(),
    await scenarioPendingDependency(),
    await scenarioSelfDependency(),
    await scenarioLaterSequenceDependency(),
    await scenarioDuplicateDependencyKeys(),
    await scenarioDuplicateExecutionItemKey(),
    await scenarioDuplicatePlanItemKey(),
    await scenarioDuplicateSequence(),
    await scenarioLaterItemNonPending(),
    await scenarioLaterItemAttempted(),
    await scenarioLaterItemTimestamped(),
    await scenarioLaterItemRollback(),
    await scenarioLaterItemError(),
    await scenarioMissingCandidateEntityIdentity(),
    await scenarioUnsupportedAction(),
    await scenarioAlreadyStartedAttemptCountOne(),
    await scenarioAlreadyStartedAttemptCountZero(),
    await scenarioAlreadyStartedAttemptCountGreaterThanOne(),
    await scenarioAlreadyStartedMissingStartedAt(),
    await scenarioAlreadyStartedCompletedAt(),
    await scenarioAlreadyStartedRollback(),
    await scenarioAlreadyStartedError(),
    await scenarioDeterministicIssueOrdering(),
    await scenarioOwnershipTokenRedaction(),
    await scenarioRepositoryFailure(),
    await scenarioSourceImmutability(),
    await scenarioZeroDownstreamCounters(),
    await scenarioRepositoryExposesNoMutationMethods(),
    await scenarioServicePerformsNoMutation(),
  ];

  return {
    passed: scenarios.every((scenario) => scenario.passed),
    scenarios,
  };
}

async function scenarioStartable() {
  const result = await assess();
  return expectScenario(
    "valid sequence-2 provider item is startable",
    result.ok &&
      result.status === "startable" &&
      result.sequence === 2 &&
      result.entityType === "provider_shell" &&
      result.entityId === "dentist-001" &&
      result.action === "activate" &&
      result.attemptCount === 0 &&
      result.itemStartedAt === null &&
      result.startableCount === 1,
    JSON.stringify(result),
  );
}

async function scenarioAlreadyStarted() {
  const result = await assess(buildAlreadyStartedNextItemStartSnapshot());
  return expectScenario(
    "compatible already-running sequence-2 item returns already_started",
    result.ok && result.status === "already_started" && result.sequence === 2 && result.attemptCount === 1 && result.itemStartedAt !== null && result.reusedCount === 1,
    JSON.stringify(result),
  );
}

async function scenarioHardwareAssignmentStartable() {
  const result = await assess(hardwareAssignmentSnapshot());
  return expectScenario("sequence-40 Hardware Assignment finalize item is startable", result.ok && result.status === "startable" && result.sequence === 40 && result.entityType === "hardware_assignment" && result.action === "finalize" && result.lifecycleEvidence?.lifecycle === "hardware_assignment:finalize" && result.downstream.itemsStarted === 0 && result.downstream.itemsCompleted === 0 && result.downstream.dependenciesProgressed === 0, JSON.stringify(result));
}

async function scenarioHardwareAssignmentAlreadyStarted() {
  const result = await assess(hardwareAssignmentSnapshot({ executionStatus: "running", attemptCount: 1, startedAt: "2026-01-01T12:04:00.000Z" }));
  return expectScenario("already-running Hardware Assignment safely reuses start", result.ok && result.status === "already_started" && result.reusedCount === 1 && result.lifecycleEvidence?.lifecycle === "hardware_assignment:finalize", JSON.stringify(result));
}

async function scenarioHardwareAssignmentWrongEntity() { return expectIssue("Hardware Assignment wrong entity blocks", hardwareAssignmentSnapshot({ entityType: "hardware_binding" }), "unsupported_entity_action_lifecycle", "blocked"); }
async function scenarioHardwareAssignmentWrongAction() { return expectIssue("Hardware Assignment wrong action blocks", hardwareAssignmentSnapshot({ action: "activate" }), "unsupported_entity_action_lifecycle", "blocked"); }
async function scenarioHardwareAssignmentWrongExpectedState() { return expectIssue("Hardware Assignment wrong expected state blocks", hardwareAssignmentSnapshot({ expectedCurrentState: { ...hardwareAssignmentState(), assignmentStatus: "active" } }), "unsupported_entity_action_lifecycle", "blocked"); }
async function scenarioHardwareAssignmentWrongTargetState() { return expectIssue("Hardware Assignment wrong target state blocks", hardwareAssignmentSnapshot({ targetState: { assignmentStatus: "planned", active: false } }), "unsupported_entity_action_lifecycle", "blocked"); }
async function scenarioLifecycleDispatchDiagnostics() {
  const result = await assess(hardwareAssignmentSnapshot({ expectedCurrentState: { ...hardwareAssignmentState(), assignmentStatus: "active" } }));
  const dispatch = result.issues.find((issue) => issue.code === "unsupported_entity_action_lifecycle")?.lifecycleDispatch;
  return expectScenario("lifecycle rejection identifies runtime branch and exact reason", dispatch?.runtimeEntityType === "hardware_assignment" && dispatch.runtimeAction === "finalize" && dispatch.selectedBranch === "hardware_assignment_finalize" && dispatch.hardwareAssignmentBranchReached === true && dispatch.supported === false && dispatch.rejectionReasons.includes("assignmentStatus must be planned") && dispatch.expectedState?.assignmentStatus === "active" && dispatch.targetState?.assignmentStatus === "active", JSON.stringify(dispatch));
}
async function scenarioHardwareAssignmentWrongSequence() { return expectIssue("Hardware Assignment wrong sequence blocks", hardwareAssignmentSnapshot({ sequence: 41 }), "candidate_sequence_mismatch", "blocked"); }
async function scenarioHardwareAssignmentWrongDependency() { return expectIssue("Hardware Assignment wrong dependency blocks", hardwareAssignmentSnapshot({ dependencyKeys: ["missing-hardware-dependency"] }), "dependency_item_missing", "blocked"); }
async function scenarioHardwareAssignmentOwnershipGuards() {
  const owner = await assess(hardwareAssignmentSnapshot({}), { claimantId: "other-owner" });
  const token = await assess(hardwareAssignmentSnapshot({}), { ownershipToken: WRONG_TOKEN });
  const lease = await assess(hardwareAssignmentSnapshot({}, { leaseExpiresAt: EXPIRED_LEASE }));
  return expectScenario("Hardware Assignment claimant token and lease guards remain enforced", hasIssue(owner, "session_owned_by_another_executor") && hasIssue(token, "ownership_token_mismatch") && hasIssue(lease, "lease_expired"), JSON.stringify([owner.status, token.status, lease.status]));
}

function hardwareAssignmentState(): Record<string, unknown> {
  return {
    id: "assignment-row-001",
    clinicId: NEXT_ITEM_START_TEST_IDS.clinicId,
    deploymentHardwareKey: "hardware-001",
    assignmentKey: "assignment-hardware-001",
    targetType: "workstation",
    targetDeploymentKey: "workstation-001",
    assignmentSource: "setup_draft",
    assignmentStatus: "planned",
    active: false,
  };
}

function hardwareAssignmentSnapshot(
  candidatePatch: Partial<ReturnType<typeof item>> = {},
  sessionPatch: Parameters<typeof buildNextItemStartSnapshot>[0]["session"] = {},
): DeploymentActivationExecutionNextItemStartSnapshot {
  const items = Array.from({ length: 40 }, (_, index) => {
    const sequence = index + 1;
    if (sequence === 40) {
      return item(sequence, {
        itemId: "assignment-execution-item-040",
        executionItemKey: `${NEXT_ITEM_START_TEST_IDS.executionKey}:hardware-assignment-040`,
        planItemKey: `${NEXT_ITEM_START_TEST_IDS.planKey}:hardware_assignment:hardware-001`,
        entityType: "hardware_assignment",
        entityId: "assignment-row-001",
        action: "finalize",
        executionStatus: "ready",
        dependencyKeys: [planItemKey(39)],
        expectedCurrentState: hardwareAssignmentState(),
        targetState: { assignmentStatus: "active", active: true },
        reversible: false,
        rollbackBehavior: "manual assignment rollback required",
        ...candidatePatch,
      });
    }
    return item(sequence, {
      executionStatus: "succeeded",
      attemptCount: 1,
      startedAt: "2026-01-01T12:00:00.000Z",
      completedAt: "2026-01-01T12:02:00.000Z",
      dependencyKeys: sequence === 1 ? [] : [planItemKey(sequence - 1)],
    });
  });
  return buildNextItemStartSnapshot({ items, session: sessionPatch });
}
async function scenarioMissingSession() { return expectIssue("missing session", snapshot({ session: null }), "missing_session", "not_found"); }
async function scenarioClinicMismatch() { return expectIssue("clinic identity mismatch", snapshot({ session: { clinicId: "clinic-other" } }), "clinic_identity_mismatch", "conflict"); }
async function scenarioDeploymentRunMismatch() { return expectIssue("deployment-run identity mismatch", snapshot({ session: { deploymentRunKey: "run-other" } }), "deployment_run_identity_mismatch", "conflict"); }
async function scenarioSessionMismatch() { return expectIssue("session identity mismatch", snapshot({ session: { sessionId: "session-other" } }), "session_identity_mismatch", "conflict"); }
async function scenarioExecutionKeyMismatch() { return expectIssue("execution key mismatch", snapshot({ session: { executionKey: "execution-other" } }), "execution_key_mismatch", "conflict"); }
async function scenarioOwnerMismatch() { return expectIssue("owner mismatch", snapshot({ session: { executionOwner: "other-executor" } }), "session_owned_by_another_executor", "conflict"); }
async function scenarioMalformedLease() { return expectIssue("malformed lease", snapshot({ session: { leaseExpiresAt: "not-a-date" } }), "lease_timestamp_malformed", "blocked"); }
async function scenarioExpiredLease() { return expectIssue("expired lease", snapshot({ session: { leaseExpiresAt: EXPIRED_LEASE } }), "lease_expired", "blocked"); }
async function scenarioMissingSessionStartedAt() { return expectIssue("missing session startedAt", snapshot({ session: { startedAt: null } }), "session_timestamp_missing", "blocked"); }
async function scenarioCompletedSession() { return expectIssue("completed session", snapshot({ session: { completedAt: "2026-01-01T12:06:00.000Z" } }), "terminal_session_timestamp_present", "blocked"); }
async function scenarioFailedSession() { return expectIssue("failed session", snapshot({ session: { failedAt: "2026-01-01T12:06:00.000Z" } }), "terminal_session_timestamp_present", "blocked"); }
async function scenarioItemCountMismatch() { return expectIssue("item-count mismatch", snapshot({ session: { itemsRequested: 4 } }), "item_count_mismatch", "blocked"); }
async function scenarioZeroReadyItems() { return expectIssue("zero ready items", snapshot({ itemPatches: { 2: { executionStatus: "pending" } } }), "no_start_candidate", "not_found"); }
async function scenarioTwoReadyItems() { return expectIssue("two ready items", snapshot({ itemPatches: { 3: { executionStatus: "ready" } } }), "multiple_ready_items", "blocked"); }
async function scenarioReadyRunningAmbiguity() { return expectIssue("ready plus running ambiguity", snapshot({ itemPatches: { 3: { executionStatus: "running", attemptCount: 1, startedAt: "2026-01-01T12:04:00.000Z" } } }), "ready_running_ambiguity", "blocked"); }
async function scenarioTwoRunningItems() { return expectIssue("two running items", snapshot({ itemPatches: { 2: { executionStatus: "running", attemptCount: 1, startedAt: "2026-01-01T12:04:00.000Z" }, 3: { executionStatus: "running", attemptCount: 1, startedAt: "2026-01-01T12:04:00.000Z" } } }), "multiple_running_items", "blocked"); }
async function scenarioNonContiguousSucceededPrefix() { return expectIssue("non-contiguous succeeded prefix", snapshot({ itemPatches: { 1: { executionStatus: "pending", attemptCount: 0, startedAt: null, completedAt: null }, 2: { executionStatus: "succeeded", attemptCount: 1, startedAt: "2026-01-01T12:00:00.000Z", completedAt: "2026-01-01T12:02:00.000Z" } } }), "non_contiguous_succeeded_prefix", "blocked"); }
async function scenarioLowerPendingBeforeReady() { return expectIssue("lower pending item before ready candidate", snapshot({ itemPatches: { 1: { executionStatus: "pending", attemptCount: 0, startedAt: null, completedAt: null } } }), "candidate_sequence_mismatch", "blocked"); }
async function scenarioReadyCandidateWrongSequence() { return expectIssue("ready candidate wrong deterministic sequence", snapshot({ itemPatches: { 2: { executionStatus: "pending" }, 3: { executionStatus: "ready" } } }), "candidate_sequence_mismatch", "blocked"); }
async function scenarioReadyCandidateAttempted() { return expectIssue("ready candidate attempted", snapshot({ itemPatches: { 2: { attemptCount: 1 } } }), "candidate_attempt_invalid", "blocked"); }
async function scenarioReadyCandidateStartedAt() { return expectIssue("ready candidate startedAt", snapshot({ itemPatches: { 2: { startedAt: "2026-01-01T12:04:00.000Z" } } }), "candidate_timestamp_evidence_present", "blocked"); }
async function scenarioReadyCandidateCompletedAt() { return expectIssue("ready candidate completedAt", snapshot({ itemPatches: { 2: { completedAt: "2026-01-01T12:04:00.000Z" } } }), "candidate_timestamp_evidence_present", "blocked"); }
async function scenarioReadyCandidateRollback() { return expectIssue("ready candidate rollback", snapshot({ itemPatches: { 2: { rolledBackAt: "2026-01-01T12:04:00.000Z" } } }), "candidate_rollback_evidence_present", "blocked"); }
async function scenarioReadyCandidateError() { return expectIssue("ready candidate error", snapshot({ itemPatches: { 2: { errorCode: "item_error", errorMessage: "Item failed." } } }), "candidate_error_evidence_present", "blocked"); }
async function scenarioMalformedDependencyKeys() { return expectIssue("malformed dependency keys", snapshot({ itemPatches: { 2: { dependencyKeys: "bad" as unknown as readonly string[] } } }), "dependency_keys_malformed", "blocked"); }
async function scenarioMissingDependency() { return expectIssue("missing dependency", snapshot({ itemPatches: { 2: { dependencyKeys: ["missing-plan-item"] } } }), "dependency_item_missing", "blocked"); }
async function scenarioPendingDependency() { return expectIssue("pending dependency", snapshot({ itemPatches: { 2: { dependencyKeys: [planItemKey(3)] } } }), "dependency_not_succeeded", "blocked"); }
async function scenarioSelfDependency() { return expectIssue("self dependency", snapshot({ itemPatches: { 2: { dependencyKeys: [planItemKey(2)] } } }), "dependency_self_reference", "blocked"); }
async function scenarioLaterSequenceDependency() { return expectIssue("later-sequence dependency", snapshot({ itemPatches: { 2: { dependencyKeys: [planItemKey(3)] } } }), "dependency_on_later_item", "blocked"); }
async function scenarioDuplicateDependencyKeys() { return expectIssue("duplicate dependency keys", snapshot({ itemPatches: { 2: { dependencyKeys: [planItemKey(1), planItemKey(1)] } } }), "duplicate_dependency_key", "blocked"); }
async function scenarioDuplicateExecutionItemKey() { return expectIssue("duplicate execution item key", snapshot({ itemPatches: { 3: { executionItemKey: `${NEXT_ITEM_START_TEST_IDS.executionKey}:${planItemKey(2)}` } } }), "duplicate_item_identity", "blocked"); }
async function scenarioDuplicatePlanItemKey() { return expectIssue("duplicate plan item key", snapshot({ itemPatches: { 3: { planItemKey: planItemKey(2) } } }), "duplicate_item_identity", "blocked"); }
async function scenarioDuplicateSequence() { return expectIssue("duplicate sequence", snapshot({ items: [succeededOne(), item(2, { executionStatus: "ready", dependencyKeys: [planItemKey(1)] }), item(2, { itemId: "duplicate-sequence", executionItemKey: "duplicate-sequence", planItemKey: "duplicate-plan", executionStatus: "pending", dependencyKeys: [planItemKey(1)] })] }), "duplicate_item_identity", "blocked"); }
async function scenarioLaterItemNonPending() { return expectIssue("later item non-pending", snapshot({ itemPatches: { 3: { executionStatus: "ready" } } }), "later_item_drift", "blocked"); }
async function scenarioLaterItemAttempted() { return expectIssue("later item attempted", snapshot({ itemPatches: { 3: { attemptCount: 1 } } }), "later_item_drift", "blocked"); }
async function scenarioLaterItemTimestamped() { return expectIssue("later item timestamped", snapshot({ itemPatches: { 3: { startedAt: "2026-01-01T12:04:00.000Z" } } }), "later_item_drift", "blocked"); }
async function scenarioLaterItemRollback() { return expectIssue("later item rollback", snapshot({ itemPatches: { 3: { rolledBackAt: "2026-01-01T12:04:00.000Z" } } }), "later_item_drift", "blocked"); }
async function scenarioLaterItemError() { return expectIssue("later item error", snapshot({ itemPatches: { 3: { errorCode: "item_error" } } }), "later_item_drift", "blocked"); }
async function scenarioMissingCandidateEntityIdentity() { return expectIssue("missing candidate entity identity", snapshot({ itemPatches: { 2: { entityId: null } } }), "candidate_entity_identity_missing", "blocked"); }
async function scenarioUnsupportedAction() { return expectIssue("unsupported action", snapshot({ itemPatches: { 2: { action: "archive" } } }), "unsupported_entity_action_lifecycle", "blocked"); }

async function scenarioTokenMismatch(): Promise<DeploymentActivationExecutionNextItemStartServiceHarnessScenario> {
  const result = await assess(undefined, { ownershipToken: WRONG_TOKEN });
  return expectScenario(
    "ownership-token mismatch is conflict and redacted",
    result.status === "conflict" && hasIssue(result, "ownership_token_mismatch") && !serializedEvidence(result).includes(WRONG_TOKEN),
    serializedEvidence(result),
  );
}

async function scenarioAlreadyStartedAttemptCountOne() {
  const result = await assess(buildAlreadyStartedNextItemStartSnapshot());
  return expectScenario("valid already_started attemptCount 1", result.status === "already_started" && result.attemptCount === 1, JSON.stringify(result));
}
async function scenarioAlreadyStartedAttemptCountZero() { return expectIssue("already_started attemptCount 0 blocks", snapshot({ itemPatches: { 2: { executionStatus: "running", attemptCount: 0, startedAt: "2026-01-01T12:04:00.000Z" } } }), "candidate_attempt_invalid", "blocked"); }
async function scenarioAlreadyStartedAttemptCountGreaterThanOne() { return expectIssue("already_started attemptCount greater than 1 blocks", snapshot({ itemPatches: { 2: { executionStatus: "running", attemptCount: 2, startedAt: "2026-01-01T12:04:00.000Z" } } }), "candidate_attempt_invalid", "blocked"); }
async function scenarioAlreadyStartedMissingStartedAt() { return expectIssue("already_started missing startedAt blocks", snapshot({ itemPatches: { 2: { executionStatus: "running", attemptCount: 1, startedAt: null } } }), "candidate_started_at_missing", "blocked"); }
async function scenarioAlreadyStartedCompletedAt() { return expectIssue("already_started completedAt blocks", snapshot({ itemPatches: { 2: { executionStatus: "running", attemptCount: 1, startedAt: "2026-01-01T12:04:00.000Z", completedAt: "2026-01-01T12:05:00.000Z" } } }), "candidate_completion_evidence_present", "blocked"); }
async function scenarioAlreadyStartedRollback() { return expectIssue("already_started rollback blocks", snapshot({ itemPatches: { 2: { executionStatus: "running", attemptCount: 1, startedAt: "2026-01-01T12:04:00.000Z", rolledBackAt: "2026-01-01T12:05:00.000Z" } } }), "candidate_rollback_evidence_present", "blocked"); }
async function scenarioAlreadyStartedError() { return expectIssue("already_started error evidence blocks", snapshot({ itemPatches: { 2: { executionStatus: "running", attemptCount: 1, startedAt: "2026-01-01T12:04:00.000Z", errorCode: "item_error" } } }), "candidate_error_evidence_present", "blocked"); }

async function scenarioDeterministicIssueOrdering(): Promise<DeploymentActivationExecutionNextItemStartServiceHarnessScenario> {
  const result = await assess(snapshot({ itemPatches: { 2: { attemptCount: 1, errorCode: "item_error" }, 3: { attemptCount: 1 } }, aggregate: { duplicateSequenceCount: 1 } }));
  const codes = result.issues.map((issue) => issue.code).join(",");
  return expectScenario(
    "deterministic issue ordering",
    codes === "candidate_attempt_invalid,candidate_error_evidence_present,duplicate_item_identity,later_item_drift,later_item_drift",
    codes,
  );
}

async function scenarioOwnershipTokenRedaction(): Promise<DeploymentActivationExecutionNextItemStartServiceHarnessScenario> {
  const repository = new InMemoryDeploymentActivationExecutionNextItemStartTestRepository({ shouldThrow: true, failureMessage: `repository leaked ${NEXT_ITEM_START_TEST_IDS.token}` });
  const result = await service(repository).assessNextItemStart(command());
  const serialized = serializedEvidence(result);
  return expectScenario("ownership-token redaction", !serialized.includes(NEXT_ITEM_START_TEST_IDS.token) && hasIssue(result, "repository_error"), serialized);
}

async function scenarioRepositoryFailure(): Promise<DeploymentActivationExecutionNextItemStartServiceHarnessScenario> {
  const repository = new InMemoryDeploymentActivationExecutionNextItemStartTestRepository({ shouldThrow: true });
  const result = await service(repository).assessNextItemStart(command());
  return expectScenario("repository failure", result.status === "error" && hasIssue(result, "repository_error"), JSON.stringify(result));
}

async function scenarioSourceImmutability(): Promise<DeploymentActivationExecutionNextItemStartServiceHarnessScenario> {
  const source = snapshot();
  const before = JSON.stringify(source);
  await assess(source);
  return expectScenario("source immutability", JSON.stringify(source) === before, "source snapshot unchanged");
}

async function scenarioZeroDownstreamCounters(): Promise<DeploymentActivationExecutionNextItemStartServiceHarnessScenario> {
  const result = await assess();
  return expectScenario(
    "zero downstream counters",
    result.downstream.itemsStarted === 0 &&
      result.downstream.itemsSucceeded === 0 &&
      result.downstream.entitiesActivated === 0 &&
      result.downstream.bindingsWritten === 0 &&
      result.downstream.itemsCompleted === 0 &&
      result.downstream.dependenciesProgressed === 0 &&
      result.downstream.finalized === 0,
    JSON.stringify(result.downstream),
  );
}

async function scenarioRepositoryExposesNoMutationMethods(): Promise<DeploymentActivationExecutionNextItemStartServiceHarnessScenario> {
  const repository = new InMemoryDeploymentActivationExecutionNextItemStartTestRepository({ snapshot: snapshot() });
  await service(repository).assessNextItemStart(command());
  const prototype = InMemoryDeploymentActivationExecutionNextItemStartTestRepository.prototype as Record<string, unknown>;
  const forbiddenMethods = ["insert", "update", "upsert", "patch", "save", "delete", "start", "attempt", "timestamp", "activate", "progress", "complete", "finalize"];
  return expectScenario(
    "repository exposes no mutation methods",
    repository.downstreamWriteCount === 0 && forbiddenMethods.every((method) => !(method in prototype)),
    JSON.stringify({ calls: repository.calls, forbidden: forbiddenMethods.filter((method) => method in prototype) }),
  );
}

async function scenarioServicePerformsNoMutation(): Promise<DeploymentActivationExecutionNextItemStartServiceHarnessScenario> {
  const repository = new InMemoryDeploymentActivationExecutionNextItemStartTestRepository({ snapshot: snapshot() });
  await service(repository).assessNextItemStart(command());
  return expectScenario("service performs no mutation", repository.calls.loadNextItemStartSnapshot === 1 && repository.downstreamWriteCount === 0, JSON.stringify(repository.calls));
}

async function expectIssue(
  name: string,
  nextItemSnapshot: DeploymentActivationExecutionNextItemStartSnapshot,
  expectedCode: DeploymentActivationExecutionNextItemStartIssueCode,
  expectedStatus: DeploymentActivationExecutionNextItemStartResult["status"],
): Promise<DeploymentActivationExecutionNextItemStartServiceHarnessScenario> {
  const result = await assess(nextItemSnapshot);
  return expectScenario(name, result.status === expectedStatus && hasIssue(result, expectedCode), JSON.stringify(result));
}

async function assess(
  nextItemSnapshot: DeploymentActivationExecutionNextItemStartSnapshot = snapshot(),
  commandPatch: Partial<DeploymentActivationExecutionNextItemStartCommand> = {},
): Promise<DeploymentActivationExecutionNextItemStartResult> {
  return service(
    new InMemoryDeploymentActivationExecutionNextItemStartTestRepository({ snapshot: nextItemSnapshot }),
  ).assessNextItemStart(command(commandPatch));
}

function service(
  repository: InMemoryDeploymentActivationExecutionNextItemStartTestRepository,
): DeploymentActivationExecutionNextItemStartService {
  return new DeploymentActivationExecutionNextItemStartService(repository);
}

function command(input: Partial<DeploymentActivationExecutionNextItemStartCommand> = {}): DeploymentActivationExecutionNextItemStartCommand {
  return {
    clinicId: NEXT_ITEM_START_TEST_IDS.clinicId,
    deploymentRunKey: NEXT_ITEM_START_TEST_IDS.deploymentRunKey,
    sessionId: NEXT_ITEM_START_TEST_IDS.sessionId,
    executionKey: NEXT_ITEM_START_TEST_IDS.executionKey,
    claimantId: NEXT_ITEM_START_TEST_IDS.owner,
    ownershipToken: NEXT_ITEM_START_TEST_IDS.token,
    now: NOW,
    ...input,
  };
}

function snapshot(input: Parameters<typeof buildNextItemStartSnapshot>[0] = {}): DeploymentActivationExecutionNextItemStartSnapshot {
  return buildNextItemStartSnapshot(input);
}

function succeededOne() {
  return item(1, {
    executionStatus: "succeeded",
    attemptCount: 1,
    startedAt: "2026-01-01T12:00:00.000Z",
    completedAt: "2026-01-01T12:02:00.000Z",
  });
}

function hasIssue(
  result: DeploymentActivationExecutionNextItemStartResult,
  code: DeploymentActivationExecutionNextItemStartIssueCode,
): boolean {
  return result.issues.some((issue) => issue.code === code);
}

function serializedEvidence(result: DeploymentActivationExecutionNextItemStartResult): string {
  return JSON.stringify({
    message: result.message,
    issues: result.issues,
    result: {
      status: result.status,
      claimantId: result.claimantId,
      sessionId: result.sessionId,
      executionKey: result.executionKey,
      executionItemKey: result.executionItemKey,
    },
  });
}

function expectScenario(
  name: string,
  passed: boolean,
  message: string,
): DeploymentActivationExecutionNextItemStartServiceHarnessScenario {
  return { name, passed, message };
}