import type {
  DeploymentAssignmentTargetValidationRepository,
} from "./deployment-assignment-target-validation-repository";
import type {
  DeploymentAssignmentTargetValidationAssignment,
  DeploymentAssignmentTargetValidationSterilizerTarget,
  DeploymentAssignmentTargetValidationWorkstationTarget,
} from "./deployment-assignment-target-validation-types";

export interface DeploymentAssignmentTargetValidationTestRepositoryCalls {
  listPlannedHardwareAssignments: number;
  findWorkstationTargetByDeploymentKey: number;
  findAnyWorkstationTargetByDeploymentKey: number;
  findSterilizerTargetByDeploymentKey: number;
  findAnySterilizerTargetByDeploymentKey: number;
  forbiddenWorkstationIdResolutions: 0;
  forbiddenSterilizerIdResolutions: 0;
  forbiddenHardwareIdResolutions: 0;
  forbiddenAssignmentWrites: 0;
  forbiddenHardwareBindingWrites: 0;
  forbiddenActivationWrites: 0;
  forbiddenSupabaseWrites: 0;
}

export class InMemoryDeploymentAssignmentTargetValidationTestRepository
  implements DeploymentAssignmentTargetValidationRepository
{
  readonly calls: DeploymentAssignmentTargetValidationTestRepositoryCalls = {
    listPlannedHardwareAssignments: 0,
    findWorkstationTargetByDeploymentKey: 0,
    findAnyWorkstationTargetByDeploymentKey: 0,
    findSterilizerTargetByDeploymentKey: 0,
    findAnySterilizerTargetByDeploymentKey: 0,
    forbiddenWorkstationIdResolutions: 0,
    forbiddenSterilizerIdResolutions: 0,
    forbiddenHardwareIdResolutions: 0,
    forbiddenAssignmentWrites: 0,
    forbiddenHardwareBindingWrites: 0,
    forbiddenActivationWrites: 0,
    forbiddenSupabaseWrites: 0,
  };

  private readonly assignmentsById = new Map<
    string,
    DeploymentAssignmentTargetValidationAssignment
  >();
  private readonly workstationTargetsById = new Map<
    string,
    DeploymentAssignmentTargetValidationWorkstationTarget
  >();
  private readonly sterilizerTargetsById = new Map<
    string,
    DeploymentAssignmentTargetValidationSterilizerTarget
  >();

  constructor(input: {
    assignments?: readonly DeploymentAssignmentTargetValidationAssignment[];
    workstationTargets?: readonly DeploymentAssignmentTargetValidationWorkstationTarget[];
    sterilizerTargets?: readonly DeploymentAssignmentTargetValidationSterilizerTarget[];
  } = {}) {
    input.assignments?.forEach((assignment, index) =>
      this.assignmentsById.set(
        `${assignment.clinicId}:${assignment.deploymentHardwareKey}:${index}`,
        cloneAssignment(assignment),
      ),
    );
    input.workstationTargets?.forEach((target) =>
      this.workstationTargetsById.set(target.id, cloneWorkstationTarget(target)),
    );
    input.sterilizerTargets?.forEach((target) =>
      this.sterilizerTargetsById.set(target.id, cloneSterilizerTarget(target)),
    );
  }

  async listPlannedHardwareAssignments(
    clinicId: string,
  ): Promise<readonly DeploymentAssignmentTargetValidationAssignment[]> {
    this.calls.listPlannedHardwareAssignments += 1;

    return this.assignments
      .filter((assignment) => assignment.clinicId === clinicId)
      .map(cloneAssignment);
  }

  async findWorkstationTargetByDeploymentKey(
    clinicId: string,
    deploymentWorkstationKey: string,
  ): Promise<DeploymentAssignmentTargetValidationWorkstationTarget | null> {
    this.calls.findWorkstationTargetByDeploymentKey += 1;

    const target =
      this.workstationTargets.find(
        (candidate) =>
          candidate.clinicId === clinicId &&
          candidate.deploymentWorkstationKey === deploymentWorkstationKey,
      ) ?? null;

    return target ? cloneWorkstationTarget(target) : null;
  }

  async findAnyWorkstationTargetByDeploymentKey(
    deploymentWorkstationKey: string,
  ): Promise<DeploymentAssignmentTargetValidationWorkstationTarget | null> {
    this.calls.findAnyWorkstationTargetByDeploymentKey += 1;

    const target =
      this.workstationTargets.find(
        (candidate) =>
          candidate.deploymentWorkstationKey === deploymentWorkstationKey,
      ) ?? null;

    return target ? cloneWorkstationTarget(target) : null;
  }

  async findSterilizerTargetByDeploymentKey(
    clinicId: string,
    deploymentSterilizerKey: string,
  ): Promise<DeploymentAssignmentTargetValidationSterilizerTarget | null> {
    this.calls.findSterilizerTargetByDeploymentKey += 1;

    const target =
      this.sterilizerTargets.find(
        (candidate) =>
          candidate.clinicId === clinicId &&
          candidate.deploymentSterilizerKey === deploymentSterilizerKey,
      ) ?? null;

    return target ? cloneSterilizerTarget(target) : null;
  }

  async findAnySterilizerTargetByDeploymentKey(
    deploymentSterilizerKey: string,
  ): Promise<DeploymentAssignmentTargetValidationSterilizerTarget | null> {
    this.calls.findAnySterilizerTargetByDeploymentKey += 1;

    const target =
      this.sterilizerTargets.find(
        (candidate) =>
          candidate.deploymentSterilizerKey === deploymentSterilizerKey,
      ) ?? null;

    return target ? cloneSterilizerTarget(target) : null;
  }

  get assignments(): readonly DeploymentAssignmentTargetValidationAssignment[] {
    return [...this.assignmentsById.values()].map(cloneAssignment);
  }

  get workstationTargets(): readonly DeploymentAssignmentTargetValidationWorkstationTarget[] {
    return [...this.workstationTargetsById.values()].map(cloneWorkstationTarget);
  }

  get sterilizerTargets(): readonly DeploymentAssignmentTargetValidationSterilizerTarget[] {
    return [...this.sterilizerTargetsById.values()].map(cloneSterilizerTarget);
  }

  get downstreamWriteCount(): number {
    return (
      this.calls.forbiddenWorkstationIdResolutions +
      this.calls.forbiddenSterilizerIdResolutions +
      this.calls.forbiddenHardwareIdResolutions +
      this.calls.forbiddenAssignmentWrites +
      this.calls.forbiddenHardwareBindingWrites +
      this.calls.forbiddenActivationWrites +
      this.calls.forbiddenSupabaseWrites
    );
  }
}

function cloneAssignment(
  assignment: DeploymentAssignmentTargetValidationAssignment,
): DeploymentAssignmentTargetValidationAssignment {
  return { ...assignment };
}

function cloneWorkstationTarget(
  target: DeploymentAssignmentTargetValidationWorkstationTarget,
): DeploymentAssignmentTargetValidationWorkstationTarget {
  return { ...target };
}

function cloneSterilizerTarget(
  target: DeploymentAssignmentTargetValidationSterilizerTarget,
): DeploymentAssignmentTargetValidationSterilizerTarget {
  return { ...target };
}
