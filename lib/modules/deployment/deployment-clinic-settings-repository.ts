import type {
  CreateDeploymentClinicSettingsPayload,
  DeploymentClinicSettingsRecord,
} from "./deployment-clinic-settings-types";

export interface DeploymentClinicSettingsPersistenceResult {
  ok: boolean;
  settings: DeploymentClinicSettingsRecord | null;
  message: string;
}

export interface DeploymentClinicSettingsRepository {
  clinicExists(clinicId: string): Promise<boolean>;
  findSettingsByClinicId(
    clinicId: string,
  ): Promise<DeploymentClinicSettingsRecord | null>;
  createSettings(
    payload: CreateDeploymentClinicSettingsPayload,
  ): Promise<DeploymentClinicSettingsPersistenceResult>;
}
