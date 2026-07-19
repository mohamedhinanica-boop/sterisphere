import {
  DeploymentSterilizerShellExecutionItemCompletionService,
} from "./deployment-sterilizer-shell-execution-item-completion-service";
import {
  buildAlreadyCompletedSterilizerShellExecutionItemCompletionSnapshot,
  buildSterilizerShellExecutionItemCompletionSnapshot,
  InMemoryDeploymentSterilizerShellExecutionItemCompletionTestRepository,
  item,
  planItemKey,
  STERILIZER_SHELL_EXECUTION_ITEM_COMPLETION_TEST_IDS,
} from "./deployment-sterilizer-shell-execution-item-completion-test-repository";
import type {
  DeploymentSterilizerShellExecutionItemCompletionCommand,
  DeploymentSterilizerShellExecutionItemCompletionIssueCode,
  DeploymentSterilizerShellExecutionItemCompletionResult,
  DeploymentSterilizerShellExecutionItemCompletionSnapshot,
} from "./deployment-sterilizer-shell-execution-item-completion-types";

export interface DeploymentSterilizerShellExecutionItemCompletionServiceHarnessScenario {
  name: string;
  passed: boolean;
  message: string;
}

export interface DeploymentSterilizerShellExecutionItemCompletionServiceHarnessResult {
  passed: boolean;
  scenarios: readonly DeploymentSterilizerShellExecutionItemCompletionServiceHarnessScenario[];
}

const COMPLETED_AT = "2026-01-01T12:10:00.000Z";
const EXPIRED_LEASE = "2026-01-01T12:00:00.000Z";
const WRONG_TOKEN = "wrong-sensitive-sterilizer-item-completion-token";

export async function runDeploymentSterilizerShellExecutionItemCompletionServiceHarness(): Promise<DeploymentSterilizerShellExecutionItemCompletionServiceHarnessResult> {
  const scenarios = [
    await scenarioCompletable(),
    await scenarioAlreadyCompleted(),
    await scenarioMissingSession(),
    await scenarioMissingItem(),
    await scenarioMissingSterilizer(),
    await scenarioClinicMismatch(),
    await scenarioDeploymentRunMismatch(),
    await scenarioExecutionKeyMismatch(),
    await scenarioOwnerMismatch(),
    await scenarioTokenMismatch(),
    await scenarioExpiredLease(),
    await scenarioMissingSessionStartedAt(),
    await scenarioTerminalSessionEvidence(),
    await scenarioWrongEntityType(),
    await scenarioWrongAction(),
    await scenarioItemNotRunning(),
    await scenarioAttemptCountNotOne(),
    await scenarioMissingItemStartedAt(),
    await scenarioAlreadyCompletedIncompatibleEvidence(),
    await scenarioRollbackEvidence(),
    await scenarioErrorEvidence(),
    await scenarioEntitySterilizerUuidMismatch(),
    await scenarioDeploymentSterilizerKeyMismatch(),
    await scenarioSterilizerClinicMismatch(),
    await scenarioSterilizerSourceMismatch(),
    await scenarioSterilizerStatusPlaceholder(),
    await scenarioSterilizerInactive(),
    await scenarioSterilizerTargetStateMismatch(),
    await scenarioDuplicateItemIdentity(),
    await scenarioDuplicateSterilizerIdentity(),
    await scenarioMissingDependency(),
    await scenarioPendingDependency(),
    await scenarioLaterDependency(),
    await scenarioSelfDependency(),
    await scenarioDuplicateDependencyKeys(),
    await scenarioBrokenSucceededPrefix(),
    await scenarioSecondRunningItem(),
    await scenarioReadyItemAmbiguity(),
    await scenarioLaterItemDrift(),
    await scenarioItemCountDrift(),
    await scenarioDeterministicIssueOrdering(),
    await scenarioTokenRedaction(),
    await scenarioRepositoryFailure(),
    await scenarioSourceImmutability(),
    await scenarioZeroDownstreamCounters(),
    await scenarioRepositoryInterfaceHasNoMutationMethods(),
    await scenarioServicePerformsNoMutationCalls(),
  ];

  return {
    passed: scenarios.every((scenario) => scenario.passed),
    scenarios,
  };
}

async function scenarioCompletable() {
  const result = await assess();
  return expectScenario(
    "valid completable sterilizer item",
    result.ok && result.status === "completable" && result.completableCount === 1 && result.itemStatusAfter === "succeeded" && result.sterilizerActive === true,
    JSON.stringify(result),
  );
}

async function scenarioAlreadyCompleted() {
  const result = await assess(buildAlreadyCompletedSterilizerShellExecutionItemCompletionSnapshot());
  return expectScenario(
    "already-completed reuse",
    result.ok && result.status === "already_completed" && result.reusedCount === 1 && result.completedAt === "2026-01-01T12:08:00.000Z",
    JSON.stringify(result),
  );
}

async function scenarioMissingSession() { return expectIssue("missing session", snapshot({ session: null }), "missing_session", "not_found"); }
async function scenarioMissingItem() { return expectIssue("missing item", snapshot({ item: null }), "missing_item", "not_found"); }
async function scenarioMissingSterilizer() { return expectIssue("missing sterilizer", snapshot({ sterilizer: null }), "missing_sterilizer_shell", "not_found"); }
async function scenarioClinicMismatch() { return expectIssue("clinic mismatch", snapshot({ session: { clinicId: "clinic-other" } }), "clinic_identity_mismatch", "conflict"); }
async function scenarioDeploymentRunMismatch() { return expectIssue("deployment-run mismatch", snapshot({ session: { deploymentRunId: "run-other" } }), "deployment_run_identity_mismatch", "conflict"); }
async function scenarioExecutionKeyMismatch() { return expectIssue("execution-key mismatch", snapshot({ session: { executionKey: "execution-other" } }), "execution_key_mismatch", "conflict"); }
async function scenarioOwnerMismatch() { return expectIssue("owner mismatch", snapshot({ session: { executionOwner: "other-executor" } }), "session_owned_by_another_executor", "conflict"); }
async function scenarioExpiredLease() { return expectIssue("expired lease", snapshot({ session: { leaseExpiresAt: EXPIRED_LEASE } }), "lease_expired", "blocked"); }
async function scenarioMissingSessionStartedAt() { return expectIssue("missing session startedAt", snapshot({ session: { startedAt: null } }), "session_timestamp_missing", "blocked"); }
async function scenarioTerminalSessionEvidence() { return expectIssue("terminal session evidence", snapshot({ session: { completedAt: "2026-01-01T12:20:00.000Z" } }), "terminal_session_timestamp_present", "blocked"); }
async function scenarioWrongEntityType() { return expectIssue("wrong entity type", snapshot({ item: { entityType: "sterilizer_shell" }, itemPatches: { 2: { entityType: "sterilizer_shell" } } }), "wrong_entity_type", "blocked"); }
async function scenarioWrongAction() { return expectIssue("wrong action", snapshot({ item: { action: "archive" }, itemPatches: { 2: { action: "archive" } } }), "wrong_action", "blocked"); }
async function scenarioItemNotRunning() { return expectIssue("item not running", snapshot({ item: { executionStatus: "ready", attemptCount: 0, startedAt: null }, itemPatches: { 2: { executionStatus: "ready", attemptCount: 0, startedAt: null } }, aggregate: { runningItemCount: 0, runningSterilizerItemCount: 0, readyItemCount: 1 } }), "item_not_running", "blocked"); }
async function scenarioAttemptCountNotOne() { return expectIssue("attempt count not one", snapshot({ item: { attemptCount: 2 }, itemPatches: { 2: { attemptCount: 2 } } }), "item_attempt_invalid", "blocked"); }
async function scenarioMissingItemStartedAt() { return expectIssue("missing item startedAt", snapshot({ item: { startedAt: null }, itemPatches: { 2: { startedAt: null } } }), "item_started_at_missing", "blocked"); }
async function scenarioAlreadyCompletedIncompatibleEvidence() { return expectIssue("already completed incompatible", snapshot({ item: { executionStatus: "succeeded", completedAt: "2026-01-01T12:01:00.000Z" }, itemPatches: { 2: { executionStatus: "succeeded", completedAt: "2026-01-01T12:01:00.000Z" } }, aggregate: { runningItemCount: 0, runningSterilizerItemCount: 0, succeededItemCount: 2, priorSucceededPrefixCount: 2 } }), "item_completion_before_start", "blocked"); }
async function scenarioRollbackEvidence() { return expectIssue("rollback evidence", snapshot({ item: { rolledBackAt: "2026-01-01T12:09:00.000Z" }, itemPatches: { 2: { rolledBackAt: "2026-01-01T12:09:00.000Z" } } }), "item_rollback_evidence_present", "blocked"); }
async function scenarioErrorEvidence() { return expectIssue("error evidence", snapshot({ item: { errorCode: "sterilizer_error", errorMessage: "failed" }, itemPatches: { 2: { errorCode: "sterilizer_error", errorMessage: "failed" } } }), "item_error_present", "blocked"); }
async function scenarioEntitySterilizerUuidMismatch() { return expectIssue("entity/sterilizer UUID mismatch", snapshot({ item: { entityId: "other-sterilizer-id" }, itemPatches: { 2: { entityId: "other-sterilizer-id" } } }), "sterilizer_identity_mismatch", "conflict"); }
async function scenarioDeploymentSterilizerKeyMismatch() { return expectIssue("deployment sterilizer key mismatch", snapshot({ item: { deploymentKey: "dentist-999" }, itemPatches: { 2: { deploymentKey: "dentist-999" } } }), "sterilizer_identity_mismatch", "conflict"); }
async function scenarioSterilizerClinicMismatch() { return expectIssue("sterilizer clinic mismatch", snapshot({ sterilizer: { clinicId: "clinic-other" } }), "sterilizer_clinic_mismatch", "conflict"); }
async function scenarioSterilizerSourceMismatch() { return expectIssue("sterilizer source mismatch", snapshot({ sterilizer: { provisioningSource: "legacy" } }), "sterilizer_provisioning_source_invalid", "blocked"); }
async function scenarioSterilizerStatusPlaceholder() { return expectIssue("sterilizer status placeholder", snapshot({ sterilizer: { provisioningStatus: "placeholder" } }), "sterilizer_provisioning_status_invalid", "blocked"); }
async function scenarioSterilizerInactive() { return expectIssue("sterilizer inactive", snapshot({ sterilizer: { active: false } }), "sterilizer_active_state_invalid", "blocked"); }
async function scenarioSterilizerTargetStateMismatch() { return expectIssue("sterilizer target-state mismatch", snapshot({ item: { targetState: { provisioningStatus: "placeholder", active: true } }, itemPatches: { 2: { targetState: { provisioningStatus: "placeholder", active: true } } } }), "sterilizer_target_state_mismatch", "blocked"); }
async function scenarioDuplicateItemIdentity() { return expectIssue("duplicate item identity", snapshot({ aggregate: { duplicateExecutionItemKeyCount: 1 } }), "duplicate_item_identity", "blocked"); }
async function scenarioDuplicateSterilizerIdentity() { return expectIssue("duplicate sterilizer identity", snapshot({ aggregate: { duplicateSterilizerDeploymentIdentityCount: 1 } }), "duplicate_sterilizer_identity", "blocked"); }
async function scenarioMissingDependency() { return expectIssue("missing dependency", snapshot({ item: { dependencyKeys: ["missing-plan"] }, itemPatches: { 2: { dependencyKeys: ["missing-plan"] } } }), "missing_dependency", "blocked"); }
async function scenarioPendingDependency() { return expectIssue("pending dependency", snapshot({ itemPatches: { 1: { executionStatus: "pending", completedAt: null, attemptCount: 0, startedAt: null } }, aggregate: { priorSucceededPrefixCount: 0, succeededItemCount: 0, pendingItemCount: 2 } }), "pending_dependency", "blocked"); }
async function scenarioLaterDependency() { return expectIssue("later dependency", snapshot({ item: { dependencyKeys: [planItemKey(3)] }, itemPatches: { 2: { dependencyKeys: [planItemKey(3)] } } }), "later_dependency", "blocked"); }
async function scenarioSelfDependency() { return expectIssue("self dependency", snapshot({ item: { dependencyKeys: [planItemKey(2)] }, itemPatches: { 2: { dependencyKeys: [planItemKey(2)] } } }), "self_dependency", "blocked"); }
async function scenarioDuplicateDependencyKeys() { return expectIssue("duplicate dependency keys", snapshot({ item: { dependencyKeys: [planItemKey(1), planItemKey(1)] }, itemPatches: { 2: { dependencyKeys: [planItemKey(1), planItemKey(1)] } } }), "duplicate_dependency_keys", "blocked"); }
async function scenarioBrokenSucceededPrefix() { return expectIssue("broken succeeded prefix", snapshot({ itemPatches: { 1: { executionStatus: "pending", completedAt: null, attemptCount: 0, startedAt: null } }, aggregate: { priorSucceededPrefixCount: 0, succeededItemCount: 0 } }), "non_contiguous_succeeded_prefix", "blocked"); }
async function scenarioSecondRunningItem() { return expectIssue("second running item", snapshot({ itemPatches: { 3: { executionStatus: "running", attemptCount: 1, startedAt: "2026-01-01T12:11:00.000Z" } }, aggregate: { runningItemCount: 2, runningSterilizerItemCount: 2, pendingItemCount: 0 } }), "multiple_running_items", "blocked"); }
async function scenarioReadyItemAmbiguity() { return expectIssue("ready item ambiguity", snapshot({ itemPatches: { 3: { executionStatus: "ready" } }, aggregate: { readyItemCount: 1, pendingItemCount: 0 } }), "ready_item_ambiguity", "blocked"); }
async function scenarioLaterItemDrift() { return expectIssue("later item drift", snapshot({ itemPatches: { 3: { attemptCount: 1 } } }), "later_item_drift", "blocked"); }
async function scenarioItemCountDrift() { return expectIssue("item-count drift", snapshot({ session: { itemsRequested: 4 } }), "item_count_mismatch", "blocked"); }

async function scenarioTokenMismatch(): Promise<DeploymentSterilizerShellExecutionItemCompletionServiceHarnessScenario> {
  const result = await assess(undefined, { ownershipToken: WRONG_TOKEN });
  return expectScenario("token mismatch", result.status === "conflict" && hasIssue(result, "ownership_token_mismatch") && !serializedEvidence(result).includes(WRONG_TOKEN), serializedEvidence(result));
}

async function scenarioDeterministicIssueOrdering(): Promise<DeploymentSterilizerShellExecutionItemCompletionServiceHarnessScenario> {
  const result = await assess(snapshot({ item: { attemptCount: 2, errorCode: "sterilizer_error" }, itemPatches: { 2: { attemptCount: 2, errorCode: "sterilizer_error" }, 3: { attemptCount: 1 } }, aggregate: { duplicateSequenceCount: 1 } }));
  const codes = result.issues.map((issue) => issue.code).join(",");
  return expectScenario("deterministic issue ordering", codes === "duplicate_item_identity,item_attempt_invalid,item_error_present,later_item_drift", codes);
}

async function scenarioTokenRedaction(): Promise<DeploymentSterilizerShellExecutionItemCompletionServiceHarnessScenario> {
  const repository = new InMemoryDeploymentSterilizerShellExecutionItemCompletionTestRepository({
    shouldThrow: true,
    failureMessage: `repository leaked ${STERILIZER_SHELL_EXECUTION_ITEM_COMPLETION_TEST_IDS.token}`,
  });
  const result = await service(repository).assessSterilizerShellExecutionItemCompletion(command());
  const serialized = serializedEvidence(result);
  return expectScenario("token redaction", result.status === "error" && hasIssue(result, "repository_error") && !serialized.includes(STERILIZER_SHELL_EXECUTION_ITEM_COMPLETION_TEST_IDS.token), serialized);
}

async function scenarioRepositoryFailure(): Promise<DeploymentSterilizerShellExecutionItemCompletionServiceHarnessScenario> {
  const result = await service(new InMemoryDeploymentSterilizerShellExecutionItemCompletionTestRepository({ shouldThrow: true })).assessSterilizerShellExecutionItemCompletion(command());
  return expectScenario("repository failure", result.status === "error" && hasIssue(result, "repository_error"), JSON.stringify(result));
}

async function scenarioSourceImmutability(): Promise<DeploymentSterilizerShellExecutionItemCompletionServiceHarnessScenario> {
  const source = snapshot();
  const before = JSON.stringify(source);
  await assess(source);
  return expectScenario("source immutability", JSON.stringify(source) === before, "source snapshot unchanged");
}

async function scenarioZeroDownstreamCounters(): Promise<DeploymentSterilizerShellExecutionItemCompletionServiceHarnessScenario> {
  const result = await assess();
  return expectScenario(
    "zero downstream counters",
    Object.values(result.downstream).every((value) => value === 0),
    JSON.stringify(result.downstream),
  );
}

async function scenarioRepositoryInterfaceHasNoMutationMethods(): Promise<DeploymentSterilizerShellExecutionItemCompletionServiceHarnessScenario> {
  const repository = new InMemoryDeploymentSterilizerShellExecutionItemCompletionTestRepository({ snapshot: snapshot() });
  await service(repository).assessSterilizerShellExecutionItemCompletion(command());
  const prototype = InMemoryDeploymentSterilizerShellExecutionItemCompletionTestRepository.prototype as Record<string, unknown>;
  const forbidden = ["insert", "update", "upsert", "patch", "save", "delete", "activate", "complete", "progress", "start", "rollback", "finalize"];
  return expectScenario("repository interface has no mutation methods", repository.downstreamWriteCount === 0 && forbidden.every((method) => !(method in prototype)), JSON.stringify({ calls: repository.calls, forbidden: forbidden.filter((method) => method in prototype) }));
}

async function scenarioServicePerformsNoMutationCalls(): Promise<DeploymentSterilizerShellExecutionItemCompletionServiceHarnessScenario> {
  const repository = new InMemoryDeploymentSterilizerShellExecutionItemCompletionTestRepository({ snapshot: snapshot() });
  await service(repository).assessSterilizerShellExecutionItemCompletion(command());
  return expectScenario("service performs no mutation calls", repository.calls.loadSterilizerShellExecutionItemCompletionSnapshot === 1 && repository.downstreamWriteCount === 0, JSON.stringify(repository.calls));
}

async function expectIssue(
  name: string,
  completionSnapshot: DeploymentSterilizerShellExecutionItemCompletionSnapshot,
  expectedCode: DeploymentSterilizerShellExecutionItemCompletionIssueCode,
  expectedStatus: DeploymentSterilizerShellExecutionItemCompletionResult["status"],
): Promise<DeploymentSterilizerShellExecutionItemCompletionServiceHarnessScenario> {
  const result = await assess(completionSnapshot);
  return expectScenario(name, result.status === expectedStatus && hasIssue(result, expectedCode), JSON.stringify(result));
}

async function assess(
  completionSnapshot: DeploymentSterilizerShellExecutionItemCompletionSnapshot = snapshot(),
  commandPatch: Partial<DeploymentSterilizerShellExecutionItemCompletionCommand> = {},
): Promise<DeploymentSterilizerShellExecutionItemCompletionResult> {
  return service(new InMemoryDeploymentSterilizerShellExecutionItemCompletionTestRepository({ snapshot: completionSnapshot })).assessSterilizerShellExecutionItemCompletion(command(commandPatch));
}

function service(
  repository: InMemoryDeploymentSterilizerShellExecutionItemCompletionTestRepository,
): DeploymentSterilizerShellExecutionItemCompletionService {
  return new DeploymentSterilizerShellExecutionItemCompletionService(repository);
}

function command(input: Partial<DeploymentSterilizerShellExecutionItemCompletionCommand> = {}): DeploymentSterilizerShellExecutionItemCompletionCommand {
  return {
    clinicId: STERILIZER_SHELL_EXECUTION_ITEM_COMPLETION_TEST_IDS.clinicId,
    deploymentRunId: STERILIZER_SHELL_EXECUTION_ITEM_COMPLETION_TEST_IDS.deploymentRunId,
    sessionId: STERILIZER_SHELL_EXECUTION_ITEM_COMPLETION_TEST_IDS.sessionId,
    executionKey: STERILIZER_SHELL_EXECUTION_ITEM_COMPLETION_TEST_IDS.executionKey,
    claimantId: STERILIZER_SHELL_EXECUTION_ITEM_COMPLETION_TEST_IDS.owner,
    ownershipToken: STERILIZER_SHELL_EXECUTION_ITEM_COMPLETION_TEST_IDS.token,
    proposedCompletedAt: COMPLETED_AT,
    ...input,
  };
}

function snapshot(input: Parameters<typeof buildSterilizerShellExecutionItemCompletionSnapshot>[0] = {}): DeploymentSterilizerShellExecutionItemCompletionSnapshot {
  return buildSterilizerShellExecutionItemCompletionSnapshot(input);
}

function hasIssue(
  result: DeploymentSterilizerShellExecutionItemCompletionResult,
  code: DeploymentSterilizerShellExecutionItemCompletionIssueCode,
): boolean {
  return result.issues.some((issue) => issue.code === code);
}

function serializedEvidence(result: DeploymentSterilizerShellExecutionItemCompletionResult): string {
  return JSON.stringify({
    message: result.message,
    issues: result.issues,
    status: result.status,
    sessionId: result.sessionId,
    executionKey: result.executionKey,
    executionItemKey: result.executionItemKey,
    sterilizerId: result.sterilizerId,
    deploymentSterilizerKey: result.deploymentSterilizerKey,
  });
}

function expectScenario(
  name: string,
  passed: boolean,
  message: string,
): DeploymentSterilizerShellExecutionItemCompletionServiceHarnessScenario {
  return { name, passed, message };
}
