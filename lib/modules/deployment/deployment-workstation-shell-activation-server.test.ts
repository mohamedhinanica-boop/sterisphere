import {
  activateWorkstationShellWithRepository,
  type DeploymentWorkstationShellActivationAtomicRepository,
} from "./deployment-workstation-shell-activation-server";
import {
  DeploymentWorkstationShellActivationRepositoryError,
} from "./deployment-workstation-shell-activation-supabase-repository";
import {
  buildAlreadyActivatedWorkstationShellActivationSnapshot,
  buildWorkstationShellActivationSnapshot,
  WORKSTATION_SHELL_ACTIVATION_TEST_IDS,
} from "./deployment-workstation-shell-activation-test-repository";
import {
  cloneWorkstationShellActivationSnapshot,
  type DeploymentWorkstationShellActivationAtomicCommand,
  type DeploymentWorkstationShellActivationAtomicResult,
  type DeploymentWorkstationShellActivationSnapshot,
} from "./deployment-workstation-shell-activation-types";
import type {
  ServerDeploymentActivationExecutionClaimResult,
} from "./deployment-activation-execution-claim-server";
import type {
  ServerDeploymentActivationExecutionNextItemStartResult,
} from "./deployment-activation-execution-next-item-start-server";

export interface DeploymentWorkstationShellActivationServerHarnessScenario {
  name: string;
  passed: boolean;
  message: string;
}

export interface DeploymentWorkstationShellActivationServerHarnessResult {
  passed: boolean;
  scenarios: readonly DeploymentWorkstationShellActivationServerHarnessScenario[];
}

const NOW = "2026-01-01T12:10:00.000Z";

export async function runDeploymentWorkstationShellActivationServerHarness(): Promise<DeploymentWorkstationShellActivationServerHarnessResult> {
  const scenarios = [
    await scenarioActivatableCallsRpcOnce(),
    await scenarioAlreadyActivatedReusesWithoutRpc(),
    await scenarioNotAttemptedWhenNextItemNotRunning(),
    await scenarioNotAttemptedForNonWorkstationItem(),
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
  const repository = new RuntimeWorkstationShellActivationTestRepository({
    atomicResult: atomicResult("activated"),
  });
  const result = await activateWorkstationShellWithRepository(repository, command(), {
    ownershipTokenResolver: () => WORKSTATION_SHELL_ACTIVATION_TEST_IDS.token,
  });

  return expectScenario(
    "activatable workstation shell calls atomic activation once",
    result.ok &&
      result.status === "activated" &&
      result.activatedCount === 1 &&
      result.reusedCount === 0 &&
      repository.calls.load === 1 &&
      repository.calls.atomic === 1 &&
      result.provisioningStatusBefore === "planned" &&
      result.provisioningStatusAfter === "active" &&
      result.activeBefore === false &&
      result.activeAfter === true,
    JSON.stringify({ result, calls: repository.calls }),
  );
}

async function scenarioAlreadyActivatedReusesWithoutRpc() {
  const repository = new RuntimeWorkstationShellActivationTestRepository({
    snapshot: buildAlreadyActivatedWorkstationShellActivationSnapshot(),
  });
  const result = await activateWorkstationShellWithRepository(repository, command(), {
    ownershipTokenResolver: () => WORKSTATION_SHELL_ACTIVATION_TEST_IDS.token,
  });

  return expectScenario(
    "already activated workstation shell reuses evidence without RPC",
    result.ok &&
      result.status === "already_activated" &&
      result.reusedCount === 1 &&
      repository.calls.atomic === 0,
    JSON.stringify({ result, calls: repository.calls }),
  );
}

async function scenarioNotAttemptedWhenNextItemNotRunning() {
  const repository = new RuntimeWorkstationShellActivationTestRepository();
  const result = await activateWorkstationShellWithRepository(
    repository,
    command({ nextItem: nextItemStart({ ok: false, status: "blocked" }) }),
  );

  return expectScenario(
    "workstation activation is not attempted when next item start is unavailable",
    result.status === "not_attempted" && repository.calls.load === 0 && repository.calls.atomic === 0,
    JSON.stringify({ result, calls: repository.calls }),
  );
}

async function scenarioNotAttemptedForNonWorkstationItem() {
  const repository = new RuntimeWorkstationShellActivationTestRepository();
  const result = await activateWorkstationShellWithRepository(
    repository,
    command({ nextItem: nextItemStart({ entityType: "workstation_shell", entityId: "workstation-001" }) }),
    { ownershipTokenResolver: () => WORKSTATION_SHELL_ACTIVATION_TEST_IDS.token },
  );

  return expectScenario(
    "workstation activation is not attempted for a non-workstation running item",
    result.status === "not_attempted" && result.executionItemKey === nextItemStart().executionItemKey && repository.calls.load === 0 && repository.calls.atomic === 0,
    JSON.stringify({ result, calls: repository.calls }),
  );
}

async function scenarioBlockedAssessmentDoesNotMutate() {
  const repository = new RuntimeWorkstationShellActivationTestRepository({
    snapshot: buildWorkstationShellActivationSnapshot({ workstationShell: null }),
  });
  const result = await activateWorkstationShellWithRepository(repository, command(), {
    ownershipTokenResolver: () => WORKSTATION_SHELL_ACTIVATION_TEST_IDS.token,
  });

  return expectScenario(
    "blocked assessment returns not_found without atomic mutation",
    result.status === "not_found" && repository.calls.load === 1 && repository.calls.atomic === 0,
    JSON.stringify({ result, calls: repository.calls }),
  );
}

async function scenarioAtomicConflictIsReported() {
  const repository = new RuntimeWorkstationShellActivationTestRepository({
    atomicResult: atomicResult("conflict"),
  });
  const result = await activateWorkstationShellWithRepository(repository, command(), {
    ownershipTokenResolver: () => WORKSTATION_SHELL_ACTIVATION_TEST_IDS.token,
  });

  return expectScenario(
    "atomic conflict is reported without fallback",
    !result.ok && result.status === "conflict" && result.conflicts === 1 && repository.calls.atomic === 1,
    JSON.stringify({ result, calls: repository.calls }),
  );
}

async function scenarioRepositoryErrorDiagnostics() {
  const repository = new RuntimeWorkstationShellActivationTestRepository({
    throwOnAtomic: new DeploymentWorkstationShellActivationRepositoryError({
      layer: "atomic_rpc",
      code: "23514",
      message: "workstation activation failed",
      details: "constraint detail",
      hint: "check workstation state",
    }),
  });
  const result = await activateWorkstationShellWithRepository(repository, command(), {
    ownershipTokenResolver: () => WORKSTATION_SHELL_ACTIVATION_TEST_IDS.token,
  });
  const diagnostics = result.issues[0]?.diagnostics;

  return expectScenario(
    "atomic repository diagnostics survive server evidence",
    result.status === "error" &&
      diagnostics?.layer === "atomic_rpc" &&
      diagnostics.rpcAttempted === true &&
      diagnostics.errorCode === "23514" &&
      diagnostics.errorDetails === "constraint detail" &&
      diagnostics.errorHint === "check workstation state",
    JSON.stringify(result),
  );
}

async function scenarioOwnershipTokenRedaction() {
  const repository = new RuntimeWorkstationShellActivationTestRepository({
    throwOnAtomic: new DeploymentWorkstationShellActivationRepositoryError({
      layer: "atomic_rpc",
      code: "XX000",
      message: `leaked ${WORKSTATION_SHELL_ACTIVATION_TEST_IDS.token}`,
    }),
  });
  const result = await activateWorkstationShellWithRepository(repository, command(), {
    ownershipTokenResolver: () => WORKSTATION_SHELL_ACTIVATION_TEST_IDS.token,
  });

  return expectScenario(
    "ownership token is redacted from workstation activation diagnostics",
    !JSON.stringify(result).includes(WORKSTATION_SHELL_ACTIVATION_TEST_IDS.token),
    JSON.stringify(result),
  );
}

async function scenarioNoFallbackMutation() {
  const repository = new RuntimeWorkstationShellActivationTestRepository({
    throwOnAtomic: new Error("network stopped"),
  });
  const result = await activateWorkstationShellWithRepository(repository, command(), {
    ownershipTokenResolver: () => WORKSTATION_SHELL_ACTIVATION_TEST_IDS.token,
  });

  return expectScenario(
    "atomic failure has no retry or fallback mutation",
    result.status === "error" && repository.calls.atomic === 1 && repository.calls.fallback === 0,
    JSON.stringify({ result, calls: repository.calls }),
  );
}

async function scenarioSourceImmutability() {
  const snapshot = buildWorkstationShellActivationSnapshot();
  const before = JSON.stringify(snapshot);
  const repository = new RuntimeWorkstationShellActivationTestRepository({ snapshot });
  await activateWorkstationShellWithRepository(repository, command(), {
    ownershipTokenResolver: () => WORKSTATION_SHELL_ACTIVATION_TEST_IDS.token,
  });

  return expectScenario("source immutability", JSON.stringify(snapshot) === before, before);
}

async function scenarioDownstreamCountersRemainZero() {
  const repository = new RuntimeWorkstationShellActivationTestRepository({
    atomicResult: atomicResult("activated"),
  });
  const result = await activateWorkstationShellWithRepository(repository, command(), {
    ownershipTokenResolver: () => WORKSTATION_SHELL_ACTIVATION_TEST_IDS.token,
  });

  return expectScenario(
    "downstream counters remain zero",
    result.downstream.workstationsActivated === 0 &&
      result.downstream.itemsCompleted === 0 &&
      result.downstream.dependenciesProgressed === 0 &&
      result.downstream.bindingsWritten === 0 &&
      result.downstream.sessionsCompleted === 0 &&
      result.downstream.rollbacksExecuted === 0 &&
      result.downstream.deploymentFinalized === 0,
    JSON.stringify(result.downstream),
  );
}

class RuntimeWorkstationShellActivationTestRepository implements DeploymentWorkstationShellActivationAtomicRepository {
  readonly calls = {
    load: 0,
    atomic: 0,
    fallback: 0,
  };

  private readonly snapshot: DeploymentWorkstationShellActivationSnapshot;
  private readonly atomicResult: DeploymentWorkstationShellActivationAtomicResult;
  private readonly throwOnAtomic: unknown;

  constructor(input: {
    snapshot?: DeploymentWorkstationShellActivationSnapshot;
    atomicResult?: DeploymentWorkstationShellActivationAtomicResult;
    throwOnAtomic?: unknown;
  } = {}) {
    this.snapshot = cloneWorkstationShellActivationSnapshot(input.snapshot ?? buildWorkstationShellActivationSnapshot());
    this.atomicResult = input.atomicResult ?? atomicResult("activated");
    this.throwOnAtomic = input.throwOnAtomic;
  }

  async loadWorkstationShellActivationSnapshot(): Promise<DeploymentWorkstationShellActivationSnapshot> {
    this.calls.load += 1;
    return cloneWorkstationShellActivationSnapshot(this.snapshot);
  }

  async activateWorkstationShellAtomically(
    _command: DeploymentWorkstationShellActivationAtomicCommand,
  ): Promise<DeploymentWorkstationShellActivationAtomicResult> {
    this.calls.atomic += 1;

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
    clinicId: WORKSTATION_SHELL_ACTIVATION_TEST_IDS.clinicId,
    deploymentRunId: WORKSTATION_SHELL_ACTIVATION_TEST_IDS.deploymentRunKey,
    deploymentActivationExecutionClaim: input.claim === undefined ? claim() : input.claim,
    deploymentActivationExecutionNextItemStart: input.nextItem === undefined ? nextItemStart() : input.nextItem,
    workstationActivatedAt: NOW,
  };
}

function claim(input: Partial<ServerDeploymentActivationExecutionClaimResult> = {}): ServerDeploymentActivationExecutionClaimResult {
  return {
    ok: true,
    status: "already_owned",
    sessionId: WORKSTATION_SHELL_ACTIVATION_TEST_IDS.sessionId,
    executionKey: WORKSTATION_SHELL_ACTIVATION_TEST_IDS.executionKey,
    planKey: WORKSTATION_SHELL_ACTIVATION_TEST_IDS.planKey,
    claimantId: WORKSTATION_SHELL_ACTIVATION_TEST_IDS.owner,
    persistedOwnerId: WORKSTATION_SHELL_ACTIVATION_TEST_IDS.owner,
    leaseExpiresAt: WORKSTATION_SHELL_ACTIVATION_TEST_IDS.lease,
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
    message: "Next workstation item started.",
    claimantId: WORKSTATION_SHELL_ACTIVATION_TEST_IDS.owner,
    clinicId: WORKSTATION_SHELL_ACTIVATION_TEST_IDS.clinicId,
    deploymentRunKey: WORKSTATION_SHELL_ACTIVATION_TEST_IDS.deploymentRunKey,
    sessionId: WORKSTATION_SHELL_ACTIVATION_TEST_IDS.sessionId,
    executionKey: WORKSTATION_SHELL_ACTIVATION_TEST_IDS.executionKey,
    planKey: WORKSTATION_SHELL_ACTIVATION_TEST_IDS.planKey,
    itemId: "activation-execution-workstation-item-002",
    executionItemKey: `${WORKSTATION_SHELL_ACTIVATION_TEST_IDS.executionKey}:${WORKSTATION_SHELL_ACTIVATION_TEST_IDS.planKey}:workstation-001`,
    planItemKey: `${WORKSTATION_SHELL_ACTIVATION_TEST_IDS.planKey}:workstation-001`,
    sequence: 2,
    entityType: "workstation_shell",
    entityId: WORKSTATION_SHELL_ACTIVATION_TEST_IDS.workstationId,
    action: "activate",
    attemptCount: 1,
    startedAt: "2026-01-01T12:05:00.000Z",
    leaseExpiresAt: WORKSTATION_SHELL_ACTIVATION_TEST_IDS.lease,
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
  status: DeploymentWorkstationShellActivationAtomicResult["status"],
): DeploymentWorkstationShellActivationAtomicResult {
  return {
    ok: status === "activated" || status === "already_activated",
    status,
    clinicId: WORKSTATION_SHELL_ACTIVATION_TEST_IDS.clinicId,
    deploymentRunKey: WORKSTATION_SHELL_ACTIVATION_TEST_IDS.deploymentRunKey,
    sessionId: WORKSTATION_SHELL_ACTIVATION_TEST_IDS.sessionId,
    executionKey: WORKSTATION_SHELL_ACTIVATION_TEST_IDS.executionKey,
    itemId: "activation-execution-workstation-item-002",
    executionItemKey: `${WORKSTATION_SHELL_ACTIVATION_TEST_IDS.executionKey}:${WORKSTATION_SHELL_ACTIVATION_TEST_IDS.planKey}:workstation-001`,
    planItemKey: `${WORKSTATION_SHELL_ACTIVATION_TEST_IDS.planKey}:workstation-001`,
    sequence: 2,
    workstationId: WORKSTATION_SHELL_ACTIVATION_TEST_IDS.workstationId,
    deploymentWorkstationKey: WORKSTATION_SHELL_ACTIVATION_TEST_IDS.workstationKey,
    workstationStateBefore: {
      deploymentWorkstationKey: WORKSTATION_SHELL_ACTIVATION_TEST_IDS.workstationKey,
      provisioningSource: "setup_draft",
      provisioningStatus: status === "already_activated" ? "active" : "planned",
      active: status === "already_activated",
    },
    workstationStateAfter: {
      deploymentWorkstationKey: WORKSTATION_SHELL_ACTIVATION_TEST_IDS.workstationKey,
      provisioningSource: "setup_draft",
      provisioningStatus: status === "activated" || status === "already_activated" ? "active" : "planned",
      active: status === "activated" || status === "already_activated",
    },
    activatedAt: status === "activated" || status === "already_activated" ? NOW : null,
    issueCode: status === "activated" || status === "already_activated" ? null : "workstation_shell_activation_blocked",
    message: `Atomic workstation shell activation returned ${status}.`,
  };
}

function expectScenario(
  name: string,
  passed: boolean,
  message: string,
): DeploymentWorkstationShellActivationServerHarnessScenario {
  return { name, passed, message };
}