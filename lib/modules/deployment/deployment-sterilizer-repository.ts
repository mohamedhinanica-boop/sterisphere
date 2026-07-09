import type {
  CreateDeploymentSterilizerShellPayload,
  DeploymentSterilizerShellRecord,
} from "./deployment-sterilizer-types";

export interface DeploymentSterilizerShellPersistenceResult {
  ok: boolean;
  sterilizer: DeploymentSterilizerShellRecord | null;
  message: string;
}

export interface DeploymentSterilizerProvisioningPrerequisiteRepository {
  clinicExists(clinicId: string): Promise<boolean>;
  clinicSettingsExist(clinicId: string): Promise<boolean>;
  providerShellsProvisioned(clinicId: string): Promise<boolean>;
}

export interface DeploymentSterilizerRepository {
  findSterilizerByDeploymentKey(
    clinicId: string,
    deploymentSterilizerKey: string,
  ): Promise<DeploymentSterilizerShellRecord | null>;
  createSterilizerShell(
    payload: CreateDeploymentSterilizerShellPayload,
  ): Promise<DeploymentSterilizerShellPersistenceResult>;
  listDeploymentSterilizerShells(
    clinicId: string,
  ): Promise<readonly DeploymentSterilizerShellRecord[]>;
}
