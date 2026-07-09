import type { DeploymentDraft } from "./deployment-draft";

export interface DeploymentClinicSettingsRecord {
  id: string;
  clinicId: string;
  clinicName: string | null;
  clinicAddress: string | null;
  clinicPhone: string | null;
  clinicEmail: string | null;
  packExpirationDays: number | null;
  autoPrintLabels: boolean | null;
  createdAt: string;
  updatedAt: string | null;
}

export interface CreateDeploymentClinicSettingsPayload {
  clinicId: string;
  clinicName: string | null;
  clinicAddress: string | null;
  clinicPhone: string | null;
  clinicEmail: string | null;
  packExpirationDays: number;
  autoPrintLabels: boolean;
  soundAlertsEnabled: boolean;
  soundAlertCycleComplete: boolean;
  soundAlertCycleOverdue: boolean;
  soundAlertFailedCycle: boolean;
  soundAlertExpiringPacks: boolean;
  soundAlertExpiredPacks: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface DeploymentClinicSettingsProvisionCommand {
  clinicId: string;
  draft: DeploymentDraft;
  createdAt: string;
}

export type DeploymentClinicSettingsProvisionStatus =
  | "created"
  | "reused"
  | "conflict"
  | "rejected";

export interface DeploymentClinicSettingsProvisionResult {
  ok: boolean;
  status: DeploymentClinicSettingsProvisionStatus;
  settings: DeploymentClinicSettingsRecord | null;
  message: string;
}
