import type {
  DeploymentActivationExecutionItemStartSnapshot,
} from "./deployment-activation-execution-item-start-types";

export interface LoadDeploymentActivationExecutionItemStartSnapshotInput {
  clinicId: string;
  deploymentRunId: string;
  sessionId: string;
  executionKey: string;
}

export interface DeploymentActivationExecutionItemStartRepository {
  loadExecutionItemStartSnapshot(
    input: LoadDeploymentActivationExecutionItemStartSnapshotInput,
  ): Promise<DeploymentActivationExecutionItemStartSnapshot>;
}