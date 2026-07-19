import type { DeploymentActivationExecutorHandler } from "./deployment-activation-executor-handler";
import {
  DeploymentActivationExecutorRegistry,
} from "./deployment-activation-executor-registry";
import {
  DeploymentActivationExecutorClinicHandler,
  type DeploymentActivationExecutorClinicActivationRunner,
} from "./deployment-activation-executor-clinic-handler";
import {
  DeploymentActivationExecutorProviderShellHandler,
  type DeploymentActivationExecutorProviderShellActivationRunner,
} from "./deployment-activation-executor-provider-shell-handler";
import {
  DeploymentActivationExecutorSterilizerShellHandler,
  type DeploymentActivationExecutorSterilizerShellRunner,
} from "./deployment-activation-executor-sterilizer-shell-handler";

export interface DeploymentActivationExecutorHandlerRegistryDependencies {
  clinicActivation: DeploymentActivationExecutorClinicActivationRunner;
  providerShellActivation: DeploymentActivationExecutorProviderShellActivationRunner;
  sterilizerShellActivation?: DeploymentActivationExecutorSterilizerShellRunner;
}

export function createDeploymentActivationExecutorHandlerRegistry(
  dependencies: DeploymentActivationExecutorHandlerRegistryDependencies,
): DeploymentActivationExecutorRegistry {
  const handlers: DeploymentActivationExecutorHandler[] = [
    new DeploymentActivationExecutorClinicHandler(dependencies.clinicActivation),
    new DeploymentActivationExecutorProviderShellHandler(dependencies.providerShellActivation),
  ];
  if (dependencies.sterilizerShellActivation) {
    handlers.push(new DeploymentActivationExecutorSterilizerShellHandler(dependencies.sterilizerShellActivation));
  }
  return new DeploymentActivationExecutorRegistry(handlers);
}
