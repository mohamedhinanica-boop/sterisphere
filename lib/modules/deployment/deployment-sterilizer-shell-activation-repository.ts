import type {
  DeploymentSterilizerShellActivationAtomicCommand,
  DeploymentSterilizerShellActivationAtomicResult,
  DeploymentSterilizerShellActivationSnapshot,
} from "./deployment-sterilizer-shell-activation-types";

export interface DeploymentSterilizerShellActivationSnapshotQuery {
  clinicId: string;
  deploymentRunKey: string;
  sessionId: string;
  executionKey: string;
}

export interface DeploymentSterilizerShellActivationRepository {
  loadSterilizerShellActivationSnapshot(
    query: DeploymentSterilizerShellActivationSnapshotQuery,
  ): Promise<DeploymentSterilizerShellActivationSnapshot>;

  activateSterilizerShellAtomically(
    command: DeploymentSterilizerShellActivationAtomicCommand,
  ): Promise<DeploymentSterilizerShellActivationAtomicResult>;
}