import type {
  DeploymentActivationReadinessRepository,
} from "./deployment-activation-readiness-repository";
import type {
  DeploymentActivationReadinessAssessmentCommand,
  DeploymentActivationReadinessSnapshot,
} from "./deployment-activation-readiness-types";

export class InMemoryDeploymentActivationReadinessTestRepository
  implements DeploymentActivationReadinessRepository
{
  readonly calls = {
    getReadinessSnapshot: 0,
    forbiddenWrites: 0,
  };

  private readonly snapshot: DeploymentActivationReadinessSnapshot;
  private readonly shouldThrow: boolean;

  constructor(input: {
    snapshot: DeploymentActivationReadinessSnapshot;
    shouldThrow?: boolean;
  }) {
    this.snapshot = cloneSnapshot(input.snapshot);
    this.shouldThrow = input.shouldThrow ?? false;
  }

  async getReadinessSnapshot(
    _command: DeploymentActivationReadinessAssessmentCommand,
  ): Promise<DeploymentActivationReadinessSnapshot> {
    this.calls.getReadinessSnapshot += 1;

    if (this.shouldThrow) {
      throw new Error("readiness repository failed");
    }

    return cloneSnapshot(this.snapshot);
  }

  get storedSnapshot(): DeploymentActivationReadinessSnapshot {
    return cloneSnapshot(this.snapshot);
  }

  get downstreamWriteCount(): number {
    return this.calls.forbiddenWrites;
  }
}

function cloneSnapshot(
  snapshot: DeploymentActivationReadinessSnapshot,
): DeploymentActivationReadinessSnapshot {
  return {
    deploymentRun: snapshot.deploymentRun
      ? { ...snapshot.deploymentRun }
      : null,
    clinic: snapshot.clinic ? { ...snapshot.clinic } : null,
    clinicSettings: snapshot.clinicSettings
      ? { ...snapshot.clinicSettings }
      : null,
    providerShells: snapshot.providerShells.map((record) => ({ ...record })),
    sterilizerShells: snapshot.sterilizerShells.map((record) => ({ ...record })),
    workstationShells: snapshot.workstationShells.map((record) => ({ ...record })),
    hardwareShells: snapshot.hardwareShells.map((record) => ({ ...record })),
    hardwareAssignments: snapshot.hardwareAssignments.map((record) => ({
      ...record,
    })),
    assignmentTargetValidation: snapshot.assignmentTargetValidation
      ? { ...snapshot.assignmentTargetValidation }
      : null,
    plannedAssignmentResolution: snapshot.plannedAssignmentResolution
      ? { ...snapshot.plannedAssignmentResolution }
      : null,
    warnings: snapshot.warnings?.map((issue) => ({ ...issue })),
  };
}
