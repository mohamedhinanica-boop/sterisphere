import {
  DeploymentActivationExecutionItemCompletionService,
} from "./deployment-activation-execution-item-completion-service";
import {
  buildAlreadyCompletedItemCompletionSnapshot,
  buildItemCompletionSnapshot,
  InMemoryDeploymentActivationExecutionItemCompletionTestRepository,
} from "./deployment-activation-execution-item-completion-test-repository";
import type {
  DeploymentActivationExecutionItemCompletionCommand,
  DeploymentActivationExecutionItemCompletionIssueCode,
  DeploymentActivationExecutionItemCompletionResult,
  DeploymentActivationExecutionItemCompletionSnapshot,
} from "./deployment-activation-execution-item-completion-types";

export interface DeploymentActivationExecutionItemCompletionServiceHarnessScenario {
  name: string;
  passed: boolean;
  message: string;
}

export interface DeploymentActivationExecutionItemCompletionServiceHarnessResult {
  passed: boolean;
  scenarios: readonly DeploymentActivationExecutionItemCompletionServiceHarnessScenario[];
}

const ASSESSMENT_TIME = "2026-01-01T12:01:30.000Z";
const PROPOSED_COMPLETED_AT = "2026-01-01T12:02:00.000Z";
const ACTIVE_LEASE = "2026-01-01T12:05:00.000Z";
const EXPIRED_LEASE = "2026-01-01T12:00:00.000Z";
const CLINIC_ID = "clinic-item-completion-0001";
const DEPLOYMENT_RUN_ID = "deployment-run-item-completion-0001";
const SESSION_ID = "activation-execution-session-item-completion-0001";
const EXECUTION_KEY = "activation-execution-deployment-run-item-completion-0001";
const ITEM_ID = "activation-execution-item-completion-0001";
const EXECUTION_ITEM_KEY = "activation-execution-deployment-run-item-completion-0001:activation-plan-deployment-run-item-completion-0001:clinic";
const PLAN_ITEM_KEY = "activation-plan-deployment-run-item-completion-0001:clinic";
const CLAIMANT_ID = "executor-item-completion-001";
const OWNERSHIP_TOKEN = "sensitive-item-completion-token";
const WRONG_TOKEN = "wrong-sensitive-completion-token";

export async function runDeploymentActivationExecutionItemCompletionServiceHarness(): Promise<DeploymentActivationExecutionItemCompletionServiceHarnessResult> {
  const scenarios = [
    await scenarioValidCompletableClinicItem(),
    await scenarioAlreadyCompletedReuse(),
    await scenarioMissingSession(),
    await scenarioMissingItem(),
    await scenarioMissingClinic(),
    await scenarioSessionIdentityMismatch(),
    await scenarioWrongOwner(),
    await scenarioWrongToken(),
    await scenarioExpiredLease(),
    await scenarioMalformedLease(),
    await scenarioSessionNotRunning(),
    await scenarioMissingSessionStartedAt(),
    await scenarioSessionTerminalTimestamp(),
    await scenarioNoRunningItem(),
    await scenarioTwoRunningItems(),
    await scenarioWrongRunningItem(),
    await scenarioWrongSequence(),
    await scenarioWrongEntityType(),
    await scenarioWrongEntityId(),
    await scenarioWrongAction(),
    await scenarioAttemptCountZero(),
    await scenarioAttemptCountGreaterThanOne(),
    await scenarioMissingItemStartedAt(),
    await scenarioItemAlreadyCompletedInCompletableMode(),
    await scenarioRollbackEvidence(),
    await scenarioItemErrorEvidence(),
    await scenarioMalformedDependencies(),
    await scenarioNonEmptyDependencies(),
    await scenarioClinicStillDraft(),
    await scenarioClinicDeploying(),
    await scenarioClinicFailed(),
    await scenarioClinicArchived(),
    await scenarioClinicDeployedWithNullDeployedAt(),
    await scenarioClinicTargetStateMismatch(),
    await scenarioDuplicateItemIdentity(),
    await scenarioUnrelatedItemAttemptEvidence(),
    await scenarioUnrelatedItemTimestampEvidence(),
    await scenarioUnrelatedItemErrorEvidence(),
    await scenarioTokenRedaction(),
    await scenarioDeterministicIssueOrdering(),
    await scenarioSourceImmutability(),
    await scenarioRepositoryFailure(),
    await scenarioZeroDownstreamCounters(),
    await scenarioRepositoryExposesNoMutationMethods(),
  ];

  return {
    passed: scenarios.every((scenario) => scenario.passed),
    scenarios,
  };
}

async function scenarioValidCompletableClinicItem(): Promise<DeploymentActivationExecutionItemCompletionServiceHarnessScenario> {
  const result = await assess();

  return expectScenario(
    "valid clinic item is completable",
    result.ok &&
      result.status === "completable" &&
      result.itemId === ITEM_ID &&
      result.sequence === 1 &&
      result.entityType === "clinic" &&
      result.action === "activate" &&
      result.existingCompletedAt === null &&
      result.proposedCompletedAt === PROPOSED_COMPLETED_AT &&
      result.currentDurableState?.deploymentStatus === "deployed" &&
      result.targetState?.deploymentStatus === "deployed" &&
      result.downstream.itemsCompleted === 0,
    JSON.stringify(result),
  );
}

async function scenarioAlreadyCompletedReuse(): Promise<DeploymentActivationExecutionItemCompletionServiceHarnessScenario> {
  const result = await assess(buildAlreadyCompletedItemCompletionSnapshot());

  return expectScenario(
    "already-completed item is reused",
    result.ok &&
      result.status === "already_completed" &&
      result.existingCompletedAt === PROPOSED_COMPLETED_AT &&
      result.proposedCompletedAt === null &&
      result.downstream.dependenciesUnlocked === 0,
    JSON.stringify(result),
  );
}

async function scenarioMissingSession(): Promise<DeploymentActivationExecutionItemCompletionServiceHarnessScenario> {
  return expectIssue("missing session", snapshot({ session: null }), "missing_session", "not_found");
}

async function scenarioMissingItem(): Promise<DeploymentActivationExecutionItemCompletionServiceHarnessScenario> {
  return expectIssue("missing item", snapshot({ item: null }), "missing_item", "not_found");
}

async function scenarioMissingClinic(): Promise<DeploymentActivationExecutionItemCompletionServiceHarnessScenario> {
  return expectIssue("missing clinic", snapshot({ clinic: null }), "missing_clinic", "not_found");
}

async function scenarioSessionIdentityMismatch(): Promise<DeploymentActivationExecutionItemCompletionServiceHarnessScenario> {
  return expectIssue("session identity mismatch", snapshot({ session: { sessionId: "session-other" } }), "session_identity_mismatch", "conflict");
}

async function scenarioWrongOwner(): Promise<DeploymentActivationExecutionItemCompletionServiceHarnessScenario> {
  return expectIssue("wrong owner", snapshot({ session: { executionOwner: "executor-other" } }), "session_owned_by_another_executor", "conflict");
}

async function scenarioWrongToken(): Promise<DeploymentActivationExecutionItemCompletionServiceHarnessScenario> {
  const result = await assess(undefined, { ownershipToken: WRONG_TOKEN });

  return expectScenario(
    "wrong token is conflict and redacted",
    result.status === "conflict" &&
      hasIssue(result, "ownership_token_mismatch") &&
      !serializedEvidence(result).includes(WRONG_TOKEN),
    JSON.stringify(result),
  );
}

async function scenarioExpiredLease(): Promise<DeploymentActivationExecutionItemCompletionServiceHarnessScenario> {
  return expectIssue("expired lease", snapshot({ session: { leaseExpiresAt: EXPIRED_LEASE } }), "lease_expired", "blocked");
}

async function scenarioMalformedLease(): Promise<DeploymentActivationExecutionItemCompletionServiceHarnessScenario> {
  return expectIssue("malformed lease", snapshot({ session: { leaseExpiresAt: "not-a-date" } }), "lease_timestamp_malformed", "blocked");
}

async function scenarioSessionNotRunning(): Promise<DeploymentActivationExecutionItemCompletionServiceHarnessScenario> {
  return expectIssue("session not running", snapshot({ session: { executionStatus: "claimed" } }), "session_not_running", "blocked");
}

async function scenarioMissingSessionStartedAt(): Promise<DeploymentActivationExecutionItemCompletionServiceHarnessScenario> {
  return expectIssue("missing session startedAt", snapshot({ session: { startedAt: null } }), "session_timestamp_missing", "blocked");
}

async function scenarioSessionTerminalTimestamp(): Promise<DeploymentActivationExecutionItemCompletionServiceHarnessScenario> {
  return expectIssue("session terminal timestamp", snapshot({ session: { completedAt: "2026-01-01T12:10:00.000Z" } }), "terminal_session_timestamp_present", "blocked");
}

async function scenarioNoRunningItem(): Promise<DeploymentActivationExecutionItemCompletionServiceHarnessScenario> {
  return expectIssue("no running item", snapshot({ aggregate: { runningItemCount: 0, pendingItemCount: 3 } }), "no_running_item", "blocked");
}

async function scenarioTwoRunningItems(): Promise<DeploymentActivationExecutionItemCompletionServiceHarnessScenario> {
  return expectIssue("two running items", snapshot({ aggregate: { runningItemCount: 2, pendingItemCount: 1 } }), "multiple_running_items", "blocked");
}

async function scenarioWrongRunningItem(): Promise<DeploymentActivationExecutionItemCompletionServiceHarnessScenario> {
  return expectIssue("wrong running item", snapshot({ item: { itemId: "activation-execution-item-other" } }), "item_identity_mismatch", "conflict");
}

async function scenarioWrongSequence(): Promise<DeploymentActivationExecutionItemCompletionServiceHarnessScenario> {
  return expectIssue("wrong sequence", snapshot({ item: { sequence: 2 } }), "wrong_sequence", "blocked");
}

async function scenarioWrongEntityType(): Promise<DeploymentActivationExecutionItemCompletionServiceHarnessScenario> {
  return expectIssue("wrong entity type", snapshot({ item: { entityType: "provider_shell" } }), "wrong_entity_type", "blocked");
}

async function scenarioWrongEntityId(): Promise<DeploymentActivationExecutionItemCompletionServiceHarnessScenario> {
  return expectIssue("wrong entity id", snapshot({ item: { entityId: "clinic-other" } }), "wrong_entity_id", "conflict");
}

async function scenarioWrongAction(): Promise<DeploymentActivationExecutionItemCompletionServiceHarnessScenario> {
  return expectIssue("wrong action", snapshot({ item: { action: "finalize" } }), "wrong_action", "blocked");
}

async function scenarioAttemptCountZero(): Promise<DeploymentActivationExecutionItemCompletionServiceHarnessScenario> {
  return expectIssue("attempt count zero", snapshot({ item: { attemptCount: 0 }, aggregate: { attemptedItemCount: 0 } }), "item_attempt_invalid", "blocked");
}

async function scenarioAttemptCountGreaterThanOne(): Promise<DeploymentActivationExecutionItemCompletionServiceHarnessScenario> {
  return expectIssue("attempt count greater than one", snapshot({ item: { attemptCount: 2 }, aggregate: { attemptedItemCount: 2 } }), "item_attempt_invalid", "blocked");
}

async function scenarioMissingItemStartedAt(): Promise<DeploymentActivationExecutionItemCompletionServiceHarnessScenario> {
  return expectIssue("missing item startedAt", snapshot({ item: { startedAt: null }, aggregate: { timestampedItemCount: 0 } }), "item_timestamp_missing", "blocked");
}

async function scenarioItemAlreadyCompletedInCompletableMode(): Promise<DeploymentActivationExecutionItemCompletionServiceHarnessScenario> {
  return expectIssue("running item already has completedAt", snapshot({ item: { completedAt: PROPOSED_COMPLETED_AT } }), "item_completed_timestamp_present", "blocked");
}

async function scenarioRollbackEvidence(): Promise<DeploymentActivationExecutionItemCompletionServiceHarnessScenario> {
  return expectIssue("rollback evidence", snapshot({ item: { rolledBackAt: "2026-01-01T12:03:00.000Z" }, aggregate: { rollbackEvidenceCount: 1 } }), "item_rollback_evidence_present", "blocked");
}

async function scenarioItemErrorEvidence(): Promise<DeploymentActivationExecutionItemCompletionServiceHarnessScenario> {
  return expectIssue("item error evidence", snapshot({ item: { errorCode: "item_error", errorMessage: "Item failed." }, aggregate: { errorEvidenceCount: 1 } }), "item_error_present", "blocked");
}

async function scenarioMalformedDependencies(): Promise<DeploymentActivationExecutionItemCompletionServiceHarnessScenario> {
  return expectIssue("malformed dependencies", snapshot({ item: { dependencyKeys: "not-array" as unknown as readonly string[] } }), "dependency_integrity_invalid", "blocked");
}

async function scenarioNonEmptyDependencies(): Promise<DeploymentActivationExecutionItemCompletionServiceHarnessScenario> {
  return expectIssue("non-empty dependencies", snapshot({ item: { dependencyKeys: ["activation-plan:provider"] } }), "dependency_integrity_invalid", "blocked");
}

async function scenarioClinicStillDraft(): Promise<DeploymentActivationExecutionItemCompletionServiceHarnessScenario> {
  return expectIssue("clinic still draft", snapshot({ clinic: clinicState("draft") }), "clinic_not_deployed", "blocked");
}

async function scenarioClinicDeploying(): Promise<DeploymentActivationExecutionItemCompletionServiceHarnessScenario> {
  return expectIssue("clinic deploying", snapshot({ clinic: clinicState("deploying") }), "clinic_not_deployed", "blocked");
}

async function scenarioClinicFailed(): Promise<DeploymentActivationExecutionItemCompletionServiceHarnessScenario> {
  return expectIssue("clinic failed", snapshot({ clinic: clinicState("failed") }), "clinic_not_deployed", "blocked");
}

async function scenarioClinicArchived(): Promise<DeploymentActivationExecutionItemCompletionServiceHarnessScenario> {
  return expectIssue("clinic archived", snapshot({ clinic: clinicState("archived") }), "clinic_not_deployed", "blocked");
}

async function scenarioClinicDeployedWithNullDeployedAt(): Promise<DeploymentActivationExecutionItemCompletionServiceHarnessScenario> {
  return expectIssue("clinic deployed with null deployedAt", snapshot({ clinic: { deployedAt: null } }), "clinic_deployed_at_missing", "blocked");
}

async function scenarioClinicTargetStateMismatch(): Promise<DeploymentActivationExecutionItemCompletionServiceHarnessScenario> {
  return expectIssue("clinic target state mismatch", snapshot({ clinic: { currentState: { clinicId: CLINIC_ID, deploymentStatus: "draft" } } }), "clinic_target_state_mismatch", "blocked");
}

async function scenarioDuplicateItemIdentity(): Promise<DeploymentActivationExecutionItemCompletionServiceHarnessScenario> {
  return expectIssue("duplicate item identity", snapshot({ aggregate: { duplicateExecutionItemKeyCount: 1 } }), "duplicate_item_identity", "blocked");
}

async function scenarioUnrelatedItemAttemptEvidence(): Promise<DeploymentActivationExecutionItemCompletionServiceHarnessScenario> {
  return expectIssue("unrelated attempt evidence", snapshot({ aggregate: { attemptedItemCount: 2 } }), "unrelated_item_execution_evidence", "blocked");
}

async function scenarioUnrelatedItemTimestampEvidence(): Promise<DeploymentActivationExecutionItemCompletionServiceHarnessScenario> {
  return expectIssue("unrelated timestamp evidence", snapshot({ aggregate: { timestampedItemCount: 2 } }), "unrelated_item_execution_evidence", "blocked");
}

async function scenarioUnrelatedItemErrorEvidence(): Promise<DeploymentActivationExecutionItemCompletionServiceHarnessScenario> {
  return expectIssue("unrelated item error evidence", snapshot({ aggregate: { errorEvidenceCount: 1 } }), "item_error_present", "blocked");
}

async function scenarioTokenRedaction(): Promise<DeploymentActivationExecutionItemCompletionServiceHarnessScenario> {
  const result = await assess(undefined, { ownershipToken: WRONG_TOKEN });
  const serialized = serializedEvidence(result);

  return expectScenario(
    "ownership tokens are redacted",
    !serialized.includes(OWNERSHIP_TOKEN) && !serialized.includes(WRONG_TOKEN),
    serialized,
  );
}

async function scenarioDeterministicIssueOrdering(): Promise<DeploymentActivationExecutionItemCompletionServiceHarnessScenario> {
  const result = await assess(snapshot({
    aggregate: {
      duplicateSequenceCount: 1,
      errorEvidenceCount: 1,
      attemptedItemCount: 2,
    },
    item: {
      attemptCount: 2,
      errorCode: "item_error",
      errorMessage: "Item failed.",
    },
  }));
  const codes = result.issues.map((issue) => issue.code).join(",");

  return expectScenario(
    "issue ordering is deterministic",
    codes === "duplicate_item_identity,item_attempt_invalid,item_error_present,unrelated_item_execution_evidence",
    codes,
  );
}

async function scenarioSourceImmutability(): Promise<DeploymentActivationExecutionItemCompletionServiceHarnessScenario> {
  const source = snapshot();
  const before = JSON.stringify(source);
  await assess(source);

  return expectScenario(
    "source snapshot remains immutable",
    JSON.stringify(source) === before,
    "source snapshot unchanged",
  );
}

async function scenarioRepositoryFailure(): Promise<DeploymentActivationExecutionItemCompletionServiceHarnessScenario> {
  const repository = new InMemoryDeploymentActivationExecutionItemCompletionTestRepository({ shouldThrow: true });
  const result = await service(repository).assessItemCompletion(command());

  return expectScenario(
    "repository failure returns safe error",
    result.status === "error" && hasIssue(result, "repository_error"),
    JSON.stringify(result),
  );
}

async function scenarioZeroDownstreamCounters(): Promise<DeploymentActivationExecutionItemCompletionServiceHarnessScenario> {
  const result = await assess();

  return expectScenario(
    "downstream counters remain zero",
    result.downstream.itemsCompleted === 0 &&
      result.downstream.dependenciesUnlocked === 0 &&
      result.downstream.providersActivated === 0 &&
      result.downstream.sterilizersActivated === 0 &&
      result.downstream.workstationsActivated === 0 &&
      result.downstream.hardwareActivated === 0 &&
      result.downstream.bindingsWritten === 0 &&
      result.downstream.deploymentFinalized === 0,
    JSON.stringify(result.downstream),
  );
}

async function scenarioRepositoryExposesNoMutationMethods(): Promise<DeploymentActivationExecutionItemCompletionServiceHarnessScenario> {
  const repository = new InMemoryDeploymentActivationExecutionItemCompletionTestRepository({ snapshot: snapshot() });
  await service(repository).assessItemCompletion(command());
  const prototype = InMemoryDeploymentActivationExecutionItemCompletionTestRepository.prototype as Record<string, unknown>;
  const forbiddenMethods = ["insert", "update", "upsert", "delete", "claim", "start", "complete", "unlock", "activate", "rollback"];

  return expectScenario(
    "repository exposes no mutation methods",
    repository.downstreamWriteCount === 0 &&
      forbiddenMethods.every((name) => !(name in prototype)),
    JSON.stringify({ calls: repository.calls, forbidden: forbiddenMethods.filter((name) => name in prototype) }),
  );
}

async function expectIssue(
  name: string,
  completionSnapshot: DeploymentActivationExecutionItemCompletionSnapshot,
  expectedCode: DeploymentActivationExecutionItemCompletionIssueCode,
  expectedStatus: DeploymentActivationExecutionItemCompletionResult["status"],
): Promise<DeploymentActivationExecutionItemCompletionServiceHarnessScenario> {
  const result = await assess(completionSnapshot);

  return expectScenario(
    name,
    result.status === expectedStatus && hasIssue(result, expectedCode),
    JSON.stringify(result),
  );
}

async function assess(
  completionSnapshot: DeploymentActivationExecutionItemCompletionSnapshot = snapshot(),
  commandPatch: Partial<DeploymentActivationExecutionItemCompletionCommand> = {},
): Promise<DeploymentActivationExecutionItemCompletionResult> {
  return service(
    new InMemoryDeploymentActivationExecutionItemCompletionTestRepository({
      snapshot: completionSnapshot,
    }),
  ).assessItemCompletion(command(commandPatch));
}

function service(
  repository: InMemoryDeploymentActivationExecutionItemCompletionTestRepository,
): DeploymentActivationExecutionItemCompletionService {
  return new DeploymentActivationExecutionItemCompletionService(repository);
}

function command(
  input: Partial<DeploymentActivationExecutionItemCompletionCommand> = {},
): DeploymentActivationExecutionItemCompletionCommand {
  return {
    clinicId: CLINIC_ID,
    deploymentRunId: DEPLOYMENT_RUN_ID,
    sessionId: SESSION_ID,
    executionKey: EXECUTION_KEY,
    itemId: ITEM_ID,
    executionItemKey: EXECUTION_ITEM_KEY,
    planItemKey: PLAN_ITEM_KEY,
    claimantId: CLAIMANT_ID,
    ownershipToken: OWNERSHIP_TOKEN,
    assessmentTimestamp: ASSESSMENT_TIME,
    proposedCompletedAt: PROPOSED_COMPLETED_AT,
    ...input,
  };
}

function snapshot(
  input: Parameters<typeof buildItemCompletionSnapshot>[0] = {},
): DeploymentActivationExecutionItemCompletionSnapshot {
  return buildItemCompletionSnapshot(input);
}

function clinicState(
  deploymentStatus: string,
): NonNullable<Parameters<typeof buildItemCompletionSnapshot>[0]["clinic"]> {
  return {
    deploymentStatus,
    currentState: { clinicId: CLINIC_ID, deploymentStatus },
  };
}

function hasIssue(
  result: DeploymentActivationExecutionItemCompletionResult,
  code: DeploymentActivationExecutionItemCompletionIssueCode,
): boolean {
  return result.issues.some((issue) => issue.code === code);
}

function serializedEvidence(
  result: DeploymentActivationExecutionItemCompletionResult,
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
): DeploymentActivationExecutionItemCompletionServiceHarnessScenario {
  return { name, passed, message };
}
