import type {
  DeploymentWorkstationShellActivationRepository,
} from "./deployment-workstation-shell-activation-repository";
import {
  cloneWorkstationShellActivationSnapshot,
  type DeploymentWorkstationShellActivationAtomicCommand,
  type DeploymentWorkstationShellActivationAtomicResult,
  type DeploymentWorkstationShellActivationAggregateSnapshot,
  type DeploymentWorkstationShellActivationItemSnapshot,
  type DeploymentWorkstationShellActivationWorkstationSnapshot,
  type DeploymentWorkstationShellActivationSessionSnapshot,
  type DeploymentWorkstationShellActivationSnapshot,
} from "./deployment-workstation-shell-activation-types";

export interface DeploymentWorkstationShellActivationTestRepositoryCalls {
  loadWorkstationShellActivationSnapshot: number;
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

export class InMemoryDeploymentWorkstationShellActivationTestRepository
  implements DeploymentWorkstationShellActivationRepository
{
  readonly calls: DeploymentWorkstationShellActivationTestRepositoryCalls = {
    loadWorkstationShellActivationSnapshot: 0,
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

  private readonly snapshot: DeploymentWorkstationShellActivationSnapshot;
  private readonly shouldThrow: boolean;
  private readonly failureMessage: string;

  constructor(input: {
    snapshot?: DeploymentWorkstationShellActivationSnapshot;
    shouldThrow?: boolean;
    failureMessage?: string;
  } = {}) {
    this.snapshot = cloneWorkstationShellActivationSnapshot(input.snapshot ?? buildWorkstationShellActivationSnapshot());
    this.shouldThrow = input.shouldThrow ?? false;
    this.failureMessage = input.failureMessage ?? "workstation shell activation repository failed";
  }

  async loadWorkstationShellActivationSnapshot(): Promise<DeploymentWorkstationShellActivationSnapshot> {
    this.calls.loadWorkstationShellActivationSnapshot += 1;

    if (this.shouldThrow) {
      throw new Error(this.failureMessage);
    }

    return cloneWorkstationShellActivationSnapshot(this.snapshot);
  }

  async activateWorkstationShellAtomically(
    _command: DeploymentWorkstationShellActivationAtomicCommand,
  ): Promise<DeploymentWorkstationShellActivationAtomicResult> {
    throw new Error("Atomic workstation shell activation is not implemented by the in-memory assessment repository.");
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

const CLINIC_ID = "clinic-workstation-shell-activation-0001";
const DEPLOYMENT_RUN_KEY = "deployment-run-workstation-shell-activation-0001";
const SESSION_ID = "activation-execution-session-workstation-shell-activation-0001";
const EXECUTION_KEY = "activation-execution-deployment-run-workstation-shell-activation-0001";
const PLAN_KEY = "activation-plan-workstation-shell-activation-0001";
const OWNER = "executor-workstation-shell-activation-001";
const TOKEN = "sensitive-workstation-shell-activation-token";
const LEASE = "2026-01-01T12:20:00.000Z";
const SESSION_STARTED_AT = "2026-01-01T11:59:00.000Z";
const CLINIC_ITEM_STARTED_AT = "2026-01-01T12:00:00.000Z";
const CLINIC_ITEM_COMPLETED_AT = "2026-01-01T12:02:00.000Z";
const WORKSTATION_ITEM_STARTED_AT = "2026-01-01T12:05:00.000Z";
const WORKSTATION_KEY = "dentist-001";
const WORKSTATION_ID = "22222222-2222-4222-8222-222222222222";
const NEXT_WORKSTATION_ID = "33333333-3333-4333-8333-333333333333";

export function buildWorkstationShellActivationSnapshot(input: {
  session?: Partial<DeploymentWorkstationShellActivationSessionSnapshot> | null;
  items?: readonly DeploymentWorkstationShellActivationItemSnapshot[];
  itemPatches?: Record<number, Partial<DeploymentWorkstationShellActivationItemSnapshot>>;
  workstationShell?: Partial<DeploymentWorkstationShellActivationWorkstationSnapshot> | null;
  aggregate?: Partial<DeploymentWorkstationShellActivationAggregateSnapshot>;
} = {}): DeploymentWorkstationShellActivationSnapshot {
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
          startedAt: WORKSTATION_ITEM_STARTED_AT,
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
  const workstationShell = input.workstationShell === null
    ? null
    : workstation({
        deploymentWorkstationKey: runningWorkstationKey(patchedItems) ?? WORKSTATION_KEY,
        ...input.workstationShell,
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
    workstationShell,
    workstationLookup: workstationLookupForBuild(patchedItems, workstationShell),
    aggregate: {
      ...aggregateWorkstationShellActivation(patchedItems, workstationShell),
      ...input.aggregate,
    },
  };
}

export function buildAlreadyActivatedWorkstationShellActivationSnapshot(): DeploymentWorkstationShellActivationSnapshot {
  return buildWorkstationShellActivationSnapshot({
    workstationShell: {
      active: true,
      planned: false,
      provisioningStatus: "active",
    },
  });
}

export function aggregateWorkstationShellActivation(
  items: readonly DeploymentWorkstationShellActivationItemSnapshot[],
  workstationShell: DeploymentWorkstationShellActivationWorkstationSnapshot | null,
): DeploymentWorkstationShellActivationAggregateSnapshot {
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
    workstationCandidateCount: workstationShell ? 1 : 0,
    duplicateWorkstationIdentityCount: 0,
  };
}

export function workstation(
  input: Partial<DeploymentWorkstationShellActivationWorkstationSnapshot> = {},
): DeploymentWorkstationShellActivationWorkstationSnapshot {
  const deploymentWorkstationKey = input.deploymentWorkstationKey ?? WORKSTATION_KEY;

  return {
    workstationId: deploymentWorkstationKey === WORKSTATION_KEY ? WORKSTATION_ID : NEXT_WORKSTATION_ID,
    clinicId: CLINIC_ID,
    deploymentWorkstationKey,
    active: false,
    planned: true,
    provisioningSource: "setup_draft",
    provisioningStatus: "planned",
    ...input,
  };
}

export function item(
  sequence: number,
  input: Partial<DeploymentWorkstationShellActivationItemSnapshot> = {},
): DeploymentWorkstationShellActivationItemSnapshot {
  return {
    itemId: `activation-execution-workstation-item-${String(sequence).padStart(3, "0")}`,
    executionItemKey: `${EXECUTION_KEY}:${planItemKey(sequence)}`,
    planItemKey: planItemKey(sequence),
    sequence,
    entityType: sequence === 1 ? "clinic" : "workstation_shell",
    entityId: sequence === 1 ? CLINIC_ID : sequence === 2 ? WORKSTATION_ID : NEXT_WORKSTATION_ID,
    action: "activate",
    executionStatus: "pending",
    attemptCount: 0,
    startedAt: null,
    completedAt: null,
    rolledBackAt: null,
    errorCode: null,
    errorMessage: null,
    dependencyKeys: sequence === 1 ? [] : [planItemKey(sequence - 1)],
    expectedCurrentState: { deploymentWorkstationKey: `dentist-${String(sequence - 1).padStart(3, "0")}`, provisioningSource: "setup_draft", provisioningStatus: "planned", active: false },
    targetState: { provisioningStatus: "active", active: true },
    ...input,
  };
}

export function planItemKey(sequence: number): string {
  if (sequence === 1) {
    return `${PLAN_KEY}:clinic`;
  }

  return `${PLAN_KEY}:workstation-${String(sequence - 1).padStart(3, "0")}`;
}

export const WORKSTATION_SHELL_ACTIVATION_TEST_IDS = {
  clinicId: CLINIC_ID,
  deploymentRunKey: DEPLOYMENT_RUN_KEY,
  sessionId: SESSION_ID,
  executionKey: EXECUTION_KEY,
  planKey: PLAN_KEY,
  owner: OWNER,
  token: TOKEN,
  lease: LEASE,
  workstationId: WORKSTATION_ID,
  workstationKey: WORKSTATION_KEY,
} as const;

function workstationLookupForBuild(
  items: readonly DeploymentWorkstationShellActivationItemSnapshot[],
  workstationShell: DeploymentWorkstationShellActivationWorkstationSnapshot | null,
): DeploymentWorkstationShellActivationSnapshot["workstationLookup"] {
  const runningWorkstation = items.find((current) => current.executionStatus === "running" && current.entityType === "workstation_shell") ?? null;
  const deploymentWorkstationKey = workstationShell?.deploymentWorkstationKey ?? runningWorkstationKey(items);

  return {
    attempted: deploymentWorkstationKey !== null,
    result: workstationShell ? "mapped" : deploymentWorkstationKey ? "zero_rows" : "not_attempted",
    rowsReturned: workstationShell ? 1 : 0,
    deploymentWorkstationKey,
    workstationId: runningWorkstation?.entityId ?? workstationShell?.workstationId ?? null,
  };
}
function runningWorkstationKey(
  items: readonly DeploymentWorkstationShellActivationItemSnapshot[],
): string | null {
  const running = items.find((current) => current.executionStatus === "running");
  const value = running?.expectedCurrentState?.deploymentWorkstationKey;
  return typeof value === "string" ? value : null;
}

function getSucceededPrefix(
  items: readonly DeploymentWorkstationShellActivationItemSnapshot[],
): DeploymentWorkstationShellActivationItemSnapshot[] {
  const prefix: DeploymentWorkstationShellActivationItemSnapshot[] = [];
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

function hasLaterIntegrityIssue(itemSnapshot: DeploymentWorkstationShellActivationItemSnapshot): boolean {
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
  itemToClone: DeploymentWorkstationShellActivationItemSnapshot,
): DeploymentWorkstationShellActivationItemSnapshot {
  return {
    ...itemToClone,
    dependencyKeys: Array.isArray(itemToClone.dependencyKeys) ? [...itemToClone.dependencyKeys] : itemToClone.dependencyKeys,
    expectedCurrentState: itemToClone.expectedCurrentState ? JSON.parse(JSON.stringify(itemToClone.expectedCurrentState)) : null,
    targetState: itemToClone.targetState ? JSON.parse(JSON.stringify(itemToClone.targetState)) : null,
  };
}
