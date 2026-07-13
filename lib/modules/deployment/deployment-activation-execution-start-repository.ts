import type {
  DeploymentActivationExecutionStartSnapshot,
} from "./deployment-activation-execution-start-types";

export interface DeploymentActivationExecutionStartRepository {
  loadExecutionStartSnapshot(input: {
    clinicId: string;
    deploymentRunId: string;
    sessionId: string;
    executionKey: string;
  }): Promise<DeploymentActivationExecutionStartSnapshot>;
}