import type {
  DeploymentHardwareShellActivationRepository,
} from "./deployment-hardware-shell-activation-repository";
import {
  cloneHardwareShellActivationSnapshot,
  type DeploymentHardwareShellActivationAtomicCommand,
  type DeploymentHardwareShellActivationAtomicResult,
  type DeploymentHardwareShellActivationAggregateSnapshot,
  type DeploymentHardwareShellActivationItemSnapshot,
  type DeploymentHardwareShellActivationHardwareSnapshot,
  type DeploymentHardwareShellActivationSessionSnapshot,
  type DeploymentHardwareShellActivationSnapshot,
} from "./deployment-hardware-shell-activation-types";

export interface DeploymentHardwareShellActivationTestRepositoryCalls {
  loadHardwareShellActivationSnapshot: number;
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

export class InMemoryDeploymentHardwareShellActivationTestRepository
  implements DeploymentHardwareShellActivationRepository
{
  readonly calls: DeploymentHardwareShellActivationTestRepositoryCalls = {
    loadHardwareShellActivationSnapshot: 0,
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

  private readonly snapshot: DeploymentHardwareShellActivationSnapshot;
  private readonly shouldThrow: boolean;
  private readonly failureMessage: string;

  constructor(input: {
    snapshot?: DeploymentHardwareShellActivationSnapshot;
    shouldThrow?: boolean;
    failureMessage?: string;
  } = {}) {
    this.snapshot = cloneHardwareShellActivationSnapshot(input.snapshot ?? buildHardwareShellActivationSnapshot());
    this.shouldThrow = input.shouldThrow ?? false;
    this.failureMessage = input.failureMessage ?? "hardware shell activation repository failed";
  }

  async loadHardwareShellActivationSnapshot(): Promise<DeploymentHardwareShellActivationSnapshot> {
    this.calls.loadHardwareShellActivationSnapshot += 1;

    if (this.shouldThrow) {
      throw new Error(this.failureMessage);
    }

    return cloneHardwareShellActivationSnapshot(this.snapshot);
  }

  async activateHardwareShellAtomically(
    _command: DeploymentHardwareShellActivationAtomicCommand,
  ): Promise<DeploymentHardwareShellActivationAtomicResult> {
    throw new Error("Atomic hardware shell activation is not implemented by the in-memory assessment repository.");
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

const CLINIC_ID = "clinic-hardware-shell-activation-0001";
const DEPLOYMENT_RUN_KEY = "deployment-run-hardware-shell-activation-0001";
const SESSION_ID = "activation-execution-session-hardware-shell-activation-0001";
const EXECUTION_KEY = "activation-execution-deployment-run-hardware-shell-activation-0001";
const PLAN_KEY = "activation-plan-hardware-shell-activation-0001";
const OWNER = "executor-hardware-shell-activation-001";
const TOKEN = "sensitive-hardware-shell-activation-token";
const LEASE = "2026-01-01T12:20:00.000Z";
const SESSION_STARTED_AT = "2026-01-01T11:59:00.000Z";
const CLINIC_ITEM_STARTED_AT = "2026-01-01T12:00:00.000Z";
const CLINIC_ITEM_COMPLETED_AT = "2026-01-01T12:02:00.000Z";
const HARDWARE_ITEM_STARTED_AT = "2026-01-01T12:05:00.000Z";
const HARDWARE_KEY = "dentist-001";
const HARDWARE_ID = "22222222-2222-4222-8222-222222222222";
const NEXT_HARDWARE_ID = "33333333-3333-4333-8333-333333333333";

export function buildHardwareShellActivationSnapshot(input: {
  session?: Partial<DeploymentHardwareShellActivationSessionSnapshot> | null;
  items?: readonly DeploymentHardwareShellActivationItemSnapshot[];
  itemPatches?: Record<number, Partial<DeploymentHardwareShellActivationItemSnapshot>>;
  hardwareShell?: Partial<DeploymentHardwareShellActivationHardwareSnapshot> | null;
  aggregate?: Partial<DeploymentHardwareShellActivationAggregateSnapshot>;
} = {}): DeploymentHardwareShellActivationSnapshot {
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
          startedAt: HARDWARE_ITEM_STARTED_AT,
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
  const hardwareShell = input.hardwareShell === null
    ? null
    : hardware({
        deploymentHardwareKey: runningHardwareKey(patchedItems) ?? HARDWARE_KEY,
        ...input.hardwareShell,
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
    hardwareShell,
    hardwareLookup: hardwareLookupForBuild(patchedItems, hardwareShell),
    aggregate: {
      ...aggregateHardwareShellActivation(patchedItems, hardwareShell),
      ...input.aggregate,
    },
  };
}

export function buildAlreadyActivatedHardwareShellActivationSnapshot(): DeploymentHardwareShellActivationSnapshot {
  return buildHardwareShellActivationSnapshot({
    hardwareShell: {
      active: true,
      planned: false,
      provisioningStatus: "active",
    },
  });
}

export function aggregateHardwareShellActivation(
  items: readonly DeploymentHardwareShellActivationItemSnapshot[],
  hardwareShell: DeploymentHardwareShellActivationHardwareSnapshot | null,
): DeploymentHardwareShellActivationAggregateSnapshot {
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
    hardwareCandidateCount: hardwareShell ? 1 : 0,
    duplicateHardwareIdentityCount: 0,
  };
}

export function hardware(
  input: Partial<DeploymentHardwareShellActivationHardwareSnapshot> = {},
): DeploymentHardwareShellActivationHardwareSnapshot {
  const deploymentHardwareKey = input.deploymentHardwareKey ?? HARDWARE_KEY;
  const hardwareId = deploymentHardwareKey === HARDWARE_KEY ? HARDWARE_ID : NEXT_HARDWARE_ID;

  return {
    hardwareId,
    clinicId: CLINIC_ID,
    deploymentHardwareKey,
    active: false,
    planned: true,
    provisioningSource: "setup_draft",
    provisioningStatus: "planned",
    operationalStatus: "discovered",
    agentId: null,
    defaultWorkstationId: null,
    currentWorkstationId: null,
    currentState: {
      id: hardwareId,
      clinicId: CLINIC_ID,
      deploymentHardwareKey,
      provisioningSource: input.provisioningSource ?? "setup_draft",
      provisioningStatus: input.provisioningStatus ?? "planned",
      active: input.active ?? false,
      operationalStatus: input.operationalStatus ?? "discovered",
      agentId: input.agentId ?? null,
      defaultWorkstationId: input.defaultWorkstationId ?? null,
      currentWorkstationId: input.currentWorkstationId ?? null,
    },
    ...input,
  };
}

export function item(
  sequence: number,
  input: Partial<DeploymentHardwareShellActivationItemSnapshot> = {},
): DeploymentHardwareShellActivationItemSnapshot {
  return {
    itemId: `activation-execution-hardware-item-${String(sequence).padStart(3, "0")}`,
    executionItemKey: `${EXECUTION_KEY}:${planItemKey(sequence)}`,
    planItemKey: planItemKey(sequence),
    sequence,
    entityType: sequence === 1 ? "clinic" : "hardware_shell",
    entityId: sequence === 1 ? CLINIC_ID : sequence === 2 ? HARDWARE_ID : NEXT_HARDWARE_ID,
    action: "activate",
    executionStatus: "pending",
    attemptCount: 0,
    startedAt: null,
    completedAt: null,
    rolledBackAt: null,
    errorCode: null,
    errorMessage: null,
    dependencyKeys: sequence === 1 ? [] : [planItemKey(sequence - 1)],
    expectedCurrentState: { id: sequence === 2 ? HARDWARE_ID : NEXT_HARDWARE_ID, clinicId: CLINIC_ID, deploymentHardwareKey: `dentist-${String(sequence - 1).padStart(3, "0")}`, provisioningSource: "setup_draft", provisioningStatus: "planned", active: false, operationalStatus: "discovered", agentId: null, defaultWorkstationId: null, currentWorkstationId: null },
    targetState: { provisioningStatus: "active", active: true },
    ...input,
  };
}

export function planItemKey(sequence: number): string {
  if (sequence === 1) {
    return `${PLAN_KEY}:clinic`;
  }

  return `${PLAN_KEY}:hardware-${String(sequence - 1).padStart(3, "0")}`;
}

export const HARDWARE_SHELL_ACTIVATION_TEST_IDS = {
  clinicId: CLINIC_ID,
  deploymentRunKey: DEPLOYMENT_RUN_KEY,
  sessionId: SESSION_ID,
  executionKey: EXECUTION_KEY,
  planKey: PLAN_KEY,
  owner: OWNER,
  token: TOKEN,
  lease: LEASE,
  hardwareId: HARDWARE_ID,
  hardwareKey: HARDWARE_KEY,
} as const;

function hardwareLookupForBuild(
  items: readonly DeploymentHardwareShellActivationItemSnapshot[],
  hardwareShell: DeploymentHardwareShellActivationHardwareSnapshot | null,
): DeploymentHardwareShellActivationSnapshot["hardwareLookup"] {
  const runningHardware = items.find((current) => current.executionStatus === "running" && current.entityType === "hardware_shell") ?? null;
  const deploymentHardwareKey = hardwareShell?.deploymentHardwareKey ?? runningHardwareKey(items);

  return {
    attempted: deploymentHardwareKey !== null,
    result: hardwareShell ? "mapped" : deploymentHardwareKey ? "zero_rows" : "not_attempted",
    rowsReturned: hardwareShell ? 1 : 0,
    deploymentHardwareKey,
    hardwareId: runningHardware?.entityId ?? hardwareShell?.hardwareId ?? null,
  };
}
function runningHardwareKey(
  items: readonly DeploymentHardwareShellActivationItemSnapshot[],
): string | null {
  const running = items.find((current) => current.executionStatus === "running");
  const value = running?.expectedCurrentState?.deploymentHardwareKey;
  return typeof value === "string" ? value : null;
}

function getSucceededPrefix(
  items: readonly DeploymentHardwareShellActivationItemSnapshot[],
): DeploymentHardwareShellActivationItemSnapshot[] {
  const prefix: DeploymentHardwareShellActivationItemSnapshot[] = [];
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

function hasLaterIntegrityIssue(itemSnapshot: DeploymentHardwareShellActivationItemSnapshot): boolean {
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
  itemToClone: DeploymentHardwareShellActivationItemSnapshot,
): DeploymentHardwareShellActivationItemSnapshot {
  return {
    ...itemToClone,
    dependencyKeys: Array.isArray(itemToClone.dependencyKeys) ? [...itemToClone.dependencyKeys] : itemToClone.dependencyKeys,
    expectedCurrentState: itemToClone.expectedCurrentState ? JSON.parse(JSON.stringify(itemToClone.expectedCurrentState)) : null,
    targetState: itemToClone.targetState ? JSON.parse(JSON.stringify(itemToClone.targetState)) : null,
  };
}
