import {
  activateSterilizerShellWithRepository,
  type DeploymentSterilizerShellActivationAtomicRepository,
} from "./deployment-sterilizer-shell-activation-server";
import {
  DeploymentSterilizerShellActivationRepositoryError,
} from "./deployment-sterilizer-shell-activation-supabase-repository";
import {
  buildAlreadyActivatedSterilizerShellActivationSnapshot,
  buildSterilizerShellActivationSnapshot,
  STERILIZER_SHELL_ACTIVATION_TEST_IDS,
} from "./deployment-sterilizer-shell-activation-test-repository";
import {
  cloneSterilizerShellActivationSnapshot,
  type DeploymentSterilizerShellActivationAtomicCommand,
  type DeploymentSterilizerShellActivationAtomicResult,
  type DeploymentSterilizerShellActivationSnapshot,
} from "./deployment-sterilizer-shell-activation-types";
import type {
  ServerDeploymentActivationExecutionClaimResult,
} from "./deployment-activation-execution-claim-server";
import type {
  ServerDeploymentActivationExecutionNextItemStartResult,
} from "./deployment-activation-execution-next-item-start-server";

export interface DeploymentSterilizerShellActivationServerHarnessScenario {
  name: string;
  passed: boolean;
  message: string;
}

export interface DeploymentSterilizerShellActivationServerHarnessResult {
  passed: boolean;
  scenarios: readonly DeploymentSterilizerShellActivationServerHarnessScenario[];
}

const NOW = "2026-01-01T12:10:00.000Z";

export async function runDeploymentSterilizerShellActivationServerHarness(): Promise<DeploymentSterilizerShellActivationServerHarnessResult> {
  const scenarios = [
    await scenarioActivatableCallsRpcOnce(),
    await scenarioAlreadyActivatedReusesWithoutRpc(),
    await scenarioNotAttemptedWhenNextItemNotRunning(),
    await scenarioNotAttemptedForNonSterilizerItem(),
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
  const repository = new RuntimeSterilizerShellActivationTestRepository({
    atomicResult: atomicResult("activated"),
  });
  const result = await activateSterilizerShellWithRepository(repository, command(), {
    ownershipTokenResolver: () => STERILIZER_SHELL_ACTIVATION_TEST_IDS.token,
  });

  return expectScenario(
    "activatable sterilizer shell calls atomic activation once",
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
  const repository = new RuntimeSterilizerShellActivationTestRepository({
    snapshot: buildAlreadyActivatedSterilizerShellActivationSnapshot(),
  });
  const result = await activateSterilizerShellWithRepository(repository, command(), {
    ownershipTokenResolver: () => STERILIZER_SHELL_ACTIVATION_TEST_IDS.token,
  });

  return expectScenario(
    "already activated sterilizer shell reuses evidence without RPC",
    result.ok &&
      result.status === "already_activated" &&
      result.reusedCount === 1 &&
      repository.calls.atomic === 0,
    JSON.stringify({ result, calls: repository.calls }),
  );
}

async function scenarioNotAttemptedWhenNextItemNotRunning() {
  const repository = new RuntimeSterilizerShellActivationTestRepository();
  const result = await activateSterilizerShellWithRepository(
    repository,
    command({ nextItem: nextItemStart({ ok: false, status: "blocked" }) }),
  );

  return expectScenario(
    "sterilizer activation is not attempted when next item start is unavailable",
    result.status === "not_attempted" && repository.calls.load === 0 && repository.calls.atomic === 0,
    JSON.stringify({ result, calls: repository.calls }),
  );
}

async function scenarioNotAttemptedForNonSterilizerItem() {
  const repository = new RuntimeSterilizerShellActivationTestRepository();
  const result = await activateSterilizerShellWithRepository(
    repository,
    command({ nextItem: nextItemStart({ entityType: "sterilizer_shell", entityId: "sterilizer-001" }) }),
    { ownershipTokenResolver: () => STERILIZER_SHELL_ACTIVATION_TEST_IDS.token },
  );

  return expectScenario(
    "sterilizer activation is not attempted for a non-sterilizer running item",
    result.status === "not_attempted" && result.executionItemKey === nextItemStart().executionItemKey && repository.calls.load === 0 && repository.calls.atomic === 0,
    JSON.stringify({ result, calls: repository.calls }),
  );
}

async function scenarioBlockedAssessmentDoesNotMutate() {
  const repository = new RuntimeSterilizerShellActivationTestRepository({
    snapshot: buildSterilizerShellActivationSnapshot({ sterilizerShell: null }),
  });
  const result = await activateSterilizerShellWithRepository(repository, command(), {
    ownershipTokenResolver: () => STERILIZER_SHELL_ACTIVATION_TEST_IDS.token,
  });

  return expectScenario(
    "blocked assessment returns not_found without atomic mutation",
    result.status === "not_found" && repository.calls.load === 1 && repository.calls.atomic === 0,
    JSON.stringify({ result, calls: repository.calls }),
  );
}

async function scenarioAtomicConflictIsReported() {
  const repository = new RuntimeSterilizerShellActivationTestRepository({
    atomicResult: atomicResult("conflict"),
  });
  const result = await activateSterilizerShellWithRepository(repository, command(), {
    ownershipTokenResolver: () => STERILIZER_SHELL_ACTIVATION_TEST_IDS.token,
  });

  return expectScenario(
    "atomic conflict is reported without fallback",
    !result.ok && result.status === "conflict" && result.conflicts === 1 && repository.calls.atomic === 1,
    JSON.stringify({ result, calls: repository.calls }),
  );
}

async function scenarioRepositoryErrorDiagnostics() {
  const repository = new RuntimeSterilizerShellActivationTestRepository({
    throwOnAtomic: new DeploymentSterilizerShellActivationRepositoryError({
      layer: "atomic_rpc",
      code: "23514",
      message: "sterilizer activation failed",
      details: "constraint detail",
      hint: "check sterilizer state",
    }),
  });
  const result = await activateSterilizerShellWithRepository(repository, command(), {
    ownershipTokenResolver: () => STERILIZER_SHELL_ACTIVATION_TEST_IDS.token,
  });
  const diagnostics = result.issues[0]?.diagnostics;

  return expectScenario(
    "atomic repository diagnostics survive server evidence",
    result.status === "error" &&
      diagnostics?.layer === "atomic_rpc" &&
      diagnostics.rpcAttempted === true &&
      diagnostics.errorCode === "23514" &&
      diagnostics.errorDetails === "constraint detail" &&
      diagnostics.errorHint === "check sterilizer state",
    JSON.stringify(result),
  );
}

async function scenarioOwnershipTokenRedaction() {
  const repository = new RuntimeSterilizerShellActivationTestRepository({
    throwOnAtomic: new DeploymentSterilizerShellActivationRepositoryError({
      layer: "atomic_rpc",
      code: "XX000",
      message: `leaked ${STERILIZER_SHELL_ACTIVATION_TEST_IDS.token}`,
    }),
  });
  const result = await activateSterilizerShellWithRepository(repository, command(), {
    ownershipTokenResolver: () => STERILIZER_SHELL_ACTIVATION_TEST_IDS.token,
  });

  return expectScenario(
    "ownership token is redacted from sterilizer activation diagnostics",
    !JSON.stringify(result).includes(STERILIZER_SHELL_ACTIVATION_TEST_IDS.token),
    JSON.stringify(result),
  );
}

async function scenarioNoFallbackMutation() {
  const repository = new RuntimeSterilizerShellActivationTestRepository({
    throwOnAtomic: new Error("network stopped"),
  });
  const result = await activateSterilizerShellWithRepository(repository, command(), {
    ownershipTokenResolver: () => STERILIZER_SHELL_ACTIVATION_TEST_IDS.token,
  });

  return expectScenario(
    "atomic failure has no retry or fallback mutation",
    result.status === "error" && repository.calls.atomic === 1 && repository.calls.fallback === 0,
    JSON.stringify({ result, calls: repository.calls }),
  );
}

async function scenarioSourceImmutability() {
  const snapshot = buildSterilizerShellActivationSnapshot();
  const before = JSON.stringify(snapshot);
  const repository = new RuntimeSterilizerShellActivationTestRepository({ snapshot });
  await activateSterilizerShellWithRepository(repository, command(), {
    ownershipTokenResolver: () => STERILIZER_SHELL_ACTIVATION_TEST_IDS.token,
  });

  return expectScenario("source immutability", JSON.stringify(snapshot) === before, before);
}

async function scenarioDownstreamCountersRemainZero() {
  const repository = new RuntimeSterilizerShellActivationTestRepository({
    atomicResult: atomicResult("activated"),
  });
  const result = await activateSterilizerShellWithRepository(repository, command(), {
    ownershipTokenResolver: () => STERILIZER_SHELL_ACTIVATION_TEST_IDS.token,
  });

  return expectScenario(
    "downstream counters remain zero",
    result.downstream.sterilizersActivated === 0 &&
      result.downstream.itemsCompleted === 0 &&
      result.downstream.dependenciesProgressed === 0 &&
      result.downstream.bindingsWritten === 0 &&
      result.downstream.sessionsCompleted === 0 &&
      result.downstream.rollbacksExecuted === 0 &&
      result.downstream.deploymentFinalized === 0,
    JSON.stringify(result.downstream),
  );
}

class RuntimeSterilizerShellActivationTestRepository implements DeploymentSterilizerShellActivationAtomicRepository {
  readonly calls = {
    load: 0,
    atomic: 0,
    fallback: 0,
  };

  private readonly snapshot: DeploymentSterilizerShellActivationSnapshot;
  private readonly atomicResult: DeploymentSterilizerShellActivationAtomicResult;
  private readonly throwOnAtomic: unknown;

  constructor(input: {
    snapshot?: DeploymentSterilizerShellActivationSnapshot;
    atomicResult?: DeploymentSterilizerShellActivationAtomicResult;
    throwOnAtomic?: unknown;
  } = {}) {
    this.snapshot = cloneSterilizerShellActivationSnapshot(input.snapshot ?? buildSterilizerShellActivationSnapshot());
    this.atomicResult = input.atomicResult ?? atomicResult("activated");
    this.throwOnAtomic = input.throwOnAtomic;
  }

  async loadSterilizerShellActivationSnapshot(): Promise<DeploymentSterilizerShellActivationSnapshot> {
    this.calls.load += 1;
    return cloneSterilizerShellActivationSnapshot(this.snapshot);
  }

  async activateSterilizerShellAtomically(
    _command: DeploymentSterilizerShellActivationAtomicCommand,
  ): Promise<DeploymentSterilizerShellActivationAtomicResult> {
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
    clinicId: STERILIZER_SHELL_ACTIVATION_TEST_IDS.clinicId,
    deploymentRunId: STERILIZER_SHELL_ACTIVATION_TEST_IDS.deploymentRunKey,
    deploymentActivationExecutionClaim: input.claim === undefined ? claim() : input.claim,
    deploymentActivationExecutionNextItemStart: input.nextItem === undefined ? nextItemStart() : input.nextItem,
    sterilizerActivatedAt: NOW,
  };
}

function claim(input: Partial<ServerDeploymentActivationExecutionClaimResult> = {}): ServerDeploymentActivationExecutionClaimResult {
  return {
    ok: true,
    status: "already_owned",
    sessionId: STERILIZER_SHELL_ACTIVATION_TEST_IDS.sessionId,
    executionKey: STERILIZER_SHELL_ACTIVATION_TEST_IDS.executionKey,
    planKey: STERILIZER_SHELL_ACTIVATION_TEST_IDS.planKey,
    claimantId: STERILIZER_SHELL_ACTIVATION_TEST_IDS.owner,
    persistedOwnerId: STERILIZER_SHELL_ACTIVATION_TEST_IDS.owner,
    leaseExpiresAt: STERILIZER_SHELL_ACTIVATION_TEST_IDS.lease,
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
    message: "Next sterilizer item started.",
    claimantId: STERILIZER_SHELL_ACTIVATION_TEST_IDS.owner,
    clinicId: STERILIZER_SHELL_ACTIVATION_TEST_IDS.clinicId,
    deploymentRunKey: STERILIZER_SHELL_ACTIVATION_TEST_IDS.deploymentRunKey,
    sessionId: STERILIZER_SHELL_ACTIVATION_TEST_IDS.sessionId,
    executionKey: STERILIZER_SHELL_ACTIVATION_TEST_IDS.executionKey,
    planKey: STERILIZER_SHELL_ACTIVATION_TEST_IDS.planKey,
    itemId: "activation-execution-sterilizer-item-002",
    executionItemKey: `${STERILIZER_SHELL_ACTIVATION_TEST_IDS.executionKey}:${STERILIZER_SHELL_ACTIVATION_TEST_IDS.planKey}:sterilizer-001`,
    planItemKey: `${STERILIZER_SHELL_ACTIVATION_TEST_IDS.planKey}:sterilizer-001`,
    sequence: 2,
    entityType: "sterilizer_shell",
    entityId: STERILIZER_SHELL_ACTIVATION_TEST_IDS.sterilizerKey,
    action: "activate",
    attemptCount: 1,
    startedAt: "2026-01-01T12:05:00.000Z",
    leaseExpiresAt: STERILIZER_SHELL_ACTIVATION_TEST_IDS.lease,
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
  status: DeploymentSterilizerShellActivationAtomicResult["status"],
): DeploymentSterilizerShellActivationAtomicResult {
  return {
    ok: status === "activated" || status === "already_activated",
    status,
    clinicId: STERILIZER_SHELL_ACTIVATION_TEST_IDS.clinicId,
    deploymentRunKey: STERILIZER_SHELL_ACTIVATION_TEST_IDS.deploymentRunKey,
    sessionId: STERILIZER_SHELL_ACTIVATION_TEST_IDS.sessionId,
    executionKey: STERILIZER_SHELL_ACTIVATION_TEST_IDS.executionKey,
    itemId: "activation-execution-sterilizer-item-002",
    executionItemKey: `${STERILIZER_SHELL_ACTIVATION_TEST_IDS.executionKey}:${STERILIZER_SHELL_ACTIVATION_TEST_IDS.planKey}:sterilizer-001`,
    planItemKey: `${STERILIZER_SHELL_ACTIVATION_TEST_IDS.planKey}:sterilizer-001`,
    sequence: 2,
    sterilizerId: `sterilizer-shell-${STERILIZER_SHELL_ACTIVATION_TEST_IDS.sterilizerKey}`,
    deploymentSterilizerKey: STERILIZER_SHELL_ACTIVATION_TEST_IDS.sterilizerKey,
    sterilizerStateBefore: {
      deploymentSterilizerKey: STERILIZER_SHELL_ACTIVATION_TEST_IDS.sterilizerKey,
      provisioningSource: "setup_draft",
      provisioningStatus: status === "already_activated" ? "active" : "placeholder",
      active: status === "already_activated",
    },
    sterilizerStateAfter: {
      deploymentSterilizerKey: STERILIZER_SHELL_ACTIVATION_TEST_IDS.sterilizerKey,
      provisioningSource: "setup_draft",
      provisioningStatus: status === "activated" || status === "already_activated" ? "active" : "placeholder",
      active: status === "activated" || status === "already_activated",
    },
    activatedAt: status === "activated" || status === "already_activated" ? NOW : null,
    issueCode: status === "activated" || status === "already_activated" ? null : "sterilizer_shell_activation_blocked",
    message: `Atomic sterilizer shell activation returned ${status}.`,
  };
}

function expectScenario(
  name: string,
  passed: boolean,
  message: string,
): DeploymentSterilizerShellActivationServerHarnessScenario {
  return { name, passed, message };
}