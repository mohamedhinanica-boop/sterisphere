import type {
  WorkstationCapability,
  WorkstationType,
} from "@/lib/modules/clinical-workstations";
import type { DeploymentSummary } from "./deployment-types";

export const CURRENT_DEPLOYMENT_DRAFT_VERSION = "1";

export type DeploymentDraftSterilizerStatus =
  | "active"
  | "planned"
  | "inactive";

export interface DeploymentDraftClinicProfile {
  name: string;
  legalName: string;
  clinicCode: string;
  country: string;
  provinceState: string;
  timezone: string;
  primaryLanguage: string;
  phone: string;
  email: string;
  website: string;
  addressStreet: string;
  addressCity: string;
  addressPostalCode: string;
}

export interface DeploymentDraftWorkstation {
  draftId: string;
  name: string;
  workstationType: WorkstationType;
  roomNumber: string;
  locationLabel: string;
  capabilities: readonly WorkstationCapability[];
}

export interface DeploymentDraftProviderPlan {
  clinicType: string;
  dentists: number;
  hygienists: number;
  assistants: number;
  receptionists: number;
  treatmentCoordinators: number;
  sterilizationTechnicians: number;
  officeManagers: number;
}

export interface DeploymentDraftSterilizer {
  draftId: string;
  displayName: string;
  sterilizerType: string;
  manufacturer: string;
  model: string;
  serialNumber: string;
  assignedWorkstationDraftId: string | null;
  status: DeploymentDraftSterilizerStatus;
}

export interface DeploymentDraftPolicyPlan {
  packExpiration: string;
}

export interface DeploymentDraftHardwarePlan {
  labelPrinters: number;
  usbScanners: number;
}

export interface DeploymentDraftReviewMetadata {
  readinessScore: number | null;
  requiredSections: readonly string[];
  completedSections: readonly string[];
  warnings: readonly string[];
}

export interface DeploymentDraft {
  draftVersion: string;
  createdAt: string;
  reviewedAt?: string;
  reviewedBy?: string;
  clinicProfile: DeploymentDraftClinicProfile;
  workstations: readonly DeploymentDraftWorkstation[];
  providerPlan: DeploymentDraftProviderPlan;
  sterilizers: readonly DeploymentDraftSterilizer[];
  policies: DeploymentDraftPolicyPlan;
  hardwarePlan: DeploymentDraftHardwarePlan;
  reviewMetadata: DeploymentDraftReviewMetadata;
}

export function createEmptyDeploymentDraft(
  createdAt = "",
): DeploymentDraft {
  return {
    draftVersion: CURRENT_DEPLOYMENT_DRAFT_VERSION,
    createdAt,
    clinicProfile: {
      name: "",
      legalName: "",
      clinicCode: "",
      country: "",
      provinceState: "",
      timezone: "",
      primaryLanguage: "",
      phone: "",
      email: "",
      website: "",
      addressStreet: "",
      addressCity: "",
      addressPostalCode: "",
    },
    workstations: [],
    providerPlan: {
      clinicType: "",
      dentists: 0,
      hygienists: 0,
      assistants: 0,
      receptionists: 0,
      treatmentCoordinators: 0,
      sterilizationTechnicians: 0,
      officeManagers: 0,
    },
    sterilizers: [],
    policies: {
      packExpiration: "",
    },
    hardwarePlan: {
      labelPrinters: 0,
      usbScanners: 0,
    },
    reviewMetadata: {
      readinessScore: null,
      requiredSections: [],
      completedSections: [],
      warnings: [],
    },
  };
}

export function summarizeDeploymentDraft(
  draft: DeploymentDraft,
): DeploymentSummary {
  const plannedProviderCount = Object.values(draft.providerPlan)
    .filter((value): value is number => typeof value === "number")
    .reduce((total, count) => total + count, 0);

  return {
    clinicName: draft.clinicProfile.name.trim(),
    workstationCount: draft.workstations.length,
    sterilizerCount: draft.sterilizers.length,
    plannedProviderCount,
    plannedPrinterCount: draft.hardwarePlan.labelPrinters,
    plannedScannerCount: draft.hardwarePlan.usbScanners,
    hasClinicSettings: Boolean(
      draft.clinicProfile.country.trim() &&
        draft.clinicProfile.provinceState.trim() &&
        draft.clinicProfile.timezone.trim() &&
        draft.clinicProfile.primaryLanguage.trim(),
    ),
    hasBaselinePolicies: Boolean(draft.policies.packExpiration.trim()),
  };
}

/**
 * Produces a stable, non-cryptographic identity for the executable draft data.
 * A future persistence phase must replace or verify this with a server-side
 * cryptographic payload hash before using it as an audit or security boundary.
 */
export function hashDeploymentDraftInput(draft: DeploymentDraft): string {
  const deploymentInput = {
    draftVersion: draft.draftVersion,
    clinicProfile: draft.clinicProfile,
    workstations: draft.workstations,
    providerPlan: draft.providerPlan,
    sterilizers: draft.sterilizers,
    policies: draft.policies,
    hardwarePlan: draft.hardwarePlan,
  };
  const input = stableSerialize(deploymentInput);
  let hash = 0x811c9dc5;

  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return `draft-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function stableSerialize(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableSerialize).join(",")}]`;
  }

  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const entries = Object.keys(record)
      .sort()
      .map(
        (key) =>
          `${JSON.stringify(key)}:${stableSerialize(record[key])}`,
      );

    return `{${entries.join(",")}}`;
  }

  return JSON.stringify(value);
}
