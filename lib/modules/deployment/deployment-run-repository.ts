import type {
  AttachDeploymentRunRollbackRecoveryPayload,
  CreateDeploymentRunPersistencePayload,
  StoreDeploymentRunAuditEvidencePayload,
} from "./deployment-run-payload";
import type {
  DeploymentRunPersistenceResult,
  DeploymentRunRecord,
  DeploymentRunStatusUpdatePayload,
} from "./deployment-run-types";

const DEPLOYMENT_RUN_PERSISTENCE_NOT_IMPLEMENTED =
  "Deployment run persistence has not been implemented.";

export interface DeploymentRunRepository {
  findByDeploymentRunId(
    deploymentRunId: string,
  ): Promise<DeploymentRunRecord | null>;
  findByIdempotencyKey(
    idempotencyKey: string,
  ): Promise<DeploymentRunRecord | null>;
  createDeploymentRun(
    payload: CreateDeploymentRunPersistencePayload,
  ): Promise<DeploymentRunPersistenceResult>;
  storeAuditEvidence(
    payload: StoreDeploymentRunAuditEvidencePayload,
  ): Promise<DeploymentRunPersistenceResult>;
  updateAuditEvidence(
    payload: StoreDeploymentRunAuditEvidencePayload,
  ): Promise<DeploymentRunPersistenceResult>;
  attachRollbackRecovery(
    payload: AttachDeploymentRunRollbackRecoveryPayload,
  ): Promise<DeploymentRunPersistenceResult>;
  updateLifecycleState(
    payload: DeploymentRunStatusUpdatePayload,
  ): Promise<DeploymentRunPersistenceResult>;
  markStarted(
    payload: DeploymentRunStatusUpdatePayload,
  ): Promise<DeploymentRunPersistenceResult>;
  markCompleted(
    payload: DeploymentRunStatusUpdatePayload,
  ): Promise<DeploymentRunPersistenceResult>;
  markFailed(
    payload: DeploymentRunStatusUpdatePayload,
  ): Promise<DeploymentRunPersistenceResult>;
  markBlocked(
    payload: DeploymentRunStatusUpdatePayload,
  ): Promise<DeploymentRunPersistenceResult>;
}

export class InertDeploymentRunRepository
  implements DeploymentRunRepository
{
  async findByDeploymentRunId(
    _deploymentRunId: string,
  ): Promise<DeploymentRunRecord | null> {
    return deploymentRunPersistenceNotImplemented();
  }

  async findByIdempotencyKey(
    _idempotencyKey: string,
  ): Promise<DeploymentRunRecord | null> {
    return deploymentRunPersistenceNotImplemented();
  }

  async createDeploymentRun(
    _payload: CreateDeploymentRunPersistencePayload,
  ): Promise<DeploymentRunPersistenceResult> {
    return deploymentRunPersistenceNotImplemented();
  }

  async storeAuditEvidence(
    _payload: StoreDeploymentRunAuditEvidencePayload,
  ): Promise<DeploymentRunPersistenceResult> {
    return deploymentRunPersistenceNotImplemented();
  }

  async updateAuditEvidence(
    _payload: StoreDeploymentRunAuditEvidencePayload,
  ): Promise<DeploymentRunPersistenceResult> {
    return deploymentRunPersistenceNotImplemented();
  }

  async attachRollbackRecovery(
    _payload: AttachDeploymentRunRollbackRecoveryPayload,
  ): Promise<DeploymentRunPersistenceResult> {
    return deploymentRunPersistenceNotImplemented();
  }

  async updateLifecycleState(
    _payload: DeploymentRunStatusUpdatePayload,
  ): Promise<DeploymentRunPersistenceResult> {
    return deploymentRunPersistenceNotImplemented();
  }

  async markStarted(
    _payload: DeploymentRunStatusUpdatePayload,
  ): Promise<DeploymentRunPersistenceResult> {
    return deploymentRunPersistenceNotImplemented();
  }

  async markCompleted(
    _payload: DeploymentRunStatusUpdatePayload,
  ): Promise<DeploymentRunPersistenceResult> {
    return deploymentRunPersistenceNotImplemented();
  }

  async markFailed(
    _payload: DeploymentRunStatusUpdatePayload,
  ): Promise<DeploymentRunPersistenceResult> {
    return deploymentRunPersistenceNotImplemented();
  }

  async markBlocked(
    _payload: DeploymentRunStatusUpdatePayload,
  ): Promise<DeploymentRunPersistenceResult> {
    return deploymentRunPersistenceNotImplemented();
  }
}

export function createInertDeploymentRunRepository(): DeploymentRunRepository {
  return new InertDeploymentRunRepository();
}

function deploymentRunPersistenceNotImplemented(): never {
  throw new Error(DEPLOYMENT_RUN_PERSISTENCE_NOT_IMPLEMENTED);
}
