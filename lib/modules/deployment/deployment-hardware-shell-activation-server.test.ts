import {
  activateHardwareShellWithRepository,
  type DeploymentHardwareShellActivationAtomicRepository,
} from "./deployment-hardware-shell-activation-server";
import {
  DeploymentHardwareShellActivationRepositoryError,
} from "./deployment-hardware-shell-activation-supabase-repository";
import {
  buildAlreadyActivatedHardwareShellActivationSnapshot,
  buildHardwareShellActivationSnapshot,
  HARDWARE_SHELL_ACTIVATION_TEST_IDS,
} from "./deployment-hardware-shell-activation-test-repository";
import {
  cloneHardwareShellActivationSnapshot,
  type DeploymentHardwareShellActivationAtomicCommand,
  type DeploymentHardwareShellActivationAtomicResult,
  type DeploymentHardwareShellActivationSnapshot,
} from "./deployment-hardware-shell-activation-types";
import type {
  ServerDeploymentActivationExecutionClaimResult,
} from "./deployment-activation-execution-claim-server";
import type {
  ServerDeploymentActivationExecutionNextItemStartResult,
} from "./deployment-activation-execution-next-item-start-server";

export interface DeploymentHardwareShellActivationServerHarnessScenario {
  name: string;
  passed: boolean;
  message: string;
}

export interface DeploymentHardwareShellActivationServerHarnessResult {
  passed: boolean;
  scenarios: readonly DeploymentHardwareShellActivationServerHarnessScenario[];
}

const NOW = "2026-01-01T12:10:00.000Z";

export async function runDeploymentHardwareShellActivationServerHarness(): Promise<DeploymentHardwareShellActivationServerHarnessResult> {
  const scenarios = [
    await scenarioActivatableCallsRpcOnce(),
    await scenarioAlreadyActivatedReusesWithoutRpc(),
    await scenarioNotAttemptedWhenNextItemNotRunning(),
    await scenarioNotAttemptedForNonHardwareItem(),
    await scenarioBlockedAssessmentDoesNotMutate(),
    await scenarioAtomicConflictIsReported(),
    await scenarioRepositoryErrorDiagnostics(),
    await scenarioOwnershipTokenRedaction(),
    await scenarioNoFallbackMutation(),
    await scenarioSourceImmutability(),
    await scenarioDownstreamCountersRemainZero(),
  ];

  return {
    passed: scenarios.every((scenario) => scenario.passed),
    scenarios,
  };
}

async function scenarioActivatableCallsRpcOnce() {
  const repository = new RuntimeHardwareShellActivationTestRepository({
    atomicResult: atomicResult("activated"),
  });
  const result = await activateHardwareShellWithRepository(repository, command(), {
    ownershipTokenResolver: () => HARDWARE_SHELL_ACTIVATION_TEST_IDS.token,
  });

  return expectScenario(
    "activatable hardware shell calls atomic activation once",
    result.ok &&
      result.status === "activated" &&
      result.activatedCount === 1 &&
      result.reusedCount === 0 &&
      repository.calls.load === 1 &&
      repository.calls.atomic === 1 &&
      Object.keys(repository.lastAtomicCommand?.expectedCurrentState ?? {}).sort().join(",") === "active,agentId,currentWorkstationId,defaultWorkstationId,deploymentHardwareKey,operationalStatus,provisioningSource,provisioningStatus" &&
      repository.lastAtomicCommand?.expectedCurrentState.operationalStatus === "discovered" &&
      repository.lastAtomicCommand?.expectedCurrentState.agentId === null &&
      result.provisioningStatusBefore === "planned" &&
      result.provisioningStatusAfter === "active" &&
      result.activeBefore === false &&
      result.activeAfter === true,
    JSON.stringify({ result, calls: repository.calls }),
  );
}

async function scenarioAlreadyActivatedReusesWithoutRpc() {
  const repository = new RuntimeHardwareShellActivationTestRepository({
    snapshot: buildAlreadyActivatedHardwareShellActivationSnapshot(),
  });
  const result = await activateHardwareShellWithRepository(repository, command(), {
    ownershipTokenResolver: () => HARDWARE_SHELL_ACTIVATION_TEST_IDS.token,
  });

  return expectScenario(
    "already activated hardware shell reuses evidence without RPC",
    result.ok &&
      result.status === "already_activated" &&
      result.reusedCount === 1 &&
      repository.calls.atomic === 0,
    JSON.stringify({ result, calls: repository.calls }),
  );
}

async function scenarioNotAttemptedWhenNextItemNotRunning() {
  const repository = new RuntimeHardwareShellActivationTestRepository();
  const result = await activateHardwareShellWithRepository(
    repository,
    command({ nextItem: nextItemStart({ ok: false, status: "blocked" }) }),
  );

  return expectScenario(
    "hardware activation is not attempted when next item start is unavailable",
    result.status === "not_attempted" && repository.calls.load === 0 && repository.calls.atomic === 0,
    JSON.stringify({ result, calls: repository.calls }),
  );
}

async function scenarioNotAttemptedForNonHardwareItem() {
  const repository = new RuntimeHardwareShellActivationTestRepository();
  const result = await activateHardwareShellWithRepository(
    repository,
    command({ nextItem: nextItemStart({ entityType: "hardware_shell", entityId: "hardware-001" }) }),
    { ownershipTokenResolver: () => HARDWARE_SHELL_ACTIVATION_TEST_IDS.token },
  );

  return expectScenario(
    "hardware activation is not attempted for a non-hardware running item",
    result.status === "not_attempted" && result.executionItemKey === nextItemStart().executionItemKey && repository.calls.load === 0 && repository.calls.atomic === 0,
    JSON.stringify({ result, calls: repository.calls }),
  );
}

async function scenarioBlockedAssessmentDoesNotMutate() {
  const repository = new RuntimeHardwareShellActivationTestRepository({
    snapshot: buildHardwareShellActivationSnapshot({ hardwareShell: null }),
  });
  const result = await activateHardwareShellWithRepository(repository, command(), {
    ownershipTokenResolver: () => HARDWARE_SHELL_ACTIVATION_TEST_IDS.token,
  });

  return expectScenario(
    "blocked assessment returns not_found without atomic mutation",
    result.status === "not_found" && repository.calls.load === 1 && repository.calls.atomic === 0,
    JSON.stringify({ result, calls: repository.calls }),
  );
}

async function scenarioAtomicConflictIsReported() {
  const repository = new RuntimeHardwareShellActivationTestRepository({
    atomicResult: atomicResult("conflict"),
  });
  const result = await activateHardwareShellWithRepository(repository, command(), {
    ownershipTokenResolver: () => HARDWARE_SHELL_ACTIVATION_TEST_IDS.token,
  });

  return expectScenario(
    "atomic conflict is reported without fallback",
    !result.ok && result.status === "conflict" && result.conflicts === 1 && repository.calls.atomic === 1,
    JSON.stringify({ result, calls: repository.calls }),
  );
}

async function scenarioRepositoryErrorDiagnostics() {
  const repository = new RuntimeHardwareShellActivationTestRepository({
    throwOnAtomic: new DeploymentHardwareShellActivationRepositoryError({
      layer: "atomic_rpc",
      code: "23514",
      message: "hardware activation failed",
      details: "constraint detail",
      hint: "check hardware state",
    }),
  });
  const result = await activateHardwareShellWithRepository(repository, command(), {
    ownershipTokenResolver: () => HARDWARE_SHELL_ACTIVATION_TEST_IDS.token,
  });
  const diagnostics = result.issues[0]?.diagnostics;

  return expectScenario(
    "atomic repository diagnostics survive server evidence",
    result.status === "error" &&
      diagnostics?.layer === "atomic_rpc" &&
      diagnostics.rpcAttempted === true &&
      diagnostics.errorCode === "23514" &&
      diagnostics.errorDetails === "constraint detail" &&
      diagnostics.errorHint === "check hardware state",
    JSON.stringify(result),
  );
}

async function scenarioOwnershipTokenRedaction() {
  const repository = new RuntimeHardwareShellActivationTestRepository({
    throwOnAtomic: new DeploymentHardwareShellActivationRepositoryError({
      layer: "atomic_rpc",
      code: "XX000",
      message: `leaked ${HARDWARE_SHELL_ACTIVATION_TEST_IDS.token}`,
    }),
  });
  const result = await activateHardwareShellWithRepository(repository, command(), {
    ownershipTokenResolver: () => HARDWARE_SHELL_ACTIVATION_TEST_IDS.token,
  });

  return expectScenario(
    "ownership token is redacted from hardware activation diagnostics",
    !JSON.stringify(result).includes(HARDWARE_SHELL_ACTIVATION_TEST_IDS.token),
    JSON.stringify(result),
  );
}

async function scenarioNoFallbackMutation() {
  const repository = new RuntimeHardwareShellActivationTestRepository({
    throwOnAtomic: new Error("network stopped"),
  });
  const result = await activateHardwareShellWithRepository(repository, command(), {
    ownershipTokenResolver: () => HARDWARE_SHELL_ACTIVATION_TEST_IDS.token,
  });

  return expectScenario(
    "atomic failure has no retry or fallback mutation",
    result.status === "error" && repository.calls.atomic === 1 && repository.calls.fallback === 0,
    JSON.stringify({ result, calls: repository.calls }),
  );
}

async function scenarioSourceImmutability() {
  const snapshot = buildHardwareShellActivationSnapshot();
  const before = JSON.stringify(snapshot);
  const repository = new RuntimeHardwareShellActivationTestRepository({ snapshot });
  await activateHardwareShellWithRepository(repository, command(), {
    ownershipTokenResolver: () => HARDWARE_SHELL_ACTIVATION_TEST_IDS.token,
  });

  return expectScenario("source immutability", JSON.stringify(snapshot) === before, before);
}

async function scenarioDownstreamCountersRemainZero() {
  const repository = new RuntimeHardwareShellActivationTestRepository({
    atomicResult: atomicResult("activated"),
  });
  const result = await activateHardwareShellWithRepository(repository, command(), {
    ownershipTokenResolver: () => HARDWARE_SHELL_ACTIVATION_TEST_IDS.token,
  });

  return expectScenario(
    "downstream counters remain zero",
    result.downstream.hardwaresActivated === 0 &&
      result.downstream.itemsCompleted === 0 &&
      result.downstream.dependenciesProgressed === 0 &&
      result.downstream.bindingsWritten === 0 &&
      result.downstream.sessionsCompleted === 0 &&
      result.downstream.rollbacksExecuted === 0 &&
      result.downstream.deploymentFinalized === 0,
    JSON.stringify(result.downstream),
  );
}

class RuntimeHardwareShellActivationTestRepository implements DeploymentHardwareShellActivationAtomicRepository {
  readonly calls = {
    load: 0,
    atomic: 0,
    fallback: 0,
  };

  lastAtomicCommand: DeploymentHardwareShellActivationAtomicCommand | null = null;

  private readonly snapshot: DeploymentHardwareShellActivationSnapshot;
  private readonly atomicResult: DeploymentHardwareShellActivationAtomicResult;
  private readonly throwOnAtomic: unknown;

  constructor(input: {
    snapshot?: DeploymentHardwareShellActivationSnapshot;
    atomicResult?: DeploymentHardwareShellActivationAtomicResult;
    throwOnAtomic?: unknown;
  } = {}) {
    this.snapshot = cloneHardwareShellActivationSnapshot(input.snapshot ?? buildHardwareShellActivationSnapshot());
    this.atomicResult = input.atomicResult ?? atomicResult("activated");
    this.throwOnAtomic = input.throwOnAtomic;
  }

  async loadHardwareShellActivationSnapshot(): Promise<DeploymentHardwareShellActivationSnapshot> {
    this.calls.load += 1;
    return cloneHardwareShellActivationSnapshot(this.snapshot);
  }

  async activateHardwareShellAtomically(
    command: DeploymentHardwareShellActivationAtomicCommand,
  ): Promise<DeploymentHardwareShellActivationAtomicResult> {
    this.calls.atomic += 1;
    this.lastAtomicCommand = JSON.parse(JSON.stringify(command)) as DeploymentHardwareShellActivationAtomicCommand;

    if (this.throwOnAtomic) {
      throw this.throwOnAtomic;
    }

    return this.atomicResult;
  }
}

function command(input: {
  claim?: ServerDeploymentActivationExecutionClaimResult | null;
  nextItem?: ServerDeploymentActivationExecutionNextItemStartResult | null;
} = {}) {
  return {
    clinicId: HARDWARE_SHELL_ACTIVATION_TEST_IDS.clinicId,
    deploymentRunId: HARDWARE_SHELL_ACTIVATION_TEST_IDS.deploymentRunKey,
    deploymentActivationExecutionClaim: input.claim === undefined ? claim() : input.claim,
    deploymentActivationExecutionNextItemStart: input.nextItem === undefined ? nextItemStart() : input.nextItem,
    hardwareActivatedAt: NOW,
  };
}

function claim(input: Partial<ServerDeploymentActivationExecutionClaimResult> = {}): ServerDeploymentActivationExecutionClaimResult {
  return {
    ok: true,
    status: "already_owned",
    sessionId: HARDWARE_SHELL_ACTIVATION_TEST_IDS.sessionId,
    executionKey: HARDWARE_SHELL_ACTIVATION_TEST_IDS.executionKey,
    planKey: HARDWARE_SHELL_ACTIVATION_TEST_IDS.planKey,
    claimantId: HARDWARE_SHELL_ACTIVATION_TEST_IDS.owner,
    persistedOwnerId: HARDWARE_SHELL_ACTIVATION_TEST_IDS.owner,
    leaseExpiresAt: HARDWARE_SHELL_ACTIVATION_TEST_IDS.lease,
    claimMode: "same_owner",
    ownershipResult: "already_owned",
    sessionClaimed: 0,
    sessionReused: 1,
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
    message: "Claim is already owned by the setup runtime.",
    ...input,
  };
}

function nextItemStart(
  input: Partial<ServerDeploymentActivationExecutionNextItemStartResult> = {},
): ServerDeploymentActivationExecutionNextItemStartResult {
  return {
    ok: true,
    status: "started",
    message: "Next hardware item started.",
    claimantId: HARDWARE_SHELL_ACTIVATION_TEST_IDS.owner,
    clinicId: HARDWARE_SHELL_ACTIVATION_TEST_IDS.clinicId,
    deploymentRunKey: HARDWARE_SHELL_ACTIVATION_TEST_IDS.deploymentRunKey,
    sessionId: HARDWARE_SHELL_ACTIVATION_TEST_IDS.sessionId,
    executionKey: HARDWARE_SHELL_ACTIVATION_TEST_IDS.executionKey,
    planKey: HARDWARE_SHELL_ACTIVATION_TEST_IDS.planKey,
    itemId: "activation-execution-hardware-item-002",
    executionItemKey: `${HARDWARE_SHELL_ACTIVATION_TEST_IDS.executionKey}:${HARDWARE_SHELL_ACTIVATION_TEST_IDS.planKey}:hardware-001`,
    planItemKey: `${HARDWARE_SHELL_ACTIVATION_TEST_IDS.planKey}:hardware-001`,
    sequence: 2,
    entityType: "hardware_shell",
    entityId: HARDWARE_SHELL_ACTIVATION_TEST_IDS.hardwareId,
    action: "activate",
    attemptCount: 1,
    startedAt: "2026-01-01T12:05:00.000Z",
    leaseExpiresAt: HARDWARE_SHELL_ACTIVATION_TEST_IDS.lease,
    result: "started",
    startedCount: 1,
    reusedCount: 0,
    conflicts: 0,
    blockers: 0,
    warnings: 0,
    issues: [],
    downstream: {
      itemsStarted: 0,
      itemsSucceeded: 0,
      entitiesActivated: 0,
      bindingsWritten: 0,
      itemsCompleted: 0,
      dependenciesProgressed: 0,
      finalized: 0,
    },
    ...input,
  };
}

function atomicResult(
  status: DeploymentHardwareShellActivationAtomicResult["status"],
): DeploymentHardwareShellActivationAtomicResult {
  return {
    ok: status === "activated" || status === "already_activated",
    status,
    clinicId: HARDWARE_SHELL_ACTIVATION_TEST_IDS.clinicId,
    deploymentRunKey: HARDWARE_SHELL_ACTIVATION_TEST_IDS.deploymentRunKey,
    sessionId: HARDWARE_SHELL_ACTIVATION_TEST_IDS.sessionId,
    executionKey: HARDWARE_SHELL_ACTIVATION_TEST_IDS.executionKey,
    itemId: "activation-execution-hardware-item-002",
    executionItemKey: `${HARDWARE_SHELL_ACTIVATION_TEST_IDS.executionKey}:${HARDWARE_SHELL_ACTIVATION_TEST_IDS.planKey}:hardware-001`,
    planItemKey: `${HARDWARE_SHELL_ACTIVATION_TEST_IDS.planKey}:hardware-001`,
    sequence: 2,
    hardwareId: HARDWARE_SHELL_ACTIVATION_TEST_IDS.hardwareId,
    deploymentHardwareKey: HARDWARE_SHELL_ACTIVATION_TEST_IDS.hardwareKey,
    hardwareStateBefore: {
      deploymentHardwareKey: HARDWARE_SHELL_ACTIVATION_TEST_IDS.hardwareKey,
      provisioningSource: "setup_draft",
      provisioningStatus: status === "already_activated" ? "active" : "planned",
      active: status === "already_activated",
    },
    hardwareStateAfter: {
      deploymentHardwareKey: HARDWARE_SHELL_ACTIVATION_TEST_IDS.hardwareKey,
      provisioningSource: "setup_draft",
      provisioningStatus: status === "activated" || status === "already_activated" ? "active" : "planned",
      active: status === "activated" || status === "already_activated",
    },
    activatedAt: status === "activated" || status === "already_activated" ? NOW : null,
    issueCode: status === "activated" || status === "already_activated" ? null : "hardware_shell_activation_blocked",
    message: `Atomic hardware shell activation returned ${status}.`,
  };
}

function expectScenario(
  name: string,
  passed: boolean,
  message: string,
): DeploymentHardwareShellActivationServerHarnessScenario {
  return { name, passed, message };
}