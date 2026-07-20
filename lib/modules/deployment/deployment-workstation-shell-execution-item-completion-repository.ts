import type {
  DeploymentWorkstationShellExecutionAtomicItemCompletionCommand,
  DeploymentWorkstationShellExecutionAtomicItemCompletionResult,
  DeploymentWorkstationShellExecutionItemCompletionSnapshot,
} from "./deployment-workstation-shell-execution-item-completion-types";

export interface LoadDeploymentWorkstationShellExecutionItemCompletionSnapshotInput {
  clinicId: string;
  deploymentRunId: string;
  sessionId: string;
  executionKey: string;
}

export interface DeploymentWorkstationShellExecutionItemCompletionRepository {
  loadWorkstationShellExecutionItemCompletionSnapshot(
    input: LoadDeploymentWorkstationShellExecutionItemCompletionSnapshotInput,
  ): Promise<DeploymentWorkstationShellExecutionItemCompletionSnapshot>;

  completeWorkstationShellExecutionItemAtomically(
    command: DeploymentWorkstationShellExecutionAtomicItemCompletionCommand,
  ): Promise<DeploymentWorkstationShellExecutionAtomicItemCompletionResult>;
}
