export type DeploymentActivationExecutionItemCompletionStatus =
  | "completable"
  | "already_completed"
  | "blocked"
  | "conflict"
  | "not_found"
  | "error";

export type DeploymentActivationExecutionItemCompletionIssueSeverity =
  | "blocker"
  | "warning";

export type DeploymentActivationExecutionItemCompletionIssueCode =
  | "missing_session"
  | "missing_item"
  | "missing_clinic"
  | "claimant_invalid"
  | "ownership_token_invalid"
  | "assessment_timestamp_invalid"
  | "proposed_completed_at_invalid"
  | "clinic_identity_mismatch"
  | "deployment_run_identity_mismatch"
  | "session_identity_mismatch"
  | "execution_key_mismatch"
  | "session_not_running"
  | "session_timestamp_missing"
  | "terminal_session_timestamp_present"
  | "ownership_shape_inconsistent"
  | "session_owned_by_another_executor"
  | "ownership_token_mismatch"
  | "lease_missing"
  | "lease_expired"
  | "lease_timestamp_malformed"
  | "item_identity_mismatch"
  | "item_session_mismatch"
  | "wrong_running_item"
  | "wrong_sequence"
  | "wrong_entity_type"
  | "wrong_entity_id"
  | "wrong_action"
  | "item_not_running"
  | "item_not_succeeded"
  | "item_attempt_invalid"
  | "item_timestamp_missing"
  | "item_completed_timestamp_present"
  | "item_completed_timestamp_missing"
  | "item_rollback_evidence_present"
  | "item_error_present"
  | "dependency_integrity_invalid"
  | "item_expected_state_missing"
  | "item_target_state_missing"
  | "unsupported_target_state"
  | "clinic_not_deployed"
  | "clinic_deployed_at_missing"
  | "clinic_target_state_mismatch"
  | "incomplete_item_set"
  | "no_running_item"
  | "multiple_running_items"
  | "failed_item_present"
  | "duplicate_item_identity"
  | "unrelated_item_execution_evidence"
  | "completion_persistence_unavailable"
  | "dependency_progression_unimplemented"
  | "rollback_execution_unimplemented"
  | "session_completion_unimplemented"
  | "repository_error";

export interface DeploymentActivationExecutionItemCompletionCommand {
  clinicId: string;
  deploymentRunId: string;
  sessionId: string;
  executionKey: string;
  itemId: string;
  executionItemKey: string;
  planItemKey: string;
  claimantId: string;
  ownershipToken: string;
  assessmentTimestamp: string;
  proposedCompletedAt: string;
}

export interface DeploymentActivationExecutionItemCompletionSessionSnapshot {
  clinicId: string;
  deploymentRunId: string;
  sessionId: string;
  executionKey: string;
  executionStatus: string;
  executionOwner: string | null;
  ownershipToken: string | null;
  leaseExpiresAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  failedAt: string | null;
  itemsRequested: number;
}

export interface DeploymentActivationExecutionItemCompletionItemSnapshot {
  itemId: string;
  sessionId: string;
  executionItemKey: string;
  planItemKey: string;
  sequence: number;
  entityType: string;
  entityId: string | null;
  action: string;
  executionStatus: string;
  attemptCount: number;
  startedAt: string | null;
  completedAt: string | null;
  rolledBackAt: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  dependencyKeys: readonly string[];
  expectedCurrentState: Record<string, unknown> | null;
  targetState: Record<string, unknown> | null;
}

export interface DeploymentActivationExecutionItemCompletionClinicSnapshot {
  clinicId: string;
  deploymentStatus: string | null;
  deployedAt: string | null;
  currentState: Record<string, unknown> | null;
}

export interface DeploymentActivationExecutionItemCompletionAggregateSnapshot {
  totalItemCount: number;
  runningItemCount: number;
  succeededItemCount: number;
  pendingItemCount: number;
  failedItemCount: number;
  attemptedItemCount: number;
  timestampedItemCount: number;
  rollbackEvidenceCount: number;
  errorEvidenceCount: number;
  duplicateExecutionItemKeyCount: number;
  duplicatePlanItemKeyCount: number;
  duplicateSequenceCount: number;
}

export interface DeploymentActivationExecutionItemCompletionSnapshot {
  session: DeploymentActivationExecutionItemCompletionSessionSnapshot | null;
  item: DeploymentActivationExecutionItemCompletionItemSnapshot | null;
  clinic: DeploymentActivationExecutionItemCompletionClinicSnapshot | null;
  aggregate: DeploymentActivationExecutionItemCompletionAggregateSnapshot;
}

export interface DeploymentActivationExecutionItemCompletionIssue {
  code: DeploymentActivationExecutionItemCompletionIssueCode;
  severity: DeploymentActivationExecutionItemCompletionIssueSeverity;
  sessionId: string | null;
  executionKey: string | null;
  executionItemKey: string | null;
  planItemKey: string | null;
  message: string;
}

export interface DeploymentActivationExecutionItemCompletionDownstreamCounts {
  itemsCompleted: 0;
  dependenciesUnlocked: 0;
  providersActivated: 0;
  sterilizersActivated: 0;
  workstationsActivated: 0;
  hardwareActivated: 0;
  bindingsWritten: 0;
  deploymentFinalized: 0;
}

export interface DeploymentActivationExecutionItemCompletionResult {
  ok: boolean;
  status: DeploymentActivationExecutionItemCompletionStatus;
  claimantId: string | null;
  clinicId: string | null;
  deploymentRunId: string | null;
  sessionId: string | null;
  executionKey: string | null;
  itemId: string | null;
  executionItemKey: string | null;
  planItemKey: string | null;
  sequence: number | null;
  entityType: string | null;
  action: string | null;
  startedAt: string | null;
  existingCompletedAt: string | null;
  proposedCompletedAt: string | null;
  leaseExpiresAt: string | null;
  attemptCount: number;
  currentDurableState: Record<string, unknown> | null;
  targetState: Record<string, unknown> | null;
  blockers: number;
  warnings: number;
  issues: readonly DeploymentActivationExecutionItemCompletionIssue[];
  downstream: DeploymentActivationExecutionItemCompletionDownstreamCounts;
  message: string;
}

export function emptyItemCompletionAggregate(): DeploymentActivationExecutionItemCompletionAggregateSnapshot {
  return {
    totalItemCount: 0,
    runningItemCount: 0,
    succeededItemCount: 0,
    pendingItemCount: 0,
    failedItemCount: 0,
    attemptedItemCount: 0,
    timestampedItemCount: 0,
    rollbackEvidenceCount: 0,
    errorEvidenceCount: 0,
    duplicateExecutionItemKeyCount: 0,
    duplicatePlanItemKeyCount: 0,
    duplicateSequenceCount: 0,
  };
}

export function cloneItemCompletionSnapshot(
  snapshot: DeploymentActivationExecutionItemCompletionSnapshot,
): DeploymentActivationExecutionItemCompletionSnapshot {
  return {
    session: snapshot.session ? { ...snapshot.session } : null,
    item: snapshot.item
      ? {
          ...snapshot.item,
          dependencyKeys: [...snapshot.item.dependencyKeys],
          expectedCurrentState: snapshot.item.expectedCurrentState
            ? cloneRecord(snapshot.item.expectedCurrentState)
            : null,
          targetState: snapshot.item.targetState
            ? cloneRecord(snapshot.item.targetState)
            : null,
        }
      : null,
    clinic: snapshot.clinic
      ? {
          ...snapshot.clinic,
          currentState: snapshot.clinic.currentState
            ? cloneRecord(snapshot.clinic.currentState)
            : null,
        }
      : null,
    aggregate: { ...snapshot.aggregate },
  };
}

export function cloneRecord(value: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}

export type DeploymentActivationExecutionAtomicItemCompletionStatus =
  | "completed"
  | "already_completed"
  | "blocked"
  | "conflict"
  | "not_found"
  | "error";

export interface DeploymentActivationExecutionAtomicItemCompletionCommand {
  clinicId: string;
  deploymentRunId: string;
  sessionId: string;
  executionKey: string;
  claimantId: string;
  ownershipToken: string;
  expectedLeaseExpiresAt: string;
  itemId: string;
  executionItemKey: string;
  planItemKey: string;
  expectedSequence: number;
  expectedEntityType: string;
  expectedAction: string;
  expectedStartedAt: string;
  expectedAttemptCount: number;
  proposedCompletedAt: string;
}

export interface DeploymentActivationExecutionAtomicItemCompletionResult {
  ok: boolean;
  status: DeploymentActivationExecutionAtomicItemCompletionStatus;
  claimantId: string | null;
  clinicId: string | null;
  deploymentRunId: string | null;
  sessionId: string | null;
  executionKey: string | null;
  itemId: string | null;
  executionItemKey: string | null;
  planItemKey: string | null;
  sequence: number | null;
  entityType: string | null;
  action: string | null;
  startedAt: string | null;
  completedAt: string | null;
  attemptCount: number;
  executionStatusBefore: string | null;
  executionStatusAfter: string | null;
  issueCode: string | null;
  message: string;
}
