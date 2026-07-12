import type {
  DeploymentActivationReadinessAssessmentCommand,
  DeploymentActivationReadinessSnapshot,
} from "./deployment-activation-readiness-types";

export interface DeploymentActivationReadinessRepository {
  getReadinessSnapshot(
    command: DeploymentActivationReadinessAssessmentCommand,
  ): Promise<DeploymentActivationReadinessSnapshot>;
}
