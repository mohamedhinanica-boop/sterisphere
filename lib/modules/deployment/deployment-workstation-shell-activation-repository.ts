import type {
  DeploymentWorkstationShellActivationAtomicCommand,
  DeploymentWorkstationShellActivationAtomicResult,
  DeploymentWorkstationShellActivationSnapshot,
} from "./deployment-workstation-shell-activation-types";

export interface DeploymentWorkstationShellActivationSnapshotQuery {
  clinicId: string;
  deploymentRunKey: string;
  sessionId: string;
  executionKey: string;
}

export interface DeploymentWorkstationShellActivationRepository {
  loadWorkstationShellActivationSnapshot(
    query: DeploymentWorkstationShellActivationSnapshotQuery,
  ): Promise<DeploymentWorkstationShellActivationSnapshot>;

  activateWorkstationShellAtomically(
    command: DeploymentWorkstationShellActivationAtomicCommand,
  ): Promise<DeploymentWorkstationShellActivationAtomicResult>;
}