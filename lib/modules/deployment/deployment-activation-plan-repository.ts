import type {
  DeploymentActivationPlanCommand,
  DeploymentActivationPlanSnapshot,
} from "./deployment-activation-plan-types";

export interface DeploymentActivationPlanRepository {
  getActivationPlanSnapshot(
    command: DeploymentActivationPlanCommand,
  ): Promise<DeploymentActivationPlanSnapshot>;
}
