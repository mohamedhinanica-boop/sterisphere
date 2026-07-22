import type {
  DeploymentRecoveryPersistenceCommand,
  DeploymentRecoveryPersistenceRepositoryResult,
} from "./deployment-recovery-persistence-types";

export interface DeploymentRecoveryRepository {
  persistRecoveryPlan(
    command: DeploymentRecoveryPersistenceCommand,
  ): Promise<DeploymentRecoveryPersistenceRepositoryResult>;
}
