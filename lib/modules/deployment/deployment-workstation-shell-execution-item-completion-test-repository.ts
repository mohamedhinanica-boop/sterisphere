import type {
  DeploymentWorkstationShellExecutionItemCompletionRepository,
} from "./deployment-workstation-shell-execution-item-completion-repository";
import {
  cloneWorkstationShellExecutionItemCompletionSnapshot,
  emptyWorkstationShellExecutionItemCompletionAggregate,
  type DeploymentWorkstationShellExecutionAtomicItemCompletionCommand,
  type DeploymentWorkstationShellExecutionAtomicItemCompletionResult,
  type DeploymentWorkstationShellExecutionItemCompletionAggregateSnapshot,
  type DeploymentWorkstationShellExecutionItemCompletionItemSnapshot,
  type DeploymentWorkstationShellExecutionItemCompletionWorkstationSnapshot,
  type DeploymentWorkstationShellExecutionItemCompletionSessionSnapshot,
  type DeploymentWorkstationShellExecutionItemCompletionSnapshot,
} from "./deployment-workstation-shell-execution-item-completion-types";

export interface DeploymentWorkstationShellExecutionItemCompletionTestRepositoryCalls {
  loadWorkstationShellExecutionItemCompletionSnapshot: number;
  forbiddenInsertWrites: 0;
  forbiddenUpdateWrites: 0;
  forbiddenUpsertWrites: 0;
  forbiddenPatchWrites: 0;
  forbiddenSaveWrites: 0;
  forbiddenDeleteWrites: 0;
  forbiddenActivationWrites: 0;
  forbiddenItemCompletionWrites: 0;
  forbiddenDependencyWrites: 0;
  forbiddenNextItemStartWrites: 0;
  forbiddenRollbackWrites: 0;
  forbiddenSessionWrites: 0;
}

export class InMemoryDeploymentWorkstationShellExecutionItemCompletionTestRepository
  implements DeploymentWorkstationShellExecutionItemCompletionRepository
{
  readonly calls: DeploymentWorkstationShellExecutionItemCompletionTestRepositoryCalls = {
    loadWorkstationShellExecutionItemCompletionSnapshot: 0,
    forbiddenInsertWrites: 0,
    forbiddenUpdateWrites: 0,
    forbiddenUpsertWrites: 0,
    forbiddenPatchWrites: 0,
    forbiddenSaveWrites: 0,
    forbiddenDeleteWrites: 0,
    forbiddenActivationWrites: 0,
    forbiddenItemCompletionWrites: 0,
    forbiddenDependencyWrites: 0,
    forbiddenNextItemStartWrites: 0,
    forbiddenRollbackWrites: 0,
    forbiddenSessionWrites: 0,
  };

  private readonly snapshot: DeploymentWorkstationShellExecutionItemCompletionSnapshot;
  private readonly shouldThrow: boolean;
  private readonly failureMessage: string;

  constructor(input: {
    snapshot?: DeploymentWorkstationShellExecutionItemCompletionSnapshot;
    shouldThrow?: boolean;
    failureMessage?: string;
  } = {}) {
    this.snapshot = cloneWorkstationShellExecutionItemCompletionSnapshot(input.snapshot ?? buildWorkstationShellExecutionItemCompletionSnapshot());
    this.shouldThrow = input.shouldThrow ?? false;
    this.failureMessage = input.failureMessage ?? "workstation shell execution-item completion repository failed";
  }

  async loadWorkstationShellExecutionItemCompletionSnapshot(): Promise<DeploymentWorkstationShellExecutionItemCompletionSnapshot> {
    this.calls.loadWorkstationShellExecutionItemCompletionSnapshot += 1;

    if (this.shouldThrow) {
      throw new Error(this.failureMessage);
    }

    return cloneWorkstationShellExecutionItemCompletionSnapshot(this.snapshot);
  }

  async completeWorkstationShellExecutionItemAtomically(
    _command: DeploymentWorkstationShellExecutionAtomicItemCompletionCommand,
  ): Promise<DeploymentWorkstationShellExecutionAtomicItemCompletionResult> {
    throw new Error("Atomic workstation-shell item completion is not implemented by the in-memory assessment repository.");
  }

  get downstreamWriteCount(): number {
    return this.calls.forbiddenInsertWrites +
      this.calls.forbiddenUpdateWrites +
      this.calls.forbiddenUpsertWrites +
      this.calls.forbiddenPatchWrites +
      this.calls.forbiddenSaveWrites +
      this.calls.forbiddenDeleteWrites +
      this.calls.forbiddenActivationWrites +
      this.calls.forbiddenItemCompletionWrites +
      this.calls.forbiddenDependencyWrites +
      this.calls.forbiddenNextItemStartWrites +
      this.calls.forbiddenRollbackWrites +
      this.calls.forbiddenSessionWrites;
  }
}

const CLINIC_ID = "clinic-workstation-item-completion-0001";
const DEPLOYMENT_RUN_ID = "deployment-run-workstation-item-completion-0001";
const SESSION_ID = "activation-execution-session-workstation-item-completion-0001";
const EXECUTION_KEY = "activation-execution-deployment-run-workstation-item-completion-0001";
const OWNER = "executor-workstation-item-completion-001";
const TOKEN = "sensitive-workstation-item-completion-token";
const LEASE = "2026-01-01T12:30:00.000Z";
const SESSION_STARTED_AT = "2026-01-01T11:59:00.000Z";
const CLINIC_ITEM_STARTED_AT = "2026-01-01T12:00:00.000Z";
const CLINIC_ITEM_COMPLETED_AT = "2026-01-01T12:02:00.000Z";
const WORKSTATION_ITEM_STARTED_AT = "2026-01-01T12:06:00.000Z";
const WORKSTATION_ITEM_COMPLETED_AT = "2026-01-01T12:08:00.000Z";
const WORKSTATION_ID = "f74f1056-0e59-474c-9676-0230d4936114";
const WORKSTATION_KEY = "dentist-001";
const PLAN_KEY = "activation-plan-workstation-item-completion-0001";

export const WORKSTATION_SHELL_EXECUTION_ITEM_COMPLETION_TEST_IDS = {
  clinicId: CLINIC_ID,
  deploymentRunId: DEPLOYMENT_RUN_ID,
  sessionId: SESSION_ID,
  executionKey: EXECUTION_KEY,
  owner: OWNER,
  token: TOKEN,
  lease: LEASE,
  workstationId: WORKSTATION_ID,
  workstationKey: WORKSTATION_KEY,
  workstationItemId: itemId(2),
  workstationExecutionItemKey: executionItemKey(2),
  workstationPlanItemKey: planItemKey(2),
} as const;

export function buildWorkstationShellExecutionItemCompletionSnapshot(input: {
  session?: Partial<DeploymentWorkstationShellExecutionItemCompletionSessionSnapshot> | null;
  item?: Partial<DeploymentWorkstationShellExecutionItemCompletionItemSnapshot> | null;
  items?: readonly DeploymentWorkstationShellExecutionItemCompletionItemSnapshot[];
  itemPatches?: Record<number, Partial<DeploymentWorkstationShellExecutionItemCompletionItemSnapshot>>;
  workstation?: Partial<DeploymentWorkstationShellExecutionItemCompletionWorkstationSnapshot> | null;
  aggregate?: Partial<DeploymentWorkstationShellExecutionItemCompletionAggregateSnapshot>;
} = {}): DeploymentWorkstationShellExecutionItemCompletionSnapshot {
  const baseItems = input.items
    ? input.items.map(cloneItem)
    : [
        item(1, {
          executionStatus: "succeeded",
          attemptCount: 1,
          startedAt: CLINIC_ITEM_STARTED_AT,
          completedAt: CLINIC_ITEM_COMPLETED_AT,
        }),
        item(2, {
          executionStatus: "running",
          attemptCount: 1,
          startedAt: WORKSTATION_ITEM_STARTED_AT,
          dependencyKeys: [planItemKey(1)],
        }),
        item(3, {
          executionStatus: "pending",
          dependencyKeys: [planItemKey(2)],
        }),
      ];
  const items = baseItems.map((current) => ({
    ...current,
    ...(input.itemPatches?.[current.sequence] ?? {}),
  }));
  const selectedItem = input.item === null
    ? null
    : {
        ...(items.find((current) => current.sequence === 2) ?? items[0]),
        ...(input.item ?? {}),
      };
  const mergedItems = selectedItem
    ? items.map((current) => current.itemId === selectedItem.itemId ? cloneItem(selectedItem) : current)
    : items;

  return {
    session: input.session === null
      ? null
      : {
          sessionId: SESSION_ID,
          clinicId: CLINIC_ID,
          deploymentRunId: DEPLOYMENT_RUN_ID,
          executionKey: EXECUTION_KEY,
          preparationStatus: "ready",
          executionStatus: "running",
          executionOwner: OWNER,
          ownershipToken: TOKEN,
          leaseExpiresAt: LEASE,
          startedAt: SESSION_STARTED_AT,
          completedAt: null,
          failedAt: null,
          itemsRequested: mergedItems.length,
          ...input.session,
        },
    item: selectedItem ? cloneItem(selectedItem) : null,
    items: mergedItems.map(cloneItem),
    workstation: input.workstation === null
      ? null
      : workstation(input.workstation),
    aggregate: {
      ...aggregate(mergedItems, input.workstation === null ? null : workstation(input.workstation)),
      ...input.aggregate,
    },
  };
}

export function buildAlreadyCompletedWorkstationShellExecutionItemCompletionSnapshot(): DeploymentWorkstationShellExecutionItemCompletionSnapshot {
  return buildWorkstationShellExecutionItemCompletionSnapshot({
    item: {
      executionStatus: "succeeded",
      completedAt: WORKSTATION_ITEM_COMPLETED_AT,
    },
    itemPatches: {
      2: {
        executionStatus: "succeeded",
        completedAt: WORKSTATION_ITEM_COMPLETED_AT,
      },
    },
    aggregate: {
      runningItemCount: 0,
      succeededItemCount: 2,
      pendingItemCount: 1,
      priorSucceededPrefixCount: 2,
      runningWorkstationItemCount: 0,
    },
  });
}

export function workstation(
  input: Partial<DeploymentWorkstationShellExecutionItemCompletionWorkstationSnapshot> = {},
): DeploymentWorkstationShellExecutionItemCompletionWorkstationSnapshot {
  return {
    workstationId: WORKSTATION_ID,
    clinicId: CLINIC_ID,
    deploymentWorkstationKey: WORKSTATION_KEY,
    provisioningSource: "setup_draft",
    provisioningStatus: "active",
    active: true,
    updatedAt: "2026-01-01T12:07:00.000Z",
    ...input,
  };
}

export function item(
  sequence: number,
  input: Partial<DeploymentWorkstationShellExecutionItemCompletionItemSnapshot> = {},
): DeploymentWorkstationShellExecutionItemCompletionItemSnapshot {
  const isClinic = sequence === 1;
  const workstationKey = `dentist-${String(sequence - 1).padStart(3, "0")}`;

  return {
    itemId: itemId(sequence),
    sessionId: SESSION_ID,
    executionItemKey: executionItemKey(sequence),
    planItemKey: planItemKey(sequence),
    sequence,
    entityType: isClinic ? "clinic" : "workstation_shell",
    entityId: isClinic ? CLINIC_ID : WORKSTATION_ID,
    deploymentKey: isClinic ? CLINIC_ID : workstationKey,
    action: "activate",
    executionStatus: "pending",
    attemptCount: 0,
    startedAt: null,
    completedAt: null,
    rolledBackAt: null,
    errorCode: null,
    errorMessage: null,
    expectedCurrentState: isClinic
      ? { deploymentStatus: "draft" }
      : { deploymentWorkstationKey: workstationKey, provisioningSource: "setup_draft", provisioningStatus: "planned", active: false },
    targetState: isClinic
      ? { deploymentStatus: "deployed" }
      : { provisioningStatus: "active", active: true },
    dependencyKeys: isClinic ? [] : [planItemKey(sequence - 1)],
    reversible: true,
    ...input,
  };
}

export function planItemKey(sequence: number): string {
  return sequence === 1 ? `${PLAN_KEY}:clinic` : `${PLAN_KEY}:workstation-${String(sequence - 1).padStart(3, "0")}`;
}

function itemId(sequence: number): string {
  return `activation-execution-workstation-completion-item-${String(sequence).padStart(3, "0")}`;
}

function executionItemKey(sequence: number): string {
  return `${EXECUTION_KEY}:${planItemKey(sequence)}`;
}

function aggregate(
  items: readonly DeploymentWorkstationShellExecutionItemCompletionItemSnapshot[],
  workstationSnapshot: DeploymentWorkstationShellExecutionItemCompletionWorkstationSnapshot | null,
): DeploymentWorkstationShellExecutionItemCompletionAggregateSnapshot {
  const ordered = [...items].sort(compareItems);
  const selected = ordered.find((current) => current.sequence === 2) ?? null;

  return {
    totalItemCount: items.length,
    succeededItemCount: items.filter((current) => current.executionStatus === "succeeded").length,
    runningItemCount: items.filter((current) => current.executionStatus === "running").length,
    readyItemCount: items.filter((current) => current.executionStatus === "ready").length,
    pendingItemCount: items.filter((current) => current.executionStatus === "pending").length,
    failedItemCount: items.filter((current) => ["failed", "blocked", "cancelled", "rolled_back"].includes(current.executionStatus)).length,
    duplicateExecutionItemKeyCount: duplicateCount(items.map((current) => current.executionItemKey)),
    duplicatePlanItemKeyCount: duplicateCount(items.map((current) => current.planItemKey)),
    duplicateSequenceCount: duplicateCount(items.map((current) => String(current.sequence))),
    duplicateWorkstationDeploymentIdentityCount: workstationSnapshot ? 0 : 0,
    unexpectedTouchedLaterItemCount: selected ? items.filter((current) => current.sequence > selected.sequence && hasLaterDrift(current)).length : 0,
    priorSucceededPrefixCount: succeededPrefix(ordered).length,
    runningWorkstationItemCount: items.filter((current) => current.executionStatus === "running" && current.entityType === "workstation_shell").length,
  };
}

function succeededPrefix(items: readonly DeploymentWorkstationShellExecutionItemCompletionItemSnapshot[]): DeploymentWorkstationShellExecutionItemCompletionItemSnapshot[] {
  const prefix: DeploymentWorkstationShellExecutionItemCompletionItemSnapshot[] = [];
  let expected = 1;
  for (const current of items) {
    if (current.sequence !== expected || current.executionStatus !== "succeeded") {
      break;
    }
    prefix.push(current);
    expected += 1;
  }
  return prefix;
}

function hasLaterDrift(current: DeploymentWorkstationShellExecutionItemCompletionItemSnapshot): boolean {
  return current.executionStatus !== "pending" ||
    current.attemptCount !== 0 ||
    current.startedAt !== null ||
    current.completedAt !== null ||
    current.rolledBackAt !== null ||
    current.errorCode !== null ||
    current.errorMessage !== null;
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

function compareItems(
  left: DeploymentWorkstationShellExecutionItemCompletionItemSnapshot,
  right: DeploymentWorkstationShellExecutionItemCompletionItemSnapshot,
): number {
  return left.sequence - right.sequence || left.executionItemKey.localeCompare(right.executionItemKey);
}

function cloneItem(
  source: DeploymentWorkstationShellExecutionItemCompletionItemSnapshot,
): DeploymentWorkstationShellExecutionItemCompletionItemSnapshot {
  return {
    ...source,
    expectedCurrentState: source.expectedCurrentState ? JSON.parse(JSON.stringify(source.expectedCurrentState)) as Record<string, unknown> : null,
    targetState: source.targetState ? JSON.parse(JSON.stringify(source.targetState)) as Record<string, unknown> : null,
    dependencyKeys: [...source.dependencyKeys],
  };
}

export { emptyWorkstationShellExecutionItemCompletionAggregate };
