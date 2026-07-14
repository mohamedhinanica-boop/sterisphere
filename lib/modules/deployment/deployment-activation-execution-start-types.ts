export type DeploymentActivationExecutionStartStatus =
  | "startable"
  | "already_started"
  | "blocked"
  | "conflict"
  | "error";

export type DeploymentActivationExecutionStartIssueSeverity =
  | "blocker"
  | "warning";

export type DeploymentActivationExecutionStartIssueCode =
  | "missing_session"
  | "clinic_identity_mismatch"
  | "deployment_run_identity_mismatch"
  | "session_identity_mismatch"
  | "execution_key_mismatch"
  | "claimant_invalid"
  | "ownership_token_invalid"
  | "current_timestamp_invalid"
  | "preparation_not_ready"
  | "execution_status_not_startable"
  | "session_timestamp_present"
  | "terminal_timestamp_present"
  | "ownership_shape_inconsistent"
  | "session_owned_by_another_executor"
  | "ownership_token_mismatch"
  | "lease_expired"
  | "lease_timestamp_malformed"
  | "incomplete_item_set"
  | "session_counter_mismatch"
  | "invalid_item_lifecycle"
  | "attempt_evidence_present"
  | "execution_timestamp_present"
  | "rollback_timestamp_present"
  | "item_error_present"
  | "duplicate_item_identity"
  | "dependency_integrity_invalid"
  | "start_persistence_unimplemented"
  | "item_execution_unimplemented"
  | "heartbeat_unimplemented"
  | "rollback_unavailable"
  | "repository_error";

export interface DeploymentActivationExecutionStartCommand {
  clinicId: string;
  deploymentRunId: string;
  sessionId: string;
  executionKey: string;
  claimantId: string;
  ownershipToken: string;
  currentTimestamp: string;
}

export interface DeploymentActivationExecutionStartSessionSnapshot {
  id: string;
  clinicId: string;
  deploymentRunId: string;
  executionKey: string;
  planKey: string;
  executionOwner: string | null;
  ownershipToken: string | null;
  leaseExpiresAt: string | null;
  preparationStatus: string;
  executionStatus: string;
  startedAt: string | null;
  completedAt: string | null;
  failedAt: string | null;
  itemsRequested: number;
  itemsReady: number;
  itemsPending: number;
  itemsBlocked: number;
}

export interface DeploymentActivationExecutionStartItemIntegritySnapshot {
  durableItemCount: number;
  readyItemCount: number;
  pendingItemCount: number;
  runningItemCount: number;
  terminalItemCount: number;
  invalidStatusCount: number;
  runningItemsWithAttemptOne: number;
  runningItemsWithValidStartedAt: number;
  runningItemsWithCompletionEvidence: number;
  pendingItemsWithAttempts: number;
  pendingItemsWithExecutionTimestamps: number;
  pendingItemsWithRollbackTimestamps: number;
  pendingItemsWithErrors: number;
  attemptedItemCount: number;
  itemExecutionTimestampCount: number;
  rollbackTimestampCount: number;
  errorEvidenceCount: number;
  duplicateExecutionItemKeyCount: number;
  duplicatePlanItemKeyCount: number;
  duplicateSequenceCount: number;
  readyRootCount: number;
  pendingRootCount: number;
  malformedDependencyCount: number;
  firstSequence: number | null;
  firstItemStatus: "ready" | "pending" | "blocked" | "running" | "terminal" | null;
}

export interface DeploymentActivationExecutionStartSnapshot {
  session: DeploymentActivationExecutionStartSessionSnapshot | null;
  itemIntegrity: DeploymentActivationExecutionStartItemIntegritySnapshot;
}

export interface DeploymentActivationExecutionStartIssue {
  code: DeploymentActivationExecutionStartIssueCode;
  severity: DeploymentActivationExecutionStartIssueSeverity;
  sessionId: string | null;
  executionKey: string | null;
  message: string;
}

export interface DeploymentActivationExecutionStartDownstreamCounts {
  sessionsStarted: 0;
  itemsStarted: 0;
  itemsSucceeded: 0;
  itemsFailed: 0;
  itemsRolledBack: 0;
  entitiesActivated: 0;
  bindingsWritten: 0;
  deploymentRunsFinalized: 0;
  rollbacksExecuted: 0;
}

export interface DeploymentActivationExecutionStartResult {
  ok: boolean;
  status: DeploymentActivationExecutionStartStatus;
  sessionId: string | null;
  executionKey: string | null;
  planKey: string | null;
  owner: string | null;
  currentLeaseExpiresAt: string | null;
  proposedExecutionStatus: "running" | null;
  proposedStartedAt: string | null;
  itemsRequested: number;
  itemsReady: number;
  itemsPending: number;
  blockers: number;
  warnings: number;
  issues: readonly DeploymentActivationExecutionStartIssue[];
  downstream: DeploymentActivationExecutionStartDownstreamCounts;
  message: string;
}

export function emptyStartItemIntegrity(): DeploymentActivationExecutionStartItemIntegritySnapshot {
  return {
    durableItemCount: 0,
    readyItemCount: 0,
    pendingItemCount: 0,
    runningItemCount: 0,
    terminalItemCount: 0,
    invalidStatusCount: 0,
    runningItemsWithAttemptOne: 0,
    runningItemsWithValidStartedAt: 0,
    runningItemsWithCompletionEvidence: 0,
    pendingItemsWithAttempts: 0,
    pendingItemsWithExecutionTimestamps: 0,
    pendingItemsWithRollbackTimestamps: 0,
    pendingItemsWithErrors: 0,
    attemptedItemCount: 0,
    itemExecutionTimestampCount: 0,
    rollbackTimestampCount: 0,
    errorEvidenceCount: 0,
    duplicateExecutionItemKeyCount: 0,
    duplicatePlanItemKeyCount: 0,
    duplicateSequenceCount: 0,
    readyRootCount: 0,
    pendingRootCount: 0,
    malformedDependencyCount: 0,
    firstSequence: null,
    firstItemStatus: null,
  };
}

export function cloneStartItemIntegrity(
  value: DeploymentActivationExecutionStartItemIntegritySnapshot,
): DeploymentActivationExecutionStartItemIntegritySnapshot {
  return { ...value };
}

export function cloneStartSessionSnapshot(
  value: DeploymentActivationExecutionStartSessionSnapshot,
): DeploymentActivationExecutionStartSessionSnapshot {
  return { ...value };
}
export type DeploymentActivationExecutionAtomicStartStatus =
  | "started"
  | "already_started"
  | "blocked"
  | "conflict"
  | "not_found"
  | "error";

export interface DeploymentActivationExecutionAtomicStartCommand {
  clinicId: string;
  deploymentRunId: string;
  sessionId: string;
  executionKey: string;
  claimantId: string;
  ownershipToken: string;
  expectedLeaseExpiresAt: string;
  proposedStartedAt: string;
  expectedItemCount: number;
}

export interface DeploymentActivationExecutionAtomicStartResult {
  ok: boolean;
  status: DeploymentActivationExecutionAtomicStartStatus;
  sessionId: string | null;
  executionKey: string | null;
  owner: string | null;
  leaseExpiresAt: string | null;
  executionStatus: string | null;
  startedAt: string | null;
  itemCount: number;
  issueCode: string | null;
  message: string;
}
