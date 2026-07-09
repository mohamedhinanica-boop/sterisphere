import { createWorkstationCapabilities } from "@/lib/modules/clinical-workstations";
import type {
  DeploymentDraft,
  DeploymentDraftWorkstation,
} from "./deployment-draft";
import type { CreateDeploymentWorkstationShellPayload } from "./deployment-workstation-types";

export interface DeploymentWorkstationPayloadContext {
  clinicId: string;
  timestamp?: string;
}

export function buildWorkstationShellPayloadsFromDraft(
  draft: DeploymentDraft,
  context: DeploymentWorkstationPayloadContext,
): readonly CreateDeploymentWorkstationShellPayload[] {
  const clinicId = context.clinicId.trim();

  if (!clinicId) {
    return [];
  }

  return draft.workstations.map((workstation, index) =>
    buildWorkstationPayload(workstation, index, {
      clinicId,
      timestamp: context.timestamp,
    }),
  );
}

function buildWorkstationPayload(
  workstation: DeploymentDraftWorkstation,
  index: number,
  context: DeploymentWorkstationPayloadContext,
): CreateDeploymentWorkstationShellPayload {
  const sequence = (index + 1).toString().padStart(3, "0");
  const deploymentWorkstationKey = `workstation-${sequence}`;
  const draftName = workstation.name.trim();
  const locationLabel =
    workstation.locationLabel.trim() || workstation.roomNumber.trim() || null;

  return {
    clinicId: context.clinicId,
    deploymentWorkstationKey,
    name: draftName || `Workstation Placeholder ${sequence}`,
    workstationType: workstation.workstationType,
    displayOrder: index + 1,
    status: "planned",
    capabilities: createWorkstationCapabilities([...workstation.capabilities]),
    locationLabel,
    agentUrl: null,
    active: false,
    provisioningSource: "setup_draft",
    provisioningStatus: "planned",
    ...(context.timestamp
      ? { createdAt: context.timestamp, updatedAt: context.timestamp }
      : {}),
  };
}
