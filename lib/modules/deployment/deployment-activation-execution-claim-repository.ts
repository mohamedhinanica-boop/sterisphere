import type {
  DeploymentActivationExecutionClaimSnapshot,
} from "./deployment-activation-execution-claim-types";

export interface DeploymentActivationExecutionClaimRepository {
  getClaimSnapshot(input: {
    clinicId: string;
    deploymentRunId: string;
    sessionId: string;
    executionKey: string;
  }): Promise<DeploymentActivationExecutionClaimSnapshot>;
}
