import type { DeploymentDraft, DeploymentDraftSterilizer } from "./deployment-draft";
import type { CreateDeploymentSterilizerShellPayload } from "./deployment-sterilizer-types";

export interface DeploymentSterilizerPayloadContext {
  clinicId: string;
  timestamp?: string;
}

const DEFAULT_STERILIZER_TYPE = "Steam Autoclave";

export function buildSterilizerShellPayloadsFromDraft(
  draft: DeploymentDraft,
  context: DeploymentSterilizerPayloadContext,
): readonly CreateDeploymentSterilizerShellPayload[] {
  const clinicId = context.clinicId.trim();

  if (!clinicId) {
    return [];
  }

  return draft.sterilizers.map((sterilizer, index) =>
    buildSterilizerPayload(sterilizer, index, {
      clinicId,
      timestamp: context.timestamp,
    }),
  );
}

function buildSterilizerPayload(
  sterilizer: DeploymentDraftSterilizer,
  index: number,
  context: DeploymentSterilizerPayloadContext,
): CreateDeploymentSterilizerShellPayload {
  const sequence = (index + 1).toString().padStart(3, "0");
  const deploymentSterilizerKey = `sterilizer-${sequence}`;
  const draftName = sterilizer.displayName.trim();
  const baseName = draftName || `Sterilizer Placeholder ${sequence}`;
  const name = `${baseName} - ${buildClinicIdShort(context.clinicId)}`;
  const type = sterilizer.sterilizerType.trim() || DEFAULT_STERILIZER_TYPE;

  return {
    clinicId: context.clinicId,
    deploymentSterilizerKey,
    name,
    type,
    active: false,
    provisioningSource: "setup_draft",
    provisioningStatus: "planned",
    ...(context.timestamp
      ? { createdAt: context.timestamp, updatedAt: context.timestamp }
      : {}),
  };
}

function buildClinicIdShort(clinicId: string): string {
  const normalizedClinicId = clinicId.trim().toLowerCase().replace(/[^a-z0-9]/g, "");

  if (!normalizedClinicId) {
    return "clinic";
  }

  if (normalizedClinicId.length <= 12) {
    return normalizedClinicId;
  }

  return `${normalizedClinicId.slice(0, 8)}${normalizedClinicId.slice(-4)}`;
}
