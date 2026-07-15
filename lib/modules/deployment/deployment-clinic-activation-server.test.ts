import {
  activateClinicWithRepository,
  type DeploymentClinicActivationAtomicRepository,
} from "./deployment-clinic-activation-server";
import {
  DeploymentClinicActivationRepositoryError,
} from "./deployment-clinic-activation-supabase-repository";
import {
  buildClinicActivationSnapshot,
} from "./deployment-clinic-activation-test-repository";
import {
  cloneClinicActivationSnapshot,
  cloneRecord,
  type DeploymentClinicActivationAtomicCommand,
  type DeploymentClinicActivationAtomicResult,
  type DeploymentClinicActivationSnapshot,
} from "./deployment-clinic-activation-types";
import type {
  ServerDeploymentActivationExecutionClaimResult,
} from "./deployment-activation-execution-claim-server";
import type {
  ServerDeploymentActivationExecutionItemStartResult,
} from "./deployment-activation-execution-item-start-server";

export interface DeploymentClinicActivationServerHarnessScenario {
  name: string;
  passed: boolean;
  message: string;
}

export interface DeploymentClinicActivationServerHarnessResult {
  passed: boolean;
  scenarios: readonly DeploymentClinicActivationServerHarnessScenario[];
}

const CLINIC_ID = "clinic-activation-0001";
const DEPLOYMENT_RUN_ID = "deployment-run-clinic-activation-0001";
const SESSION_ID = "activation-execution-session-clinic-activation-0001";
const EXECUTION_KEY = "activation-execution-deployment-run-clinic-activation-0001";
const ITEM_ID = "activation-execution-item-clinic-0001";
const EXECUTION_ITEM_KEY = `${EXECUTION_KEY}:activation-plan-clinic-activation-0001:clinic`;
const PLAN_ITEM_KEY = "activation-plan-clinic-activation-0001:clinic";
const CLAIMANT_ID = "executor-clinic-activation-001";
const OWNERSHIP_TOKEN = "sensitive-clinic-activation-token";
const ACTIVE_LEASE = "2026-01-01T12:05:00.000Z";
const ITEM_STARTED_AT = "2026-01-01T12:00:30.000Z";
const ACTIVATION_TIME = "2026-01-01T12:01:00.000Z";

export async function runDeploymentClinicActivationServerHarness(): Promise<DeploymentClinicActivationServerHarnessResult> {
  const scenarios = [
    await scenarioFreshActivation(),
    await scenarioAlreadyStartedActivation(),
    await scenarioAlreadyActivatedReuse(),
    await scenarioSkippedWhenItemStartMissing(),
    await scenarioSkippedWhenItemStartBlocked(),
    await scenarioSkippedWhenItemStartConflict(),
    await scenarioSkippedWhenItemStartError(),
    await scenarioSkippedWhenClaimMissing(),
    await scenarioOwnershipTokenMissing(),
    await scenarioSnapshotFailure(),
    await scenarioAssessmentBlocked(),
    await scenarioAssessmentConflict(),
    await scenarioAtomicBlocked(),
    await scenarioAtomicConflict(),
    await scenarioAtomicNotFound(),
    await scenarioAtomicError(),
    await scenarioAtomicThrow(),
    await scenarioRepositoryDiagnosticsSurface(),
    await scenarioUsesSingleTimestamp(),
    await scenarioExpectedItemStartedAtCarried(),
    await scenarioActivatedCounts(),
    await scenarioReuseCounts(),
    await scenarioDownstreamCountersRemainZero(),
    await scenarioTokenRedaction(),
    await scenarioSourceImmutability(),
    await scenarioNoSnapshotOnSkippedPrerequisite(),
    await scenarioNoRpcOnAlreadyActivated(),
    await scenarioNoRpcOnAssessmentBlock(),
    await scenarioNoRetryOrFallbackOnRpcError(),
    await scenarioNoGenericMutationFallbackMethods(),
    await scenarioPreservesItemEvidence(),
    await scenarioPreservesClinicStates(),
    await scenarioClinicCurrentStateConflict(),
    await scenarioMissingClinicIsNotFound(),
    await scenarioStartedPrerequisiteAccepted(),
    await scenarioAlreadyStartedPrerequisiteAccepted(),
  ];

  return {
    passed: scenarios.every((scenario) => scenario.passed),
    scenarios,
  };
}

async function scenarioFreshActivation(): Promise<DeploymentClinicActivationServerHarnessScenario> {
  const repository = repositoryHarness();
  const result = await activate(repository);

  return expectScenario(
    "fresh activation atomically activates clinic row",
    result.ok &&
      result.status === "activated" &&
      result.activatedCount === 1 &&
      result.reusedCount === 0 &&
      result.deployedAt === ACTIVATION_TIME &&
      repository.loadCalls === 1 &&
      repository.atomicCalls.length === 1,
    JSON.stringify(redact(result)),
  );
}

async function scenarioAlreadyStartedActivation(): Promise<DeploymentClinicActivationServerHarnessScenario> {
  const repository = repositoryHarness();
  const result = await activate(repository, { itemStart: itemStart({ status: "already_started", itemStartResult: "already_started", reusedCount: 1, startedCount: 0 }) });

  return expectScenario(
    "already-started item can activate clinic row",
    result.ok && result.status === "activated" && repository.atomicCalls.length === 1,
    JSON.stringify(redact(result)),
  );
}

async function scenarioAlreadyActivatedReuse(): Promise<DeploymentClinicActivationServerHarnessScenario> {
  const deployedAt = "2026-01-01T12:00:45.000Z";
  const repository = repositoryHarness({ snapshot: snapshot({ clinic: { deploymentStatus: "deployed", deployedAt, active: true, provisioningStatus: "deployed", currentState: { clinicId: CLINIC_ID, deploymentStatus: "deployed" } } }) });
  const result = await activate(repository);

  return expectScenario(
    "already active clinic state is reused without RPC",
    result.ok &&
      result.status === "already_activated" &&
      result.reusedCount === 1 &&
      result.deployedAt === deployedAt &&
      repository.atomicCalls.length === 0,
    JSON.stringify(redact(result)),
  );
}

async function scenarioSkippedWhenItemStartMissing(): Promise<DeploymentClinicActivationServerHarnessScenario> {
  return expectSkipped("missing item-start evidence", { itemStart: null });
}

async function scenarioSkippedWhenItemStartBlocked(): Promise<DeploymentClinicActivationServerHarnessScenario> {
  return expectSkipped("blocked item-start evidence", { itemStart: itemStart({ ok: false, status: "blocked", itemStartResult: "blocked" }) });
}

async function scenarioSkippedWhenItemStartConflict(): Promise<DeploymentClinicActivationServerHarnessScenario> {
  return expectSkipped("conflict item-start evidence", { itemStart: itemStart({ ok: false, status: "conflict", itemStartResult: "conflict" }) });
}

async function scenarioSkippedWhenItemStartError(): Promise<DeploymentClinicActivationServerHarnessScenario> {
  return expectSkipped("error item-start evidence", { itemStart: itemStart({ ok: false, status: "error", itemStartResult: "error" }) });
}

async function scenarioSkippedWhenClaimMissing(): Promise<DeploymentClinicActivationServerHarnessScenario> {
  return expectSkipped("missing claim evidence", { claim: null });
}

async function scenarioOwnershipTokenMissing(): Promise<DeploymentClinicActivationServerHarnessScenario> {
  const repository = repositoryHarness();
  const result = await activate(repository, { token: null });

  return expectScenario(
    "missing server ownership token returns safe error before snapshot load",
    !result.ok &&
      result.status === "error" &&
      result.blockers === 1 &&
      repository.loadCalls === 0 &&
      repository.atomicCalls.length === 0,
    JSON.stringify(redact(result)),
  );
}

async function scenarioSnapshotFailure(): Promise<DeploymentClinicActivationServerHarnessScenario> {
  const repository = repositoryHarness({ throwOnLoad: true });
  const result = await activate(repository);

  return expectScenario(
    "snapshot load failure returns safe structured error",
    !result.ok && result.status === "error" && repository.loadCalls === 1 && repository.atomicCalls.length === 0,
    JSON.stringify(redact(result)),
  );
}

async function scenarioAssessmentBlocked(): Promise<DeploymentClinicActivationServerHarnessScenario> {
  const repository = repositoryHarness({ snapshot: snapshot({ session: { leaseExpiresAt: "2026-01-01T11:55:00.000Z" } }) });
  const result = await activate(repository);

  return expectScenario(
    "blocked assessment preserves upstream evidence and skips RPC",
    !result.ok && result.status === "blocked" && result.blockers > 0 && repository.atomicCalls.length === 0,
    JSON.stringify(redact(result)),
  );
}

async function scenarioAssessmentConflict(): Promise<DeploymentClinicActivationServerHarnessScenario> {
  const repository = repositoryHarness({ snapshot: snapshot({ session: { executionOwner: "other-executor" } }) });
  const result = await activate(repository);

  return expectScenario(
    "conflicting assessment skips RPC",
    !result.ok && result.status === "conflict" && result.conflicts === 1 && repository.atomicCalls.length === 0,
    JSON.stringify(redact(result)),
  );
}

async function scenarioAtomicBlocked(): Promise<DeploymentClinicActivationServerHarnessScenario> {
  return expectAtomicStatus("blocked", "blocked");
}

async function scenarioAtomicConflict(): Promise<DeploymentClinicActivationServerHarnessScenario> {
  return expectAtomicStatus("conflict", "conflict");
}

async function scenarioAtomicNotFound(): Promise<DeploymentClinicActivationServerHarnessScenario> {
  return expectAtomicStatus("not_found", "not_found");
}

async function scenarioAtomicError(): Promise<DeploymentClinicActivationServerHarnessScenario> {
  return expectAtomicStatus("error", "error");
}

async function scenarioAtomicThrow(): Promise<DeploymentClinicActivationServerHarnessScenario> {
  const repository = repositoryHarness({ throwOnAtomic: true });
  const result = await activate(repository);

  return expectScenario(
    "atomic RPC exception returns safe structured error",
    !result.ok && result.status === "error" && repository.atomicCalls.length === 1,
    JSON.stringify(redact(result)),
  );
}

async function scenarioRepositoryDiagnosticsSurface(): Promise<DeploymentClinicActivationServerHarnessScenario> {
  const repository = repositoryHarness({
    throwOnAtomicError: new DeploymentClinicActivationRepositoryError(
      "Clinic activation repository query failed.",
      "PGRST202",
      {
        layer: "rpc",
        errorCode: "PGRST202",
        errorMessage: "Could not find the function public.activate_deployment_clinic.",
        errorDetails: "Searched for the function with the supplied argument names.",
        errorHint: "Check the RPC signature.",
      },
    ),
  });
  const result = await activate(repository);
  const diagnosticIssue = result.issues.find((issue) => issue.code === "repository_error");

  return expectScenario(
    "repository diagnostics surface through existing repository_error issue",
    !result.ok &&
      result.status === "error" &&
      diagnosticIssue?.diagnostics?.layer === "rpc" &&
      diagnosticIssue.diagnostics.errorCode === "PGRST202" &&
      diagnosticIssue.diagnostics.errorMessage === "Could not find the function public.activate_deployment_clinic." &&
      diagnosticIssue.diagnostics.errorDetails === "Searched for the function with the supplied argument names." &&
      diagnosticIssue.diagnostics.errorHint === "Check the RPC signature.",
    JSON.stringify(redact(result)),
  );
}
async function scenarioUsesSingleTimestamp(): Promise<DeploymentClinicActivationServerHarnessScenario> {
  const repository = repositoryHarness();
  const result = await activate(repository);
  const atomic = repository.atomicCalls[0];

  return expectScenario(
    "single server timestamp is used for assessment and deployed_at",
    result.deployedAt === ACTIVATION_TIME && atomic?.proposedActivatedAt === ACTIVATION_TIME,
    JSON.stringify({ result: redact(result), atomic: redact(atomic) }),
  );
}

async function scenarioExpectedItemStartedAtCarried(): Promise<DeploymentClinicActivationServerHarnessScenario> {
  const repository = repositoryHarness();
  await activate(repository);

  return expectScenario(
    "item started_at is carried into atomic compare-and-set command",
    repository.atomicCalls[0]?.expectedItemStartedAt === ITEM_STARTED_AT,
    JSON.stringify(redact(repository.atomicCalls[0])),
  );
}

async function scenarioActivatedCounts(): Promise<DeploymentClinicActivationServerHarnessScenario> {
  const result = await activate(repositoryHarness());
  return expectScenario("activated counts", result.activatedCount === 1 && result.reusedCount === 0 && result.conflicts === 0, JSON.stringify(redact(result)));
}

async function scenarioReuseCounts(): Promise<DeploymentClinicActivationServerHarnessScenario> {
  const result = await activate(repositoryHarness({ snapshot: snapshot({ clinic: { deploymentStatus: "deployed", deployedAt: ACTIVATION_TIME, active: true, provisioningStatus: "deployed", currentState: { clinicId: CLINIC_ID, deploymentStatus: "deployed" } } }) }));
  return expectScenario("reuse counts", result.activatedCount === 0 && result.reusedCount === 1 && result.conflicts === 0, JSON.stringify(redact(result)));
}

async function scenarioDownstreamCountersRemainZero(): Promise<DeploymentClinicActivationServerHarnessScenario> {
  const result = await activate(repositoryHarness());
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

async function scenarioTokenRedaction(): Promise<DeploymentClinicActivationServerHarnessScenario> {
  const repository = repositoryHarness({ snapshot: snapshot({ session: { ownershipToken: "different-sensitive-token" } }) });
  const result = await activate(repository);
  const evidence = JSON.stringify(redact(result));

  return expectScenario(
    "ownership token remains server-only and redacted from evidence",
    !evidence.includes(OWNERSHIP_TOKEN) && !evidence.includes("different-sensitive-token"),
    evidence,
  );
}

async function scenarioSourceImmutability(): Promise<DeploymentClinicActivationServerHarnessScenario> {
  const source = snapshot();
  const before = JSON.stringify(source);
  await activate(repositoryHarness({ snapshot: source }));

  return expectScenario("source snapshot remains immutable", JSON.stringify(source) === before, "source snapshot unchanged");
}

async function scenarioNoSnapshotOnSkippedPrerequisite(): Promise<DeploymentClinicActivationServerHarnessScenario> {
  const repository = repositoryHarness();
  await activate(repository, { itemStart: itemStart({ ok: false, status: "blocked", itemStartResult: "blocked" }) });

  return expectScenario("skipped prerequisite does not load snapshot", repository.loadCalls === 0 && repository.atomicCalls.length === 0, JSON.stringify(repository.stats));
}

async function scenarioNoRpcOnAlreadyActivated(): Promise<DeploymentClinicActivationServerHarnessScenario> {
  const repository = repositoryHarness({ snapshot: snapshot({ clinic: { deploymentStatus: "deployed", deployedAt: ACTIVATION_TIME, active: true, provisioningStatus: "deployed", currentState: { clinicId: CLINIC_ID, deploymentStatus: "deployed" } } }) });
  await activate(repository);

  return expectScenario("already activated reuse does not call RPC", repository.loadCalls === 1 && repository.atomicCalls.length === 0, JSON.stringify(repository.stats));
}

async function scenarioNoRpcOnAssessmentBlock(): Promise<DeploymentClinicActivationServerHarnessScenario> {
  const repository = repositoryHarness({ snapshot: snapshot({ item: { completedAt: ACTIVATION_TIME } }) });
  await activate(repository);

  return expectScenario("blocked assessment does not call RPC", repository.loadCalls === 1 && repository.atomicCalls.length === 0, JSON.stringify(repository.stats));
}

async function scenarioNoRetryOrFallbackOnRpcError(): Promise<DeploymentClinicActivationServerHarnessScenario> {
  const repository = repositoryHarness({ throwOnAtomic: true });
  await activate(repository);

  return expectScenario("RPC error is not retried and no fallback mutation exists", repository.atomicCalls.length === 1 && repository.genericMutationCalls === 0, JSON.stringify(repository.stats));
}

async function scenarioNoGenericMutationFallbackMethods(): Promise<DeploymentClinicActivationServerHarnessScenario> {
  const repository = repositoryHarness();
  const prototype = Object.getPrototypeOf(repository) as Record<string, unknown>;
  const forbidden = ["update", "insert", "upsert", "delete", "completeItem", "unlockDependencies", "finalizeDeployment", "activateProvider", "activateHardware", "bindHardware"];

  return expectScenario(
    "server repository exposes no generic fallback mutation methods",
    forbidden.every((method) => !(method in prototype)),
    forbidden.filter((method) => method in prototype).join(","),
  );
}

async function scenarioPreservesItemEvidence(): Promise<DeploymentClinicActivationServerHarnessScenario> {
  const result = await activate(repositoryHarness());
  return expectScenario("item evidence is preserved", result.itemId === ITEM_ID && result.executionItemKey === EXECUTION_ITEM_KEY && result.planItemKey === PLAN_ITEM_KEY, JSON.stringify(redact(result)));
}

async function scenarioPreservesClinicStates(): Promise<DeploymentClinicActivationServerHarnessScenario> {
  const result = await activate(repositoryHarness());
  return expectScenario("clinic before/after states are returned", result.currentClinicState?.deploymentStatus === "draft" && result.targetClinicState?.deploymentStatus === "deployed", JSON.stringify(redact(result)));
}

async function scenarioClinicCurrentStateConflict(): Promise<DeploymentClinicActivationServerHarnessScenario> {
  const repository = repositoryHarness({ snapshot: snapshot({ clinic: { currentState: { clinicId: CLINIC_ID, deploymentStatus: "staged" } } }) });
  const result = await activate(repository);
  return expectScenario("clinic current state drift blocks activation", !result.ok && result.status === "blocked" && repository.atomicCalls.length === 0, JSON.stringify(redact(result)));
}

async function scenarioMissingClinicIsNotFound(): Promise<DeploymentClinicActivationServerHarnessScenario> {
  const repository = repositoryHarness({ snapshot: snapshot({ clinic: null }) });
  const result = await activate(repository);
  return expectScenario("missing clinic returns not_found", !result.ok && result.status === "not_found" && repository.atomicCalls.length === 0, JSON.stringify(redact(result)));
}

async function scenarioStartedPrerequisiteAccepted(): Promise<DeploymentClinicActivationServerHarnessScenario> {
  const repository = repositoryHarness();
  const result = await activate(repository, { itemStart: itemStart({ status: "started", itemStartResult: "started" }) });
  return expectScenario("started item-start prerequisite is accepted", result.ok && repository.atomicCalls.length === 1, JSON.stringify(redact(result)));
}

async function scenarioAlreadyStartedPrerequisiteAccepted(): Promise<DeploymentClinicActivationServerHarnessScenario> {
  const repository = repositoryHarness();
  const result = await activate(repository, { itemStart: itemStart({ status: "already_started", itemStartResult: "already_started", startedCount: 0, reusedCount: 1 }) });
  return expectScenario("already_started item-start prerequisite is accepted", result.ok && repository.atomicCalls.length === 1, JSON.stringify(redact(result)));
}

async function expectSkipped(
  name: string,
  input: Partial<ActivationInput>,
): Promise<DeploymentClinicActivationServerHarnessScenario> {
  const repository = repositoryHarness();
  const result = await activate(repository, input);

  return expectScenario(
    name,
    !result.ok && result.status === "not_attempted" && repository.loadCalls === 0 && repository.atomicCalls.length === 0,
    JSON.stringify(redact(result)),
  );
}

async function expectAtomicStatus(
  atomicStatus: DeploymentClinicActivationAtomicResult["status"],
  expectedStatus: string,
): Promise<DeploymentClinicActivationServerHarnessScenario> {
  const repository = repositoryHarness({ atomicResult: atomicResult({ status: atomicStatus, ok: false, issueCode: "atomic_check_failed" }) });
  const result = await activate(repository);

  return expectScenario(
    `atomic ${atomicStatus} maps safely`,
    !result.ok && result.status === expectedStatus && repository.atomicCalls.length === 1,
    JSON.stringify(redact(result)),
  );
}

interface ActivationInput {
  claim: ServerDeploymentActivationExecutionClaimResult | null;
  itemStart: ServerDeploymentActivationExecutionItemStartResult | null;
  token: string | null;
}

async function activate(
  repository: MockClinicActivationRepository,
  input: Partial<ActivationInput> = {},
) {
  return activateClinicWithRepository(
    repository,
    {
      clinicId: CLINIC_ID,
      deploymentRunId: DEPLOYMENT_RUN_ID,
      deploymentActivationExecutionClaim: input.claim === undefined ? claim() : input.claim,
      deploymentActivationExecutionItemStart: input.itemStart === undefined ? itemStart() : input.itemStart,
      activationRequestedAt: ACTIVATION_TIME,
    },
    {
      claimantId: CLAIMANT_ID,
      ownershipTokenResolver: () => input.token === undefined ? OWNERSHIP_TOKEN : input.token,
    },
  );
}

function repositoryHarness(input: {
  snapshot?: DeploymentClinicActivationSnapshot;
  atomicResult?: DeploymentClinicActivationAtomicResult;
  throwOnLoad?: boolean;
  throwOnAtomic?: boolean;
  throwOnAtomicError?: Error;
} = {}): MockClinicActivationRepository {
  return new MockClinicActivationRepository(input);
}

class MockClinicActivationRepository implements DeploymentClinicActivationAtomicRepository {
  loadCalls = 0;
  atomicCalls: DeploymentClinicActivationAtomicCommand[] = [];
  genericMutationCalls = 0;
  private readonly snapshot: DeploymentClinicActivationSnapshot;
  private readonly result: DeploymentClinicActivationAtomicResult;
  private readonly throwOnLoad: boolean;
  private readonly throwOnAtomic: boolean;
  private readonly throwOnAtomicError: Error | null;

  constructor(input: {
    snapshot?: DeploymentClinicActivationSnapshot;
    atomicResult?: DeploymentClinicActivationAtomicResult;
    throwOnLoad?: boolean;
    throwOnAtomic?: boolean;
    throwOnAtomicError?: Error;
  } = {}) {
    this.snapshot = cloneClinicActivationSnapshot(input.snapshot ?? snapshot());
    this.result = input.atomicResult ?? atomicResult();
    this.throwOnLoad = input.throwOnLoad ?? false;
    this.throwOnAtomic = input.throwOnAtomic ?? false;
    this.throwOnAtomicError = input.throwOnAtomicError ?? null;
  }

  get stats(): Record<string, unknown> {
    return {
      loadCalls: this.loadCalls,
      atomicCalls: this.atomicCalls.length,
      genericMutationCalls: this.genericMutationCalls,
    };
  }

  async loadClinicActivationSnapshot(): Promise<DeploymentClinicActivationSnapshot> {
    this.loadCalls += 1;

    if (this.throwOnLoad) {
      throw new Error("snapshot load failed");
    }

    return cloneClinicActivationSnapshot(this.snapshot);
  }

  async activateClinicAtomically(
    command: DeploymentClinicActivationAtomicCommand,
  ): Promise<DeploymentClinicActivationAtomicResult> {
    this.atomicCalls.push({
      ...command,
      expectedCurrentState: cloneRecord(command.expectedCurrentState),
      targetState: cloneRecord(command.targetState),
    });

    if (this.throwOnAtomicError) {
      throw this.throwOnAtomicError;
    }

    if (this.throwOnAtomic) {
      throw new Error("atomic clinic activation failed");
    }

    return {
      ...this.result,
      clinicStateBefore: this.result.clinicStateBefore
        ? cloneRecord(this.result.clinicStateBefore)
        : null,
      clinicStateAfter: this.result.clinicStateAfter
        ? cloneRecord(this.result.clinicStateAfter)
        : null,
    };
  }
}

function claim(input: Partial<ServerDeploymentActivationExecutionClaimResult> = {}): ServerDeploymentActivationExecutionClaimResult {
  return {
    ok: true,
    status: "claimed",
    sessionId: SESSION_ID,
    executionKey: EXECUTION_KEY,
    planKey: "activation-plan-clinic-activation-0001",
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

function itemStart(input: Partial<ServerDeploymentActivationExecutionItemStartResult> = {}): ServerDeploymentActivationExecutionItemStartResult {
  return {
    ok: true,
    status: "started",
    claimantId: CLAIMANT_ID,
    sessionId: SESSION_ID,
    executionKey: EXECUTION_KEY,
    itemId: ITEM_ID,
    executionItemKey: EXECUTION_ITEM_KEY,
    planItemKey: PLAN_ITEM_KEY,
    sequence: 1,
    entityType: "clinic",
    entityKey: CLINIC_ID,
    entityId: CLINIC_ID,
    action: "activate",
    itemExecutionStatus: "running",
    attemptCount: 1,
    startedAt: ITEM_STARTED_AT,
    leaseExpiresAt: ACTIVE_LEASE,
    dependencyCount: 0,
    reversible: true,
    itemStartResult: "started",
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
      deploymentFinalized: 0,
    },
    message: "Execution item was started.",
    ...input,
  };
}

function snapshot(
  input: Parameters<typeof buildClinicActivationSnapshot>[0] = {},
): DeploymentClinicActivationSnapshot {
  return buildClinicActivationSnapshot(input);
}

function atomicResult(
  input: Partial<DeploymentClinicActivationAtomicResult> = {},
): DeploymentClinicActivationAtomicResult {
  return {
    ok: true,
    status: "activated",
    clinicId: CLINIC_ID,
    deploymentRunId: DEPLOYMENT_RUN_ID,
    sessionId: SESSION_ID,
    executionKey: EXECUTION_KEY,
    itemId: ITEM_ID,
    executionItemKey: EXECUTION_ITEM_KEY,
    planItemKey: PLAN_ITEM_KEY,
    clinicStateBefore: { clinicId: CLINIC_ID, deploymentStatus: "draft" },
    clinicStateAfter: { clinicId: CLINIC_ID, deploymentStatus: "deployed" },
    activatedAt: ACTIVATION_TIME,
    issueCode: null,
    message: "Clinic deployment status was activated. Execution item remains running.",
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
): DeploymentClinicActivationServerHarnessScenario {
  return { name, passed, message };
}