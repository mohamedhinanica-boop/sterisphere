import { buildClinicActivationCurrentState } from "./deployment-activation-current-state";
import { DeploymentActivationExecutionPersistenceService } from "./deployment-activation-execution-persistence-service";
import { persistActivationExecutionWithService } from "./deployment-activation-execution-persistence-server";
import { InMemoryDeploymentActivationExecutionPersistenceTestRepository } from "./deployment-activation-execution-persistence-test-repository";
import type { DeploymentActivationExecutionItem } from "./deployment-activation-execution-types";
import type { ServerDeploymentActivationExecutionResult } from "./deployment-activation-execution-server";

export interface DeploymentActivationExecutionPersistenceServerHarnessScenario {
  name: string;
  passed: boolean;
  message: string;
}

export interface DeploymentActivationExecutionPersistenceServerHarnessResult {
  passed: boolean;
  scenarios: readonly DeploymentActivationExecutionPersistenceServerHarnessScenario[];
}

const CLINIC_ID = "clinic-execution-persistence-runtime-0001";
const DEPLOYMENT_RUN_ID = "deployment-run-execution-persistence-runtime-0001";
const EXECUTION_KEY = `activation-execution-${DEPLOYMENT_RUN_ID}`;
const PLAN_KEY = `activation-plan-${DEPLOYMENT_RUN_ID}`;

export async function runDeploymentActivationExecutionPersistenceServerHarness(): Promise<DeploymentActivationExecutionPersistenceServerHarnessResult> {
  const scenarios = [
    await scenarioReadyPreparationCreatesSessionAndItems(),
    await scenarioReuseReturnsSameSession(),
    await scenarioPartialExistingItems(),
    await scenarioBlockedPreparationSkipsPersistence(),
    await scenarioRepositoryErrorReturnsSafeEvidence(),
    await scenarioOrderingAndCountersRemainPreparedOnly(),
    await scenarioSourcePreparationUnmodified(),
  ];

  return {
    passed: scenarios.every((scenario) => scenario.passed),
    scenarios,
  };
}

async function scenarioReadyPreparationCreatesSessionAndItems(): Promise<DeploymentActivationExecutionPersistenceServerHarnessScenario> {
  const repository = new InMemoryDeploymentActivationExecutionPersistenceTestRepository();
  const result = await persist(repository);

  return expectScenario(
    "ready execution preparation creates session and items",
    result.ok &&
      result.status === "created" &&
      result.sessionCreated === 1 &&
      result.itemsCreated === preparation().executionItems.length &&
      repository.sessions.length === 1 &&
      repository.items.length === preparation().executionItems.length,
    JSON.stringify(result),
  );
}

async function scenarioReuseReturnsSameSession(): Promise<DeploymentActivationExecutionPersistenceServerHarnessScenario> {
  const repository = new InMemoryDeploymentActivationExecutionPersistenceTestRepository();
  const first = await persist(repository);
  const second = await persist(repository);

  return expectScenario(
    "Verify/Reuse reuses same prepared session and items",
    second.ok &&
      second.status === "reused" &&
      second.sessionId === first.sessionId &&
      second.sessionReused === 1 &&
      second.itemsCreated === 0 &&
      second.itemsReused === preparation().executionItems.length,
    JSON.stringify({ first, second }),
  );
}

async function scenarioPartialExistingItems(): Promise<DeploymentActivationExecutionPersistenceServerHarnessScenario> {
  const repository = new InMemoryDeploymentActivationExecutionPersistenceTestRepository();
  await persist(repository);
  const seededSession = repository.sessions[0];
  const seededItem = repository.items[0];
  const partialRepository = new InMemoryDeploymentActivationExecutionPersistenceTestRepository({
    sessions: [seededSession],
    items: [seededItem],
  });
  const result = await persist(partialRepository);

  return expectScenario(
    "partial existing durable items create only missing rows",
    result.ok &&
      result.status === "partial" &&
      result.sessionReused === 1 &&
      result.itemsReused === 1 &&
      result.itemsCreated === preparation().executionItems.length - 1,
    JSON.stringify(result),
  );
}

async function scenarioBlockedPreparationSkipsPersistence(): Promise<DeploymentActivationExecutionPersistenceServerHarnessScenario> {
  const repository = new InMemoryDeploymentActivationExecutionPersistenceTestRepository();
  const result = await persist(repository, {
    deploymentActivationExecution: preparation({
      ok: false,
      status: "blocked",
      blockers: 1,
    }),
  });

  return expectScenario(
    "blocked preparation skips persistence",
    result.status === "not_attempted" &&
      repository.calls.createPreparedSession === 0 &&
      repository.calls.createPreparedItem === 0,
    JSON.stringify(result),
  );
}

async function scenarioRepositoryErrorReturnsSafeEvidence(): Promise<DeploymentActivationExecutionPersistenceServerHarnessScenario> {
  const repository = new InMemoryDeploymentActivationExecutionPersistenceTestRepository({
    shouldThrow: true,
  });
  const result = await persist(repository);

  return expectScenario(
    "repository error preserves safe structured evidence",
    result.status === "error" &&
      result.blockers === 1 &&
      result.itemsCreated === 0 &&
      result.downstream.itemsStarted === 0,
    JSON.stringify(result),
  );
}

async function scenarioOrderingAndCountersRemainPreparedOnly(): Promise<DeploymentActivationExecutionPersistenceServerHarnessScenario> {
  const repository = new InMemoryDeploymentActivationExecutionPersistenceTestRepository();
  const reversed = preparation({
    executionItems: [...preparation().executionItems].reverse(),
  });
  const result = await persist(repository, {
    deploymentActivationExecution: reversed,
  });
  const sequences = repository.items.map((item) => item.sequence).join(",");

  return expectScenario(
    "deterministic persistence ordering and zero execution counters",
    result.ok &&
      sequences === "1,2" &&
      result.downstream.itemsClaimed === 0 &&
      result.downstream.itemsStarted === 0 &&
      result.downstream.itemsSucceeded === 0 &&
      result.downstream.itemsFailed === 0 &&
      result.downstream.entitiesActivated === 0 &&
      result.downstream.bindingsWritten === 0,
    JSON.stringify({ result, sequences }),
  );
}

async function scenarioSourcePreparationUnmodified(): Promise<DeploymentActivationExecutionPersistenceServerHarnessScenario> {
  const source = preparation();
  const before = JSON.stringify(source);
  await persist(new InMemoryDeploymentActivationExecutionPersistenceTestRepository(), {
    deploymentActivationExecution: source,
  });

  return expectScenario(
    "source execution preparation remains unmodified",
    JSON.stringify(source) === before,
    "source preparation unchanged",
  );
}

async function persist(
  repository: InMemoryDeploymentActivationExecutionPersistenceTestRepository,
  command: Partial<Parameters<typeof persistActivationExecutionWithService>[1]> = {},
) {
  return persistActivationExecutionWithService(
    new DeploymentActivationExecutionPersistenceService(repository),
    {
      clinicId: CLINIC_ID,
      deploymentRunId: DEPLOYMENT_RUN_ID,
      payloadHash: "payload-hash-runtime-001",
      deploymentActivationExecution: preparation(),
      createdAt: "2026-01-01T00:00:00.000Z",
      ...command,
    },
  );
}

function preparation(
  input: Partial<ServerDeploymentActivationExecutionResult> = {},
): ServerDeploymentActivationExecutionResult {
  const executionKey = input.executionKey === undefined ? EXECUTION_KEY : input.executionKey;
  const planKey = input.planKey === undefined ? PLAN_KEY : input.planKey;
  const executionItems =
    input.executionItems ?? baseExecutionItems(executionKey ?? EXECUTION_KEY);

  return {
    ok: input.ok ?? true,
    status: input.status ?? "ready",
    executionKey,
    planKey,
    clinicId: input.clinicId ?? CLINIC_ID,
    deploymentRunId: input.deploymentRunId ?? DEPLOYMENT_RUN_ID,
    itemsRequested: input.itemsRequested ?? executionItems.length,
    itemsReady:
      input.itemsReady ??
      executionItems.filter((item) => item.executionStatus === "ready").length,
    itemsBlocked: input.itemsBlocked ?? 0,
    itemsPending:
      input.itemsPending ??
      executionItems.filter((item) => item.executionStatus === "pending").length,
    reversibleItems:
      input.reversibleItems ??
      executionItems.filter((item) => item.reversible).length,
    irreversibleItems:
      input.irreversibleItems ??
      executionItems.filter((item) => !item.reversible).length,
    blockers: input.blockers ?? 0,
    warnings: input.warnings ?? 0,
    issues: input.issues ?? [],
    executionItems,
    rollbackBoundary: input.rollbackBoundary ?? {
      lastReversibleSequence: 2,
      firstIrreversibleSequence: null,
      rollbackSupportedItemKeys: [`${planKey}:clinic`, `${planKey}:deployment_run`],
      rollbackUnsupportedItemKeys: [],
      wouldCrossIrreversibleBoundary: false,
    },
    downstream: input.downstream ?? {
      requested: 0,
      created: 0,
      reused: 0,
      skipped: 0,
      conflicts: 0,
    },
    message: input.message ?? "Execution preparation is ready.",
  };
}

function baseExecutionItems(
  executionKey: string,
): readonly DeploymentActivationExecutionItem[] {
  const clinicPlanKey = `${PLAN_KEY}:clinic`;
  const runPlanKey = `${PLAN_KEY}:deployment_run`;

  return [
    executionItem(executionKey, clinicPlanKey, 1, [], true),
    executionItem(executionKey, runPlanKey, 2, [clinicPlanKey], true),
  ];
}

function executionItem(
  executionKey: string,
  planItemKey: string,
  sequence: number,
  dependencyKeys: readonly string[],
  reversible: boolean,
): DeploymentActivationExecutionItem {
  return {
    executionItemKey: `${executionKey}:${planItemKey}`,
    planItemKey,
    sequence,
    entityType: sequence === 1 ? "clinic" : "deployment_run",
    entityId: sequence === 1 ? CLINIC_ID : null,
    deploymentKey: sequence === 1 ? null : DEPLOYMENT_RUN_ID,
    action: sequence === 1 ? "activate" : "finalize",
    currentState:
      sequence === 1
        ? buildClinicActivationCurrentState({
            clinicId: CLINIC_ID,
            deploymentStatus: "draft",
          })
        : { deploymentStatus: "deployed" },
    targetState:
      sequence === 1
        ? { deploymentStatus: "active" }
        : { deploymentStatus: "activated" },
    dependencyKeys,
    executionStatus: dependencyKeys.length === 0 ? "ready" : "pending",
    attemptCount: 0,
    reversible,
    rollbackAction: reversible ? "restore state" : null,
    startedAt: null,
    completedAt: null,
    error: null,
    evidence: {
      dependencyLevel: dependencyKeys.length === 0 ? 0 : 1,
      readyDependencyKeys: dependencyKeys,
      pendingDependencyKeys: [],
    },
    downstream: {
      requested: 0,
      created: 0,
      reused: 0,
      skipped: 0,
      conflicts: 0,
    },
  };
}

function expectScenario(
  name: string,
  passed: boolean,
  message: string,
): DeploymentActivationExecutionPersistenceServerHarnessScenario {
  return { name, passed, message };
}
