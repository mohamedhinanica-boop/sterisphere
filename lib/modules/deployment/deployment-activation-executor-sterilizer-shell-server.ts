import "server-only";

import {
  DeploymentActivationExecutorSterilizerShellHandler,
  type DeploymentActivationExecutorSterilizerShellRunner,
} from "./deployment-activation-executor-sterilizer-shell-handler";

/**
 * Composes the registered sterilizer one-step handler for the production
 * Generic Entity Sequence Driver adapter.
 */
export function createServerDeploymentActivationExecutorSterilizerShellHandler(
  runner: DeploymentActivationExecutorSterilizerShellRunner,
): DeploymentActivationExecutorSterilizerShellHandler {
  return new DeploymentActivationExecutorSterilizerShellHandler(runner);
}
