import type {
  DeploymentActivationExecutionRepository,
} from "./deployment-activation-execution-repository";
import type {
  DeploymentActivationExecutionCommand,
  DeploymentActivationExecutionSnapshot,
} from "./deployment-activation-execution-types";

export class InMemoryDeploymentActivationExecutionTestRepository
  implements DeploymentActivationExecutionRepository
{
  readonly calls = {
    getExecutionSnapshot: 0,
    forbiddenWrites: 0,
  };

  private readonly snapshot: DeploymentActivationExecutionSnapshot;
  private readonly shouldThrow: boolean;

  constructor(input: {
    snapshot: DeploymentActivationExecutionSnapshot;
    shouldThrow?: boolean;
  }) {
    this.snapshot = cloneSnapshot(input.snapshot);
    this.shouldThrow = input.shouldThrow ?? false;
  }

  async getExecutionSnapshot(
    _command: DeploymentActivationExecutionCommand,
  ): Promise<DeploymentActivationExecutionSnapshot> {
    this.calls.getExecutionSnapshot += 1;

    if (this.shouldThrow) {
      throw new Error("activation execution repository failed");
    }

    return cloneSnapshot(this.snapshot);
  }

  get storedSnapshot(): DeploymentActivationExecutionSnapshot {
    return cloneSnapshot(this.snapshot);
  }

  get downstreamWriteCount(): number {
    return this.calls.forbiddenWrites;
  }
}

function cloneSnapshot(
  snapshot: DeploymentActivationExecutionSnapshot,
): DeploymentActivationExecutionSnapshot {
  return {
    deploymentRun: snapshot.deploymentRun
      ? { ...snapshot.deploymentRun }
      : null,
    existingExecution: snapshot.existingExecution
      ? { ...snapshot.existingExecution }
      : null,
    currentStates: snapshot.currentStates.map((state) => ({
      planItemKey: state.planItemKey,
      currentState: cloneRecord(state.currentState),
    })),
    warnings: snapshot.warnings?.map((warning) => ({ ...warning })),
  };
}

function cloneRecord(value: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}
