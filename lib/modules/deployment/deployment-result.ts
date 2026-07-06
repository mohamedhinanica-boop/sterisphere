import type {
  DeploymentContext,
  DeploymentError,
  DeploymentResult,
  DeploymentStage,
  DeploymentStatus,
  DeploymentWarning,
} from "./deployment-types";

export function createDeploymentResult({
  context,
  success,
  status = context.status,
  stage = context.currentStage,
  warnings = context.warnings,
  errors = [],
  nextRecommendedActions = [],
}: {
  context: DeploymentContext;
  success: boolean;
  status?: DeploymentStatus;
  stage?: DeploymentStage;
  warnings?: readonly DeploymentWarning[];
  errors?: readonly DeploymentError[];
  nextRecommendedActions?: readonly string[];
}): DeploymentResult {
  return {
    success,
    status,
    stage,
    clinicId: context.clinicId,
    deploymentRunId: context.deploymentRunId,
    durationMs: 0,
    warnings: [...warnings],
    errors: [...errors],
    nextRecommendedActions: [...nextRecommendedActions],
    summary: { ...context.summary },
  };
}
