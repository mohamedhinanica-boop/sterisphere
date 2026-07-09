import type {
  CreateDeploymentProviderShellPayload,
  DeploymentProviderShellRecord,
} from "./deployment-provider-types";

export interface DeploymentProviderShellPersistenceResult {
  ok: boolean;
  provider: DeploymentProviderShellRecord | null;
  message: string;
}

export interface DeploymentProviderProvisioningPrerequisiteRepository {
  clinicExists(clinicId: string): Promise<boolean>;
  clinicSettingsExist(clinicId: string): Promise<boolean>;
}

export interface DeploymentProviderRepository {
  findProviderByDeploymentKey(
    clinicId: string,
    deploymentProviderKey: string,
  ): Promise<DeploymentProviderShellRecord | null>;
  createProviderShell(
    payload: CreateDeploymentProviderShellPayload,
  ): Promise<DeploymentProviderShellPersistenceResult>;
  listDeploymentProviderShells(
    clinicId: string,
  ): Promise<readonly DeploymentProviderShellRecord[]>;
}

