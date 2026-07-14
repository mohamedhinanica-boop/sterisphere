import {
  SETUP_RUNTIME_ACTIVATION_EXECUTION_CLAIMANT_ID,
  type ServerDeploymentActivationExecutionClaimResult,
} from "./deployment-activation-execution-claim-server";
import {
  startActivationExecutionWithRepository,
  type DeploymentActivationExecutionAtomicStartRepository,
  type ServerDeploymentActivationExecutionStartResult,
} from "./deployment-activation-execution-start-server";
import {
  buildStartSnapshot,
} from "./deployment-activation-execution-start-test-repository";
import type {
  DeploymentActivationExecutionAtomicStartCommand,
  DeploymentActivationExecutionAtomicStartResult,
  DeploymentActivationExecutionStartSnapshot,
} from "./deployment-activation-execution-start-types";

export interface DeploymentActivationExecutionStartServerHarnessScenario {
  name: string;
  passed: boolean;
  message: string;
}

export interface DeploymentActivationExecutionStartServerHarnessResult {
  passed: boolean;
  scenarios: readonly DeploymentActivationExecutionStartServerHarnessScenario[];
}

const CLINIC_ID = "clinic-start-0001";
const DEPLOYMENT_RUN_ID = "deployment-run-start-0001";
const SESSION_ID = "activation-execution-session-start-0001";
const EXECUTION_KEY = "activation-execution-deployment-run-start-0001";
const PLAN_KEY = "activation-plan-deployment-run-start-0001";
const CLAIMANT_ID = SETUP_RUNTIME_ACTIVATION_EXECUTION_CLAIMANT_ID;
const OWNERSHIP_TOKEN = "server-only-start-token";
const STARTED_AT = "2026-01-01T12:00:00.000Z";
const ORIGINAL_STARTED_AT = "2026-01-01T11:58:00.000Z";
const ACTIVE_LEASE = "2026-01-01T12:05:00.000Z";
const EXPIRED_LEASE = "2026-01-01T11:55:00.000Z";

export async function runDeploymentActivationExecutionStartServerHarness(): Promise<DeploymentActivationExecutionStartServerHarnessResult> {
  const scenarios = [
    await scenarioFreshClaimedSessionStarts(),
    await scenarioSameOwnerRunningAlreadyStarted(),
    await scenarioSameOwnerRunningOneItemAlreadyStarted(),
    await scenarioReclaimedClaimCanStart(),
    await scenarioBlockedClaimSkipsStart(),
    await scenarioClaimConflictSkipsStart(),
    await scenarioClaimErrorSkipsStart(),
    await scenarioStartAssessmentBlocker(),
    await scenarioOwnershipConflict(),
    await scenarioExpiredLease(),
    await scenarioMalformedLease(),
    await scenarioRepositoryLoadFailure(),
    await scenarioAtomicRpcFailure(),
    await scenarioMalformedAtomicResponse(),
    await scenarioDeterministicClaimant(),
    await scenarioDeterministicRequestMapping(),
    await scenarioTokenAvailableInternally(),
    await scenarioTokenAbsentFromPublicEvidence(),
    await scenarioSourceEvidenceImmutable(),
    await scenarioNoItemMutationMethodsCalled(),
    await scenarioNoAutomaticRetries(),
    await scenarioDownstreamCountersRemainZero(),
    await scenarioAlreadyStartedPreservesTimestampAndLease(),
  ];

  return {
    passed: scenarios.every((scenario) => scenario.passed),
    scenarios,
  };
}

async function scenarioFreshClaimedSessionStarts(): Promise<DeploymentActivationExecutionStartServerHarnessScenario> {
  const repository = new FakeAtomicStartRepository({ snapshot: snapshot() });
  const result = await start(repository, claim("claimed"));

  return expectScenario(
    "fresh claimed session starts",
    result.ok &&
      result.status === "started" &&
      result.startedCount === 1 &&
      result.reusedCount === 0 &&
      result.startedAt === STARTED_AT &&
      repository.atomicCalls.length === 1,
    JSON.stringify({ result, calls: repository.calls }),
  );
}

async function scenarioSameOwnerRunningAlreadyStarted(): Promise<DeploymentActivationExecutionStartServerHarnessScenario> {
  const repository = new FakeAtomicStartRepository({
    snapshot: snapshot({
      session: {
        executionStatus: "running",
        startedAt: ORIGINAL_STARTED_AT,
      },
    }),
  });
  const result = await start(repository, claim("already_owned"));

  return expectScenario(
    "same-owner running session returns already-started",
    result.ok &&
      result.status === "already_started" &&
      result.reusedCount === 1 &&
      result.startedAt === ORIGINAL_STARTED_AT &&
      repository.atomicCalls.length === 0,
    JSON.stringify({ result, calls: repository.calls }),
  );
}

async function scenarioSameOwnerRunningOneItemAlreadyStarted(): Promise<DeploymentActivationExecutionStartServerHarnessScenario> {
  const repository = new FakeAtomicStartRepository({
    snapshot: snapshot({
      session: {
        executionStatus: "running",
        startedAt: ORIGINAL_STARTED_AT,
      },
      itemIntegrity: runningOneItemIntegrity(),
    }),
  });
  const result = await start(repository, claim("already_owned"));

  return expectScenario(
    "same-owner running session with one item returns already-started",
    result.ok &&
      result.status === "already_started" &&
      result.reusedCount === 1 &&
      result.startedAt === ORIGINAL_STARTED_AT &&
      result.leaseExpiresAt === ACTIVE_LEASE &&
      repository.atomicCalls.length === 0 &&
      repository.calls.itemMutations === 0 &&
      !JSON.stringify(result).includes(OWNERSHIP_TOKEN),
    JSON.stringify({ result, calls: repository.calls }),
  );
}
async function scenarioReclaimedClaimCanStart(): Promise<DeploymentActivationExecutionStartServerHarnessScenario> {
  const repository = new FakeAtomicStartRepository({ snapshot: snapshot() });
  const result = await start(repository, claim("reclaimed"));

  return expectScenario(
    "reclaimed claim can start",
    result.ok && result.status === "started" && repository.atomicCalls.length === 1,
    JSON.stringify(result),
  );
}

async function scenarioBlockedClaimSkipsStart(): Promise<DeploymentActivationExecutionStartServerHarnessScenario> {
  return expectSkippedClaim("blocked claim skips start", claim("blocked"));
}

async function scenarioClaimConflictSkipsStart(): Promise<DeploymentActivationExecutionStartServerHarnessScenario> {
  return expectSkippedClaim("claim conflict skips start", claim("conflict"));
}

async function scenarioClaimErrorSkipsStart(): Promise<DeploymentActivationExecutionStartServerHarnessScenario> {
  return expectSkippedClaim("claim error skips start", claim("error"));
}

async function expectSkippedClaim(
  name: string,
  claimResult: ServerDeploymentActivationExecutionClaimResult,
): Promise<DeploymentActivationExecutionStartServerHarnessScenario> {
  const repository = new FakeAtomicStartRepository({ snapshot: snapshot() });
  const result = await start(repository, claimResult);

  return expectScenario(
    name,
    result.status === "not_attempted" &&
      repository.calls.loadExecutionStartSnapshot === 0 &&
      repository.atomicCalls.length === 0,
    JSON.stringify(result),
  );
}

async function scenarioStartAssessmentBlocker(): Promise<DeploymentActivationExecutionStartServerHarnessScenario> {
  const repository = new FakeAtomicStartRepository({
    snapshot: snapshot({ itemIntegrity: { attemptedItemCount: 1 } }),
  });
  const result = await start(repository, claim("claimed"));

  return expectScenario(
    "start assessment blocker",
    result.status === "blocked" &&
      result.blockers > 0 &&
      result.issues.some((issue) => issue.code === "attempt_evidence_present") &&
      repository.atomicCalls.length === 0,
    JSON.stringify(result),
  );
}

async function scenarioOwnershipConflict(): Promise<DeploymentActivationExecutionStartServerHarnessScenario> {
  const repository = new FakeAtomicStartRepository({
    snapshot: snapshot({ session: { executionOwner: "other-executor" } }),
  });
  const result = await start(repository, claim("claimed"));

  return expectScenario(
    "ownership conflict",
    result.status === "conflict" &&
      result.conflicts === 1 &&
      repository.atomicCalls.length === 0,
    JSON.stringify(result),
  );
}

async function scenarioExpiredLease(): Promise<DeploymentActivationExecutionStartServerHarnessScenario> {
  const repository = new FakeAtomicStartRepository({
    snapshot: snapshot({ session: { leaseExpiresAt: EXPIRED_LEASE } }),
  });
  const result = await start(repository, claim("claimed", { leaseExpiresAt: EXPIRED_LEASE }));

  return expectScenario(
    "expired lease blocks start without reclaim",
    result.status === "blocked" &&
      result.issues.some((issue) => issue.code === "lease_expired") &&
      repository.atomicCalls.length === 0,
    JSON.stringify(result),
  );
}

async function scenarioMalformedLease(): Promise<DeploymentActivationExecutionStartServerHarnessScenario> {
  const repository = new FakeAtomicStartRepository({
    snapshot: snapshot({ session: { leaseExpiresAt: "not-a-date" } }),
  });
  const result = await start(repository, claim("claimed", { leaseExpiresAt: "not-a-date" }));

  return expectScenario(
    "malformed lease blocks start",
    result.status === "blocked" &&
      result.issues.some((issue) => issue.code === "lease_timestamp_malformed"),
    JSON.stringify(result),
  );
}

async function scenarioRepositoryLoadFailure(): Promise<DeploymentActivationExecutionStartServerHarnessScenario> {
  const repository = new FakeAtomicStartRepository({ shouldThrowOnLoad: true });
  const result = await start(repository, claim("claimed"));

  return expectScenario(
    "repository load failure returns safe error",
    result.status === "error" &&
      result.blockers === 1 &&
      repository.atomicCalls.length === 0,
    JSON.stringify(result),
  );
}

async function scenarioAtomicRpcFailure(): Promise<DeploymentActivationExecutionStartServerHarnessScenario> {
  const repository = new FakeAtomicStartRepository({ shouldThrowOnAtomic: true, snapshot: snapshot() });
  const result = await start(repository, claim("claimed"));

  return expectScenario(
    "atomic RPC failure returns safe error",
    result.status === "error" && repository.atomicCalls.length === 1,
    JSON.stringify(result),
  );
}

async function scenarioMalformedAtomicResponse(): Promise<DeploymentActivationExecutionStartServerHarnessScenario> {
  const repository = new FakeAtomicStartRepository({
    snapshot: snapshot(),
    atomicResult: atomicResult({ status: "error", issueCode: "malformed_rpc_response", message: "Safe malformed RPC response." }),
  });
  const result = await start(repository, claim("claimed"));

  return expectScenario(
    "malformed atomic response becomes error evidence",
    result.status === "error" && result.startResult === "error",
    JSON.stringify(result),
  );
}

async function scenarioDeterministicClaimant(): Promise<DeploymentActivationExecutionStartServerHarnessScenario> {
  const repository = new FakeAtomicStartRepository({ snapshot: snapshot() });
  const result = await start(repository, claim("claimed"));

  return expectScenario(
    "deterministic claimant",
    result.claimantId === SETUP_RUNTIME_ACTIVATION_EXECUTION_CLAIMANT_ID &&
      repository.atomicCalls[0]?.claimantId === SETUP_RUNTIME_ACTIVATION_EXECUTION_CLAIMANT_ID,
    JSON.stringify(result),
  );
}

async function scenarioDeterministicRequestMapping(): Promise<DeploymentActivationExecutionStartServerHarnessScenario> {
  const firstRepository = new FakeAtomicStartRepository({ snapshot: snapshot() });
  const secondRepository = new FakeAtomicStartRepository({ snapshot: snapshot() });
  await start(firstRepository, claim("claimed"));
  await start(secondRepository, claim("claimed"));

  return expectScenario(
    "deterministic request mapping",
    JSON.stringify(firstRepository.atomicCalls[0]) === JSON.stringify(secondRepository.atomicCalls[0]),
    JSON.stringify({ first: firstRepository.atomicCalls[0], second: secondRepository.atomicCalls[0] }),
  );
}

async function scenarioTokenAvailableInternally(): Promise<DeploymentActivationExecutionStartServerHarnessScenario> {
  const repository = new FakeAtomicStartRepository({ snapshot: snapshot() });
  await start(repository, claim("claimed"));

  return expectScenario(
    "token remains available internally for RPC",
    repository.atomicCalls[0]?.ownershipToken === OWNERSHIP_TOKEN,
    JSON.stringify({ payload: redacted(repository.atomicCalls[0]) }),
  );
}

async function scenarioTokenAbsentFromPublicEvidence(): Promise<DeploymentActivationExecutionStartServerHarnessScenario> {
  const repository = new FakeAtomicStartRepository({ snapshot: snapshot() });
  const result = await start(repository, claim("claimed"));
  const serialized = JSON.stringify(result);

  return expectScenario(
    "token absent from public evidence and messages",
    !serialized.includes(OWNERSHIP_TOKEN) &&
      result.issues.every((issue) => !issue.message.includes(OWNERSHIP_TOKEN)) &&
      !result.message.includes(OWNERSHIP_TOKEN),
    serialized,
  );
}

async function scenarioSourceEvidenceImmutable(): Promise<DeploymentActivationExecutionStartServerHarnessScenario> {
  const source = snapshot();
  const before = JSON.stringify(source);
  const repository = new FakeAtomicStartRepository({ snapshot: source });
  await start(repository, claim("claimed"));

  return expectScenario(
    "source evidence remains immutable",
    JSON.stringify(source) === before,
    JSON.stringify(source),
  );
}

async function scenarioNoItemMutationMethodsCalled(): Promise<DeploymentActivationExecutionStartServerHarnessScenario> {
  const repository = new FakeAtomicStartRepository({ snapshot: snapshot() });
  await start(repository, claim("claimed"));

  return expectScenario(
    "no item mutation methods called",
    repository.calls.itemMutations === 0,
    JSON.stringify(repository.calls),
  );
}

async function scenarioNoAutomaticRetries(): Promise<DeploymentActivationExecutionStartServerHarnessScenario> {
  const repository = new FakeAtomicStartRepository({ shouldThrowOnAtomic: true, snapshot: snapshot() });
  await start(repository, claim("claimed"));

  return expectScenario(
    "no automatic retries",
    repository.atomicCalls.length === 1,
    JSON.stringify(repository.atomicCalls),
  );
}

async function scenarioDownstreamCountersRemainZero(): Promise<DeploymentActivationExecutionStartServerHarnessScenario> {
  const repository = new FakeAtomicStartRepository({ snapshot: snapshot() });
  const result = await start(repository, claim("claimed"));

  return expectScenario(
    "downstream counters remain zero",
    result.downstream.sessionsStarted === 0 &&
      result.downstream.itemsStarted === 0 &&
      result.downstream.itemsSucceeded === 0 &&
      result.downstream.itemsFailed === 0 &&
      result.downstream.itemsRolledBack === 0 &&
      result.downstream.entitiesActivated === 0 &&
      result.downstream.bindingsWritten === 0 &&
      result.downstream.deploymentRunsFinalized === 0 &&
      result.downstream.rollbacksExecuted === 0,
    JSON.stringify(result.downstream),
  );
}

async function scenarioAlreadyStartedPreservesTimestampAndLease(): Promise<DeploymentActivationExecutionStartServerHarnessScenario> {
  const repository = new FakeAtomicStartRepository({
    snapshot: snapshot({
      session: {
        executionStatus: "running",
        startedAt: ORIGINAL_STARTED_AT,
        leaseExpiresAt: ACTIVE_LEASE,
      },
    }),
  });
  const result = await start(repository, claim("already_owned"));

  return expectScenario(
    "already-started preserves original timestamp and lease",
    result.status === "already_started" &&
      result.startedAt === ORIGINAL_STARTED_AT &&
      result.leaseExpiresAt === ACTIVE_LEASE,
    JSON.stringify(result),
  );
}

async function start(
  repository: FakeAtomicStartRepository,
  claimResult: ServerDeploymentActivationExecutionClaimResult,
): Promise<ServerDeploymentActivationExecutionStartResult> {
  return startActivationExecutionWithRepository(
    repository,
    {
      clinicId: CLINIC_ID,
      deploymentRunId: DEPLOYMENT_RUN_ID,
      deploymentActivationExecutionClaim: claimResult,
      startRequestedAt: STARTED_AT,
    },
    {
      ownershipTokenResolver: () => OWNERSHIP_TOKEN,
    },
  );
}

function claim(
  status: ServerDeploymentActivationExecutionClaimResult["status"],
  input: Partial<ServerDeploymentActivationExecutionClaimResult> = {},
): ServerDeploymentActivationExecutionClaimResult {
  const ok = ["claimed", "already_owned", "reclaimed"].includes(status);

  return {
    ok,
    status,
    sessionId: SESSION_ID,
    executionKey: EXECUTION_KEY,
    planKey: PLAN_KEY,
    claimantId: CLAIMANT_ID,
    persistedOwnerId: ok ? CLAIMANT_ID : null,
    leaseExpiresAt: ACTIVE_LEASE,
    claimMode: status === "already_owned" ? "same_owner" : status === "reclaimed" ? "expired_reclaim" : status === "claimed" ? "fresh" : null,
    ownershipResult: status === "claimed" || status === "already_owned" || status === "reclaimed" ? status : status === "not_attempted" ? null : status,
    sessionClaimed: status === "claimed" ? 1 : 0,
    sessionReused: status === "already_owned" ? 1 : 0,
    sessionReclaimed: status === "reclaimed" ? 1 : 0,
    conflicts: status === "conflict" ? 1 : 0,
    blockers: ok ? 0 : 1,
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
    message: "Claim evidence for start server harness.",
    ...input,
  };
}

function snapshot(
  input: Parameters<typeof buildStartSnapshot>[0] = {},
): DeploymentActivationExecutionStartSnapshot {
  return buildStartSnapshot({
    session: {
      clinicId: CLINIC_ID,
      deploymentRunId: DEPLOYMENT_RUN_ID,
      id: SESSION_ID,
      executionKey: EXECUTION_KEY,
      planKey: PLAN_KEY,
      executionOwner: CLAIMANT_ID,
      ownershipToken: OWNERSHIP_TOKEN,
      leaseExpiresAt: ACTIVE_LEASE,
      ...input.session,
    },
    itemIntegrity: input.itemIntegrity,
  });
}

function runningOneItemIntegrity(): NonNullable<Parameters<typeof buildStartSnapshot>[0]["itemIntegrity"]> {
  return {
    readyItemCount: 0,
    pendingItemCount: 2,
    runningItemCount: 1,
    terminalItemCount: 0,
    invalidStatusCount: 1,
    runningItemsWithAttemptOne: 1,
    runningItemsWithValidStartedAt: 1,
    runningItemsWithCompletionEvidence: 0,
    pendingItemsWithAttempts: 0,
    pendingItemsWithExecutionTimestamps: 0,
    pendingItemsWithRollbackTimestamps: 0,
    pendingItemsWithErrors: 0,
    attemptedItemCount: 1,
    itemExecutionTimestampCount: 1,
    rollbackTimestampCount: 0,
    errorEvidenceCount: 0,
    readyRootCount: 0,
    pendingRootCount: 0,
    malformedDependencyCount: 0,
    firstSequence: 1,
    firstItemStatus: "running",
  };
}
function atomicResult(
  input: Partial<DeploymentActivationExecutionAtomicStartResult> = {},
): DeploymentActivationExecutionAtomicStartResult {
  return {
    ok: true,
    status: "started",
    sessionId: SESSION_ID,
    executionKey: EXECUTION_KEY,
    owner: CLAIMANT_ID,
    leaseExpiresAt: ACTIVE_LEASE,
    executionStatus: "running",
    startedAt: STARTED_AT,
    itemCount: 3,
    issueCode: null,
    message: "Activation execution session was started. No execution items were started.",
    ...input,
  };
}

class FakeAtomicStartRepository implements DeploymentActivationExecutionAtomicStartRepository {
  readonly calls = {
    loadExecutionStartSnapshot: 0,
    atomicStart: 0,
    itemMutations: 0,
  };
  readonly atomicCalls: DeploymentActivationExecutionAtomicStartCommand[] = [];
  private readonly snapshotValue: DeploymentActivationExecutionStartSnapshot;
  private readonly atomicResultValue: DeploymentActivationExecutionAtomicStartResult;
  private readonly shouldThrowOnLoad: boolean;
  private readonly shouldThrowOnAtomic: boolean;

  constructor(input: {
    snapshot?: DeploymentActivationExecutionStartSnapshot;
    atomicResult?: DeploymentActivationExecutionAtomicStartResult;
    shouldThrowOnLoad?: boolean;
    shouldThrowOnAtomic?: boolean;
  } = {}) {
    this.snapshotValue = input.snapshot ?? snapshot();
    this.atomicResultValue = input.atomicResult ?? atomicResult();
    this.shouldThrowOnLoad = input.shouldThrowOnLoad ?? false;
    this.shouldThrowOnAtomic = input.shouldThrowOnAtomic ?? false;
  }

  async loadExecutionStartSnapshot(): Promise<DeploymentActivationExecutionStartSnapshot> {
    this.calls.loadExecutionStartSnapshot += 1;

    if (this.shouldThrowOnLoad) {
      throw new Error("load failed");
    }

    return JSON.parse(JSON.stringify(this.snapshotValue)) as DeploymentActivationExecutionStartSnapshot;
  }

  async startClaimedExecutionSessionAtomically(
    command: DeploymentActivationExecutionAtomicStartCommand,
  ): Promise<DeploymentActivationExecutionAtomicStartResult> {
    this.calls.atomicStart += 1;
    this.atomicCalls.push({ ...command });

    if (this.shouldThrowOnAtomic) {
      throw new Error("atomic start failed");
    }

    return { ...this.atomicResultValue };
  }
}

function redacted(
  command: DeploymentActivationExecutionAtomicStartCommand | undefined,
): Record<string, unknown> | null {
  return command ? { ...command, ownershipToken: "[redacted]" } : null;
}

function expectScenario(
  name: string,
  passed: boolean,
  message: string,
): DeploymentActivationExecutionStartServerHarnessScenario {
  return { name, passed, message };
}
