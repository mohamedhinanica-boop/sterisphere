import "server-only";

import {
  DeploymentActivationExecutorWorkstationShellHandler,
  type DeploymentActivationExecutorWorkstationShellRunner,
} from "./deployment-activation-executor-workstation-shell-handler";

/**
 * Composes the isolated workstation one-step handler without registry or
 * Generic Entity Sequence Driver wiring.
 */
export function createServerDeploymentActivationExecutorWorkstationShellHandler(
  runner: DeploymentActivationExecutorWorkstationShellRunner,
): DeploymentActivationExecutorWorkstationShellHandler {
  return new DeploymentActivationExecutorWorkstationShellHandler(runner);
}
