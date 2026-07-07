import type { DeploymentStage } from "./deployment-types";

export type DeploymentTransactionStatus =
  | "idle"
  | "active"
  | "committed"
  | "aborted"
  | "rolled_back";

export type DeploymentTransactionStepStatus =
  | "completed"
  | "failed"
  | "rolled_back";

export interface DeploymentTransactionStep {
  id: string;
  stageId: DeploymentStage;
  stageDisplayName: string;
  status: DeploymentTransactionStepStatus;
  recordedAt: string;
  message: string;
}

export interface DeploymentTransactionCheckpoint {
  id: string;
  sequence: number;
  stageId: DeploymentStage;
  stageDisplayName: string;
  createdAt: string;
  stepId: string;
  message: string;
}

export interface DeploymentTransactionResult {
  transactionId: string;
  status: DeploymentTransactionStatus;
  startedAt: string | null;
  completedAt: string | null;
  steps: readonly DeploymentTransactionStep[];
  checkpoints: readonly DeploymentTransactionCheckpoint[];
  rollbackCheckpointCount: number;
  messages: readonly string[];
  warnings: readonly string[];
}

export interface DeploymentStageTransactionMetadata {
  transactionId: string;
  checkpointId?: string;
  transactionStatus: DeploymentTransactionStatus;
  rollbackCheckpointCount: number;
}
