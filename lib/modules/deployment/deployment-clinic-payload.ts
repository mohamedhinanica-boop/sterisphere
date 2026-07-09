import type { DeploymentDraft } from "./deployment-draft";
import type { CreateDeploymentClinicPayload } from "./deployment-clinic-types";

export interface DeploymentClinicPayloadContext {
  timestamp?: string;
  deploymentVersion?: string;
  schemaVersion?: string;
}

export function buildCreateDeploymentClinicPayload(
  draft: DeploymentDraft,
  context: DeploymentClinicPayloadContext = {},
): CreateDeploymentClinicPayload {
  return {
    name: draft.clinicProfile.name.trim(),
    legalName: optionalText(draft.clinicProfile.legalName),
    clinicCode: normalizeClinicCode(draft.clinicProfile.clinicCode),
    country: draft.clinicProfile.country.trim(),
    provinceState: draft.clinicProfile.provinceState.trim(),
    timezone: draft.clinicProfile.timezone.trim(),
    primaryLanguage: draft.clinicProfile.primaryLanguage.trim(),
    phone: optionalText(draft.clinicProfile.phone),
    email: optionalText(draft.clinicProfile.email),
    website: optionalText(draft.clinicProfile.website),
    addressStreet: optionalText(draft.clinicProfile.addressStreet),
    addressCity: optionalText(draft.clinicProfile.addressCity),
    addressPostalCode: optionalText(draft.clinicProfile.addressPostalCode),
    deploymentStatus: "draft",
    ...(context.deploymentVersion
      ? { deploymentVersion: context.deploymentVersion }
      : {}),
    ...(context.schemaVersion ? { schemaVersion: context.schemaVersion } : {}),
    ...(context.timestamp
      ? { createdAt: context.timestamp, updatedAt: context.timestamp }
      : {}),
  };
}

export function normalizeClinicCode(clinicCode: string): string {
  return clinicCode.trim();
}

function optionalText(value: string): string | null {
  const normalizedValue = value.trim();
  return normalizedValue || null;
}
