import type { DeploymentDraft } from "./deployment-draft";
import type {
  CreateDeploymentClinicSettingsPayload,
} from "./deployment-clinic-settings-types";

export interface DeploymentClinicSettingsPayloadContext {
  clinicId: string;
  timestamp?: string;
}

export function buildCreateDeploymentClinicSettingsPayload(
  draft: DeploymentDraft,
  context: DeploymentClinicSettingsPayloadContext,
): CreateDeploymentClinicSettingsPayload {
  return {
    clinicId: context.clinicId.trim(),
    clinicName: optionalText(draft.clinicProfile.name),
    clinicAddress: buildClinicAddress(draft),
    clinicPhone: optionalText(draft.clinicProfile.phone),
    clinicEmail: optionalText(draft.clinicProfile.email),
    packExpirationDays: mapPackExpirationDays(
      draft.policies.packExpiration,
    ),
    autoPrintLabels: false,
    soundAlertsEnabled: true,
    soundAlertCycleComplete: true,
    soundAlertCycleOverdue: true,
    soundAlertFailedCycle: true,
    soundAlertExpiringPacks: true,
    soundAlertExpiredPacks: true,
    ...(context.timestamp
      ? { createdAt: context.timestamp, updatedAt: context.timestamp }
      : {}),
  };
}

function buildClinicAddress(draft: DeploymentDraft): string | null {
  return optionalText(
    [
      draft.clinicProfile.addressStreet,
      draft.clinicProfile.addressCity,
      draft.clinicProfile.provinceState,
      draft.clinicProfile.addressPostalCode,
      draft.clinicProfile.country,
    ]
      .map((part) => part.trim())
      .filter(Boolean)
      .join(", "),
  );
}

function mapPackExpirationDays(packExpiration: string): number {
  if (packExpiration === "180-days") {
    return 180;
  }

  return 365;
}

function optionalText(value: string): string | null {
  const normalizedValue = value.trim();
  return normalizedValue || null;
}
