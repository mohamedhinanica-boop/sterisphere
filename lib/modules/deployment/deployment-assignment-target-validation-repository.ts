import type {
  DeploymentAssignmentTargetValidationAssignment,
  DeploymentAssignmentTargetValidationSterilizerTarget,
  DeploymentAssignmentTargetValidationWorkstationTarget,
} from "./deployment-assignment-target-validation-types";

export interface DeploymentAssignmentTargetValidationRepository {
  listPlannedHardwareAssignments(
    clinicId: string,
  ): Promise<readonly DeploymentAssignmentTargetValidationAssignment[]>;
  findWorkstationTargetByDeploymentKey(
    clinicId: string,
    deploymentWorkstationKey: string,
  ): Promise<DeploymentAssignmentTargetValidationWorkstationTarget | null>;
  findAnyWorkstationTargetByDeploymentKey(
    deploymentWorkstationKey: string,
  ): Promise<DeploymentAssignmentTargetValidationWorkstationTarget | null>;
  findSterilizerTargetByDeploymentKey(
    clinicId: string,
    deploymentSterilizerKey: string,
  ): Promise<DeploymentAssignmentTargetValidationSterilizerTarget | null>;
  findAnySterilizerTargetByDeploymentKey(
    deploymentSterilizerKey: string,
  ): Promise<DeploymentAssignmentTargetValidationSterilizerTarget | null>;
}
