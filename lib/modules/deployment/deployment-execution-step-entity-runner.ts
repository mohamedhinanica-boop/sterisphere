import "server-only";

import {
  executeActivationItemForServerDeployment,
  type ServerDeploymentActivationExecutorDependencies,
} from "./deployment-activation-executor-server";
import type {
  DeploymentExecutionStepEntityRunner,
  DeploymentExecutionStepRunnerInput,
} from "./deployment-execution-step-orchestrator-runners";

export class ServerDeploymentExecutionStepEntityRunner implements DeploymentExecutionStepEntityRunner {
  readonly runnerId = "server-deployment-execution-step-entity";
  constructor(private readonly dependencies: ServerDeploymentActivationExecutorDependencies) {}
  executeEntity(input: DeploymentExecutionStepRunnerInput) {
    return executeActivationItemForServerDeployment(this.dependencies, input);
  }
}
