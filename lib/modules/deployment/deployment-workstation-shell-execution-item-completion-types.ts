export type DeploymentWorkstationShellExecutionItemCompletionStatus =
  | "completable"
  | "already_completed"
  | "not_attempted"
  | "blocked"
  | "conflict"
  | "not_found"
  | "error";

export type DeploymentWorkstationShellExecutionItemCompletionIssueSeverity = "blocker" | "warning";

export type DeploymentWorkstationShellExecutionItemCompletionIssueCode =
  | "missing_session"
  | "missing_item"
  | "missing_workstation_shell"
  | "claimant_invalid"
  | "ownership_token_invalid"
  | "proposed_completed_at_invalid"
  | "clinic_identity_mismatch"
  | "deployment_run_identity_mismatch"
  | "session_identity_mismatch"
  | "execution_key_mismatch"
  | "preparation_status_not_ready"
  | "session_not_running"
  | "session_timestamp_missing"
  | "terminal_session_timestamp_present"
  | "ownership_shape_inconsistent"
  | "session_owned_by_another_executor"
  | "ownership_token_mismatch"
  | "lease_missing"
  | "lease_timestamp_malformed"
  | "lease_expired"
  | "item_count_mismatch"
  | "no_running_item"
  | "multiple_running_items"
  | "ready_item_ambiguity"
  | "wrong_running_item"
  | "wrong_entity_type"
  | "wrong_action"
  | "item_not_running"
  | "item_not_succeeded"
  | "item_attempt_invalid"
  | "item_started_at_missing"
  | "item_completed_timestamp_present"
  | "item_completed_timestamp_missing"
  | "item_completion_before_start"
  | "item_rollback_evidence_present"
  | "item_error_present"
  | "item_session_mismatch"
  | "item_identity_mismatch"
  | "workstation_clinic_mismatch"
  | "workstation_identity_mismatch"
  | "workstation_uuid_invalid"
  | "workstation_provisioning_source_invalid"
  | "workstation_provisioning_status_invalid"
  | "workstation_active_state_invalid"
  | "workstation_target_state_mismatch"
  | "duplicate_item_identity"
  | "duplicate_workstation_identity"
  | "dependency_integrity_invalid"
  | "missing_dependency"
  | "pending_dependency"
  | "later_dependency"
  | "self_dependency"
  | "duplicate_dependency_keys"
  | "non_contiguous_succeeded_prefix"
  | "succeeded_item_attempt_invalid"
  | "succeeded_item_timestamp_missing"
  | "succeeded_item_completion_before_start"
  | "succeeded_item_rollback_evidence_present"
  | "succeeded_item_error_present"
  | "later_item_drift"
  | "workstation_item_completion_persistence_unavailable"
  | "dependency_progression_after_workstation_completion_unavailable"
  | "next_workstation_item_start_unavailable"
  | "rollback_execution_unavailable"
  | "repository_error";

export interface DeploymentWorkstationShellExecutionItemCompletionCommand {
  clinicId: string;
  deploymentRunId: string;
  sessionId: string;
  executionKey: string;
  claimantId: string;
  ownershipToken: string;
  proposedCompletedAt: string;
}

export interface DeploymentWorkstationShellExecutionItemCompletionSessionSnapshot {
  sessionId: string;
  clinicId: string;
  deploymentRunId: string;
  executionKey: string;
  preparationStatus: string;
  executionStatus: string;
  executionOwner: string | null;
  ownershipToken: string | null;
  leaseExpiresAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  failedAt: string | null;
  itemsRequested: number;
}

export interface DeploymentWorkstationShellExecutionItemCompletionItemSnapshot {
  itemId: string;
  sessionId: string;
  executionItemKey: string;
  planItemKey: string;
  sequence: number;
  entityType: string;
  entityId: string | null;
  deploymentKey: string | null;
  action: string;
  executionStatus: string;
  attemptCount: number;
  startedAt: string | null;
  completedAt: string | null;
  rolledBackAt: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  expectedCurrentState: Record<string, unknown> | null;
  targetState: Record<string, unknown> | null;
  dependencyKeys: readonly string[];
  reversible: boolean | null;
}

export interface DeploymentWorkstationShellExecutionItemCompletionWorkstationSnapshot {
  workstationId: string;
  clinicId: string | null;
  deploymentWorkstationKey: string | null;
  provisioningSource: string | null;
  provisioningStatus: string | null;
  active: boolean | null;
  updatedAt: string | null;
}

export interface DeploymentWorkstationShellExecutionItemCompletionAggregateSnapshot {
  totalItemCount: number;
  succeededItemCount: number;
  runningItemCount: number;
  readyItemCount: number;
  pendingItemCount: number;
  failedItemCount: number;
  duplicateExecutionItemKeyCount: number;
  duplicatePlanItemKeyCount: number;
  duplicateSequenceCount: number;
  duplicateWorkstationDeploymentIdentityCount: number;
  unexpectedTouchedLaterItemCount: number;
  priorSucceededPrefixCount: number;
  runningWorkstationItemCount: number;
}

export interface DeploymentWorkstationShellExecutionItemCompletionSnapshot {
  session: DeploymentWorkstationShellExecutionItemCompletionSessionSnapshot | null;
  item: DeploymentWorkstationShellExecutionItemCompletionItemSnapshot | null;
  items: readonly DeploymentWorkstationShellExecutionItemCompletionItemSnapshot[];
  workstation: DeploymentWorkstationShellExecutionItemCompletionWorkstationSnapshot | null;
  aggregate: DeploymentWorkstationShellExecutionItemCompletionAggregateSnapshot;
}

export interface DeploymentWorkstationShellExecutionItemCompletionIssue {
  code: DeploymentWorkstationShellExecutionItemCompletionIssueCode;
  severity: DeploymentWorkstationShellExecutionItemCompletionIssueSeverity;
  message: string;
  sessionId: string | null;
  executionKey: string | null;
  executionItemKey: string | null;
  planItemKey: string | null;
  workstationId: string | null;
  deploymentWorkstationKey: string | null;
  sequence: number | null;
}

export interface DeploymentWorkstationShellExecutionItemCompletionDownstreamCounts {
  itemsCompleted: 0;
  dependenciesProgressed: 0;
  nextItemsStarted: 0;
  providersActivated: 0;
  sterilizersActivated: 0;
  workstationsActivated: 0;
  hardwareActivated: 0;
  bindingsWritten: 0;
  sessionsCompleted: 0;
  rollbacksExecuted: 0;
  deploymentFinalized: 0;
}

export interface DeploymentWorkstationShellExecutionItemCompletionResult {
  ok: boolean;
  status: DeploymentWorkstationShellExecutionItemCompletionStatus;
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
  entityId: string | null;
  deploymentWorkstationKey: string | null;
  action: string | null;
  itemStatusBefore: string | null;
  itemStatusAfter: string | null;
  attemptCount: number;
  startedAt: string | null;
  completedAt: string | null;
  workstationId: string | null;
  workstationStatus: string | null;
  workstationActive: boolean | null;
  completionResult: string | null;
  completableCount: 0 | 1;
  reusedCount: 0 | 1;
  conflicts: number;
  blockers: number;
  warnings: number;
  issues: readonly DeploymentWorkstationShellExecutionItemCompletionIssue[];
  downstream: DeploymentWorkstationShellExecutionItemCompletionDownstreamCounts;
  message: string;
}

export function emptyWorkstationShellExecutionItemCompletionAggregate(): DeploymentWorkstationShellExecutionItemCompletionAggregateSnapshot {
  return {
    totalItemCount: 0,
    succeededItemCount: 0,
    runningItemCount: 0,
    readyItemCount: 0,
    pendingItemCount: 0,
    failedItemCount: 0,
    duplicateExecutionItemKeyCount: 0,
    duplicatePlanItemKeyCount: 0,
    duplicateSequenceCount: 0,
    duplicateWorkstationDeploymentIdentityCount: 0,
    unexpectedTouchedLaterItemCount: 0,
    priorSucceededPrefixCount: 0,
    runningWorkstationItemCount: 0,
  };
}

export function cloneWorkstationShellExecutionItemCompletionSnapshot(
  snapshot: DeploymentWorkstationShellExecutionItemCompletionSnapshot,
): DeploymentWorkstationShellExecutionItemCompletionSnapshot {
  return {
    session: snapshot.session ? { ...snapshot.session } : null,
    item: snapshot.item ? cloneWorkstationShellExecutionItemCompletionItem(snapshot.item) : null,
    items: snapshot.items.map(cloneWorkstationShellExecutionItemCompletionItem),
    workstation: snapshot.workstation ? { ...snapshot.workstation } : null,
    aggregate: { ...snapshot.aggregate },
  };
}

export function cloneWorkstationShellExecutionItemCompletionItem(
  item: DeploymentWorkstationShellExecutionItemCompletionItemSnapshot,
): DeploymentWorkstationShellExecutionItemCompletionItemSnapshot {
  return {
    ...item,
    expectedCurrentState: item.expectedCurrentState ? cloneRecord(item.expectedCurrentState) : null,
    targetState: item.targetState ? cloneRecord(item.targetState) : null,
    dependencyKeys: [...item.dependencyKeys],
  };
}

export function cloneRecord(value: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}

export type DeploymentWorkstationShellExecutionAtomicItemCompletionStatus =
  | "completed"
  | "already_completed"
  | "blocked"
  | "conflict"
  | "not_found"
  | "error";

export interface DeploymentWorkstationShellExecutionAtomicItemCompletionCommand {
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
  expectedEntityType: "workstation_shell";
  expectedEntityId: string;
  expectedDeploymentWorkstationKey: string;
  expectedAction: "activate";
  expectedItemStartedAt: string;
  expectedAttemptCount: number;
  workstationId: string;
  expectedWorkstationState: Record<string, unknown>;
  expectedTargetState: Record<string, unknown>;
  proposedCompletedAt: string;
}

export interface DeploymentWorkstationShellExecutionAtomicItemCompletionDiagnostics {
  layer?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  errorDetails?: string | null;
  errorHint?: string | null;
}

export interface DeploymentWorkstationShellExecutionAtomicItemCompletionResult {
  ok: boolean;
  status: DeploymentWorkstationShellExecutionAtomicItemCompletionStatus;
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
  entityId: string | null;
  deploymentWorkstationKey: string | null;
  action: string | null;
  workstationId: string | null;
  itemStatusBefore: string | null;
  itemStatusAfter: string | null;
  startedAt: string | null;
  completedAt: string | null;
  attemptCount: number;
  issueCode: string | null;
  message: string;
  diagnostics?: DeploymentWorkstationShellExecutionAtomicItemCompletionDiagnostics | null;
}
