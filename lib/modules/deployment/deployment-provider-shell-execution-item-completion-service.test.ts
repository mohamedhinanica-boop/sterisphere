import {
  DeploymentProviderShellExecutionItemCompletionService,
} from "./deployment-provider-shell-execution-item-completion-service";
import {
  buildAlreadyCompletedProviderShellExecutionItemCompletionSnapshot,
  buildProviderShellExecutionItemCompletionSnapshot,
  InMemoryDeploymentProviderShellExecutionItemCompletionTestRepository,
  item,
  planItemKey,
  PROVIDER_SHELL_EXECUTION_ITEM_COMPLETION_TEST_IDS,
} from "./deployment-provider-shell-execution-item-completion-test-repository";
import type {
  DeploymentProviderShellExecutionItemCompletionCommand,
  DeploymentProviderShellExecutionItemCompletionIssueCode,
  DeploymentProviderShellExecutionItemCompletionResult,
  DeploymentProviderShellExecutionItemCompletionSnapshot,
} from "./deployment-provider-shell-execution-item-completion-types";

export interface DeploymentProviderShellExecutionItemCompletionServiceHarnessScenario {
  name: string;
  passed: boolean;
  message: string;
}

export interface DeploymentProviderShellExecutionItemCompletionServiceHarnessResult {
  passed: boolean;
  scenarios: readonly DeploymentProviderShellExecutionItemCompletionServiceHarnessScenario[];
}

const COMPLETED_AT = "2026-01-01T12:10:00.000Z";
const EXPIRED_LEASE = "2026-01-01T12:00:00.000Z";
const WRONG_TOKEN = "wrong-sensitive-provider-item-completion-token";

export async function runDeploymentProviderShellExecutionItemCompletionServiceHarness(): Promise<DeploymentProviderShellExecutionItemCompletionServiceHarnessResult> {
  const scenarios = [
    await scenarioCompletable(),
    await scenarioAlreadyCompleted(),
    await scenarioMissingSession(),
    await scenarioMissingItem(),
    await scenarioMissingProvider(),
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
    await scenarioEntityProviderUuidMismatch(),
    await scenarioDeploymentProviderKeyMismatch(),
    await scenarioProviderClinicMismatch(),
    await scenarioProviderSourceMismatch(),
    await scenarioProviderStatusPlaceholder(),
    await scenarioProviderInactive(),
    await scenarioProviderTargetStateMismatch(),
    await scenarioDuplicateItemIdentity(),
    await scenarioDuplicateProviderIdentity(),
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
    "valid completable provider item",
    result.ok && result.status === "completable" && result.completableCount === 1 && result.itemStatusAfter === "succeeded" && result.providerActive === true,
    JSON.stringify(result),
  );
}

async function scenarioAlreadyCompleted() {
  const result = await assess(buildAlreadyCompletedProviderShellExecutionItemCompletionSnapshot());
  return expectScenario(
    "already-completed reuse",
    result.ok && result.status === "already_completed" && result.reusedCount === 1 && result.completedAt === "2026-01-01T12:08:00.000Z",
    JSON.stringify(result),
  );
}

async function scenarioMissingSession() { return expectIssue("missing session", snapshot({ session: null }), "missing_session", "not_found"); }
async function scenarioMissingItem() { return expectIssue("missing item", snapshot({ item: null }), "missing_item", "not_found"); }
async function scenarioMissingProvider() { return expectIssue("missing provider", snapshot({ provider: null }), "missing_provider_shell", "not_found"); }
async function scenarioClinicMismatch() { return expectIssue("clinic mismatch", snapshot({ session: { clinicId: "clinic-other" } }), "clinic_identity_mismatch", "conflict"); }
async function scenarioDeploymentRunMismatch() { return expectIssue("deployment-run mismatch", snapshot({ session: { deploymentRunId: "run-other" } }), "deployment_run_identity_mismatch", "conflict"); }
async function scenarioExecutionKeyMismatch() { return expectIssue("execution-key mismatch", snapshot({ session: { executionKey: "execution-other" } }), "execution_key_mismatch", "conflict"); }
async function scenarioOwnerMismatch() { return expectIssue("owner mismatch", snapshot({ session: { executionOwner: "other-executor" } }), "session_owned_by_another_executor", "conflict"); }
async function scenarioExpiredLease() { return expectIssue("expired lease", snapshot({ session: { leaseExpiresAt: EXPIRED_LEASE } }), "lease_expired", "blocked"); }
async function scenarioMissingSessionStartedAt() { return expectIssue("missing session startedAt", snapshot({ session: { startedAt: null } }), "session_timestamp_missing", "blocked"); }
async function scenarioTerminalSessionEvidence() { return expectIssue("terminal session evidence", snapshot({ session: { completedAt: "2026-01-01T12:20:00.000Z" } }), "terminal_session_timestamp_present", "blocked"); }
async function scenarioWrongEntityType() { return expectIssue("wrong entity type", snapshot({ item: { entityType: "sterilizer_shell" }, itemPatches: { 2: { entityType: "sterilizer_shell" } } }), "wrong_entity_type", "blocked"); }
async function scenarioWrongAction() { return expectIssue("wrong action", snapshot({ item: { action: "archive" }, itemPatches: { 2: { action: "archive" } } }), "wrong_action", "blocked"); }
async function scenarioItemNotRunning() { return expectIssue("item not running", snapshot({ item: { executionStatus: "ready", attemptCount: 0, startedAt: null }, itemPatches: { 2: { executionStatus: "ready", attemptCount: 0, startedAt: null } }, aggregate: { runningItemCount: 0, runningProviderItemCount: 0, readyItemCount: 1 } }), "item_not_running", "blocked"); }
async function scenarioAttemptCountNotOne() { return expectIssue("attempt count not one", snapshot({ item: { attemptCount: 2 }, itemPatches: { 2: { attemptCount: 2 } } }), "item_attempt_invalid", "blocked"); }
async function scenarioMissingItemStartedAt() { return expectIssue("missing item startedAt", snapshot({ item: { startedAt: null }, itemPatches: { 2: { startedAt: null } } }), "item_started_at_missing", "blocked"); }
async function scenarioAlreadyCompletedIncompatibleEvidence() { return expectIssue("already completed incompatible", snapshot({ item: { executionStatus: "succeeded", completedAt: "2026-01-01T12:01:00.000Z" }, itemPatches: { 2: { executionStatus: "succeeded", completedAt: "2026-01-01T12:01:00.000Z" } }, aggregate: { runningItemCount: 0, runningProviderItemCount: 0, succeededItemCount: 2, priorSucceededPrefixCount: 2 } }), "item_completion_before_start", "blocked"); }
async function scenarioRollbackEvidence() { return expectIssue("rollback evidence", snapshot({ item: { rolledBackAt: "2026-01-01T12:09:00.000Z" }, itemPatches: { 2: { rolledBackAt: "2026-01-01T12:09:00.000Z" } } }), "item_rollback_evidence_present", "blocked"); }
async function scenarioErrorEvidence() { return expectIssue("error evidence", snapshot({ item: { errorCode: "provider_error", errorMessage: "failed" }, itemPatches: { 2: { errorCode: "provider_error", errorMessage: "failed" } } }), "item_error_present", "blocked"); }
async function scenarioEntityProviderUuidMismatch() { return expectIssue("entity/provider UUID mismatch", snapshot({ item: { entityId: "other-provider-id" }, itemPatches: { 2: { entityId: "other-provider-id" } } }), "provider_identity_mismatch", "conflict"); }
async function scenarioDeploymentProviderKeyMismatch() { return expectIssue("deployment provider key mismatch", snapshot({ item: { deploymentKey: "dentist-999" }, itemPatches: { 2: { deploymentKey: "dentist-999" } } }), "provider_identity_mismatch", "conflict"); }
async function scenarioProviderClinicMismatch() { return expectIssue("provider clinic mismatch", snapshot({ provider: { clinicId: "clinic-other" } }), "provider_clinic_mismatch", "conflict"); }
async function scenarioProviderSourceMismatch() { return expectIssue("provider source mismatch", snapshot({ provider: { provisioningSource: "legacy" } }), "provider_provisioning_source_invalid", "blocked"); }
async function scenarioProviderStatusPlaceholder() { return expectIssue("provider status placeholder", snapshot({ provider: { provisioningStatus: "placeholder" } }), "provider_provisioning_status_invalid", "blocked"); }
async function scenarioProviderInactive() { return expectIssue("provider inactive", snapshot({ provider: { active: false } }), "provider_active_state_invalid", "blocked"); }
async function scenarioProviderTargetStateMismatch() { return expectIssue("provider target-state mismatch", snapshot({ item: { targetState: { provisioningStatus: "placeholder", active: true } }, itemPatches: { 2: { targetState: { provisioningStatus: "placeholder", active: true } } } }), "provider_target_state_mismatch", "blocked"); }
async function scenarioDuplicateItemIdentity() { return expectIssue("duplicate item identity", snapshot({ aggregate: { duplicateExecutionItemKeyCount: 1 } }), "duplicate_item_identity", "blocked"); }
async function scenarioDuplicateProviderIdentity() { return expectIssue("duplicate provider identity", snapshot({ aggregate: { duplicateProviderDeploymentIdentityCount: 1 } }), "duplicate_provider_identity", "blocked"); }
async function scenarioMissingDependency() { return expectIssue("missing dependency", snapshot({ item: { dependencyKeys: ["missing-plan"] }, itemPatches: { 2: { dependencyKeys: ["missing-plan"] } } }), "missing_dependency", "blocked"); }
async function scenarioPendingDependency() { return expectIssue("pending dependency", snapshot({ itemPatches: { 1: { executionStatus: "pending", completedAt: null, attemptCount: 0, startedAt: null } }, aggregate: { priorSucceededPrefixCount: 0, succeededItemCount: 0, pendingItemCount: 2 } }), "pending_dependency", "blocked"); }
async function scenarioLaterDependency() { return expectIssue("later dependency", snapshot({ item: { dependencyKeys: [planItemKey(3)] }, itemPatches: { 2: { dependencyKeys: [planItemKey(3)] } } }), "later_dependency", "blocked"); }
async function scenarioSelfDependency() { return expectIssue("self dependency", snapshot({ item: { dependencyKeys: [planItemKey(2)] }, itemPatches: { 2: { dependencyKeys: [planItemKey(2)] } } }), "self_dependency", "blocked"); }
async function scenarioDuplicateDependencyKeys() { return expectIssue("duplicate dependency keys", snapshot({ item: { dependencyKeys: [planItemKey(1), planItemKey(1)] }, itemPatches: { 2: { dependencyKeys: [planItemKey(1), planItemKey(1)] } } }), "duplicate_dependency_keys", "blocked"); }
async function scenarioBrokenSucceededPrefix() { return expectIssue("broken succeeded prefix", snapshot({ itemPatches: { 1: { executionStatus: "pending", completedAt: null, attemptCount: 0, startedAt: null } }, aggregate: { priorSucceededPrefixCount: 0, succeededItemCount: 0 } }), "non_contiguous_succeeded_prefix", "blocked"); }
async function scenarioSecondRunningItem() { return expectIssue("second running item", snapshot({ itemPatches: { 3: { executionStatus: "running", attemptCount: 1, startedAt: "2026-01-01T12:11:00.000Z" } }, aggregate: { runningItemCount: 2, runningProviderItemCount: 2, pendingItemCount: 0 } }), "multiple_running_items", "blocked"); }
async function scenarioReadyItemAmbiguity() { return expectIssue("ready item ambiguity", snapshot({ itemPatches: { 3: { executionStatus: "ready" } }, aggregate: { readyItemCount: 1, pendingItemCount: 0 } }), "ready_item_ambiguity", "blocked"); }
async function scenarioLaterItemDrift() { return expectIssue("later item drift", snapshot({ itemPatches: { 3: { attemptCount: 1 } } }), "later_item_drift", "blocked"); }
async function scenarioItemCountDrift() { return expectIssue("item-count drift", snapshot({ session: { itemsRequested: 4 } }), "item_count_mismatch", "blocked"); }

async function scenarioTokenMismatch(): Promise<DeploymentProviderShellExecutionItemCompletionServiceHarnessScenario> {
  const result = await assess(undefined, { ownershipToken: WRONG_TOKEN });
  return expectScenario("token mismatch", result.status === "conflict" && hasIssue(result, "ownership_token_mismatch") && !serializedEvidence(result).includes(WRONG_TOKEN), serializedEvidence(result));
}

async function scenarioDeterministicIssueOrdering(): Promise<DeploymentProviderShellExecutionItemCompletionServiceHarnessScenario> {
  const result = await assess(snapshot({ item: { attemptCount: 2, errorCode: "provider_error" }, itemPatches: { 2: { attemptCount: 2, errorCode: "provider_error" }, 3: { attemptCount: 1 } }, aggregate: { duplicateSequenceCount: 1 } }));
  const codes = result.issues.map((issue) => issue.code).join(",");
  return expectScenario("deterministic issue ordering", codes === "duplicate_item_identity,item_attempt_invalid,item_error_present,later_item_drift", codes);
}

async function scenarioTokenRedaction(): Promise<DeploymentProviderShellExecutionItemCompletionServiceHarnessScenario> {
  const repository = new InMemoryDeploymentProviderShellExecutionItemCompletionTestRepository({
    shouldThrow: true,
    failureMessage: `repository leaked ${PROVIDER_SHELL_EXECUTION_ITEM_COMPLETION_TEST_IDS.token}`,
  });
  const result = await service(repository).assessProviderShellExecutionItemCompletion(command());
  const serialized = serializedEvidence(result);
  return expectScenario("token redaction", result.status === "error" && hasIssue(result, "repository_error") && !serialized.includes(PROVIDER_SHELL_EXECUTION_ITEM_COMPLETION_TEST_IDS.token), serialized);
}

async function scenarioRepositoryFailure(): Promise<DeploymentProviderShellExecutionItemCompletionServiceHarnessScenario> {
  const result = await service(new InMemoryDeploymentProviderShellExecutionItemCompletionTestRepository({ shouldThrow: true })).assessProviderShellExecutionItemCompletion(command());
  return expectScenario("repository failure", result.status === "error" && hasIssue(result, "repository_error"), JSON.stringify(result));
}

async function scenarioSourceImmutability(): Promise<DeploymentProviderShellExecutionItemCompletionServiceHarnessScenario> {
  const source = snapshot();
  const before = JSON.stringify(source);
  await assess(source);
  return expectScenario("source immutability", JSON.stringify(source) === before, "source snapshot unchanged");
}

async function scenarioZeroDownstreamCounters(): Promise<DeploymentProviderShellExecutionItemCompletionServiceHarnessScenario> {
  const result = await assess();
  return expectScenario(
    "zero downstream counters",
    Object.values(result.downstream).every((value) => value === 0),
    JSON.stringify(result.downstream),
  );
}

async function scenarioRepositoryInterfaceHasNoMutationMethods(): Promise<DeploymentProviderShellExecutionItemCompletionServiceHarnessScenario> {
  const repository = new InMemoryDeploymentProviderShellExecutionItemCompletionTestRepository({ snapshot: snapshot() });
  await service(repository).assessProviderShellExecutionItemCompletion(command());
  const prototype = InMemoryDeploymentProviderShellExecutionItemCompletionTestRepository.prototype as Record<string, unknown>;
  const forbidden = ["insert", "update", "upsert", "patch", "save", "delete", "activate", "complete", "progress", "start", "rollback", "finalize"];
  return expectScenario("repository interface has no mutation methods", repository.downstreamWriteCount === 0 && forbidden.every((method) => !(method in prototype)), JSON.stringify({ calls: repository.calls, forbidden: forbidden.filter((method) => method in prototype) }));
}

async function scenarioServicePerformsNoMutationCalls(): Promise<DeploymentProviderShellExecutionItemCompletionServiceHarnessScenario> {
  const repository = new InMemoryDeploymentProviderShellExecutionItemCompletionTestRepository({ snapshot: snapshot() });
  await service(repository).assessProviderShellExecutionItemCompletion(command());
  return expectScenario("service performs no mutation calls", repository.calls.loadProviderShellExecutionItemCompletionSnapshot === 1 && repository.downstreamWriteCount === 0, JSON.stringify(repository.calls));
}

async function expectIssue(
  name: string,
  completionSnapshot: DeploymentProviderShellExecutionItemCompletionSnapshot,
  expectedCode: DeploymentProviderShellExecutionItemCompletionIssueCode,
  expectedStatus: DeploymentProviderShellExecutionItemCompletionResult["status"],
): Promise<DeploymentProviderShellExecutionItemCompletionServiceHarnessScenario> {
  const result = await assess(completionSnapshot);
  return expectScenario(name, result.status === expectedStatus && hasIssue(result, expectedCode), JSON.stringify(result));
}

async function assess(
  completionSnapshot: DeploymentProviderShellExecutionItemCompletionSnapshot = snapshot(),
  commandPatch: Partial<DeploymentProviderShellExecutionItemCompletionCommand> = {},
): Promise<DeploymentProviderShellExecutionItemCompletionResult> {
  return service(new InMemoryDeploymentProviderShellExecutionItemCompletionTestRepository({ snapshot: completionSnapshot })).assessProviderShellExecutionItemCompletion(command(commandPatch));
}

function service(
  repository: InMemoryDeploymentProviderShellExecutionItemCompletionTestRepository,
): DeploymentProviderShellExecutionItemCompletionService {
  return new DeploymentProviderShellExecutionItemCompletionService(repository);
}

function command(input: Partial<DeploymentProviderShellExecutionItemCompletionCommand> = {}): DeploymentProviderShellExecutionItemCompletionCommand {
  return {
    clinicId: PROVIDER_SHELL_EXECUTION_ITEM_COMPLETION_TEST_IDS.clinicId,
    deploymentRunId: PROVIDER_SHELL_EXECUTION_ITEM_COMPLETION_TEST_IDS.deploymentRunId,
    sessionId: PROVIDER_SHELL_EXECUTION_ITEM_COMPLETION_TEST_IDS.sessionId,
    executionKey: PROVIDER_SHELL_EXECUTION_ITEM_COMPLETION_TEST_IDS.executionKey,
    claimantId: PROVIDER_SHELL_EXECUTION_ITEM_COMPLETION_TEST_IDS.owner,
    ownershipToken: PROVIDER_SHELL_EXECUTION_ITEM_COMPLETION_TEST_IDS.token,
    proposedCompletedAt: COMPLETED_AT,
    ...input,
  };
}

function snapshot(input: Parameters<typeof buildProviderShellExecutionItemCompletionSnapshot>[0] = {}): DeploymentProviderShellExecutionItemCompletionSnapshot {
  return buildProviderShellExecutionItemCompletionSnapshot(input);
}

function hasIssue(
  result: DeploymentProviderShellExecutionItemCompletionResult,
  code: DeploymentProviderShellExecutionItemCompletionIssueCode,
): boolean {
  return result.issues.some((issue) => issue.code === code);
}

function serializedEvidence(result: DeploymentProviderShellExecutionItemCompletionResult): string {
  return JSON.stringify({
    message: result.message,
    issues: result.issues,
    status: result.status,
    sessionId: result.sessionId,
    executionKey: result.executionKey,
    executionItemKey: result.executionItemKey,
    providerId: result.providerId,
    deploymentProviderKey: result.deploymentProviderKey,
  });
}

function expectScenario(
  name: string,
  passed: boolean,
  message: string,
): DeploymentProviderShellExecutionItemCompletionServiceHarnessScenario {
  return { name, passed, message };
}
