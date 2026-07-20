import "server-only";

import {
  DeploymentActivationExecutorHardwareShellHandler,
  type DeploymentActivationExecutorHardwareShellRunner,
} from "./deployment-activation-executor-hardware-shell-handler";

/**
 * Composes the isolated hardware one-step handler without registry or
 * Generic Entity Sequence Driver wiring.
 */
export function createServerDeploymentActivationExecutorHardwareShellHandler(
  runner: DeploymentActivationExecutorHardwareShellRunner,
): DeploymentActivationExecutorHardwareShellHandler {
  return new DeploymentActivationExecutorHardwareShellHandler(runner);
}
