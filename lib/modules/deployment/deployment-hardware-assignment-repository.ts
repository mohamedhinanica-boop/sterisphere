import type {
  CreateDeploymentHardwareAssignmentPayload,
  DeploymentHardwareAssignmentRecord,
} from "./deployment-hardware-assignment-types";

export interface DeploymentHardwareAssignmentPersistenceResult {
  ok: boolean;
  assignment: DeploymentHardwareAssignmentRecord | null;
  message: string;
}

export interface DeploymentHardwareAssignmentProvisioningPrerequisiteRepository {
  clinicExists(clinicId: string): Promise<boolean>;
  clinicSettingsExist(clinicId: string): Promise<boolean>;
  providerShellsProvisioned(clinicId: string): Promise<boolean>;
  sterilizerShellsProvisioned(clinicId: string): Promise<boolean>;
  workstationShellsProvisioned(clinicId: string): Promise<boolean>;
  hardwareShellsProvisioned(clinicId: string): Promise<boolean>;
}

export interface DeploymentHardwareAssignmentRepository {
  findAssignmentByHardwareDeploymentKey(
    clinicId: string,
    deploymentHardwareKey: string,
  ): Promise<DeploymentHardwareAssignmentRecord | null>;
  createHardwareAssignment(
    payload: CreateDeploymentHardwareAssignmentPayload,
  ): Promise<DeploymentHardwareAssignmentPersistenceResult>;
  listDeploymentHardwareAssignments(
    clinicId: string,
  ): Promise<readonly DeploymentHardwareAssignmentRecord[]>;
}