import type {
  DeploymentActivationExecutionItemCompletionSnapshot,
} from "./deployment-activation-execution-item-completion-types";

export interface LoadDeploymentActivationExecutionItemCompletionSnapshotInput {
  clinicId: string;
  deploymentRunId: string;
  sessionId: string;
  executionKey: string;
  itemId: string;
  executionItemKey: string;
  planItemKey: string;
}

export interface DeploymentActivationExecutionItemCompletionRepository {
  loadExecutionItemCompletionSnapshot(
    input: LoadDeploymentActivationExecutionItemCompletionSnapshotInput,
  ): Promise<DeploymentActivationExecutionItemCompletionSnapshot>;
}
