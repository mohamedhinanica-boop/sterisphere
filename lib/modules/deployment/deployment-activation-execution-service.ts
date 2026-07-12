import type {
  DeploymentActivationExecutionRepository,
} from "./deployment-activation-execution-repository";
import type {
  DeploymentActivationExecutionCommand,
  DeploymentActivationExecutionCurrentStateSnapshot,
  DeploymentActivationExecutionDeploymentRunSnapshot,
  DeploymentActivationExecutionEntityType,
  DeploymentActivationExecutionIssue,
  DeploymentActivationExecutionIssueCode,
  DeploymentActivationExecutionItem,
  DeploymentActivationExecutionResult,
  DeploymentActivationExecutionRollbackBoundary,
  DeploymentActivationExecutionSnapshot,
} from "./deployment-activation-execution-types";
import {
  canonicalizeActivationCurrentState,
  compareActivationCurrentStates,
  formatActivationCurrentStateDifferences,
} from "./deployment-activation-current-state";
import type {
  DeploymentActivationPlanAction,
  DeploymentActivationPlanEntityType,
  DeploymentActivationPlanIssue,
  DeploymentActivationPlanItem,
} from "./deployment-activation-plan-types";

const FINALIZED_RUN_STATES = new Set([
  "activated",
  "archived",
  "cancelled",
  "failed",
  "finalized",
]);

const SUPPORTED_ACTIONS = new Set<DeploymentActivationPlanAction>([
  "activate",
  "link",
  "bind",
  "finalize",
  "no_op",
]);

export class DeploymentActivationExecutionService {
  constructor(
    private readonly repository: DeploymentActivationExecutionRepository,
  ) {}

  async prepareExecutionSession(
    command: DeploymentActivationExecutionCommand,
  ): Promise<DeploymentActivationExecutionResult> {
    const clinicId = command.clinicId.trim();
    const deploymentRunId = command.deploymentRunId.trim();
    const executionKey = buildExecutionKey(deploymentRunId);

    try {
      const snapshot = await this.repository.getExecutionSnapshot({
        ...command,
        clinicId,
        deploymentRunId,
      });

      return prepareFromSnapshot({
        command: {
          ...command,
          clinicId,
          deploymentRunId,
        },
        snapshot,
        executionKey,
      });
    } catch {
      return {
        ok: false,
        status: "error",
        executionKey: executionKey || null,
        planKey: command.planKey,
        clinicId: clinicId || null,
        deploymentRunId: deploymentRunId || null,
        itemsRequested: 0,
        itemsReady: 0,
        itemsBlocked: 0,
        itemsPending: 0,
        reversibleItems: 0,
        irreversibleItems: 0,
        blockers: 0,
        warnings: 0,
        issues: [],
        executionItems: [],
        rollbackBoundary: emptyRollbackBoundary(),
        downstream: zeroDownstream(),
        message:
          "Controlled activation execution preparation could not complete because the execution repository failed unexpectedly.",
      };
    }
  }
}

export function createDeploymentActivationExecutionService(
  repository: DeploymentActivationExecutionRepository,
): DeploymentActivationExecutionService {
  return new DeploymentActivationExecutionService(repository);
}

function prepareFromSnapshot(input: {
  command: DeploymentActivationExecutionCommand;
  snapshot: DeploymentActivationExecutionSnapshot;
  executionKey: string;
}): DeploymentActivationExecutionResult {
  const { command, snapshot, executionKey } = input;
  const issues: DeploymentActivationExecutionIssue[] = [];
  const warnings: DeploymentActivationExecutionIssue[] = [
    ...(snapshot.warnings ?? []),
  ];
  const planItems = [...command.planItems];

  assessPlanIdentity(command, issues);
  assessDeploymentIdentity(command, snapshot.deploymentRun, issues);
  assessExecutionIdentity(command, snapshot, executionKey, issues);

  const itemGraph = buildItemGraph(planItems, issues);
  assessPlanItems(command, itemGraph, issues, warnings);
  assessCurrentStateDrift(itemGraph.items, snapshot.currentStates, issues);

  const topology = buildTopologicalOrder(itemGraph, issues);
  const rollbackBoundary = buildRollbackBoundary(planItems);
  const blockers = issues.filter((issue) => issue.severity === "blocker");
  const executionItems =
    blockers.length > 0
      ? buildExecutionItems({
          executionKey,
          orderedItems: topology.orderedItems.length
            ? topology.orderedItems
            : [...planItems].sort(comparePlanItems),
          dependencyLevels: topology.dependencyLevels,
          blocked: true,
        })
      : buildExecutionItems({
          executionKey,
          orderedItems: topology.orderedItems,
          dependencyLevels: topology.dependencyLevels,
          blocked: false,
        });

  const readyItems = executionItems.filter(
    (item) => item.executionStatus === "ready",
  ).length;
  const pendingItems = executionItems.filter(
    (item) => item.executionStatus === "pending",
  ).length;
  const orderedIssues = [...issues, ...warnings].sort(compareIssues);
  const warningCount = orderedIssues.filter(
    (issue) => issue.severity === "warning",
  ).length;
  const blockerCount = orderedIssues.filter(
    (issue) => issue.severity === "blocker",
  ).length;
  const status = blockerCount > 0 ? "blocked" : "ready";

  return {
    ok: status === "ready",
    status,
    executionKey,
    planKey: command.planKey,
    clinicId: command.clinicId || null,
    deploymentRunId: command.deploymentRunId || null,
    itemsRequested: planItems.length,
    itemsReady: status === "ready" ? readyItems : 0,
    itemsBlocked: status === "blocked" ? planItems.length : 0,
    itemsPending: status === "ready" ? pendingItems : 0,
    reversibleItems: planItems.filter((item) => item.reversible).length,
    irreversibleItems: planItems.filter((item) => !item.reversible).length,
    blockers: blockerCount,
    warnings: warningCount,
    issues: orderedIssues,
    executionItems,
    rollbackBoundary,
    downstream: zeroDownstream(),
    message:
      status === "ready"
        ? "Controlled activation execution session is ready for a future executor. No activation has been executed."
        : "Controlled activation execution preparation is blocked by plan integrity, dependency, drift, or ownership issues.",
  };
}

function assessPlanIdentity(
  command: DeploymentActivationExecutionCommand,
  issues: DeploymentActivationExecutionIssue[],
): void {
  if (!command.planKey || command.planItems.length === 0) {
    issues.push(
      issue({
        code: "activation_plan_missing",
        entityType: "activation_execution",
        planItemKey: null,
        deploymentKey: command.deploymentRunId || null,
        message: "Controlled activation execution requires an approved plan.",
      }),
    );
    return;
  }

  if (command.planStatus !== "ready") {
    issues.push(
      issue({
        code: "activation_plan_not_ready",
        entityType: "activation_plan",
        planItemKey: null,
        deploymentKey: command.planKey,
        message: "Controlled activation execution requires plan status ready.",
      }),
    );
  }

  if (command.blockers > 0 || command.itemsBlocked > 0) {
    issues.push(
      issue({
        code: "activation_plan_blocked",
        entityType: "activation_plan",
        planItemKey: null,
        deploymentKey: command.planKey,
        message: "Controlled activation execution cannot prepare a blocked plan.",
      }),
    );
  }

  if (command.planKey !== buildPlanKey(command.deploymentRunId)) {
    issues.push(
      issue({
        code: "activation_plan_key_invalid",
        entityType: "activation_plan",
        planItemKey: null,
        deploymentKey: command.planKey,
        message: "Activation plan key is not deterministic for this deployment run.",
      }),
    );
  }
}

function assessDeploymentIdentity(
  command: DeploymentActivationExecutionCommand,
  deploymentRun: DeploymentActivationExecutionDeploymentRunSnapshot | null,
  issues: DeploymentActivationExecutionIssue[],
): void {
  if (!deploymentRun) {
    issues.push(
      issue({
        code: "deployment_run_missing",
        entityType: "deployment_run",
        planItemKey: null,
        deploymentKey: command.deploymentRunId || null,
        message: "Deployment run state is missing for execution preparation.",
      }),
    );
    return;
  }

  if (
    deploymentRun.deploymentRunId !== command.deploymentRunId ||
    deploymentRun.clinicId !== command.clinicId
  ) {
    issues.push(
      issue({
        code: "clinic_ownership_mismatch",
        entityType: "deployment_run",
        planItemKey: null,
        deploymentKey: command.deploymentRunId,
        message:
          "Deployment run does not belong to the clinic being prepared for execution.",
      }),
    );
  }

  if (
    isFinalizedState(deploymentRun.lifecycleState) ||
    isFinalizedState(deploymentRun.deploymentStatus) ||
    (deploymentRun.executionOwnerKey &&
      deploymentRun.executionOwnerKey !== buildExecutionKey(command.deploymentRunId))
  ) {
    issues.push(
      issue({
        code: "deployment_run_incompatible",
        entityType: "deployment_run",
        planItemKey: null,
        deploymentKey: command.deploymentRunId,
        message:
          "Deployment run is finalized, failed, cancelled, or owned by another execution attempt.",
      }),
    );
  }
}

function assessExecutionIdentity(
  command: DeploymentActivationExecutionCommand,
  snapshot: DeploymentActivationExecutionSnapshot,
  executionKey: string,
  issues: DeploymentActivationExecutionIssue[],
): void {
  if (!snapshot.existingExecution) {
    return;
  }

  if (
    snapshot.existingExecution.executionKey !== executionKey ||
    snapshot.existingExecution.clinicId !== command.clinicId ||
    snapshot.existingExecution.deploymentRunId !== command.deploymentRunId
  ) {
    issues.push(
      issue({
        code: "execution_identity_conflict",
        entityType: "activation_execution",
        planItemKey: null,
        deploymentKey: executionKey,
        message:
          "An incompatible activation execution identity already exists.",
      }),
    );
  }
}

interface ItemGraph {
  items: readonly DeploymentActivationPlanItem[];
  byKey: Map<string, DeploymentActivationPlanItem>;
  duplicates: Set<string>;
  duplicateSequences: Set<number>;
}

function buildItemGraph(
  planItems: readonly DeploymentActivationPlanItem[],
  issues: DeploymentActivationExecutionIssue[],
): ItemGraph {
  const byKey = new Map<string, DeploymentActivationPlanItem>();
  const duplicates = new Set<string>();
  const sequenceOwners = new Map<number, string>();
  const duplicateSequences = new Set<number>();

  for (const item of planItems) {
    if (byKey.has(item.planItemKey)) {
      duplicates.add(item.planItemKey);
    } else {
      byKey.set(item.planItemKey, item);
    }

    const owner = sequenceOwners.get(item.sequence);
    if (owner) {
      duplicateSequences.add(item.sequence);
    } else {
      sequenceOwners.set(item.sequence, item.planItemKey);
    }
  }

  for (const duplicate of [...duplicates].sort()) {
    issues.push(
      issue({
        code: "duplicate_plan_item_key",
        entityType: "activation_plan",
        planItemKey: duplicate,
        deploymentKey: null,
        message: "Duplicate plan item keys prevent deterministic execution.",
      }),
    );
  }

  for (const sequence of [...duplicateSequences].sort((a, b) => a - b)) {
    issues.push(
      issue({
        code: "duplicate_sequence",
        entityType: "activation_plan",
        planItemKey: null,
        deploymentKey: String(sequence),
        message: "Duplicate plan item sequences prevent deterministic execution.",
      }),
    );
  }

  return { items: planItems, byKey, duplicates, duplicateSequences };
}

function assessPlanItems(
  command: DeploymentActivationExecutionCommand,
  graph: ItemGraph,
  issues: DeploymentActivationExecutionIssue[],
  warnings: DeploymentActivationExecutionIssue[],
): void {
  const items = [...graph.items].sort(comparePlanItems);
  const maxSequence = Math.max(...items.map((item) => item.sequence));
  const finalization = items.filter(
    (item) => item.entityType === "deployment_run" && item.action === "finalize",
  );

  for (const item of items) {
    if (item.clinicId !== command.clinicId) {
      issues.push(
        issue({
          code: "clinic_ownership_mismatch",
          entityType: item.entityType,
          entityId: item.entityId,
          planItemKey: item.planItemKey,
          deploymentKey: item.deploymentKey,
          message: "Plan item clinic ownership does not match the execution clinic.",
        }),
      );
    }

    if (!SUPPORTED_ACTIONS.has(item.action)) {
      issues.push(
        issue({
          code: "unsupported_action",
          entityType: item.entityType,
          entityId: item.entityId,
          planItemKey: item.planItemKey,
          deploymentKey: item.deploymentKey,
          message: "Execution cannot prepare an action outside the approved action model.",
        }),
      );
    }

    if (item.reversible && !item.rollbackAction) {
      issues.push(
        issue({
          code: "rollback_intent_missing",
          entityType: item.entityType,
          entityId: item.entityId,
          planItemKey: item.planItemKey,
          deploymentKey: item.deploymentKey,
          message: "Reversible execution items require rollback intent.",
        }),
      );
    }

    for (const dependencyKey of item.dependencyKeys) {
      if (dependencyKey === item.planItemKey) {
        issues.push(
          issue({
            code: "self_dependency",
            entityType: item.entityType,
            entityId: item.entityId,
            planItemKey: item.planItemKey,
            deploymentKey: item.deploymentKey,
            message: "Plan item cannot depend on itself.",
          }),
        );
      }

      const dependency = graph.byKey.get(dependencyKey);
      if (!dependency) {
        issues.push(
          issue({
            code: "missing_dependency",
            entityType: item.entityType,
            entityId: item.entityId,
            planItemKey: item.planItemKey,
            deploymentKey: dependencyKey,
            message: "Plan item dependency does not reference an existing plan item.",
          }),
        );
      } else if (!item.reversible && dependency.reversible && dependency.sequence > item.sequence) {
        issues.push(
          issue({
            code: "irreversible_boundary_invalid",
            entityType: item.entityType,
            entityId: item.entityId,
            planItemKey: item.planItemKey,
            deploymentKey: item.deploymentKey,
            message:
              "Irreversible execution item appears before a required reversible dependency.",
          }),
        );
      }
    }

    if (item.entityType === "hardware_binding" && item.action === "bind") {
      assessBindingDependencies(item, graph, issues);
    }

    if (item.entityType === "hardware_assignment" && item.action === "finalize") {
      assessAssignmentDependencies(item, graph, issues);
    }

    for (const warning of item.warnings) {
      warnings.push(
        warningIssue({
          code:
            item.entityType === "hardware_assignment" &&
            item.dependencyKeys.every((key) => !key.includes("hardware_binding"))
              ? "manual_followup_required"
              : "rollback_conditional",
          entityType: item.entityType,
          entityId: item.entityId,
          planItemKey: item.planItemKey,
          deploymentKey: item.deploymentKey,
          message: warning.message,
        }),
      );
    }
  }

  if (finalization.length !== 1 || finalization[0]?.sequence !== maxSequence) {
    issues.push(
      issue({
        code: "finalization_order_invalid",
        entityType: "deployment_run",
        planItemKey: finalization[0]?.planItemKey ?? null,
        deploymentKey: command.deploymentRunId,
        message: "Deployment finalization must be the final execution item.",
      }),
    );
  } else {
    const final = finalization[0];
    const requiredDependencies = items
      .filter((item) => item.planItemKey !== final.planItemKey)
      .map((item) => item.planItemKey);
    const missing = requiredDependencies.filter(
      (dependencyKey) => !final.dependencyKeys.includes(dependencyKey),
    );

    if (missing.length > 0) {
      issues.push(
        issue({
          code: "finalization_order_invalid",
          entityType: "deployment_run",
          planItemKey: final.planItemKey,
          deploymentKey: command.deploymentRunId,
          message:
            "Deployment finalization must depend on every mandatory prior item.",
        }),
      );
    }
  }
}

function assessBindingDependencies(
  item: DeploymentActivationPlanItem,
  graph: ItemGraph,
  issues: DeploymentActivationExecutionIssue[],
): void {
  const dependencies = item.dependencyKeys
    .map((key) => graph.byKey.get(key))
    .filter((dependency): dependency is DeploymentActivationPlanItem =>
      Boolean(dependency),
    );
  const hasHardwareDependency = dependencies.some(
    (dependency) => dependency.entityType === "hardware_shell",
  );
  const hasTargetDependency = dependencies.some(
    (dependency) =>
      dependency.entityType === "workstation_shell" ||
      dependency.entityType === "sterilizer_shell",
  );

  if (!hasHardwareDependency || !hasTargetDependency) {
    issues.push(
      issue({
        code: "binding_dependency_missing",
        entityType: item.entityType,
        entityId: item.entityId,
        planItemKey: item.planItemKey,
        deploymentKey: item.deploymentKey,
        message:
          "Hardware binding items must depend on hardware activation and the target activation item.",
      }),
    );
  }
}

function assessAssignmentDependencies(
  item: DeploymentActivationPlanItem,
  graph: ItemGraph,
  issues: DeploymentActivationExecutionIssue[],
): void {
  const dependencies = item.dependencyKeys
    .map((key) => graph.byKey.get(key))
    .filter((dependency): dependency is DeploymentActivationPlanItem =>
      Boolean(dependency),
    );
  const hasHardwareDependency = dependencies.some(
    (dependency) => dependency.entityType === "hardware_shell",
  );
  const matchingBinding = [...graph.byKey.values()].find(
    (candidate) =>
      candidate.entityType === "hardware_binding" &&
      candidate.deploymentKey === item.deploymentKey,
  );

  if (
    !hasHardwareDependency ||
    (matchingBinding && !item.dependencyKeys.includes(matchingBinding.planItemKey))
  ) {
    issues.push(
      issue({
        code: "assignment_dependency_missing",
        entityType: item.entityType,
        entityId: item.entityId,
        planItemKey: item.planItemKey,
        deploymentKey: item.deploymentKey,
        message:
          "Hardware assignment finalization must depend on hardware activation and any required binding item.",
      }),
    );
  }
}

function assessCurrentStateDrift(
  planItems: readonly DeploymentActivationPlanItem[],
  currentStates: readonly DeploymentActivationExecutionCurrentStateSnapshot[],
  issues: DeploymentActivationExecutionIssue[],
): void {
  const states = new Map(
    currentStates.map((state) => [state.planItemKey, state.currentState]),
  );

  for (const item of planItems) {
    const currentState = states.get(item.planItemKey);

    if (!currentState) {
      issues.push(
        issue({
          code: "state_drift_detected",
          entityType: item.entityType,
          entityId: item.entityId,
          planItemKey: item.planItemKey,
          deploymentKey: item.deploymentKey,
          message:
            "Current durable state no longer matches the approved activation plan current state: live entity is missing.",
        }),
      );
      continue;
    }

    const comparison = compareActivationCurrentStates(
      item.currentState,
      currentState,
    );

    if (!comparison.equivalent) {
      issues.push(
        issue({
          code: "state_drift_detected",
          entityType: item.entityType,
          entityId: item.entityId,
          planItemKey: item.planItemKey,
          deploymentKey: item.deploymentKey,
          message:
            `Current durable state drifted from the approved activation plan current state: ${formatActivationCurrentStateDifferences(comparison.differences)}.`,
        }),
      );
    }
  }
}

function buildTopologicalOrder(
  graph: ItemGraph,
  issues: DeploymentActivationExecutionIssue[],
): {
  orderedItems: readonly DeploymentActivationPlanItem[];
  dependencyLevels: Map<string, number>;
} {
  const indegree = new Map<string, number>();
  const dependents = new Map<string, string[]>();

  for (const item of graph.items) {
    indegree.set(item.planItemKey, 0);
    dependents.set(item.planItemKey, []);
  }

  for (const item of graph.items) {
    for (const dependencyKey of item.dependencyKeys) {
      if (!graph.byKey.has(dependencyKey) || dependencyKey === item.planItemKey) {
        continue;
      }

      indegree.set(item.planItemKey, (indegree.get(item.planItemKey) ?? 0) + 1);
      dependents.get(dependencyKey)?.push(item.planItemKey);
    }
  }

  const ready = [...graph.items]
    .filter((item) => (indegree.get(item.planItemKey) ?? 0) === 0)
    .sort(comparePlanItems);
  const ordered: DeploymentActivationPlanItem[] = [];

  while (ready.length > 0) {
    const item = ready.shift();

    if (!item) {
      continue;
    }

    ordered.push(item);

    for (const dependentKey of dependents.get(item.planItemKey) ?? []) {
      const next = (indegree.get(dependentKey) ?? 0) - 1;
      indegree.set(dependentKey, next);

      if (next === 0) {
        const dependent = graph.byKey.get(dependentKey);
        if (dependent) {
          ready.push(dependent);
          ready.sort(comparePlanItems);
        }
      }
    }
  }

  if (ordered.length !== graph.items.length) {
    issues.push(
      issue({
        code: "circular_dependency",
        entityType: "activation_plan",
        planItemKey: null,
        deploymentKey: null,
        message:
          "Plan item dependencies contain a cycle and cannot be executed deterministically.",
      }),
    );
  }

  const dependencyLevels = new Map<string, number>();

  for (const item of ordered) {
    const level =
      item.dependencyKeys.length === 0
        ? 0
        : Math.max(
            ...item.dependencyKeys.map((key) => dependencyLevels.get(key) ?? 0),
          ) + 1;
    dependencyLevels.set(item.planItemKey, level);
  }

  return { orderedItems: ordered, dependencyLevels };
}

function buildExecutionItems(input: {
  executionKey: string;
  orderedItems: readonly DeploymentActivationPlanItem[];
  dependencyLevels: Map<string, number>;
  blocked: boolean;
}): DeploymentActivationExecutionItem[] {
  return input.orderedItems.map((item) => {
    const dependencyLevel = input.dependencyLevels.get(item.planItemKey) ?? 0;
    const pendingDependencyKeys = input.blocked ? item.dependencyKeys : [];

    return {
      executionItemKey: `${input.executionKey}:${item.planItemKey}`,
      planItemKey: item.planItemKey,
      sequence: item.sequence,
      entityType: item.entityType,
      entityId: item.entityId,
      deploymentKey: item.deploymentKey,
      action: item.action,
      currentState: cloneRecord(item.currentState),
      targetState: cloneRecord(item.targetState),
      dependencyKeys: [...item.dependencyKeys],
      executionStatus:
        input.blocked || item.dependencyKeys.length > 0 ? "pending" : "ready",
      attemptCount: 0,
      reversible: item.reversible,
      rollbackAction: item.rollbackAction,
      startedAt: null,
      completedAt: null,
      error: null,
      evidence: {
        dependencyLevel,
        readyDependencyKeys: input.blocked ? [] : [...item.dependencyKeys],
        pendingDependencyKeys,
      },
      downstream: zeroDownstream(),
    };
  });
}

function buildRollbackBoundary(
  planItems: readonly DeploymentActivationPlanItem[],
): DeploymentActivationExecutionRollbackBoundary {
  const reversible = planItems.filter((item) => item.reversible);
  const irreversible = planItems.filter((item) => !item.reversible);
  const firstIrreversibleSequence =
    irreversible.length > 0
      ? Math.min(...irreversible.map((item) => item.sequence))
      : null;

  return {
    lastReversibleSequence:
      reversible.length > 0
        ? Math.max(...reversible.map((item) => item.sequence))
        : null,
    firstIrreversibleSequence,
    rollbackSupportedItemKeys: reversible
      .filter((item) => Boolean(item.rollbackAction))
      .sort(comparePlanItems)
      .map((item) => item.planItemKey),
    rollbackUnsupportedItemKeys: planItems
      .filter((item) => !item.reversible || !item.rollbackAction)
      .sort(comparePlanItems)
      .map((item) => item.planItemKey),
    wouldCrossIrreversibleBoundary: firstIrreversibleSequence !== null,
  };
}

function buildExecutionKey(deploymentRunId: string): string {
  const normalized = deploymentRunId.trim();

  return normalized ? `activation-execution-${normalized}` : "";
}

function buildPlanKey(deploymentRunId: string): string {
  const normalized = deploymentRunId.trim();

  return normalized ? `activation-plan-${normalized}` : "";
}

function isFinalizedState(value: string | null): boolean {
  return value ? FINALIZED_RUN_STATES.has(value) : false;
}

function issue(input: {
  code: DeploymentActivationExecutionIssueCode;
  entityType: DeploymentActivationExecutionEntityType;
  entityId?: string | null;
  planItemKey: string | null;
  deploymentKey: string | null;
  message: string;
}): DeploymentActivationExecutionIssue {
  return {
    code: input.code,
    entityType: input.entityType,
    entityId: input.entityId ?? null,
    planItemKey: input.planItemKey,
    deploymentKey: input.deploymentKey,
    severity: "blocker",
    message: input.message,
  };
}

function warningIssue(input: {
  code: DeploymentActivationExecutionIssueCode;
  entityType: DeploymentActivationPlanEntityType;
  entityId: string | null;
  planItemKey: string | null;
  deploymentKey: string | null;
  message: string;
}): DeploymentActivationExecutionIssue {
  return {
    ...input,
    severity: "warning",
  };
}

function compareIssues(
  left: DeploymentActivationExecutionIssue,
  right: DeploymentActivationExecutionIssue,
): number {
  return (
    severityRank(left.severity) - severityRank(right.severity) ||
    left.entityType.localeCompare(right.entityType) ||
    String(left.planItemKey ?? "").localeCompare(String(right.planItemKey ?? "")) ||
    String(left.deploymentKey ?? "").localeCompare(String(right.deploymentKey ?? "")) ||
    left.code.localeCompare(right.code)
  );
}

function severityRank(severity: DeploymentActivationExecutionIssue["severity"]): number {
  return severity === "blocker" ? 0 : 1;
}

function comparePlanItems(
  left: DeploymentActivationPlanItem,
  right: DeploymentActivationPlanItem,
): number {
  return (
    left.sequence - right.sequence ||
    left.planItemKey.localeCompare(right.planItemKey)
  );
}

function cloneRecord(value: Record<string, unknown>): Record<string, unknown> {
  return canonicalizeActivationCurrentState(value);
}

function emptyRollbackBoundary(): DeploymentActivationExecutionRollbackBoundary {
  return {
    lastReversibleSequence: null,
    firstIrreversibleSequence: null,
    rollbackSupportedItemKeys: [],
    rollbackUnsupportedItemKeys: [],
    wouldCrossIrreversibleBoundary: false,
  };
}

function zeroDownstream() {
  return {
    requested: 0,
    created: 0,
    reused: 0,
    skipped: 0,
    conflicts: 0,
  } as const;
}
