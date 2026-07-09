import type { DeploymentDraft } from "./deployment-draft";
import type {
  CreateDeploymentProviderShellPayload,
  DeploymentProviderShellCategory,
} from "./deployment-provider-types";

export interface DeploymentProviderPayloadContext {
  clinicId: string;
  timestamp?: string;
}

interface ProviderPlanCategoryDefinition {
  category: DeploymentProviderShellCategory;
  countKey:
    | "dentists"
    | "hygienists"
    | "assistants"
    | "receptionists"
    | "treatmentCoordinators"
    | "sterilizationTechnicians"
    | "officeManagers";
  label: string;
}

const PROVIDER_PLAN_CATEGORIES: readonly ProviderPlanCategoryDefinition[] = [
  { category: "dentist", countKey: "dentists", label: "Dentist" },
  { category: "hygienist", countKey: "hygienists", label: "Hygienist" },
  { category: "assistant", countKey: "assistants", label: "Assistant" },
  { category: "receptionist", countKey: "receptionists", label: "Receptionist" },
  {
    category: "treatment-coordinator",
    countKey: "treatmentCoordinators",
    label: "Treatment Coordinator",
  },
  {
    category: "sterilization-technician",
    countKey: "sterilizationTechnicians",
    label: "Sterilization Technician",
  },
  {
    category: "office-manager",
    countKey: "officeManagers",
    label: "Office Manager",
  },
];

export function buildProviderShellPayloadsFromDraft(
  draft: DeploymentDraft,
  context: DeploymentProviderPayloadContext,
): readonly CreateDeploymentProviderShellPayload[] {
  const clinicId = context.clinicId.trim();

  if (!clinicId) {
    return [];
  }

  return PROVIDER_PLAN_CATEGORIES.flatMap((definition) =>
    buildCategoryPayloads(draft, definition, {
      clinicId,
      timestamp: context.timestamp,
    }),
  );
}

function buildCategoryPayloads(
  draft: DeploymentDraft,
  definition: ProviderPlanCategoryDefinition,
  context: DeploymentProviderPayloadContext,
): readonly CreateDeploymentProviderShellPayload[] {
  const count = normalizeCount(draft.providerPlan[definition.countKey]);
  const payloads: CreateDeploymentProviderShellPayload[] = [];

  for (let index = 1; index <= count; index += 1) {
    const sequence = index.toString().padStart(3, "0");
    const deploymentProviderKey = `${definition.category}-${sequence}`;
    const placeholderName = `${definition.label} Placeholder ${sequence}`;

    payloads.push({
      clinicId: context.clinicId,
      deploymentProviderKey,
      provisioningSource: "setup_draft",
      provisioningStatus: "placeholder",
      firstName: null,
      lastName: null,
      title: placeholderName,
      displayName: placeholderName,
      fullName: placeholderName,
      role: definition.label,
      active: false,
      ...(context.timestamp
        ? { createdAt: context.timestamp, updatedAt: context.timestamp }
        : {}),
    });
  }

  return payloads;
}

function normalizeCount(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return 0;
  }

  return Math.floor(value);
}

