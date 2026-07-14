export type DeploymentActivationExecutionItemStartStatus =
  | "startable"
  | "already_started"
  | "blocked"
  | "conflict"
  | "not_found"
  | "error";

export type DeploymentActivationExecutionItemStartIssueSeverity =
  | "blocker"
  | "warning";

export type DeploymentActivationExecutionItemStartIssueCode =
  | "missing_session"
  | "missing_candidate_item"
  | "clinic_identity_mismatch"
  | "deployment_run_identity_mismatch"
  | "session_identity_mismatch"
  | "execution_key_mismatch"
  | "claimant_invalid"
  | "ownership_token_invalid"
  | "assessment_timestamp_invalid"
  | "execution_status_not_running"
  | "session_timestamp_missing"
  | "terminal_timestamp_present"
  | "ownership_shape_inconsistent"
  | "session_owned_by_another_executor"
  | "ownership_token_mismatch"
  | "lease_missing"
  | "lease_expired"
  | "lease_timestamp_malformed"
  | "incomplete_item_set"
  | "invalid_item_lifecycle"
  | "multiple_ready_items"
  | "no_ready_item"
  | "multiple_running_items"
  | "attempt_evidence_present"
  | "execution_timestamp_present"
  | "rollback_evidence_present"
  | "item_error_present"
  | "duplicate_item_identity"
  | "dependency_integrity_invalid"
  | "candidate_identity_mismatch"
  | "candidate_sequence_mismatch"
  | "candidate_status_invalid"
  | "candidate_attempt_present"
  | "candidate_timestamp_present"
  | "candidate_error_present"
  | "item_start_persistence_unimplemented"
  | "activation_execution_unimplemented"
  | "dependency_progression_unimplemented"
  | "rollback_execution_unimplemented"
  | "repository_error";

export interface DeploymentActivationExecutionItemStartCommand {
  clinicId: string;
  deploymentRunId: string;
  sessionId: string;
  executionKey: string;
  claimantId: string;
  ownershipToken: string;
  assessmentTimestamp: string;
}

export interface DeploymentActivationExecutionItemStartSessionSnapshot {
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

export interface DeploymentActivationExecutionItemStartCandidateSnapshot {
  itemId: string;
  sessionId: string;
  executionItemKey: string;
  planItemKey: string;
  sequence: number;
  dependencyLevel: number;
  entityType: string;
  entityKey: string | null;
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
  reversible: boolean;
  rollbackAction: string | null;
  expectedCurrentState: Record<string, unknown>;
  targetState: Record<string, unknown>;
}

export interface DeploymentActivationExecutionItemStartAggregateSnapshot {
  totalItemCount: number;
  readyItemCount: number;
  pendingItemCount: number;
  runningItemCount: number;
  succeededItemCount: number;
  failedItemCount: number;
  blockedItemCount: number;
  attemptedItemCount: number;
  timestampedItemCount: number;
  rollbackEvidenceCount: number;
  errorEvidenceCount: number;
  duplicateExecutionItemKeyCount: number;
  duplicatePlanItemKeyCount: number;
  duplicateSequenceCount: number;
  malformedDependencyCount: number;
  readyRootCount: number;
  firstSequence: number | null;
  firstExecutionStatus: string | null;
  succeededPlanItemKeys: readonly string[];
}

export interface DeploymentActivationExecutionItemStartSnapshot {
  session: DeploymentActivationExecutionItemStartSessionSnapshot | null;
  candidateItem: DeploymentActivationExecutionItemStartCandidateSnapshot | null;
  aggregate: DeploymentActivationExecutionItemStartAggregateSnapshot;
}

export interface DeploymentActivationExecutionItemStartIssue {
  code: DeploymentActivationExecutionItemStartIssueCode;
  severity: DeploymentActivationExecutionItemStartIssueSeverity;
  sessionId: string | null;
  executionKey: string | null;
  executionItemKey: string | null;
  planItemKey: string | null;
  message: string;
}

export interface DeploymentActivationExecutionItemStartDownstreamCounts {
  itemsStarted: 0;
  itemsSucceeded: 0;
  entitiesActivated: 0;
  bindingsWritten: 0;
  deploymentFinalized: 0;
}

export interface DeploymentActivationExecutionItemStartResult {
  ok: boolean;
  status: DeploymentActivationExecutionItemStartStatus;
  sessionId: string | null;
  executionKey: string | null;
  claimantId: string | null;
  itemId: string | null;
  executionItemKey: string | null;
  planItemKey: string | null;
  sequence: number | null;
  entityType: string | null;
  entityKey: string | null;
  entityId: string | null;
  action: string | null;
  itemExecutionStatus: string | null;
  attemptCount: number;
  startedAt: string | null;
  leaseExpiresAt: string | null;
  dependencyCount: number;
  reversible: boolean | null;
  irreversible: boolean | null;
  blockers: number;
  warnings: number;
  issues: readonly DeploymentActivationExecutionItemStartIssue[];
  downstream: DeploymentActivationExecutionItemStartDownstreamCounts;
  message: string;
}

export function emptyItemStartAggregate(): DeploymentActivationExecutionItemStartAggregateSnapshot {
  return {
    totalItemCount: 0,
    readyItemCount: 0,
    pendingItemCount: 0,
    runningItemCount: 0,
    succeededItemCount: 0,
    failedItemCount: 0,
    blockedItemCount: 0,
    attemptedItemCount: 0,
    timestampedItemCount: 0,
    rollbackEvidenceCount: 0,
    errorEvidenceCount: 0,
    duplicateExecutionItemKeyCount: 0,
    duplicatePlanItemKeyCount: 0,
    duplicateSequenceCount: 0,
    malformedDependencyCount: 0,
    readyRootCount: 0,
    firstSequence: null,
    firstExecutionStatus: null,
    succeededPlanItemKeys: [],
  };
}

export function cloneItemStartAggregate(
  aggregate: DeploymentActivationExecutionItemStartAggregateSnapshot,
): DeploymentActivationExecutionItemStartAggregateSnapshot {
  return {
    ...aggregate,
    succeededPlanItemKeys: [...aggregate.succeededPlanItemKeys],
  };
}

export function cloneItemStartSession(
  session: DeploymentActivationExecutionItemStartSessionSnapshot,
): DeploymentActivationExecutionItemStartSessionSnapshot {
  return { ...session };
}

export function cloneItemStartCandidate(
  candidate: DeploymentActivationExecutionItemStartCandidateSnapshot,
): DeploymentActivationExecutionItemStartCandidateSnapshot {
  return {
    ...candidate,
    dependencyKeys: [...candidate.dependencyKeys],
    expectedCurrentState: cloneRecord(candidate.expectedCurrentState),
    targetState: cloneRecord(candidate.targetState),
  };
}

function cloneRecord(value: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}
export type DeploymentActivationExecutionAtomicItemStartStatus =
  | "started"
  | "already_started"
  | "blocked"
  | "conflict"
  | "not_found"
  | "error";

export interface DeploymentActivationExecutionAtomicItemStartCommand {
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
  expectedAction: string;
  expectedEntityType: string;
  expectedEntityKey: string | null;
  proposedStartedAt: string;
  expectedAttemptCount: number;
}

export interface DeploymentActivationExecutionAtomicItemStartResult {
  ok: boolean;
  status: DeploymentActivationExecutionAtomicItemStartStatus;
  sessionId: string | null;
  executionKey: string | null;
  itemId: string | null;
  executionItemKey: string | null;
  planItemKey: string | null;
  sequence: number | null;
  action: string | null;
  entityType: string | null;
  entityKey: string | null;
  executionStatus: string | null;
  attemptCount: number;
  startedAt: string | null;
  leaseExpiresAt: string | null;
  issueCode: string | null;
  message: string;
}