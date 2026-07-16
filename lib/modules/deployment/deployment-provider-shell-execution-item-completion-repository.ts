import type {
  DeploymentProviderShellExecutionAtomicItemCompletionCommand,
  DeploymentProviderShellExecutionAtomicItemCompletionResult,
  DeploymentProviderShellExecutionItemCompletionSnapshot,
} from "./deployment-provider-shell-execution-item-completion-types";

export interface LoadDeploymentProviderShellExecutionItemCompletionSnapshotInput {
  clinicId: string;
  deploymentRunId: string;
  sessionId: string;
  executionKey: string;
}

export interface DeploymentProviderShellExecutionItemCompletionRepository {
  loadProviderShellExecutionItemCompletionSnapshot(
    input: LoadDeploymentProviderShellExecutionItemCompletionSnapshotInput,
  ): Promise<DeploymentProviderShellExecutionItemCompletionSnapshot>;

  completeProviderShellExecutionItemAtomically(
    command: DeploymentProviderShellExecutionAtomicItemCompletionCommand,
  ): Promise<DeploymentProviderShellExecutionAtomicItemCompletionResult>;
}
