import type {
  DeploymentActivationExecutionDependencyProgressionSnapshot,
} from "./deployment-activation-execution-dependency-progression-types";

export interface DeploymentActivationExecutionDependencyProgressionRepository {
  loadDependencyProgressionSnapshot(input: {
    clinicId: string;
    deploymentRunKey: string;
    sessionId: string;
    executionKey: string;
  }): Promise<DeploymentActivationExecutionDependencyProgressionSnapshot>;
}