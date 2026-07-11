import type {
  DeploymentPlannedAssignmentResolutionRepository,
} from "./deployment-planned-assignment-resolution-repository";
import type {
  DeploymentPlannedAssignmentResolutionAssignment,
  DeploymentPlannedAssignmentResolutionHardwareShell,
  DeploymentPlannedAssignmentResolutionSterilizerShell,
  DeploymentPlannedAssignmentResolutionWorkstationShell,
} from "./deployment-planned-assignment-resolution-types";

export interface DeploymentPlannedAssignmentResolutionTestRepositoryCalls {
  listPlannedHardwareAssignments: number;
  findHardwareShellByDeploymentKey: number;
  findAnyHardwareShellByDeploymentKey: number;
  findWorkstationShellByDeploymentKey: number;
  findAnyWorkstationShellByDeploymentKey: number;
  findSterilizerShellByDeploymentKey: number;
  findAnySterilizerShellByDeploymentKey: number;
  forbiddenAssignmentWrites: 0;
  forbiddenHardwareWrites: 0;
  forbiddenWorkstationWrites: 0;
  forbiddenSterilizerWrites: 0;
  forbiddenBindingWrites: 0;
  forbiddenActivationWrites: 0;
  forbiddenIdPersistenceWrites: 0;
}

export class InMemoryDeploymentPlannedAssignmentResolutionTestRepository
  implements DeploymentPlannedAssignmentResolutionRepository
{
  readonly calls: DeploymentPlannedAssignmentResolutionTestRepositoryCalls = {
    listPlannedHardwareAssignments: 0,
    findHardwareShellByDeploymentKey: 0,
    findAnyHardwareShellByDeploymentKey: 0,
    findWorkstationShellByDeploymentKey: 0,
    findAnyWorkstationShellByDeploymentKey: 0,
    findSterilizerShellByDeploymentKey: 0,
    findAnySterilizerShellByDeploymentKey: 0,
    forbiddenAssignmentWrites: 0,
    forbiddenHardwareWrites: 0,
    forbiddenWorkstationWrites: 0,
    forbiddenSterilizerWrites: 0,
    forbiddenBindingWrites: 0,
    forbiddenActivationWrites: 0,
    forbiddenIdPersistenceWrites: 0,
  };

  private readonly assignmentsById = new Map<
    string,
    DeploymentPlannedAssignmentResolutionAssignment
  >();
  private readonly hardwareShellsById = new Map<
    string,
    DeploymentPlannedAssignmentResolutionHardwareShell
  >();
  private readonly workstationShellsById = new Map<
    string,
    DeploymentPlannedAssignmentResolutionWorkstationShell
  >();
  private readonly sterilizerShellsById = new Map<
    string,
    DeploymentPlannedAssignmentResolutionSterilizerShell
  >();

  constructor(input: {
    assignments?: readonly DeploymentPlannedAssignmentResolutionAssignment[];
    hardwareShells?: readonly DeploymentPlannedAssignmentResolutionHardwareShell[];
    workstationShells?: readonly DeploymentPlannedAssignmentResolutionWorkstationShell[];
    sterilizerShells?: readonly DeploymentPlannedAssignmentResolutionSterilizerShell[];
  } = {}) {
    input.assignments?.forEach((assignment, index) =>
      this.assignmentsById.set(
        `${assignment.clinicId}:${assignment.deploymentHardwareKey}:${index}`,
        cloneAssignment(assignment),
      ),
    );
    input.hardwareShells?.forEach((shell) =>
      this.hardwareShellsById.set(shell.id, cloneHardwareShell(shell)),
    );
    input.workstationShells?.forEach((shell) =>
      this.workstationShellsById.set(shell.id, cloneWorkstationShell(shell)),
    );
    input.sterilizerShells?.forEach((shell) =>
      this.sterilizerShellsById.set(shell.id, cloneSterilizerShell(shell)),
    );
  }

  async listPlannedHardwareAssignments(
    clinicId: string,
  ): Promise<readonly DeploymentPlannedAssignmentResolutionAssignment[]> {
    this.calls.listPlannedHardwareAssignments += 1;

    return this.assignments
      .filter((assignment) => assignment.clinicId === clinicId)
      .sort(compareAssignments)
      .map(cloneAssignment);
  }

  async findHardwareShellByDeploymentKey(
    clinicId: string,
    deploymentHardwareKey: string,
  ): Promise<DeploymentPlannedAssignmentResolutionHardwareShell | null> {
    this.calls.findHardwareShellByDeploymentKey += 1;

    const shell =
      this.hardwareShells.find(
        (candidate) =>
          candidate.clinicId === clinicId &&
          candidate.deploymentHardwareKey === deploymentHardwareKey,
      ) ?? null;

    return shell ? cloneHardwareShell(shell) : null;
  }

  async findAnyHardwareShellByDeploymentKey(
    deploymentHardwareKey: string,
  ): Promise<DeploymentPlannedAssignmentResolutionHardwareShell | null> {
    this.calls.findAnyHardwareShellByDeploymentKey += 1;

    const shell =
      this.hardwareShells.find(
        (candidate) =>
          candidate.deploymentHardwareKey === deploymentHardwareKey,
      ) ?? null;

    return shell ? cloneHardwareShell(shell) : null;
  }

  async findWorkstationShellByDeploymentKey(
    clinicId: string,
    deploymentWorkstationKey: string,
  ): Promise<DeploymentPlannedAssignmentResolutionWorkstationShell | null> {
    this.calls.findWorkstationShellByDeploymentKey += 1;

    const shell =
      this.workstationShells.find(
        (candidate) =>
          candidate.clinicId === clinicId &&
          candidate.deploymentWorkstationKey === deploymentWorkstationKey,
      ) ?? null;

    return shell ? cloneWorkstationShell(shell) : null;
  }

  async findAnyWorkstationShellByDeploymentKey(
    deploymentWorkstationKey: string,
  ): Promise<DeploymentPlannedAssignmentResolutionWorkstationShell | null> {
    this.calls.findAnyWorkstationShellByDeploymentKey += 1;

    const shell =
      this.workstationShells.find(
        (candidate) =>
          candidate.deploymentWorkstationKey === deploymentWorkstationKey,
      ) ?? null;

    return shell ? cloneWorkstationShell(shell) : null;
  }

  async findSterilizerShellByDeploymentKey(
    clinicId: string,
    deploymentSterilizerKey: string,
  ): Promise<DeploymentPlannedAssignmentResolutionSterilizerShell | null> {
    this.calls.findSterilizerShellByDeploymentKey += 1;

    const shell =
      this.sterilizerShells.find(
        (candidate) =>
          candidate.clinicId === clinicId &&
          candidate.deploymentSterilizerKey === deploymentSterilizerKey,
      ) ?? null;

    return shell ? cloneSterilizerShell(shell) : null;
  }

  async findAnySterilizerShellByDeploymentKey(
    deploymentSterilizerKey: string,
  ): Promise<DeploymentPlannedAssignmentResolutionSterilizerShell | null> {
    this.calls.findAnySterilizerShellByDeploymentKey += 1;

    const shell =
      this.sterilizerShells.find(
        (candidate) =>
          candidate.deploymentSterilizerKey === deploymentSterilizerKey,
      ) ?? null;

    return shell ? cloneSterilizerShell(shell) : null;
  }

  get assignments(): readonly DeploymentPlannedAssignmentResolutionAssignment[] {
    return [...this.assignmentsById.values()].map(cloneAssignment);
  }

  get hardwareShells(): readonly DeploymentPlannedAssignmentResolutionHardwareShell[] {
    return [...this.hardwareShellsById.values()].map(cloneHardwareShell);
  }

  get workstationShells(): readonly DeploymentPlannedAssignmentResolutionWorkstationShell[] {
    return [...this.workstationShellsById.values()].map(cloneWorkstationShell);
  }

  get sterilizerShells(): readonly DeploymentPlannedAssignmentResolutionSterilizerShell[] {
    return [...this.sterilizerShellsById.values()].map(cloneSterilizerShell);
  }

  get downstreamWriteCount(): number {
    return (
      this.calls.forbiddenAssignmentWrites +
      this.calls.forbiddenHardwareWrites +
      this.calls.forbiddenWorkstationWrites +
      this.calls.forbiddenSterilizerWrites +
      this.calls.forbiddenBindingWrites +
      this.calls.forbiddenActivationWrites +
      this.calls.forbiddenIdPersistenceWrites
    );
  }
}

function compareAssignments(
  left: DeploymentPlannedAssignmentResolutionAssignment,
  right: DeploymentPlannedAssignmentResolutionAssignment,
): number {
  return (
    left.deploymentHardwareKey.localeCompare(right.deploymentHardwareKey) ||
    String(left.assignmentKey ?? "").localeCompare(
      String(right.assignmentKey ?? ""),
    )
  );
}

function cloneAssignment(
  assignment: DeploymentPlannedAssignmentResolutionAssignment,
): DeploymentPlannedAssignmentResolutionAssignment {
  return { ...assignment };
}

function cloneHardwareShell(
  shell: DeploymentPlannedAssignmentResolutionHardwareShell,
): DeploymentPlannedAssignmentResolutionHardwareShell {
  return { ...shell };
}

function cloneWorkstationShell(
  shell: DeploymentPlannedAssignmentResolutionWorkstationShell,
): DeploymentPlannedAssignmentResolutionWorkstationShell {
  return { ...shell };
}

function cloneSterilizerShell(
  shell: DeploymentPlannedAssignmentResolutionSterilizerShell,
): DeploymentPlannedAssignmentResolutionSterilizerShell {
  return { ...shell };
}
