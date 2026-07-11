import type {
  DeploymentPlannedAssignmentResolutionAssignment,
  DeploymentPlannedAssignmentResolutionHardwareShell,
  DeploymentPlannedAssignmentResolutionSterilizerShell,
  DeploymentPlannedAssignmentResolutionWorkstationShell,
} from "./deployment-planned-assignment-resolution-types";

export interface DeploymentPlannedAssignmentResolutionRepository {
  listPlannedHardwareAssignments(
    clinicId: string,
  ): Promise<readonly DeploymentPlannedAssignmentResolutionAssignment[]>;
  findHardwareShellByDeploymentKey(
    clinicId: string,
    deploymentHardwareKey: string,
  ): Promise<DeploymentPlannedAssignmentResolutionHardwareShell | null>;
  findAnyHardwareShellByDeploymentKey(
    deploymentHardwareKey: string,
  ): Promise<DeploymentPlannedAssignmentResolutionHardwareShell | null>;
  findWorkstationShellByDeploymentKey(
    clinicId: string,
    deploymentWorkstationKey: string,
  ): Promise<DeploymentPlannedAssignmentResolutionWorkstationShell | null>;
  findAnyWorkstationShellByDeploymentKey(
    deploymentWorkstationKey: string,
  ): Promise<DeploymentPlannedAssignmentResolutionWorkstationShell | null>;
  findSterilizerShellByDeploymentKey(
    clinicId: string,
    deploymentSterilizerKey: string,
  ): Promise<DeploymentPlannedAssignmentResolutionSterilizerShell | null>;
  findAnySterilizerShellByDeploymentKey(
    deploymentSterilizerKey: string,
  ): Promise<DeploymentPlannedAssignmentResolutionSterilizerShell | null>;
}
