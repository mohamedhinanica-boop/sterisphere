import {
  activateProviderShellWithRepository,
  type DeploymentProviderShellActivationAtomicRepository,
} from "./deployment-provider-shell-activation-server";
import {
  DeploymentProviderShellActivationRepositoryError,
} from "./deployment-provider-shell-activation-supabase-repository";
import {
  buildAlreadyActivatedProviderShellActivationSnapshot,
  buildProviderShellActivationSnapshot,
  PROVIDER_SHELL_ACTIVATION_TEST_IDS,
} from "./deployment-provider-shell-activation-test-repository";
import {
  cloneProviderShellActivationSnapshot,
  type DeploymentProviderShellActivationAtomicCommand,
  type DeploymentProviderShellActivationAtomicResult,
  type DeploymentProviderShellActivationSnapshot,
} from "./deployment-provider-shell-activation-types";
import type {
  ServerDeploymentActivationExecutionClaimResult,
} from "./deployment-activation-execution-claim-server";
import type {
  ServerDeploymentActivationExecutionNextItemStartResult,
} from "./deployment-activation-execution-next-item-start-server";

export interface DeploymentProviderShellActivationServerHarnessScenario {
  name: string;
  passed: boolean;
  message: string;
}

export interface DeploymentProviderShellActivationServerHarnessResult {
  passed: boolean;
  scenarios: readonly DeploymentProviderShellActivationServerHarnessScenario[];
}

const NOW = "2026-01-01T12:10:00.000Z";

export async function runDeploymentProviderShellActivationServerHarness(): Promise<DeploymentProviderShellActivationServerHarnessResult> {
  const scenarios = [
    await scenarioActivatableCallsRpcOnce(),
    await scenarioAlreadyActivatedReusesWithoutRpc(),
    await scenarioNotAttemptedWhenNextItemNotRunning(),
    await scenarioNotAttemptedForNonProviderItem(),
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
  const repository = new RuntimeProviderShellActivationTestRepository({
    atomicResult: atomicResult("activated"),
  });
  const result = await activateProviderShellWithRepository(repository, command(), {
    ownershipTokenResolver: () => PROVIDER_SHELL_ACTIVATION_TEST_IDS.token,
  });

  return expectScenario(
    "activatable provider shell calls atomic activation once",
    result.ok &&
      result.status === "activated" &&
      result.activatedCount === 1 &&
      result.reusedCount === 0 &&
      repository.calls.load === 1 &&
      repository.calls.atomic === 1 &&
      result.provisioningStatusBefore === "placeholder" &&
      result.provisioningStatusAfter === "active" &&
      result.activeBefore === false &&
      result.activeAfter === true,
    JSON.stringify({ result, calls: repository.calls }),
  );
}

async function scenarioAlreadyActivatedReusesWithoutRpc() {
  const repository = new RuntimeProviderShellActivationTestRepository({
    snapshot: buildAlreadyActivatedProviderShellActivationSnapshot(),
  });
  const result = await activateProviderShellWithRepository(repository, command(), {
    ownershipTokenResolver: () => PROVIDER_SHELL_ACTIVATION_TEST_IDS.token,
  });

  return expectScenario(
    "already activated provider shell reuses evidence without RPC",
    result.ok &&
      result.status === "already_activated" &&
      result.reusedCount === 1 &&
      repository.calls.atomic === 0,
    JSON.stringify({ result, calls: repository.calls }),
  );
}

async function scenarioNotAttemptedWhenNextItemNotRunning() {
  const repository = new RuntimeProviderShellActivationTestRepository();
  const result = await activateProviderShellWithRepository(
    repository,
    command({ nextItem: nextItemStart({ ok: false, status: "blocked" }) }),
  );

  return expectScenario(
    "provider activation is not attempted when next item start is unavailable",
    result.status === "not_attempted" && repository.calls.load === 0 && repository.calls.atomic === 0,
    JSON.stringify({ result, calls: repository.calls }),
  );
}

async function scenarioNotAttemptedForNonProviderItem() {
  const repository = new RuntimeProviderShellActivationTestRepository();
  const result = await activateProviderShellWithRepository(
    repository,
    command({ nextItem: nextItemStart({ entityType: "sterilizer_shell", entityId: "sterilizer-001" }) }),
    { ownershipTokenResolver: () => PROVIDER_SHELL_ACTIVATION_TEST_IDS.token },
  );

  return expectScenario(
    "provider activation is not attempted for a non-provider running item",
    result.status === "not_attempted" && result.executionItemKey === nextItemStart().executionItemKey && repository.calls.load === 0 && repository.calls.atomic === 0,
    JSON.stringify({ result, calls: repository.calls }),
  );
}

async function scenarioBlockedAssessmentDoesNotMutate() {
  const repository = new RuntimeProviderShellActivationTestRepository({
    snapshot: buildProviderShellActivationSnapshot({ providerShell: null }),
  });
  const result = await activateProviderShellWithRepository(repository, command(), {
    ownershipTokenResolver: () => PROVIDER_SHELL_ACTIVATION_TEST_IDS.token,
  });

  return expectScenario(
    "blocked assessment returns not_found without atomic mutation",
    result.status === "not_found" && repository.calls.load === 1 && repository.calls.atomic === 0,
    JSON.stringify({ result, calls: repository.calls }),
  );
}

async function scenarioAtomicConflictIsReported() {
  const repository = new RuntimeProviderShellActivationTestRepository({
    atomicResult: atomicResult("conflict"),
  });
  const result = await activateProviderShellWithRepository(repository, command(), {
    ownershipTokenResolver: () => PROVIDER_SHELL_ACTIVATION_TEST_IDS.token,
  });

  return expectScenario(
    "atomic conflict is reported without fallback",
    !result.ok && result.status === "conflict" && result.conflicts === 1 && repository.calls.atomic === 1,
    JSON.stringify({ result, calls: repository.calls }),
  );
}

async function scenarioRepositoryErrorDiagnostics() {
  const repository = new RuntimeProviderShellActivationTestRepository({
    throwOnAtomic: new DeploymentProviderShellActivationRepositoryError({
      layer: "atomic_rpc",
      code: "23514",
      message: "provider activation failed",
      details: "constraint detail",
      hint: "check provider state",
    }),
  });
  const result = await activateProviderShellWithRepository(repository, command(), {
    ownershipTokenResolver: () => PROVIDER_SHELL_ACTIVATION_TEST_IDS.token,
  });
  const diagnostics = result.issues[0]?.diagnostics;

  return expectScenario(
    "atomic repository diagnostics survive server evidence",
    result.status === "error" &&
      diagnostics?.layer === "atomic_rpc" &&
      diagnostics.rpcAttempted === true &&
      diagnostics.errorCode === "23514" &&
      diagnostics.errorDetails === "constraint detail" &&
      diagnostics.errorHint === "check provider state",
    JSON.stringify(result),
  );
}

async function scenarioOwnershipTokenRedaction() {
  const repository = new RuntimeProviderShellActivationTestRepository({
    throwOnAtomic: new DeploymentProviderShellActivationRepositoryError({
      layer: "atomic_rpc",
      code: "XX000",
      message: `leaked ${PROVIDER_SHELL_ACTIVATION_TEST_IDS.token}`,
    }),
  });
  const result = await activateProviderShellWithRepository(repository, command(), {
    ownershipTokenResolver: () => PROVIDER_SHELL_ACTIVATION_TEST_IDS.token,
  });

  return expectScenario(
    "ownership token is redacted from provider activation diagnostics",
    !JSON.stringify(result).includes(PROVIDER_SHELL_ACTIVATION_TEST_IDS.token),
    JSON.stringify(result),
  );
}

async function scenarioNoFallbackMutation() {
  const repository = new RuntimeProviderShellActivationTestRepository({
    throwOnAtomic: new Error("network stopped"),
  });
  const result = await activateProviderShellWithRepository(repository, command(), {
    ownershipTokenResolver: () => PROVIDER_SHELL_ACTIVATION_TEST_IDS.token,
  });

  return expectScenario(
    "atomic failure has no retry or fallback mutation",
    result.status === "error" && repository.calls.atomic === 1 && repository.calls.fallback === 0,
    JSON.stringify({ result, calls: repository.calls }),
  );
}

async function scenarioSourceImmutability() {
  const snapshot = buildProviderShellActivationSnapshot();
  const before = JSON.stringify(snapshot);
  const repository = new RuntimeProviderShellActivationTestRepository({ snapshot });
  await activateProviderShellWithRepository(repository, command(), {
    ownershipTokenResolver: () => PROVIDER_SHELL_ACTIVATION_TEST_IDS.token,
  });

  return expectScenario("source immutability", JSON.stringify(snapshot) === before, before);
}

async function scenarioDownstreamCountersRemainZero() {
  const repository = new RuntimeProviderShellActivationTestRepository({
    atomicResult: atomicResult("activated"),
  });
  const result = await activateProviderShellWithRepository(repository, command(), {
    ownershipTokenResolver: () => PROVIDER_SHELL_ACTIVATION_TEST_IDS.token,
  });

  return expectScenario(
    "downstream counters remain zero",
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

class RuntimeProviderShellActivationTestRepository implements DeploymentProviderShellActivationAtomicRepository {
  readonly calls = {
    load: 0,
    atomic: 0,
    fallback: 0,
  };

  private readonly snapshot: DeploymentProviderShellActivationSnapshot;
  private readonly atomicResult: DeploymentProviderShellActivationAtomicResult;
  private readonly throwOnAtomic: unknown;

  constructor(input: {
    snapshot?: DeploymentProviderShellActivationSnapshot;
    atomicResult?: DeploymentProviderShellActivationAtomicResult;
    throwOnAtomic?: unknown;
  } = {}) {
    this.snapshot = cloneProviderShellActivationSnapshot(input.snapshot ?? buildProviderShellActivationSnapshot());
    this.atomicResult = input.atomicResult ?? atomicResult("activated");
    this.throwOnAtomic = input.throwOnAtomic;
  }

  async loadProviderShellActivationSnapshot(): Promise<DeploymentProviderShellActivationSnapshot> {
    this.calls.load += 1;
    return cloneProviderShellActivationSnapshot(this.snapshot);
  }

  async activateProviderShellAtomically(
    _command: DeploymentProviderShellActivationAtomicCommand,
  ): Promise<DeploymentProviderShellActivationAtomicResult> {
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
    clinicId: PROVIDER_SHELL_ACTIVATION_TEST_IDS.clinicId,
    deploymentRunId: PROVIDER_SHELL_ACTIVATION_TEST_IDS.deploymentRunKey,
    deploymentActivationExecutionClaim: input.claim === undefined ? claim() : input.claim,
    deploymentActivationExecutionNextItemStart: input.nextItem === undefined ? nextItemStart() : input.nextItem,
    providerActivatedAt: NOW,
  };
}

function claim(input: Partial<ServerDeploymentActivationExecutionClaimResult> = {}): ServerDeploymentActivationExecutionClaimResult {
  return {
    ok: true,
    status: "already_owned",
    sessionId: PROVIDER_SHELL_ACTIVATION_TEST_IDS.sessionId,
    executionKey: PROVIDER_SHELL_ACTIVATION_TEST_IDS.executionKey,
    planKey: PROVIDER_SHELL_ACTIVATION_TEST_IDS.planKey,
    claimantId: PROVIDER_SHELL_ACTIVATION_TEST_IDS.owner,
    persistedOwnerId: PROVIDER_SHELL_ACTIVATION_TEST_IDS.owner,
    leaseExpiresAt: PROVIDER_SHELL_ACTIVATION_TEST_IDS.lease,
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
    message: "Next provider item started.",
    claimantId: PROVIDER_SHELL_ACTIVATION_TEST_IDS.owner,
    clinicId: PROVIDER_SHELL_ACTIVATION_TEST_IDS.clinicId,
    deploymentRunKey: PROVIDER_SHELL_ACTIVATION_TEST_IDS.deploymentRunKey,
    sessionId: PROVIDER_SHELL_ACTIVATION_TEST_IDS.sessionId,
    executionKey: PROVIDER_SHELL_ACTIVATION_TEST_IDS.executionKey,
    planKey: PROVIDER_SHELL_ACTIVATION_TEST_IDS.planKey,
    itemId: "activation-execution-provider-item-002",
    executionItemKey: `${PROVIDER_SHELL_ACTIVATION_TEST_IDS.executionKey}:${PROVIDER_SHELL_ACTIVATION_TEST_IDS.planKey}:provider-001`,
    planItemKey: `${PROVIDER_SHELL_ACTIVATION_TEST_IDS.planKey}:provider-001`,
    sequence: 2,
    entityType: "provider_shell",
    entityId: PROVIDER_SHELL_ACTIVATION_TEST_IDS.providerKey,
    action: "activate",
    attemptCount: 1,
    startedAt: "2026-01-01T12:05:00.000Z",
    leaseExpiresAt: PROVIDER_SHELL_ACTIVATION_TEST_IDS.lease,
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
  status: DeploymentProviderShellActivationAtomicResult["status"],
): DeploymentProviderShellActivationAtomicResult {
  return {
    ok: status === "activated" || status === "already_activated",
    status,
    clinicId: PROVIDER_SHELL_ACTIVATION_TEST_IDS.clinicId,
    deploymentRunKey: PROVIDER_SHELL_ACTIVATION_TEST_IDS.deploymentRunKey,
    sessionId: PROVIDER_SHELL_ACTIVATION_TEST_IDS.sessionId,
    executionKey: PROVIDER_SHELL_ACTIVATION_TEST_IDS.executionKey,
    itemId: "activation-execution-provider-item-002",
    executionItemKey: `${PROVIDER_SHELL_ACTIVATION_TEST_IDS.executionKey}:${PROVIDER_SHELL_ACTIVATION_TEST_IDS.planKey}:provider-001`,
    planItemKey: `${PROVIDER_SHELL_ACTIVATION_TEST_IDS.planKey}:provider-001`,
    sequence: 2,
    providerId: `provider-shell-${PROVIDER_SHELL_ACTIVATION_TEST_IDS.providerKey}`,
    deploymentProviderKey: PROVIDER_SHELL_ACTIVATION_TEST_IDS.providerKey,
    providerStateBefore: {
      deploymentProviderKey: PROVIDER_SHELL_ACTIVATION_TEST_IDS.providerKey,
      provisioningSource: "setup_draft",
      provisioningStatus: status === "already_activated" ? "active" : "placeholder",
      active: status === "already_activated",
    },
    providerStateAfter: {
      deploymentProviderKey: PROVIDER_SHELL_ACTIVATION_TEST_IDS.providerKey,
      provisioningSource: "setup_draft",
      provisioningStatus: status === "activated" || status === "already_activated" ? "active" : "placeholder",
      active: status === "activated" || status === "already_activated",
    },
    activatedAt: status === "activated" || status === "already_activated" ? NOW : null,
    issueCode: status === "activated" || status === "already_activated" ? null : "provider_shell_activation_blocked",
    message: `Atomic provider shell activation returned ${status}.`,
  };
}

function expectScenario(
  name: string,
  passed: boolean,
  message: string,
): DeploymentProviderShellActivationServerHarnessScenario {
  return { name, passed, message };
}