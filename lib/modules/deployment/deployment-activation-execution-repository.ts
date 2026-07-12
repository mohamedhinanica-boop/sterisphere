import type {
  DeploymentActivationExecutionCommand,
  DeploymentActivationExecutionSnapshot,
} from "./deployment-activation-execution-types";

export interface DeploymentActivationExecutionRepository {
  getExecutionSnapshot(
    command: DeploymentActivationExecutionCommand,
  ): Promise<DeploymentActivationExecutionSnapshot>;
}
