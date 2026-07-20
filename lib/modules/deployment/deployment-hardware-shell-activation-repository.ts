import type {
  DeploymentHardwareShellActivationAtomicCommand,
  DeploymentHardwareShellActivationAtomicResult,
  DeploymentHardwareShellActivationSnapshot,
} from "./deployment-hardware-shell-activation-types";

export interface DeploymentHardwareShellActivationSnapshotQuery {
  clinicId: string;
  deploymentRunKey: string;
  sessionId: string;
  executionKey: string;
}

export interface DeploymentHardwareShellActivationRepository {
  loadHardwareShellActivationSnapshot(
    query: DeploymentHardwareShellActivationSnapshotQuery,
  ): Promise<DeploymentHardwareShellActivationSnapshot>;

  activateHardwareShellAtomically(
    command: DeploymentHardwareShellActivationAtomicCommand,
  ): Promise<DeploymentHardwareShellActivationAtomicResult>;
}