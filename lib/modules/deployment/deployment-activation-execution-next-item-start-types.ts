export type DeploymentActivationExecutionNextItemStartStatus =
  | "startable"
  | "already_started"
  | "blocked"
  | "conflict"
  | "not_found"
  | "error";

export type DeploymentActivationExecutionNextItemStartIssueSeverity =
  | "blocker"
  | "warning";

export type DeploymentActivationExecutionNextItemStartIssueCode =
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
  | "no_start_candidate"
  | "multiple_ready_items"
  | "multiple_running_items"
  | "ready_running_ambiguity"
  | "non_contiguous_succeeded_prefix"
  | "succeeded_item_attempt_invalid"
  | "succeeded_item_timestamp_missing"
  | "succeeded_item_completion_before_start"
  | "succeeded_item_rollback_evidence_present"
  | "succeeded_item_error_present"
  | "candidate_sequence_mismatch"
  | "candidate_status_invalid"
  | "candidate_attempt_invalid"
  | "candidate_started_at_missing"
  | "candidate_timestamp_evidence_present"
  | "candidate_completion_evidence_present"
  | "candidate_rollback_evidence_present"
  | "candidate_error_evidence_present"
  | "dependency_keys_malformed"
  | "dependency_item_missing"
  | "dependency_not_succeeded"
  | "dependency_on_later_item"
  | "dependency_self_reference"
  | "duplicate_dependency_key"
  | "duplicate_item_identity"
  | "later_item_drift"
  | "candidate_entity_identity_missing"
  | "unsupported_entity_action_lifecycle"
  | "atomic_next_item_start_persistence_unavailable"
  | "entity_activation_unavailable"
  | "rollback_unavailable"
  | "repository_error";

export interface DeploymentActivationExecutionNextItemStartCommand {
  clinicId: string;
  deploymentRunKey: string;
  sessionId: string;
  executionKey: string;
  claimantId: string;
  ownershipToken: string;
  now: string;
}

export interface DeploymentActivationExecutionNextItemStartSessionSnapshot {
  clinicId: string;
  deploymentRunKey: string;
  sessionId: string;
  executionKey: string;
  planKey: string;
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

export interface DeploymentActivationExecutionNextItemStartItemSnapshot {
  itemId: string;
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

export interface DeploymentActivationExecutionNextItemStartAggregateSnapshot {
  totalItemCount: number;
  succeededItemCount: number;
  readyItemCount: number;
  runningItemCount: number;
  pendingItemCount: number;
  failedItemCount: number;
  attemptedItemCount: number;
  timestampedItemCount: number;
  rolledBackItemCount: number;
  errorItemCount: number;
  duplicateExecutionItemKeyCount: number;
  duplicatePlanItemKeyCount: number;
  duplicateSequenceCount: number;
  succeededPlanItemKeys: readonly string[];
  succeededContiguousPrefixLength: number;
  readyItemCandidateCount: number;
  laterPendingItemIntegrityIssueCount: number;
}

export interface DeploymentActivationExecutionNextItemStartSnapshot {
  session: DeploymentActivationExecutionNextItemStartSessionSnapshot | null;
  items: readonly DeploymentActivationExecutionNextItemStartItemSnapshot[];
  aggregate: DeploymentActivationExecutionNextItemStartAggregateSnapshot;
}

export interface DeploymentActivationExecutionNextItemStartIssue {
  code: DeploymentActivationExecutionNextItemStartIssueCode;
  severity: DeploymentActivationExecutionNextItemStartIssueSeverity;
  message: string;
  sessionId: string | null;
  executionKey: string | null;
  executionItemKey: string | null;
  planItemKey: string | null;
  entityType: string | null;
  entityId: string | null;
  sequence: number | null;
  lifecycleDispatch?: {
    runtimeEntityType: string;
    runtimeAction: string;
    selectedBranch: "generic_activate" | "hardware_binding_bind" | "hardware_assignment_finalize" | "unsupported";
    hardwareBindingBranchReached: boolean;
    supported: boolean;
    expectedState: Record<string, unknown> | null;
    targetState: Record<string, unknown> | null;
    expectedCurrentStateKeys: readonly string[];
    targetStateKeys: readonly string[];
    authoritativeExpectedState: Record<string, unknown> | null;
    authoritativeTargetState: Record<string, unknown>;
    crossStateConsistency: {
      entityIdMatchesHardwareId: boolean;
      hardwareIdMatches: boolean;
      targetIdMatches: boolean;
      targetTypeMatches: boolean;
      targetDeploymentKeyMatches: boolean;
    };
    rejectionReasons: readonly string[];
  } | null;
}

export interface DeploymentActivationExecutionNextItemStartDownstreamCounts {
  itemsStarted: 0;
  itemsSucceeded: 0;
  entitiesActivated: 0;
  bindingsWritten: 0;
  itemsCompleted: 0;
  dependenciesProgressed: 0;
  finalized: 0;
}

export interface DeploymentActivationExecutionNextItemStartResult {
  ok: boolean;
  status: DeploymentActivationExecutionNextItemStartStatus;
  message: string;
  claimantId: string | null;
  clinicId: string | null;
  deploymentRunKey: string | null;
  sessionId: string | null;
  executionKey: string | null;
  planKey: string | null;
  itemId: string | null;
  executionItemKey: string | null;
  planItemKey: string | null;
  sequence: number | null;
  entityType: string | null;
  entityId: string | null;
  action: string | null;
  lifecycleEvidence: {
    lifecycle: "hardware_binding:bind" | "hardware_assignment:finalize";
    expectedStateFields: readonly string[];
    targetState: Record<string, unknown>;
  } | null;
  dependencyKeys: readonly string[];
  attemptCount: number;
  itemStartedAt: string | null;
  leaseExpiresAt: string | null;
  startableCount: 0 | 1;
  reusedCount: 0 | 1;
  conflictCount: number;
  blockerCount: number;
  warningCount: number;
  issues: readonly DeploymentActivationExecutionNextItemStartIssue[];
  downstream: DeploymentActivationExecutionNextItemStartDownstreamCounts;
}

export function emptyNextItemStartAggregate(): DeploymentActivationExecutionNextItemStartAggregateSnapshot {
  return {
    totalItemCount: 0,
    succeededItemCount: 0,
    readyItemCount: 0,
    runningItemCount: 0,
    pendingItemCount: 0,
    failedItemCount: 0,
    attemptedItemCount: 0,
    timestampedItemCount: 0,
    rolledBackItemCount: 0,
    errorItemCount: 0,
    duplicateExecutionItemKeyCount: 0,
    duplicatePlanItemKeyCount: 0,
    duplicateSequenceCount: 0,
    succeededPlanItemKeys: [],
    succeededContiguousPrefixLength: 0,
    readyItemCandidateCount: 0,
    laterPendingItemIntegrityIssueCount: 0,
  };
}

export function cloneNextItemStartSnapshot(
  snapshot: DeploymentActivationExecutionNextItemStartSnapshot,
): DeploymentActivationExecutionNextItemStartSnapshot {
  return {
    session: snapshot.session ? { ...snapshot.session } : null,
    items: snapshot.items.map(cloneNextItemStartItem),
    aggregate: {
      ...snapshot.aggregate,
      succeededPlanItemKeys: [...snapshot.aggregate.succeededPlanItemKeys],
    },
  };
}

export function cloneNextItemStartItem(
  item: DeploymentActivationExecutionNextItemStartItemSnapshot,
): DeploymentActivationExecutionNextItemStartItemSnapshot {
  return {
    ...item,
    dependencyKeys: Array.isArray(item.dependencyKeys) ? [...item.dependencyKeys] : item.dependencyKeys,
    expectedCurrentState: item.expectedCurrentState ? cloneRecord(item.expectedCurrentState) : null,
    targetState: item.targetState ? cloneRecord(item.targetState) : null,
  };
}

function cloneRecord(value: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}
export type DeploymentActivationExecutionAtomicNextItemStartStatus =
  | "started"
  | "already_started"
  | "blocked"
  | "conflict"
  | "not_found"
  | "error";

export interface DeploymentActivationExecutionAtomicNextItemStartCommand {
  clinicId: string;
  deploymentRunKey: string;
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
  expectedEntityId: string | null;
  expectedAction: string;
  expectedAttemptCount: number;
  expectedDependencyKeys: readonly string[];
  proposedStartedAt: string;
}

export interface DeploymentActivationExecutionAtomicNextItemStartResult {
  ok: boolean;
  status: DeploymentActivationExecutionAtomicNextItemStartStatus;
  clinicId: string | null;
  deploymentRunKey: string | null;
  sessionId: string | null;
  executionKey: string | null;
  itemId: string | null;
  executionItemKey: string | null;
  planItemKey: string | null;
  sequence: number | null;
  entityType: string | null;
  entityId: string | null;
  action: string | null;
  attemptCount: number;
  startedAt: string | null;
  leaseExpiresAt: string | null;
  issueCode: string | null;
  message: string;
}
