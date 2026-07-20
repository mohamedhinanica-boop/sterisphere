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
import {
  DeploymentActivationExecutorWorkstationShellHandler,
  type DeploymentActivationExecutorWorkstationShellRunner,
} from "./deployment-activation-executor-workstation-shell-handler";
import {
  DeploymentActivationExecutorHardwareShellHandler,
  type DeploymentActivationExecutorHardwareShellRunner,
} from "./deployment-activation-executor-hardware-shell-handler";

export interface DeploymentActivationExecutorHandlerRegistryDependencies {
  clinicActivation: DeploymentActivationExecutorClinicActivationRunner;
  providerShellActivation: DeploymentActivationExecutorProviderShellActivationRunner;
  sterilizerShellActivation?: DeploymentActivationExecutorSterilizerShellRunner;
  workstationShellActivation?: DeploymentActivationExecutorWorkstationShellRunner;
  hardwareShellActivation?: DeploymentActivationExecutorHardwareShellRunner;
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
  if (dependencies.workstationShellActivation) {
    handlers.push(new DeploymentActivationExecutorWorkstationShellHandler(dependencies.workstationShellActivation));
  }
  if (dependencies.hardwareShellActivation) {
    handlers.push(new DeploymentActivationExecutorHardwareShellHandler(dependencies.hardwareShellActivation));
  }
  return new DeploymentActivationExecutorRegistry(handlers);
}
