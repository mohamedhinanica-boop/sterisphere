import type {
  DeploymentActivationExecutionItemCompletionRepository,
} from "./deployment-activation-execution-item-completion-repository";
import {
  cloneItemCompletionSnapshot,
  emptyItemCompletionAggregate,
  type DeploymentActivationExecutionItemCompletionAggregateSnapshot,
  type DeploymentActivationExecutionItemCompletionClinicSnapshot,
  type DeploymentActivationExecutionItemCompletionItemSnapshot,
  type DeploymentActivationExecutionItemCompletionSessionSnapshot,
  type DeploymentActivationExecutionItemCompletionSnapshot,
} from "./deployment-activation-execution-item-completion-types";

export interface DeploymentActivationExecutionItemCompletionTestRepositoryCalls {
  loadExecutionItemCompletionSnapshot: number;
  forbiddenInsertWrites: 0;
  forbiddenUpdateWrites: 0;
  forbiddenUpsertWrites: 0;
  forbiddenDeleteWrites: 0;
  forbiddenClaimWrites: 0;
  forbiddenStartWrites: 0;
  forbiddenCompleteWrites: 0;
  forbiddenDependencyWrites: 0;
  forbiddenActivationWrites: 0;
  forbiddenRollbackWrites: 0;
}

export class InMemoryDeploymentActivationExecutionItemCompletionTestRepository
  implements DeploymentActivationExecutionItemCompletionRepository
{
  readonly calls: DeploymentActivationExecutionItemCompletionTestRepositoryCalls = {
    loadExecutionItemCompletionSnapshot: 0,
    forbiddenInsertWrites: 0,
    forbiddenUpdateWrites: 0,
    forbiddenUpsertWrites: 0,
    forbiddenDeleteWrites: 0,
    forbiddenClaimWrites: 0,
    forbiddenStartWrites: 0,
    forbiddenCompleteWrites: 0,
    forbiddenDependencyWrites: 0,
    forbiddenActivationWrites: 0,
    forbiddenRollbackWrites: 0,
  };

  private readonly snapshot: DeploymentActivationExecutionItemCompletionSnapshot;
  private readonly shouldThrow: boolean;

  constructor(input: {
    snapshot?: DeploymentActivationExecutionItemCompletionSnapshot;
    shouldThrow?: boolean;
  } = {}) {
    this.snapshot = cloneItemCompletionSnapshot(input.snapshot ?? {
      session: null,
      item: null,
      clinic: null,
      aggregate: emptyItemCompletionAggregate(),
    });
    this.shouldThrow = input.shouldThrow ?? false;
  }

  async loadExecutionItemCompletionSnapshot(): Promise<DeploymentActivationExecutionItemCompletionSnapshot> {
    this.calls.loadExecutionItemCompletionSnapshot += 1;

    if (this.shouldThrow) {
      throw new Error("activation execution item-completion repository failed");
    }

    return cloneItemCompletionSnapshot(this.snapshot);
  }

  get downstreamWriteCount(): number {
    return (
      this.calls.forbiddenInsertWrites +
      this.calls.forbiddenUpdateWrites +
      this.calls.forbiddenUpsertWrites +
      this.calls.forbiddenDeleteWrites +
      this.calls.forbiddenClaimWrites +
      this.calls.forbiddenStartWrites +
      this.calls.forbiddenCompleteWrites +
      this.calls.forbiddenDependencyWrites +
      this.calls.forbiddenActivationWrites +
      this.calls.forbiddenRollbackWrites
    );
  }
}

export function buildItemCompletionSnapshot(input: {
  session?: Partial<DeploymentActivationExecutionItemCompletionSessionSnapshot> | null;
  item?: Partial<DeploymentActivationExecutionItemCompletionItemSnapshot> | null;
  clinic?: Partial<DeploymentActivationExecutionItemCompletionClinicSnapshot> | null;
  aggregate?: Partial<DeploymentActivationExecutionItemCompletionAggregateSnapshot>;
} = {}): DeploymentActivationExecutionItemCompletionSnapshot {
  return {
    session:
      input.session === null
        ? null
        : {
            clinicId: "clinic-item-completion-0001",
            deploymentRunId: "deployment-run-item-completion-0001",
            sessionId: "activation-execution-session-item-completion-0001",
            executionKey: "activation-execution-deployment-run-item-completion-0001",
            executionStatus: "running",
            executionOwner: "executor-item-completion-001",
            ownershipToken: "sensitive-item-completion-token",
            leaseExpiresAt: "2026-01-01T12:05:00.000Z",
            startedAt: "2026-01-01T11:59:00.000Z",
            completedAt: null,
            failedAt: null,
            itemsRequested: 3,
            ...input.session,
          },
    item:
      input.item === null
        ? null
        : {
            itemId: "activation-execution-item-completion-0001",
            sessionId: "activation-execution-session-item-completion-0001",
            executionItemKey: "activation-execution-deployment-run-item-completion-0001:activation-plan-deployment-run-item-completion-0001:clinic",
            planItemKey: "activation-plan-deployment-run-item-completion-0001:clinic",
            sequence: 1,
            entityType: "clinic",
            entityId: "clinic-item-completion-0001",
            action: "activate",
            executionStatus: "running",
            attemptCount: 1,
            startedAt: "2026-01-01T12:00:30.000Z",
            completedAt: null,
            rolledBackAt: null,
            errorCode: null,
            errorMessage: null,
            dependencyKeys: [],
            expectedCurrentState: { clinicId: "clinic-item-completion-0001", deploymentStatus: "draft" },
            targetState: { deploymentStatus: "deployed" },
            ...input.item,
          },
    clinic:
      input.clinic === null
        ? null
        : {
            clinicId: "clinic-item-completion-0001",
            deploymentStatus: "deployed",
            deployedAt: "2026-01-01T12:01:00.000Z",
            currentState: {
              clinicId: "clinic-item-completion-0001",
              deploymentStatus: "deployed",
            },
            ...input.clinic,
          },
    aggregate: {
      totalItemCount: 3,
      runningItemCount: 1,
      succeededItemCount: 0,
      pendingItemCount: 2,
      failedItemCount: 0,
      attemptedItemCount: 1,
      timestampedItemCount: 1,
      rollbackEvidenceCount: 0,
      errorEvidenceCount: 0,
      duplicateExecutionItemKeyCount: 0,
      duplicatePlanItemKeyCount: 0,
      duplicateSequenceCount: 0,
      ...input.aggregate,
    },
  };
}

export function buildAlreadyCompletedItemCompletionSnapshot(): DeploymentActivationExecutionItemCompletionSnapshot {
  return buildItemCompletionSnapshot({
    item: {
      executionStatus: "succeeded",
      completedAt: "2026-01-01T12:02:00.000Z",
    },
    aggregate: {
      runningItemCount: 0,
      succeededItemCount: 1,
      pendingItemCount: 2,
      attemptedItemCount: 1,
      timestampedItemCount: 1,
    },
  });
}
