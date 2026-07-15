import type {
  DeploymentActivationExecutionItemStartRepository,
} from "./deployment-activation-execution-item-start-repository";
import {
  cloneItemStartAggregate,
  cloneItemStartCandidate,
  cloneItemStartSession,
  emptyItemStartAggregate,
  type DeploymentActivationExecutionItemStartAggregateSnapshot,
  type DeploymentActivationExecutionItemStartCandidateSnapshot,
  type DeploymentActivationExecutionItemStartSessionSnapshot,
  type DeploymentActivationExecutionItemStartSnapshot,
} from "./deployment-activation-execution-item-start-types";

export interface DeploymentActivationExecutionItemStartTestRepositoryCalls {
  loadExecutionItemStartSnapshot: number;
  forbiddenInsertWrites: 0;
  forbiddenUpdateWrites: 0;
  forbiddenUpsertWrites: 0;
  forbiddenDeleteWrites: 0;
  forbiddenClaimWrites: 0;
  forbiddenStartWrites: 0;
  forbiddenAttemptWrites: 0;
  forbiddenCompleteWrites: 0;
  forbiddenFailWrites: 0;
  forbiddenRollbackWrites: 0;
}

export class InMemoryDeploymentActivationExecutionItemStartTestRepository
  implements DeploymentActivationExecutionItemStartRepository
{
  readonly calls: DeploymentActivationExecutionItemStartTestRepositoryCalls = {
    loadExecutionItemStartSnapshot: 0,
    forbiddenInsertWrites: 0,
    forbiddenUpdateWrites: 0,
    forbiddenUpsertWrites: 0,
    forbiddenDeleteWrites: 0,
    forbiddenClaimWrites: 0,
    forbiddenStartWrites: 0,
    forbiddenAttemptWrites: 0,
    forbiddenCompleteWrites: 0,
    forbiddenFailWrites: 0,
    forbiddenRollbackWrites: 0,
  };

  private readonly snapshot: DeploymentActivationExecutionItemStartSnapshot;
  private readonly shouldThrow: boolean;

  constructor(input: {
    snapshot?: DeploymentActivationExecutionItemStartSnapshot;
    shouldThrow?: boolean;
  } = {}) {
    this.snapshot = cloneSnapshot(input.snapshot ?? {
      session: null,
      candidateItem: null,
      aggregate: emptyItemStartAggregate(),
    });
    this.shouldThrow = input.shouldThrow ?? false;
  }

  async loadExecutionItemStartSnapshot(): Promise<DeploymentActivationExecutionItemStartSnapshot> {
    this.calls.loadExecutionItemStartSnapshot += 1;

    if (this.shouldThrow) {
      throw new Error("activation execution item-start repository failed");
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
      this.calls.forbiddenAttemptWrites +
      this.calls.forbiddenCompleteWrites +
      this.calls.forbiddenFailWrites +
      this.calls.forbiddenRollbackWrites
    );
  }
}

export function buildItemStartSnapshot(input: {
  session?: Partial<DeploymentActivationExecutionItemStartSessionSnapshot> | null;
  candidateItem?: Partial<DeploymentActivationExecutionItemStartCandidateSnapshot> | null;
  aggregate?: Partial<DeploymentActivationExecutionItemStartAggregateSnapshot>;
} = {}): DeploymentActivationExecutionItemStartSnapshot {
  return {
    session:
      input.session === null
        ? null
        : {
            clinicId: "clinic-item-start-0001",
            deploymentRunId: "deployment-run-item-start-0001",
            sessionId: "activation-execution-session-item-start-0001",
            executionKey: "activation-execution-deployment-run-item-start-0001",
            executionStatus: "running",
            executionOwner: "executor-item-start-001",
            ownershipToken: "sensitive-item-start-token",
            leaseExpiresAt: "2026-01-01T12:05:00.000Z",
            startedAt: "2026-01-01T11:59:00.000Z",
            completedAt: null,
            failedAt: null,
            itemsRequested: 3,
            ...input.session,
          },
    candidateItem:
      input.candidateItem === null
        ? null
        : {
            itemId: "activation-execution-item-0001",
            sessionId: "activation-execution-session-item-start-0001",
            executionItemKey: "activation-execution-deployment-run-item-start-0001:activation-plan-deployment-run-item-start-0001:clinic",
            planItemKey: "activation-plan-deployment-run-item-start-0001:clinic",
            sequence: 1,
            dependencyLevel: 0,
            entityType: "clinic",
            entityKey: "clinic-item-start-0001",
            entityId: "clinic-row-0001",
            action: "activate",
            executionStatus: "ready",
            attemptCount: 0,
            startedAt: null,
            completedAt: null,
            rolledBackAt: null,
            errorCode: null,
            errorMessage: null,
            dependencyKeys: [],
            reversible: true,
            rollbackAction: "restore clinic",
            expectedCurrentState: { deploymentStatus: "draft" },
            targetState: { deploymentStatus: "deployed" },
            ...input.candidateItem,
          },
    aggregate: {
      totalItemCount: 3,
      readyItemCount: 1,
      pendingItemCount: 2,
      runningItemCount: 0,
      succeededItemCount: 0,
      failedItemCount: 0,
      blockedItemCount: 0,
      attemptedItemCount: 0,
      timestampedItemCount: 0,
      rollbackEvidenceCount: 0,
      errorEvidenceCount: 0,
      duplicateExecutionItemKeyCount: 0,
      duplicatePlanItemKeyCount: 0,
      duplicateSequenceCount: 0,
      malformedDependencyCount: 0,
      readyRootCount: 1,
      firstSequence: 1,
      firstExecutionStatus: "ready",
      succeededPlanItemKeys: [],
      ...input.aggregate,
    },
  };
}

function cloneSnapshot(
  snapshot: DeploymentActivationExecutionItemStartSnapshot,
): DeploymentActivationExecutionItemStartSnapshot {
  return {
    session: snapshot.session ? cloneItemStartSession(snapshot.session) : null,
    candidateItem: snapshot.candidateItem
      ? cloneItemStartCandidate(snapshot.candidateItem)
      : null,
    aggregate: cloneItemStartAggregate(snapshot.aggregate),
  };
}