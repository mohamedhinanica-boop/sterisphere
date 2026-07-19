import "server-only";

import {
  DeploymentActivationExecutorSterilizerShellHandler,
  type DeploymentActivationExecutorSterilizerShellRunner,
} from "./deployment-activation-executor-sterilizer-shell-handler";

/**
 * Composes the future sterilizer one-step executor without adding it to the
 * production registry. Runtime wiring remains a separate slice.
 */
export function createServerDeploymentActivationExecutorSterilizerShellHandler(
  runner: DeploymentActivationExecutorSterilizerShellRunner,
): DeploymentActivationExecutorSterilizerShellHandler {
  return new DeploymentActivationExecutorSterilizerShellHandler(runner);
}
