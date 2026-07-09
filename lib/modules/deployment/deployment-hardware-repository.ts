import type {
  CreateDeploymentHardwareShellPayload,
  DeploymentHardwareShellRecord,
} from "./deployment-hardware-types";

export interface DeploymentHardwareShellPersistenceResult {
  ok: boolean;
  hardware: DeploymentHardwareShellRecord | null;
  message: string;
}

export interface DeploymentHardwareProvisioningPrerequisiteRepository {
  clinicExists(clinicId: string): Promise<boolean>;
  clinicSettingsExist(clinicId: string): Promise<boolean>;
  providerShellsProvisioned(clinicId: string): Promise<boolean>;
  sterilizerShellsProvisioned(clinicId: string): Promise<boolean>;
  workstationShellsProvisioned(clinicId: string): Promise<boolean>;
}

export interface DeploymentHardwareRepository {
  findHardwareByDeploymentKey(
    clinicId: string,
    deploymentHardwareKey: string,
  ): Promise<DeploymentHardwareShellRecord | null>;
  createHardwareShell(
    payload: CreateDeploymentHardwareShellPayload,
  ): Promise<DeploymentHardwareShellPersistenceResult>;
  listDeploymentHardwareShells(
    clinicId: string,
  ): Promise<readonly DeploymentHardwareShellRecord[]>;
}