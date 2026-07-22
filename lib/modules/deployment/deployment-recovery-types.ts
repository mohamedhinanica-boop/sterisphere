import type { DeploymentActivationExecutionItem } from "./deployment-activation-execution-types";
import type {
  DeploymentActivationExecutionNextItemStartItemSnapshot,
  DeploymentActivationExecutionNextItemStartSessionSnapshot,
} from "./deployment-activation-execution-next-item-start-types";

export type DeploymentExecutionRecoveryStatus =
  | "rollback_required"
  | "rollback_not_required"
  | "blocked"
  | "not_found";

export type DeploymentExecutionRecoveryStoppedAtStage =
  | "failure_validation"
  | "identity_validation"
  | "snapshot_validation"
  | "plan_construction"
  | "decision_complete";

export type DeploymentExecutionRecoveryIssueCode =
  | "clinic_identity_mismatch"
  | "deployment_run_identity_mismatch"
  | "session_identity_mismatch"
  | "execution_identity_mismatch"
  | "plan_identity_mismatch"
  | "claimant_identity_mismatch"
  | "ownership_token_mismatch"
  | "lease_identity_mismatch"
  | "failed_item_not_found"
  | "duplicate_execution_sequence"
  | "prepared_item_missing"
  | "mutation_evidence_missing"
  | "unsupported_compensation"
  | "binding_identity_incomplete"
  | "foreign_execution_item"
  | "invalid_failure_evidence"
  | "recovery_internal_error";

export interface DeploymentExecutionRecoveryIssue {
  code: DeploymentExecutionRecoveryIssueCode;
  severity: "blocker" | "warning";
  message: string;
  executionItemKey: string | null;
  planItemKey: string | null;
  sequence: number | null;
  entityType: string | null;
  entityId: string | null;
}

export type DeploymentExecutionRecoverySafeDiagnostic = string | number | boolean | null;

export interface DeploymentExecutionRecoveryFailureInput {
  failureCode: unknown;
  failureLayer: unknown;
  failedAt: unknown;
  message?: unknown;
  failedExecutionItemKey?: unknown;
  failedPlanItemKey?: unknown;
  failedSequence?: unknown;
  failedEntityType?: unknown;
  failedEntityId?: unknown;
  failedAction?: unknown;
  retryable?: unknown;
  diagnostics?: unknown;
  [key: string]: unknown;
}

export interface DeploymentExecutionRecoveryFailure {
  failureCode: string;
  failureLayer: string;
  failedAt: string;
  message: string;
  failedExecutionItemKey: string | null;
  failedPlanItemKey: string | null;
  failedSequence: number | null;
  failedEntityType: string | null;
  failedEntityId: string | null;
  failedAction: string | null;
  retryable: boolean;
  diagnostics: Readonly<Record<string, DeploymentExecutionRecoverySafeDiagnostic>>;
}

export interface DeploymentExecutionRecoveryPreparedSnapshot {
  clinicId: string;
  deploymentRunKey: string;
  executionKey: string;
  planKey: string;
  items: readonly DeploymentActivationExecutionItem[];
}

export interface DeploymentExecutionRecoveryCurrentItem {
  clinicId: string;
  deploymentRunKey: string;
  sessionId: string;
  executionKey: string;
  planKey: string;
  item: DeploymentActivationExecutionNextItemStartItemSnapshot;
}

export type DeploymentExecutionRecoveryMutationDisposition =
  | "applied"
  | "reused"
  | "not_applied";

export interface DeploymentExecutionRecoveryHardwareBindingEvidence {
  hardwareId: string;
  deploymentHardwareKey: string;
  targetType: "workstation" | "sterilizer";
  targetId: string;
  targetDeploymentKey: string;
  previousTargetId: string | null;
}

export interface DeploymentExecutionRecoveryMutationEvidence {
  sourceExecutionItemKey: string;
  disposition: DeploymentExecutionRecoveryMutationDisposition;
  completedAt: string | null;
  hardwareBinding?: DeploymentExecutionRecoveryHardwareBindingEvidence;
}

export interface DeploymentExecutionRecoveryCommand {
  clinicId: string;
  deploymentRunKey: string;
  sessionId: string;
  executionKey: string;
  planKey: string;
  claimantId: string;
  ownershipToken: string;
  expectedLeaseExpiresAt: string;
  session: DeploymentActivationExecutionNextItemStartSessionSnapshot | null;
  prepared: DeploymentExecutionRecoveryPreparedSnapshot | null;
  items: readonly DeploymentExecutionRecoveryCurrentItem[];
  mutationEvidence: readonly DeploymentExecutionRecoveryMutationEvidence[];
  failure: DeploymentExecutionRecoveryFailureInput;
  requestedAt: string;
}

export type DeploymentExecutionRecoveryCompensationSupport =
  | "supported"
  | "unsupported"
  | "conditionally_supported";

export interface DeploymentExecutionRecoveryCompensationClassification {
  entityType: "clinic" | "provider_shell" | "sterilizer_shell" | "workstation_shell" | "hardware_shell" | "hardware_binding";
  action: "activate" | "bind";
  support: DeploymentExecutionRecoveryCompensationSupport;
  compensationAction: string | null;
  reason: string;
}

export interface DeploymentExecutionRecoveryRollbackItem {
  rollbackItemKey: string;
  sourceExecutionItemKey: string;
  sourcePlanItemKey: string;
  sourceSequence: number;
  rollbackSequence: number;
  entityType: string;
  entityId: string | null;
  originalAction: string;
  compensationAction: string | null;
  compensationReason: string;
  expectedCurrentState: Readonly<Record<string, unknown>>;
  expectedPriorState: Readonly<Record<string, unknown>>;
  reversible: boolean;
  blockedReason: string | null;
}

export interface DeploymentExecutionRecoveryRunningItem {
  executionItemKey: string;
  planItemKey: string;
  sequence: number;
  entityType: string;
  entityId: string | null;
  action: string;
  recoveryControl: "cancel_or_reset_required";
}

export interface DeploymentExecutionRecoveryItemIdentity {
  executionItemKey: string;
  planItemKey: string;
  sequence: number;
  entityType: string;
  entityId: string | null;
  action: string;
}

export interface DeploymentExecutionRecoveryDownstreamCounts {
  failuresClassified: 0 | 1;
  rollbackItemsPlanned: number;
  unsupportedCompensations: number;
  runningItemsIdentified: number;
  rollbackExecuted: 0;
  entitiesCompensated: 0;
  bindingsRemoved: 0;
  sessionsRecovered: 0;
  finalized: 0;
}

export interface DeploymentExecutionRecoveryResult {
  ok: boolean;
  status: DeploymentExecutionRecoveryStatus;
  message: string;
  clinicId: string;
  deploymentRunKey: string;
  sessionId: string;
  executionKey: string;
  planKey: string;
  failure: DeploymentExecutionRecoveryFailure | null;
  failedItem: DeploymentExecutionRecoveryItemIdentity | null;
  rollbackRequired: boolean;
  rollbackExecutable: boolean;
  rollbackItems: readonly DeploymentExecutionRecoveryRollbackItem[];
  unsupportedCompensations: readonly DeploymentExecutionRecoveryCompensationClassification[];
  runningItemsToRecover: readonly DeploymentExecutionRecoveryRunningItem[];
  completedMutationCount: number;
  reversibleMutationCount: number;
  issues: readonly DeploymentExecutionRecoveryIssue[];
  stoppedAtStage: DeploymentExecutionRecoveryStoppedAtStage;
  downstream: DeploymentExecutionRecoveryDownstreamCounts;
}
