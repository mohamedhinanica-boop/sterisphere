import type { SetupState } from "@/lib/modules/clinic-setup";
import type {
  WorkstationCapability,
  WorkstationType,
} from "@/lib/modules/clinical-workstations";
import {
  createEmptyDeploymentDraft,
  type DeploymentDraft,
  type DeploymentDraftProviderPlan,
  type DeploymentDraftSterilizer,
  type DeploymentDraftSterilizerStatus,
  type DeploymentDraftWorkstation,
} from "./deployment-draft";
import {
  validateDeploymentDraft,
  type DeploymentDraftValidationResult,
} from "./deployment-draft-validation";

export interface SetupDeploymentWorkstation {
  id: string;
  name: string;
  type: string;
  capabilities?: readonly string[];
  roomNumber?: string;
  locationLabel?: string;
}

export interface SetupDeploymentProviderPlan {
  clinicType?: string;
  dentists?: number;
  hygienists?: number;
  assistants?: number;
  receptionists?: number;
  treatmentCoordinators?: number;
  sterilizationTechnicians?: number;
  officeManagers?: number;
}

export interface SetupDeploymentSterilizer {
  id: string;
  displayName: string;
  type: string;
  brand?: string;
  manufacturer?: string;
  model?: string;
  serialNumber?: string;
  assignedWorkstationId?: string;
  status?: DeploymentDraftSterilizerStatus;
}

export interface SetupDeploymentPolicyPlan {
  packExpiration?: string;
}

export interface SetupDeploymentHardwarePlan {
  labelPrinter?: number;
  usbScanner?: number;
}

export interface SetupDeploymentReviewMetadata {
  reviewedAt?: string;
  reviewedBy?: string;
  readinessScore?: number | null;
  requiredSections?: readonly string[];
  completedSections?: readonly string[];
  warnings?: readonly string[];
}

export interface SetupDeploymentDraftLocalState {
  createdAt?: string;
  workstations?: readonly SetupDeploymentWorkstation[];
  providerPlan?: SetupDeploymentProviderPlan;
  sterilizers?: readonly SetupDeploymentSterilizer[];
  policies?: SetupDeploymentPolicyPlan;
  hardwarePlan?: SetupDeploymentHardwarePlan;
  reviewMetadata?: SetupDeploymentReviewMetadata;
}

export interface DeploymentDraftAdapterResult {
  draft: DeploymentDraft;
  validation: DeploymentDraftValidationResult;
}

export function createDeploymentDraftFromSetupState(
  setupState: SetupState,
  localState: SetupDeploymentDraftLocalState = {},
): DeploymentDraftAdapterResult {
  const emptyDraft = createEmptyDeploymentDraft(
    localState.createdAt ?? setupState.startedAt ?? "",
  );
  const reviewMetadata = localState.reviewMetadata;
  const draft: DeploymentDraft = {
    ...emptyDraft,
    ...(reviewMetadata?.reviewedAt
      ? { reviewedAt: reviewMetadata.reviewedAt }
      : {}),
    ...(reviewMetadata?.reviewedBy
      ? { reviewedBy: reviewMetadata.reviewedBy }
      : {}),
    clinicProfile: {
      name: setupState.clinicProfile.clinicName,
      legalName: setupState.clinicProfile.legalCompanyName,
      clinicCode: setupState.clinicProfile.clinicCode,
      country: setupState.clinicProfile.country,
      provinceState: setupState.clinicProfile.region,
      timezone: setupState.clinicProfile.timezone,
      primaryLanguage: setupState.clinicProfile.primaryLanguage,
      phone: setupState.clinicProfile.phone,
      email: setupState.clinicProfile.email,
      website: setupState.clinicProfile.website,
      addressStreet: setupState.clinicProfile.street,
      addressCity: setupState.clinicProfile.city,
      addressPostalCode: setupState.clinicProfile.postalCode,
    },
    workstations: (localState.workstations ?? []).map(mapWorkstation),
    providerPlan: mapProviderPlan(localState.providerPlan),
    sterilizers: (localState.sterilizers ?? []).map(mapSterilizer),
    policies: {
      packExpiration: localState.policies?.packExpiration ?? "",
    },
    hardwarePlan: {
      labelPrinters: localState.hardwarePlan?.labelPrinter ?? 0,
      usbScanners: localState.hardwarePlan?.usbScanner ?? 0,
    },
    reviewMetadata: {
      readinessScore: reviewMetadata?.readinessScore ?? null,
      requiredSections: [...(reviewMetadata?.requiredSections ?? [])],
      completedSections: [
        ...(reviewMetadata?.completedSections ??
          setupState.completedSteps),
      ],
      warnings: [...(reviewMetadata?.warnings ?? [])],
    },
  };

  return {
    draft,
    validation: validateDeploymentDraft(draft),
  };
}

export function mapSetupWorkstationType(type: string): WorkstationType {
  const normalizedType = type.trim().toLowerCase();

  if (normalizedType === "reception") {
    return "reception";
  }

  if (normalizedType === "sterilization") {
    return "sterilization";
  }

  if (
    normalizedType === "treatment" ||
    normalizedType === "operatory"
  ) {
    return "operatory";
  }

  if (normalizedType === "admin") {
    return "admin";
  }

  return "other";
}

export function mapSetupWorkstationCapabilities(
  capabilities: readonly string[] = [],
): readonly WorkstationCapability[] {
  const mappedCapabilities = capabilities
    .map((capability) => {
      const normalizedCapability = capability
        .trim()
        .toLowerCase()
        .replace(/[\s-]+/g, "_");

      if (normalizedCapability === "printer") {
        return "printer";
      }

      if (
        normalizedCapability === "usb_scanner" ||
        normalizedCapability === "scanner"
      ) {
        return "usb_scanner";
      }

      if (normalizedCapability === "camera") {
        return "camera";
      }

      if (normalizedCapability === "sound") {
        return "sound";
      }

      if (normalizedCapability === "sterilizer") {
        return "sterilizer";
      }

      return null;
    })
    .filter(
      (capability): capability is WorkstationCapability =>
        capability !== null,
    );

  return [...new Set(mappedCapabilities)];
}

function mapWorkstation(
  workstation: SetupDeploymentWorkstation,
): DeploymentDraftWorkstation {
  return {
    draftId: workstation.id,
    name: workstation.name,
    workstationType: mapSetupWorkstationType(workstation.type),
    roomNumber: workstation.roomNumber ?? "",
    locationLabel: workstation.locationLabel ?? "",
    capabilities: mapSetupWorkstationCapabilities(
      workstation.capabilities,
    ),
  };
}

function mapProviderPlan(
  providerPlan: SetupDeploymentProviderPlan = {},
): DeploymentDraftProviderPlan {
  return {
    clinicType: providerPlan.clinicType ?? "",
    dentists: providerPlan.dentists ?? 0,
    hygienists: providerPlan.hygienists ?? 0,
    assistants: providerPlan.assistants ?? 0,
    receptionists: providerPlan.receptionists ?? 0,
    treatmentCoordinators: providerPlan.treatmentCoordinators ?? 0,
    sterilizationTechnicians:
      providerPlan.sterilizationTechnicians ?? 0,
    officeManagers: providerPlan.officeManagers ?? 0,
  };
}

function mapSterilizer(
  sterilizer: SetupDeploymentSterilizer,
): DeploymentDraftSterilizer {
  return {
    draftId: sterilizer.id,
    displayName: sterilizer.displayName,
    sterilizerType: sterilizer.type,
    manufacturer: sterilizer.manufacturer ?? sterilizer.brand ?? "",
    model: sterilizer.model ?? "",
    serialNumber: sterilizer.serialNumber ?? "",
    assignedWorkstationDraftId:
      sterilizer.assignedWorkstationId || null,
    status: sterilizer.status ?? "planned",
  };
}
