import {
  DeploymentClinicActivationService,
} from "./deployment-clinic-activation-service";
import {
  buildClinicActivationSnapshot,
  InMemoryDeploymentClinicActivationTestRepository,
} from "./deployment-clinic-activation-test-repository";
import type {
  DeploymentClinicActivationCommand,
  DeploymentClinicActivationIssueCode,
  DeploymentClinicActivationResult,
  DeploymentClinicActivationSnapshot,
  DeploymentClinicActivationStatus,
} from "./deployment-clinic-activation-types";

export interface DeploymentClinicActivationServiceHarnessScenario {
  name: string;
  passed: boolean;
  message: string;
}

export interface DeploymentClinicActivationServiceHarnessResult {
  passed: boolean;
  scenarios: readonly DeploymentClinicActivationServiceHarnessScenario[];
}

const ASSESSMENT_TIME = "2026-01-01T12:01:00.000Z";
const ACTIVE_LEASE = "2026-01-01T12:05:00.000Z";
const EXPIRED_LEASE = "2026-01-01T11:55:00.000Z";
const SESSION_STARTED_AT = "2026-01-01T11:59:00.000Z";
const ITEM_STARTED_AT = "2026-01-01T12:00:30.000Z";
const CLINIC_ID = "clinic-activation-0001";
const DEPLOYMENT_RUN_ID = "deployment-run-clinic-activation-0001";
const SESSION_ID = "activation-execution-session-clinic-activation-0001";
const EXECUTION_KEY = "activation-execution-deployment-run-clinic-activation-0001";
const ITEM_ID = "activation-execution-item-clinic-0001";
const EXECUTION_ITEM_KEY = "activation-execution-deployment-run-clinic-activation-0001:activation-plan-clinic-activation-0001:clinic";
const PLAN_ITEM_KEY = "activation-plan-clinic-activation-0001:clinic";
const CLAIMANT_ID = "executor-clinic-activation-001";
const OWNERSHIP_TOKEN = "sensitive-clinic-activation-token";
const WRONG_TOKEN = "wrong-sensitive-clinic-activation-token";

export async function runDeploymentClinicActivationServiceHarness(): Promise<DeploymentClinicActivationServiceHarnessResult> {
  const scenarios = [
    await scenarioActivationReady(),
    await scenarioAlreadyActivated(),
    await scenarioMissingSession(),
    await scenarioMissingItem(),
    await scenarioMissingClinic(),
    await scenarioClinicIdentityMismatch(),
    await scenarioDeploymentRunMismatch(),
    await scenarioSessionIdMismatch(),
    await scenarioExecutionKeyMismatch(),
    await scenarioItemIdMismatch(),
    await scenarioExecutionItemKeyMismatch(),
    await scenarioPlanItemKeyMismatch(),
    await scenarioItemSessionMismatch(),
    await scenarioWrongSequence(),
    await scenarioWrongEntityType(),
    await scenarioWrongAction(),
    await scenarioItemEntityMismatch(),
    await scenarioSessionNotRunning(),
    await scenarioSessionMissingStart(),
    await scenarioSessionCompleted(),
    await scenarioSessionFailed(),
    await scenarioMissingOwner(),
    await scenarioMissingToken(),
    await scenarioOwnerMismatch(),
    await scenarioTokenMismatch(),
    await scenarioMissingLease(),
    await scenarioExpiredLease(),
    await scenarioMalformedLease(),
    await scenarioItemNotRunning(),
    await scenarioItemAttemptInvalid(),
    await scenarioItemMissingStart(),
    await scenarioItemCompleted(),
    await scenarioItemRolledBack(),
    await scenarioItemErrorCode(),
    await scenarioItemErrorMessage(),
    await scenarioItemDependencyPresent(),
    await scenarioMissingExpectedState(),
    await scenarioMissingTargetState(),
    await scenarioUnsupportedTargetState(),
    await scenarioArchivedClinic(),
    await scenarioDeletedClinic(),
    await scenarioClinicActiveButNotTarget(),
    await scenarioWrongProvisioningSource(),
    await scenarioWrongProvisioningStatus(),
    await scenarioWrongClinicDeploymentRun(),
    await scenarioCurrentStateDrift(),
    await scenarioCanonicalStateComparison(),
    await scenarioDeterministicResult(),
    await scenarioSourceSnapshotImmutability(),
    await scenarioOwnershipTokenRedaction(),
    await scenarioRepositoryFailure(),
    await scenarioDownstreamCountersRemainZero(),
    await scenarioRepositoryExposesNoMutationMethods(),
  ];

  return {
    passed: scenarios.every((scenario) => scenario.passed),
    scenarios,
  };
}

async function scenarioActivationReady(): Promise<DeploymentClinicActivationServiceHarnessScenario> {
  const result = await assess();

  return expectScenario(
    "running clinic activation item is activation ready",
    result.ok &&
      result.status === "activation_ready" &&
      result.currentClinicState?.deploymentStatus === "draft" &&
      result.proposedClinicState?.deploymentStatus === "deployed" &&
      result.warnings === 4 &&
      result.downstream.clinicsActivated === 0,
    JSON.stringify(result),
  );
}

async function scenarioAlreadyActivated(): Promise<DeploymentClinicActivationServiceHarnessScenario> {
  const result = await assess(snapshot({
    clinic: {
      deploymentStatus: "deployed",
      active: true,
      provisioningStatus: "active",
      currentState: { clinic_id: CLINIC_ID, deployment_status: "deployed" },
    },
  }));

  return expectScenario(
    "already activated clinic is safely reused",
    result.ok &&
      result.status === "already_activated" &&
      result.downstream.clinicsActivated === 0 &&
      result.blockers === 0,
    JSON.stringify(result),
  );
}

async function scenarioMissingSession(): Promise<DeploymentClinicActivationServiceHarnessScenario> {
  return expectIssue("missing session", snapshot({ session: null }), "missing_session", "not_found");
}

async function scenarioMissingItem(): Promise<DeploymentClinicActivationServiceHarnessScenario> {
  return expectIssue("missing item", snapshot({ item: null }), "missing_item", "not_found");
}

async function scenarioMissingClinic(): Promise<DeploymentClinicActivationServiceHarnessScenario> {
  return expectIssue("missing clinic", snapshot({ clinic: null }), "missing_clinic", "not_found");
}

async function scenarioClinicIdentityMismatch(): Promise<DeploymentClinicActivationServiceHarnessScenario> {
  return expectIssue("clinic identity mismatch", snapshot({ session: { clinicId: "clinic-other" } }), "clinic_identity_mismatch", "conflict");
}

async function scenarioDeploymentRunMismatch(): Promise<DeploymentClinicActivationServiceHarnessScenario> {
  return expectIssue("deployment run mismatch", snapshot({ session: { deploymentRunId: "deployment-run-other" } }), "deployment_run_identity_mismatch", "conflict");
}

async function scenarioSessionIdMismatch(): Promise<DeploymentClinicActivationServiceHarnessScenario> {
  return expectIssue("session id mismatch", snapshot({ session: { sessionId: "session-other" } }), "session_identity_mismatch", "conflict");
}

async function scenarioExecutionKeyMismatch(): Promise<DeploymentClinicActivationServiceHarnessScenario> {
  return expectIssue("execution key mismatch", snapshot({ session: { executionKey: "execution-other" } }), "execution_key_mismatch", "conflict");
}

async function scenarioItemIdMismatch(): Promise<DeploymentClinicActivationServiceHarnessScenario> {
  return expectIssue("item id mismatch", snapshot({ item: { itemId: "item-other" } }), "item_identity_mismatch", "conflict");
}

async function scenarioExecutionItemKeyMismatch(): Promise<DeploymentClinicActivationServiceHarnessScenario> {
  return expectIssue("execution item key mismatch", snapshot({ item: { executionItemKey: "execution-item-other" } }), "item_identity_mismatch", "conflict");
}

async function scenarioPlanItemKeyMismatch(): Promise<DeploymentClinicActivationServiceHarnessScenario> {
  return expectIssue("plan item key mismatch", snapshot({ item: { planItemKey: "plan-item-other" } }), "item_identity_mismatch", "conflict");
}

async function scenarioItemSessionMismatch(): Promise<DeploymentClinicActivationServiceHarnessScenario> {
  return expectIssue("item session mismatch", snapshot({ item: { sessionId: "session-other" } }), "item_session_mismatch", "conflict");
}

async function scenarioWrongSequence(): Promise<DeploymentClinicActivationServiceHarnessScenario> {
  return expectIssue("wrong sequence", snapshot({ item: { sequence: 2 } }), "item_entity_mismatch", "conflict");
}

async function scenarioWrongEntityType(): Promise<DeploymentClinicActivationServiceHarnessScenario> {
  return expectIssue("wrong entity type", snapshot({ item: { entityType: "provider" } }), "item_entity_mismatch", "conflict");
}

async function scenarioWrongAction(): Promise<DeploymentClinicActivationServiceHarnessScenario> {
  return expectIssue("wrong action", snapshot({ item: { action: "bind" } }), "item_entity_mismatch", "conflict");
}

async function scenarioItemEntityMismatch(): Promise<DeploymentClinicActivationServiceHarnessScenario> {
  return expectIssue("item entity mismatch", snapshot({ item: { entityId: "clinic-other" } }), "item_entity_mismatch", "conflict");
}

async function scenarioSessionNotRunning(): Promise<DeploymentClinicActivationServiceHarnessScenario> {
  return expectIssue("session not running", snapshot({ session: { executionStatus: "claimed" } }), "session_not_running", "blocked");
}

async function scenarioSessionMissingStart(): Promise<DeploymentClinicActivationServiceHarnessScenario> {
  return expectIssue("session missing start", snapshot({ session: { startedAt: null } }), "session_timestamp_missing", "blocked");
}

async function scenarioSessionCompleted(): Promise<DeploymentClinicActivationServiceHarnessScenario> {
  return expectIssue("session completed", snapshot({ session: { completedAt: "2026-01-01T12:02:00.000Z" } }), "terminal_session_timestamp_present", "blocked");
}

async function scenarioSessionFailed(): Promise<DeploymentClinicActivationServiceHarnessScenario> {
  return expectIssue("session failed", snapshot({ session: { failedAt: "2026-01-01T12:02:00.000Z" } }), "terminal_session_timestamp_present", "blocked");
}

async function scenarioMissingOwner(): Promise<DeploymentClinicActivationServiceHarnessScenario> {
  return expectIssue("missing owner", snapshot({ session: { executionOwner: null } }), "ownership_shape_inconsistent", "blocked");
}

async function scenarioMissingToken(): Promise<DeploymentClinicActivationServiceHarnessScenario> {
  return expectIssue("missing token", snapshot({ session: { ownershipToken: null } }), "ownership_shape_inconsistent", "blocked");
}

async function scenarioOwnerMismatch(): Promise<DeploymentClinicActivationServiceHarnessScenario> {
  return expectIssue("owner mismatch", snapshot({ session: { executionOwner: "executor-other" } }), "session_owned_by_another_executor", "conflict");
}

async function scenarioTokenMismatch(): Promise<DeploymentClinicActivationServiceHarnessScenario> {
  const result = await assess(undefined, { ownershipToken: WRONG_TOKEN });

  return expectScenario(
    "token mismatch is conflict and token safe",
    result.status === "conflict" &&
      hasIssue(result, "ownership_token_mismatch") &&
      !serializedEvidence(result).includes(WRONG_TOKEN),
    JSON.stringify(result),
  );
}

async function scenarioMissingLease(): Promise<DeploymentClinicActivationServiceHarnessScenario> {
  return expectIssue("missing lease", snapshot({ session: { leaseExpiresAt: null } }), "lease_missing", "blocked");
}

async function scenarioExpiredLease(): Promise<DeploymentClinicActivationServiceHarnessScenario> {
  return expectIssue("expired lease", snapshot({ session: { leaseExpiresAt: EXPIRED_LEASE } }), "lease_expired", "blocked");
}

async function scenarioMalformedLease(): Promise<DeploymentClinicActivationServiceHarnessScenario> {
  return expectIssue("malformed lease", snapshot({ session: { leaseExpiresAt: "not-a-date" } }), "lease_timestamp_malformed", "blocked");
}

async function scenarioItemNotRunning(): Promise<DeploymentClinicActivationServiceHarnessScenario> {
  return expectIssue("item not running", snapshot({ item: { executionStatus: "ready" } }), "item_not_running", "blocked");
}

async function scenarioItemAttemptInvalid(): Promise<DeploymentClinicActivationServiceHarnessScenario> {
  return expectIssue("item attempt invalid", snapshot({ item: { attemptCount: 0 } }), "item_attempt_invalid", "blocked");
}

async function scenarioItemMissingStart(): Promise<DeploymentClinicActivationServiceHarnessScenario> {
  return expectIssue("item missing start", snapshot({ item: { startedAt: null } }), "item_timestamp_missing", "blocked");
}

async function scenarioItemCompleted(): Promise<DeploymentClinicActivationServiceHarnessScenario> {
  return expectIssue("item completed", snapshot({ item: { completedAt: "2026-01-01T12:02:00.000Z" } }), "item_terminal_evidence_present", "blocked");
}

async function scenarioItemRolledBack(): Promise<DeploymentClinicActivationServiceHarnessScenario> {
  return expectIssue("item rolled back", snapshot({ item: { rolledBackAt: "2026-01-01T12:02:00.000Z" } }), "item_terminal_evidence_present", "blocked");
}

async function scenarioItemErrorCode(): Promise<DeploymentClinicActivationServiceHarnessScenario> {
  return expectIssue("item error code", snapshot({ item: { errorCode: "activation_failed" } }), "item_error_present", "blocked");
}

async function scenarioItemErrorMessage(): Promise<DeploymentClinicActivationServiceHarnessScenario> {
  return expectIssue("item error message", snapshot({ item: { errorMessage: "failed" } }), "item_error_present", "blocked");
}

async function scenarioItemDependencyPresent(): Promise<DeploymentClinicActivationServiceHarnessScenario> {
  return expectIssue("item dependency present", snapshot({ item: { dependencyKeys: ["activation-plan-clinic-activation-0001:provider"] } }), "item_dependency_present", "blocked");
}

async function scenarioMissingExpectedState(): Promise<DeploymentClinicActivationServiceHarnessScenario> {
  return expectIssue("missing expected state", snapshot({ item: { expectedCurrentState: null } }), "item_expected_state_missing", "blocked");
}

async function scenarioMissingTargetState(): Promise<DeploymentClinicActivationServiceHarnessScenario> {
  return expectIssue("missing target state", snapshot({ item: { targetState: null } }), "item_target_state_missing", "blocked");
}

async function scenarioUnsupportedTargetState(): Promise<DeploymentClinicActivationServiceHarnessScenario> {
  return expectIssue("unsupported target state", snapshot({ item: { targetState: { deploymentStatus: "operational" } } }), "unsupported_target_state", "blocked");
}

async function scenarioArchivedClinic(): Promise<DeploymentClinicActivationServiceHarnessScenario> {
  return expectIssue("archived clinic", snapshot({ clinic: { archivedAt: "2026-01-01T12:00:00.000Z" } }), "clinic_archived_or_deleted", "blocked");
}

async function scenarioDeletedClinic(): Promise<DeploymentClinicActivationServiceHarnessScenario> {
  return expectIssue("deleted clinic", snapshot({ clinic: { deletedAt: "2026-01-01T12:00:00.000Z" } }), "clinic_archived_or_deleted", "blocked");
}

async function scenarioClinicActiveButNotTarget(): Promise<DeploymentClinicActivationServiceHarnessScenario> {
  return expectIssue("active clinic but not target", snapshot({ clinic: { active: true } }), "clinic_lifecycle_incompatible", "blocked");
}

async function scenarioWrongProvisioningSource(): Promise<DeploymentClinicActivationServiceHarnessScenario> {
  return expectIssue("wrong provisioning source", snapshot({ clinic: { provisioningSource: "manual" } }), "clinic_provisioning_incompatible", "blocked");
}

async function scenarioWrongProvisioningStatus(): Promise<DeploymentClinicActivationServiceHarnessScenario> {
  return expectIssue("wrong provisioning status", snapshot({ clinic: { provisioningStatus: "active" } }), "clinic_provisioning_incompatible", "blocked");
}

async function scenarioWrongClinicDeploymentRun(): Promise<DeploymentClinicActivationServiceHarnessScenario> {
  return expectIssue("wrong clinic deployment run", snapshot({ clinic: { deploymentRunId: "deployment-run-other" } }), "clinic_deployment_ownership_mismatch", "conflict");
}

async function scenarioCurrentStateDrift(): Promise<DeploymentClinicActivationServiceHarnessScenario> {
  return expectIssue("current state drift", snapshot({ clinic: { currentState: { clinicId: CLINIC_ID, deploymentStatus: "staged" } } }), "clinic_state_mismatch", "blocked");
}

async function scenarioCanonicalStateComparison(): Promise<DeploymentClinicActivationServiceHarnessScenario> {
  const result = await assess(snapshot({
    item: {
      expectedCurrentState: { deploymentStatus: "draft", clinicId: CLINIC_ID },
      targetState: { deployment_status: "deployed" },
    },
    clinic: {
      currentState: { clinic_id: CLINIC_ID, deployment_status: "draft" },
    },
  }));

  return expectScenario(
    "canonical state comparison accepts snake and camel case",
    result.status === "activation_ready" &&
      result.currentClinicState?.clinicId === CLINIC_ID &&
      result.proposedClinicState?.deploymentStatus === "deployed",
    JSON.stringify(result),
  );
}

async function scenarioDeterministicResult(): Promise<DeploymentClinicActivationServiceHarnessScenario> {
  const first = await assess();
  const second = await assess();

  return expectScenario(
    "activation assessment is deterministic",
    JSON.stringify(first) === JSON.stringify(second),
    JSON.stringify({ first, second }),
  );
}

async function scenarioSourceSnapshotImmutability(): Promise<DeploymentClinicActivationServiceHarnessScenario> {
  const source = snapshot();
  const before = JSON.stringify(source);
  await assess(source);

  return expectScenario(
    "source snapshot remains immutable",
    JSON.stringify(source) === before,
    "source snapshot unchanged",
  );
}

async function scenarioOwnershipTokenRedaction(): Promise<DeploymentClinicActivationServiceHarnessScenario> {
  const result = await assess(undefined, { ownershipToken: WRONG_TOKEN });
  const serialized = serializedEvidence(result);

  return expectScenario(
    "ownership token is redacted from evidence",
    !serialized.includes(OWNERSHIP_TOKEN) && !serialized.includes(WRONG_TOKEN),
    serialized,
  );
}

async function scenarioRepositoryFailure(): Promise<DeploymentClinicActivationServiceHarnessScenario> {
  const repository = new InMemoryDeploymentClinicActivationTestRepository({ shouldThrow: true });
  const result = await service(repository).assessClinicActivation(command());

  return expectScenario(
    "repository failure returns safe error",
    result.status === "error" && hasIssue(result, "repository_error"),
    JSON.stringify(result),
  );
}

async function scenarioDownstreamCountersRemainZero(): Promise<DeploymentClinicActivationServiceHarnessScenario> {
  const result = await assess();

  return expectScenario(
    "downstream counters remain zero",
    result.downstream.clinicsActivated === 0 &&
      result.downstream.itemsSucceeded === 0 &&
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

async function scenarioRepositoryExposesNoMutationMethods(): Promise<DeploymentClinicActivationServiceHarnessScenario> {
  const repository = new InMemoryDeploymentClinicActivationTestRepository({ snapshot: snapshot() });
  await service(repository).assessClinicActivation(command());
  const prototype = InMemoryDeploymentClinicActivationTestRepository.prototype as Record<string, unknown>;
  const forbiddenMethods = ["insert", "update", "upsert", "delete", "activate", "complete", "unlock", "finalize"];

  return expectScenario(
    "repository exposes no mutation methods",
    repository.downstreamWriteCount === 0 &&
      forbiddenMethods.every((name) => !(name in prototype)),
    JSON.stringify({ calls: repository.calls, forbidden: forbiddenMethods.filter((name) => name in prototype) }),
  );
}

async function expectIssue(
  name: string,
  clinicActivationSnapshot: DeploymentClinicActivationSnapshot,
  expectedCode: DeploymentClinicActivationIssueCode,
  expectedStatus: DeploymentClinicActivationStatus,
): Promise<DeploymentClinicActivationServiceHarnessScenario> {
  const result = await assess(clinicActivationSnapshot);

  return expectScenario(
    name,
    result.status === expectedStatus && hasIssue(result, expectedCode),
    JSON.stringify(result),
  );
}

async function assess(
  clinicActivationSnapshot: DeploymentClinicActivationSnapshot = snapshot(),
  commandPatch: Partial<DeploymentClinicActivationCommand> = {},
): Promise<DeploymentClinicActivationResult> {
  return service(
    new InMemoryDeploymentClinicActivationTestRepository({
      snapshot: clinicActivationSnapshot,
    }),
  ).assessClinicActivation(command(commandPatch));
}

function service(
  repository: InMemoryDeploymentClinicActivationTestRepository,
): DeploymentClinicActivationService {
  return new DeploymentClinicActivationService(repository);
}

function command(
  input: Partial<DeploymentClinicActivationCommand> = {},
): DeploymentClinicActivationCommand {
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
    ...input,
  };
}

function snapshot(
  input: Parameters<typeof buildClinicActivationSnapshot>[0] = {},
): DeploymentClinicActivationSnapshot {
  return buildClinicActivationSnapshot(input);
}

function hasIssue(
  result: DeploymentClinicActivationResult,
  code: DeploymentClinicActivationIssueCode,
): boolean {
  return result.issues.some((issue) => issue.code === code);
}

function serializedEvidence(
  result: DeploymentClinicActivationResult,
): string {
  return JSON.stringify({
    message: result.message,
    issues: result.issues,
    result: {
      status: result.status,
      claimantId: result.claimantId,
      clinicId: result.clinicId,
      deploymentRunId: result.deploymentRunId,
      sessionId: result.sessionId,
      executionKey: result.executionKey,
      itemId: result.itemId,
      executionItemKey: result.executionItemKey,
    },
  });
}

function expectScenario(
  name: string,
  passed: boolean,
  message: string,
): DeploymentClinicActivationServiceHarnessScenario {
  return { name, passed, message };
}
