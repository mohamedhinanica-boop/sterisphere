import {
  DeploymentStage,
  DeploymentStatus,
  type DeploymentContext,
  type DeploymentDraftReference,
  type DeploymentSummary,
} from "./deployment-types";

export const EMPTY_DEPLOYMENT_SUMMARY: DeploymentSummary = {
  clinicName: "",
  workstationCount: 0,
  sterilizerCount: 0,
  plannedProviderCount: 0,
  plannedPrinterCount: 0,
  plannedScannerCount: 0,
  hasClinicSettings: false,
  hasBaselinePolicies: false,
};

export function createDeploymentContext({
  draft,
  summary = EMPTY_DEPLOYMENT_SUMMARY,
  userId = null,
  isAuthenticated = false,
  isSuperAdmin = false,
  infrastructureAvailable = false,
}: {
  draft: DeploymentDraftReference;
  summary?: DeploymentSummary;
  userId?: string | null;
  isAuthenticated?: boolean;
  isSuperAdmin?: boolean;
  infrastructureAvailable?: boolean;
}): DeploymentContext {
  return {
    draft,
    summary,
    status: DeploymentStatus.DRAFT,
    currentStage: DeploymentStage.VALIDATION,
    userId,
    isAuthenticated,
    isSuperAdmin,
    infrastructureAvailable,
    isLocked: false,
    clinicId: null,
    deploymentRunId: null,
    startedAt: null,
    warnings: [],
  };
}
