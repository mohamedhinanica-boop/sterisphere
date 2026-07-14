import type {
  DeploymentClinicActivationRepository,
} from "./deployment-clinic-activation-repository";
import {
  cloneClinicActivationSnapshot,
  type DeploymentClinicActivationClinicSnapshot,
  type DeploymentClinicActivationItemSnapshot,
  type DeploymentClinicActivationSessionSnapshot,
  type DeploymentClinicActivationSnapshot,
} from "./deployment-clinic-activation-types";

export interface DeploymentClinicActivationTestRepositoryCalls {
  loadClinicActivationSnapshot: number;
  forbiddenInsertWrites: 0;
  forbiddenUpdateWrites: 0;
  forbiddenUpsertWrites: 0;
  forbiddenDeleteWrites: 0;
  forbiddenActivationWrites: 0;
  forbiddenItemCompletionWrites: 0;
  forbiddenDependencyWrites: 0;
  forbiddenFinalizationWrites: 0;
}

export class InMemoryDeploymentClinicActivationTestRepository
  implements DeploymentClinicActivationRepository
{
  readonly calls: DeploymentClinicActivationTestRepositoryCalls = {
    loadClinicActivationSnapshot: 0,
    forbiddenInsertWrites: 0,
    forbiddenUpdateWrites: 0,
    forbiddenUpsertWrites: 0,
    forbiddenDeleteWrites: 0,
    forbiddenActivationWrites: 0,
    forbiddenItemCompletionWrites: 0,
    forbiddenDependencyWrites: 0,
    forbiddenFinalizationWrites: 0,
  };

  private readonly snapshot: DeploymentClinicActivationSnapshot;
  private readonly shouldThrow: boolean;

  constructor(input: {
    snapshot?: DeploymentClinicActivationSnapshot;
    shouldThrow?: boolean;
  } = {}) {
    this.snapshot = cloneClinicActivationSnapshot(
      input.snapshot ?? buildClinicActivationSnapshot(),
    );
    this.shouldThrow = input.shouldThrow ?? false;
  }

  async loadClinicActivationSnapshot(): Promise<DeploymentClinicActivationSnapshot> {
    this.calls.loadClinicActivationSnapshot += 1;

    if (this.shouldThrow) {
      throw new Error("clinic activation repository failed");
    }

    return cloneClinicActivationSnapshot(this.snapshot);
  }

  get downstreamWriteCount(): number {
    return (
      this.calls.forbiddenInsertWrites +
      this.calls.forbiddenUpdateWrites +
      this.calls.forbiddenUpsertWrites +
      this.calls.forbiddenDeleteWrites +
      this.calls.forbiddenActivationWrites +
      this.calls.forbiddenItemCompletionWrites +
      this.calls.forbiddenDependencyWrites +
      this.calls.forbiddenFinalizationWrites
    );
  }
}

export function buildClinicActivationSnapshot(input: {
  session?: Partial<DeploymentClinicActivationSessionSnapshot> | null;
  item?: Partial<DeploymentClinicActivationItemSnapshot> | null;
  clinic?: Partial<DeploymentClinicActivationClinicSnapshot> | null;
} = {}): DeploymentClinicActivationSnapshot {
  return {
    session:
      input.session === null
        ? null
        : {
            clinicId: "clinic-activation-0001",
            deploymentRunId: "deployment-run-clinic-activation-0001",
            sessionId: "activation-execution-session-clinic-activation-0001",
            executionKey: "activation-execution-deployment-run-clinic-activation-0001",
            executionStatus: "running",
            executionOwner: "executor-clinic-activation-001",
            ownershipToken: "sensitive-clinic-activation-token",
            leaseExpiresAt: "2026-01-01T12:05:00.000Z",
            startedAt: "2026-01-01T11:59:00.000Z",
            completedAt: null,
            failedAt: null,
            ...input.session,
          },
    item:
      input.item === null
        ? null
        : {
            itemId: "activation-execution-item-clinic-0001",
            sessionId: "activation-execution-session-clinic-activation-0001",
            executionItemKey: "activation-execution-deployment-run-clinic-activation-0001:activation-plan-clinic-activation-0001:clinic",
            planItemKey: "activation-plan-clinic-activation-0001:clinic",
            sequence: 1,
            entityType: "clinic",
            entityKey: "clinic-activation-0001",
            entityId: "clinic-activation-0001",
            action: "activate",
            executionStatus: "running",
            attemptCount: 1,
            startedAt: "2026-01-01T12:00:30.000Z",
            completedAt: null,
            rolledBackAt: null,
            errorCode: null,
            errorMessage: null,
            dependencyKeys: [],
            expectedCurrentState: {
              deployment_status: "draft",
              clinic_id: "clinic-activation-0001",
            },
            targetState: { deploymentStatus: "active" },
            ...input.item,
          },
    clinic:
      input.clinic === null
        ? null
        : {
            id: "clinic-activation-0001",
            clinicId: "clinic-activation-0001",
            deploymentRunId: "deployment-run-clinic-activation-0001",
            deploymentStatus: "draft",
            deployedAt: null,
            active: false,
            provisioningSource: "setup_draft",
            provisioningStatus: "planned",
            archivedAt: null,
            deletedAt: null,
            currentState: {
              clinic_id: "clinic-activation-0001",
              deployment_status: "draft",
            },
            ...input.clinic,
          },
  };
}
