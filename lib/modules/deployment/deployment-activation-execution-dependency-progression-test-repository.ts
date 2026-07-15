import type {
  DeploymentActivationExecutionDependencyProgressionRepository,
} from "./deployment-activation-execution-dependency-progression-repository";
import {
  cloneDependencyProgressionSnapshot,
  type DeploymentActivationExecutionDependencyProgressionAggregateSnapshot,
  type DeploymentActivationExecutionDependencyProgressionItemSnapshot,
  type DeploymentActivationExecutionDependencyProgressionSessionSnapshot,
  type DeploymentActivationExecutionDependencyProgressionSnapshot,
} from "./deployment-activation-execution-dependency-progression-types";

export interface DeploymentActivationExecutionDependencyProgressionTestRepositoryCalls {
  loadDependencyProgressionSnapshot: number;
  forbiddenInsertWrites: 0;
  forbiddenUpdateWrites: 0;
  forbiddenUpsertWrites: 0;
  forbiddenPatchWrites: 0;
  forbiddenSaveWrites: 0;
  forbiddenDeleteWrites: 0;
  forbiddenReadyWrites: 0;
  forbiddenStartWrites: 0;
  forbiddenActivationWrites: 0;
  forbiddenRollbackWrites: 0;
}

export class InMemoryDeploymentActivationExecutionDependencyProgressionTestRepository
  implements DeploymentActivationExecutionDependencyProgressionRepository
{
  readonly calls: DeploymentActivationExecutionDependencyProgressionTestRepositoryCalls = {
    loadDependencyProgressionSnapshot: 0,
    forbiddenInsertWrites: 0,
    forbiddenUpdateWrites: 0,
    forbiddenUpsertWrites: 0,
    forbiddenPatchWrites: 0,
    forbiddenSaveWrites: 0,
    forbiddenDeleteWrites: 0,
    forbiddenReadyWrites: 0,
    forbiddenStartWrites: 0,
    forbiddenActivationWrites: 0,
    forbiddenRollbackWrites: 0,
  };

  private readonly snapshot: DeploymentActivationExecutionDependencyProgressionSnapshot;
  private readonly shouldThrow: boolean;

  constructor(input: {
    snapshot?: DeploymentActivationExecutionDependencyProgressionSnapshot;
    shouldThrow?: boolean;
  } = {}) {
    this.snapshot = cloneDependencyProgressionSnapshot(input.snapshot ?? buildDependencyProgressionSnapshot());
    this.shouldThrow = input.shouldThrow ?? false;
  }

  async loadDependencyProgressionSnapshot(): Promise<DeploymentActivationExecutionDependencyProgressionSnapshot> {
    this.calls.loadDependencyProgressionSnapshot += 1;

    if (this.shouldThrow) {
      throw new Error("dependency progression repository failed");
    }

    return cloneDependencyProgressionSnapshot(this.snapshot);
  }

  get downstreamWriteCount(): number {
    return (
      this.calls.forbiddenInsertWrites +
      this.calls.forbiddenUpdateWrites +
      this.calls.forbiddenUpsertWrites +
      this.calls.forbiddenPatchWrites +
      this.calls.forbiddenSaveWrites +
      this.calls.forbiddenDeleteWrites +
      this.calls.forbiddenReadyWrites +
      this.calls.forbiddenStartWrites +
      this.calls.forbiddenActivationWrites +
      this.calls.forbiddenRollbackWrites
    );
  }
}

const CLINIC_ID = "clinic-dependency-progression-0001";
const DEPLOYMENT_RUN_KEY = "deployment-run-dependency-progression-0001";
const SESSION_ID = "activation-execution-session-dependency-progression-0001";
const EXECUTION_KEY = "activation-execution-deployment-run-dependency-progression-0001";
const PLAN_KEY = "activation-plan-dependency-progression-0001";
const OWNER = "executor-dependency-progression-001";
const TOKEN = "sensitive-dependency-progression-token";
const LEASE = "2026-01-01T12:05:00.000Z";
const SESSION_STARTED_AT = "2026-01-01T11:59:00.000Z";
const ITEM_STARTED_AT = "2026-01-01T12:00:00.000Z";
const ITEM_COMPLETED_AT = "2026-01-01T12:02:00.000Z";

export function buildDependencyProgressionSnapshot(input: {
  session?: Partial<DeploymentActivationExecutionDependencyProgressionSessionSnapshot> | null;
  items?: readonly DeploymentActivationExecutionDependencyProgressionItemSnapshot[];
  itemPatches?: Record<number, Partial<DeploymentActivationExecutionDependencyProgressionItemSnapshot>>;
  aggregate?: Partial<DeploymentActivationExecutionDependencyProgressionAggregateSnapshot>;
} = {}): DeploymentActivationExecutionDependencyProgressionSnapshot {
  const items = input.items
    ? input.items.map((item) => ({ ...item }))
    : [
        item(1, {
          executionStatus: "succeeded",
          attemptCount: 1,
          startedAt: ITEM_STARTED_AT,
          completedAt: ITEM_COMPLETED_AT,
        }),
        item(2, {
          executionStatus: "pending",
          dependencyKeys: [planItemKey(1)],
        }),
        item(3, {
          executionStatus: "pending",
          dependencyKeys: [planItemKey(2)],
        }),
      ];

  const patchedItems = items.map((current) => ({
    ...current,
    ...(input.itemPatches?.[current.sequence] ?? {}),
  }));

  const aggregate = {
    ...aggregateDependencyProgressionItems(patchedItems),
    ...input.aggregate,
  };

  return {
    session: input.session === null
      ? null
      : {
          sessionId: SESSION_ID,
          clinicId: CLINIC_ID,
          deploymentRunKey: DEPLOYMENT_RUN_KEY,
          executionKey: EXECUTION_KEY,
          preparationStatus: "ready",
          executionStatus: "running",
          executionOwner: OWNER,
          ownershipToken: TOKEN,
          leaseExpiresAt: LEASE,
          startedAt: SESSION_STARTED_AT,
          completedAt: null,
          failedAt: null,
          cancelledAt: null,
          rolledBackAt: null,
          itemsRequested: patchedItems.length,
          ...input.session,
        },
    items: patchedItems,
    aggregate,
  };
}

export function buildAlreadyProgressedDependencyProgressionSnapshot(): DeploymentActivationExecutionDependencyProgressionSnapshot {
  return buildDependencyProgressionSnapshot({
    itemPatches: {
      2: { executionStatus: "ready" },
    },
  });
}

export function aggregateDependencyProgressionItems(
  items: readonly DeploymentActivationExecutionDependencyProgressionItemSnapshot[],
): DeploymentActivationExecutionDependencyProgressionAggregateSnapshot {
  return {
    totalItemCount: items.length,
    succeededItemCount: items.filter((item) => item.executionStatus === "succeeded").length,
    pendingItemCount: items.filter((item) => item.executionStatus === "pending").length,
    readyItemCount: items.filter((item) => item.executionStatus === "ready").length,
    runningItemCount: items.filter((item) => item.executionStatus === "running").length,
    failedOrTerminalItemCount: items.filter((item) => ["failed", "blocked", "cancelled", "rolled_back"].includes(item.executionStatus)).length,
    attemptedItemCount: items.filter((item) => item.attemptCount > 0).length,
    timestampedItemCount: items.filter((item) => item.startedAt !== null || item.completedAt !== null).length,
    rollbackEvidenceCount: items.filter((item) => item.rolledBackAt !== null).length,
    errorEvidenceCount: items.filter((item) => item.errorCode !== null || item.errorMessage !== null).length,
    malformedDependencyCount: 0,
    duplicateExecutionItemKeyCount: duplicateCount(items.map((item) => item.executionItemKey)),
    duplicatePlanItemKeyCount: duplicateCount(items.map((item) => item.planItemKey)),
    duplicateSequenceCount: duplicateCount(items.map((item) => String(item.sequence))),
  };
}

export function item(
  sequence: number,
  input: Partial<DeploymentActivationExecutionDependencyProgressionItemSnapshot> = {},
): DeploymentActivationExecutionDependencyProgressionItemSnapshot {
  return {
    itemId: `activation-execution-item-dependency-${String(sequence).padStart(3, "0")}`,
    sessionId: SESSION_ID,
    executionItemKey: `${EXECUTION_KEY}:${planItemKey(sequence)}`,
    planItemKey: planItemKey(sequence),
    sequence,
    entityType: sequence === 1 ? "clinic" : "provider_shell",
    entityId: sequence === 1 ? CLINIC_ID : `provider-${String(sequence - 1).padStart(3, "0")}`,
    action: "activate",
    executionStatus: "pending",
    attemptCount: 0,
    startedAt: null,
    completedAt: null,
    rolledBackAt: null,
    errorCode: null,
    errorMessage: null,
    dependencyKeys: sequence === 1 ? [] : [planItemKey(sequence - 1)],
    expectedCurrentState: { provisioningStatus: "planned", active: false },
    targetState: { provisioningStatus: "active", active: true },
    reversible: true,
    rollbackBehavior: "restore planned inactive shell state",
    ...input,
  };
}

export function planItemKey(sequence: number): string {
  if (sequence === 1) {
    return `${PLAN_KEY}:clinic`;
  }

  return `${PLAN_KEY}:provider-${String(sequence - 1).padStart(3, "0")}`;
}

function duplicateCount(values: readonly string[]): number {
  const seen = new Set<string>();
  const duplicates = new Set<string>();

  for (const value of values) {
    if (seen.has(value)) {
      duplicates.add(value);
    } else {
      seen.add(value);
    }
  }

  return duplicates.size;
}