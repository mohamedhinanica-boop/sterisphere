import type {
  DeploymentSterilizerShellExecutionAtomicItemCompletionCommand,
  DeploymentSterilizerShellExecutionAtomicItemCompletionResult,
  DeploymentSterilizerShellExecutionItemCompletionSnapshot,
} from "./deployment-sterilizer-shell-execution-item-completion-types";

export interface LoadDeploymentSterilizerShellExecutionItemCompletionSnapshotInput {
  clinicId: string;
  deploymentRunId: string;
  sessionId: string;
  executionKey: string;
}

export interface DeploymentSterilizerShellExecutionItemCompletionRepository {
  loadSterilizerShellExecutionItemCompletionSnapshot(
    input: LoadDeploymentSterilizerShellExecutionItemCompletionSnapshotInput,
  ): Promise<DeploymentSterilizerShellExecutionItemCompletionSnapshot>;

  completeSterilizerShellExecutionItemAtomically(
    command: DeploymentSterilizerShellExecutionAtomicItemCompletionCommand,
  ): Promise<DeploymentSterilizerShellExecutionAtomicItemCompletionResult>;
}
