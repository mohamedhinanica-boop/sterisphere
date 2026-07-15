import type {
  DeploymentActivationExecutionNextItemStartRepository,
} from "./deployment-activation-execution-next-item-start-repository";
import {
  cloneNextItemStartSnapshot,
  type DeploymentActivationExecutionAtomicNextItemStartCommand,
  type DeploymentActivationExecutionAtomicNextItemStartResult,
  type DeploymentActivationExecutionNextItemStartAggregateSnapshot,
  type DeploymentActivationExecutionNextItemStartItemSnapshot,
  type DeploymentActivationExecutionNextItemStartSessionSnapshot,
  type DeploymentActivationExecutionNextItemStartSnapshot,
} from "./deployment-activation-execution-next-item-start-types";

export interface DeploymentActivationExecutionNextItemStartTestRepositoryCalls {
  loadNextItemStartSnapshot: number;
  forbiddenInsertWrites: 0;
  forbiddenUpdateWrites: 0;
  forbiddenUpsertWrites: 0;
  forbiddenPatchWrites: 0;
  forbiddenSaveWrites: 0;
  forbiddenDeleteWrites: 0;
  forbiddenStartWrites: 0;
  forbiddenAttemptWrites: 0;
  forbiddenTimestampWrites: 0;
  forbiddenActivationWrites: 0;
  forbiddenDependencyWrites: 0;
  forbiddenSessionWrites: 0;
}

export class InMemoryDeploymentActivationExecutionNextItemStartTestRepository
  implements DeploymentActivationExecutionNextItemStartRepository
{
  readonly calls: DeploymentActivationExecutionNextItemStartTestRepositoryCalls = {
    loadNextItemStartSnapshot: 0,
    forbiddenInsertWrites: 0,
    forbiddenUpdateWrites: 0,
    forbiddenUpsertWrites: 0,
    forbiddenPatchWrites: 0,
    forbiddenSaveWrites: 0,
    forbiddenDeleteWrites: 0,
    forbiddenStartWrites: 0,
    forbiddenAttemptWrites: 0,
    forbiddenTimestampWrites: 0,
    forbiddenActivationWrites: 0,
    forbiddenDependencyWrites: 0,
    forbiddenSessionWrites: 0,
  };

  private readonly snapshot: DeploymentActivationExecutionNextItemStartSnapshot;
  private readonly shouldThrow: boolean;
  private readonly failureMessage: string;

  constructor(input: {
    snapshot?: DeploymentActivationExecutionNextItemStartSnapshot;
    shouldThrow?: boolean;
    failureMessage?: string;
  } = {}) {
    this.snapshot = cloneNextItemStartSnapshot(input.snapshot ?? buildNextItemStartSnapshot());
    this.shouldThrow = input.shouldThrow ?? false;
    this.failureMessage = input.failureMessage ?? "next-item start repository failed";
  }

  async loadNextItemStartSnapshot(): Promise<DeploymentActivationExecutionNextItemStartSnapshot> {
    this.calls.loadNextItemStartSnapshot += 1;

    if (this.shouldThrow) {
      throw new Error(this.failureMessage);
    }

    return cloneNextItemStartSnapshot(this.snapshot);
  }


  async startNextItemAtomically(
    _command: DeploymentActivationExecutionAtomicNextItemStartCommand,
  ): Promise<DeploymentActivationExecutionAtomicNextItemStartResult> {
    throw new Error("Atomic next-item start is not implemented by the in-memory assessment repository.");
  }
  get downstreamWriteCount(): number {
    return (
      this.calls.forbiddenInsertWrites +
      this.calls.forbiddenUpdateWrites +
      this.calls.forbiddenUpsertWrites +
      this.calls.forbiddenPatchWrites +
      this.calls.forbiddenSaveWrites +
      this.calls.forbiddenDeleteWrites +
      this.calls.forbiddenStartWrites +
      this.calls.forbiddenAttemptWrites +
      this.calls.forbiddenTimestampWrites +
      this.calls.forbiddenActivationWrites +
      this.calls.forbiddenDependencyWrites +
      this.calls.forbiddenSessionWrites
    );
  }
}

const CLINIC_ID = "clinic-next-item-start-0001";
const DEPLOYMENT_RUN_KEY = "deployment-run-next-item-start-0001";
const SESSION_ID = "activation-execution-session-next-item-start-0001";
const EXECUTION_KEY = "activation-execution-deployment-run-next-item-start-0001";
const PLAN_KEY = "activation-plan-next-item-start-0001";
const OWNER = "executor-next-item-start-001";
const TOKEN = "sensitive-next-item-start-token";
const LEASE = "2026-01-01T12:10:00.000Z";
const SESSION_STARTED_AT = "2026-01-01T11:59:00.000Z";
const ITEM_STARTED_AT = "2026-01-01T12:00:00.000Z";
const ITEM_COMPLETED_AT = "2026-01-01T12:02:00.000Z";

export function buildNextItemStartSnapshot(input: {
  session?: Partial<DeploymentActivationExecutionNextItemStartSessionSnapshot> | null;
  items?: readonly DeploymentActivationExecutionNextItemStartItemSnapshot[];
  itemPatches?: Record<number, Partial<DeploymentActivationExecutionNextItemStartItemSnapshot>>;
  aggregate?: Partial<DeploymentActivationExecutionNextItemStartAggregateSnapshot>;
} = {}): DeploymentActivationExecutionNextItemStartSnapshot {
  const items = input.items
    ? input.items.map(cloneItemForBuild)
    : [
        item(1, {
          executionStatus: "succeeded",
          attemptCount: 1,
          startedAt: ITEM_STARTED_AT,
          completedAt: ITEM_COMPLETED_AT,
        }),
        item(2, {
          executionStatus: "ready",
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

  return {
    session: input.session === null
      ? null
      : {
          clinicId: CLINIC_ID,
          deploymentRunKey: DEPLOYMENT_RUN_KEY,
          sessionId: SESSION_ID,
          executionKey: EXECUTION_KEY,
          planKey: PLAN_KEY,
          preparationStatus: "ready",
          executionStatus: "running",
          executionOwner: OWNER,
          ownershipToken: TOKEN,
          leaseExpiresAt: LEASE,
          startedAt: SESSION_STARTED_AT,
          completedAt: null,
          failedAt: null,
          itemsRequested: patchedItems.length,
          ...input.session,
        },
    items: patchedItems,
    aggregate: {
      ...aggregateNextItemStartItems(patchedItems),
      ...input.aggregate,
    },
  };
}

export function buildAlreadyStartedNextItemStartSnapshot(): DeploymentActivationExecutionNextItemStartSnapshot {
  return buildNextItemStartSnapshot({
    itemPatches: {
      2: {
        executionStatus: "running",
        attemptCount: 1,
        startedAt: "2026-01-01T12:04:00.000Z",
      },
    },
  });
}

export function aggregateNextItemStartItems(
  items: readonly DeploymentActivationExecutionNextItemStartItemSnapshot[],
): DeploymentActivationExecutionNextItemStartAggregateSnapshot {
  const ordered = [...items].sort((left, right) => left.sequence - right.sequence || left.executionItemKey.localeCompare(right.executionItemKey));
  const prefix = getSucceededPrefix(ordered);
  const nextSequence = prefix.length + 1;

  return {
    totalItemCount: items.length,
    succeededItemCount: items.filter((item) => item.executionStatus === "succeeded").length,
    readyItemCount: items.filter((item) => item.executionStatus === "ready").length,
    runningItemCount: items.filter((item) => item.executionStatus === "running").length,
    pendingItemCount: items.filter((item) => item.executionStatus === "pending").length,
    failedItemCount: items.filter((item) => ["failed", "blocked", "cancelled", "rolled_back"].includes(item.executionStatus)).length,
    attemptedItemCount: items.filter((item) => item.attemptCount > 0).length,
    timestampedItemCount: items.filter((item) => item.startedAt !== null || item.completedAt !== null).length,
    rolledBackItemCount: items.filter((item) => item.rolledBackAt !== null).length,
    errorItemCount: items.filter((item) => item.errorCode !== null || item.errorMessage !== null).length,
    duplicateExecutionItemKeyCount: duplicateCount(items.map((item) => item.executionItemKey)),
    duplicatePlanItemKeyCount: duplicateCount(items.map((item) => item.planItemKey)),
    duplicateSequenceCount: duplicateCount(items.map((item) => String(item.sequence))),
    succeededPlanItemKeys: prefix.map((item) => item.planItemKey),
    succeededContiguousPrefixLength: prefix.length,
    readyItemCandidateCount: items.filter((item) => item.sequence === nextSequence && item.executionStatus === "ready").length,
    laterPendingItemIntegrityIssueCount: items.filter((item) => item.sequence > nextSequence && hasLaterIntegrityIssue(item)).length,
  };
}

export function item(
  sequence: number,
  input: Partial<DeploymentActivationExecutionNextItemStartItemSnapshot> = {},
): DeploymentActivationExecutionNextItemStartItemSnapshot {
  return {
    itemId: `activation-execution-item-next-start-${String(sequence).padStart(3, "0")}`,
    executionItemKey: `${EXECUTION_KEY}:${planItemKey(sequence)}`,
    planItemKey: planItemKey(sequence),
    sequence,
    entityType: sequence === 1 ? "clinic" : "provider_shell",
    entityId: sequence === 1 ? CLINIC_ID : `dentist-${String(sequence - 1).padStart(3, "0")}`,
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

export const NEXT_ITEM_START_TEST_IDS = {
  clinicId: CLINIC_ID,
  deploymentRunKey: DEPLOYMENT_RUN_KEY,
  sessionId: SESSION_ID,
  executionKey: EXECUTION_KEY,
  planKey: PLAN_KEY,
  owner: OWNER,
  token: TOKEN,
  lease: LEASE,
} as const;

function getSucceededPrefix(
  items: readonly DeploymentActivationExecutionNextItemStartItemSnapshot[],
): DeploymentActivationExecutionNextItemStartItemSnapshot[] {
  const prefix: DeploymentActivationExecutionNextItemStartItemSnapshot[] = [];
  let expectedSequence = 1;

  for (const current of items) {
    if (current.sequence !== expectedSequence || current.executionStatus !== "succeeded") {
      break;
    }

    prefix.push(current);
    expectedSequence += 1;
  }

  return prefix;
}

function hasLaterIntegrityIssue(item: DeploymentActivationExecutionNextItemStartItemSnapshot): boolean {
  return item.executionStatus !== "pending" || item.attemptCount !== 0 || item.startedAt !== null || item.completedAt !== null || item.rolledBackAt !== null || item.errorCode !== null || item.errorMessage !== null;
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

function cloneItemForBuild(itemToClone: DeploymentActivationExecutionNextItemStartItemSnapshot): DeploymentActivationExecutionNextItemStartItemSnapshot {
  return {
    ...itemToClone,
    dependencyKeys: Array.isArray(itemToClone.dependencyKeys) ? [...itemToClone.dependencyKeys] : itemToClone.dependencyKeys,
    expectedCurrentState: itemToClone.expectedCurrentState ? JSON.parse(JSON.stringify(itemToClone.expectedCurrentState)) : null,
    targetState: itemToClone.targetState ? JSON.parse(JSON.stringify(itemToClone.targetState)) : null,
  };
}