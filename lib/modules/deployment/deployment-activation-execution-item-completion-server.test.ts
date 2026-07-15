import {
  completeActivationExecutionItemWithRepository,
  type DeploymentActivationExecutionAtomicItemCompletionRepository,
} from "./deployment-activation-execution-item-completion-server";
import {
  buildAlreadyCompletedItemCompletionSnapshot,
  buildItemCompletionSnapshot,
} from "./deployment-activation-execution-item-completion-test-repository";
import {
  cloneItemCompletionSnapshot,
  type DeploymentActivationExecutionAtomicItemCompletionCommand,
  type DeploymentActivationExecutionAtomicItemCompletionResult,
  type DeploymentActivationExecutionItemCompletionSnapshot,
} from "./deployment-activation-execution-item-completion-types";
import type {
  ServerDeploymentActivationExecutionClaimResult,
} from "./deployment-activation-execution-claim-server";
import type {
  ServerDeploymentClinicActivationResult,
} from "./deployment-clinic-activation-server";

export interface DeploymentActivationExecutionItemCompletionServerHarnessScenario {
  name: string;
  passed: boolean;
  message: string;
}

export interface DeploymentActivationExecutionItemCompletionServerHarnessResult {
  passed: boolean;
  scenarios: readonly DeploymentActivationExecutionItemCompletionServerHarnessScenario[];
}

const CLINIC_ID = "clinic-item-completion-0001";
const DEPLOYMENT_RUN_ID = "deployment-run-item-completion-0001";
const SESSION_ID = "activation-execution-session-item-completion-0001";
const EXECUTION_KEY = "activation-execution-deployment-run-item-completion-0001";
const PLAN_KEY = "activation-plan-deployment-run-item-completion-0001";
const ITEM_ID = "activation-execution-item-completion-0001";
const EXECUTION_ITEM_KEY = `${EXECUTION_KEY}:${PLAN_KEY}:clinic`;
const PLAN_ITEM_KEY = `${PLAN_KEY}:clinic`;
const CLAIMANT_ID = "executor-item-completion-001";
const OWNERSHIP_TOKEN = "sensitive-item-completion-token";
const ACTIVE_LEASE = "2026-01-01T12:05:00.000Z";
const EXPIRED_LEASE = "2026-01-01T12:00:00.000Z";
const STARTED_AT = "2026-01-01T12:00:30.000Z";
const COMPLETED_AT = "2026-01-01T12:02:00.000Z";
const CLINIC_ACTIVATED_AT = "2026-01-01T12:01:00.000Z";

export async function runDeploymentActivationExecutionItemCompletionServerHarness(): Promise<DeploymentActivationExecutionItemCompletionServerHarnessResult> {
  const scenarios = [
    await scenarioSuccessfulCompletion(),
    await scenarioAlreadyCompletedReuse(),
    await scenarioSkippedWhenClinicActivationMissing(),
    await scenarioSkippedWhenClinicActivationBlocked(),
    await scenarioOwnershipTokenMissing(),
    await scenarioWrongOwner(),
    await scenarioWrongToken(),
    await scenarioExpiredLease(),
    await scenarioStaleExecutionState(),
    await scenarioRunningItemWithCompletedAt(),
    await scenarioMissingItem(),
    await scenarioDuplicateIdentity(),
    await scenarioRepositoryFailure(),
    await scenarioAtomicOwnershipConflict(),
    await scenarioAtomicLeaseExpired(),
    await scenarioAtomicItemNotRunning(),
    await scenarioAtomicItemNotFound(),
    await scenarioAtomicSessionNotRunning(),
    await scenarioAtomicStaleState(),
    await scenarioImmutableTimestamps(),
    await scenarioImmutableAttemptCount(),
    await scenarioCompareAndSetCommand(),
    await scenarioDeterministicIssueOrdering(),
    await scenarioSourceImmutability(),
    await scenarioDownstreamCountersRemainZero(),
    await scenarioNoFallbackMutationMethods(),
  ];

  return {
    passed: scenarios.every((scenario) => scenario.passed),
    scenarios,
  };
}

async function scenarioSuccessfulCompletion(): Promise<DeploymentActivationExecutionItemCompletionServerHarnessScenario> {
  const repository = repositoryHarness();
  const result = await complete(repository);

  return expectScenario(
    "successful completion",
    result.ok &&
      result.status === "completed" &&
      result.completedCount === 1 &&
      result.reusedCount === 0 &&
      result.completedAt === COMPLETED_AT &&
      result.executionStatusBefore === "running" &&
      result.executionStatusAfter === "succeeded" &&
      repository.atomicCalls.length === 1,
    JSON.stringify(redact(result)),
  );
}

async function scenarioAlreadyCompletedReuse(): Promise<DeploymentActivationExecutionItemCompletionServerHarnessScenario> {
  const repository = repositoryHarness({ snapshot: buildAlreadyCompletedItemCompletionSnapshot() });
  const result = await complete(repository);

  return expectScenario(
    "already completed reuse",
    result.ok &&
      result.status === "already_completed" &&
      result.reusedCount === 1 &&
      result.completedAt === COMPLETED_AT &&
      result.attemptCount === 1 &&
      repository.atomicCalls.length === 0,
    JSON.stringify(redact(result)),
  );
}

async function scenarioSkippedWhenClinicActivationMissing(): Promise<DeploymentActivationExecutionItemCompletionServerHarnessScenario> {
  return expectSkipped("missing clinic activation", null);
}

async function scenarioSkippedWhenClinicActivationBlocked(): Promise<DeploymentActivationExecutionItemCompletionServerHarnessScenario> {
  return expectSkipped("blocked clinic activation", clinicActivation({ ok: false, status: "blocked", activationResult: "blocked" }));
}

async function expectSkipped(
  name: string,
  clinicActivationResult: ServerDeploymentClinicActivationResult | null,
): Promise<DeploymentActivationExecutionItemCompletionServerHarnessScenario> {
  const repository = repositoryHarness();
  const result = await complete(repository, { clinicActivation: clinicActivationResult });

  return expectScenario(
    name,
    !result.ok && result.status === "not_attempted" && repository.loadCalls === 0 && repository.atomicCalls.length === 0,
    JSON.stringify(redact(result)),
  );
}

async function scenarioOwnershipTokenMissing(): Promise<DeploymentActivationExecutionItemCompletionServerHarnessScenario> {
  const repository = repositoryHarness();
  const result = await complete(repository, { token: null });

  return expectScenario(
    "ownership token missing",
    !result.ok && result.status === "error" && repository.loadCalls === 0 && repository.atomicCalls.length === 0,
    JSON.stringify(redact(result)),
  );
}

async function scenarioWrongOwner(): Promise<DeploymentActivationExecutionItemCompletionServerHarnessScenario> {
  return expectAssessmentIssue("wrong owner", snapshot({ session: { executionOwner: "other-executor" } }), "conflict", "session_owned_by_another_executor");
}

async function scenarioWrongToken(): Promise<DeploymentActivationExecutionItemCompletionServerHarnessScenario> {
  const repository = repositoryHarness();
  const result = await complete(repository, { token: "wrong-token" });

  return expectScenario(
    "wrong token",
    result.status === "conflict" &&
      result.issues.some((issue) => issue.code === "ownership_token_mismatch") &&
      repository.atomicCalls.length === 0 &&
      !JSON.stringify(result).includes("wrong-token"),
    JSON.stringify(redact(result)),
  );
}

async function scenarioExpiredLease(): Promise<DeploymentActivationExecutionItemCompletionServerHarnessScenario> {
  return expectAssessmentIssue("expired lease", snapshot({ session: { leaseExpiresAt: EXPIRED_LEASE } }), "blocked", "lease_expired");
}

async function scenarioStaleExecutionState(): Promise<DeploymentActivationExecutionItemCompletionServerHarnessScenario> {
  return expectAssessmentIssue("stale execution state", snapshot({ session: { executionStatus: "claimed" } }), "blocked", "session_not_running");
}

async function scenarioRunningItemWithCompletedAt(): Promise<DeploymentActivationExecutionItemCompletionServerHarnessScenario> {
  return expectAssessmentIssue("completed_at already populated", snapshot({ item: { completedAt: COMPLETED_AT } }), "blocked", "item_completed_timestamp_present");
}

async function scenarioMissingItem(): Promise<DeploymentActivationExecutionItemCompletionServerHarnessScenario> {
  return expectAssessmentIssue("missing item", snapshot({ item: null }), "not_found", "missing_item");
}

async function scenarioDuplicateIdentity(): Promise<DeploymentActivationExecutionItemCompletionServerHarnessScenario> {
  return expectAssessmentIssue("duplicate identity", snapshot({ aggregate: { duplicateExecutionItemKeyCount: 1 } }), "blocked", "duplicate_item_identity");
}

async function expectAssessmentIssue(
  name: string,
  completionSnapshot: DeploymentActivationExecutionItemCompletionSnapshot,
  expectedStatus: string,
  expectedCode: string,
): Promise<DeploymentActivationExecutionItemCompletionServerHarnessScenario> {
  const repository = repositoryHarness({ snapshot: completionSnapshot });
  const result = await complete(repository);

  return expectScenario(
    name,
    result.status === expectedStatus &&
      result.issues.some((issue) => issue.code === expectedCode) &&
      repository.atomicCalls.length === 0,
    JSON.stringify(redact(result)),
  );
}

async function scenarioRepositoryFailure(): Promise<DeploymentActivationExecutionItemCompletionServerHarnessScenario> {
  const repository = repositoryHarness({ throwOnLoad: true });
  const result = await complete(repository);

  return expectScenario(
    "repository failure",
    !result.ok && result.status === "error" && result.blockers === 1 && repository.atomicCalls.length === 0,
    JSON.stringify(redact(result)),
  );
}

async function scenarioAtomicOwnershipConflict(): Promise<DeploymentActivationExecutionItemCompletionServerHarnessScenario> {
  return expectAtomicStatus("conflict", "conflict", "ownership_conflict");
}

async function scenarioAtomicLeaseExpired(): Promise<DeploymentActivationExecutionItemCompletionServerHarnessScenario> {
  return expectAtomicStatus("blocked", "blocked", "lease_expired");
}

async function scenarioAtomicItemNotRunning(): Promise<DeploymentActivationExecutionItemCompletionServerHarnessScenario> {
  return expectAtomicStatus("blocked", "blocked", "item_not_running");
}

async function scenarioAtomicItemNotFound(): Promise<DeploymentActivationExecutionItemCompletionServerHarnessScenario> {
  return expectAtomicStatus("not_found", "not_found", "item_not_found");
}

async function scenarioAtomicSessionNotRunning(): Promise<DeploymentActivationExecutionItemCompletionServerHarnessScenario> {
  return expectAtomicStatus("blocked", "blocked", "session_not_running");
}

async function scenarioAtomicStaleState(): Promise<DeploymentActivationExecutionItemCompletionServerHarnessScenario> {
  return expectAtomicStatus("blocked", "blocked", "stale_state");
}

async function expectAtomicStatus(
  atomicStatus: DeploymentActivationExecutionAtomicItemCompletionResult["status"],
  expectedStatus: string,
  issueCode: string,
): Promise<DeploymentActivationExecutionItemCompletionServerHarnessScenario> {
  const repository = repositoryHarness({ atomicResult: atomicResult({ ok: false, status: atomicStatus, issueCode }) });
  const result = await complete(repository);

  return expectScenario(
    `atomic ${issueCode}`,
    !result.ok &&
      result.status === expectedStatus &&
      result.issueCode === issueCode &&
      repository.atomicCalls.length === 1,
    JSON.stringify(redact(result)),
  );
}

async function scenarioImmutableTimestamps(): Promise<DeploymentActivationExecutionItemCompletionServerHarnessScenario> {
  const repository = repositoryHarness();
  const result = await complete(repository);
  const command = repository.atomicCalls[0];

  return expectScenario(
    "immutable timestamps",
    command?.expectedStartedAt === STARTED_AT &&
      command.proposedCompletedAt === COMPLETED_AT &&
      result.startedAt === STARTED_AT,
    JSON.stringify({ result: redact(result), command: redact(command) }),
  );
}

async function scenarioImmutableAttemptCount(): Promise<DeploymentActivationExecutionItemCompletionServerHarnessScenario> {
  const repository = repositoryHarness();
  const result = await complete(repository);

  return expectScenario(
    "immutable attempt count",
    result.attemptCount === 1 &&
      repository.atomicCalls[0]?.expectedAttemptCount === 1,
    JSON.stringify({ result: redact(result), command: redact(repository.atomicCalls[0]) }),
  );
}

async function scenarioCompareAndSetCommand(): Promise<DeploymentActivationExecutionItemCompletionServerHarnessScenario> {
  const repository = repositoryHarness();
  await complete(repository);
  const command = repository.atomicCalls[0];

  return expectScenario(
    "compare-and-set command",
    command?.claimantId === CLAIMANT_ID &&
      command.ownershipToken === OWNERSHIP_TOKEN &&
      command.expectedLeaseExpiresAt === ACTIVE_LEASE &&
      command.itemId === ITEM_ID &&
      command.executionItemKey === EXECUTION_ITEM_KEY &&
      command.planItemKey === PLAN_ITEM_KEY &&
      command.expectedSequence === 1 &&
      command.expectedEntityType === "clinic" &&
      command.expectedAction === "activate",
    JSON.stringify(redact(command)),
  );
}

async function scenarioDeterministicIssueOrdering(): Promise<DeploymentActivationExecutionItemCompletionServerHarnessScenario> {
  const repository = repositoryHarness({
    snapshot: snapshot({
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
    }),
  });
  const result = await complete(repository);
  const codes = result.issues.map((issue) => issue.code).join(",");

  return expectScenario(
    "deterministic issue ordering",
    codes === "duplicate_item_identity,item_attempt_invalid,item_error_present,unrelated_item_execution_evidence",
    codes,
  );
}

async function scenarioSourceImmutability(): Promise<DeploymentActivationExecutionItemCompletionServerHarnessScenario> {
  const source = snapshot();
  const before = JSON.stringify(source);
  await complete(repositoryHarness({ snapshot: source }));

  return expectScenario("source immutability", JSON.stringify(source) === before, "source unchanged");
}

async function scenarioDownstreamCountersRemainZero(): Promise<DeploymentActivationExecutionItemCompletionServerHarnessScenario> {
  const result = await complete(repositoryHarness());

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

async function scenarioNoFallbackMutationMethods(): Promise<DeploymentActivationExecutionItemCompletionServerHarnessScenario> {
  const repository = repositoryHarness();
  await complete(repository);
  const prototype = Object.getPrototypeOf(repository) as Record<string, unknown>;
  const forbidden = ["update", "insert", "upsert", "delete", "unlockDependencies", "completeSession", "finalizeDeployment", "activateProvider", "bindHardware", "rollback"];

  return expectScenario(
    "no fallback mutation methods",
    repository.genericMutationCalls === 0 && forbidden.every((method) => !(method in prototype)),
    JSON.stringify({ stats: repository.stats, forbidden: forbidden.filter((method) => method in prototype) }),
  );
}

interface CompletionInput {
  claim: ServerDeploymentActivationExecutionClaimResult | null;
  clinicActivation: ServerDeploymentClinicActivationResult | null;
  token: string | null;
}

async function complete(
  repository: MockItemCompletionRepository,
  input: Partial<CompletionInput> = {},
) {
  return completeActivationExecutionItemWithRepository(
    repository,
    {
      clinicId: CLINIC_ID,
      deploymentRunId: DEPLOYMENT_RUN_ID,
      deploymentActivationExecutionClaim: input.claim === undefined ? claim() : input.claim,
      deploymentClinicActivation: input.clinicActivation === undefined ? clinicActivation() : input.clinicActivation,
      itemCompletionRequestedAt: COMPLETED_AT,
    },
    {
      claimantId: CLAIMANT_ID,
      ownershipTokenResolver: () => input.token === undefined ? OWNERSHIP_TOKEN : input.token,
    },
  );
}

function repositoryHarness(input: {
  snapshot?: DeploymentActivationExecutionItemCompletionSnapshot;
  atomicResult?: DeploymentActivationExecutionAtomicItemCompletionResult;
  throwOnLoad?: boolean;
  throwOnAtomic?: boolean;
} = {}): MockItemCompletionRepository {
  return new MockItemCompletionRepository(input);
}

class MockItemCompletionRepository implements DeploymentActivationExecutionAtomicItemCompletionRepository {
  loadCalls = 0;
  atomicCalls: DeploymentActivationExecutionAtomicItemCompletionCommand[] = [];
  genericMutationCalls = 0;
  private readonly snapshotValue: DeploymentActivationExecutionItemCompletionSnapshot;
  private readonly atomicResultValue: DeploymentActivationExecutionAtomicItemCompletionResult;
  private readonly throwOnLoad: boolean;
  private readonly throwOnAtomic: boolean;

  constructor(input: {
    snapshot?: DeploymentActivationExecutionItemCompletionSnapshot;
    atomicResult?: DeploymentActivationExecutionAtomicItemCompletionResult;
    throwOnLoad?: boolean;
    throwOnAtomic?: boolean;
  } = {}) {
    this.snapshotValue = cloneItemCompletionSnapshot(input.snapshot ?? snapshot());
    this.atomicResultValue = input.atomicResult ?? atomicResult();
    this.throwOnLoad = input.throwOnLoad ?? false;
    this.throwOnAtomic = input.throwOnAtomic ?? false;
  }

  get stats(): Record<string, unknown> {
    return {
      loadCalls: this.loadCalls,
      atomicCalls: this.atomicCalls.length,
      genericMutationCalls: this.genericMutationCalls,
    };
  }

  async loadExecutionItemCompletionSnapshot(): Promise<DeploymentActivationExecutionItemCompletionSnapshot> {
    this.loadCalls += 1;

    if (this.throwOnLoad) {
      throw new Error("item completion snapshot load failed");
    }

    return cloneItemCompletionSnapshot(this.snapshotValue);
  }

  async completeExecutionItemAtomically(
    command: DeploymentActivationExecutionAtomicItemCompletionCommand,
  ): Promise<DeploymentActivationExecutionAtomicItemCompletionResult> {
    this.atomicCalls.push({ ...command });

    if (this.throwOnAtomic) {
      throw new Error("atomic item completion failed");
    }

    return { ...this.atomicResultValue };
  }
}

function snapshot(
  input: Parameters<typeof buildItemCompletionSnapshot>[0] = {},
): DeploymentActivationExecutionItemCompletionSnapshot {
  return buildItemCompletionSnapshot({
    session: {
      clinicId: CLINIC_ID,
      deploymentRunId: DEPLOYMENT_RUN_ID,
      sessionId: SESSION_ID,
      executionKey: EXECUTION_KEY,
      executionOwner: CLAIMANT_ID,
      ownershipToken: OWNERSHIP_TOKEN,
      leaseExpiresAt: ACTIVE_LEASE,
      ...input.session,
    },
    item: input.item === null
      ? null
      : {
          itemId: ITEM_ID,
          sessionId: SESSION_ID,
          executionItemKey: EXECUTION_ITEM_KEY,
          planItemKey: PLAN_ITEM_KEY,
          entityId: CLINIC_ID,
          startedAt: STARTED_AT,
          ...input.item,
        },
    clinic: input.clinic,
    aggregate: input.aggregate,
  });
}

function claim(input: Partial<ServerDeploymentActivationExecutionClaimResult> = {}): ServerDeploymentActivationExecutionClaimResult {
  return {
    ok: true,
    status: "claimed",
    sessionId: SESSION_ID,
    executionKey: EXECUTION_KEY,
    planKey: PLAN_KEY,
    claimantId: CLAIMANT_ID,
    persistedOwnerId: CLAIMANT_ID,
    leaseExpiresAt: ACTIVE_LEASE,
    claimMode: "fresh",
    ownershipResult: "claimed",
    sessionClaimed: 1,
    sessionReused: 0,
    sessionReclaimed: 0,
    conflicts: 0,
    blockers: 0,
    warnings: 0,
    issues: [],
    downstream: {
      sessionsClaimed: 0,
      sessionsStarted: 0,
      itemsClaimed: 0,
      itemsStarted: 0,
      itemsSucceeded: 0,
      itemsFailed: 0,
      itemsRolledBack: 0,
      entitiesActivated: 0,
      bindingsWritten: 0,
      deploymentRunsFinalized: 0,
    },
    message: "Execution session was claimed.",
    ...input,
  };
}

function clinicActivation(input: Partial<ServerDeploymentClinicActivationResult> = {}): ServerDeploymentClinicActivationResult {
  return {
    ok: true,
    status: "activated",
    claimantId: CLAIMANT_ID,
    clinicId: CLINIC_ID,
    deploymentRunId: DEPLOYMENT_RUN_ID,
    sessionId: SESSION_ID,
    executionKey: EXECUTION_KEY,
    itemId: ITEM_ID,
    executionItemKey: EXECUTION_ITEM_KEY,
    planItemKey: PLAN_ITEM_KEY,
    currentClinicState: { clinicId: CLINIC_ID, deploymentStatus: "draft" },
    targetClinicState: { clinicId: CLINIC_ID, deploymentStatus: "deployed" },
    deployedAt: CLINIC_ACTIVATED_AT,
    activationResult: "activated",
    activatedCount: 1,
    reusedCount: 0,
    conflicts: 0,
    blockers: 0,
    warnings: 0,
    issues: [],
    downstream: {
      clinicsActivated: 0,
      itemsSucceeded: 0,
      dependenciesUnlocked: 0,
      providersActivated: 0,
      sterilizersActivated: 0,
      workstationsActivated: 0,
      hardwareActivated: 0,
      bindingsWritten: 0,
      deploymentFinalized: 0,
    },
    message: "Clinic activation completed.",
    ...input,
  };
}

function atomicResult(input: Partial<DeploymentActivationExecutionAtomicItemCompletionResult> = {}): DeploymentActivationExecutionAtomicItemCompletionResult {
  return {
    ok: true,
    status: "completed",
    claimantId: CLAIMANT_ID,
    clinicId: CLINIC_ID,
    deploymentRunId: DEPLOYMENT_RUN_ID,
    sessionId: SESSION_ID,
    executionKey: EXECUTION_KEY,
    itemId: ITEM_ID,
    executionItemKey: EXECUTION_ITEM_KEY,
    planItemKey: PLAN_ITEM_KEY,
    sequence: 1,
    entityType: "clinic",
    action: "activate",
    startedAt: STARTED_AT,
    completedAt: COMPLETED_AT,
    attemptCount: 1,
    executionStatusBefore: "running",
    executionStatusAfter: "succeeded",
    issueCode: null,
    message: "Activation execution item was completed. Dependency progression was not attempted.",
    ...input,
  };
}

function redact(value: unknown): unknown {
  return JSON.parse(
    JSON.stringify(value, (key, entry) => {
      if (key === "ownershipToken") {
        return "[redacted]";
      }

      return entry;
    }),
  );
}

function expectScenario(
  name: string,
  passed: boolean,
  message: string,
): DeploymentActivationExecutionItemCompletionServerHarnessScenario {
  return { name, passed, message };
}