import {
  SETUP_RUNTIME_ACTIVATION_EXECUTION_CLAIMANT_ID,
  type ServerDeploymentActivationExecutionClaimResult,
} from "./deployment-activation-execution-claim-server";
import {
  startActivationExecutionItemWithRepository,
  type DeploymentActivationExecutionAtomicItemStartRepository,
  type ServerDeploymentActivationExecutionItemStartResult,
} from "./deployment-activation-execution-item-start-server";
import {
  buildItemStartSnapshot,
} from "./deployment-activation-execution-item-start-test-repository";
import type {
  DeploymentActivationExecutionAtomicItemStartCommand,
  DeploymentActivationExecutionAtomicItemStartResult,
  DeploymentActivationExecutionItemStartSnapshot,
} from "./deployment-activation-execution-item-start-types";
import type {
  ServerDeploymentActivationExecutionStartResult,
} from "./deployment-activation-execution-start-server";

export interface DeploymentActivationExecutionItemStartServerHarnessScenario {
  name: string;
  passed: boolean;
  message: string;
}

export interface DeploymentActivationExecutionItemStartServerHarnessResult {
  passed: boolean;
  scenarios: readonly DeploymentActivationExecutionItemStartServerHarnessScenario[];
}

const CLINIC_ID = "clinic-item-start-server-0001";
const DEPLOYMENT_RUN_ID = "deployment-run-item-start-server-0001";
const SESSION_ID = "activation-execution-session-item-start-server-0001";
const EXECUTION_KEY = "activation-execution-deployment-run-item-start-server-0001";
const PLAN_KEY = "activation-plan-deployment-run-item-start-server-0001";
const ITEM_ID = "activation-execution-item-start-server-0001";
const EXECUTION_ITEM_KEY = `${EXECUTION_KEY}:${PLAN_KEY}:clinic`;
const PLAN_ITEM_KEY = `${PLAN_KEY}:clinic`;
const CLAIMANT_ID = SETUP_RUNTIME_ACTIVATION_EXECUTION_CLAIMANT_ID;
const OWNERSHIP_TOKEN = "server-only-item-start-token";
const WRONG_TOKEN = "wrong-server-only-item-start-token";
const SESSION_STARTED_AT = "2026-01-01T11:59:00.000Z";
const ITEM_STARTED_AT = "2026-01-01T12:00:00.000Z";
const ALREADY_STARTED_AT = "2026-01-01T11:59:30.000Z";
const ACTIVE_LEASE = "2026-01-01T12:05:00.000Z";
const EXPIRED_LEASE = "2026-01-01T11:55:00.000Z";

export async function runDeploymentActivationExecutionItemStartServerHarness(): Promise<DeploymentActivationExecutionItemStartServerHarnessResult> {
  const scenarios = [
    await scenarioFreshStartableItemBecomesStarted(),
    await scenarioAlreadyRunningItemReturnsAlreadyStarted(),
    await scenarioSuccessfulSessionStartRequired(),
    await scenarioSkippedSessionStartReturnsNotAttempted(),
    await scenarioBlockedSessionStartReturnsNotAttempted(),
    await scenarioConflictedSessionStartReturnsNotAttempted(),
    await scenarioErroredSessionStartReturnsNotAttempted(),
    await scenarioAssessmentBlocked(),
    await scenarioAssessmentConflict(),
    await scenarioItemNotFound(),
    await scenarioExpiredLeaseBlocks(),
    await scenarioMalformedLeaseBlocks(),
    await scenarioOwnerMismatchBlocks(),
    await scenarioTokenMismatchBlocks(),
    await scenarioRepositorySnapshotFailure(),
    await scenarioAtomicRpcFailure(),
    await scenarioMalformedAtomicResult(),
    await scenarioDeterministicAssessmentAndStartTimestamp(),
    await scenarioStartedEvidenceMapping(),
    await scenarioAlreadyStartedEvidenceMapping(),
    await scenarioCandidateIdentityPreserved(),
    await scenarioAttemptCountMapping(),
    await scenarioLeasePreserved(),
    await scenarioTokenRedactedFromResult(),
    await scenarioTokenRedactedFromMessagesAndIssues(),
    await scenarioTokenRedactedFromSerializedJson(),
    await scenarioNoAutomaticRetries(),
    await scenarioNoDirectUpdateUpsertFallback(),
    await scenarioNoSessionMutationCalls(),
    await scenarioNoDependentItemMutationCalls(),
    await scenarioNoActivationExecutorCalls(),
    await scenarioSourceEvidenceImmutable(),
    await scenarioDownstreamCountersRemainZero(),
  ];

  return {
    passed: scenarios.every((scenario) => scenario.passed),
    scenarios,
  };
}

async function scenarioFreshStartableItemBecomesStarted(): Promise<DeploymentActivationExecutionItemStartServerHarnessScenario> {
  const repository = new FakeAtomicItemStartRepository({ snapshot: snapshot() });
  const result = await start(repository);

  return expectScenario(
    "fresh startable item becomes started",
    result.ok &&
      result.status === "started" &&
      result.startedCount === 1 &&
      result.reusedCount === 0 &&
      result.itemExecutionStatus === "running" &&
      result.startedAt === ITEM_STARTED_AT &&
      repository.atomicCalls.length === 1,
    JSON.stringify({ result, calls: repository.calls }),
  );
}

async function scenarioAlreadyRunningItemReturnsAlreadyStarted(): Promise<DeploymentActivationExecutionItemStartServerHarnessScenario> {
  const repository = new FakeAtomicItemStartRepository({ snapshot: runningSnapshot() });
  const result = await start(repository, claim(), sessionStart("already_started"));

  return expectScenario(
    "already-running item returns already-started",
    result.ok &&
      result.status === "already_started" &&
      result.reusedCount === 1 &&
      result.attemptCount === 1 &&
      result.startedAt === ALREADY_STARTED_AT &&
      repository.atomicCalls.length === 0,
    JSON.stringify({ result, calls: repository.calls }),
  );
}

async function scenarioSuccessfulSessionStartRequired(): Promise<DeploymentActivationExecutionItemStartServerHarnessScenario> {
  const repository = new FakeAtomicItemStartRepository({ snapshot: snapshot() });
  await start(repository, claim(), sessionStart("started"));

  return expectScenario(
    "successful session start is required",
    repository.calls.loadExecutionItemStartSnapshot === 1 && repository.atomicCalls.length === 1,
    JSON.stringify(repository.calls),
  );
}

async function scenarioSkippedSessionStartReturnsNotAttempted(): Promise<DeploymentActivationExecutionItemStartServerHarnessScenario> {
  return expectSkippedStart("skipped session start returns not-attempted", sessionStart("not_attempted"));
}

async function scenarioBlockedSessionStartReturnsNotAttempted(): Promise<DeploymentActivationExecutionItemStartServerHarnessScenario> {
  return expectSkippedStart("blocked session start returns not-attempted", sessionStart("blocked"));
}

async function scenarioConflictedSessionStartReturnsNotAttempted(): Promise<DeploymentActivationExecutionItemStartServerHarnessScenario> {
  return expectSkippedStart("conflicted session start returns not-attempted", sessionStart("conflict"));
}

async function scenarioErroredSessionStartReturnsNotAttempted(): Promise<DeploymentActivationExecutionItemStartServerHarnessScenario> {
  return expectSkippedStart("errored session start returns not-attempted", sessionStart("error"));
}

async function expectSkippedStart(
  name: string,
  sessionStartResult: ServerDeploymentActivationExecutionStartResult,
): Promise<DeploymentActivationExecutionItemStartServerHarnessScenario> {
  const repository = new FakeAtomicItemStartRepository({ snapshot: snapshot() });
  const result = await start(repository, claim(), sessionStartResult);

  return expectScenario(
    name,
    result.status === "not_attempted" &&
      repository.calls.loadExecutionItemStartSnapshot === 0 &&
      repository.atomicCalls.length === 0,
    JSON.stringify({ result, calls: repository.calls }),
  );
}

async function scenarioAssessmentBlocked(): Promise<DeploymentActivationExecutionItemStartServerHarnessScenario> {
  const repository = new FakeAtomicItemStartRepository({
    snapshot: snapshot({ aggregate: { readyItemCount: 0, pendingItemCount: 3, firstExecutionStatus: "pending" } }),
  });
  const result = await start(repository);

  return expectScenario(
    "item assessment blocked",
    result.status === "blocked" &&
      result.blockers > 0 &&
      result.issues.some((issue) => issue.code === "no_ready_item") &&
      repository.atomicCalls.length === 0,
    JSON.stringify(result),
  );
}

async function scenarioAssessmentConflict(): Promise<DeploymentActivationExecutionItemStartServerHarnessScenario> {
  const repository = new FakeAtomicItemStartRepository({
    snapshot: snapshot({ session: { executionOwner: "other-executor" } }),
  });
  const result = await start(repository);

  return expectScenario(
    "item assessment conflict",
    result.status === "conflict" &&
      result.conflicts === 1 &&
      result.issues.some((issue) => issue.code === "session_owned_by_another_executor") &&
      repository.atomicCalls.length === 0,
    JSON.stringify(result),
  );
}

async function scenarioItemNotFound(): Promise<DeploymentActivationExecutionItemStartServerHarnessScenario> {
  const repository = new FakeAtomicItemStartRepository({ snapshot: snapshot({ candidateItem: null }) });
  const result = await start(repository);

  return expectScenario(
    "item not found",
    result.status === "not_found" &&
      result.issues.some((issue) => issue.code === "missing_candidate_item") &&
      repository.atomicCalls.length === 0,
    JSON.stringify(result),
  );
}

async function scenarioExpiredLeaseBlocks(): Promise<DeploymentActivationExecutionItemStartServerHarnessScenario> {
  const repository = new FakeAtomicItemStartRepository({ snapshot: snapshot({ session: { leaseExpiresAt: EXPIRED_LEASE } }) });
  const result = await start(repository, claim({ leaseExpiresAt: EXPIRED_LEASE }), sessionStart("started", { leaseExpiresAt: EXPIRED_LEASE }));

  return expectScenario(
    "expired lease blocks",
    result.status === "blocked" && result.issues.some((issue) => issue.code === "lease_expired"),
    JSON.stringify(result),
  );
}

async function scenarioMalformedLeaseBlocks(): Promise<DeploymentActivationExecutionItemStartServerHarnessScenario> {
  const repository = new FakeAtomicItemStartRepository({ snapshot: snapshot({ session: { leaseExpiresAt: "not-a-date" } }) });
  const result = await start(repository, claim({ leaseExpiresAt: "not-a-date" }), sessionStart("started", { leaseExpiresAt: "not-a-date" }));

  return expectScenario(
    "malformed lease blocks",
    result.status === "blocked" && result.issues.some((issue) => issue.code === "lease_timestamp_malformed"),
    JSON.stringify(result),
  );
}

async function scenarioOwnerMismatchBlocks(): Promise<DeploymentActivationExecutionItemStartServerHarnessScenario> {
  const repository = new FakeAtomicItemStartRepository({ snapshot: snapshot({ session: { executionOwner: "other-owner" } }) });
  const result = await start(repository);

  return expectScenario(
    "owner mismatch blocks",
    result.status === "conflict" && result.issues.some((issue) => issue.code === "session_owned_by_another_executor"),
    JSON.stringify(result),
  );
}

async function scenarioTokenMismatchBlocks(): Promise<DeploymentActivationExecutionItemStartServerHarnessScenario> {
  const repository = new FakeAtomicItemStartRepository({ snapshot: snapshot() });
  const result = await start(repository, claim(), sessionStart("started"), WRONG_TOKEN);

  return expectScenario(
    "token mismatch blocks",
    result.status === "conflict" &&
      result.issues.some((issue) => issue.code === "ownership_token_mismatch") &&
      !JSON.stringify(result).includes(WRONG_TOKEN),
    JSON.stringify(result),
  );
}

async function scenarioRepositorySnapshotFailure(): Promise<DeploymentActivationExecutionItemStartServerHarnessScenario> {
  const repository = new FakeAtomicItemStartRepository({ shouldThrowOnLoad: true });
  const result = await start(repository);

  return expectScenario(
    "repository snapshot failure",
    result.status === "error" && result.blockers === 1 && repository.atomicCalls.length === 0,
    JSON.stringify(result),
  );
}

async function scenarioAtomicRpcFailure(): Promise<DeploymentActivationExecutionItemStartServerHarnessScenario> {
  const repository = new FakeAtomicItemStartRepository({ shouldThrowOnAtomic: true, snapshot: snapshot() });
  const result = await start(repository);

  return expectScenario(
    "atomic RPC failure",
    result.status === "error" && repository.atomicCalls.length === 1,
    JSON.stringify(result),
  );
}

async function scenarioMalformedAtomicResult(): Promise<DeploymentActivationExecutionItemStartServerHarnessScenario> {
  const repository = new FakeAtomicItemStartRepository({
    snapshot: snapshot(),
    atomicResult: atomicResult({ status: "error", issueCode: "malformed_rpc_response", message: "Safe malformed RPC response." }),
  });
  const result = await start(repository);

  return expectScenario(
    "malformed atomic result",
    result.status === "error" && result.itemStartResult === "error",
    JSON.stringify(result),
  );
}

async function scenarioDeterministicAssessmentAndStartTimestamp(): Promise<DeploymentActivationExecutionItemStartServerHarnessScenario> {
  const repository = new FakeAtomicItemStartRepository({ snapshot: snapshot() });
  const result = await start(repository);

  return expectScenario(
    "deterministic assessment and start timestamp",
    repository.atomicCalls[0]?.proposedStartedAt === ITEM_STARTED_AT && result.startedAt === ITEM_STARTED_AT,
    JSON.stringify({ result, atomic: repository.atomicCalls[0] }),
  );
}

async function scenarioStartedEvidenceMapping(): Promise<DeploymentActivationExecutionItemStartServerHarnessScenario> {
  const repository = new FakeAtomicItemStartRepository({ snapshot: snapshot() });
  const result = await start(repository);

  return expectScenario(
    "started evidence mapping",
    result.status === "started" &&
      result.itemStartResult === "started" &&
      result.itemId === ITEM_ID &&
      result.executionItemKey === EXECUTION_ITEM_KEY,
    JSON.stringify(result),
  );
}

async function scenarioAlreadyStartedEvidenceMapping(): Promise<DeploymentActivationExecutionItemStartServerHarnessScenario> {
  const repository = new FakeAtomicItemStartRepository({ snapshot: runningSnapshot() });
  const result = await start(repository, claim(), sessionStart("already_started"));

  return expectScenario(
    "already-started evidence mapping",
    result.status === "already_started" &&
      result.itemStartResult === "already_started" &&
      result.reusedCount === 1 &&
      result.startedAt === ALREADY_STARTED_AT,
    JSON.stringify(result),
  );
}

async function scenarioCandidateIdentityPreserved(): Promise<DeploymentActivationExecutionItemStartServerHarnessScenario> {
  const repository = new FakeAtomicItemStartRepository({ snapshot: snapshot() });
  const result = await start(repository);

  return expectScenario(
    "candidate identity preserved",
    result.itemId === ITEM_ID &&
      result.planItemKey === PLAN_ITEM_KEY &&
      result.sequence === 1 &&
      result.entityType === "clinic" &&
      result.entityKey === CLINIC_ID,
    JSON.stringify(result),
  );
}

async function scenarioAttemptCountMapping(): Promise<DeploymentActivationExecutionItemStartServerHarnessScenario> {
  const repository = new FakeAtomicItemStartRepository({ snapshot: snapshot() });
  const result = await start(repository);

  return expectScenario(
    "attempt count mapping",
    result.attemptCount === 1 && repository.atomicCalls[0]?.expectedAttemptCount === 0,
    JSON.stringify({ result, atomic: repository.atomicCalls[0] }),
  );
}

async function scenarioLeasePreserved(): Promise<DeploymentActivationExecutionItemStartServerHarnessScenario> {
  const repository = new FakeAtomicItemStartRepository({ snapshot: snapshot() });
  const result = await start(repository);

  return expectScenario(
    "lease preserved",
    result.leaseExpiresAt === ACTIVE_LEASE && repository.atomicCalls[0]?.expectedLeaseExpiresAt === ACTIVE_LEASE,
    JSON.stringify({ result, atomic: repository.atomicCalls[0] }),
  );
}

async function scenarioTokenRedactedFromResult(): Promise<DeploymentActivationExecutionItemStartServerHarnessScenario> {
  const repository = new FakeAtomicItemStartRepository({ snapshot: snapshot() });
  const result = await start(repository);

  return expectScenario(
    "token redacted from result",
    !JSON.stringify(result).includes(OWNERSHIP_TOKEN),
    JSON.stringify(result),
  );
}

async function scenarioTokenRedactedFromMessagesAndIssues(): Promise<DeploymentActivationExecutionItemStartServerHarnessScenario> {
  const repository = new FakeAtomicItemStartRepository({ snapshot: snapshot() });
  const result = await start(repository, claim(), sessionStart("started"), WRONG_TOKEN);

  return expectScenario(
    "token redacted from messages and issues",
    !result.message.includes(WRONG_TOKEN) &&
      result.issues.every((issue) => !issue.message.includes(WRONG_TOKEN)),
    JSON.stringify(result),
  );
}

async function scenarioTokenRedactedFromSerializedJson(): Promise<DeploymentActivationExecutionItemStartServerHarnessScenario> {
  const repository = new FakeAtomicItemStartRepository({ snapshot: snapshot() });
  const result = await start(repository);

  return expectScenario(
    "token redacted from serialized JSON",
    !JSON.stringify(result).includes(OWNERSHIP_TOKEN),
    JSON.stringify(result),
  );
}

async function scenarioNoAutomaticRetries(): Promise<DeploymentActivationExecutionItemStartServerHarnessScenario> {
  const repository = new FakeAtomicItemStartRepository({ shouldThrowOnAtomic: true, snapshot: snapshot() });
  await start(repository);

  return expectScenario(
    "no automatic retries",
    repository.atomicCalls.length === 1,
    JSON.stringify(repository.atomicCalls),
  );
}

async function scenarioNoDirectUpdateUpsertFallback(): Promise<DeploymentActivationExecutionItemStartServerHarnessScenario> {
  const repository = new FakeAtomicItemStartRepository({ snapshot: snapshot() });
  await start(repository);

  return expectScenario(
    "no direct update/upsert fallback",
    repository.calls.directUpdate === 0 && repository.calls.directUpsert === 0,
    JSON.stringify(repository.calls),
  );
}

async function scenarioNoSessionMutationCalls(): Promise<DeploymentActivationExecutionItemStartServerHarnessScenario> {
  const repository = new FakeAtomicItemStartRepository({ snapshot: snapshot() });
  await start(repository);

  return expectScenario(
    "no session mutation calls",
    repository.calls.sessionMutation === 0,
    JSON.stringify(repository.calls),
  );
}

async function scenarioNoDependentItemMutationCalls(): Promise<DeploymentActivationExecutionItemStartServerHarnessScenario> {
  const repository = new FakeAtomicItemStartRepository({ snapshot: snapshot() });
  await start(repository);

  return expectScenario(
    "no dependent-item mutation calls",
    repository.calls.dependentItemMutation === 0,
    JSON.stringify(repository.calls),
  );
}

async function scenarioNoActivationExecutorCalls(): Promise<DeploymentActivationExecutionItemStartServerHarnessScenario> {
  const repository = new FakeAtomicItemStartRepository({ snapshot: snapshot() });
  await start(repository);

  return expectScenario(
    "no activation executor calls",
    repository.calls.activationExecutor === 0,
    JSON.stringify(repository.calls),
  );
}

async function scenarioSourceEvidenceImmutable(): Promise<DeploymentActivationExecutionItemStartServerHarnessScenario> {
  const source = snapshot();
  const before = JSON.stringify(source);
  const repository = new FakeAtomicItemStartRepository({ snapshot: source });
  await start(repository);

  return expectScenario(
    "source evidence immutable",
    JSON.stringify(source) === before,
    JSON.stringify(source),
  );
}

async function scenarioDownstreamCountersRemainZero(): Promise<DeploymentActivationExecutionItemStartServerHarnessScenario> {
  const repository = new FakeAtomicItemStartRepository({ snapshot: snapshot() });
  const result = await start(repository);

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

async function start(
  repository: FakeAtomicItemStartRepository,
  claimResult: ServerDeploymentActivationExecutionClaimResult = claim(),
  sessionStartResult: ServerDeploymentActivationExecutionStartResult = sessionStart("started"),
  token = OWNERSHIP_TOKEN,
): Promise<ServerDeploymentActivationExecutionItemStartResult> {
  return startActivationExecutionItemWithRepository(
    repository,
    {
      clinicId: CLINIC_ID,
      deploymentRunId: DEPLOYMENT_RUN_ID,
      deploymentActivationExecutionClaim: claimResult,
      deploymentActivationExecutionStart: sessionStartResult,
      itemStartRequestedAt: ITEM_STARTED_AT,
    },
    {
      ownershipTokenResolver: () => token,
    },
  );
}

function claim(
  input: Partial<ServerDeploymentActivationExecutionClaimResult> = {},
): ServerDeploymentActivationExecutionClaimResult {
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
    message: "Claim evidence for item-start server harness.",
    ...input,
  };
}

function sessionStart(
  status: ServerDeploymentActivationExecutionStartResult["status"],
  input: Partial<ServerDeploymentActivationExecutionStartResult> = {},
): ServerDeploymentActivationExecutionStartResult {
  const ok = status === "started" || status === "already_started";

  return {
    ok,
    status,
    sessionId: SESSION_ID,
    executionKey: EXECUTION_KEY,
    planKey: PLAN_KEY,
    claimantId: CLAIMANT_ID,
    startedAt: ok ? SESSION_STARTED_AT : null,
    leaseExpiresAt: ok ? ACTIVE_LEASE : null,
    startResult: ok ? status : null,
    startedCount: status === "started" ? 1 : 0,
    reusedCount: status === "already_started" ? 1 : 0,
    conflicts: status === "conflict" ? 1 : 0,
    blockers: ok ? 0 : 1,
    warnings: 0,
    issues: [],
    downstream: {
      sessionsStarted: 0,
      itemsStarted: 0,
      itemsSucceeded: 0,
      itemsFailed: 0,
      itemsRolledBack: 0,
      entitiesActivated: 0,
      bindingsWritten: 0,
      deploymentRunsFinalized: 0,
      rollbacksExecuted: 0,
    },
    message: "Execution-session start evidence for item-start server harness.",
    ...input,
  };
}

function snapshot(
  input: Parameters<typeof buildItemStartSnapshot>[0] = {},
): DeploymentActivationExecutionItemStartSnapshot {
  return buildItemStartSnapshot({
    session: {
      clinicId: CLINIC_ID,
      deploymentRunId: DEPLOYMENT_RUN_ID,
      sessionId: SESSION_ID,
      executionKey: EXECUTION_KEY,
      executionOwner: CLAIMANT_ID,
      ownershipToken: OWNERSHIP_TOKEN,
      leaseExpiresAt: ACTIVE_LEASE,
      startedAt: SESSION_STARTED_AT,
      ...input.session,
    },
    candidateItem: input.candidateItem === null
      ? null
      : {
          itemId: ITEM_ID,
          sessionId: SESSION_ID,
          executionItemKey: EXECUTION_ITEM_KEY,
          planItemKey: PLAN_ITEM_KEY,
          entityKey: CLINIC_ID,
          entityId: CLINIC_ID,
          ...input.candidateItem,
        },
    aggregate: input.aggregate,
  });
}

function runningSnapshot(): DeploymentActivationExecutionItemStartSnapshot {
  return snapshot({
    candidateItem: {
      executionStatus: "running",
      attemptCount: 1,
      startedAt: ALREADY_STARTED_AT,
    },
    aggregate: {
      readyItemCount: 0,
      pendingItemCount: 2,
      runningItemCount: 1,
      attemptedItemCount: 1,
      timestampedItemCount: 1,
      firstExecutionStatus: "running",
    },
  });
}

function atomicResult(
  input: Partial<DeploymentActivationExecutionAtomicItemStartResult> = {},
): DeploymentActivationExecutionAtomicItemStartResult {
  return {
    ok: true,
    status: "started",
    sessionId: SESSION_ID,
    executionKey: EXECUTION_KEY,
    itemId: ITEM_ID,
    executionItemKey: EXECUTION_ITEM_KEY,
    planItemKey: PLAN_ITEM_KEY,
    sequence: 1,
    action: "activate",
    entityType: "clinic",
    entityKey: CLINIC_ID,
    executionStatus: "running",
    attemptCount: 1,
    startedAt: ITEM_STARTED_AT,
    leaseExpiresAt: ACTIVE_LEASE,
    issueCode: null,
    message: "Execution item started. No activation action executed.",
    ...input,
  };
}

class FakeAtomicItemStartRepository implements DeploymentActivationExecutionAtomicItemStartRepository {
  readonly calls = {
    loadExecutionItemStartSnapshot: 0,
    atomicStart: 0,
    directUpdate: 0,
    directUpsert: 0,
    sessionMutation: 0,
    dependentItemMutation: 0,
    activationExecutor: 0,
  };
  readonly atomicCalls: DeploymentActivationExecutionAtomicItemStartCommand[] = [];
  private readonly snapshotValue: DeploymentActivationExecutionItemStartSnapshot;
  private readonly atomicResultValue: DeploymentActivationExecutionAtomicItemStartResult;
  private readonly shouldThrowOnLoad: boolean;
  private readonly shouldThrowOnAtomic: boolean;

  constructor(input: {
    snapshot?: DeploymentActivationExecutionItemStartSnapshot;
    atomicResult?: DeploymentActivationExecutionAtomicItemStartResult;
    shouldThrowOnLoad?: boolean;
    shouldThrowOnAtomic?: boolean;
  } = {}) {
    this.snapshotValue = input.snapshot ?? snapshot();
    this.atomicResultValue = input.atomicResult ?? atomicResult();
    this.shouldThrowOnLoad = input.shouldThrowOnLoad ?? false;
    this.shouldThrowOnAtomic = input.shouldThrowOnAtomic ?? false;
  }

  async loadExecutionItemStartSnapshot(): Promise<DeploymentActivationExecutionItemStartSnapshot> {
    this.calls.loadExecutionItemStartSnapshot += 1;

    if (this.shouldThrowOnLoad) {
      throw new Error("item-start snapshot load failed");
    }

    return JSON.parse(JSON.stringify(this.snapshotValue)) as DeploymentActivationExecutionItemStartSnapshot;
  }

  async startExecutionItemAtomically(
    command: DeploymentActivationExecutionAtomicItemStartCommand,
  ): Promise<DeploymentActivationExecutionAtomicItemStartResult> {
    this.calls.atomicStart += 1;
    this.atomicCalls.push({ ...command });

    if (this.shouldThrowOnAtomic) {
      throw new Error("atomic item start failed");
    }

    return { ...this.atomicResultValue };
  }
}

function expectScenario(
  name: string,
  passed: boolean,
  message: string,
): DeploymentActivationExecutionItemStartServerHarnessScenario {
  return { name, passed, message };
}