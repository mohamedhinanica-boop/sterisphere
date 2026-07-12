import {
  buildClinicActivationCurrentState,
  buildDeploymentRunActivationCurrentState,
  buildHardwareAssignmentActivationCurrentState,
  buildHardwareBindingActivationCurrentState,
  buildHardwareShellActivationCurrentState,
  buildProviderShellActivationCurrentState,
  buildSterilizerShellActivationCurrentState,
  buildWorkstationShellActivationCurrentState,
} from "./deployment-activation-current-state";
import { DeploymentActivationExecutionService } from "./deployment-activation-execution-service";
import {
  prepareActivationExecutionWithService,
  type ServerDeploymentActivationExecutionResult,
} from "./deployment-activation-execution-server";
import { InMemoryDeploymentActivationExecutionTestRepository } from "./deployment-activation-execution-test-repository";
import type {
  DeploymentActivationExecutionSnapshot,
} from "./deployment-activation-execution-types";
import type {
  DeploymentActivationPlanItem,
} from "./deployment-activation-plan-types";
import type {
  ServerDeploymentActivationPlanResult,
} from "./deployment-activation-plan-server";

export interface DeploymentActivationExecutionServerHarnessScenario {
  name: string;
  passed: boolean;
  message: string;
}

export interface DeploymentActivationExecutionServerHarnessResult {
  passed: boolean;
  scenarios: readonly DeploymentActivationExecutionServerHarnessScenario[];
}

const CLINIC_ID = "clinic-runtime-execution-0001";
const DEPLOYMENT_RUN_ID = "deployment-run-runtime-execution-0001";
const PLAN_KEY = `activation-plan-${DEPLOYMENT_RUN_ID}`;
const EXECUTION_KEY = `activation-execution-${DEPLOYMENT_RUN_ID}`;

export async function runDeploymentActivationExecutionServerHarness(): Promise<DeploymentActivationExecutionServerHarnessResult> {
  const scenarios = [
    await scenarioReadyPlanPreparesReadyExecution(),
    await scenarioPlanNotReadySkipsPreparation(),
    await scenarioBlockedPlanSkipsPreparation(),
    await scenarioPreparationBlockedPreservesPlanEvidence(),
    await scenarioRepositoryErrorReturnsSafeExecutionError(),
    await scenarioDeploymentOwnershipMismatchBlocks(),
    await scenarioCurrentStateDriftBlocks(),
    await scenarioDeterministicVerifyReusePreparation(),
    await scenarioDeterministicExecutionKey(),
    await scenarioExecutionItemOrderingPreserved(),
    await scenarioNoExecutionItemRuns(),
    await scenarioRollbackBoundaryPreserved(),
    await scenarioSourceActivationPlanRemainsUnmodified(),
    await scenarioDurableSnapshotRemainsUnmodified(),
    await scenarioDownstreamCountersRemainZero(),
  ];

  return {
    passed: scenarios.every((scenario) => scenario.passed),
    scenarios,
  };
}

async function scenarioReadyPlanPreparesReadyExecution(): Promise<DeploymentActivationExecutionServerHarnessScenario> {
  const result = await prepare();

  return expectScenario(
    "ready activation plan prepares ready execution session",
    result.ok &&
      result.status === "ready" &&
      result.executionItems.length === basePlanItems().length,
    `status=${result.status}; items=${result.executionItems.length}`,
  );
}

async function scenarioPlanNotReadySkipsPreparation(): Promise<DeploymentActivationExecutionServerHarnessScenario> {
  const result = await prepare({ plan: { status: "blocked" } });

  return expectScenario(
    "plan not ready skips preparation",
    !result.ok &&
      result.status === "skipped" &&
      result.executionItems.length === 0,
    JSON.stringify(result),
  );
}

async function scenarioBlockedPlanSkipsPreparation(): Promise<DeploymentActivationExecutionServerHarnessScenario> {
  const result = await prepare({
    plan: {
      blockers: 1,
      itemsBlocked: 1,
    },
  });

  return expectScenario(
    "blocked plan skips preparation",
    !result.ok && result.status === "skipped" && result.itemsRequested === 0,
    JSON.stringify(result),
  );
}

async function scenarioPreparationBlockedPreservesPlanEvidence(): Promise<DeploymentActivationExecutionServerHarnessScenario> {
  const result = await prepare({
    snapshot: {
      ...snapshotFor(basePlanItems()),
      currentStates: [],
    },
  });

  return expectScenario(
    "preparation blocked preserves upstream plan evidence",
    !result.ok &&
      result.status === "blocked" &&
      result.planKey === PLAN_KEY &&
      result.itemsRequested === basePlanItems().length,
    JSON.stringify(result),
  );
}

async function scenarioRepositoryErrorReturnsSafeExecutionError(): Promise<DeploymentActivationExecutionServerHarnessScenario> {
  const result = await prepare({ shouldThrow: true });

  return expectScenario(
    "repository error returns safe execution error",
    !result.ok &&
      result.status === "error" &&
      result.message.includes("repository failed unexpectedly"),
    result.message,
  );
}

async function scenarioDeploymentOwnershipMismatchBlocks(): Promise<DeploymentActivationExecutionServerHarnessScenario> {
  const snapshot = snapshotFor(basePlanItems());
  const result = await prepare({
    snapshot: {
      ...snapshot,
      deploymentRun: snapshot.deploymentRun
        ? { ...snapshot.deploymentRun, clinicId: "clinic-other" }
        : null,
    },
  });

  return expectScenario(
    "deployment ownership mismatch blocks preparation",
    hasIssue(result, "clinic_ownership_mismatch"),
    result.issues.map((issue) => issue.code).join(","),
  );
}

async function scenarioCurrentStateDriftBlocks(): Promise<DeploymentActivationExecutionServerHarnessScenario> {
  const snapshot = snapshotFor(basePlanItems());
  const result = await prepare({
    snapshot: {
      ...snapshot,
      currentStates: snapshot.currentStates.map((state) =>
        state.planItemKey === `${PLAN_KEY}:hardware_shell:hardware-001`
          ? { ...state, currentState: { provisioningStatus: "active" } }
          : state,
      ),
    },
  });

  return expectScenario(
    "current-state drift blocks preparation",
    hasIssue(result, "state_drift_detected"),
    result.issues.map((issue) => issue.code).join(","),
  );
}

async function scenarioDeterministicVerifyReusePreparation(): Promise<DeploymentActivationExecutionServerHarnessScenario> {
  const first = await prepare();
  const second = await prepare();

  return expectScenario(
    "verify/reuse preparation remains deterministic",
    first.executionKey === second.executionKey &&
      first.itemsRequested === second.itemsRequested &&
      first.executionItems.map((item) => item.executionItemKey).join("|") ===
        second.executionItems.map((item) => item.executionItemKey).join("|"),
    `${first.executionKey}; ${second.executionKey}`,
  );
}

async function scenarioDeterministicExecutionKey(): Promise<DeploymentActivationExecutionServerHarnessScenario> {
  const result = await prepare();

  return expectScenario(
    "execution key is deterministic",
    result.executionKey === EXECUTION_KEY,
    String(result.executionKey),
  );
}

async function scenarioExecutionItemOrderingPreserved(): Promise<DeploymentActivationExecutionServerHarnessScenario> {
  const result = await prepare();
  const order = result.executionItems.map((item) => item.entityType).join(">");

  return expectScenario(
    "execution item ordering is preserved",
    order ===
      "clinic>provider_shell>sterilizer_shell>workstation_shell>hardware_shell>hardware_binding>hardware_assignment>deployment_run",
    order,
  );
}

async function scenarioNoExecutionItemRuns(): Promise<DeploymentActivationExecutionServerHarnessScenario> {
  const result = await prepare();

  return expectScenario(
    "no execution item reaches running or completed states",
    result.executionItems.every((item) =>
      ["ready", "pending"].includes(item.executionStatus),
    ),
    result.executionItems.map((item) => item.executionStatus).join(","),
  );
}

async function scenarioRollbackBoundaryPreserved(): Promise<DeploymentActivationExecutionServerHarnessScenario> {
  const result = await prepare();

  return expectScenario(
    "rollback boundary is preserved",
    result.rollbackBoundary.lastReversibleSequence === 6 &&
      result.rollbackBoundary.firstIrreversibleSequence === 7 &&
      result.rollbackBoundary.wouldCrossIrreversibleBoundary,
    JSON.stringify(result.rollbackBoundary),
  );
}

async function scenarioSourceActivationPlanRemainsUnmodified(): Promise<DeploymentActivationExecutionServerHarnessScenario> {
  const plan = activationPlan();
  const before = JSON.stringify(plan);
  await prepare({ plan });

  return expectScenario(
    "source activation plan remains unmodified",
    JSON.stringify(plan) === before,
    JSON.stringify(plan),
  );
}

async function scenarioDurableSnapshotRemainsUnmodified(): Promise<DeploymentActivationExecutionServerHarnessScenario> {
  const snapshot = snapshotFor(basePlanItems());
  const before = JSON.stringify(snapshot);
  await prepare({ snapshot });

  return expectScenario(
    "durable snapshot remains unmodified",
    JSON.stringify(snapshot) === before,
    JSON.stringify(snapshot),
  );
}

async function scenarioDownstreamCountersRemainZero(): Promise<DeploymentActivationExecutionServerHarnessScenario> {
  const result = await prepare();

  return expectScenario(
    "downstream counters remain zero",
    result.downstream.requested === 0 &&
      result.downstream.created === 0 &&
      result.executionItems.every((item) => item.downstream.created === 0),
    JSON.stringify(result.downstream),
  );
}

async function prepare(input: {
  plan?: Partial<ServerDeploymentActivationPlanResult>;
  snapshot?: DeploymentActivationExecutionSnapshot;
  shouldThrow?: boolean;
} = {}): Promise<ServerDeploymentActivationExecutionResult> {
  const plan = activationPlan(input.plan);
  const repository = new InMemoryDeploymentActivationExecutionTestRepository({
    snapshot: input.snapshot ?? snapshotFor(plan.planItems),
    shouldThrow: input.shouldThrow,
  });
  const service = new DeploymentActivationExecutionService(repository);

  return prepareActivationExecutionWithService(service, {
    clinicId: CLINIC_ID,
    deploymentRunId: DEPLOYMENT_RUN_ID,
    deploymentActivationPlan: plan,
  });
}

function activationPlan(
  input: Partial<ServerDeploymentActivationPlanResult> = {},
): ServerDeploymentActivationPlanResult {
  const planItems = input.planItems ?? basePlanItems();

  return {
    ok: input.ok ?? true,
    status: input.status ?? "ready",
    clinicId: input.clinicId === undefined ? CLINIC_ID : input.clinicId,
    deploymentRunId:
      input.deploymentRunId === undefined
        ? DEPLOYMENT_RUN_ID
        : input.deploymentRunId,
    planKey: input.planKey === undefined ? PLAN_KEY : input.planKey,
    itemsRequested: input.itemsRequested ?? planItems.length,
    itemsPlanned: input.itemsPlanned ?? planItems.length,
    itemsBlocked: input.itemsBlocked ?? 0,
    reversibleItems:
      input.reversibleItems ??
      planItems.filter((item) => item.reversible).length,
    irreversibleItems:
      input.irreversibleItems ??
      planItems.filter((item) => !item.reversible).length,
    blockers: input.blockers ?? 0,
    warnings: input.warnings ?? 0,
    issues: input.issues ?? [],
    planItems,
    downstream: input.downstream ?? {
      requested: 0,
      created: 0,
      reused: 0,
      skipped: 0,
      conflicts: 0,
    },
    message: input.message ?? "Controlled activation plan is ready.",
  };
}

function snapshotFor(
  planItems: readonly DeploymentActivationPlanItem[],
): DeploymentActivationExecutionSnapshot {
  return {
    deploymentRun: {
      deploymentRunId: DEPLOYMENT_RUN_ID,
      clinicId: CLINIC_ID,
      lifecycleState: "completed",
      deploymentStatus: "deployed",
      executionOwnerKey: null,
    },
    existingExecution: null,
    currentStates: planItems.map((item) => ({
      planItemKey: item.planItemKey,
      currentState: cloneRecord(item.currentState),
    })),
  };
}

function basePlanItems(): DeploymentActivationPlanItem[] {
  const clinicKey = `${PLAN_KEY}:clinic`;
  const providerKey = `${PLAN_KEY}:provider_shell:provider-001`;
  const sterilizerKey = `${PLAN_KEY}:sterilizer_shell:sterilizer-001`;
  const workstationKey = `${PLAN_KEY}:workstation_shell:workstation-001`;
  const hardwareKey = `${PLAN_KEY}:hardware_shell:hardware-001`;
  const bindingKey = `${PLAN_KEY}:hardware_binding:hardware-001`;
  const assignmentKey = `${PLAN_KEY}:hardware_assignment:hardware-001`;

  return [
    item(clinicKey, 1, "clinic", CLINIC_ID, null, "activate", buildClinicActivationCurrentState({
      clinicId: CLINIC_ID,
      deploymentStatus: "draft",
    }), [], true),
    item(providerKey, 2, "provider_shell", "provider-row-001", "provider-001", "activate", buildProviderShellActivationCurrentState({
      id: "provider-row-001",
      clinicId: CLINIC_ID,
      deploymentProviderKey: "provider-001",
      provisioningSource: "setup_draft",
      provisioningStatus: "placeholder",
      active: false,
    }), [clinicKey], true),
    item(sterilizerKey, 3, "sterilizer_shell", "sterilizer-row-001", "sterilizer-001", "activate", buildSterilizerShellActivationCurrentState({
      id: "sterilizer-row-001",
      clinicId: CLINIC_ID,
      deploymentSterilizerKey: "sterilizer-001",
      provisioningSource: "setup_draft",
      provisioningStatus: "planned",
      active: false,
    }), [clinicKey], true),
    item(workstationKey, 4, "workstation_shell", "workstation-row-001", "workstation-001", "activate", buildWorkstationShellActivationCurrentState({
      id: "workstation-row-001",
      clinicId: CLINIC_ID,
      deploymentWorkstationKey: "workstation-001",
      provisioningSource: "setup_draft",
      provisioningStatus: "planned",
      active: false,
    }), [clinicKey], true),
    item(hardwareKey, 5, "hardware_shell", "hardware-row-001", "hardware-001", "activate", buildHardwareShellActivationCurrentState({
      id: "hardware-row-001",
      clinicId: CLINIC_ID,
      deploymentHardwareKey: "hardware-001",
      provisioningSource: "setup_draft",
      provisioningStatus: "planned",
      active: false,
      operationalStatus: "discovered",
      agentId: null,
      defaultWorkstationId: null,
      currentWorkstationId: null,
    }), [clinicKey], true),
    item(bindingKey, 6, "hardware_binding", "hardware-row-001", "hardware-001", "bind", buildHardwareBindingActivationCurrentState({
      hardwareId: "hardware-row-001",
      deploymentHardwareKey: "hardware-001",
      targetType: "workstation",
      targetDeploymentKey: "workstation-001",
      targetId: null,
    }), [hardwareKey, workstationKey], true),
    item(assignmentKey, 7, "hardware_assignment", "assignment-row-001", "hardware-001", "finalize", buildHardwareAssignmentActivationCurrentState({
      id: "assignment-row-001",
      clinicId: CLINIC_ID,
      deploymentHardwareKey: "hardware-001",
      assignmentKey: "hardware-assignment-hardware-001",
      targetType: "workstation",
      targetDeploymentKey: "workstation-001",
      assignmentSource: "setup_draft",
      assignmentStatus: "planned",
      active: false,
    }), [hardwareKey, bindingKey], false),
    item(`${PLAN_KEY}:deployment_run`, 8, "deployment_run", null, DEPLOYMENT_RUN_ID, "finalize", buildDeploymentRunActivationCurrentState({
      deploymentRunId: DEPLOYMENT_RUN_ID,
      clinicId: CLINIC_ID,
      lifecycleState: "completed",
      deploymentStatus: "deployed",
    }), [
      clinicKey,
      providerKey,
      sterilizerKey,
      workstationKey,
      hardwareKey,
      bindingKey,
      assignmentKey,
    ], false),
  ];
}
function item(
  planItemKey: string,
  sequence: number,
  entityType: DeploymentActivationPlanItem["entityType"],
  entityId: string | null,
  deploymentKey: string | null,
  action: DeploymentActivationPlanItem["action"],
  currentState: Record<string, unknown>,
  dependencyKeys: readonly string[],
  reversible: boolean,
): DeploymentActivationPlanItem {
  return {
    planItemKey,
    sequence,
    entityType,
    entityId,
    deploymentKey,
    clinicId: CLINIC_ID,
    action,
    currentState,
    targetState: {},
    dependencyKeys,
    reversible,
    rollbackAction: reversible ? "restore prior state" : null,
    status: "planned",
    blockers: [],
    warnings: [],
  };
}

function hasIssue(
  result: ServerDeploymentActivationExecutionResult,
  code: string,
): boolean {
  return result.issues.some((issue) => issue.code === code);
}

function cloneRecord(value: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}

function expectScenario(
  name: string,
  passed: boolean,
  message: string,
): DeploymentActivationExecutionServerHarnessScenario {
  return { name, passed, message };
}
