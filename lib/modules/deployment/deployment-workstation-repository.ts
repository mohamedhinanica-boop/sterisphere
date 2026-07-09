import type {
  CreateDeploymentWorkstationShellPayload,
  DeploymentWorkstationShellRecord,
} from "./deployment-workstation-types";

export interface DeploymentWorkstationShellPersistenceResult {
  ok: boolean;
  workstation: DeploymentWorkstationShellRecord | null;
  message: string;
}

export interface DeploymentWorkstationProvisioningPrerequisiteRepository {
  clinicExists(clinicId: string): Promise<boolean>;
  clinicSettingsExist(clinicId: string): Promise<boolean>;
  providerShellsProvisioned(clinicId: string): Promise<boolean>;
  sterilizerShellsProvisioned(clinicId: string): Promise<boolean>;
}

export interface DeploymentWorkstationRepository {
  findWorkstationByDeploymentKey(
    clinicId: string,
    deploymentWorkstationKey: string,
  ): Promise<DeploymentWorkstationShellRecord | null>;
  createWorkstationShell(
    payload: CreateDeploymentWorkstationShellPayload,
  ): Promise<DeploymentWorkstationShellPersistenceResult>;
  listDeploymentWorkstationShells(
    clinicId: string,
  ): Promise<readonly DeploymentWorkstationShellRecord[]>;
}
