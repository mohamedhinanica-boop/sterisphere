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

export interface DeploymentActivationExecutorHandlerRegistryDependencies {
  clinicActivation: DeploymentActivationExecutorClinicActivationRunner;
  providerShellActivation: DeploymentActivationExecutorProviderShellActivationRunner;
}

export function createDeploymentActivationExecutorHandlerRegistry(
  dependencies: DeploymentActivationExecutorHandlerRegistryDependencies,
): DeploymentActivationExecutorRegistry {
  return new DeploymentActivationExecutorRegistry([
    new DeploymentActivationExecutorClinicHandler(dependencies.clinicActivation),
    new DeploymentActivationExecutorProviderShellHandler(dependencies.providerShellActivation),
  ]);
}
