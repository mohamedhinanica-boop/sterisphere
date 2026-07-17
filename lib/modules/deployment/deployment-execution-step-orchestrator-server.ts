import "server-only";

import type { ServerDeploymentActivationExecutorDependencies } from "./deployment-activation-executor-server";
import { ServerDeploymentExecutionStepCompletionRunner, type ServerDeploymentExecutionStepCompletionBoundary } from "./deployment-execution-step-completion-runner";
import { ServerDeploymentExecutionStepEntityRunner } from "./deployment-execution-step-entity-runner";
import { ServerDeploymentExecutionStepNextStartRunner, type ServerDeploymentExecutionStepNextStartBoundary } from "./deployment-execution-step-next-start-runner";
import { createDeploymentExecutionStepOrchestratorService, type DeploymentExecutionStepOrchestratorService } from "./deployment-execution-step-orchestrator-service";
import type { DeploymentExecutionStepOrchestratorContext, DeploymentExecutionStepOrchestratorItem, DeploymentExecutionStepOrchestratorResult } from "./deployment-execution-step-orchestrator-types";
import { ServerDeploymentExecutionStepProgressionRunner, type ServerDeploymentExecutionStepProgressionBoundary } from "./deployment-execution-step-progression-runner";

export interface ServerDeploymentExecutionStepOrchestratorDependencies {
  entityExecution: ServerDeploymentActivationExecutorDependencies;
  itemCompletion: ServerDeploymentExecutionStepCompletionBoundary;
  dependencyProgression: ServerDeploymentExecutionStepProgressionBoundary;
  nextItemStart: ServerDeploymentExecutionStepNextStartBoundary;
}

export function createServerDeploymentExecutionStepOrchestrator(dependencies: ServerDeploymentExecutionStepOrchestratorDependencies): DeploymentExecutionStepOrchestratorService {
  return createDeploymentExecutionStepOrchestratorService({
    entityExecution: new ServerDeploymentExecutionStepEntityRunner(dependencies.entityExecution),
    itemCompletion: new ServerDeploymentExecutionStepCompletionRunner(dependencies.itemCompletion),
    dependencyProgression: new ServerDeploymentExecutionStepProgressionRunner(dependencies.dependencyProgression),
    nextItemStart: new ServerDeploymentExecutionStepNextStartRunner(dependencies.nextItemStart),
  });
}

export async function executeDeploymentExecutionStepForServer(dependencies: ServerDeploymentExecutionStepOrchestratorDependencies, input: { context: DeploymentExecutionStepOrchestratorContext; item: DeploymentExecutionStepOrchestratorItem }): Promise<DeploymentExecutionStepOrchestratorResult> {
  return createServerDeploymentExecutionStepOrchestrator(dependencies).execute(input);
}
