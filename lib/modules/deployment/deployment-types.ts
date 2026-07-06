export const DeploymentStatus = {
  DRAFT: "draft",
  DEPLOYING: "deploying",
  DEPLOYED: "deployed",
  FAILED: "failed",
  ARCHIVED: "archived",
} as const;

export type DeploymentStatus =
  (typeof DeploymentStatus)[keyof typeof DeploymentStatus];

export const DeploymentStage = {
  VALIDATION: "validation",
  CREATE_RUN: "create-run",
  LOCK: "lock",
  CREATE_CLINIC: "create-clinic",
  CREATE_SETTINGS: "create-settings",
  CREATE_WORKSTATIONS: "create-workstations",
  CREATE_STERILIZERS: "create-sterilizers",
  CREATE_PLANNING: "create-planning",
  APPLY_POLICIES: "apply-policies",
  INITIALIZE_DEFAULTS: "initialize-defaults",
  AUDIT: "audit",
  FINALIZE: "finalize",
  UNLOCK: "unlock",
  REDIRECT: "redirect",
} as const;

export type DeploymentStage =
  (typeof DeploymentStage)[keyof typeof DeploymentStage];

export interface DeploymentDraftReference {
  id: string;
  version: number;
  payloadHash: string;
  reviewedAt: string | null;
  isReviewed: boolean;
  requiredSections: readonly string[];
  completedSections: readonly string[];
}

export interface DeploymentSummary {
  clinicName: string;
  workstationCount: number;
  sterilizerCount: number;
  plannedProviderCount: number;
  plannedPrinterCount: number;
  plannedScannerCount: number;
  hasClinicSettings: boolean;
  hasBaselinePolicies: boolean;
}

export interface DeploymentWarning {
  code: string;
  message: string;
  stage?: DeploymentStage;
}

export interface DeploymentError {
  code: string;
  message: string;
  stage: DeploymentStage;
  retryable: boolean;
}

export interface DeploymentContext {
  draft: DeploymentDraftReference;
  summary: DeploymentSummary;
  status: DeploymentStatus;
  currentStage: DeploymentStage;
  userId: string | null;
  isAuthenticated: boolean;
  isSuperAdmin: boolean;
  infrastructureAvailable: boolean;
  isLocked: boolean;
  clinicId: string | null;
  deploymentRunId: string | null;
  startedAt: string | null;
  warnings: readonly DeploymentWarning[];
}

export interface DeploymentResult {
  success: boolean;
  status: DeploymentStatus;
  stage: DeploymentStage;
  clinicId: string | null;
  deploymentRunId: string | null;
  durationMs: number;
  warnings: readonly DeploymentWarning[];
  errors: readonly DeploymentError[];
  nextRecommendedActions: readonly string[];
  summary: DeploymentSummary;
}
