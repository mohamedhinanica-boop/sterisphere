import type {
  DeploymentProviderShellActivationSnapshot,
} from "./deployment-provider-shell-activation-types";

export interface DeploymentProviderShellActivationSnapshotQuery {
  clinicId: string;
  deploymentRunKey: string;
  sessionId: string;
  executionKey: string;
}

export interface DeploymentProviderShellActivationRepository {
  loadProviderShellActivationSnapshot(
    query: DeploymentProviderShellActivationSnapshotQuery,
  ): Promise<DeploymentProviderShellActivationSnapshot>;
}
