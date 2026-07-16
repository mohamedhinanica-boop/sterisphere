import {
  DeploymentProviderShellActivationService,
} from "./deployment-provider-shell-activation-service";
import {
  buildAlreadyActivatedProviderShellActivationSnapshot,
  buildProviderShellActivationSnapshot,
  InMemoryDeploymentProviderShellActivationTestRepository,
  item,
  planItemKey,
  PROVIDER_SHELL_ACTIVATION_TEST_IDS,
} from "./deployment-provider-shell-activation-test-repository";
import type {
  DeploymentProviderShellActivationCommand,
  DeploymentProviderShellActivationIssueCode,
  DeploymentProviderShellActivationResult,
  DeploymentProviderShellActivationSnapshot,
} from "./deployment-provider-shell-activation-types";

export interface DeploymentProviderShellActivationServiceHarnessScenario {
  name: string;
  passed: boolean;
  message: string;
}

export interface DeploymentProviderShellActivationServiceHarnessResult {
  passed: boolean;
  scenarios: readonly DeploymentProviderShellActivationServiceHarnessScenario[];
}

const NOW = "2026-01-01T12:10:00.000Z";
const EXPIRED_LEASE = "2026-01-01T12:00:00.000Z";
const WRONG_TOKEN = "wrong-sensitive-provider-shell-activation-token";

export async function runDeploymentProviderShellActivationServiceHarness(): Promise<DeploymentProviderShellActivationServiceHarnessResult> {
  const scenarios = [
    await scenarioActivatable(),
    await scenarioUuidEntityIdWithDeploymentProviderKeyState(),
    await scenarioAlreadyActivated(),
    await scenarioMissingSession(),
    await scenarioMissingProvider(),
    await scenarioMissingProviderLookupDiagnostics(),
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
    await scenarioNoRunningItem(),
    await scenarioTwoRunningItems(),
    await scenarioRunningItemWrongSequence(),
    await scenarioRunningItemAttemptZero(),
    await scenarioRunningItemAttemptTwo(),
    await scenarioRunningItemMissingStartedAt(),
    await scenarioRunningItemCompletedAt(),
    await scenarioRunningItemRollback(),
    await scenarioRunningItemError(),
    await scenarioRunningItemMissingEntity(),
    await scenarioUnsupportedRunningLifecycle(),
    await scenarioNonContiguousSucceededPrefix(),
    await scenarioSucceededItemAttemptInvalid(),
    await scenarioSucceededItemTimestampMissing(),
    await scenarioSucceededItemCompletionBeforeStart(),
    await scenarioSucceededItemRollback(),
    await scenarioSucceededItemError(),
    await scenarioDuplicateExecutionItemKey(),
    await scenarioDuplicatePlanItemKey(),
    await scenarioDuplicateSequence(),
    await scenarioLaterItemNonPending(),
    await scenarioLaterItemAttempted(),
    await scenarioLaterItemTimestamped(),
    await scenarioLaterItemRollback(),
    await scenarioLaterItemError(),
    await scenarioProviderClinicMismatch(),
    await scenarioProviderIdentityMismatch(),
    await scenarioProviderNotPlaceholder(),
    await scenarioProviderActiveInvalid(),
    await scenarioProviderSourceInvalid(),
    await scenarioProviderStatusInvalid(),
    await scenarioDuplicateProviderIdentity(),
    await scenarioProviderCandidateCountInvalid(),
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

async function scenarioActivatable() {
  const result = await assess();
  return expectScenario(
    "running provider shell item is activatable",
    result.ok &&
      result.status === "activatable" &&
      result.sequence === 2 &&
      result.entityType === "provider_shell" &&
      result.entityId === PROVIDER_SHELL_ACTIVATION_TEST_IDS.providerKey &&
      result.deploymentProviderKey === PROVIDER_SHELL_ACTIVATION_TEST_IDS.providerKey &&
      result.providerActive === false &&
      result.activatableCount === 1,
    JSON.stringify(result),
  );
}

async function scenarioUuidEntityIdWithDeploymentProviderKeyState() {
  const providerId = "f74f1056-0e59-474c-9676-0230d4936114";
  const result = await assess(snapshot({
    itemPatches: {
      2: {
        entityId: providerId,
        expectedCurrentState: { deploymentProviderKey: PROVIDER_SHELL_ACTIVATION_TEST_IDS.providerKey, provisioningStatus: "placeholder", active: false },
        targetState: { deploymentProviderKey: PROVIDER_SHELL_ACTIVATION_TEST_IDS.providerKey, provisioningStatus: "active", active: true },
      },
    },
    providerShell: {
      providerId,
      deploymentProviderKey: PROVIDER_SHELL_ACTIVATION_TEST_IDS.providerKey,
    },
  }));

  return expectScenario(
    "provider UUID entity id with deterministic key state is activatable",
    result.ok &&
      result.status === "activatable" &&
      result.entityId === providerId &&
      result.providerId === providerId &&
      result.deploymentProviderKey === PROVIDER_SHELL_ACTIVATION_TEST_IDS.providerKey,
    JSON.stringify(result),
  );
}
async function scenarioAlreadyActivated() {
  const result = await assess(buildAlreadyActivatedProviderShellActivationSnapshot());
  return expectScenario(
    "compatible active provider shell returns already_activated",
    result.ok &&
      result.status === "already_activated" &&
      result.reusedCount === 1 &&
      result.providerActive === true &&
      result.providerProvisioningStatus === "active",
    JSON.stringify(result),
  );
}

async function scenarioMissingSession() { return expectIssue("missing session", snapshot({ session: null }), "missing_session", "not_found"); }
async function scenarioMissingProvider() { return expectIssue("missing provider shell", snapshot({ providerShell: null }), "missing_provider_shell", "not_found"); }
async function scenarioMissingProviderLookupDiagnostics() {
  const result = await assess(snapshot({
    providerShell: null,
    itemPatches: {
      2: {
        expectedCurrentState: { deploymentProviderKey: PROVIDER_SHELL_ACTIVATION_TEST_IDS.providerKey, provisioningStatus: "placeholder", active: false },
      },
    },
  }));
  const issue = result.issues.find((current) => current.code === "missing_provider_shell");

  return expectScenario(
    "missing provider exposes lookup diagnostics",
    result.status === "not_found" &&
      issue?.diagnostics?.layer === "snapshot_provider_lookup" &&
      issue.diagnostics.providerLookupResult === "zero_rows" &&
      issue.diagnostics.providerLookupDeploymentProviderKey === PROVIDER_SHELL_ACTIVATION_TEST_IDS.providerKey,
    JSON.stringify(issue),
  );
}
async function scenarioClinicMismatch() { return expectIssue("clinic identity mismatch", snapshot({ session: { clinicId: "clinic-other" } }), "clinic_identity_mismatch", "conflict"); }
async function scenarioDeploymentRunMismatch() { return expectIssue("deployment-run identity mismatch", snapshot({ session: { deploymentRunKey: "run-other" } }), "deployment_run_identity_mismatch", "conflict"); }
async function scenarioSessionMismatch() { return expectIssue("session identity mismatch", snapshot({ session: { sessionId: "session-other" } }), "session_identity_mismatch", "conflict"); }
async function scenarioExecutionKeyMismatch() { return expectIssue("execution key mismatch", snapshot({ session: { executionKey: "execution-other" } }), "execution_key_mismatch", "conflict"); }
async function scenarioOwnerMismatch() { return expectIssue("owner mismatch", snapshot({ session: { executionOwner: "other-executor" } }), "session_owned_by_another_executor", "conflict"); }
async function scenarioMalformedLease() { return expectIssue("malformed lease", snapshot({ session: { leaseExpiresAt: "not-a-date" } }), "lease_timestamp_malformed", "blocked"); }
async function scenarioExpiredLease() { return expectIssue("expired lease", snapshot({ session: { leaseExpiresAt: EXPIRED_LEASE } }), "lease_expired", "blocked"); }
async function scenarioMissingSessionStartedAt() { return expectIssue("missing session startedAt", snapshot({ session: { startedAt: null } }), "session_timestamp_missing", "blocked"); }
async function scenarioCompletedSession() { return expectIssue("completed session", snapshot({ session: { completedAt: "2026-01-01T12:12:00.000Z" } }), "terminal_session_timestamp_present", "blocked"); }
async function scenarioFailedSession() { return expectIssue("failed session", snapshot({ session: { failedAt: "2026-01-01T12:12:00.000Z" } }), "terminal_session_timestamp_present", "blocked"); }
async function scenarioItemCountMismatch() { return expectIssue("item-count mismatch", snapshot({ session: { itemsRequested: 4 } }), "item_count_mismatch", "blocked"); }
async function scenarioNoRunningItem() { return expectIssue("no running item", snapshot({ itemPatches: { 2: { executionStatus: "ready", attemptCount: 0, startedAt: null } } }), "no_running_item", "not_found"); }
async function scenarioTwoRunningItems() { return expectIssue("two running items", snapshot({ itemPatches: { 3: { executionStatus: "running", attemptCount: 1, startedAt: "2026-01-01T12:08:00.000Z" } } }), "multiple_running_items", "blocked"); }
async function scenarioRunningItemWrongSequence() { return expectIssue("running item wrong sequence", snapshot({ itemPatches: { 1: { executionStatus: "pending", attemptCount: 0, startedAt: null, completedAt: null } } }), "running_item_sequence_mismatch", "blocked"); }
async function scenarioRunningItemAttemptZero() { return expectIssue("running item attempt zero", snapshot({ itemPatches: { 2: { attemptCount: 0 } } }), "running_item_attempt_invalid", "blocked"); }
async function scenarioRunningItemAttemptTwo() { return expectIssue("running item attempt two", snapshot({ itemPatches: { 2: { attemptCount: 2 } } }), "running_item_attempt_invalid", "blocked"); }
async function scenarioRunningItemMissingStartedAt() { return expectIssue("running item missing startedAt", snapshot({ itemPatches: { 2: { startedAt: null } } }), "running_item_started_at_missing", "blocked"); }
async function scenarioRunningItemCompletedAt() { return expectIssue("running item completedAt", snapshot({ itemPatches: { 2: { completedAt: "2026-01-01T12:12:00.000Z" } } }), "running_item_completion_evidence_present", "blocked"); }
async function scenarioRunningItemRollback() { return expectIssue("running item rollback", snapshot({ itemPatches: { 2: { rolledBackAt: "2026-01-01T12:12:00.000Z" } } }), "running_item_rollback_evidence_present", "blocked"); }
async function scenarioRunningItemError() { return expectIssue("running item error", snapshot({ itemPatches: { 2: { errorCode: "provider_error", errorMessage: "Provider failed." } } }), "running_item_error_present", "blocked"); }
async function scenarioRunningItemMissingEntity() { return expectIssue("running item missing entity", snapshot({ itemPatches: { 2: { entityId: null } } }), "running_item_entity_identity_missing", "conflict"); }
async function scenarioUnsupportedRunningLifecycle() { return expectIssue("unsupported running lifecycle", snapshot({ itemPatches: { 2: { entityType: "sterilizer_shell" } } }), "unsupported_running_item_lifecycle", "conflict"); }
async function scenarioNonContiguousSucceededPrefix() { return expectIssue("non-contiguous succeeded prefix", snapshot({ itemPatches: { 1: { executionStatus: "pending", attemptCount: 0, startedAt: null, completedAt: null }, 3: { executionStatus: "succeeded", attemptCount: 1, startedAt: "2026-01-01T12:06:00.000Z", completedAt: "2026-01-01T12:07:00.000Z" } } }), "non_contiguous_succeeded_prefix", "blocked"); }
async function scenarioSucceededItemAttemptInvalid() { return expectIssue("succeeded item attempt invalid", snapshot({ itemPatches: { 1: { attemptCount: 2 } } }), "succeeded_item_attempt_invalid", "blocked"); }
async function scenarioSucceededItemTimestampMissing() { return expectIssue("succeeded item timestamp missing", snapshot({ itemPatches: { 1: { completedAt: null } } }), "succeeded_item_timestamp_missing", "blocked"); }
async function scenarioSucceededItemCompletionBeforeStart() { return expectIssue("succeeded item completion before start", snapshot({ itemPatches: { 1: { startedAt: "2026-01-01T12:03:00.000Z", completedAt: "2026-01-01T12:02:00.000Z" } } }), "succeeded_item_completion_before_start", "blocked"); }
async function scenarioSucceededItemRollback() { return expectIssue("succeeded item rollback", snapshot({ itemPatches: { 1: { rolledBackAt: "2026-01-01T12:03:00.000Z" } } }), "succeeded_item_rollback_evidence_present", "blocked"); }
async function scenarioSucceededItemError() { return expectIssue("succeeded item error", snapshot({ itemPatches: { 1: { errorCode: "clinic_error" } } }), "succeeded_item_error_present", "blocked"); }
async function scenarioDuplicateExecutionItemKey() { return expectIssue("duplicate execution item key", snapshot({ itemPatches: { 3: { executionItemKey: `${PROVIDER_SHELL_ACTIVATION_TEST_IDS.executionKey}:${planItemKey(2)}` } } }), "duplicate_item_identity", "blocked"); }
async function scenarioDuplicatePlanItemKey() { return expectIssue("duplicate plan item key", snapshot({ itemPatches: { 3: { planItemKey: planItemKey(2) } } }), "duplicate_item_identity", "blocked"); }
async function scenarioDuplicateSequence() { return expectIssue("duplicate sequence", snapshot({ items: [succeededOne(), item(2, { executionStatus: "running", attemptCount: 1, startedAt: "2026-01-01T12:05:00.000Z" }), item(2, { itemId: "duplicate-sequence", executionItemKey: "duplicate-sequence", planItemKey: "duplicate-plan", executionStatus: "pending" })] }), "duplicate_item_identity", "blocked"); }
async function scenarioLaterItemNonPending() { return expectIssue("later item non-pending", snapshot({ itemPatches: { 3: { executionStatus: "ready" } } }), "later_item_drift", "blocked"); }
async function scenarioLaterItemAttempted() { return expectIssue("later item attempted", snapshot({ itemPatches: { 3: { attemptCount: 1 } } }), "later_item_drift", "blocked"); }
async function scenarioLaterItemTimestamped() { return expectIssue("later item timestamped", snapshot({ itemPatches: { 3: { startedAt: "2026-01-01T12:08:00.000Z" } } }), "later_item_drift", "blocked"); }
async function scenarioLaterItemRollback() { return expectIssue("later item rollback", snapshot({ itemPatches: { 3: { rolledBackAt: "2026-01-01T12:08:00.000Z" } } }), "later_item_drift", "blocked"); }
async function scenarioLaterItemError() { return expectIssue("later item error", snapshot({ itemPatches: { 3: { errorCode: "later_error" } } }), "later_item_drift", "blocked"); }
async function scenarioProviderClinicMismatch() { return expectIssue("provider clinic mismatch", snapshot({ providerShell: { clinicId: "clinic-other" } }), "provider_clinic_mismatch", "conflict"); }
async function scenarioProviderIdentityMismatch() { return expectIssue("provider identity mismatch", snapshot({ providerShell: { deploymentProviderKey: "dentist-999" } }), "provider_identity_mismatch", "conflict"); }
async function scenarioProviderNotPlaceholder() { return expectIssue("provider not placeholder", snapshot({ providerShell: { placeholder: false } }), "provider_placeholder_invalid", "blocked"); }
async function scenarioProviderActiveInvalid() { return expectIssue("provider active but not compatible", snapshot({ providerShell: { active: true, provisioningStatus: "placeholder" } }), "provider_provisioning_status_invalid", "blocked"); }
async function scenarioProviderSourceInvalid() { return expectIssue("provider source invalid", snapshot({ providerShell: { provisioningSource: "legacy" } }), "provider_provisioning_source_invalid", "blocked"); }
async function scenarioProviderStatusInvalid() { return expectIssue("provider status invalid", snapshot({ providerShell: { provisioningStatus: "archived" } }), "provider_provisioning_status_invalid", "blocked"); }
async function scenarioDuplicateProviderIdentity() { return expectIssue("duplicate provider identity", snapshot({ aggregate: { duplicateProviderIdentityCount: 1 } }), "duplicate_provider_identity", "blocked"); }
async function scenarioProviderCandidateCountInvalid() { return expectIssue("provider candidate count invalid", snapshot({ aggregate: { providerCandidateCount: 2 } }), "duplicate_provider_identity", "blocked"); }

async function scenarioTokenMismatch(): Promise<DeploymentProviderShellActivationServiceHarnessScenario> {
  const result = await assess(undefined, { ownershipToken: WRONG_TOKEN });
  return expectScenario(
    "ownership-token mismatch is conflict and redacted",
    result.status === "conflict" && hasIssue(result, "ownership_token_mismatch") && !serializedEvidence(result).includes(WRONG_TOKEN),
    serializedEvidence(result),
  );
}

async function scenarioDeterministicIssueOrdering(): Promise<DeploymentProviderShellActivationServiceHarnessScenario> {
  const result = await assess(snapshot({
    itemPatches: {
      2: { attemptCount: 2, errorCode: "provider_error" },
      3: { attemptCount: 1 },
    },
    aggregate: { duplicateSequenceCount: 1 },
  }));
  const codes = result.issues.map((issue) => issue.code).join(",");
  return expectScenario(
    "deterministic issue ordering",
    codes === "duplicate_item_identity,later_item_drift,later_item_drift,running_item_attempt_invalid,running_item_error_present",
    codes,
  );
}

async function scenarioOwnershipTokenRedaction(): Promise<DeploymentProviderShellActivationServiceHarnessScenario> {
  const repository = new InMemoryDeploymentProviderShellActivationTestRepository({
    shouldThrow: true,
    failureMessage: `repository leaked ${PROVIDER_SHELL_ACTIVATION_TEST_IDS.token}`,
  });
  const result = await service(repository).assessProviderShellActivation(command());
  const serialized = serializedEvidence(result);
  return expectScenario("ownership-token redaction", !serialized.includes(PROVIDER_SHELL_ACTIVATION_TEST_IDS.token) && hasIssue(result, "repository_error"), serialized);
}

async function scenarioRepositoryFailure(): Promise<DeploymentProviderShellActivationServiceHarnessScenario> {
  const repository = new InMemoryDeploymentProviderShellActivationTestRepository({ shouldThrow: true });
  const result = await service(repository).assessProviderShellActivation(command());
  return expectScenario("repository failure", result.status === "error" && hasIssue(result, "repository_error"), JSON.stringify(result));
}

async function scenarioSourceImmutability(): Promise<DeploymentProviderShellActivationServiceHarnessScenario> {
  const source = snapshot();
  const before = JSON.stringify(source);
  await assess(source);
  return expectScenario("source immutability", JSON.stringify(source) === before, "source snapshot unchanged");
}

async function scenarioZeroDownstreamCounters(): Promise<DeploymentProviderShellActivationServiceHarnessScenario> {
  const result = await assess();
  return expectScenario(
    "zero downstream counters",
    result.downstream.providersActivated === 0 &&
      result.downstream.itemsCompleted === 0 &&
      result.downstream.dependenciesProgressed === 0 &&
      result.downstream.bindingsWritten === 0 &&
      result.downstream.sessionsCompleted === 0 &&
      result.downstream.rollbacksExecuted === 0 &&
      result.downstream.deploymentFinalized === 0,
    JSON.stringify(result.downstream),
  );
}

async function scenarioRepositoryExposesNoMutationMethods(): Promise<DeploymentProviderShellActivationServiceHarnessScenario> {
  const repository = new InMemoryDeploymentProviderShellActivationTestRepository({ snapshot: snapshot() });
  await service(repository).assessProviderShellActivation(command());
  const prototype = InMemoryDeploymentProviderShellActivationTestRepository.prototype as Record<string, unknown>;
  const forbiddenMethods = ["insert", "update", "upsert", "patch", "save", "delete", "activate", "complete", "progress", "rollback", "finalize"];
  return expectScenario(
    "repository exposes no mutation methods",
    repository.downstreamWriteCount === 0 && forbiddenMethods.every((method) => !(method in prototype)),
    JSON.stringify({ calls: repository.calls, forbidden: forbiddenMethods.filter((method) => method in prototype) }),
  );
}

async function scenarioServicePerformsNoMutation(): Promise<DeploymentProviderShellActivationServiceHarnessScenario> {
  const repository = new InMemoryDeploymentProviderShellActivationTestRepository({ snapshot: snapshot() });
  await service(repository).assessProviderShellActivation(command());
  return expectScenario("service performs no mutation", repository.calls.loadProviderShellActivationSnapshot === 1 && repository.downstreamWriteCount === 0, JSON.stringify(repository.calls));
}

async function expectIssue(
  name: string,
  activationSnapshot: DeploymentProviderShellActivationSnapshot,
  expectedCode: DeploymentProviderShellActivationIssueCode,
  expectedStatus: DeploymentProviderShellActivationResult["status"],
): Promise<DeploymentProviderShellActivationServiceHarnessScenario> {
  const result = await assess(activationSnapshot);
  return expectScenario(name, result.status === expectedStatus && hasIssue(result, expectedCode), JSON.stringify(result));
}

async function assess(
  activationSnapshot: DeploymentProviderShellActivationSnapshot = snapshot(),
  commandPatch: Partial<DeploymentProviderShellActivationCommand> = {},
): Promise<DeploymentProviderShellActivationResult> {
  return service(
    new InMemoryDeploymentProviderShellActivationTestRepository({ snapshot: activationSnapshot }),
  ).assessProviderShellActivation(command(commandPatch));
}

function service(
  repository: InMemoryDeploymentProviderShellActivationTestRepository,
): DeploymentProviderShellActivationService {
  return new DeploymentProviderShellActivationService(repository);
}

function command(input: Partial<DeploymentProviderShellActivationCommand> = {}): DeploymentProviderShellActivationCommand {
  return {
    clinicId: PROVIDER_SHELL_ACTIVATION_TEST_IDS.clinicId,
    deploymentRunKey: PROVIDER_SHELL_ACTIVATION_TEST_IDS.deploymentRunKey,
    sessionId: PROVIDER_SHELL_ACTIVATION_TEST_IDS.sessionId,
    executionKey: PROVIDER_SHELL_ACTIVATION_TEST_IDS.executionKey,
    claimantId: PROVIDER_SHELL_ACTIVATION_TEST_IDS.owner,
    ownershipToken: PROVIDER_SHELL_ACTIVATION_TEST_IDS.token,
    now: NOW,
    ...input,
  };
}

function snapshot(input: Parameters<typeof buildProviderShellActivationSnapshot>[0] = {}): DeploymentProviderShellActivationSnapshot {
  return buildProviderShellActivationSnapshot(input);
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
  result: DeploymentProviderShellActivationResult,
  code: DeploymentProviderShellActivationIssueCode,
): boolean {
  return result.issues.some((issue) => issue.code === code);
}

function serializedEvidence(result: DeploymentProviderShellActivationResult): string {
  return JSON.stringify({
    message: result.message,
    issues: result.issues,
    result: {
      status: result.status,
      claimantId: result.claimantId,
      sessionId: result.sessionId,
      executionKey: result.executionKey,
      executionItemKey: result.executionItemKey,
      providerId: result.providerId,
      deploymentProviderKey: result.deploymentProviderKey,
    },
  });
}

function expectScenario(
  name: string,
  passed: boolean,
  message: string,
): DeploymentProviderShellActivationServiceHarnessScenario {
  return { name, passed, message };
}
