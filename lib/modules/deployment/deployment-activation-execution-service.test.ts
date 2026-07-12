import { DeploymentActivationExecutionService } from "./deployment-activation-execution-service";
import { InMemoryDeploymentActivationExecutionTestRepository } from "./deployment-activation-execution-test-repository";
import type {
  DeploymentActivationExecutionCommand,
  DeploymentActivationExecutionIssue,
  DeploymentActivationExecutionIssueCode,
  DeploymentActivationExecutionSnapshot,
} from "./deployment-activation-execution-types";
import type {
  DeploymentActivationPlanItem,
} from "./deployment-activation-plan-types";

export interface DeploymentActivationExecutionServiceHarnessScenario {
  name: string;
  passed: boolean;
  message: string;
}

export interface DeploymentActivationExecutionServiceHarnessResult {
  passed: boolean;
  scenarios: readonly DeploymentActivationExecutionServiceHarnessScenario[];
}

const CLINIC_ID = "clinic-activation-execution-0001";
const DEPLOYMENT_RUN_ID = "deployment-run-activation-execution-0001";
const PLAN_KEY = `activation-plan-${DEPLOYMENT_RUN_ID}`;
const EXECUTION_KEY = `activation-execution-${DEPLOYMENT_RUN_ID}`;

export async function runDeploymentActivationExecutionServiceHarness(): Promise<DeploymentActivationExecutionServiceHarnessResult> {
  const scenarios = [
    await scenarioValidExecutionSessionPreparation(),
    await scenarioPlanNotReady(),
    await scenarioPlanBlockersPresent(),
    await scenarioDeterministicExecutionKey(),
    await scenarioDeterministicExecutionItemMapping(),
    await scenarioDuplicatePlanItemKey(),
    await scenarioDuplicateSequence(),
    await scenarioMissingDependency(),
    await scenarioSelfDependency(),
    await scenarioDependencyCycle(),
    await scenarioDeterministicTopologicalOrdering(),
    await scenarioFinalizationLast(),
    await scenarioInvalidFinalizationOrdering(),
    await scenarioWorkstationBindingDependencyValidation(),
    await scenarioSterilizerBindingDependencyValidation(),
    await scenarioExplicitUnassignedRequiresNoBindingItem(),
    await scenarioUnsupportedAction(),
    await scenarioCurrentStateDriftBlocker(),
    await scenarioDeploymentOwnershipMismatch(),
    await scenarioConflictingExecutionIdentity(),
    await scenarioReversibleItemMissingRollbackAction(),
    await scenarioRollbackBoundaryCalculation(),
    await scenarioWarningOnlyExecutionRemainsReady(),
    await scenarioRepositoryErrorReturnsError(),
    await scenarioRepeatedPreparationIsDeterministic(),
    await scenarioSourcePlanRemainsUnmodified(),
    await scenarioDownstreamCountersRemainZero(),
  ];

  return {
    passed: scenarios.every((scenario) => scenario.passed),
    scenarios,
  };
}

async function scenarioValidExecutionSessionPreparation(): Promise<DeploymentActivationExecutionServiceHarnessScenario> {
  const result = await prepare();

  return expectScenario(
    "valid execution session preparation",
    result.ok &&
      result.status === "ready" &&
      result.executionItems.length === basePlanItems().length &&
      result.executionItems.every((item) => item.startedAt === null),
    `status=${result.status}; items=${result.executionItems.length}`,
  );
}

async function scenarioPlanNotReady(): Promise<DeploymentActivationExecutionServiceHarnessScenario> {
  return expectBlocker(
    "plan not ready blocks execution preparation",
    {},
    { planStatus: "blocked" },
    "activation_plan_not_ready",
  );
}

async function scenarioPlanBlockersPresent(): Promise<DeploymentActivationExecutionServiceHarnessScenario> {
  return expectBlocker(
    "plan blockers block execution preparation",
    {},
    { blockers: 1 },
    "activation_plan_blocked",
  );
}

async function scenarioDeterministicExecutionKey(): Promise<DeploymentActivationExecutionServiceHarnessScenario> {
  const result = await prepare();

  return expectScenario(
    "deterministic execution key",
    result.executionKey === EXECUTION_KEY,
    String(result.executionKey),
  );
}

async function scenarioDeterministicExecutionItemMapping(): Promise<DeploymentActivationExecutionServiceHarnessScenario> {
  const result = await prepare();
  const first = result.executionItems[0];

  return expectScenario(
    "deterministic execution-item mapping",
    first?.executionItemKey === `${EXECUTION_KEY}:${PLAN_KEY}:clinic` &&
      first.executionStatus === "ready" &&
      first.attemptCount === 0 &&
      first.downstream.created === 0,
    JSON.stringify(first),
  );
}

async function scenarioDuplicatePlanItemKey(): Promise<DeploymentActivationExecutionServiceHarnessScenario> {
  const items = basePlanItems();

  return expectBlocker(
    "duplicate plan item key blocks execution",
    { planItems: [...items, { ...items[0], sequence: 99 }] },
    {},
    "duplicate_plan_item_key",
  );
}

async function scenarioDuplicateSequence(): Promise<DeploymentActivationExecutionServiceHarnessScenario> {
  const items = basePlanItems();
  items[1] = { ...items[1], sequence: items[0].sequence };

  return expectBlocker(
    "duplicate sequence blocks execution",
    { planItems: items },
    {},
    "duplicate_sequence",
  );
}

async function scenarioMissingDependency(): Promise<DeploymentActivationExecutionServiceHarnessScenario> {
  const items = replaceItem(basePlanItems(), "provider_shell", {
    dependencyKeys: ["missing-plan-item"],
  });

  return expectBlocker(
    "missing dependency blocks execution",
    { planItems: items },
    {},
    "missing_dependency",
  );
}

async function scenarioSelfDependency(): Promise<DeploymentActivationExecutionServiceHarnessScenario> {
  const items = replaceItem(basePlanItems(), "provider_shell", (item) => ({
    dependencyKeys: [item.planItemKey],
  }));

  return expectBlocker(
    "self dependency blocks execution",
    { planItems: items },
    {},
    "self_dependency",
  );
}

async function scenarioDependencyCycle(): Promise<DeploymentActivationExecutionServiceHarnessScenario> {
  let items = replaceItem(basePlanItems(), "provider_shell", {
    dependencyKeys: [`${PLAN_KEY}:workstation_shell:workstation-001`],
  });
  items = replaceItem(items, "workstation_shell", {
    dependencyKeys: [`${PLAN_KEY}:provider_shell:provider-001`],
  });

  return expectBlocker(
    "dependency cycle blocks execution",
    { planItems: items },
    {},
    "circular_dependency",
  );
}

async function scenarioDeterministicTopologicalOrdering(): Promise<DeploymentActivationExecutionServiceHarnessScenario> {
  const result = await prepare();
  const order = result.executionItems.map((item) => item.entityType).join(">");

  return expectScenario(
    "deterministic topological ordering",
    order ===
      "clinic>provider_shell>sterilizer_shell>workstation_shell>hardware_shell>hardware_binding>hardware_assignment>deployment_run",
    order,
  );
}

async function scenarioFinalizationLast(): Promise<DeploymentActivationExecutionServiceHarnessScenario> {
  const result = await prepare();

  return expectScenario(
    "finalization remains last",
    result.executionItems.at(-1)?.entityType === "deployment_run" &&
      result.executionItems.at(-1)?.action === "finalize",
    result.executionItems.map((item) => item.entityType).join(","),
  );
}

async function scenarioInvalidFinalizationOrdering(): Promise<DeploymentActivationExecutionServiceHarnessScenario> {
  const items = replaceItem(basePlanItems(), "deployment_run", {
    sequence: 6,
  });

  return expectBlocker(
    "invalid finalization ordering blocks execution",
    { planItems: items },
    {},
    "finalization_order_invalid",
  );
}

async function scenarioWorkstationBindingDependencyValidation(): Promise<DeploymentActivationExecutionServiceHarnessScenario> {
  const items = replaceItem(basePlanItems(), "hardware_binding", {
    dependencyKeys: [`${PLAN_KEY}:hardware_shell:hardware-001`],
  });

  return expectBlocker(
    "workstation binding dependency validation",
    { planItems: items },
    {},
    "binding_dependency_missing",
  );
}

async function scenarioSterilizerBindingDependencyValidation(): Promise<DeploymentActivationExecutionServiceHarnessScenario> {
  let items = replaceItem(basePlanItems(), "hardware_binding", {
    targetState: {
      hardwareId: "hardware-row-001",
      targetId: "sterilizer-row-001",
      targetType: "sterilizer",
      targetDeploymentKey: "sterilizer-001",
    },
    dependencyKeys: [`${PLAN_KEY}:hardware_shell:hardware-001`],
  });
  items = replaceItem(items, "hardware_assignment", {
    dependencyKeys: [
      `${PLAN_KEY}:hardware_shell:hardware-001`,
      `${PLAN_KEY}:hardware_binding:hardware-001`,
    ],
  });

  return expectBlocker(
    "sterilizer binding dependency validation",
    { planItems: items },
    {},
    "binding_dependency_missing",
  );
}

async function scenarioExplicitUnassignedRequiresNoBindingItem(): Promise<DeploymentActivationExecutionServiceHarnessScenario> {
  const items = basePlanItems()
    .filter((item) => item.entityType !== "hardware_binding")
    .map((item) =>
      item.entityType === "hardware_assignment"
        ? {
            ...item,
            dependencyKeys: [`${PLAN_KEY}:hardware_shell:hardware-001`],
            warnings: [
              {
                code: "rollback_not_supported" as const,
                entityType: "hardware_binding" as const,
                entityId: null,
                deploymentKey: "hardware-001",
                severity: "warning" as const,
                message:
                  "Explicit unassigned hardware produces no operational binding plan item.",
              },
            ],
          }
        : item,
    );

  const result = await prepare({ planItems: items });

  return expectScenario(
    "explicit unassigned requires no binding execution item",
    result.ok &&
      result.executionItems.every(
        (item) => item.entityType !== "hardware_binding",
      ),
    result.executionItems.map((item) => item.entityType).join(","),
  );
}

async function scenarioUnsupportedAction(): Promise<DeploymentActivationExecutionServiceHarnessScenario> {
  const items = replaceItem(basePlanItems(), "provider_shell", {
    action: "teleport" as DeploymentActivationPlanItem["action"],
  });

  return expectBlocker(
    "unsupported action blocks execution",
    { planItems: items },
    {},
    "unsupported_action",
  );
}

async function scenarioCurrentStateDriftBlocker(): Promise<DeploymentActivationExecutionServiceHarnessScenario> {
  const items = basePlanItems();
  const snapshot = snapshotFor(items);
  const currentStates = snapshot.currentStates.map((state) =>
    state.planItemKey === `${PLAN_KEY}:hardware_shell:hardware-001`
      ? { ...state, currentState: { active: true } }
      : state,
  );

  return expectBlocker(
    "current-state drift blocks execution",
    { snapshot: { ...snapshot, currentStates }, planItems: items },
    {},
    "state_drift_detected",
  );
}

async function scenarioDeploymentOwnershipMismatch(): Promise<DeploymentActivationExecutionServiceHarnessScenario> {
  const snapshot = snapshotFor(basePlanItems());

  return expectBlocker(
    "deployment ownership mismatch blocks execution",
    {
      snapshot: {
        ...snapshot,
        deploymentRun: {
          ...snapshot.deploymentRun!,
          clinicId: "other-clinic",
        },
      },
    },
    {},
    "clinic_ownership_mismatch",
  );
}

async function scenarioConflictingExecutionIdentity(): Promise<DeploymentActivationExecutionServiceHarnessScenario> {
  const snapshot = snapshotFor(basePlanItems());

  return expectBlocker(
    "conflicting execution identity blocks execution",
    {
      snapshot: {
        ...snapshot,
        existingExecution: {
          executionKey: "activation-execution-other",
          clinicId: CLINIC_ID,
          deploymentRunId: DEPLOYMENT_RUN_ID,
          status: "ready",
        },
      },
    },
    {},
    "execution_identity_conflict",
  );
}

async function scenarioReversibleItemMissingRollbackAction(): Promise<DeploymentActivationExecutionServiceHarnessScenario> {
  const items = replaceItem(basePlanItems(), "provider_shell", {
    rollbackAction: null,
  });

  return expectBlocker(
    "reversible item missing rollback action blocks execution",
    { planItems: items },
    {},
    "rollback_intent_missing",
  );
}

async function scenarioRollbackBoundaryCalculation(): Promise<DeploymentActivationExecutionServiceHarnessScenario> {
  const result = await prepare();

  return expectScenario(
    "rollback boundary calculation",
    result.rollbackBoundary.lastReversibleSequence === 6 &&
      result.rollbackBoundary.firstIrreversibleSequence === 7 &&
      result.rollbackBoundary.wouldCrossIrreversibleBoundary &&
      result.rollbackBoundary.rollbackSupportedItemKeys.length === 6,
    JSON.stringify(result.rollbackBoundary),
  );
}

async function scenarioWarningOnlyExecutionRemainsReady(): Promise<DeploymentActivationExecutionServiceHarnessScenario> {
  const items = replaceItem(basePlanItems(), "hardware_binding", (item) => ({
    warnings: [
      ...item.warnings,
      {
        code: "rollback_not_supported" as const,
        entityType: "hardware_binding" as const,
        entityId: "hardware-row-001",
        deploymentKey: "hardware-001",
        severity: "warning" as const,
        message:
          "Operational binding execution is future work; this item is proposed only.",
      },
    ],
  }));
  const result = await prepare({ planItems: items });

  return expectScenario(
    "warning-only execution remains ready",
    result.ok && result.status === "ready" && result.warnings > 0,
    `status=${result.status}; warnings=${result.warnings}`,
  );
}

async function scenarioRepositoryErrorReturnsError(): Promise<DeploymentActivationExecutionServiceHarnessScenario> {
  const repository = new InMemoryDeploymentActivationExecutionTestRepository({
    snapshot: snapshotFor(basePlanItems()),
    shouldThrow: true,
  });
  const result = await new DeploymentActivationExecutionService(
    repository,
  ).prepareExecutionSession(command());

  return expectScenario(
    "repository error returns error",
    !result.ok &&
      result.status === "error" &&
      result.executionItems.length === 0,
    `status=${result.status}; items=${result.executionItems.length}`,
  );
}

async function scenarioRepeatedPreparationIsDeterministic(): Promise<DeploymentActivationExecutionServiceHarnessScenario> {
  const first = await prepare();
  const second = await prepare();

  return expectScenario(
    "repeated preparation returns same result",
    JSON.stringify(first) === JSON.stringify(second),
    `first=${first.executionKey}; second=${second.executionKey}`,
  );
}

async function scenarioSourcePlanRemainsUnmodified(): Promise<DeploymentActivationExecutionServiceHarnessScenario> {
  const items = basePlanItems();
  const before = JSON.stringify(items);
  await prepare({ planItems: items });

  return expectScenario(
    "source plan remains unmodified",
    before === JSON.stringify(items),
    "source plan unchanged",
  );
}

async function scenarioDownstreamCountersRemainZero(): Promise<DeploymentActivationExecutionServiceHarnessScenario> {
  const result = await prepare();

  return expectScenario(
    "downstream counters remain zero",
    result.downstream.requested === 0 &&
      result.downstream.created === 0 &&
      result.downstream.reused === 0 &&
      result.downstream.skipped === 0 &&
      result.downstream.conflicts === 0 &&
      result.executionItems.every((item) => item.downstream.created === 0),
    JSON.stringify(result.downstream),
  );
}

async function expectBlocker(
  name: string,
  input: {
    planItems?: readonly DeploymentActivationPlanItem[];
    snapshot?: DeploymentActivationExecutionSnapshot;
  },
  commandInput: Partial<DeploymentActivationExecutionCommand>,
  expectedCode: DeploymentActivationExecutionIssueCode,
): Promise<DeploymentActivationExecutionServiceHarnessScenario> {
  const result = await prepare(input, commandInput);

  return expectScenario(
    name,
    !result.ok &&
      result.status === "blocked" &&
      hasIssue(result.issues, expectedCode),
    issueCodes(result.issues),
  );
}

async function prepare(
  input: {
    planItems?: readonly DeploymentActivationPlanItem[];
    snapshot?: DeploymentActivationExecutionSnapshot;
  } = {},
  commandInput: Partial<DeploymentActivationExecutionCommand> = {},
) {
  const planItems = input.planItems ?? basePlanItems();
  const repository = new InMemoryDeploymentActivationExecutionTestRepository({
    snapshot: input.snapshot ?? snapshotFor(planItems),
  });
  const service = new DeploymentActivationExecutionService(repository);

  return service.prepareExecutionSession(command({ ...commandInput, planItems }));
}

function command(
  input: Partial<DeploymentActivationExecutionCommand> = {},
): DeploymentActivationExecutionCommand {
  return {
    clinicId: CLINIC_ID,
    deploymentRunId: DEPLOYMENT_RUN_ID,
    planKey: PLAN_KEY,
    planStatus: "ready",
    blockers: 0,
    itemsBlocked: 0,
    planItems: basePlanItems(),
    readinessEvidenceKey: "readiness-evidence-001",
    readinessEvidenceHash: "readiness-hash-001",
    payloadHash: "payload-hash-001",
    deploymentIdentity: DEPLOYMENT_RUN_ID,
    ...input,
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
      currentState: JSON.parse(JSON.stringify(item.currentState)) as Record<
        string,
        unknown
      >,
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
    item({
      planItemKey: clinicKey,
      sequence: 1,
      entityType: "clinic",
      entityId: CLINIC_ID,
      deploymentKey: null,
      action: "activate",
      currentState: { deploymentStatus: "draft" },
      targetState: { deploymentStatus: "active" },
      dependencyKeys: [],
      reversible: true,
      rollbackAction: "restore clinic deployment status",
    }),
    item({
      planItemKey: providerKey,
      sequence: 2,
      entityType: "provider_shell",
      entityId: "provider-row-001",
      deploymentKey: "provider-001",
      action: "activate",
      currentState: { provisioningStatus: "placeholder", active: false },
      targetState: { provisioningStatus: "active", active: true },
      dependencyKeys: [clinicKey],
      reversible: true,
      rollbackAction: "restore provider shell",
    }),
    item({
      planItemKey: sterilizerKey,
      sequence: 3,
      entityType: "sterilizer_shell",
      entityId: "sterilizer-row-001",
      deploymentKey: "sterilizer-001",
      action: "activate",
      currentState: { provisioningStatus: "planned", active: false },
      targetState: { provisioningStatus: "active", active: true },
      dependencyKeys: [clinicKey],
      reversible: true,
      rollbackAction: "restore sterilizer shell",
    }),
    item({
      planItemKey: workstationKey,
      sequence: 4,
      entityType: "workstation_shell",
      entityId: "workstation-row-001",
      deploymentKey: "workstation-001",
      action: "activate",
      currentState: { provisioningStatus: "planned", active: false },
      targetState: { provisioningStatus: "active", active: true },
      dependencyKeys: [clinicKey],
      reversible: true,
      rollbackAction: "restore workstation shell",
    }),
    item({
      planItemKey: hardwareKey,
      sequence: 5,
      entityType: "hardware_shell",
      entityId: "hardware-row-001",
      deploymentKey: "hardware-001",
      action: "activate",
      currentState: { provisioningStatus: "planned", active: false },
      targetState: { provisioningStatus: "active", active: true },
      dependencyKeys: [clinicKey],
      reversible: true,
      rollbackAction: "restore hardware shell",
    }),
    item({
      planItemKey: bindingKey,
      sequence: 6,
      entityType: "hardware_binding",
      entityId: "hardware-row-001",
      deploymentKey: "hardware-001",
      action: "bind",
      currentState: {
        hardwareId: "hardware-row-001",
        targetId: null,
        targetType: "workstation",
      },
      targetState: {
        hardwareId: "hardware-row-001",
        targetId: "workstation-row-001",
        targetType: "workstation",
        targetDeploymentKey: "workstation-001",
      },
      dependencyKeys: [hardwareKey, workstationKey],
      reversible: true,
      rollbackAction: "clear hardware binding",
    }),
    item({
      planItemKey: assignmentKey,
      sequence: 7,
      entityType: "hardware_assignment",
      entityId: "hardware-assignment-row-001",
      deploymentKey: "hardware-001",
      action: "finalize",
      currentState: { assignmentStatus: "planned", active: false },
      targetState: { assignmentStatus: "active", active: true },
      dependencyKeys: [hardwareKey, bindingKey],
      reversible: false,
      rollbackAction: null,
    }),
    item({
      planItemKey: `${PLAN_KEY}:deployment_run`,
      sequence: 8,
      entityType: "deployment_run",
      entityId: null,
      deploymentKey: DEPLOYMENT_RUN_ID,
      action: "finalize",
      currentState: { deploymentStatus: "deployed" },
      targetState: { deploymentStatus: "activated" },
      dependencyKeys: [
        clinicKey,
        providerKey,
        sterilizerKey,
        workstationKey,
        hardwareKey,
        bindingKey,
        assignmentKey,
      ],
      reversible: false,
      rollbackAction: null,
    }),
  ];
}

function item(
  input: Omit<
    DeploymentActivationPlanItem,
    "clinicId" | "status" | "blockers" | "warnings"
  > & {
    warnings?: DeploymentActivationPlanItem["warnings"];
  },
): DeploymentActivationPlanItem {
  return {
    ...input,
    clinicId: CLINIC_ID,
    status: "planned",
    blockers: [],
    warnings: input.warnings ?? [],
  };
}

function replaceItem(
  items: DeploymentActivationPlanItem[],
  entityType: DeploymentActivationPlanItem["entityType"],
  patch:
    | Partial<DeploymentActivationPlanItem>
    | ((
        item: DeploymentActivationPlanItem,
      ) => Partial<DeploymentActivationPlanItem>),
): DeploymentActivationPlanItem[] {
  return items.map((item) =>
    item.entityType === entityType
      ? {
          ...item,
          ...(typeof patch === "function" ? patch(item) : patch),
        }
      : item,
  );
}

function hasIssue(
  issues: readonly DeploymentActivationExecutionIssue[],
  code: DeploymentActivationExecutionIssueCode,
): boolean {
  return issues.some((issue) => issue.code === code);
}

function issueCodes(
  issues: readonly DeploymentActivationExecutionIssue[],
): string {
  return issues.map((issue) => issue.code).join(",");
}

function expectScenario(
  name: string,
  passed: boolean,
  message: string,
): DeploymentActivationExecutionServiceHarnessScenario {
  return { name, passed, message };
}
