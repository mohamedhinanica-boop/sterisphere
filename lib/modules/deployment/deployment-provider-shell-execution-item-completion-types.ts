export type DeploymentProviderShellExecutionItemCompletionStatus =
  | "completable"
  | "already_completed"
  | "not_attempted"
  | "blocked"
  | "conflict"
  | "not_found"
  | "error";

export type DeploymentProviderShellExecutionItemCompletionIssueSeverity = "blocker" | "warning";

export type DeploymentProviderShellExecutionItemCompletionIssueCode =
  | "missing_session"
  | "missing_item"
  | "missing_provider_shell"
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
  | "provider_clinic_mismatch"
  | "provider_identity_mismatch"
  | "provider_provisioning_source_invalid"
  | "provider_provisioning_status_invalid"
  | "provider_active_state_invalid"
  | "provider_target_state_mismatch"
  | "duplicate_item_identity"
  | "duplicate_provider_identity"
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
  | "provider_item_completion_persistence_unavailable"
  | "dependency_progression_after_provider_completion_unavailable"
  | "next_provider_item_start_unavailable"
  | "rollback_execution_unavailable"
  | "repository_error";

export interface DeploymentProviderShellExecutionItemCompletionCommand {
  clinicId: string;
  deploymentRunId: string;
  sessionId: string;
  executionKey: string;
  claimantId: string;
  ownershipToken: string;
  proposedCompletedAt: string;
}

export interface DeploymentProviderShellExecutionItemCompletionSessionSnapshot {
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

export interface DeploymentProviderShellExecutionItemCompletionItemSnapshot {
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

export interface DeploymentProviderShellExecutionItemCompletionProviderSnapshot {
  providerId: string;
  clinicId: string | null;
  deploymentProviderKey: string | null;
  provisioningSource: string | null;
  provisioningStatus: string | null;
  active: boolean | null;
  updatedAt: string | null;
}

export interface DeploymentProviderShellExecutionItemCompletionAggregateSnapshot {
  totalItemCount: number;
  succeededItemCount: number;
  runningItemCount: number;
  readyItemCount: number;
  pendingItemCount: number;
  failedItemCount: number;
  duplicateExecutionItemKeyCount: number;
  duplicatePlanItemKeyCount: number;
  duplicateSequenceCount: number;
  duplicateProviderDeploymentIdentityCount: number;
  unexpectedTouchedLaterItemCount: number;
  priorSucceededPrefixCount: number;
  runningProviderItemCount: number;
}

export interface DeploymentProviderShellExecutionItemCompletionSnapshot {
  session: DeploymentProviderShellExecutionItemCompletionSessionSnapshot | null;
  item: DeploymentProviderShellExecutionItemCompletionItemSnapshot | null;
  items: readonly DeploymentProviderShellExecutionItemCompletionItemSnapshot[];
  provider: DeploymentProviderShellExecutionItemCompletionProviderSnapshot | null;
  aggregate: DeploymentProviderShellExecutionItemCompletionAggregateSnapshot;
}

export interface DeploymentProviderShellExecutionItemCompletionIssue {
  code: DeploymentProviderShellExecutionItemCompletionIssueCode;
  severity: DeploymentProviderShellExecutionItemCompletionIssueSeverity;
  message: string;
  sessionId: string | null;
  executionKey: string | null;
  executionItemKey: string | null;
  planItemKey: string | null;
  providerId: string | null;
  deploymentProviderKey: string | null;
  sequence: number | null;
}

export interface DeploymentProviderShellExecutionItemCompletionDownstreamCounts {
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

export interface DeploymentProviderShellExecutionItemCompletionResult {
  ok: boolean;
  status: DeploymentProviderShellExecutionItemCompletionStatus;
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
  deploymentProviderKey: string | null;
  action: string | null;
  itemStatusBefore: string | null;
  itemStatusAfter: string | null;
  attemptCount: number;
  startedAt: string | null;
  completedAt: string | null;
  providerId: string | null;
  providerStatus: string | null;
  providerActive: boolean | null;
  completionResult: string | null;
  completableCount: 0 | 1;
  reusedCount: 0 | 1;
  conflicts: number;
  blockers: number;
  warnings: number;
  issues: readonly DeploymentProviderShellExecutionItemCompletionIssue[];
  downstream: DeploymentProviderShellExecutionItemCompletionDownstreamCounts;
  message: string;
}

export function emptyProviderShellExecutionItemCompletionAggregate(): DeploymentProviderShellExecutionItemCompletionAggregateSnapshot {
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
    duplicateProviderDeploymentIdentityCount: 0,
    unexpectedTouchedLaterItemCount: 0,
    priorSucceededPrefixCount: 0,
    runningProviderItemCount: 0,
  };
}

export function cloneProviderShellExecutionItemCompletionSnapshot(
  snapshot: DeploymentProviderShellExecutionItemCompletionSnapshot,
): DeploymentProviderShellExecutionItemCompletionSnapshot {
  return {
    session: snapshot.session ? { ...snapshot.session } : null,
    item: snapshot.item ? cloneProviderShellExecutionItemCompletionItem(snapshot.item) : null,
    items: snapshot.items.map(cloneProviderShellExecutionItemCompletionItem),
    provider: snapshot.provider ? { ...snapshot.provider } : null,
    aggregate: { ...snapshot.aggregate },
  };
}

export function cloneProviderShellExecutionItemCompletionItem(
  item: DeploymentProviderShellExecutionItemCompletionItemSnapshot,
): DeploymentProviderShellExecutionItemCompletionItemSnapshot {
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

export type DeploymentProviderShellExecutionAtomicItemCompletionStatus =
  | "completed"
  | "already_completed"
  | "blocked"
  | "conflict"
  | "not_found"
  | "error";

export interface DeploymentProviderShellExecutionAtomicItemCompletionCommand {
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
  expectedEntityType: "provider_shell";
  expectedEntityId: string;
  expectedDeploymentProviderKey: string;
  expectedAction: "activate";
  expectedItemStartedAt: string;
  expectedAttemptCount: number;
  providerId: string;
  expectedProviderState: Record<string, unknown>;
  expectedTargetState: Record<string, unknown>;
  proposedCompletedAt: string;
}

export interface DeploymentProviderShellExecutionAtomicItemCompletionDiagnostics {
  layer?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  errorDetails?: string | null;
  errorHint?: string | null;
}

export interface DeploymentProviderShellExecutionAtomicItemCompletionResult {
  ok: boolean;
  status: DeploymentProviderShellExecutionAtomicItemCompletionStatus;
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
  deploymentProviderKey: string | null;
  action: string | null;
  providerId: string | null;
  itemStatusBefore: string | null;
  itemStatusAfter: string | null;
  startedAt: string | null;
  completedAt: string | null;
  attemptCount: number;
  issueCode: string | null;
  message: string;
  diagnostics?: DeploymentProviderShellExecutionAtomicItemCompletionDiagnostics | null;
}
