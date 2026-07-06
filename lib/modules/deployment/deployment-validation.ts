import {
  DeploymentStage,
  DeploymentStatus,
  type DeploymentContext,
  type DeploymentDraftReference,
  type DeploymentError,
} from "./deployment-types";

export function hasValidDraft(draft: DeploymentDraftReference): boolean {
  if (
    !draft.id.trim() ||
    draft.version < 1 ||
    !draft.payloadHash.trim() ||
    !draft.isReviewed ||
    !draft.reviewedAt
  ) {
    return false;
  }

  const completedSections = new Set(draft.completedSections);

  return (
    draft.requiredSections.length > 0 &&
    draft.requiredSections.every((section) => completedSections.has(section))
  );
}

export function isDeploymentLocked(context: DeploymentContext): boolean {
  return context.isLocked || context.status === DeploymentStatus.DEPLOYING;
}

export function isDeploymentComplete(context: DeploymentContext): boolean {
  return context.status === DeploymentStatus.DEPLOYED;
}

export function canRetry(context: DeploymentContext): boolean {
  return (
    context.status === DeploymentStatus.FAILED &&
    context.isAuthenticated &&
    context.isSuperAdmin &&
    context.infrastructureAvailable &&
    !isDeploymentLocked(context) &&
    hasValidDraft(context.draft)
  );
}

export function canDeploy(context: DeploymentContext): boolean {
  return (
    context.status === DeploymentStatus.DRAFT &&
    context.isAuthenticated &&
    context.isSuperAdmin &&
    context.infrastructureAvailable &&
    !isDeploymentLocked(context) &&
    hasValidDraft(context.draft)
  );
}

export function validateDeploymentContext(
  context: DeploymentContext,
): readonly DeploymentError[] {
  const errors: DeploymentError[] = [];

  if (!context.isAuthenticated || !context.userId) {
    errors.push({
      code: "AUTHENTICATION_REQUIRED",
      message: "An authenticated user is required to deploy a clinic.",
      stage: DeploymentStage.VALIDATION,
      retryable: true,
    });
  }

  if (!context.isSuperAdmin) {
    errors.push({
      code: "SUPER_ADMIN_REQUIRED",
      message: "Only an active Super Admin may deploy a clinic.",
      stage: DeploymentStage.VALIDATION,
      retryable: true,
    });
  }

  if (!hasValidDraft(context.draft)) {
    errors.push({
      code: "INVALID_DEPLOYMENT_DRAFT",
      message: "The deployment draft must be complete, reviewed, and versioned.",
      stage: DeploymentStage.VALIDATION,
      retryable: true,
    });
  }

  if (
    context.status !== DeploymentStatus.DRAFT &&
    context.status !== DeploymentStatus.FAILED
  ) {
    errors.push({
      code: "INVALID_DEPLOYMENT_STATUS",
      message: "The deployment target is not in a deployable state.",
      stage: DeploymentStage.VALIDATION,
      retryable: false,
    });
  }

  if (isDeploymentLocked(context)) {
    errors.push({
      code: "DEPLOYMENT_LOCKED",
      message: "A deployment is already running for this target.",
      stage: DeploymentStage.VALIDATION,
      retryable: true,
    });
  }

  if (!context.infrastructureAvailable) {
    errors.push({
      code: "INFRASTRUCTURE_UNAVAILABLE",
      message: "Required deployment infrastructure is unavailable.",
      stage: DeploymentStage.VALIDATION,
      retryable: true,
    });
  }

  return errors;
}
