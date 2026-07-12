import type {
  DeploymentActivationPlanAction,
  DeploymentActivationPlanEntityType,
  DeploymentActivationPlanIssueSeverity,
  DeploymentActivationPlanItem,
  DeploymentActivationPlanStatus,
} from "./deployment-activation-plan-types";

export type DeploymentActivationExecutionStatus =
  | "ready"
  | "blocked"
  | "error";

export type DeploymentActivationExecutionSessionLifecycleStatus =
  | "planned"
  | "ready"
  | "running"
  | "partially_completed"
  | "completed"
  | "failed"
  | "rollback_required"
  | "rolled_back";

export type DeploymentActivationExecutionItemStatus =
  | "pending"
  | "ready"
  | "running"
  | "succeeded"
  | "failed"
  | "skipped"
  | "rollback_pending"
  | "rolled_back";

export type DeploymentActivationExecutionIssueSeverity =
  DeploymentActivationPlanIssueSeverity;

export type DeploymentActivationExecutionEntityType =
  | DeploymentActivationPlanEntityType
  | "activation_execution";

export type DeploymentActivationExecutionIssueCode =
  | "activation_plan_missing"
  | "activation_plan_not_ready"
  | "activation_plan_blocked"
  | "activation_plan_key_invalid"
  | "deployment_run_missing"
  | "deployment_run_incompatible"
  | "clinic_ownership_mismatch"
  | "execution_identity_conflict"
  | "duplicate_plan_item_key"
  | "duplicate_sequence"
  | "missing_dependency"
  | "self_dependency"
  | "circular_dependency"
  | "finalization_order_invalid"
  | "binding_dependency_missing"
  | "assignment_dependency_missing"
  | "unsupported_action"
  | "state_drift_detected"
  | "rollback_intent_missing"
  | "irreversible_boundary_invalid"
  | "manual_followup_required"
  | "rollback_conditional";

export interface DeploymentActivationExecutionIssue {
  code: DeploymentActivationExecutionIssueCode;
  entityType: DeploymentActivationExecutionEntityType;
  entityId: string | null;
  planItemKey: string | null;
  deploymentKey: string | null;
  severity: DeploymentActivationExecutionIssueSeverity;
  message: string;
}

export interface DeploymentActivationExecutionDownstreamCounts {
  requested: 0;
  created: 0;
  reused: 0;
  skipped: 0;
  conflicts: 0;
}

export interface DeploymentActivationExecutionDeploymentRunSnapshot {
  deploymentRunId: string;
  clinicId: string | null;
  lifecycleState: string | null;
  deploymentStatus: string | null;
  executionOwnerKey?: string | null;
}

export interface DeploymentActivationExecutionIdentitySnapshot {
  executionKey: string;
  clinicId: string | null;
  deploymentRunId: string | null;
  status: DeploymentActivationExecutionSessionLifecycleStatus | string | null;
  ownerKey?: string | null;
}

export interface DeploymentActivationExecutionCurrentStateSnapshot {
  planItemKey: string;
  currentState: Record<string, unknown>;
}

export interface DeploymentActivationExecutionSnapshot {
  deploymentRun: DeploymentActivationExecutionDeploymentRunSnapshot | null;
  existingExecution: DeploymentActivationExecutionIdentitySnapshot | null;
  currentStates: readonly DeploymentActivationExecutionCurrentStateSnapshot[];
  warnings?: readonly DeploymentActivationExecutionIssue[];
}

export interface DeploymentActivationExecutionCommand {
  clinicId: string;
  deploymentRunId: string;
  planKey: string | null;
  planStatus: DeploymentActivationPlanStatus | null;
  blockers: number;
  itemsBlocked: number;
  planItems: readonly DeploymentActivationPlanItem[];
  readinessEvidenceKey?: string | null;
  readinessEvidenceHash?: string | null;
  payloadHash?: string | null;
  deploymentIdentity?: string | null;
}

export interface DeploymentActivationExecutionErrorEvidence {
  code: string;
  message: string;
}

export interface DeploymentActivationExecutionItemEvidence {
  dependencyLevel: number;
  readyDependencyKeys: readonly string[];
  pendingDependencyKeys: readonly string[];
}

export interface DeploymentActivationExecutionItem {
  executionItemKey: string;
  planItemKey: string;
  sequence: number;
  entityType: DeploymentActivationPlanEntityType;
  entityId: string | null;
  deploymentKey: string | null;
  action: DeploymentActivationPlanAction;
  currentState: Record<string, unknown>;
  targetState: Record<string, unknown>;
  dependencyKeys: readonly string[];
  executionStatus: DeploymentActivationExecutionItemStatus;
  attemptCount: number;
  reversible: boolean;
  rollbackAction: string | null;
  startedAt: string | null;
  completedAt: string | null;
  error: DeploymentActivationExecutionErrorEvidence | null;
  evidence: DeploymentActivationExecutionItemEvidence;
  downstream: DeploymentActivationExecutionDownstreamCounts;
}

export interface DeploymentActivationExecutionRollbackBoundary {
  lastReversibleSequence: number | null;
  firstIrreversibleSequence: number | null;
  rollbackSupportedItemKeys: readonly string[];
  rollbackUnsupportedItemKeys: readonly string[];
  wouldCrossIrreversibleBoundary: boolean;
}

export interface DeploymentActivationExecutionResult {
  ok: boolean;
  status: DeploymentActivationExecutionStatus;
  executionKey: string | null;
  planKey: string | null;
  clinicId: string | null;
  deploymentRunId: string | null;
  itemsRequested: number;
  itemsReady: number;
  itemsBlocked: number;
  itemsPending: number;
  reversibleItems: number;
  irreversibleItems: number;
  blockers: number;
  warnings: number;
  issues: readonly DeploymentActivationExecutionIssue[];
  executionItems: readonly DeploymentActivationExecutionItem[];
  rollbackBoundary: DeploymentActivationExecutionRollbackBoundary;
  downstream: DeploymentActivationExecutionDownstreamCounts;
  message: string;
}
