import type { DeploymentStage } from "./deployment-types";

export type DeploymentRollbackStatus =
  | "pending"
  | "running"
  | "completed"
  | "partial"
  | "failed"
  | "manual_recovery_required";

export type DeploymentRecoveryClassification =
  | "automatic_retry"
  | "manual_verification"
  | "manual_cleanup"
  | "engineering_support";

export interface DeploymentRollbackStep {
  id: string;
  stageId: DeploymentStage;
  stageDisplayName: string;
  status: DeploymentRollbackStatus;
  verified: boolean;
  message: string;
}

export interface DeploymentRollbackCheckpoint {
  id: string;
  stageId: DeploymentStage;
  stageDisplayName: string;
  rolledBackAt: string | null;
  verified: boolean;
  message: string;
}

export interface DeploymentRollbackVerification {
  transactionId: string;
  deploymentRunId: string;
  clinicId: string;
  failedStage: DeploymentStage;
  rollbackStartedAt: string;
  rollbackCompletedAt: string | null;
  verifiedAt: string | null;
  rollbackStatus: DeploymentRollbackStatus;
  manualRecoveryRequired: boolean;
  checkpoints: readonly DeploymentRollbackCheckpoint[];
  steps: readonly DeploymentRollbackStep[];
  messages: readonly string[];
}

export interface DeploymentRecoveryPlan {
  transactionId: string;
  deploymentRunId: string;
  clinicId: string;
  failedStage: DeploymentStage;
  classification: DeploymentRecoveryClassification;
  retryAllowed: boolean;
  actions: readonly string[];
  message: string;
}

export interface DeploymentRecoveryResult {
  verification: DeploymentRollbackVerification;
  recoveryPlan: DeploymentRecoveryPlan;
  safeToRetry: boolean;
  messages: readonly string[];
}
