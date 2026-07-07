import type { DeploymentStage } from "./deployment-types";

export type DeploymentLifecycleState =
  | "draft"
  | "validating"
  | "ready"
  | "locked"
  | "executing"
  | "rolling_back"
  | "rollback_verification"
  | "completed"
  | "failed"
  | "blocked"
  | "manual_recovery"
  | "cancelled";

export interface DeploymentTransition {
  from: DeploymentLifecycleState;
  to: DeploymentLifecycleState;
  transitionedAt: string;
  stage?: DeploymentStage;
  reason: string;
}

export interface DeploymentTransitionRule {
  from: DeploymentLifecycleState;
  to: DeploymentLifecycleState;
  description: string;
}

export interface DeploymentTransitionResult {
  allowed: boolean;
  transition?: DeploymentTransition;
  snapshot: DeploymentStateSnapshot;
  message: string;
}

export interface DeploymentStateSnapshot {
  state: DeploymentLifecycleState;
  previousState: DeploymentLifecycleState | null;
  clinicId: string | null;
  deploymentRunId: string | null;
  updatedAt: string;
  transitions: readonly DeploymentTransition[];
}

export interface DeploymentLifecycleSummary {
  currentState: DeploymentLifecycleState;
  previousState: DeploymentLifecycleState | null;
  transitionCount: number;
  terminal: boolean;
  retryAllowed: boolean;
  manualRecoveryRequired: boolean;
  administratorInterventionRequired: boolean;
  messages: readonly string[];
}

export interface SimulateDeploymentLifecycleInput {
  startedAt: string;
  completedAt: string;
  status: "succeeded" | "failed";
  rollbackRequired: boolean;
  rollbackVerified?: boolean;
  manualRecoveryRequired?: boolean;
  failedStage?: DeploymentStage;
  clinicId?: string | null;
  deploymentRunId?: string | null;
}
