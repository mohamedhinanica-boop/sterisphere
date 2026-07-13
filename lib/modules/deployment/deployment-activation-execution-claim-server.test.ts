import {
  SETUP_RUNTIME_ACTIVATION_EXECUTION_CLAIMANT_ID,
  SETUP_RUNTIME_ACTIVATION_EXECUTION_LEASE_SECONDS,
  claimActivationExecutionWithRepository,
  type DeploymentActivationExecutionAtomicClaimRepository,
} from "./deployment-activation-execution-claim-server";
import {
  buildClaimSnapshot,
} from "./deployment-activation-execution-claim-test-repository";
import {
  cloneClaimItemCompleteness,
  cloneClaimSessionSnapshot,
  type DeploymentActivationExecutionAtomicClaimCommand,
  type DeploymentActivationExecutionAtomicClaimResult,
  type DeploymentActivationExecutionClaimSnapshot,
} from "./deployment-activation-execution-claim-types";
import type {
  ServerDeploymentActivationExecutionPersistenceResult,
} from "./deployment-activation-execution-persistence-server";

export interface DeploymentActivationExecutionClaimServerHarnessScenario {
  name: string;
  passed: boolean;
  message: string;
}

export interface DeploymentActivationExecutionClaimServerHarnessResult {
  passed: boolean;
  scenarios: readonly DeploymentActivationExecutionClaimServerHarnessScenario[];
}

const CLAIMED_AT = "2026-01-01T12:00:00.000Z";
const ACTIVE_LEASE = "2026-01-01T12:05:00.000Z";
const EXPIRED_LEASE = "2026-01-01T11:55:00.000Z";
const CLINIC_ID = "clinic-claim-0001";
const DEPLOYMENT_RUN_ID = "deployment-run-claim-0001";
const SESSION_ID = "activation-execution-session-0001";
const EXECUTION_KEY = "activation-execution-deployment-run-claim-0001";
const PLAN_KEY = "activation-plan-deployment-run-claim-0001";

export async function runDeploymentActivationExecutionClaimServerHarness(): Promise<DeploymentActivationExecutionClaimServerHarnessResult> {
  const scenarios = [
    await scenarioFreshClaim(),
    await scenarioSameOwnerReuse(),
    await scenarioSameOwnerReuseAfterPersistenceReuse(),
    await scenarioConflictingClaimant(),
    await scenarioExpiredReclaim(),
    await scenarioSkippedBlockedPersistence(),
    await scenarioSkippedIncompletePersistence(),
    await scenarioRepositoryError(),
    await scenarioMalformedAtomicResult(),
    await scenarioDeterministicClaimantAndLease(),
    await scenarioTokenNeverExposed(),
    await scenarioSourceImmutability(),
    await scenarioDownstreamCountersAndNoItemWrites(),
  ];

  return {
    passed: scenarios.every((scenario) => scenario.passed),
    scenarios,
  };
}

async function scenarioFreshClaim(): Promise<DeploymentActivationExecutionClaimServerHarnessScenario> {
  const repository = new InMemoryAtomicClaimRepository();
  const result = await claim(repository);

  return expectScenario(
    "fresh claim atomically owns prepared session",
    result.ok &&
      result.status === "claimed" &&
      result.claimMode === "fresh" &&
      result.sessionClaimed === 1 &&
      repository.snapshot.session?.executionOwner === SETUP_RUNTIME_ACTIVATION_EXECUTION_CLAIMANT_ID &&
      repository.snapshot.session?.ownershipToken === "secret-token-001" &&
      repository.snapshot.session?.leaseExpiresAt === ACTIVE_LEASE &&
      repository.snapshot.session?.startedAt === null,
    JSON.stringify({ result, snapshot: repository.snapshot.session }),
  );
}

async function scenarioSameOwnerReuse(): Promise<DeploymentActivationExecutionClaimServerHarnessScenario> {
  const repository = new InMemoryAtomicClaimRepository({
    snapshot: ownedSnapshot(SETUP_RUNTIME_ACTIVATION_EXECUTION_CLAIMANT_ID, ACTIVE_LEASE),
  });
  const result = await claim(repository, {
    tokenFactory: () => "replacement-token-that-must-not-be-used",
  });

  return expectScenario(
    "same-owner reuse preserves token and lease",
    result.ok &&
      result.status === "already_owned" &&
      result.claimMode === "same_owner" &&
      result.sessionReused === 1 &&
      repository.snapshot.session?.ownershipToken === "existing-secret-token" &&
      repository.snapshot.session?.leaseExpiresAt === ACTIVE_LEASE,
    JSON.stringify({ result, snapshot: repository.snapshot.session }),
  );
}

async function scenarioSameOwnerReuseAfterPersistenceReuse(): Promise<DeploymentActivationExecutionClaimServerHarnessScenario> {
  const repository = new InMemoryAtomicClaimRepository({
    snapshot: ownedSnapshot(SETUP_RUNTIME_ACTIVATION_EXECUTION_CLAIMANT_ID, ACTIVE_LEASE),
  });
  const result = await claim(repository, {
    persistence: persistence({
      status: "reused",
      sessionCreated: 0,
      sessionReused: 1,
      itemsCreated: 0,
      itemsReused: 3,
    }),
    tokenFactory: () => "replacement-token-that-must-not-be-used",
  });

  return expectScenario(
    "same-owner claim runs after persistence reuses claimed session",
    result.ok &&
      result.status === "already_owned" &&
      result.claimMode === "same_owner" &&
      result.sessionReused === 1 &&
      repository.calls.confirmSameOwnerClaim === 1 &&
      repository.snapshot.session?.ownershipToken === "existing-secret-token" &&
      repository.snapshot.session?.leaseExpiresAt === ACTIVE_LEASE,
    JSON.stringify({ result, snapshot: repository.snapshot.session }),
  );
}
async function scenarioConflictingClaimant(): Promise<DeploymentActivationExecutionClaimServerHarnessScenario> {
  const repository = new InMemoryAtomicClaimRepository({
    snapshot: ownedSnapshot("other-executor", ACTIVE_LEASE),
  });
  const before = JSON.stringify(repository.snapshot);
  const result = await claim(repository);

  return expectScenario(
    "conflicting claimant returns conflict without mutation",
    !result.ok &&
      result.status === "conflict" &&
      result.conflicts === 1 &&
      JSON.stringify(repository.snapshot) === before &&
      repository.atomicCallCount === 0,
    JSON.stringify(result),
  );
}

async function scenarioExpiredReclaim(): Promise<DeploymentActivationExecutionClaimServerHarnessScenario> {
  const repository = new InMemoryAtomicClaimRepository({
    snapshot: ownedSnapshot("expired-executor", EXPIRED_LEASE),
  });
  const result = await claim(repository, {
    tokenFactory: () => "secret-reclaimed-token",
  });

  return expectScenario(
    "expired untouched lease is atomically reclaimed",
    result.ok &&
      result.status === "reclaimed" &&
      result.claimMode === "expired_reclaim" &&
      result.sessionReclaimed === 1 &&
      repository.snapshot.session?.executionOwner === SETUP_RUNTIME_ACTIVATION_EXECUTION_CLAIMANT_ID &&
      repository.snapshot.session?.ownershipToken === "secret-reclaimed-token" &&
      repository.snapshot.session?.startedAt === null,
    JSON.stringify({ result, snapshot: repository.snapshot.session }),
  );
}

async function scenarioSkippedBlockedPersistence(): Promise<DeploymentActivationExecutionClaimServerHarnessScenario> {
  const repository = new InMemoryAtomicClaimRepository();
  const result = await claim(repository, {
    persistence: persistence({ ok: false, status: "blocked" }),
  });

  return expectScenario(
    "blocked preparation or persistence skips claim",
    !result.ok &&
      result.status === "not_attempted" &&
      repository.calls.getClaimSnapshot === 0 &&
      repository.atomicCallCount === 0,
    JSON.stringify(result),
  );
}

async function scenarioSkippedIncompletePersistence(): Promise<DeploymentActivationExecutionClaimServerHarnessScenario> {
  const repository = new InMemoryAtomicClaimRepository();
  const result = await claim(repository, {
    persistence: persistence({ sessionId: null }),
  });

  return expectScenario(
    "incomplete persistence evidence skips claim",
    !result.ok &&
      result.status === "not_attempted" &&
      repository.calls.getClaimSnapshot === 0,
    JSON.stringify(result),
  );
}

async function scenarioRepositoryError(): Promise<DeploymentActivationExecutionClaimServerHarnessScenario> {
  const repository = new InMemoryAtomicClaimRepository({ shouldThrowOnSnapshot: true });
  const result = await claim(repository);

  return expectScenario(
    "repository error returns safe claim error evidence",
    !result.ok &&
      result.status === "error" &&
      result.sessionClaimed === 0 &&
      !JSON.stringify(result).includes("secret-token"),
    JSON.stringify(result),
  );
}

async function scenarioMalformedAtomicResult(): Promise<DeploymentActivationExecutionClaimServerHarnessScenario> {
  const repository = new InMemoryAtomicClaimRepository({ shouldThrowOnAtomic: true });
  const result = await claim(repository);

  return expectScenario(
    "malformed atomic result returns safe error",
    !result.ok &&
      result.status === "error" &&
      repository.snapshot.session?.executionOwner === null &&
      repository.atomicCallCount === 1,
    JSON.stringify(result),
  );
}

async function scenarioDeterministicClaimantAndLease(): Promise<DeploymentActivationExecutionClaimServerHarnessScenario> {
  const repository = new InMemoryAtomicClaimRepository();
  const result = await claim(repository);

  return expectScenario(
    "claimant id and lease duration are deterministic",
    result.claimantId === SETUP_RUNTIME_ACTIVATION_EXECUTION_CLAIMANT_ID &&
      SETUP_RUNTIME_ACTIVATION_EXECUTION_LEASE_SECONDS === 300 &&
      result.leaseExpiresAt === ACTIVE_LEASE,
    JSON.stringify(result),
  );
}

async function scenarioTokenNeverExposed(): Promise<DeploymentActivationExecutionClaimServerHarnessScenario> {
  const repository = new InMemoryAtomicClaimRepository();
  const result = await claim(repository);
  const serialized = JSON.stringify(result);

  return expectScenario(
    "ownership token never appears in UI-safe evidence",
    repository.snapshot.session?.ownershipToken === "secret-token-001" &&
      !serialized.includes("secret-token-001") &&
      !serialized.includes("ownershipToken"),
    serialized,
  );
}

async function scenarioSourceImmutability(): Promise<DeploymentActivationExecutionClaimServerHarnessScenario> {
  const source = buildClaimSnapshot();
  const before = JSON.stringify(source);
  await claim(new InMemoryAtomicClaimRepository({ snapshot: source }));

  return expectScenario(
    "source snapshot remains immutable",
    JSON.stringify(source) === before,
    "source snapshot unchanged",
  );
}

async function scenarioDownstreamCountersAndNoItemWrites(): Promise<DeploymentActivationExecutionClaimServerHarnessScenario> {
  const repository = new InMemoryAtomicClaimRepository();
  const result = await claim(repository);

  return expectScenario(
    "downstream execution counters remain zero and no item writes occur",
    result.downstream.sessionsClaimed === 0 &&
      result.downstream.sessionsStarted === 0 &&
      result.downstream.itemsClaimed === 0 &&
      result.downstream.itemsStarted === 0 &&
      result.downstream.itemsSucceeded === 0 &&
      result.downstream.itemsFailed === 0 &&
      result.downstream.itemsRolledBack === 0 &&
      result.downstream.entitiesActivated === 0 &&
      result.downstream.bindingsWritten === 0 &&
      result.downstream.deploymentRunsFinalized === 0 &&
      repository.itemUpdateCallCount === 0,
    JSON.stringify(result.downstream),
  );
}

async function claim(
  repository: InMemoryAtomicClaimRepository,
  input: {
    persistence?: ServerDeploymentActivationExecutionPersistenceResult;
    tokenFactory?: () => string;
    claimantId?: string;
  } = {},
) {
  return claimActivationExecutionWithRepository(
    repository,
    {
      clinicId: CLINIC_ID,
      deploymentRunId: DEPLOYMENT_RUN_ID,
      deploymentActivationExecutionPersistence: input.persistence ?? persistence(),
      claimRequestedAt: CLAIMED_AT,
    },
    {
      claimantId: input.claimantId,
      tokenFactory:
        input.tokenFactory ??
        (() => "secret-token-001"),
    },
  );
}

class InMemoryAtomicClaimRepository
  implements DeploymentActivationExecutionAtomicClaimRepository
{
  readonly calls = {
    getClaimSnapshot: 0,
    claimFreshSession: 0,
    confirmSameOwnerClaim: 0,
    reclaimExpiredSession: 0,
  };
  readonly itemUpdateCallCount = 0;
  private readonly shouldThrowOnSnapshot: boolean;
  private readonly shouldThrowOnAtomic: boolean;
  snapshot: DeploymentActivationExecutionClaimSnapshot;

  constructor(input: {
    snapshot?: DeploymentActivationExecutionClaimSnapshot;
    shouldThrowOnSnapshot?: boolean;
    shouldThrowOnAtomic?: boolean;
  } = {}) {
    this.snapshot = cloneSnapshot(input.snapshot ?? buildClaimSnapshot());
    this.shouldThrowOnSnapshot = input.shouldThrowOnSnapshot ?? false;
    this.shouldThrowOnAtomic = input.shouldThrowOnAtomic ?? false;
  }

  get atomicCallCount(): number {
    return (
      this.calls.claimFreshSession +
      this.calls.confirmSameOwnerClaim +
      this.calls.reclaimExpiredSession
    );
  }

  async getClaimSnapshot(): Promise<DeploymentActivationExecutionClaimSnapshot> {
    this.calls.getClaimSnapshot += 1;

    if (this.shouldThrowOnSnapshot) {
      throw new Error("claim snapshot failed");
    }

    return cloneSnapshot(this.snapshot);
  }

  async claimFreshSession(
    command: Omit<DeploymentActivationExecutionAtomicClaimCommand, "mode">,
  ): Promise<DeploymentActivationExecutionAtomicClaimResult> {
    this.calls.claimFreshSession += 1;
    return this.applyAtomic("claimed", command, null, null, null);
  }

  async confirmSameOwnerClaim(
    command: Omit<DeploymentActivationExecutionAtomicClaimCommand, "mode">,
  ): Promise<DeploymentActivationExecutionAtomicClaimResult> {
    this.calls.confirmSameOwnerClaim += 1;
    return this.applyAtomic(
      "already_owned",
      command,
      command.expectedPreviousOwner ?? null,
      command.expectedPreviousOwnershipToken ?? null,
      command.expectedPreviousLeaseExpiresAt ?? null,
    );
  }

  async reclaimExpiredSession(
    command: Omit<DeploymentActivationExecutionAtomicClaimCommand, "mode">,
  ): Promise<DeploymentActivationExecutionAtomicClaimResult> {
    this.calls.reclaimExpiredSession += 1;
    return this.applyAtomic(
      "reclaimed",
      command,
      command.expectedPreviousOwner ?? null,
      command.expectedPreviousOwnershipToken ?? null,
      command.expectedPreviousLeaseExpiresAt ?? null,
    );
  }

  private applyAtomic(
    status: "claimed" | "already_owned" | "reclaimed",
    command: Omit<DeploymentActivationExecutionAtomicClaimCommand, "mode">,
    expectedOwner: string | null,
    expectedToken: string | null,
    expectedLease: string | null,
  ): DeploymentActivationExecutionAtomicClaimResult {
    if (this.shouldThrowOnAtomic) {
      throw new Error("malformed atomic response");
    }

    const session = this.snapshot.session;

    if (!session) {
      return atomicResult("not_found", command, null, null, null);
    }

    if (
      session.executionOwner !== expectedOwner ||
      session.ownershipToken !== expectedToken ||
      session.leaseExpiresAt !== expectedLease
    ) {
      return atomicResult(
        "conflict",
        command,
        session.executionOwner,
        session.ownershipToken,
        session.leaseExpiresAt,
      );
    }

    if (status !== "already_owned") {
      session.executionOwner = command.claimantId;
      session.ownershipToken = command.proposedOwnershipToken;
      session.leaseExpiresAt = command.proposedLeaseExpiresAt;
    }

    return atomicResult(
      status,
      command,
      session.executionOwner,
      session.ownershipToken,
      session.leaseExpiresAt,
    );
  }
}

function atomicResult(
  status: DeploymentActivationExecutionAtomicClaimResult["status"],
  command: Omit<DeploymentActivationExecutionAtomicClaimCommand, "mode">,
  owner: string | null,
  ownershipToken: string | null,
  leaseExpiresAt: string | null,
): DeploymentActivationExecutionAtomicClaimResult {
  return {
    ok: status === "claimed" || status === "already_owned" || status === "reclaimed",
    status,
    sessionId: command.sessionId,
    executionKey: command.executionKey,
    owner,
    ownershipToken,
    leaseExpiresAt,
    executionStatus: "prepared",
    itemCount: command.expectedItemCount,
    issueCode: null,
    message: `Atomic claim ${status}.`,
  };
}

function persistence(
  input: Partial<ServerDeploymentActivationExecutionPersistenceResult> = {},
): ServerDeploymentActivationExecutionPersistenceResult {
  return {
    ok: input.ok ?? true,
    status: input.status ?? "created",
    sessionId: input.sessionId === undefined ? SESSION_ID : input.sessionId,
    executionKey:
      input.executionKey === undefined ? EXECUTION_KEY : input.executionKey,
    planKey: input.planKey === undefined ? PLAN_KEY : input.planKey,
    sessionCreated: input.sessionCreated ?? 1,
    sessionReused: input.sessionReused ?? 0,
    itemsRequested: input.itemsRequested ?? 3,
    itemsCreated: input.itemsCreated ?? 3,
    itemsReused: input.itemsReused ?? 0,
    itemsConflicted: input.itemsConflicted ?? 0,
    blockers: input.blockers ?? 0,
    warnings: input.warnings ?? 0,
    issues: input.issues ?? [],
    downstream: input.downstream ?? {
      itemsClaimed: 0,
      itemsStarted: 0,
      itemsSucceeded: 0,
      itemsFailed: 0,
      itemsRolledBack: 0,
      sessionsCompleted: 0,
      sessionsFailed: 0,
      bindingsWritten: 0,
      entitiesActivated: 0,
      deploymentRunsFinalized: 0,
    },
    message: input.message ?? "Prepared execution persisted.",
  };
}

function ownedSnapshot(
  owner: string,
  leaseExpiresAt: string,
): DeploymentActivationExecutionClaimSnapshot {
  return buildClaimSnapshot({
    session: {
      executionStatus: "claimed",
      executionOwner: owner,
      ownershipToken: "existing-secret-token",
      leaseExpiresAt,
    },
  });
}

function cloneSnapshot(
  snapshot: DeploymentActivationExecutionClaimSnapshot,
): DeploymentActivationExecutionClaimSnapshot {
  return {
    session: snapshot.session
      ? cloneClaimSessionSnapshot(snapshot.session)
      : null,
    itemCompleteness: cloneClaimItemCompleteness(snapshot.itemCompleteness),
  };
}

function expectScenario(
  name: string,
  passed: boolean,
  message: string,
): DeploymentActivationExecutionClaimServerHarnessScenario {
  return { name, passed, message };
}
