import type {
  DeploymentActivationExecutionStartRepository,
} from "./deployment-activation-execution-start-repository";
import {
  cloneStartItemIntegrity,
  cloneStartSessionSnapshot,
  emptyStartItemIntegrity,
  type DeploymentActivationExecutionStartItemIntegritySnapshot,
  type DeploymentActivationExecutionStartSessionSnapshot,
  type DeploymentActivationExecutionStartSnapshot,
} from "./deployment-activation-execution-start-types";

export interface DeploymentActivationExecutionStartTestRepositoryCalls {
  loadExecutionStartSnapshot: number;
  forbiddenInsertWrites: 0;
  forbiddenUpdateWrites: 0;
  forbiddenUpsertWrites: 0;
  forbiddenDeleteWrites: 0;
  forbiddenClaimWrites: 0;
  forbiddenStartWrites: 0;
  forbiddenHeartbeatWrites: 0;
  forbiddenRenewWrites: 0;
  forbiddenRollbackWrites: 0;
  forbiddenItemMutationWrites: 0;
}

export class InMemoryDeploymentActivationExecutionStartTestRepository
  implements DeploymentActivationExecutionStartRepository
{
  readonly calls: DeploymentActivationExecutionStartTestRepositoryCalls = {
    loadExecutionStartSnapshot: 0,
    forbiddenInsertWrites: 0,
    forbiddenUpdateWrites: 0,
    forbiddenUpsertWrites: 0,
    forbiddenDeleteWrites: 0,
    forbiddenClaimWrites: 0,
    forbiddenStartWrites: 0,
    forbiddenHeartbeatWrites: 0,
    forbiddenRenewWrites: 0,
    forbiddenRollbackWrites: 0,
    forbiddenItemMutationWrites: 0,
  };

  private readonly snapshot: DeploymentActivationExecutionStartSnapshot;
  private readonly shouldThrow: boolean;

  constructor(input: {
    snapshot?: DeploymentActivationExecutionStartSnapshot;
    shouldThrow?: boolean;
  } = {}) {
    this.snapshot = cloneSnapshot(input.snapshot ?? {
      session: null,
      itemIntegrity: emptyStartItemIntegrity(),
    });
    this.shouldThrow = input.shouldThrow ?? false;
  }

  async loadExecutionStartSnapshot(): Promise<DeploymentActivationExecutionStartSnapshot> {
    this.calls.loadExecutionStartSnapshot += 1;

    if (this.shouldThrow) {
      throw new Error("activation execution start repository failed");
    }

    return cloneSnapshot(this.snapshot);
  }

  get downstreamWriteCount(): number {
    return (
      this.calls.forbiddenInsertWrites +
      this.calls.forbiddenUpdateWrites +
      this.calls.forbiddenUpsertWrites +
      this.calls.forbiddenDeleteWrites +
      this.calls.forbiddenClaimWrites +
      this.calls.forbiddenStartWrites +
      this.calls.forbiddenHeartbeatWrites +
      this.calls.forbiddenRenewWrites +
      this.calls.forbiddenRollbackWrites +
      this.calls.forbiddenItemMutationWrites
    );
  }
}

export function buildStartSnapshot(input: {
  session?: Partial<DeploymentActivationExecutionStartSessionSnapshot> | null;
  itemIntegrity?: Partial<DeploymentActivationExecutionStartItemIntegritySnapshot>;
} = {}): DeploymentActivationExecutionStartSnapshot {
  return {
    session:
      input.session === null
        ? null
        : {
            id: "activation-execution-session-start-0001",
            clinicId: "clinic-start-0001",
            deploymentRunId: "deployment-run-start-0001",
            executionKey: "activation-execution-deployment-run-start-0001",
            planKey: "activation-plan-deployment-run-start-0001",
            executionOwner: "executor-start-001",
            ownershipToken: "sensitive-start-token",
            leaseExpiresAt: "2026-01-01T12:05:00.000Z",
            preparationStatus: "ready",
            executionStatus: "claimed",
            startedAt: null,
            completedAt: null,
            failedAt: null,
            itemsRequested: 3,
            itemsReady: 1,
            itemsPending: 2,
            itemsBlocked: 0,
            ...input.session,
          },
    itemIntegrity: {
      durableItemCount: 3,
      readyItemCount: 1,
      pendingItemCount: 2,
      invalidStatusCount: 0,
      attemptedItemCount: 0,
      itemExecutionTimestampCount: 0,
      rollbackTimestampCount: 0,
      errorEvidenceCount: 0,
      duplicateExecutionItemKeyCount: 0,
      duplicatePlanItemKeyCount: 0,
      duplicateSequenceCount: 0,
      readyRootCount: 1,
      pendingRootCount: 0,
      malformedDependencyCount: 0,
      firstSequence: 1,
      firstItemStatus: "ready",
      ...input.itemIntegrity,
    },
  };
}

function cloneSnapshot(
  snapshot: DeploymentActivationExecutionStartSnapshot,
): DeploymentActivationExecutionStartSnapshot {
  return {
    session: snapshot.session
      ? cloneStartSessionSnapshot(snapshot.session)
      : null,
    itemIntegrity: cloneStartItemIntegrity(snapshot.itemIntegrity),
  };
}