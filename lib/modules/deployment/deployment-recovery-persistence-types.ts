import type {
  DeploymentExecutionRecoveryCompensationClassification,
  DeploymentExecutionRecoveryDownstreamCounts,
  DeploymentExecutionRecoveryFailure,
  DeploymentExecutionRecoveryIssue,
  DeploymentExecutionRecoveryItemIdentity,
  DeploymentExecutionRecoveryResult,
  DeploymentExecutionRecoveryRollbackItem,
  DeploymentExecutionRecoveryRunningItem,
  DeploymentExecutionRecoveryStatus,
} from "./deployment-recovery-types";

export type DeploymentRecoveryPersistenceRepositoryStatus =
  | "created"
  | "reused"
  | "conflict"
  | "blocked"
  | "not_found"
  | "error";

export interface DeploymentRecoveryPersistenceEvidence {
  message: string;
  failedItem: DeploymentExecutionRecoveryItemIdentity | null;
  issues: readonly DeploymentExecutionRecoveryIssue[];
  stoppedAtStage: DeploymentExecutionRecoveryResult["stoppedAtStage"];
}

export interface DeploymentRecoveryPersistenceCommand {
  clinicId: string;
  deploymentRunKey: string;
  sessionId: string;
  executionKey: string;
  planKey: string;
  recoveryKey: string;
  idempotencyKey: string;
  payloadHash: string;
  recoveryStatus: DeploymentExecutionRecoveryStatus;
  rollbackRequired: boolean;
  rollbackExecutable: boolean;
  sanitizedFailure: DeploymentExecutionRecoveryFailure;
  unsupportedCompensations: readonly DeploymentExecutionRecoveryCompensationClassification[];
  runningItemsToRecover: readonly DeploymentExecutionRecoveryRunningItem[];
  completedMutationCount: number;
  reversibleMutationCount: number;
  downstream: DeploymentExecutionRecoveryDownstreamCounts;
  evidence: DeploymentRecoveryPersistenceEvidence;
  rollbackItems: readonly DeploymentExecutionRecoveryRollbackItem[];
}

export interface DeploymentRecoveryRepositoryErrorEvidence {
  code: "rpc_unavailable" | "rpc_failure" | "malformed_response";
  layer: "deployment_recovery_repository";
  message: string;
  retryable: boolean;
}

export interface DeploymentRecoveryPersistenceRepositoryResult {
  ok: boolean;
  status: DeploymentRecoveryPersistenceRepositoryStatus;
  recoveryPlanId: string | null;
  recoveryKey: string;
  payloadHash: string;
  recoveryStatus: DeploymentExecutionRecoveryStatus;
  rollbackRequired: boolean;
  rollbackExecutable: boolean;
  rollbackItemsPersisted: number;
  rollbackItemsReused: number;
  issueCode: string | null;
  message: string;
  persistedAt: string | null;
  repositoryError: DeploymentRecoveryRepositoryErrorEvidence | null;
}

export interface DeploymentRecoveryPersistenceInput {
  clinicId: string;
  deploymentRunKey: string;
  sessionId: string;
  executionKey: string;
  planKey: string;
  recovery: DeploymentExecutionRecoveryResult;
  expectedRecoveryKey?: string | null;
  expectedIdempotencyKey?: string | null;
  expectedPayloadHash?: string | null;
}

export type DeploymentRecoveryPersistenceServiceStatus =
  | "persisted"
  | "reused"
  | "conflict"
  | "blocked"
  | "not_found"
  | "repository_error";

export type DeploymentRecoveryPersistenceIssueCode =
  | "clinic_identity_mismatch"
  | "deployment_run_identity_mismatch"
  | "session_identity_mismatch"
  | "execution_identity_mismatch"
  | "plan_identity_mismatch"
  | "recovery_status_invalid"
  | "recovery_failure_missing"
  | "rollback_required_inconsistent"
  | "rollback_executable_inconsistent"
  | "mutation_counter_invalid"
  | "rollback_item_identity_invalid"
  | "duplicate_rollback_item_key"
  | "duplicate_rollback_sequence"
  | "duplicate_source_execution_item"
  | "duplicate_source_sequence"
  | "rollback_order_invalid"
  | "running_item_mixed_with_rollback"
  | "hardware_binding_compensation_invalid"
  | "unsafe_recovery_evidence"
  | "recovery_key_mismatch"
  | "idempotency_key_mismatch"
  | "payload_hash_mismatch"
  | "repository_blocked"
  | "repository_not_found"
  | "repository_conflict"
  | "repository_error";

export interface DeploymentRecoveryPersistenceIssue {
  code: DeploymentRecoveryPersistenceIssueCode;
  severity: "blocker" | "warning";
  message: string;
  executionItemKey: string | null;
  rollbackItemKey: string | null;
  sequence: number | null;
}

export type DeploymentRecoveryPersistenceStoppedAtStage =
  | "validation"
  | "repository"
  | "complete";

export interface DeploymentRecoveryPersistenceDownstreamCounts {
  recoveryPlansCreated: 0 | 1;
  recoveryPlansReused: 0 | 1;
  rollbackItemsPersisted: number;
  rollbackItemsReused: number;
  conflicts: 0 | 1;
  blocked: 0 | 1;
  notFound: 0 | 1;
  rollbackExecuted: 0;
  entitiesCompensated: 0;
  bindingsRemoved: 0;
  sessionsRecovered: 0;
  finalized: 0;
}

export interface DeploymentRecoveryPersistenceServiceResult {
  ok: boolean;
  status: DeploymentRecoveryPersistenceServiceStatus;
  message: string;
  clinicId: string;
  deploymentRunKey: string;
  sessionId: string;
  executionKey: string;
  planKey: string;
  recoveryKey: string | null;
  recoveryStatus: DeploymentExecutionRecoveryStatus | null;
  rollbackRequired: boolean;
  rollbackExecutable: boolean;
  recoveryPlanId: string | null;
  rollbackItemsRequested: number;
  rollbackItemsPersisted: number;
  payloadHash: string | null;
  issueCode: string | null;
  issues: readonly DeploymentRecoveryPersistenceIssue[];
  stoppedAtStage: DeploymentRecoveryPersistenceStoppedAtStage;
  downstream: DeploymentRecoveryPersistenceDownstreamCounts;
}
