export type DeploymentProviderShellActivationStatus =
  | "activatable"
  | "already_activated"
  | "blocked"
  | "conflict"
  | "not_found"
  | "error";

export type DeploymentProviderShellActivationIssueSeverity =
  | "blocker"
  | "warning";

export type DeploymentProviderShellActivationIssueCode =
  | "missing_session"
  | "missing_provider_shell"
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
  | "provider_clinic_mismatch"
  | "provider_identity_mismatch"
  | "provider_placeholder_invalid"
  | "provider_active_state_invalid"
  | "provider_provisioning_source_invalid"
  | "provider_provisioning_status_invalid"
  | "duplicate_provider_identity"
  | "duplicate_item_identity"
  | "non_contiguous_succeeded_prefix"
  | "succeeded_item_attempt_invalid"
  | "succeeded_item_timestamp_missing"
  | "succeeded_item_completion_before_start"
  | "succeeded_item_rollback_evidence_present"
  | "succeeded_item_error_present"
  | "later_item_drift"
  | "provider_shell_activation_persistence_unavailable"
  | "item_completion_unavailable"
  | "dependency_progression_unavailable"
  | "rollback_unavailable"
  | "repository_error";

export interface DeploymentProviderShellActivationCommand {
  clinicId: string;
  deploymentRunKey: string;
  sessionId: string;
  executionKey: string;
  claimantId: string;
  ownershipToken: string;
  now: string;
}

export interface DeploymentProviderShellActivationSessionSnapshot {
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

export interface DeploymentProviderShellActivationItemSnapshot {
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

export interface DeploymentProviderShellActivationProviderSnapshot {
  providerId: string;
  clinicId: string | null;
  deploymentProviderKey: string | null;
  displayName: string | null;
  title: string | null;
  active: boolean | null;
  placeholder: boolean | null;
  provisioningSource: string | null;
  provisioningStatus: string | null;
  archivedAt?: string | null;
  deletedAt?: string | null;
  currentState?: Record<string, unknown> | null;
}

export interface DeploymentProviderShellActivationAggregateSnapshot {
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
  providerCandidateCount: number;
  duplicateProviderIdentityCount: number;
}

export interface DeploymentProviderShellActivationSnapshot {
  session: DeploymentProviderShellActivationSessionSnapshot | null;
  items: readonly DeploymentProviderShellActivationItemSnapshot[];
  providerShell: DeploymentProviderShellActivationProviderSnapshot | null;
  aggregate: DeploymentProviderShellActivationAggregateSnapshot;
}

export interface DeploymentProviderShellActivationIssue {
  code: DeploymentProviderShellActivationIssueCode;
  severity: DeploymentProviderShellActivationIssueSeverity;
  message: string;
  sessionId: string | null;
  executionKey: string | null;
  executionItemKey: string | null;
  planItemKey: string | null;
  providerId: string | null;
  deploymentProviderKey: string | null;
  sequence: number | null;
  diagnostics?: DeploymentProviderShellActivationIssueDiagnostics | null;
}

export interface DeploymentProviderShellActivationIssueDiagnostics {
  layer?: string | null;
  rpcAttempted?: boolean | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  errorDetails?: string | null;
  errorHint?: string | null;
  exceptionType?: string | null;
  exceptionMessage?: string | null;
}

export interface DeploymentProviderShellActivationDownstreamCounts {
  providersActivated: 0;
  itemsCompleted: 0;
  dependenciesProgressed: 0;
  bindingsWritten: 0;
  sessionsCompleted: 0;
  rollbacksExecuted: 0;
  deploymentFinalized: 0;
}

export interface DeploymentProviderShellActivationResult {
  ok: boolean;
  status: DeploymentProviderShellActivationStatus;
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
  providerId: string | null;
  deploymentProviderKey: string | null;
  providerDisplayName: string | null;
  providerActive: boolean | null;
  providerProvisioningStatus: string | null;
  providerProvisioningSource: string | null;
  attemptCount: number;
  itemStartedAt: string | null;
  leaseExpiresAt: string | null;
  activatableCount: 0 | 1;
  reusedCount: 0 | 1;
  conflictCount: number;
  blockerCount: number;
  warningCount: number;
  issues: readonly DeploymentProviderShellActivationIssue[];
  downstream: DeploymentProviderShellActivationDownstreamCounts;
}

export function emptyProviderShellActivationAggregate(): DeploymentProviderShellActivationAggregateSnapshot {
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
    providerCandidateCount: 0,
    duplicateProviderIdentityCount: 0,
  };
}

export function cloneProviderShellActivationSnapshot(
  snapshot: DeploymentProviderShellActivationSnapshot,
): DeploymentProviderShellActivationSnapshot {
  return {
    session: snapshot.session ? { ...snapshot.session } : null,
    items: snapshot.items.map(cloneProviderShellActivationItem),
    providerShell: snapshot.providerShell ? { ...snapshot.providerShell } : null,
    aggregate: {
      ...snapshot.aggregate,
      succeededPlanItemKeys: [...snapshot.aggregate.succeededPlanItemKeys],
    },
  };
}

export function cloneProviderShellActivationItem(
  item: DeploymentProviderShellActivationItemSnapshot,
): DeploymentProviderShellActivationItemSnapshot {
  return {
    ...item,
    dependencyKeys: Array.isArray(item.dependencyKeys) ? [...item.dependencyKeys] : item.dependencyKeys,
    expectedCurrentState: item.expectedCurrentState ? cloneRecord(item.expectedCurrentState) : null,
    targetState: item.targetState ? cloneRecord(item.targetState) : null,
  };
}


export type DeploymentProviderShellActivationAtomicStatus =
  | "activated"
  | "already_activated"
  | "blocked"
  | "conflict"
  | "not_found"
  | "error";

export interface DeploymentProviderShellActivationAtomicCommand {
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
  expectedEntityType: "provider_shell";
  expectedEntityId: string;
  expectedAction: "activate";
  expectedItemStartedAt: string;
  expectedAttemptCount: number;
  providerId: string;
  expectedProviderKey: string;
  expectedCurrentState: Record<string, unknown>;
  targetState: Record<string, unknown>;
  proposedActivatedAt: string;
}

export interface DeploymentProviderShellActivationAtomicResult {
  ok: boolean;
  status: DeploymentProviderShellActivationAtomicStatus;
  clinicId: string | null;
  deploymentRunKey: string | null;
  sessionId: string | null;
  executionKey: string | null;
  itemId: string | null;
  executionItemKey: string | null;
  planItemKey: string | null;
  sequence: number | null;
  providerId: string | null;
  deploymentProviderKey: string | null;
  providerStateBefore: Record<string, unknown> | null;
  providerStateAfter: Record<string, unknown> | null;
  activatedAt: string | null;
  issueCode: string | null;
  message: string;
}
function cloneRecord(value: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}
