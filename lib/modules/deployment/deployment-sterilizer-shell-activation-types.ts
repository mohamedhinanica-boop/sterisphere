export type DeploymentSterilizerShellActivationStatus =
  | "activatable"
  | "already_activated"
  | "blocked"
  | "conflict"
  | "not_found"
  | "error";

export type DeploymentSterilizerShellActivationIssueSeverity =
  | "blocker"
  | "warning";

export type DeploymentSterilizerShellActivationIssueCode =
  | "missing_session"
  | "missing_sterilizer_shell"
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
  | "no_running_item"
  | "multiple_running_items"
  | "running_item_sequence_mismatch"
  | "running_item_status_invalid"
  | "running_item_attempt_invalid"
  | "running_item_started_at_missing"
  | "running_item_completion_evidence_present"
  | "running_item_rollback_evidence_present"
  | "running_item_error_present"
  | "running_item_entity_identity_missing"
  | "unsupported_running_item_lifecycle"
  | "sterilizer_clinic_mismatch"
  | "sterilizer_identity_mismatch"
  | "sterilizer_placeholder_invalid"
  | "sterilizer_active_state_invalid"
  | "sterilizer_provisioning_source_invalid"
  | "sterilizer_provisioning_status_invalid"
  | "duplicate_sterilizer_identity"
  | "duplicate_item_identity"
  | "non_contiguous_succeeded_prefix"
  | "succeeded_item_attempt_invalid"
  | "succeeded_item_timestamp_missing"
  | "succeeded_item_completion_before_start"
  | "succeeded_item_rollback_evidence_present"
  | "succeeded_item_error_present"
  | "later_item_drift"
  | "sterilizer_shell_activation_persistence_unavailable"
  | "item_completion_unavailable"
  | "dependency_progression_unavailable"
  | "rollback_unavailable"
  | "repository_error";

export interface DeploymentSterilizerShellActivationCommand {
  clinicId: string;
  deploymentRunKey: string;
  sessionId: string;
  executionKey: string;
  claimantId: string;
  ownershipToken: string;
  now: string;
}

export interface DeploymentSterilizerShellActivationSessionSnapshot {
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

export interface DeploymentSterilizerShellActivationItemSnapshot {
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
}

export interface DeploymentSterilizerShellActivationSterilizerSnapshot {
  sterilizerId: string;
  clinicId: string | null;
  deploymentSterilizerKey: string | null;
  active: boolean | null;
  placeholder: boolean | null;
  provisioningSource: string | null;
  provisioningStatus: string | null;
  archivedAt?: string | null;
  deletedAt?: string | null;
  currentState?: Record<string, unknown> | null;
}

export interface DeploymentSterilizerShellActivationAggregateSnapshot {
  totalItemCount: number;
  succeededItemCount: number;
  runningItemCount: number;
  pendingItemCount: number;
  readyItemCount: number;
  failedItemCount: number;
  duplicateExecutionItemKeyCount: number;
  duplicatePlanItemKeyCount: number;
  duplicateSequenceCount: number;
  succeededPlanItemKeys: readonly string[];
  succeededContiguousPrefixLength: number;
  laterPendingItemIntegrityIssueCount: number;
  sterilizerCandidateCount: number;
  duplicateSterilizerIdentityCount: number;
}

export interface DeploymentSterilizerShellActivationSnapshot {
  session: DeploymentSterilizerShellActivationSessionSnapshot | null;
  items: readonly DeploymentSterilizerShellActivationItemSnapshot[];
  sterilizerShell: DeploymentSterilizerShellActivationSterilizerSnapshot | null;
  sterilizerLookup: DeploymentSterilizerShellActivationSterilizerLookupDiagnostics | null;
  aggregate: DeploymentSterilizerShellActivationAggregateSnapshot;
}

export type DeploymentSterilizerShellActivationSterilizerLookupResult =
  | "not_attempted"
  | "zero_rows"
  | "multiple_rows"
  | "mapped";

export interface DeploymentSterilizerShellActivationSterilizerLookupDiagnostics {
  attempted: boolean;
  result: DeploymentSterilizerShellActivationSterilizerLookupResult;
  rowsReturned: number;
  deploymentSterilizerKey: string | null;
  sterilizerId: string | null;
}

export interface DeploymentSterilizerShellActivationIssue {
  code: DeploymentSterilizerShellActivationIssueCode;
  severity: DeploymentSterilizerShellActivationIssueSeverity;
  message: string;
  sessionId: string | null;
  executionKey: string | null;
  executionItemKey: string | null;
  planItemKey: string | null;
  sterilizerId: string | null;
  deploymentSterilizerKey: string | null;
  sequence: number | null;
  diagnostics?: DeploymentSterilizerShellActivationIssueDiagnostics | null;
}

export interface DeploymentSterilizerShellActivationIssueDiagnostics {
  layer?: string | null;
  rpcAttempted?: boolean | null;
  sterilizerLookupAttempted?: boolean | null;
  sterilizerLookupResult?: DeploymentSterilizerShellActivationSterilizerLookupResult | null;
  sterilizerLookupRowsReturned?: number | null;
  sterilizerLookupDeploymentSterilizerKey?: string | null;
  sterilizerLookupSterilizerId?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  errorDetails?: string | null;
  errorHint?: string | null;
  exceptionType?: string | null;
  exceptionMessage?: string | null;
}

export interface DeploymentSterilizerShellActivationDownstreamCounts {
  sterilizersActivated: 0;
  itemsCompleted: 0;
  dependenciesProgressed: 0;
  bindingsWritten: 0;
  sessionsCompleted: 0;
  rollbacksExecuted: 0;
  deploymentFinalized: 0;
}

export interface DeploymentSterilizerShellActivationResult {
  ok: boolean;
  status: DeploymentSterilizerShellActivationStatus;
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
  sterilizerId: string | null;
  deploymentSterilizerKey: string | null;
  sterilizerDisplayName: string | null;
  sterilizerActive: boolean | null;
  sterilizerProvisioningStatus: string | null;
  sterilizerProvisioningSource: string | null;
  attemptCount: number;
  itemStartedAt: string | null;
  leaseExpiresAt: string | null;
  activatableCount: 0 | 1;
  reusedCount: 0 | 1;
  conflictCount: number;
  blockerCount: number;
  warningCount: number;
  issues: readonly DeploymentSterilizerShellActivationIssue[];
  downstream: DeploymentSterilizerShellActivationDownstreamCounts;
}

export function emptySterilizerShellActivationAggregate(): DeploymentSterilizerShellActivationAggregateSnapshot {
  return {
    totalItemCount: 0,
    succeededItemCount: 0,
    runningItemCount: 0,
    pendingItemCount: 0,
    readyItemCount: 0,
    failedItemCount: 0,
    duplicateExecutionItemKeyCount: 0,
    duplicatePlanItemKeyCount: 0,
    duplicateSequenceCount: 0,
    succeededPlanItemKeys: [],
    succeededContiguousPrefixLength: 0,
    laterPendingItemIntegrityIssueCount: 0,
    sterilizerCandidateCount: 0,
    duplicateSterilizerIdentityCount: 0,
  };
}

export function cloneSterilizerShellActivationSnapshot(
  snapshot: DeploymentSterilizerShellActivationSnapshot,
): DeploymentSterilizerShellActivationSnapshot {
  return {
    session: snapshot.session ? { ...snapshot.session } : null,
    items: snapshot.items.map(cloneSterilizerShellActivationItem),
    sterilizerShell: snapshot.sterilizerShell ? { ...snapshot.sterilizerShell } : null,
    sterilizerLookup: snapshot.sterilizerLookup ? { ...snapshot.sterilizerLookup } : null,
    aggregate: {
      ...snapshot.aggregate,
      succeededPlanItemKeys: [...snapshot.aggregate.succeededPlanItemKeys],
    },
  };
}

export function cloneSterilizerShellActivationItem(
  item: DeploymentSterilizerShellActivationItemSnapshot,
): DeploymentSterilizerShellActivationItemSnapshot {
  return {
    ...item,
    dependencyKeys: Array.isArray(item.dependencyKeys) ? [...item.dependencyKeys] : item.dependencyKeys,
    expectedCurrentState: item.expectedCurrentState ? cloneRecord(item.expectedCurrentState) : null,
    targetState: item.targetState ? cloneRecord(item.targetState) : null,
  };
}


export type DeploymentSterilizerShellActivationAtomicStatus =
  | "activated"
  | "already_activated"
  | "blocked"
  | "conflict"
  | "not_found"
  | "error";

export interface DeploymentSterilizerShellActivationAtomicCommand {
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
  expectedEntityType: "sterilizer_shell";
  expectedEntityId: string;
  expectedAction: "activate";
  expectedItemStartedAt: string;
  expectedAttemptCount: number;
  sterilizerId: string;
  expectedSterilizerKey: string;
  expectedCurrentState: Record<string, unknown>;
  targetState: Record<string, unknown>;
  proposedActivatedAt: string;
}

export interface DeploymentSterilizerShellActivationAtomicResult {
  ok: boolean;
  status: DeploymentSterilizerShellActivationAtomicStatus;
  clinicId: string | null;
  deploymentRunKey: string | null;
  sessionId: string | null;
  executionKey: string | null;
  itemId: string | null;
  executionItemKey: string | null;
  planItemKey: string | null;
  sequence: number | null;
  sterilizerId: string | null;
  deploymentSterilizerKey: string | null;
  sterilizerStateBefore: Record<string, unknown> | null;
  sterilizerStateAfter: Record<string, unknown> | null;
  activatedAt: string | null;
  issueCode: string | null;
  message: string;
}
function cloneRecord(value: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}
