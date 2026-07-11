import type {
  DeploymentHardwareAssignmentPersistenceResult,
  DeploymentHardwareAssignmentProvisioningPrerequisiteRepository,
  DeploymentHardwareAssignmentRepository,
} from "./deployment-hardware-assignment-repository";
import {
  resolveExistingHardwareAssignment,
} from "./deployment-hardware-assignment-integrity";
import type {
  CreateDeploymentHardwareAssignmentPayload,
  DeploymentHardwareAssignmentRecord,
} from "./deployment-hardware-assignment-types";

export interface DeploymentHardwareAssignmentTestRepositoryCalls {
  clinicExists: number;
  clinicSettingsExist: number;
  providerShellsProvisioned: number;
  sterilizerShellsProvisioned: number;
  workstationShellsProvisioned: number;
  hardwareShellsProvisioned: number;
  findAssignmentByHardwareDeploymentKey: number;
  createHardwareAssignment: number;
  listDeploymentHardwareAssignments: number;
  forbiddenHardwareShellMutations: 0;
  forbiddenWorkstationIdResolutions: 0;
  forbiddenSterilizerIdResolutions: 0;
  forbiddenHardwareIdResolutions: 0;
  forbiddenAgentRegistrationWrites: 0;
  forbiddenActivationWrites: 0;
  forbiddenPackWrites: 0;
  forbiddenCycleWrites: 0;
  forbiddenTraceWrites: 0;
  forbiddenUserWrites: 0;
  forbiddenAuditLogWrites: 0;
}

export class InMemoryDeploymentHardwareAssignmentTestRepository
  implements
    DeploymentHardwareAssignmentRepository,
    DeploymentHardwareAssignmentProvisioningPrerequisiteRepository
{
  readonly calls: DeploymentHardwareAssignmentTestRepositoryCalls = {
    clinicExists: 0,
    clinicSettingsExist: 0,
    providerShellsProvisioned: 0,
    sterilizerShellsProvisioned: 0,
    workstationShellsProvisioned: 0,
    hardwareShellsProvisioned: 0,
    findAssignmentByHardwareDeploymentKey: 0,
    createHardwareAssignment: 0,
    listDeploymentHardwareAssignments: 0,
    forbiddenHardwareShellMutations: 0,
    forbiddenWorkstationIdResolutions: 0,
    forbiddenSterilizerIdResolutions: 0,
    forbiddenHardwareIdResolutions: 0,
    forbiddenAgentRegistrationWrites: 0,
    forbiddenActivationWrites: 0,
    forbiddenPackWrites: 0,
    forbiddenCycleWrites: 0,
    forbiddenTraceWrites: 0,
    forbiddenUserWrites: 0,
    forbiddenAuditLogWrites: 0,
  };

  private readonly clinicIds = new Set<string>();
  private readonly clinicIdsWithSettings = new Set<string>();
  private readonly clinicIdsWithProviderShells = new Set<string>();
  private readonly clinicIdsWithSterilizerShells = new Set<string>();
  private readonly clinicIdsWithWorkstationShells = new Set<string>();
  private readonly clinicIdsWithHardwareShells = new Set<string>();
  private readonly assignmentsById = new Map<string, DeploymentHardwareAssignmentRecord>();
  private nextAssignmentNumber = 1;

  constructor(input: {
    clinicIds?: readonly string[];
    clinicIdsWithSettings?: readonly string[];
    clinicIdsWithProviderShells?: readonly string[];
    clinicIdsWithSterilizerShells?: readonly string[];
    clinicIdsWithWorkstationShells?: readonly string[];
    clinicIdsWithHardwareShells?: readonly string[];
    assignments?: readonly DeploymentHardwareAssignmentRecord[];
  } = {}) {
    input.clinicIds?.forEach((clinicId) => this.clinicIds.add(clinicId));
    input.clinicIdsWithSettings?.forEach((clinicId) =>
      this.clinicIdsWithSettings.add(clinicId),
    );
    input.clinicIdsWithProviderShells?.forEach((clinicId) =>
      this.clinicIdsWithProviderShells.add(clinicId),
    );
    input.clinicIdsWithSterilizerShells?.forEach((clinicId) =>
      this.clinicIdsWithSterilizerShells.add(clinicId),
    );
    input.clinicIdsWithWorkstationShells?.forEach((clinicId) =>
      this.clinicIdsWithWorkstationShells.add(clinicId),
    );
    input.clinicIdsWithHardwareShells?.forEach((clinicId) =>
      this.clinicIdsWithHardwareShells.add(clinicId),
    );
    input.assignments?.forEach((assignment) =>
      this.storeAssignment(assignment),
    );
  }

  async clinicExists(clinicId: string): Promise<boolean> {
    this.calls.clinicExists += 1;

    return this.clinicIds.has(clinicId);
  }

  async clinicSettingsExist(clinicId: string): Promise<boolean> {
    this.calls.clinicSettingsExist += 1;

    return this.clinicIdsWithSettings.has(clinicId);
  }

  async providerShellsProvisioned(clinicId: string): Promise<boolean> {
    this.calls.providerShellsProvisioned += 1;

    return this.clinicIdsWithProviderShells.has(clinicId);
  }

  async sterilizerShellsProvisioned(clinicId: string): Promise<boolean> {
    this.calls.sterilizerShellsProvisioned += 1;

    return this.clinicIdsWithSterilizerShells.has(clinicId);
  }

  async workstationShellsProvisioned(clinicId: string): Promise<boolean> {
    this.calls.workstationShellsProvisioned += 1;

    return this.clinicIdsWithWorkstationShells.has(clinicId);
  }

  async hardwareShellsProvisioned(clinicId: string): Promise<boolean> {
    this.calls.hardwareShellsProvisioned += 1;

    return this.clinicIdsWithHardwareShells.has(clinicId);
  }

  async findAssignmentByHardwareDeploymentKey(
    clinicId: string,
    deploymentHardwareKey: string,
  ): Promise<DeploymentHardwareAssignmentRecord | null> {
    this.calls.findAssignmentByHardwareDeploymentKey += 1;

    return (
      this.assignments.find(
        (assignment) =>
          assignment.clinicId === clinicId &&
          assignment.deploymentHardwareKey === deploymentHardwareKey,
      ) ?? null
    );
  }

  async createHardwareAssignment(
    payload: CreateDeploymentHardwareAssignmentPayload,
  ): Promise<DeploymentHardwareAssignmentPersistenceResult> {
    this.calls.createHardwareAssignment += 1;

    const existingAssignment =
      await this.findAssignmentByHardwareDeploymentKey(
        payload.clinicId,
        payload.deploymentHardwareKey,
      );

    if (existingAssignment) {
      return {
        ok: false,
        assignment: existingAssignment,
        message: "Hardware assignment deployment key already exists in memory.",
      };
    }

    const assignment: DeploymentHardwareAssignmentRecord = {
      id: `hardware-assignment-${this.nextAssignmentNumber
        .toString()
        .padStart(4, "0")}`,
      clinicId: payload.clinicId,
      deploymentHardwareAssignmentKey: payload.deploymentHardwareAssignmentKey,
      deploymentHardwareKey: payload.deploymentHardwareKey,
      targetType: payload.targetType,
      targetDeploymentKey: payload.targetDeploymentKey,
      assignmentStatus: payload.assignmentStatus,
      assignmentSource: payload.assignmentSource,
      active: payload.active,
      displayOrder: payload.displayOrder,
      reason: payload.reason,
      metadata: payload.metadata,
      createdAt: payload.createdAt ?? new Date(0).toISOString(),
      updatedAt:
        payload.updatedAt ?? payload.createdAt ?? new Date(0).toISOString(),
    };

    this.nextAssignmentNumber += 1;
    this.storeAssignment(assignment);

    return {
      ok: true,
      assignment,
      message: "In-memory hardware assignment created.",
    };
  }

  async listDeploymentHardwareAssignments(
    clinicId: string,
  ): Promise<readonly DeploymentHardwareAssignmentRecord[]> {
    this.calls.listDeploymentHardwareAssignments += 1;

    return this.assignments
      .filter(
        (assignment) =>
          assignment.clinicId === clinicId &&
          assignment.deploymentHardwareKey !== null,
      )
      .sort((left, right) =>
        String(left.deploymentHardwareKey).localeCompare(
          String(right.deploymentHardwareKey),
        ),
      );
  }

  get assignments(): readonly DeploymentHardwareAssignmentRecord[] {
    return [...this.assignmentsById.values()];
  }

  get downstreamWriteCount(): number {
    return (
      this.calls.forbiddenHardwareShellMutations +
      this.calls.forbiddenWorkstationIdResolutions +
      this.calls.forbiddenSterilizerIdResolutions +
      this.calls.forbiddenHardwareIdResolutions +
      this.calls.forbiddenAgentRegistrationWrites +
      this.calls.forbiddenActivationWrites +
      this.calls.forbiddenPackWrites +
      this.calls.forbiddenCycleWrites +
      this.calls.forbiddenTraceWrites +
      this.calls.forbiddenUserWrites +
      this.calls.forbiddenAuditLogWrites
    );
  }

  private storeAssignment(
    assignment: DeploymentHardwareAssignmentRecord,
  ): void {
    this.assignmentsById.set(assignment.id, assignment);
  }
}