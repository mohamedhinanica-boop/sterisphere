export type DeploymentActivationExecutionDependencyProgressionStatus =
  | "progressable"
  | "already_progressed"
  | "blocked"
  | "conflict"
  | "not_found"
  | "error";

export type DeploymentActivationExecutionDependencyProgressionIssueSeverity =
  | "blocker"
  | "warning";

export type DeploymentActivationExecutionDependencyProgressionIssueCode =
  | "missing_session"
  | "claimant_invalid"
  | "ownership_token_invalid"
  | "assessment_timestamp_invalid"
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
  | "no_succeeded_prefix"
  | "non_contiguous_succeeded_prefix"
  | "succeeded_item_attempt_invalid"
  | "succeeded_item_timestamp_missing"
  | "succeeded_item_completion_before_start"
  | "succeeded_item_rollback_evidence_present"
  | "succeeded_item_error_present"
  | "next_item_missing"
  | "next_sequence_gap"
  | "next_item_status_invalid"
  | "next_item_attempt_evidence_present"
  | "next_item_timestamp_evidence_present"
  | "next_item_rollback_evidence_present"
  | "next_item_error_present"
  | "multiple_ready_items"
  | "running_item_present"
  | "terminal_item_present"
  | "later_item_drift"
  | "dependency_keys_malformed"
  | "dependency_item_missing"
  | "dependency_not_succeeded"
  | "dependency_on_later_item"
  | "dependency_self_reference"
  | "duplicate_dependency_key"
  | "duplicate_item_identity"
  | "deterministic_candidate_ambiguity"
  | "unsupported_entity_action_lifecycle"
  | "dependency_progression_persistence_unimplemented"
  | "next_item_start_unimplemented"
  | "rollback_execution_unimplemented"
  | "repository_error";

export interface DeploymentActivationExecutionDependencyProgressionCommand {
  clinicId: string;
  deploymentRunKey: string;
  sessionId: string;
  executionKey: string;
  claimantId: string;
  ownershipToken: string;
  now: string;
}

export interface DeploymentActivationExecutionDependencyProgressionSessionSnapshot {
  sessionId: string;
  clinicId: string;
  deploymentRunKey: string;
  executionKey: string;
  preparationStatus: string;
  executionStatus: string;
  executionOwner: string | null;
  ownershipToken: string | null;
  leaseExpiresAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  failedAt: string | null;
  cancelledAt: string | null;
  rolledBackAt: string | null;
  itemsRequested: number;
}

export interface DeploymentActivationExecutionDependencyProgressionItemSnapshot {
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
  reversible: boolean | null;
  rollbackBehavior: string | null;
}

export interface DeploymentActivationExecutionDependencyProgressionAggregateSnapshot {
  totalItemCount: number;
  succeededItemCount: number;
  pendingItemCount: number;
  readyItemCount: number;
  runningItemCount: number;
  failedOrTerminalItemCount: number;
  attemptedItemCount: number;
  timestampedItemCount: number;
  rollbackEvidenceCount: number;
  errorEvidenceCount: number;
  malformedDependencyCount: number;
  duplicateExecutionItemKeyCount: number;
  duplicatePlanItemKeyCount: number;
  duplicateSequenceCount: number;
}

export interface DeploymentActivationExecutionDependencyProgressionSnapshot {
  session: DeploymentActivationExecutionDependencyProgressionSessionSnapshot | null;
  items: readonly DeploymentActivationExecutionDependencyProgressionItemSnapshot[];
  aggregate: DeploymentActivationExecutionDependencyProgressionAggregateSnapshot;
}

export interface DeploymentActivationExecutionDependencyProgressionIssue {
  code: DeploymentActivationExecutionDependencyProgressionIssueCode;
  severity: DeploymentActivationExecutionDependencyProgressionIssueSeverity;
  message: string;
  sessionId: string | null;
  executionKey: string | null;
  executionItemKey?: string | null;
  planItemKey?: string | null;
  entityType?: string | null;
  entityKey?: string | null;
  sequence?: number | null;
}

export interface DeploymentActivationExecutionDependencyProgressionDownstreamCounts {
  itemsReadied: 0;
  itemsStarted: 0;
  itemsSucceeded: 0;
  entitiesActivated: 0;
  bindingsWritten: 0;
  sessionsCompleted: 0;
  deploymentsFinalized: 0;
  rollbacksExecuted: 0;
}

export interface DeploymentActivationExecutionDependencyProgressionResult {
  ok: boolean;
  status: DeploymentActivationExecutionDependencyProgressionStatus;
  message: string;
  clinicId: string | null;
  deploymentRunKey: string | null;
  sessionId: string | null;
  executionKey: string | null;
  claimantId: string | null;
  completedItemId: string | null;
  completedExecutionItemKey: string | null;
  completedPlanItemKey: string | null;
  completedSequence: number | null;
  nextItemId: string | null;
  nextExecutionItemKey: string | null;
  nextPlanItemKey: string | null;
  nextSequence: number | null;
  nextEntityType: string | null;
  nextEntityId: string | null;
  nextAction: string | null;
  currentNextItemStatus: string | null;
  proposedNextItemStatus: "ready" | null;
  dependencyKeys: readonly string[];
  blockerCount: number;
  warningCount: number;
  issues: readonly DeploymentActivationExecutionDependencyProgressionIssue[];
  downstream: DeploymentActivationExecutionDependencyProgressionDownstreamCounts;
}

export function emptyDependencyProgressionAggregate(): DeploymentActivationExecutionDependencyProgressionAggregateSnapshot {
  return {
    totalItemCount: 0,
    succeededItemCount: 0,
    pendingItemCount: 0,
    readyItemCount: 0,
    runningItemCount: 0,
    failedOrTerminalItemCount: 0,
    attemptedItemCount: 0,
    timestampedItemCount: 0,
    rollbackEvidenceCount: 0,
    errorEvidenceCount: 0,
    malformedDependencyCount: 0,
    duplicateExecutionItemKeyCount: 0,
    duplicatePlanItemKeyCount: 0,
    duplicateSequenceCount: 0,
  };
}

export function cloneDependencyProgressionSnapshot(
  snapshot: DeploymentActivationExecutionDependencyProgressionSnapshot,
): DeploymentActivationExecutionDependencyProgressionSnapshot {
  return {
    session: snapshot.session ? { ...snapshot.session } : null,
    items: snapshot.items.map(cloneDependencyProgressionItem),
    aggregate: { ...snapshot.aggregate },
  };
}

export function cloneDependencyProgressionItem(
  item: DeploymentActivationExecutionDependencyProgressionItemSnapshot,
): DeploymentActivationExecutionDependencyProgressionItemSnapshot {
  return {
    ...item,
    dependencyKeys: Array.isArray(item.dependencyKeys) ? [...item.dependencyKeys] : item.dependencyKeys,
    expectedCurrentState: item.expectedCurrentState
      ? cloneRecord(item.expectedCurrentState)
      : null,
    targetState: item.targetState ? cloneRecord(item.targetState) : null,
  };
}

export function cloneRecord(value: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}
export type DeploymentActivationExecutionAtomicDependencyProgressionStatus =
  | "progressed"
  | "already_progressed"
  | "blocked"
  | "conflict"
  | "not_found"
  | "error";

export interface DeploymentActivationExecutionAtomicDependencyProgressionCommand {
  clinicId: string;
  deploymentRunKey: string;
  sessionId: string;
  executionKey: string;
  claimantId: string;
  ownershipToken: string;
  expectedLeaseExpiresAt: string;
  completedItemId: string;
  completedExecutionItemKey: string;
  completedPlanItemKey: string;
  completedSequence: number;
  completedStartedAt: string;
  completedCompletedAt: string;
  completedAttemptCount: number;
  nextItemId: string;
  nextExecutionItemKey: string;
  nextPlanItemKey: string;
  nextSequence: number;
  nextEntityType: string;
  nextEntityId: string | null;
  nextAction: string;
  expectedNextStatus: "pending" | "ready";
  expectedNextAttemptCount: number;
  expectedDependencyKeys: readonly string[];
  progressedAt: string;
}

export interface DeploymentActivationExecutionAtomicDependencyProgressionResult {
  ok: boolean;
  status: DeploymentActivationExecutionAtomicDependencyProgressionStatus;
  clinicId: string | null;
  deploymentRunKey: string | null;
  sessionId: string | null;
  executionKey: string | null;
  completedItemId: string | null;
  completedExecutionItemKey: string | null;
  completedPlanItemKey: string | null;
  completedSequence: number | null;
  nextItemId: string | null;
  nextExecutionItemKey: string | null;
  nextPlanItemKey: string | null;
  nextSequence: number | null;
  nextEntityType: string | null;
  nextEntityId: string | null;
  nextAction: string | null;
  nextStatusBefore: string | null;
  nextStatusAfter: string | null;
  issueCode: string | null;
  message: string;
}
