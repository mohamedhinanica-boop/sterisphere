import type {
  DeploymentProviderShellExecutionItemCompletionRepository,
} from "./deployment-provider-shell-execution-item-completion-repository";
import {
  cloneProviderShellExecutionItemCompletionSnapshot,
  emptyProviderShellExecutionItemCompletionAggregate,
  type DeploymentProviderShellExecutionAtomicItemCompletionCommand,
  type DeploymentProviderShellExecutionAtomicItemCompletionResult,
  type DeploymentProviderShellExecutionItemCompletionAggregateSnapshot,
  type DeploymentProviderShellExecutionItemCompletionItemSnapshot,
  type DeploymentProviderShellExecutionItemCompletionProviderSnapshot,
  type DeploymentProviderShellExecutionItemCompletionSessionSnapshot,
  type DeploymentProviderShellExecutionItemCompletionSnapshot,
} from "./deployment-provider-shell-execution-item-completion-types";

export interface DeploymentProviderShellExecutionItemCompletionTestRepositoryCalls {
  loadProviderShellExecutionItemCompletionSnapshot: number;
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

export class InMemoryDeploymentProviderShellExecutionItemCompletionTestRepository
  implements DeploymentProviderShellExecutionItemCompletionRepository
{
  readonly calls: DeploymentProviderShellExecutionItemCompletionTestRepositoryCalls = {
    loadProviderShellExecutionItemCompletionSnapshot: 0,
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

  private readonly snapshot: DeploymentProviderShellExecutionItemCompletionSnapshot;
  private readonly shouldThrow: boolean;
  private readonly failureMessage: string;

  constructor(input: {
    snapshot?: DeploymentProviderShellExecutionItemCompletionSnapshot;
    shouldThrow?: boolean;
    failureMessage?: string;
  } = {}) {
    this.snapshot = cloneProviderShellExecutionItemCompletionSnapshot(input.snapshot ?? buildProviderShellExecutionItemCompletionSnapshot());
    this.shouldThrow = input.shouldThrow ?? false;
    this.failureMessage = input.failureMessage ?? "provider shell execution-item completion repository failed";
  }

  async loadProviderShellExecutionItemCompletionSnapshot(): Promise<DeploymentProviderShellExecutionItemCompletionSnapshot> {
    this.calls.loadProviderShellExecutionItemCompletionSnapshot += 1;

    if (this.shouldThrow) {
      throw new Error(this.failureMessage);
    }

    return cloneProviderShellExecutionItemCompletionSnapshot(this.snapshot);
  }

  async completeProviderShellExecutionItemAtomically(
    _command: DeploymentProviderShellExecutionAtomicItemCompletionCommand,
  ): Promise<DeploymentProviderShellExecutionAtomicItemCompletionResult> {
    throw new Error("Atomic provider-shell item completion is not implemented by the in-memory assessment repository.");
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

const CLINIC_ID = "clinic-provider-item-completion-0001";
const DEPLOYMENT_RUN_ID = "deployment-run-provider-item-completion-0001";
const SESSION_ID = "activation-execution-session-provider-item-completion-0001";
const EXECUTION_KEY = "activation-execution-deployment-run-provider-item-completion-0001";
const OWNER = "executor-provider-item-completion-001";
const TOKEN = "sensitive-provider-item-completion-token";
const LEASE = "2026-01-01T12:30:00.000Z";
const SESSION_STARTED_AT = "2026-01-01T11:59:00.000Z";
const CLINIC_ITEM_STARTED_AT = "2026-01-01T12:00:00.000Z";
const CLINIC_ITEM_COMPLETED_AT = "2026-01-01T12:02:00.000Z";
const PROVIDER_ITEM_STARTED_AT = "2026-01-01T12:06:00.000Z";
const PROVIDER_ITEM_COMPLETED_AT = "2026-01-01T12:08:00.000Z";
const PROVIDER_ID = "f74f1056-0e59-474c-9676-0230d4936114";
const PROVIDER_KEY = "dentist-001";
const PLAN_KEY = "activation-plan-provider-item-completion-0001";

export const PROVIDER_SHELL_EXECUTION_ITEM_COMPLETION_TEST_IDS = {
  clinicId: CLINIC_ID,
  deploymentRunId: DEPLOYMENT_RUN_ID,
  sessionId: SESSION_ID,
  executionKey: EXECUTION_KEY,
  owner: OWNER,
  token: TOKEN,
  lease: LEASE,
  providerId: PROVIDER_ID,
  providerKey: PROVIDER_KEY,
  providerItemId: itemId(2),
  providerExecutionItemKey: executionItemKey(2),
  providerPlanItemKey: planItemKey(2),
} as const;

export function buildProviderShellExecutionItemCompletionSnapshot(input: {
  session?: Partial<DeploymentProviderShellExecutionItemCompletionSessionSnapshot> | null;
  item?: Partial<DeploymentProviderShellExecutionItemCompletionItemSnapshot> | null;
  items?: readonly DeploymentProviderShellExecutionItemCompletionItemSnapshot[];
  itemPatches?: Record<number, Partial<DeploymentProviderShellExecutionItemCompletionItemSnapshot>>;
  provider?: Partial<DeploymentProviderShellExecutionItemCompletionProviderSnapshot> | null;
  aggregate?: Partial<DeploymentProviderShellExecutionItemCompletionAggregateSnapshot>;
} = {}): DeploymentProviderShellExecutionItemCompletionSnapshot {
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
          startedAt: PROVIDER_ITEM_STARTED_AT,
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
    provider: input.provider === null
      ? null
      : provider(input.provider),
    aggregate: {
      ...aggregate(mergedItems, input.provider === null ? null : provider(input.provider)),
      ...input.aggregate,
    },
  };
}

export function buildAlreadyCompletedProviderShellExecutionItemCompletionSnapshot(): DeploymentProviderShellExecutionItemCompletionSnapshot {
  return buildProviderShellExecutionItemCompletionSnapshot({
    item: {
      executionStatus: "succeeded",
      completedAt: PROVIDER_ITEM_COMPLETED_AT,
    },
    itemPatches: {
      2: {
        executionStatus: "succeeded",
        completedAt: PROVIDER_ITEM_COMPLETED_AT,
      },
    },
    aggregate: {
      runningItemCount: 0,
      succeededItemCount: 2,
      pendingItemCount: 1,
      priorSucceededPrefixCount: 2,
      runningProviderItemCount: 0,
    },
  });
}

export function provider(
  input: Partial<DeploymentProviderShellExecutionItemCompletionProviderSnapshot> = {},
): DeploymentProviderShellExecutionItemCompletionProviderSnapshot {
  return {
    providerId: PROVIDER_ID,
    clinicId: CLINIC_ID,
    deploymentProviderKey: PROVIDER_KEY,
    provisioningSource: "setup_draft",
    provisioningStatus: "active",
    active: true,
    updatedAt: "2026-01-01T12:07:00.000Z",
    ...input,
  };
}

export function item(
  sequence: number,
  input: Partial<DeploymentProviderShellExecutionItemCompletionItemSnapshot> = {},
): DeploymentProviderShellExecutionItemCompletionItemSnapshot {
  const isClinic = sequence === 1;
  const providerKey = `dentist-${String(sequence - 1).padStart(3, "0")}`;

  return {
    itemId: itemId(sequence),
    sessionId: SESSION_ID,
    executionItemKey: executionItemKey(sequence),
    planItemKey: planItemKey(sequence),
    sequence,
    entityType: isClinic ? "clinic" : "provider_shell",
    entityId: isClinic ? CLINIC_ID : PROVIDER_ID,
    deploymentKey: isClinic ? CLINIC_ID : providerKey,
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
      : { deploymentProviderKey: providerKey, provisioningSource: "setup_draft", provisioningStatus: "placeholder", active: false },
    targetState: isClinic
      ? { deploymentStatus: "deployed" }
      : { deploymentProviderKey: providerKey, provisioningSource: "setup_draft", provisioningStatus: "active", active: true },
    dependencyKeys: isClinic ? [] : [planItemKey(sequence - 1)],
    reversible: true,
    rollbackEvidence: null,
    ...input,
  };
}

export function planItemKey(sequence: number): string {
  return sequence === 1 ? `${PLAN_KEY}:clinic` : `${PLAN_KEY}:provider-${String(sequence - 1).padStart(3, "0")}`;
}

function itemId(sequence: number): string {
  return `activation-execution-provider-completion-item-${String(sequence).padStart(3, "0")}`;
}

function executionItemKey(sequence: number): string {
  return `${EXECUTION_KEY}:${planItemKey(sequence)}`;
}

function aggregate(
  items: readonly DeploymentProviderShellExecutionItemCompletionItemSnapshot[],
  providerSnapshot: DeploymentProviderShellExecutionItemCompletionProviderSnapshot | null,
): DeploymentProviderShellExecutionItemCompletionAggregateSnapshot {
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
    duplicateProviderDeploymentIdentityCount: providerSnapshot ? 0 : 0,
    unexpectedTouchedLaterItemCount: selected ? items.filter((current) => current.sequence > selected.sequence && hasLaterDrift(current)).length : 0,
    priorSucceededPrefixCount: succeededPrefix(ordered).length,
    runningProviderItemCount: items.filter((current) => current.executionStatus === "running" && current.entityType === "provider_shell").length,
  };
}

function succeededPrefix(items: readonly DeploymentProviderShellExecutionItemCompletionItemSnapshot[]): DeploymentProviderShellExecutionItemCompletionItemSnapshot[] {
  const prefix: DeploymentProviderShellExecutionItemCompletionItemSnapshot[] = [];
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

function hasLaterDrift(current: DeploymentProviderShellExecutionItemCompletionItemSnapshot): boolean {
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
  left: DeploymentProviderShellExecutionItemCompletionItemSnapshot,
  right: DeploymentProviderShellExecutionItemCompletionItemSnapshot,
): number {
  return left.sequence - right.sequence || left.executionItemKey.localeCompare(right.executionItemKey);
}

function cloneItem(
  source: DeploymentProviderShellExecutionItemCompletionItemSnapshot,
): DeploymentProviderShellExecutionItemCompletionItemSnapshot {
  return {
    ...source,
    expectedCurrentState: source.expectedCurrentState ? JSON.parse(JSON.stringify(source.expectedCurrentState)) as Record<string, unknown> : null,
    targetState: source.targetState ? JSON.parse(JSON.stringify(source.targetState)) as Record<string, unknown> : null,
    dependencyKeys: [...source.dependencyKeys],
    rollbackEvidence: source.rollbackEvidence ? JSON.parse(JSON.stringify(source.rollbackEvidence)) as Record<string, unknown> : null,
  };
}

export { emptyProviderShellExecutionItemCompletionAggregate };
