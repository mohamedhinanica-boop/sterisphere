import type {
  DeploymentDraft,
  DeploymentDraftWorkstation,
} from "./deployment-draft";
import type {
  CreateDeploymentHardwareShellPayload,
  DeploymentHardwareCapability,
  DeploymentHardwareType,
} from "./deployment-hardware-types";

export interface DeploymentHardwarePayloadContext {
  clinicId: string;
  timestamp?: string;
}

interface HardwarePlanDefinition {
  hardwareType: DeploymentHardwareType;
  countKey: "labelPrinters" | "usbScanners";
  label: string;
  capabilities: readonly DeploymentHardwareCapability[];
  workstationCapability: DeploymentDraftWorkstation["capabilities"][number];
}

interface WorkstationAssignmentCandidate {
  deploymentWorkstationKey: string;
  workstation: DeploymentDraftWorkstation;
}

const HARDWARE_PLAN_DEFINITIONS: readonly HardwarePlanDefinition[] = [
  {
    hardwareType: "label_printer",
    countKey: "labelPrinters",
    label: "Label Printer",
    capabilities: ["label_printing"],
    workstationCapability: "printer",
  },
  {
    hardwareType: "usb_scanner",
    countKey: "usbScanners",
    label: "USB Scanner",
    capabilities: ["barcode_scanning"],
    workstationCapability: "usb_scanner",
  },
];

export function buildHardwareShellPayloadsFromDraft(
  draft: DeploymentDraft,
  context: DeploymentHardwarePayloadContext,
): readonly CreateDeploymentHardwareShellPayload[] {
  const clinicId = context.clinicId.trim();

  if (!clinicId) {
    return [];
  }

  const workstationCandidates = buildWorkstationAssignmentCandidates(draft);
  const payloads: CreateDeploymentHardwareShellPayload[] = [];

  HARDWARE_PLAN_DEFINITIONS.forEach((definition) => {
    const count = normalizeCount(draft.hardwarePlan[definition.countKey]);
    const matchingWorkstations = workstationCandidates.filter((candidate) =>
      candidate.workstation.capabilities.includes(definition.workstationCapability),
    );

    for (let index = 0; index < count; index += 1) {
      const displayOrder = payloads.length + 1;
      const sequence = displayOrder.toString().padStart(3, "0");
      const assignedWorkstationKey =
        matchingWorkstations[index % matchingWorkstations.length]
          ?.deploymentWorkstationKey ?? null;

      payloads.push({
        clinicId,
        deploymentHardwareKey: `hardware-${sequence}`,
        name: `${definition.label} ${sequence}`,
        hardwareType: definition.hardwareType,
        quantity: 1,
        displayOrder,
        status: "planned",
        capabilities: [...definition.capabilities],
        assignedWorkstationKey,
        assignedSterilizerKey: null,
        active: false,
        provisioningSource: "setup_draft",
        provisioningStatus: "planned",
        ...(context.timestamp
          ? { createdAt: context.timestamp, updatedAt: context.timestamp }
          : {}),
      });
    }
  });

  return payloads;
}

function buildWorkstationAssignmentCandidates(
  draft: DeploymentDraft,
): readonly WorkstationAssignmentCandidate[] {
  return draft.workstations.map((workstation, index) => ({
    deploymentWorkstationKey: `workstation-${(index + 1).toString().padStart(3, "0")}`,
    workstation,
  }));
}

function normalizeCount(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return 0;
  }

  return Math.floor(value);
}