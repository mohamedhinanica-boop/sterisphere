import "server-only";

import {
  buildCreateDeploymentClinicSettingsPayload,
} from "./deployment-clinic-settings-payload";
import type { DeploymentClinicSettingsRepository } from "./deployment-clinic-settings-repository";
import type {
  CreateDeploymentClinicSettingsPayload,
  DeploymentClinicSettingsProvisionCommand,
  DeploymentClinicSettingsProvisionResult,
} from "./deployment-clinic-settings-types";

export class DeploymentClinicSettingsService {
  constructor(
    private readonly repository: DeploymentClinicSettingsRepository,
  ) {}

  buildCreateDeploymentClinicSettingsPayload(
    command: DeploymentClinicSettingsProvisionCommand,
  ): CreateDeploymentClinicSettingsPayload {
    return buildCreateDeploymentClinicSettingsPayload(command.draft, {
      clinicId: command.clinicId,
      timestamp: command.createdAt,
    });
  }

  async provisionClinicSettings(
    command: DeploymentClinicSettingsProvisionCommand,
  ): Promise<DeploymentClinicSettingsProvisionResult> {
    const clinicId = command.clinicId.trim();

    if (!clinicId) {
      return {
        ok: false,
        status: "rejected",
        settings: null,
        message: "Clinic settings provisioning requires a clinic id.",
      };
    }

    const clinicExists = await this.repository.clinicExists(clinicId);

    if (!clinicExists) {
      return {
        ok: false,
        status: "rejected",
        settings: null,
        message:
          "Clinic settings provisioning requires an existing clinic root.",
      };
    }

    const existingSettings = await this.repository.findSettingsByClinicId(
      clinicId,
    );

    if (existingSettings) {
      return {
        ok: true,
        status: "reused",
        settings: existingSettings,
        message: "Clinic settings already exist for this clinic; reuse them.",
      };
    }

    const payload = this.buildCreateDeploymentClinicSettingsPayload({
      ...command,
      clinicId,
    });
    const result = await this.repository.createSettings(payload);

    return {
      ok: result.ok,
      status: result.ok ? "created" : "conflict",
      settings: result.settings,
      message: result.message,
    };
  }
}

export function createDeploymentClinicSettingsService(
  repository: DeploymentClinicSettingsRepository,
): DeploymentClinicSettingsService {
  return new DeploymentClinicSettingsService(repository);
}
