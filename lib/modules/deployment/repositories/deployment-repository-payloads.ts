import {
  hashDeploymentDraftInput,
  summarizeDeploymentDraft,
  type DeploymentDraft,
  type DeploymentDraftHardwarePlan,
  type DeploymentDraftPolicyPlan,
  type DeploymentDraftProviderPlan,
  type DeploymentDraftSterilizer,
  type DeploymentDraftWorkstation,
} from "../deployment-draft";
import {
  DeploymentStage,
  type DeploymentStage as DeploymentStageId,
} from "../deployment-types";

export interface DeploymentRepositoryBuildContext {
  clinicId?: string;
  deploymentRunId?: string;
  startedBy?: string;
  idempotencyKey: string;
  timestamp: string;
  deploymentVersion: string;
  schemaVersion: string;
}

export interface CreateClinicPayload {
  name: string;
  legalName: string | null;
  clinicCode: string;
  country: string;
  provinceState: string;
  timezone: string;
  primaryLanguage: string;
  phone: string | null;
  email: string | null;
  website: string | null;
  addressStreet: string | null;
  addressCity: string | null;
  addressPostalCode: string | null;
  deploymentStatus: "draft";
  deploymentVersion?: string;
  schemaVersion?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface CreateDeploymentRunPayload {
  clinicId: string | null;
  status: "pending";
  idempotencyKey: string;
  draftVersion: string;
  payloadHash: string;
  reviewedPayload: DeploymentDraft;
  startedBy: string | null;
  startedAt: string;
  createdAt: string;
}

export interface CreateClinicSettingsPayload {
  clinicId: string;
  country: string;
  provinceState: string;
  timezone: string;
  primaryLanguage: string;
  phone: string | null;
  email: string | null;
  website: string | null;
  addressStreet: string | null;
  addressCity: string | null;
  addressPostalCode: string | null;
  policies: DeploymentDraftPolicyPlan;
}

export interface CreateWorkstationsPayload {
  clinicId: string;
  workstations: readonly DeploymentDraftWorkstation[];
}

export interface CreateSterilizersPayload {
  clinicId: string;
  sterilizers: readonly DeploymentDraftSterilizer[];
}

export interface CreateProviderPlanPayload {
  clinicId: string;
  providerPlan: DeploymentDraftProviderPlan;
}

export interface CreateHardwarePlanPayload {
  clinicId: string;
  hardwarePlan: DeploymentDraftHardwarePlan;
}

export interface CreateAuditEntryPayload {
  clinicId: string;
  deploymentRunId: string;
  action: "clinic_deployment_started";
  stage: typeof DeploymentStage.AUDIT;
  performedBy: string | null;
  createdAt?: string;
  details: Readonly<{
    draftVersion: string;
    payloadHash: string;
    summary: ReturnType<typeof summarizeDeploymentDraft>;
  }>;
}

export interface MarkDeploymentCompletedPayload {
  clinicId: string;
  deploymentRunId: string;
  deploymentStatus: "deployed";
  completedAt?: string;
  deployedAt?: string;
  deploymentVersion?: string;
  schemaVersion?: string;
}

export interface RollbackDeploymentPayload {
  clinicId: string;
  deploymentRunId: string;
  failedStage: DeploymentStageId;
  failureMessage: string;
  failedAt?: string;
  completedStages: readonly DeploymentStageId[];
}

type BuildMetadataContext = Pick<
  DeploymentRepositoryBuildContext,
  "timestamp" | "deploymentVersion" | "schemaVersion"
>;

export function buildCreateClinicPayload(
  draft: DeploymentDraft,
  context?: BuildMetadataContext,
): CreateClinicPayload {
  return {
    name: draft.clinicProfile.name,
    legalName: optionalText(draft.clinicProfile.legalName),
    clinicCode: draft.clinicProfile.clinicCode,
    country: draft.clinicProfile.country,
    provinceState: draft.clinicProfile.provinceState,
    timezone: draft.clinicProfile.timezone,
    primaryLanguage: draft.clinicProfile.primaryLanguage,
    phone: optionalText(draft.clinicProfile.phone),
    email: optionalText(draft.clinicProfile.email),
    website: optionalText(draft.clinicProfile.website),
    addressStreet: optionalText(draft.clinicProfile.addressStreet),
    addressCity: optionalText(draft.clinicProfile.addressCity),
    addressPostalCode: optionalText(
      draft.clinicProfile.addressPostalCode,
    ),
    deploymentStatus: "draft",
    ...(context
      ? {
          deploymentVersion: context.deploymentVersion,
          schemaVersion: context.schemaVersion,
          createdAt: context.timestamp,
          updatedAt: context.timestamp,
        }
      : {}),
  };
}

export function buildCreateDeploymentRunPayload(
  draft: DeploymentDraft,
  context: DeploymentRepositoryBuildContext,
): CreateDeploymentRunPayload {
  return {
    clinicId: context.clinicId ?? null,
    status: "pending",
    idempotencyKey: context.idempotencyKey,
    draftVersion: draft.draftVersion,
    payloadHash: hashDeploymentDraftInput(draft),
    reviewedPayload: draft,
    startedBy: context.startedBy ?? null,
    startedAt: context.timestamp,
    createdAt: context.timestamp,
  };
}

export function buildCreateClinicSettingsPayload(
  draft: DeploymentDraft,
  clinicId: string,
): CreateClinicSettingsPayload {
  return {
    clinicId,
    country: draft.clinicProfile.country,
    provinceState: draft.clinicProfile.provinceState,
    timezone: draft.clinicProfile.timezone,
    primaryLanguage: draft.clinicProfile.primaryLanguage,
    phone: optionalText(draft.clinicProfile.phone),
    email: optionalText(draft.clinicProfile.email),
    website: optionalText(draft.clinicProfile.website),
    addressStreet: optionalText(draft.clinicProfile.addressStreet),
    addressCity: optionalText(draft.clinicProfile.addressCity),
    addressPostalCode: optionalText(
      draft.clinicProfile.addressPostalCode,
    ),
    policies: { ...draft.policies },
  };
}

export function buildCreateWorkstationsPayload(
  draft: DeploymentDraft,
  clinicId: string,
): CreateWorkstationsPayload {
  return {
    clinicId,
    workstations: draft.workstations.map((workstation) => ({
      ...workstation,
      capabilities: [...workstation.capabilities],
    })),
  };
}

export function buildCreateSterilizersPayload(
  draft: DeploymentDraft,
  clinicId: string,
): CreateSterilizersPayload {
  return {
    clinicId,
    sterilizers: draft.sterilizers.map((sterilizer) => ({
      ...sterilizer,
    })),
  };
}

export function buildCreateProviderPlanPayload(
  draft: DeploymentDraft,
  clinicId: string,
): CreateProviderPlanPayload {
  return {
    clinicId,
    providerPlan: { ...draft.providerPlan },
  };
}

export function buildCreateHardwarePlanPayload(
  draft: DeploymentDraft,
  clinicId: string,
): CreateHardwarePlanPayload {
  return {
    clinicId,
    hardwarePlan: { ...draft.hardwarePlan },
  };
}

export function buildCreateAuditEntryPayload(
  draft: DeploymentDraft,
  clinicId: string,
  deploymentRunId: string,
  context?: Pick<DeploymentRepositoryBuildContext, "timestamp" | "startedBy">,
): CreateAuditEntryPayload {
  return {
    clinicId,
    deploymentRunId,
    action: "clinic_deployment_started",
    stage: DeploymentStage.AUDIT,
    performedBy:
      context?.startedBy ?? draft.reviewedBy ?? null,
    ...(context?.timestamp ? { createdAt: context.timestamp } : {}),
    details: {
      draftVersion: draft.draftVersion,
      payloadHash: hashDeploymentDraftInput(draft),
      summary: summarizeDeploymentDraft(draft),
    },
  };
}

export function buildMarkDeploymentCompletedPayload(
  clinicId: string,
  deploymentRunId: string,
  context?: BuildMetadataContext,
): MarkDeploymentCompletedPayload {
  return {
    clinicId,
    deploymentRunId,
    deploymentStatus: "deployed",
    ...(context
      ? {
          completedAt: context.timestamp,
          deployedAt: context.timestamp,
          deploymentVersion: context.deploymentVersion,
          schemaVersion: context.schemaVersion,
        }
      : {}),
  };
}

export function buildRollbackDeploymentPayload(
  clinicId: string,
  deploymentRunId: string,
  failedStage: DeploymentStageId,
  options: {
    timestamp?: string;
    completedStages?: readonly DeploymentStageId[];
    failureMessage?: string;
  } = {},
): RollbackDeploymentPayload {
  return {
    clinicId,
    deploymentRunId,
    failedStage,
    failureMessage:
      options.failureMessage ??
      `Deployment failed during ${failedStage}.`,
    ...(options.timestamp ? { failedAt: options.timestamp } : {}),
    completedStages: [...(options.completedStages ?? [])],
  };
}

function optionalText(value: string): string | null {
  const normalizedValue = value.trim();
  return normalizedValue || null;
}
