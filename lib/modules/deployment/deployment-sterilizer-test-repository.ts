import type {
  DeploymentSterilizerProvisioningPrerequisiteRepository,
  DeploymentSterilizerRepository,
  DeploymentSterilizerShellPersistenceResult,
} from "./deployment-sterilizer-repository";
import type {
  CreateDeploymentSterilizerShellPayload,
  DeploymentSterilizerShellRecord,
} from "./deployment-sterilizer-types";

export interface DeploymentSterilizerTestRepositoryCalls {
  clinicExists: number;
  clinicSettingsExist: number;
  providerShellsProvisioned: number;
  findSterilizerByDeploymentKey: number;
  createSterilizerShell: number;
  listDeploymentSterilizerShells: number;
  forbiddenWorkstationWrites: 0;
  forbiddenHardwareWrites: 0;
  forbiddenPackWrites: 0;
  forbiddenCycleWrites: 0;
  forbiddenTraceWrites: 0;
  forbiddenUserWrites: 0;
  forbiddenAuditLogWrites: 0;
}

export class InMemoryDeploymentSterilizerTestRepository
  implements
    DeploymentSterilizerRepository,
    DeploymentSterilizerProvisioningPrerequisiteRepository
{
  readonly calls: DeploymentSterilizerTestRepositoryCalls = {
    clinicExists: 0,
    clinicSettingsExist: 0,
    providerShellsProvisioned: 0,
    findSterilizerByDeploymentKey: 0,
    createSterilizerShell: 0,
    listDeploymentSterilizerShells: 0,
    forbiddenWorkstationWrites: 0,
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
  private readonly sterilizersById = new Map<string, DeploymentSterilizerShellRecord>();
  private nextSterilizerNumber = 1;

  constructor(input: {
    clinicIds?: readonly string[];
    clinicIdsWithSettings?: readonly string[];
    clinicIdsWithProviderShells?: readonly string[];
    sterilizers?: readonly DeploymentSterilizerShellRecord[];
  } = {}) {
    input.clinicIds?.forEach((clinicId) => this.clinicIds.add(clinicId));
    input.clinicIdsWithSettings?.forEach((clinicId) =>
      this.clinicIdsWithSettings.add(clinicId),
    );
    input.clinicIdsWithProviderShells?.forEach((clinicId) =>
      this.clinicIdsWithProviderShells.add(clinicId),
    );
    input.sterilizers?.forEach((sterilizer) =>
      this.storeSterilizer(sterilizer),
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

  async findSterilizerByDeploymentKey(
    clinicId: string,
    deploymentSterilizerKey: string,
  ): Promise<DeploymentSterilizerShellRecord | null> {
    this.calls.findSterilizerByDeploymentKey += 1;

    return (
      this.sterilizers.find(
        (sterilizer) =>
          sterilizer.clinicId === clinicId &&
          sterilizer.deploymentSterilizerKey === deploymentSterilizerKey,
      ) ?? null
    );
  }

  async createSterilizerShell(
    payload: CreateDeploymentSterilizerShellPayload,
  ): Promise<DeploymentSterilizerShellPersistenceResult> {
    this.calls.createSterilizerShell += 1;

    const existingSterilizer = await this.findSterilizerByDeploymentKey(
      payload.clinicId,
      payload.deploymentSterilizerKey,
    );

    if (existingSterilizer) {
      return {
        ok: false,
        sterilizer: existingSterilizer,
        message: "Sterilizer shell deployment key already exists in memory.",
      };
    }

    const sterilizer: DeploymentSterilizerShellRecord = {
      id: `sterilizer-${this.nextSterilizerNumber.toString().padStart(4, "0")}`,
      clinicId: payload.clinicId,
      deploymentSterilizerKey: payload.deploymentSterilizerKey,
      name: payload.name,
      type: payload.type,
      active: payload.active,
      provisioningSource: payload.provisioningSource,
      provisioningStatus: payload.provisioningStatus,
      createdAt: payload.createdAt ?? new Date(0).toISOString(),
      updatedAt:
        payload.updatedAt ?? payload.createdAt ?? new Date(0).toISOString(),
    };

    this.nextSterilizerNumber += 1;
    this.storeSterilizer(sterilizer);

    return {
      ok: true,
      sterilizer,
      message: "In-memory sterilizer shell created.",
    };
  }

  async listDeploymentSterilizerShells(
    clinicId: string,
  ): Promise<readonly DeploymentSterilizerShellRecord[]> {
    this.calls.listDeploymentSterilizerShells += 1;

    return this.sterilizers.filter(
      (sterilizer) =>
        sterilizer.clinicId === clinicId &&
        sterilizer.deploymentSterilizerKey !== null,
    );
  }

  get sterilizers(): readonly DeploymentSterilizerShellRecord[] {
    return [...this.sterilizersById.values()];
  }

  get downstreamWriteCount(): number {
    return (
      this.calls.forbiddenWorkstationWrites +
      this.calls.forbiddenHardwareWrites +
      this.calls.forbiddenPackWrites +
      this.calls.forbiddenCycleWrites +
      this.calls.forbiddenTraceWrites +
      this.calls.forbiddenUserWrites +
      this.calls.forbiddenAuditLogWrites
    );
  }

  private storeSterilizer(sterilizer: DeploymentSterilizerShellRecord): void {
    this.sterilizersById.set(sterilizer.id, sterilizer);
  }
}
