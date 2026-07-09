import "server-only";

import {
  buildCreateDeploymentClinicPayload as buildCreatePayload,
} from "./deployment-clinic-payload";
import type { DeploymentClinicRepository } from "./deployment-clinic-repository";
import type {
  CreateDeploymentClinicPayload,
  DeploymentClinicCreateCommand,
  DeploymentClinicCreateResult,
  DeploymentClinicLinkCommand,
  DeploymentClinicLinkResult,
  DeploymentClinicRootResult,
} from "./deployment-clinic-types";
import type { DeploymentRunRepository } from "./deployment-run-repository";
import type { DeploymentRunRecord } from "./deployment-run-types";

export class DeploymentClinicService {
  constructor(
    private readonly clinicRepository: DeploymentClinicRepository,
    private readonly deploymentRunRepository: DeploymentRunRepository,
  ) {}

  buildCreateDeploymentClinicPayload(
    command: DeploymentClinicCreateCommand,
  ): CreateDeploymentClinicPayload {
    return buildCreatePayload(command.draft, {
      timestamp: command.createdAt,
      deploymentVersion: command.deploymentVersion,
      schemaVersion: command.schemaVersion,
    });
  }

  async createOrReuseDeploymentClinic(
    command: DeploymentClinicCreateCommand,
  ): Promise<DeploymentClinicCreateResult> {
    const deploymentRun = await this.findDeploymentRun(command.deploymentRunId);

    if (!deploymentRun) {
      return rejectedCreateResult(
        "Deployment run must exist before clinic root persistence can begin.",
      );
    }

    if (deploymentRun.clinicId) {
      return this.reuseClinicLinkedToDeploymentRun(deploymentRun);
    }

    const payload = this.buildCreateDeploymentClinicPayload(command);

    if (!isValidCreatePayload(payload)) {
      return {
        ok: false,
        status: "rejected",
        clinic: null,
        deploymentRun,
        message:
          "Clinic root persistence requires a complete reviewed clinic profile.",
      };
    }

    const existingClinic = await this.clinicRepository.findClinicByCode(
      payload.clinicCode,
    );

    if (existingClinic) {
      return {
        ok: false,
        status: "conflict",
        clinic: existingClinic,
        deploymentRun,
        message:
          "Clinic code already belongs to a different deployment session.",
      };
    }

    const result = await this.clinicRepository.createClinic(payload);

    return {
      ok: result.ok,
      status: result.ok ? "created" : "rejected",
      clinic: result.clinic,
      deploymentRun,
      message: result.message,
    };
  }

  async linkClinicToDeploymentRun(
    command: DeploymentClinicLinkCommand,
  ): Promise<DeploymentClinicLinkResult> {
    const deploymentRun = await this.findDeploymentRun(command.deploymentRunId);

    if (!deploymentRun) {
      return rejectedLinkResult(
        "Deployment run must exist before clinic linkage can begin.",
      );
    }

    if (deploymentRun.clinicId === command.clinicId) {
      const clinic = await this.clinicRepository.findClinicById(
        command.clinicId,
      );

      return {
        ok: Boolean(clinic),
        status: clinic ? "reused" : "rejected",
        clinic,
        deploymentRun,
        message: clinic
          ? "Deployment run is already linked to this clinic root."
          : "Deployment run is linked to a missing clinic root.",
      };
    }

    if (deploymentRun.clinicId) {
      const clinic = await this.clinicRepository.findClinicById(
        deploymentRun.clinicId,
      );

      return {
        ok: false,
        status: "conflict",
        clinic,
        deploymentRun,
        message:
          "Deployment run is already linked to a different clinic root.",
      };
    }

    const clinic = await this.clinicRepository.findClinicById(command.clinicId);

    if (!clinic) {
      return {
        ok: false,
        status: "rejected",
        clinic: null,
        deploymentRun,
        message: "Clinic root must exist before deployment run linkage.",
      };
    }

    return this.clinicRepository.linkClinicToDeploymentRun(command);
  }

  async createClinicRootForDeploymentRun(
    command: DeploymentClinicCreateCommand,
  ): Promise<DeploymentClinicRootResult> {
    const createResult = await this.createOrReuseDeploymentClinic(command);

    if (!createResult.ok || !createResult.clinic) {
      return {
        ok: false,
        status: createResult.status,
        clinic: createResult.clinic,
        deploymentRun: createResult.deploymentRun,
        createResult,
        linkResult: null,
        message: createResult.message,
      };
    }

    const linkResult = await this.linkClinicToDeploymentRun({
      deploymentRunId: command.deploymentRunId,
      clinicId: createResult.clinic.id,
      updatedAt: command.createdAt,
      metadata: {
        rc3Boundary: "clinic_root_only",
        clinicCreationStatus: createResult.status,
      },
    });

    return {
      ok: linkResult.ok,
      status: linkResult.status,
      clinic: linkResult.clinic ?? createResult.clinic,
      deploymentRun: linkResult.deploymentRun ?? createResult.deploymentRun,
      createResult,
      linkResult,
      message: linkResult.message,
    };
  }

  private async findDeploymentRun(
    deploymentRunId: string,
  ): Promise<DeploymentRunRecord | null> {
    const normalizedDeploymentRunId = deploymentRunId.trim();

    if (!normalizedDeploymentRunId) {
      return null;
    }

    return this.deploymentRunRepository.findByDeploymentRunId(
      normalizedDeploymentRunId,
    );
  }

  private async reuseClinicLinkedToDeploymentRun(
    deploymentRun: DeploymentRunRecord,
  ): Promise<DeploymentClinicCreateResult> {
    const clinic = await this.clinicRepository.findClinicById(
      deploymentRun.clinicId ?? "",
    );

    return {
      ok: Boolean(clinic),
      status: clinic ? "reused" : "rejected",
      clinic,
      deploymentRun,
      message: clinic
        ? "Deployment run already has a clinic root; reuse it."
        : "Deployment run references a missing clinic root.",
    };
  }
}

export function createDeploymentClinicService(
  clinicRepository: DeploymentClinicRepository,
  deploymentRunRepository: DeploymentRunRepository,
): DeploymentClinicService {
  return new DeploymentClinicService(clinicRepository, deploymentRunRepository);
}

export function buildCreateDeploymentClinicPayload(
  command: DeploymentClinicCreateCommand,
): CreateDeploymentClinicPayload {
  return buildCreatePayload(command.draft, {
    timestamp: command.createdAt,
    deploymentVersion: command.deploymentVersion,
    schemaVersion: command.schemaVersion,
  });
}

function isValidCreatePayload(payload: CreateDeploymentClinicPayload): boolean {
  return Boolean(
    payload.name &&
      payload.clinicCode &&
      payload.country &&
      payload.provinceState &&
      payload.timezone &&
      payload.primaryLanguage,
  );
}

function rejectedCreateResult(message: string): DeploymentClinicCreateResult {
  return {
    ok: false,
    status: "rejected",
    clinic: null,
    deploymentRun: null,
    message,
  };
}

function rejectedLinkResult(message: string): DeploymentClinicLinkResult {
  return {
    ok: false,
    status: "rejected",
    clinic: null,
    deploymentRun: null,
    message,
  };
}

