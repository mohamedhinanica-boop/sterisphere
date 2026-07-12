import type {
  DeploymentActivationExecutionClaimRepository,
} from "./deployment-activation-execution-claim-repository";
import {
  cloneClaimItemCompleteness,
  cloneClaimSessionSnapshot,
  emptyClaimItemCompleteness,
  type DeploymentActivationExecutionClaimItemCompletenessSnapshot,
  type DeploymentActivationExecutionClaimSessionSnapshot,
  type DeploymentActivationExecutionClaimSnapshot,
} from "./deployment-activation-execution-claim-types";

export interface DeploymentActivationExecutionClaimTestRepositoryCalls {
  getClaimSnapshot: number;
  forbiddenClaimWrites: 0;
  forbiddenStartWrites: 0;
  forbiddenAttemptWrites: 0;
  forbiddenActivationWrites: 0;
  forbiddenBindingWrites: 0;
  forbiddenFinalizationWrites: 0;
  forbiddenRollbackWrites: 0;
}

export class InMemoryDeploymentActivationExecutionClaimTestRepository
  implements DeploymentActivationExecutionClaimRepository
{
  readonly calls: DeploymentActivationExecutionClaimTestRepositoryCalls = {
    getClaimSnapshot: 0,
    forbiddenClaimWrites: 0,
    forbiddenStartWrites: 0,
    forbiddenAttemptWrites: 0,
    forbiddenActivationWrites: 0,
    forbiddenBindingWrites: 0,
    forbiddenFinalizationWrites: 0,
    forbiddenRollbackWrites: 0,
  };

  private readonly snapshot: DeploymentActivationExecutionClaimSnapshot;
  private readonly shouldThrow: boolean;

  constructor(input: {
    snapshot?: DeploymentActivationExecutionClaimSnapshot;
    shouldThrow?: boolean;
  } = {}) {
    this.snapshot = cloneSnapshot(input.snapshot ?? {
      session: null,
      itemCompleteness: emptyClaimItemCompleteness(),
    });
    this.shouldThrow = input.shouldThrow ?? false;
  }

  async getClaimSnapshot(): Promise<DeploymentActivationExecutionClaimSnapshot> {
    this.calls.getClaimSnapshot += 1;

    if (this.shouldThrow) {
      throw new Error("activation execution claim repository failed");
    }

    return cloneSnapshot(this.snapshot);
  }

  get downstreamWriteCount(): number {
    return (
      this.calls.forbiddenClaimWrites +
      this.calls.forbiddenStartWrites +
      this.calls.forbiddenAttemptWrites +
      this.calls.forbiddenActivationWrites +
      this.calls.forbiddenBindingWrites +
      this.calls.forbiddenFinalizationWrites +
      this.calls.forbiddenRollbackWrites
    );
  }
}

export function buildClaimSnapshot(input: {
  session?: Partial<DeploymentActivationExecutionClaimSessionSnapshot> | null;
  itemCompleteness?: Partial<DeploymentActivationExecutionClaimItemCompletenessSnapshot>;
} = {}): DeploymentActivationExecutionClaimSnapshot {
  return {
    session:
      input.session === null
        ? null
        : {
            id: "activation-execution-session-0001",
            clinicId: "clinic-claim-0001",
            deploymentRunRecordId: "deployment-run-row-0001",
            deploymentRunId: "deployment-run-claim-0001",
            executionKey: "activation-execution-deployment-run-claim-0001",
            planKey: "activation-plan-deployment-run-claim-0001",
            preparationStatus: "ready",
            executionStatus: "prepared",
            itemsRequested: 3,
            itemsReady: 1,
            itemsPending: 2,
            itemsBlocked: 0,
            blockers: 0,
            executionOwner: null,
            ownershipToken: null,
            leaseExpiresAt: null,
            startedAt: null,
            completedAt: null,
            failedAt: null,
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
            ...input.session,
          },
    itemCompleteness: {
      durableItemCount: 3,
      duplicateExecutionItemKeyCount: 0,
      duplicatePlanItemKeyCount: 0,
      duplicateSequenceCount: 0,
      invalidPreparedItemCount: 0,
      runningOrTerminalItemCount: 0,
      itemsWithAttempts: 0,
      itemsWithExecutionTimestamps: 0,
      itemsWithRollbackTimestamps: 0,
      itemsWithErrors: 0,
      readyItemCount: 1,
      pendingItemCount: 2,
      blockedItemCount: 0,
      firstExecutableSequence: 1,
      firstExecutableStatus: "ready",
      readyRootItemCount: 1,
      pendingExecutableWithoutSatisfiedDependencies: 0,
      dependencyIntegrityIssueCount: 0,
      ...input.itemCompleteness,
    },
  };
}

function cloneSnapshot(
  snapshot: DeploymentActivationExecutionClaimSnapshot,
): DeploymentActivationExecutionClaimSnapshot {
  return {
    session: snapshot.session
      ? cloneClaimSessionSnapshot(snapshot.session)
      : null,
    itemCompleteness: cloneClaimItemCompleteness(snapshot.itemCompleteness),
  };
}
