import type {
  DeploymentDraft,
  DeploymentDraftClinicProfile,
  DeploymentDraftHardwarePlan,
  DeploymentDraftPolicyPlan,
  DeploymentDraftProviderPlan,
  DeploymentDraftSterilizer,
  DeploymentDraftWorkstation,
} from "../deployment-draft";
import type {
  DeploymentStage,
  DeploymentStatus,
} from "../deployment-types";

export interface CreateClinicInput {
  clinicProfile: DeploymentDraftClinicProfile;
  deploymentVersion: string;
  schemaVersion: string;
}

export interface CreatedClinic {
  clinicId: string;
  deploymentStatus: DeploymentStatus;
}

export interface CreateDeploymentRunInput {
  clinicId: string;
  idempotencyKey: string;
  draftVersion: string;
  payloadHash: string;
  reviewedPayload: DeploymentDraft;
  startedBy: string | null;
}

export interface CreatedDeploymentRun {
  deploymentRunId: string;
  status: "pending";
}

export interface CreateClinicSettingsInput {
  clinicId: string;
  clinicProfile: DeploymentDraftClinicProfile;
  policies: DeploymentDraftPolicyPlan;
}

export interface CreateWorkstationsInput {
  clinicId: string;
  workstations: readonly DeploymentDraftWorkstation[];
}

export interface CreateSterilizersInput {
  clinicId: string;
  sterilizers: readonly DeploymentDraftSterilizer[];
}

export interface CreateProviderPlansInput {
  clinicId: string;
  providerPlan: DeploymentDraftProviderPlan;
}

export interface CreateHardwarePlansInput {
  clinicId: string;
  hardwarePlan: DeploymentDraftHardwarePlan;
}

export interface DeploymentRepositoryBatchResult {
  createdCount: number;
}

export interface DeploymentRepositoryRecordResult {
  recordId: string;
}

export interface CreateAuditEntryInput {
  clinicId: string;
  deploymentRunId: string;
  action: string;
  stage: DeploymentStage;
  performedBy: string | null;
  details: Readonly<Record<string, unknown>>;
}

export interface MarkDeploymentCompletedInput {
  clinicId: string;
  deploymentRunId: string;
  deployedAt: string;
  deploymentVersion: string;
  schemaVersion: string;
}

export interface MarkDeploymentCompletedResult {
  clinicId: string;
  deploymentRunId: string;
  deploymentStatus: "deployed";
}

export interface RollbackDeploymentInput {
  clinicId: string;
  deploymentRunId: string;
  completedStages: readonly DeploymentStage[];
  failureStage: DeploymentStage;
  failureMessage: string;
}

export interface RollbackDeploymentResult {
  deploymentRunId: string;
  rolledBack: boolean;
}
