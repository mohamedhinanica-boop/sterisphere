import type {
  DeploymentActivationPlanRepository,
} from "./deployment-activation-plan-repository";
import type {
  DeploymentActivationPlanCommand,
  DeploymentActivationPlanSnapshot,
} from "./deployment-activation-plan-types";

export class InMemoryDeploymentActivationPlanTestRepository
  implements DeploymentActivationPlanRepository
{
  readonly calls = {
    getActivationPlanSnapshot: 0,
    forbiddenWrites: 0,
  };

  private readonly snapshot: DeploymentActivationPlanSnapshot;
  private readonly shouldThrow: boolean;

  constructor(input: {
    snapshot: DeploymentActivationPlanSnapshot;
    shouldThrow?: boolean;
  }) {
    this.snapshot = cloneSnapshot(input.snapshot);
    this.shouldThrow = input.shouldThrow ?? false;
  }

  async getActivationPlanSnapshot(
    _command: DeploymentActivationPlanCommand,
  ): Promise<DeploymentActivationPlanSnapshot> {
    this.calls.getActivationPlanSnapshot += 1;

    if (this.shouldThrow) {
      throw new Error("activation plan repository failed");
    }

    return cloneSnapshot(this.snapshot);
  }

  get storedSnapshot(): DeploymentActivationPlanSnapshot {
    return cloneSnapshot(this.snapshot);
  }

  get downstreamWriteCount(): number {
    return this.calls.forbiddenWrites;
  }
}

function cloneSnapshot(
  snapshot: DeploymentActivationPlanSnapshot,
): DeploymentActivationPlanSnapshot {
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
    existingActivationPlanKey: snapshot.existingActivationPlanKey ?? null,
  };
}
