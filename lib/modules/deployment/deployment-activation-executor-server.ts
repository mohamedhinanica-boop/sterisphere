import "server-only";

import type {
  DeploymentActivationExecutorHandlerRegistryDependencies,
} from "./deployment-activation-executor-handler-registry";
import {
  createDeploymentActivationExecutorHandlerRegistry,
} from "./deployment-activation-executor-handler-registry";
import {
  createDeploymentActivationExecutorService,
  type DeploymentActivationExecutorService,
} from "./deployment-activation-executor-service";
import type {
  DeploymentActivationExecutorContext,
  DeploymentActivationExecutorItem,
  DeploymentActivationExecutorResult,
} from "./deployment-activation-executor-types";

/**
 * Narrow production dependencies. Callers adapt the existing clinic and
 * provider-shell server activation boundaries to these typed runners.
 */
export type ServerDeploymentActivationExecutorDependencies =
  DeploymentActivationExecutorHandlerRegistryDependencies;

/**
 * Constructs the server-only generic executor with the two supported production
 * handlers: clinic:activate and provider_shell:activate.
 */
export function createServerDeploymentActivationExecutor(
  dependencies: ServerDeploymentActivationExecutorDependencies,
): DeploymentActivationExecutorService {
  const registry = createDeploymentActivationExecutorHandlerRegistry({
    clinicActivation: dependencies.clinicActivation,
    providerShellActivation: dependencies.providerShellActivation,
    sterilizerShellActivation: dependencies.sterilizerShellActivation,
  });

  return createDeploymentActivationExecutorService(registry);
}

/** Dispatches exactly one already-running item and stops after its handler result. */
export async function executeActivationItemForServerDeployment(
  dependencies: ServerDeploymentActivationExecutorDependencies,
  input: {
    context: DeploymentActivationExecutorContext;
    item: DeploymentActivationExecutorItem;
  },
): Promise<DeploymentActivationExecutorResult> {
  return createServerDeploymentActivationExecutor(dependencies).dispatch({
    context: input.context,
    item: input.item,
  });
}