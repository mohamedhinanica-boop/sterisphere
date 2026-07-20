import type {
  DeploymentHardwareShellExecutionAtomicItemCompletionCommand,
  DeploymentHardwareShellExecutionAtomicItemCompletionResult,
  DeploymentHardwareShellExecutionItemCompletionSnapshot,
} from "./deployment-hardware-shell-execution-item-completion-types";

export interface LoadDeploymentHardwareShellExecutionItemCompletionSnapshotInput {
  clinicId: string;
  deploymentRunId: string;
  sessionId: string;
  executionKey: string;
}

export interface DeploymentHardwareShellExecutionItemCompletionRepository {
  loadHardwareShellExecutionItemCompletionSnapshot(
    input: LoadDeploymentHardwareShellExecutionItemCompletionSnapshotInput,
  ): Promise<DeploymentHardwareShellExecutionItemCompletionSnapshot>;

  completeHardwareShellExecutionItemAtomically(
    command: DeploymentHardwareShellExecutionAtomicItemCompletionCommand,
  ): Promise<DeploymentHardwareShellExecutionAtomicItemCompletionResult>;
}
