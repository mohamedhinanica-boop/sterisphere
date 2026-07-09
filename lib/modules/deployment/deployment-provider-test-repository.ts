import type {
  DeploymentProviderProvisioningPrerequisiteRepository,
  DeploymentProviderRepository,
  DeploymentProviderShellPersistenceResult,
} from "./deployment-provider-repository";
import type {
  CreateDeploymentProviderShellPayload,
  DeploymentProviderShellRecord,
} from "./deployment-provider-types";

export interface DeploymentProviderTestRepositoryCalls {
  clinicExists: number;
  clinicSettingsExist: number;
  findProviderByDeploymentKey: number;
  createProviderShell: number;
  listDeploymentProviderShells: number;
  forbiddenSterilizerWrites: 0;
  forbiddenWorkstationWrites: 0;
  forbiddenHardwareWrites: 0;
  forbiddenPackWrites: 0;
  forbiddenCycleWrites: 0;
  forbiddenTraceWrites: 0;
  forbiddenUserWrites: 0;
  forbiddenAuditLogWrites: 0;
}

export class InMemoryDeploymentProviderTestRepository
  implements
    DeploymentProviderRepository,
    DeploymentProviderProvisioningPrerequisiteRepository
{
  readonly calls: DeploymentProviderTestRepositoryCalls = {
    clinicExists: 0,
    clinicSettingsExist: 0,
    findProviderByDeploymentKey: 0,
    createProviderShell: 0,
    listDeploymentProviderShells: 0,
    forbiddenSterilizerWrites: 0,
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
  private readonly providersById = new Map<string, DeploymentProviderShellRecord>();
  private nextProviderNumber = 1;

  constructor(input: {
    clinicIds?: readonly string[];
    clinicIdsWithSettings?: readonly string[];
    providers?: readonly DeploymentProviderShellRecord[];
  } = {}) {
    input.clinicIds?.forEach((clinicId) => this.clinicIds.add(clinicId));
    input.clinicIdsWithSettings?.forEach((clinicId) =>
      this.clinicIdsWithSettings.add(clinicId),
    );
    input.providers?.forEach((provider) => this.storeProvider(provider));
  }

  async clinicExists(clinicId: string): Promise<boolean> {
    this.calls.clinicExists += 1;

    return this.clinicIds.has(clinicId);
  }

  async clinicSettingsExist(clinicId: string): Promise<boolean> {
    this.calls.clinicSettingsExist += 1;

    return this.clinicIdsWithSettings.has(clinicId);
  }

  async findProviderByDeploymentKey(
    clinicId: string,
    deploymentProviderKey: string,
  ): Promise<DeploymentProviderShellRecord | null> {
    this.calls.findProviderByDeploymentKey += 1;

    return (
      this.providers.find(
        (provider) =>
          provider.clinicId === clinicId &&
          provider.deploymentProviderKey === deploymentProviderKey,
      ) ?? null
    );
  }

  async createProviderShell(
    payload: CreateDeploymentProviderShellPayload,
  ): Promise<DeploymentProviderShellPersistenceResult> {
    this.calls.createProviderShell += 1;

    const existingProvider = await this.findProviderByDeploymentKey(
      payload.clinicId,
      payload.deploymentProviderKey,
    );

    if (existingProvider) {
      return {
        ok: false,
        provider: existingProvider,
        message: "Provider shell deployment key already exists in memory.",
      };
    }

    const provider: DeploymentProviderShellRecord = {
      id: `provider-${this.nextProviderNumber.toString().padStart(4, "0")}`,
      clinicId: payload.clinicId,
      deploymentProviderKey: payload.deploymentProviderKey,
      provisioningSource: payload.provisioningSource,
      provisioningStatus: payload.provisioningStatus,
      firstName: payload.firstName,
      lastName: payload.lastName,
      title: payload.title,
      displayName: payload.displayName,
      fullName: payload.fullName,
      role: payload.role,
      active: payload.active,
      createdAt: payload.createdAt ?? new Date(0).toISOString(),
      updatedAt: payload.updatedAt ?? payload.createdAt ?? new Date(0).toISOString(),
    };

    this.nextProviderNumber += 1;
    this.storeProvider(provider);

    return {
      ok: true,
      provider,
      message: "In-memory provider shell created.",
    };
  }

  async listDeploymentProviderShells(
    clinicId: string,
  ): Promise<readonly DeploymentProviderShellRecord[]> {
    this.calls.listDeploymentProviderShells += 1;

    return this.providers.filter(
      (provider) =>
        provider.clinicId === clinicId &&
        provider.deploymentProviderKey !== null,
    );
  }

  get providers(): readonly DeploymentProviderShellRecord[] {
    return [...this.providersById.values()];
  }

  get downstreamWriteCount(): number {
    return (
      this.calls.forbiddenSterilizerWrites +
      this.calls.forbiddenWorkstationWrites +
      this.calls.forbiddenHardwareWrites +
      this.calls.forbiddenPackWrites +
      this.calls.forbiddenCycleWrites +
      this.calls.forbiddenTraceWrites +
      this.calls.forbiddenUserWrites +
      this.calls.forbiddenAuditLogWrites
    );
  }

  private storeProvider(provider: DeploymentProviderShellRecord): void {
    this.providersById.set(provider.id, provider);
  }
}

