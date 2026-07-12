import type {
  CreateDeploymentActivationExecutionItemPayload,
  CreateDeploymentActivationExecutionSessionPayload,
  DeploymentActivationExecutionItemRecord,
  DeploymentActivationExecutionSessionRecord,
} from "./deployment-activation-execution-persistence-types";

export interface DeploymentActivationExecutionPersistenceCreateSessionResult {
  ok: boolean;
  session: DeploymentActivationExecutionSessionRecord | null;
  message: string;
}

export interface DeploymentActivationExecutionPersistenceCreateItemResult {
  ok: boolean;
  item: DeploymentActivationExecutionItemRecord | null;
  message: string;
}

export interface DeploymentActivationExecutionPersistenceRepository {
  findSessionByIdentity(input: {
    clinicId: string;
    deploymentRunId: string;
    executionKey: string;
  }): Promise<DeploymentActivationExecutionSessionRecord | null>;

  findSessionByDeploymentRun(input: {
    clinicId: string;
    deploymentRunId: string;
  }): Promise<DeploymentActivationExecutionSessionRecord | null>;

  createPreparedSession(
    payload: CreateDeploymentActivationExecutionSessionPayload,
  ): Promise<DeploymentActivationExecutionPersistenceCreateSessionResult>;

  listExecutionItemsForSession(
    sessionId: string,
  ): Promise<readonly DeploymentActivationExecutionItemRecord[]>;

  findItemByExecutionItemKey(input: {
    sessionId: string;
    executionItemKey: string;
  }): Promise<DeploymentActivationExecutionItemRecord | null>;

  createPreparedItem(
    payload: CreateDeploymentActivationExecutionItemPayload,
  ): Promise<DeploymentActivationExecutionPersistenceCreateItemResult>;
}
