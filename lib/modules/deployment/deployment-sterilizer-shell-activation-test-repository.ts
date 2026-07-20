import type {
  DeploymentSterilizerShellActivationRepository,
} from "./deployment-sterilizer-shell-activation-repository";
import {
  cloneSterilizerShellActivationSnapshot,
  type DeploymentSterilizerShellActivationAtomicCommand,
  type DeploymentSterilizerShellActivationAtomicResult,
  type DeploymentSterilizerShellActivationAggregateSnapshot,
  type DeploymentSterilizerShellActivationItemSnapshot,
  type DeploymentSterilizerShellActivationSterilizerSnapshot,
  type DeploymentSterilizerShellActivationSessionSnapshot,
  type DeploymentSterilizerShellActivationSnapshot,
} from "./deployment-sterilizer-shell-activation-types";

export interface DeploymentSterilizerShellActivationTestRepositoryCalls {
  loadSterilizerShellActivationSnapshot: number;
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

export class InMemoryDeploymentSterilizerShellActivationTestRepository
  implements DeploymentSterilizerShellActivationRepository
{
  readonly calls: DeploymentSterilizerShellActivationTestRepositoryCalls = {
    loadSterilizerShellActivationSnapshot: 0,
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

  private readonly snapshot: DeploymentSterilizerShellActivationSnapshot;
  private readonly shouldThrow: boolean;
  private readonly failureMessage: string;

  constructor(input: {
    snapshot?: DeploymentSterilizerShellActivationSnapshot;
    shouldThrow?: boolean;
    failureMessage?: string;
  } = {}) {
    this.snapshot = cloneSterilizerShellActivationSnapshot(input.snapshot ?? buildSterilizerShellActivationSnapshot());
    this.shouldThrow = input.shouldThrow ?? false;
    this.failureMessage = input.failureMessage ?? "sterilizer shell activation repository failed";
  }

  async loadSterilizerShellActivationSnapshot(): Promise<DeploymentSterilizerShellActivationSnapshot> {
    this.calls.loadSterilizerShellActivationSnapshot += 1;

    if (this.shouldThrow) {
      throw new Error(this.failureMessage);
    }

    return cloneSterilizerShellActivationSnapshot(this.snapshot);
  }

  async activateSterilizerShellAtomically(
    _command: DeploymentSterilizerShellActivationAtomicCommand,
  ): Promise<DeploymentSterilizerShellActivationAtomicResult> {
    throw new Error("Atomic sterilizer shell activation is not implemented by the in-memory assessment repository.");
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

const CLINIC_ID = "clinic-sterilizer-shell-activation-0001";
const DEPLOYMENT_RUN_KEY = "deployment-run-sterilizer-shell-activation-0001";
const SESSION_ID = "activation-execution-session-sterilizer-shell-activation-0001";
const EXECUTION_KEY = "activation-execution-deployment-run-sterilizer-shell-activation-0001";
const PLAN_KEY = "activation-plan-sterilizer-shell-activation-0001";
const OWNER = "executor-sterilizer-shell-activation-001";
const TOKEN = "sensitive-sterilizer-shell-activation-token";
const LEASE = "2026-01-01T12:20:00.000Z";
const SESSION_STARTED_AT = "2026-01-01T11:59:00.000Z";
const CLINIC_ITEM_STARTED_AT = "2026-01-01T12:00:00.000Z";
const CLINIC_ITEM_COMPLETED_AT = "2026-01-01T12:02:00.000Z";
const STERILIZER_ITEM_STARTED_AT = "2026-01-01T12:05:00.000Z";
const STERILIZER_KEY = "dentist-001";

export function buildSterilizerShellActivationSnapshot(input: {
  session?: Partial<DeploymentSterilizerShellActivationSessionSnapshot> | null;
  items?: readonly DeploymentSterilizerShellActivationItemSnapshot[];
  itemPatches?: Record<number, Partial<DeploymentSterilizerShellActivationItemSnapshot>>;
  sterilizerShell?: Partial<DeploymentSterilizerShellActivationSterilizerSnapshot> | null;
  aggregate?: Partial<DeploymentSterilizerShellActivationAggregateSnapshot>;
} = {}): DeploymentSterilizerShellActivationSnapshot {
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
          startedAt: STERILIZER_ITEM_STARTED_AT,
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
  const sterilizerShell = input.sterilizerShell === null
    ? null
    : sterilizer({
        deploymentSterilizerKey: runningSterilizerKey(patchedItems) ?? STERILIZER_KEY,
        ...input.sterilizerShell,
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
    sterilizerShell,
    sterilizerLookup: sterilizerLookupForBuild(patchedItems, sterilizerShell),
    aggregate: {
      ...aggregateSterilizerShellActivation(patchedItems, sterilizerShell),
      ...input.aggregate,
    },
  };
}

export function buildAlreadyActivatedSterilizerShellActivationSnapshot(): DeploymentSterilizerShellActivationSnapshot {
  return buildSterilizerShellActivationSnapshot({
    sterilizerShell: {
      active: true,
      placeholder: false,
      provisioningStatus: "active",
    },
  });
}

export function aggregateSterilizerShellActivation(
  items: readonly DeploymentSterilizerShellActivationItemSnapshot[],
  sterilizerShell: DeploymentSterilizerShellActivationSterilizerSnapshot | null,
): DeploymentSterilizerShellActivationAggregateSnapshot {
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
    sterilizerCandidateCount: sterilizerShell ? 1 : 0,
    duplicateSterilizerIdentityCount: 0,
  };
}

export function sterilizer(
  input: Partial<DeploymentSterilizerShellActivationSterilizerSnapshot> = {},
): DeploymentSterilizerShellActivationSterilizerSnapshot {
  const deploymentSterilizerKey = input.deploymentSterilizerKey ?? STERILIZER_KEY;

  return {
    sterilizerId: `sterilizer-shell-${deploymentSterilizerKey}`,
    clinicId: CLINIC_ID,
    deploymentSterilizerKey,
    active: false,
    placeholder: true,
    provisioningSource: "setup_draft",
    provisioningStatus: "planned",
    ...input,
  };
}

export function item(
  sequence: number,
  input: Partial<DeploymentSterilizerShellActivationItemSnapshot> = {},
): DeploymentSterilizerShellActivationItemSnapshot {
  return {
    itemId: `activation-execution-sterilizer-item-${String(sequence).padStart(3, "0")}`,
    executionItemKey: `${EXECUTION_KEY}:${planItemKey(sequence)}`,
    planItemKey: planItemKey(sequence),
    sequence,
    entityType: sequence === 1 ? "clinic" : "sterilizer_shell",
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
    expectedCurrentState: { deploymentSterilizerKey: `dentist-${String(sequence - 1).padStart(3, "0")}`, provisioningStatus: "planned", active: false },
    targetState: { deploymentSterilizerKey: `dentist-${String(sequence - 1).padStart(3, "0")}`, provisioningStatus: "active", active: true },
    ...input,
  };
}

export function planItemKey(sequence: number): string {
  if (sequence === 1) {
    return `${PLAN_KEY}:clinic`;
  }

  return `${PLAN_KEY}:sterilizer-${String(sequence - 1).padStart(3, "0")}`;
}

export const STERILIZER_SHELL_ACTIVATION_TEST_IDS = {
  clinicId: CLINIC_ID,
  deploymentRunKey: DEPLOYMENT_RUN_KEY,
  sessionId: SESSION_ID,
  executionKey: EXECUTION_KEY,
  planKey: PLAN_KEY,
  owner: OWNER,
  token: TOKEN,
  lease: LEASE,
  sterilizerKey: STERILIZER_KEY,
} as const;

function sterilizerLookupForBuild(
  items: readonly DeploymentSterilizerShellActivationItemSnapshot[],
  sterilizerShell: DeploymentSterilizerShellActivationSterilizerSnapshot | null,
): DeploymentSterilizerShellActivationSnapshot["sterilizerLookup"] {
  const runningSterilizer = items.find((current) => current.executionStatus === "running" && current.entityType === "sterilizer_shell") ?? null;
  const deploymentSterilizerKey = sterilizerShell?.deploymentSterilizerKey ?? runningSterilizerKey(items);

  return {
    attempted: deploymentSterilizerKey !== null,
    result: sterilizerShell ? "mapped" : deploymentSterilizerKey ? "zero_rows" : "not_attempted",
    rowsReturned: sterilizerShell ? 1 : 0,
    deploymentSterilizerKey,
    sterilizerId: runningSterilizer?.entityId ?? sterilizerShell?.sterilizerId ?? null,
  };
}
function runningSterilizerKey(
  items: readonly DeploymentSterilizerShellActivationItemSnapshot[],
): string | null {
  return items.find((current) => current.executionStatus === "running")?.entityId ?? null;
}

function getSucceededPrefix(
  items: readonly DeploymentSterilizerShellActivationItemSnapshot[],
): DeploymentSterilizerShellActivationItemSnapshot[] {
  const prefix: DeploymentSterilizerShellActivationItemSnapshot[] = [];
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

function hasLaterIntegrityIssue(itemSnapshot: DeploymentSterilizerShellActivationItemSnapshot): boolean {
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
  itemToClone: DeploymentSterilizerShellActivationItemSnapshot,
): DeploymentSterilizerShellActivationItemSnapshot {
  return {
    ...itemToClone,
    dependencyKeys: Array.isArray(itemToClone.dependencyKeys) ? [...itemToClone.dependencyKeys] : itemToClone.dependencyKeys,
    expectedCurrentState: itemToClone.expectedCurrentState ? JSON.parse(JSON.stringify(itemToClone.expectedCurrentState)) : null,
    targetState: itemToClone.targetState ? JSON.parse(JSON.stringify(itemToClone.targetState)) : null,
  };
}
