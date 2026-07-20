import {
  DeploymentWorkstationShellExecutionItemCompletionService,
} from "./deployment-workstation-shell-execution-item-completion-service";
import {
  buildAlreadyCompletedWorkstationShellExecutionItemCompletionSnapshot,
  buildWorkstationShellExecutionItemCompletionSnapshot,
  InMemoryDeploymentWorkstationShellExecutionItemCompletionTestRepository,
  item,
  planItemKey,
  WORKSTATION_SHELL_EXECUTION_ITEM_COMPLETION_TEST_IDS,
} from "./deployment-workstation-shell-execution-item-completion-test-repository";
import type {
  DeploymentWorkstationShellExecutionItemCompletionCommand,
  DeploymentWorkstationShellExecutionItemCompletionIssueCode,
  DeploymentWorkstationShellExecutionItemCompletionResult,
  DeploymentWorkstationShellExecutionItemCompletionSnapshot,
} from "./deployment-workstation-shell-execution-item-completion-types";

export interface DeploymentWorkstationShellExecutionItemCompletionServiceHarnessScenario {
  name: string;
  passed: boolean;
  message: string;
}

export interface DeploymentWorkstationShellExecutionItemCompletionServiceHarnessResult {
  passed: boolean;
  scenarios: readonly DeploymentWorkstationShellExecutionItemCompletionServiceHarnessScenario[];
}

const COMPLETED_AT = "2026-01-01T12:10:00.000Z";
const EXPIRED_LEASE = "2026-01-01T12:00:00.000Z";
const WRONG_TOKEN = "wrong-sensitive-workstation-item-completion-token";

export async function runDeploymentWorkstationShellExecutionItemCompletionServiceHarness(): Promise<DeploymentWorkstationShellExecutionItemCompletionServiceHarnessResult> {
  const scenarios = [
    await scenarioCompletable(),
    await scenarioAlreadyCompleted(),
    await scenarioMissingSession(),
    await scenarioMissingItem(),
    await scenarioMissingWorkstation(),
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
    await scenarioEntityWorkstationUuidMismatch(),
    await scenarioDeploymentWorkstationKeyMismatch(),
    await scenarioWorkstationClinicMismatch(),
    await scenarioWorkstationUuidInvalid(),
    await scenarioTransitionTargetContainsIdentity(),
    await scenarioWorkstationSourceMismatch(),
    await scenarioWorkstationStatusPlanned(),
    await scenarioWorkstationInactive(),
    await scenarioWorkstationTargetStateMismatch(),
    await scenarioDuplicateItemIdentity(),
    await scenarioDuplicateWorkstationIdentity(),
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
    "valid completable workstation item",
    result.ok && result.status === "completable" && result.completableCount === 1 && result.itemStatusAfter === "succeeded" && result.workstationActive === true,
    JSON.stringify(result),
  );
}

async function scenarioAlreadyCompleted() {
  const result = await assess(buildAlreadyCompletedWorkstationShellExecutionItemCompletionSnapshot());
  return expectScenario(
    "already-completed reuse",
    result.ok && result.status === "already_completed" && result.reusedCount === 1 && result.completedAt === "2026-01-01T12:08:00.000Z",
    JSON.stringify(result),
  );
}

async function scenarioMissingSession() { return expectIssue("missing session", snapshot({ session: null }), "missing_session", "not_found"); }
async function scenarioMissingItem() { return expectIssue("missing item", snapshot({ item: null }), "missing_item", "not_found"); }
async function scenarioMissingWorkstation() { return expectIssue("missing workstation", snapshot({ workstation: null }), "missing_workstation_shell", "not_found"); }
async function scenarioClinicMismatch() { return expectIssue("clinic mismatch", snapshot({ session: { clinicId: "clinic-other" } }), "clinic_identity_mismatch", "conflict"); }
async function scenarioDeploymentRunMismatch() { return expectIssue("deployment-run mismatch", snapshot({ session: { deploymentRunId: "run-other" } }), "deployment_run_identity_mismatch", "conflict"); }
async function scenarioExecutionKeyMismatch() { return expectIssue("execution-key mismatch", snapshot({ session: { executionKey: "execution-other" } }), "execution_key_mismatch", "conflict"); }
async function scenarioOwnerMismatch() { return expectIssue("owner mismatch", snapshot({ session: { executionOwner: "other-executor" } }), "session_owned_by_another_executor", "conflict"); }
async function scenarioExpiredLease() { return expectIssue("expired lease", snapshot({ session: { leaseExpiresAt: EXPIRED_LEASE } }), "lease_expired", "blocked"); }
async function scenarioMissingSessionStartedAt() { return expectIssue("missing session startedAt", snapshot({ session: { startedAt: null } }), "session_timestamp_missing", "blocked"); }
async function scenarioTerminalSessionEvidence() { return expectIssue("terminal session evidence", snapshot({ session: { completedAt: "2026-01-01T12:20:00.000Z" } }), "terminal_session_timestamp_present", "blocked"); }
async function scenarioWrongEntityType() { return expectIssue("wrong entity type", snapshot({ item: { entityType: "workstation_shell" }, itemPatches: { 2: { entityType: "workstation_shell" } } }), "wrong_entity_type", "blocked"); }
async function scenarioWrongAction() { return expectIssue("wrong action", snapshot({ item: { action: "archive" }, itemPatches: { 2: { action: "archive" } } }), "wrong_action", "blocked"); }
async function scenarioItemNotRunning() { return expectIssue("item not running", snapshot({ item: { executionStatus: "ready", attemptCount: 0, startedAt: null }, itemPatches: { 2: { executionStatus: "ready", attemptCount: 0, startedAt: null } }, aggregate: { runningItemCount: 0, runningWorkstationItemCount: 0, readyItemCount: 1 } }), "item_not_running", "blocked"); }
async function scenarioAttemptCountNotOne() { return expectIssue("attempt count not one", snapshot({ item: { attemptCount: 2 }, itemPatches: { 2: { attemptCount: 2 } } }), "item_attempt_invalid", "blocked"); }
async function scenarioMissingItemStartedAt() { return expectIssue("missing item startedAt", snapshot({ item: { startedAt: null }, itemPatches: { 2: { startedAt: null } } }), "item_started_at_missing", "blocked"); }
async function scenarioAlreadyCompletedIncompatibleEvidence() { return expectIssue("already completed incompatible", snapshot({ item: { executionStatus: "succeeded", completedAt: "2026-01-01T12:01:00.000Z" }, itemPatches: { 2: { executionStatus: "succeeded", completedAt: "2026-01-01T12:01:00.000Z" } }, aggregate: { runningItemCount: 0, runningWorkstationItemCount: 0, succeededItemCount: 2, priorSucceededPrefixCount: 2 } }), "item_completion_before_start", "blocked"); }
async function scenarioRollbackEvidence() { return expectIssue("rollback evidence", snapshot({ item: { rolledBackAt: "2026-01-01T12:09:00.000Z" }, itemPatches: { 2: { rolledBackAt: "2026-01-01T12:09:00.000Z" } } }), "item_rollback_evidence_present", "blocked"); }
async function scenarioErrorEvidence() { return expectIssue("error evidence", snapshot({ item: { errorCode: "workstation_error", errorMessage: "failed" }, itemPatches: { 2: { errorCode: "workstation_error", errorMessage: "failed" } } }), "item_error_present", "blocked"); }
async function scenarioEntityWorkstationUuidMismatch() { return expectIssue("entity/workstation UUID mismatch", snapshot({ item: { entityId: "other-workstation-id" }, itemPatches: { 2: { entityId: "other-workstation-id" } } }), "workstation_identity_mismatch", "conflict"); }
async function scenarioDeploymentWorkstationKeyMismatch() { return expectIssue("deployment workstation key mismatch", snapshot({ item: { deploymentKey: "dentist-999" }, itemPatches: { 2: { deploymentKey: "dentist-999" } } }), "workstation_identity_mismatch", "conflict"); }
async function scenarioWorkstationClinicMismatch() { return expectIssue("workstation clinic mismatch", snapshot({ workstation: { clinicId: "clinic-other" } }), "workstation_clinic_mismatch", "conflict"); }
async function scenarioWorkstationUuidInvalid() { return expectIssue("workstation UUID invalid", snapshot({ workstation: { workstationId: WORKSTATION_KEY } }), "workstation_uuid_invalid", "blocked"); }
async function scenarioTransitionTargetContainsIdentity() { return expectIssue("transition target contains identity", snapshot({ item: { targetState: { deploymentWorkstationKey: WORKSTATION_KEY, provisioningStatus: "active", active: true } }, itemPatches: { 2: { targetState: { deploymentWorkstationKey: WORKSTATION_KEY, provisioningStatus: "active", active: true } } } }), "workstation_target_state_mismatch", "blocked"); }
async function scenarioWorkstationSourceMismatch() { return expectIssue("workstation source mismatch", snapshot({ workstation: { provisioningSource: "legacy" } }), "workstation_provisioning_source_invalid", "blocked"); }
async function scenarioWorkstationStatusPlanned() { return expectIssue("workstation status planned", snapshot({ workstation: { provisioningStatus: "planned" } }), "workstation_provisioning_status_invalid", "blocked"); }
async function scenarioWorkstationInactive() { return expectIssue("workstation inactive", snapshot({ workstation: { active: false } }), "workstation_active_state_invalid", "blocked"); }
async function scenarioWorkstationTargetStateMismatch() { return expectIssue("workstation target-state mismatch", snapshot({ item: { targetState: { provisioningStatus: "planned", active: true } }, itemPatches: { 2: { targetState: { provisioningStatus: "planned", active: true } } } }), "workstation_target_state_mismatch", "blocked"); }
async function scenarioDuplicateItemIdentity() { return expectIssue("duplicate item identity", snapshot({ aggregate: { duplicateExecutionItemKeyCount: 1 } }), "duplicate_item_identity", "blocked"); }
async function scenarioDuplicateWorkstationIdentity() { return expectIssue("duplicate workstation identity", snapshot({ aggregate: { duplicateWorkstationDeploymentIdentityCount: 1 } }), "duplicate_workstation_identity", "blocked"); }
async function scenarioMissingDependency() { return expectIssue("missing dependency", snapshot({ item: { dependencyKeys: ["missing-plan"] }, itemPatches: { 2: { dependencyKeys: ["missing-plan"] } } }), "missing_dependency", "blocked"); }
async function scenarioPendingDependency() { return expectIssue("pending dependency", snapshot({ itemPatches: { 1: { executionStatus: "pending", completedAt: null, attemptCount: 0, startedAt: null } }, aggregate: { priorSucceededPrefixCount: 0, succeededItemCount: 0, pendingItemCount: 2 } }), "pending_dependency", "blocked"); }
async function scenarioLaterDependency() { return expectIssue("later dependency", snapshot({ item: { dependencyKeys: [planItemKey(3)] }, itemPatches: { 2: { dependencyKeys: [planItemKey(3)] } } }), "later_dependency", "blocked"); }
async function scenarioSelfDependency() { return expectIssue("self dependency", snapshot({ item: { dependencyKeys: [planItemKey(2)] }, itemPatches: { 2: { dependencyKeys: [planItemKey(2)] } } }), "self_dependency", "blocked"); }
async function scenarioDuplicateDependencyKeys() { return expectIssue("duplicate dependency keys", snapshot({ item: { dependencyKeys: [planItemKey(1), planItemKey(1)] }, itemPatches: { 2: { dependencyKeys: [planItemKey(1), planItemKey(1)] } } }), "duplicate_dependency_keys", "blocked"); }
async function scenarioBrokenSucceededPrefix() { return expectIssue("broken succeeded prefix", snapshot({ itemPatches: { 1: { executionStatus: "pending", completedAt: null, attemptCount: 0, startedAt: null } }, aggregate: { priorSucceededPrefixCount: 0, succeededItemCount: 0 } }), "non_contiguous_succeeded_prefix", "blocked"); }
async function scenarioSecondRunningItem() { return expectIssue("second running item", snapshot({ itemPatches: { 3: { executionStatus: "running", attemptCount: 1, startedAt: "2026-01-01T12:11:00.000Z" } }, aggregate: { runningItemCount: 2, runningWorkstationItemCount: 2, pendingItemCount: 0 } }), "multiple_running_items", "blocked"); }
async function scenarioReadyItemAmbiguity() { return expectIssue("ready item ambiguity", snapshot({ itemPatches: { 3: { executionStatus: "ready" } }, aggregate: { readyItemCount: 1, pendingItemCount: 0 } }), "ready_item_ambiguity", "blocked"); }
async function scenarioLaterItemDrift() { return expectIssue("later item drift", snapshot({ itemPatches: { 3: { attemptCount: 1 } } }), "later_item_drift", "blocked"); }
async function scenarioItemCountDrift() { return expectIssue("item-count drift", snapshot({ session: { itemsRequested: 4 } }), "item_count_mismatch", "blocked"); }

async function scenarioTokenMismatch(): Promise<DeploymentWorkstationShellExecutionItemCompletionServiceHarnessScenario> {
  const result = await assess(undefined, { ownershipToken: WRONG_TOKEN });
  return expectScenario("token mismatch", result.status === "conflict" && hasIssue(result, "ownership_token_mismatch") && !serializedEvidence(result).includes(WRONG_TOKEN), serializedEvidence(result));
}

async function scenarioDeterministicIssueOrdering(): Promise<DeploymentWorkstationShellExecutionItemCompletionServiceHarnessScenario> {
  const result = await assess(snapshot({ item: { attemptCount: 2, errorCode: "workstation_error" }, itemPatches: { 2: { attemptCount: 2, errorCode: "workstation_error" }, 3: { attemptCount: 1 } }, aggregate: { duplicateSequenceCount: 1 } }));
  const codes = result.issues.map((issue) => issue.code).join(",");
  return expectScenario("deterministic issue ordering", codes === "duplicate_item_identity,item_attempt_invalid,item_error_present,later_item_drift", codes);
}

async function scenarioTokenRedaction(): Promise<DeploymentWorkstationShellExecutionItemCompletionServiceHarnessScenario> {
  const repository = new InMemoryDeploymentWorkstationShellExecutionItemCompletionTestRepository({
    shouldThrow: true,
    failureMessage: `repository leaked ${WORKSTATION_SHELL_EXECUTION_ITEM_COMPLETION_TEST_IDS.token}`,
  });
  const result = await service(repository).assessWorkstationShellExecutionItemCompletion(command());
  const serialized = serializedEvidence(result);
  return expectScenario("token redaction", result.status === "error" && hasIssue(result, "repository_error") && !serialized.includes(WORKSTATION_SHELL_EXECUTION_ITEM_COMPLETION_TEST_IDS.token), serialized);
}

async function scenarioRepositoryFailure(): Promise<DeploymentWorkstationShellExecutionItemCompletionServiceHarnessScenario> {
  const result = await service(new InMemoryDeploymentWorkstationShellExecutionItemCompletionTestRepository({ shouldThrow: true })).assessWorkstationShellExecutionItemCompletion(command());
  return expectScenario("repository failure", result.status === "error" && hasIssue(result, "repository_error"), JSON.stringify(result));
}

async function scenarioSourceImmutability(): Promise<DeploymentWorkstationShellExecutionItemCompletionServiceHarnessScenario> {
  const source = snapshot();
  const before = JSON.stringify(source);
  await assess(source);
  return expectScenario("source immutability", JSON.stringify(source) === before, "source snapshot unchanged");
}

async function scenarioZeroDownstreamCounters(): Promise<DeploymentWorkstationShellExecutionItemCompletionServiceHarnessScenario> {
  const result = await assess();
  return expectScenario(
    "zero downstream counters",
    Object.values(result.downstream).every((value) => value === 0),
    JSON.stringify(result.downstream),
  );
}

async function scenarioRepositoryInterfaceHasNoMutationMethods(): Promise<DeploymentWorkstationShellExecutionItemCompletionServiceHarnessScenario> {
  const repository = new InMemoryDeploymentWorkstationShellExecutionItemCompletionTestRepository({ snapshot: snapshot() });
  await service(repository).assessWorkstationShellExecutionItemCompletion(command());
  const prototype = InMemoryDeploymentWorkstationShellExecutionItemCompletionTestRepository.prototype as Record<string, unknown>;
  const forbidden = ["insert", "update", "upsert", "patch", "save", "delete", "activate", "complete", "progress", "start", "rollback", "finalize"];
  return expectScenario("repository interface has no mutation methods", repository.downstreamWriteCount === 0 && forbidden.every((method) => !(method in prototype)), JSON.stringify({ calls: repository.calls, forbidden: forbidden.filter((method) => method in prototype) }));
}

async function scenarioServicePerformsNoMutationCalls(): Promise<DeploymentWorkstationShellExecutionItemCompletionServiceHarnessScenario> {
  const repository = new InMemoryDeploymentWorkstationShellExecutionItemCompletionTestRepository({ snapshot: snapshot() });
  await service(repository).assessWorkstationShellExecutionItemCompletion(command());
  return expectScenario("service performs no mutation calls", repository.calls.loadWorkstationShellExecutionItemCompletionSnapshot === 1 && repository.downstreamWriteCount === 0, JSON.stringify(repository.calls));
}

async function expectIssue(
  name: string,
  completionSnapshot: DeploymentWorkstationShellExecutionItemCompletionSnapshot,
  expectedCode: DeploymentWorkstationShellExecutionItemCompletionIssueCode,
  expectedStatus: DeploymentWorkstationShellExecutionItemCompletionResult["status"],
): Promise<DeploymentWorkstationShellExecutionItemCompletionServiceHarnessScenario> {
  const result = await assess(completionSnapshot);
  return expectScenario(name, result.status === expectedStatus && hasIssue(result, expectedCode), JSON.stringify(result));
}

async function assess(
  completionSnapshot: DeploymentWorkstationShellExecutionItemCompletionSnapshot = snapshot(),
  commandPatch: Partial<DeploymentWorkstationShellExecutionItemCompletionCommand> = {},
): Promise<DeploymentWorkstationShellExecutionItemCompletionResult> {
  return service(new InMemoryDeploymentWorkstationShellExecutionItemCompletionTestRepository({ snapshot: completionSnapshot })).assessWorkstationShellExecutionItemCompletion(command(commandPatch));
}

function service(
  repository: InMemoryDeploymentWorkstationShellExecutionItemCompletionTestRepository,
): DeploymentWorkstationShellExecutionItemCompletionService {
  return new DeploymentWorkstationShellExecutionItemCompletionService(repository);
}

function command(input: Partial<DeploymentWorkstationShellExecutionItemCompletionCommand> = {}): DeploymentWorkstationShellExecutionItemCompletionCommand {
  return {
    clinicId: WORKSTATION_SHELL_EXECUTION_ITEM_COMPLETION_TEST_IDS.clinicId,
    deploymentRunId: WORKSTATION_SHELL_EXECUTION_ITEM_COMPLETION_TEST_IDS.deploymentRunId,
    sessionId: WORKSTATION_SHELL_EXECUTION_ITEM_COMPLETION_TEST_IDS.sessionId,
    executionKey: WORKSTATION_SHELL_EXECUTION_ITEM_COMPLETION_TEST_IDS.executionKey,
    claimantId: WORKSTATION_SHELL_EXECUTION_ITEM_COMPLETION_TEST_IDS.owner,
    ownershipToken: WORKSTATION_SHELL_EXECUTION_ITEM_COMPLETION_TEST_IDS.token,
    proposedCompletedAt: COMPLETED_AT,
    ...input,
  };
}

function snapshot(input: Parameters<typeof buildWorkstationShellExecutionItemCompletionSnapshot>[0] = {}): DeploymentWorkstationShellExecutionItemCompletionSnapshot {
  return buildWorkstationShellExecutionItemCompletionSnapshot(input);
}

function hasIssue(
  result: DeploymentWorkstationShellExecutionItemCompletionResult,
  code: DeploymentWorkstationShellExecutionItemCompletionIssueCode,
): boolean {
  return result.issues.some((issue) => issue.code === code);
}

function serializedEvidence(result: DeploymentWorkstationShellExecutionItemCompletionResult): string {
  return JSON.stringify({
    message: result.message,
    issues: result.issues,
    status: result.status,
    sessionId: result.sessionId,
    executionKey: result.executionKey,
    executionItemKey: result.executionItemKey,
    workstationId: result.workstationId,
    deploymentWorkstationKey: result.deploymentWorkstationKey,
  });
}

function expectScenario(
  name: string,
  passed: boolean,
  message: string,
): DeploymentWorkstationShellExecutionItemCompletionServiceHarnessScenario {
  return { name, passed, message };
}
