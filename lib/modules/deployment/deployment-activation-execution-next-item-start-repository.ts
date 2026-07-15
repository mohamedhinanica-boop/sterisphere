import type {
  DeploymentActivationExecutionNextItemStartSnapshot,
} from "./deployment-activation-execution-next-item-start-types";

export interface DeploymentActivationExecutionNextItemStartSnapshotQuery {
  clinicId: string;
  deploymentRunKey: string;
  sessionId: string;
  executionKey: string;
}

export interface DeploymentActivationExecutionNextItemStartRepository {
  loadNextItemStartSnapshot(
    query: DeploymentActivationExecutionNextItemStartSnapshotQuery,
  ): Promise<DeploymentActivationExecutionNextItemStartSnapshot>;
}