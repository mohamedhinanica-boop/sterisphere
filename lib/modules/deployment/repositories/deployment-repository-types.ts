import type { DeploymentStatus } from "../deployment-types";

export interface CreatedClinic {
  clinicId: string;
  deploymentStatus: DeploymentStatus;
}

export interface CreatedDeploymentRun {
  deploymentRunId: string;
  status: "pending";
}

export interface DeploymentRepositoryBatchResult {
  createdCount: number;
}

export interface DeploymentRepositoryRecordResult {
  recordId: string;
}

export interface MarkDeploymentCompletedResult {
  clinicId: string;
  deploymentRunId: string;
  deploymentStatus: "deployed";
}

export interface RollbackDeploymentResult {
  deploymentRunId: string;
  rolledBack: boolean;
}
