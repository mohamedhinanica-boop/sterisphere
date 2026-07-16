import type {
  DeploymentProviderShellActivationRepository,
} from "./deployment-provider-shell-activation-repository";
import {
  cloneProviderShellActivationSnapshot,
  type DeploymentProviderShellActivationAtomicCommand,
  type DeploymentProviderShellActivationAtomicResult,
  type DeploymentProviderShellActivationAggregateSnapshot,
  type DeploymentProviderShellActivationItemSnapshot,
  type DeploymentProviderShellActivationProviderSnapshot,
  type DeploymentProviderShellActivationSessionSnapshot,
  type DeploymentProviderShellActivationSnapshot,
} from "./deployment-provider-shell-activation-types";

export interface DeploymentProviderShellActivationTestRepositoryCalls {
  loadProviderShellActivationSnapshot: number;
  forbiddenInsertWrites: 0;
  forbiddenUpdateWrites: 0;
  forbiddenUpsertWrites: 0;
  forbiddenPatchWrites: 0;
  forbiddenSaveWrites: 0;
  forbiddenDeleteWrites: 0;
  forbiddenActivationWrites: 0;
  forbiddenItemCompletionWrites: 0;
  forbiddenDependencyWrites: 0;
  forbiddenRollbackWrites: 0;
  forbiddenSessionWrites: 0;
}

export class InMemoryDeploymentProviderShellActivationTestRepository
  implements DeploymentProviderShellActivationRepository
{
  readonly calls: DeploymentProviderShellActivationTestRepositoryCalls = {
    loadProviderShellActivationSnapshot: 0,
    forbiddenInsertWrites: 0,
    forbiddenUpdateWrites: 0,
    forbiddenUpsertWrites: 0,
    forbiddenPatchWrites: 0,
    forbiddenSaveWrites: 0,
    forbiddenDeleteWrites: 0,
    forbiddenActivationWrites: 0,
    forbiddenItemCompletionWrites: 0,
    forbiddenDependencyWrites: 0,
    forbiddenRollbackWrites: 0,
    forbiddenSessionWrites: 0,
  };

  private readonly snapshot: DeploymentProviderShellActivationSnapshot;
  private readonly shouldThrow: boolean;
  private readonly failureMessage: string;

  constructor(input: {
    snapshot?: DeploymentProviderShellActivationSnapshot;
    shouldThrow?: boolean;
    failureMessage?: string;
  } = {}) {
    this.snapshot = cloneProviderShellActivationSnapshot(input.snapshot ?? buildProviderShellActivationSnapshot());
    this.shouldThrow = input.shouldThrow ?? false;
    this.failureMessage = input.failureMessage ?? "provider shell activation repository failed";
  }

  async loadProviderShellActivationSnapshot(): Promise<DeploymentProviderShellActivationSnapshot> {
    this.calls.loadProviderShellActivationSnapshot += 1;

    if (this.shouldThrow) {
      throw new Error(this.failureMessage);
    }

    return cloneProviderShellActivationSnapshot(this.snapshot);
  }

  async activateProviderShellAtomically(
    _command: DeploymentProviderShellActivationAtomicCommand,
  ): Promise<DeploymentProviderShellActivationAtomicResult> {
    throw new Error("Atomic provider shell activation is not implemented by the in-memory assessment repository.");
  }
  get downstreamWriteCount(): number {
    return (
      this.calls.forbiddenInsertWrites +
      this.calls.forbiddenUpdateWrites +
      this.calls.forbiddenUpsertWrites +
      this.calls.forbiddenPatchWrites +
      this.calls.forbiddenSaveWrites +
      this.calls.forbiddenDeleteWrites +
      this.calls.forbiddenActivationWrites +
      this.calls.forbiddenItemCompletionWrites +
      this.calls.forbiddenDependencyWrites +
      this.calls.forbiddenRollbackWrites +
      this.calls.forbiddenSessionWrites
    );
  }
}

const CLINIC_ID = "clinic-provider-shell-activation-0001";
const DEPLOYMENT_RUN_KEY = "deployment-run-provider-shell-activation-0001";
const SESSION_ID = "activation-execution-session-provider-shell-activation-0001";
const EXECUTION_KEY = "activation-execution-deployment-run-provider-shell-activation-0001";
const PLAN_KEY = "activation-plan-provider-shell-activation-0001";
const OWNER = "executor-provider-shell-activation-001";
const TOKEN = "sensitive-provider-shell-activation-token";
const LEASE = "2026-01-01T12:20:00.000Z";
const SESSION_STARTED_AT = "2026-01-01T11:59:00.000Z";
const CLINIC_ITEM_STARTED_AT = "2026-01-01T12:00:00.000Z";
const CLINIC_ITEM_COMPLETED_AT = "2026-01-01T12:02:00.000Z";
const PROVIDER_ITEM_STARTED_AT = "2026-01-01T12:05:00.000Z";
const PROVIDER_KEY = "dentist-001";

export function buildProviderShellActivationSnapshot(input: {
  session?: Partial<DeploymentProviderShellActivationSessionSnapshot> | null;
  items?: readonly DeploymentProviderShellActivationItemSnapshot[];
  itemPatches?: Record<number, Partial<DeploymentProviderShellActivationItemSnapshot>>;
  providerShell?: Partial<DeploymentProviderShellActivationProviderSnapshot> | null;
  aggregate?: Partial<DeploymentProviderShellActivationAggregateSnapshot>;
} = {}): DeploymentProviderShellActivationSnapshot {
  const items = input.items
    ? input.items.map(cloneItemForBuild)
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
  const patchedItems = items.map((current) => ({
    ...current,
    ...(input.itemPatches?.[current.sequence] ?? {}),
  }));
  const providerShell = input.providerShell === null
    ? null
    : provider({
        deploymentProviderKey: runningProviderKey(patchedItems) ?? PROVIDER_KEY,
        ...input.providerShell,
      });

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
    providerShell,
    providerLookup: providerLookupForBuild(patchedItems, providerShell),
    aggregate: {
      ...aggregateProviderShellActivation(patchedItems, providerShell),
      ...input.aggregate,
    },
  };
}

export function buildAlreadyActivatedProviderShellActivationSnapshot(): DeploymentProviderShellActivationSnapshot {
  return buildProviderShellActivationSnapshot({
    providerShell: {
      active: true,
      placeholder: false,
      provisioningStatus: "active",
    },
  });
}

export function aggregateProviderShellActivation(
  items: readonly DeploymentProviderShellActivationItemSnapshot[],
  providerShell: DeploymentProviderShellActivationProviderSnapshot | null,
): DeploymentProviderShellActivationAggregateSnapshot {
  const ordered = [...items].sort((left, right) => left.sequence - right.sequence || left.executionItemKey.localeCompare(right.executionItemKey));
  const prefix = getSucceededPrefix(ordered);
  const expectedRunningSequence = prefix.length + 1;

  return {
    totalItemCount: items.length,
    succeededItemCount: items.filter((current) => current.executionStatus === "succeeded").length,
    runningItemCount: items.filter((current) => current.executionStatus === "running").length,
    pendingItemCount: items.filter((current) => current.executionStatus === "pending").length,
    readyItemCount: items.filter((current) => current.executionStatus === "ready").length,
    failedItemCount: items.filter((current) => ["failed", "blocked", "cancelled", "rolled_back"].includes(current.executionStatus)).length,
    duplicateExecutionItemKeyCount: duplicateCount(items.map((current) => current.executionItemKey)),
    duplicatePlanItemKeyCount: duplicateCount(items.map((current) => current.planItemKey)),
    duplicateSequenceCount: duplicateCount(items.map((current) => String(current.sequence))),
    succeededPlanItemKeys: prefix.map((current) => current.planItemKey),
    succeededContiguousPrefixLength: prefix.length,
    laterPendingItemIntegrityIssueCount: items.filter((current) => current.sequence > expectedRunningSequence && hasLaterIntegrityIssue(current)).length,
    providerCandidateCount: providerShell ? 1 : 0,
    duplicateProviderIdentityCount: 0,
  };
}

export function provider(
  input: Partial<DeploymentProviderShellActivationProviderSnapshot> = {},
): DeploymentProviderShellActivationProviderSnapshot {
  const deploymentProviderKey = input.deploymentProviderKey ?? PROVIDER_KEY;

  return {
    providerId: `provider-shell-${deploymentProviderKey}`,
    clinicId: CLINIC_ID,
    deploymentProviderKey,
    displayName: "Dentist Placeholder 001",
    title: "Dentist Placeholder",
    active: false,
    placeholder: true,
    provisioningSource: "setup_draft",
    provisioningStatus: "placeholder",
    ...input,
  };
}

export function item(
  sequence: number,
  input: Partial<DeploymentProviderShellActivationItemSnapshot> = {},
): DeploymentProviderShellActivationItemSnapshot {
  return {
    itemId: `activation-execution-provider-item-${String(sequence).padStart(3, "0")}`,
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
    expectedCurrentState: { deploymentProviderKey: `dentist-${String(sequence - 1).padStart(3, "0")}`, provisioningStatus: "placeholder", active: false },
    targetState: { deploymentProviderKey: `dentist-${String(sequence - 1).padStart(3, "0")}`, provisioningStatus: "active", active: true },
    ...input,
  };
}

export function planItemKey(sequence: number): string {
  if (sequence === 1) {
    return `${PLAN_KEY}:clinic`;
  }

  return `${PLAN_KEY}:provider-${String(sequence - 1).padStart(3, "0")}`;
}

export const PROVIDER_SHELL_ACTIVATION_TEST_IDS = {
  clinicId: CLINIC_ID,
  deploymentRunKey: DEPLOYMENT_RUN_KEY,
  sessionId: SESSION_ID,
  executionKey: EXECUTION_KEY,
  planKey: PLAN_KEY,
  owner: OWNER,
  token: TOKEN,
  lease: LEASE,
  providerKey: PROVIDER_KEY,
} as const;

function providerLookupForBuild(
  items: readonly DeploymentProviderShellActivationItemSnapshot[],
  providerShell: DeploymentProviderShellActivationProviderSnapshot | null,
): DeploymentProviderShellActivationSnapshot["providerLookup"] {
  const runningProvider = items.find((current) => current.executionStatus === "running" && current.entityType === "provider_shell") ?? null;
  const deploymentProviderKey = providerShell?.deploymentProviderKey ?? runningProviderKey(items);

  return {
    attempted: deploymentProviderKey !== null,
    result: providerShell ? "mapped" : deploymentProviderKey ? "zero_rows" : "not_attempted",
    rowsReturned: providerShell ? 1 : 0,
    deploymentProviderKey,
    providerId: runningProvider?.entityId ?? providerShell?.providerId ?? null,
  };
}
function runningProviderKey(
  items: readonly DeploymentProviderShellActivationItemSnapshot[],
): string | null {
  return items.find((current) => current.executionStatus === "running")?.entityId ?? null;
}

function getSucceededPrefix(
  items: readonly DeploymentProviderShellActivationItemSnapshot[],
): DeploymentProviderShellActivationItemSnapshot[] {
  const prefix: DeploymentProviderShellActivationItemSnapshot[] = [];
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

function hasLaterIntegrityIssue(itemSnapshot: DeploymentProviderShellActivationItemSnapshot): boolean {
  return itemSnapshot.executionStatus !== "pending" ||
    itemSnapshot.attemptCount !== 0 ||
    itemSnapshot.startedAt !== null ||
    itemSnapshot.completedAt !== null ||
    itemSnapshot.rolledBackAt !== null ||
    itemSnapshot.errorCode !== null ||
    itemSnapshot.errorMessage !== null;
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

function cloneItemForBuild(
  itemToClone: DeploymentProviderShellActivationItemSnapshot,
): DeploymentProviderShellActivationItemSnapshot {
  return {
    ...itemToClone,
    dependencyKeys: Array.isArray(itemToClone.dependencyKeys) ? [...itemToClone.dependencyKeys] : itemToClone.dependencyKeys,
    expectedCurrentState: itemToClone.expectedCurrentState ? JSON.parse(JSON.stringify(itemToClone.expectedCurrentState)) : null,
    targetState: itemToClone.targetState ? JSON.parse(JSON.stringify(itemToClone.targetState)) : null,
  };
}
