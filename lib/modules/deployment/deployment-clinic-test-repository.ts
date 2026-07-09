import type {
  DeploymentClinicPersistenceResult,
  DeploymentClinicRepository,
} from "./deployment-clinic-repository";
import type {
  CreateDeploymentClinicPayload,
  DeploymentClinicLinkCommand,
  DeploymentClinicLinkResult,
  DeploymentClinicRecord,
} from "./deployment-clinic-types";
import type { InMemoryDeploymentRunTestRepository } from "./deployment-run-test-repository";

export interface DeploymentClinicTestRepositoryCalls {
  findClinicById: number;
  findClinicByCode: number;
  createClinic: number;
  linkClinicToDeploymentRun: number;
  forbiddenSettingsWrites: 0;
  forbiddenProviderWrites: 0;
  forbiddenSterilizerWrites: 0;
  forbiddenWorkstationWrites: 0;
  forbiddenPackWrites: 0;
  forbiddenCycleWrites: 0;
  forbiddenTraceWrites: 0;
  forbiddenAuditLogWrites: 0;
}

export class InMemoryDeploymentClinicTestRepository
  implements DeploymentClinicRepository
{
  readonly calls: DeploymentClinicTestRepositoryCalls = {
    findClinicById: 0,
    findClinicByCode: 0,
    createClinic: 0,
    linkClinicToDeploymentRun: 0,
    forbiddenSettingsWrites: 0,
    forbiddenProviderWrites: 0,
    forbiddenSterilizerWrites: 0,
    forbiddenWorkstationWrites: 0,
    forbiddenPackWrites: 0,
    forbiddenCycleWrites: 0,
    forbiddenTraceWrites: 0,
    forbiddenAuditLogWrites: 0,
  };

  private readonly clinicsById = new Map<string, DeploymentClinicRecord>();
  private readonly clinicIdsByCode = new Map<string, string>();
  private nextClinicNumber = 1;

  constructor(
    private readonly deploymentRunRepository: InMemoryDeploymentRunTestRepository,
    seedClinics: readonly DeploymentClinicRecord[] = [],
  ) {
    seedClinics.forEach((clinic) => this.storeClinic(clinic));
  }

  async findClinicById(
    clinicId: string,
  ): Promise<DeploymentClinicRecord | null> {
    this.calls.findClinicById += 1;

    return this.clinicsById.get(clinicId) ?? null;
  }

  async findClinicByCode(
    clinicCode: string,
  ): Promise<DeploymentClinicRecord | null> {
    this.calls.findClinicByCode += 1;

    const clinicId = this.clinicIdsByCode.get(clinicCode);

    return clinicId ? this.clinicsById.get(clinicId) ?? null : null;
  }

  async createClinic(
    payload: CreateDeploymentClinicPayload,
  ): Promise<DeploymentClinicPersistenceResult> {
    this.calls.createClinic += 1;

    const existingClinic = await this.findClinicByCode(payload.clinicCode);

    if (existingClinic) {
      return {
        ok: false,
        clinic: existingClinic,
        message: "Clinic code already exists in memory.",
      };
    }

    const clinic: DeploymentClinicRecord = {
      id: `clinic-${this.nextClinicNumber.toString().padStart(4, "0")}`,
      name: payload.name,
      legalName: payload.legalName,
      clinicCode: payload.clinicCode,
      country: payload.country,
      provinceState: payload.provinceState,
      timezone: payload.timezone,
      primaryLanguage: payload.primaryLanguage,
      phone: payload.phone,
      email: payload.email,
      website: payload.website,
      addressStreet: payload.addressStreet,
      addressCity: payload.addressCity,
      addressPostalCode: payload.addressPostalCode,
      deploymentStatus: "draft",
      deployedAt: null,
      deploymentVersion: payload.deploymentVersion ?? null,
      schemaVersion: payload.schemaVersion ?? null,
      createdAt: payload.createdAt ?? new Date(0).toISOString(),
      updatedAt: payload.updatedAt ?? payload.createdAt ?? new Date(0).toISOString(),
    };

    this.nextClinicNumber += 1;
    this.storeClinic(clinic);

    return {
      ok: true,
      clinic,
      message: "In-memory clinic root created.",
    };
  }

  async linkClinicToDeploymentRun(
    command: DeploymentClinicLinkCommand,
  ): Promise<DeploymentClinicLinkResult> {
    this.calls.linkClinicToDeploymentRun += 1;

    const clinic = this.clinicsById.get(command.clinicId) ?? null;

    if (!clinic) {
      return {
        ok: false,
        status: "rejected",
        clinic: null,
        deploymentRun: null,
        message: "In-memory clinic root was not found.",
      };
    }

    const result = this.deploymentRunRepository.linkClinicToDeploymentRun(
      command.deploymentRunId,
      command.clinicId,
    );

    return {
      ok: result.ok,
      status: result.ok ? "linked" : "rejected",
      clinic,
      deploymentRun: result.deploymentRun,
      message: result.message,
    };
  }

  get clinics(): readonly DeploymentClinicRecord[] {
    return [...this.clinicsById.values()];
  }

  private storeClinic(clinic: DeploymentClinicRecord): void {
    this.clinicsById.set(clinic.id, clinic);
    this.clinicIdsByCode.set(clinic.clinicCode, clinic.id);
  }
}
