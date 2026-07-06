import { createDeploymentResult } from "./deployment-result";
import {
  DeploymentStage,
  type DeploymentContext,
  type DeploymentResult,
} from "./deployment-types";
import { validateDeploymentContext } from "./deployment-validation";

/**
 * Inert foundation for the future Deployment Engine.
 *
 * These methods perform no persistence, networking, authentication changes, or
 * deployment state mutation. They return deterministic contracts so future
 * execution can be added behind the documented boundaries.
 */
export class DeploymentEngine {
  constructor(private readonly context: DeploymentContext) {}

  validate(): DeploymentResult {
    const errors = validateDeploymentContext(this.context);

    return createDeploymentResult({
      context: this.context,
      success: errors.length === 0,
      stage: DeploymentStage.VALIDATION,
      errors,
      nextRecommendedActions:
        errors.length === 0
          ? ["Review deployment readiness before execution is enabled."]
          : ["Resolve validation errors and review the deployment draft again."],
    });
  }

  prepare(): DeploymentResult {
    const validationResult = this.validate();

    if (!validationResult.success) {
      return validationResult;
    }

    return createDeploymentResult({
      context: this.context,
      success: true,
      stage: DeploymentStage.CREATE_RUN,
      nextRecommendedActions: [
        "Deployment preparation is modeled but persistence remains disabled.",
      ],
    });
  }

  execute(): DeploymentResult {
    return createDeploymentResult({
      context: this.context,
      success: false,
      stage: DeploymentStage.CREATE_RUN,
      errors: [
        {
          code: "DEPLOYMENT_EXECUTION_NOT_IMPLEMENTED",
          message:
            "Deployment execution is disabled during the engine foundation phase.",
          stage: DeploymentStage.CREATE_RUN,
          retryable: false,
        },
      ],
      nextRecommendedActions: [
        "Keep the Deploy action disabled until persistence execution is implemented.",
      ],
    });
  }

  rollback(): DeploymentResult {
    return createDeploymentResult({
      context: this.context,
      success: true,
      stage: this.context.currentStage,
      nextRecommendedActions: [
        "No rollback was required because the foundation performs no writes.",
      ],
    });
  }
}
