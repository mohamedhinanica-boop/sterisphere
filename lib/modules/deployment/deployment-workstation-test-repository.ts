import type {
  DeploymentWorkstationProvisioningPrerequisiteRepository,
  DeploymentWorkstationRepository,
  DeploymentWorkstationShellPersistenceResult,
} from "./deployment-workstation-repository";
import type {
  CreateDeploymentWorkstationShellPayload,
  DeploymentWorkstationShellRecord,
} from "./deployment-workstation-types";

export interface DeploymentWorkstationTestRepositoryCalls {
  clinicExists: number;
  clinicSettingsExist: number;
  providerShellsProvisioned: number;
  sterilizerShellsProvisioned: number;
  findWorkstationByDeploymentKey: number;
  createWorkstationShell: number;
  listDeploymentWorkstationShells: number;
  forbiddenHardwareWrites: 0;
  forbiddenPackWrites: 0;
  forbiddenCycleWrites: 0;
  forbiddenTraceWrites: 0;
  forbiddenUserWrites: 0;
  forbiddenAuditLogWrites: 0;
}

export class InMemoryDeploymentWorkstationTestRepository
  implements
    DeploymentWorkstationRepository,
    DeploymentWorkstationProvisioningPrerequisiteRepository
{
  readonly calls: DeploymentWorkstationTestRepositoryCalls = {
    clinicExists: 0,
    clinicSettingsExist: 0,
    providerShellsProvisioned: 0,
    sterilizerShellsProvisioned: 0,
    findWorkstationByDeploymentKey: 0,
    createWorkstationShell: 0,
    listDeploymentWorkstationShells: 0,
    forbiddenHardwareWrites: 0,
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
  private readonly workstationsById = new Map<string, DeploymentWorkstationShellRecord>();
  private nextWorkstationNumber = 1;

  constructor(input: {
    clinicIds?: readonly string[];
    clinicIdsWithSettings?: readonly string[];
    clinicIdsWithProviderShells?: readonly string[];
    clinicIdsWithSterilizerShells?: readonly string[];
    workstations?: readonly DeploymentWorkstationShellRecord[];
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
    input.workstations?.forEach((workstation) =>
      this.storeWorkstation(workstation),
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

  async findWorkstationByDeploymentKey(
    clinicId: string,
    deploymentWorkstationKey: string,
  ): Promise<DeploymentWorkstationShellRecord | null> {
    this.calls.findWorkstationByDeploymentKey += 1;

    return (
      this.workstations.find(
        (workstation) =>
          workstation.clinicId === clinicId &&
          workstation.deploymentWorkstationKey === deploymentWorkstationKey,
      ) ?? null
    );
  }

  async createWorkstationShell(
    payload: CreateDeploymentWorkstationShellPayload,
  ): Promise<DeploymentWorkstationShellPersistenceResult> {
    this.calls.createWorkstationShell += 1;

    const existingWorkstation = await this.findWorkstationByDeploymentKey(
      payload.clinicId,
      payload.deploymentWorkstationKey,
    );

    if (existingWorkstation) {
      return {
        ok: false,
        workstation: existingWorkstation,
        message: "Workstation shell deployment key already exists in memory.",
      };
    }

    const workstation: DeploymentWorkstationShellRecord = {
      id: `workstation-${this.nextWorkstationNumber.toString().padStart(4, "0")}`,
      clinicId: payload.clinicId,
      deploymentWorkstationKey: payload.deploymentWorkstationKey,
      name: payload.name,
      workstationType: payload.workstationType,
      displayOrder: payload.displayOrder,
      status: payload.status,
      capabilities: payload.capabilities,
      locationLabel: payload.locationLabel,
      agentUrl: payload.agentUrl,
      active: payload.active,
      provisioningSource: payload.provisioningSource,
      provisioningStatus: payload.provisioningStatus,
      createdAt: payload.createdAt ?? new Date(0).toISOString(),
      updatedAt:
        payload.updatedAt ?? payload.createdAt ?? new Date(0).toISOString(),
    };

    this.nextWorkstationNumber += 1;
    this.storeWorkstation(workstation);

    return {
      ok: true,
      workstation,
      message: "In-memory workstation shell created.",
    };
  }

  async listDeploymentWorkstationShells(
    clinicId: string,
  ): Promise<readonly DeploymentWorkstationShellRecord[]> {
    this.calls.listDeploymentWorkstationShells += 1;

    return this.workstations.filter(
      (workstation) =>
        workstation.clinicId === clinicId &&
        workstation.deploymentWorkstationKey !== null,
    );
  }

  get workstations(): readonly DeploymentWorkstationShellRecord[] {
    return [...this.workstationsById.values()];
  }

  get downstreamWriteCount(): number {
    return (
      this.calls.forbiddenHardwareWrites +
      this.calls.forbiddenPackWrites +
      this.calls.forbiddenCycleWrites +
      this.calls.forbiddenTraceWrites +
      this.calls.forbiddenUserWrites +
      this.calls.forbiddenAuditLogWrites
    );
  }

  private storeWorkstation(
    workstation: DeploymentWorkstationShellRecord,
  ): void {
    this.workstationsById.set(workstation.id, workstation);
  }
}
