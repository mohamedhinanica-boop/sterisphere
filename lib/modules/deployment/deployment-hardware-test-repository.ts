import type {
  DeploymentHardwareProvisioningPrerequisiteRepository,
  DeploymentHardwareRepository,
  DeploymentHardwareShellPersistenceResult,
} from "./deployment-hardware-repository";
import type {
  CreateDeploymentHardwareShellPayload,
  DeploymentHardwareShellRecord,
} from "./deployment-hardware-types";

export interface DeploymentHardwareTestRepositoryCalls {
  clinicExists: number;
  clinicSettingsExist: number;
  providerShellsProvisioned: number;
  sterilizerShellsProvisioned: number;
  workstationShellsProvisioned: number;
  findHardwareByDeploymentKey: number;
  createHardwareShell: number;
  listDeploymentHardwareShells: number;
  forbiddenWorkstationAssignmentWrites: 0;
  forbiddenSterilizerAssignmentWrites: 0;
  forbiddenPrinterBindingWrites: 0;
  forbiddenScannerBindingWrites: 0;
  forbiddenCameraBindingWrites: 0;
  forbiddenSoundBindingWrites: 0;
  forbiddenPackWrites: 0;
  forbiddenCycleWrites: 0;
  forbiddenTraceWrites: 0;
  forbiddenUserWrites: 0;
  forbiddenAuditLogWrites: 0;
}

export class InMemoryDeploymentHardwareTestRepository
  implements
    DeploymentHardwareRepository,
    DeploymentHardwareProvisioningPrerequisiteRepository
{
  readonly calls: DeploymentHardwareTestRepositoryCalls = {
    clinicExists: 0,
    clinicSettingsExist: 0,
    providerShellsProvisioned: 0,
    sterilizerShellsProvisioned: 0,
    workstationShellsProvisioned: 0,
    findHardwareByDeploymentKey: 0,
    createHardwareShell: 0,
    listDeploymentHardwareShells: 0,
    forbiddenWorkstationAssignmentWrites: 0,
    forbiddenSterilizerAssignmentWrites: 0,
    forbiddenPrinterBindingWrites: 0,
    forbiddenScannerBindingWrites: 0,
    forbiddenCameraBindingWrites: 0,
    forbiddenSoundBindingWrites: 0,
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
  private readonly hardwareById = new Map<string, DeploymentHardwareShellRecord>();
  private nextHardwareNumber = 1;

  constructor(input: {
    clinicIds?: readonly string[];
    clinicIdsWithSettings?: readonly string[];
    clinicIdsWithProviderShells?: readonly string[];
    clinicIdsWithSterilizerShells?: readonly string[];
    clinicIdsWithWorkstationShells?: readonly string[];
    hardware?: readonly DeploymentHardwareShellRecord[];
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
    input.hardware?.forEach((hardwareShell) =>
      this.storeHardware(hardwareShell),
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

  async findHardwareByDeploymentKey(
    clinicId: string,
    deploymentHardwareKey: string,
  ): Promise<DeploymentHardwareShellRecord | null> {
    this.calls.findHardwareByDeploymentKey += 1;

    return (
      this.hardware.find(
        (hardwareShell) =>
          hardwareShell.clinicId === clinicId &&
          hardwareShell.deploymentHardwareKey === deploymentHardwareKey,
      ) ?? null
    );
  }

  async createHardwareShell(
    payload: CreateDeploymentHardwareShellPayload,
  ): Promise<DeploymentHardwareShellPersistenceResult> {
    this.calls.createHardwareShell += 1;

    const existingHardware = await this.findHardwareByDeploymentKey(
      payload.clinicId,
      payload.deploymentHardwareKey,
    );

    if (existingHardware) {
      return {
        ok: false,
        hardware: existingHardware,
        message: "Hardware shell deployment key already exists in memory.",
      };
    }

    const hardware: DeploymentHardwareShellRecord = {
      id: `hardware-${this.nextHardwareNumber.toString().padStart(4, "0")}`,
      clinicId: payload.clinicId,
      deploymentHardwareKey: payload.deploymentHardwareKey,
      name: payload.name,
      hardwareType: payload.hardwareType,
      quantity: payload.quantity,
      displayOrder: payload.displayOrder,
      status: payload.status,
      capabilities: payload.capabilities,
      assignedWorkstationKey: payload.assignedWorkstationKey,
      assignedSterilizerKey: payload.assignedSterilizerKey,
      active: payload.active,
      provisioningSource: payload.provisioningSource,
      provisioningStatus: payload.provisioningStatus,
      createdAt: payload.createdAt ?? new Date(0).toISOString(),
      updatedAt:
        payload.updatedAt ?? payload.createdAt ?? new Date(0).toISOString(),
    };

    this.nextHardwareNumber += 1;
    this.storeHardware(hardware);

    return {
      ok: true,
      hardware,
      message: "In-memory hardware shell created.",
    };
  }

  async listDeploymentHardwareShells(
    clinicId: string,
  ): Promise<readonly DeploymentHardwareShellRecord[]> {
    this.calls.listDeploymentHardwareShells += 1;

    return this.hardware.filter(
      (hardwareShell) =>
        hardwareShell.clinicId === clinicId &&
        hardwareShell.deploymentHardwareKey !== null,
    );
  }

  get hardware(): readonly DeploymentHardwareShellRecord[] {
    return [...this.hardwareById.values()];
  }

  get downstreamWriteCount(): number {
    return (
      this.calls.forbiddenWorkstationAssignmentWrites +
      this.calls.forbiddenSterilizerAssignmentWrites +
      this.calls.forbiddenPrinterBindingWrites +
      this.calls.forbiddenScannerBindingWrites +
      this.calls.forbiddenCameraBindingWrites +
      this.calls.forbiddenSoundBindingWrites +
      this.calls.forbiddenPackWrites +
      this.calls.forbiddenCycleWrites +
      this.calls.forbiddenTraceWrites +
      this.calls.forbiddenUserWrites +
      this.calls.forbiddenAuditLogWrites
    );
  }

  private storeHardware(hardware: DeploymentHardwareShellRecord): void {
    this.hardwareById.set(hardware.id, hardware);
  }
}