export type DeploymentHardwareShellActivationStatus =
  | "activatable"
  | "already_activated"
  | "blocked"
  | "conflict"
  | "not_found"
  | "error";

export type DeploymentHardwareShellActivationIssueSeverity =
  | "blocker"
  | "warning";

export type DeploymentHardwareShellActivationIssueCode =
  | "missing_session"
  | "missing_hardware_shell"
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
  | "hardware_clinic_mismatch"
  | "hardware_identity_mismatch"
  | "hardware_uuid_invalid"
  | "hardware_current_state_invalid"
  | "hardware_target_state_invalid"
  | "hardware_planned_invalid"
  | "hardware_active_state_invalid"
  | "hardware_provisioning_source_invalid"
  | "hardware_provisioning_status_invalid"
  | "duplicate_hardware_identity"
  | "duplicate_item_identity"
  | "non_contiguous_succeeded_prefix"
  | "succeeded_item_attempt_invalid"
  | "succeeded_item_timestamp_missing"
  | "succeeded_item_completion_before_start"
  | "succeeded_item_rollback_evidence_present"
  | "succeeded_item_error_present"
  | "later_item_drift"
  | "hardware_shell_activation_persistence_unavailable"
  | "item_completion_unavailable"
  | "dependency_progression_unavailable"
  | "rollback_unavailable"
  | "repository_error";

export interface DeploymentHardwareShellActivationCommand {
  clinicId: string;
  deploymentRunKey: string;
  sessionId: string;
  executionKey: string;
  claimantId: string;
  ownershipToken: string;
  now: string;
}

export interface DeploymentHardwareShellActivationSessionSnapshot {
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

export interface DeploymentHardwareShellActivationItemSnapshot {
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

export interface DeploymentHardwareShellActivationHardwareSnapshot {
  hardwareId: string;
  clinicId: string | null;
  deploymentHardwareKey: string | null;
  active: boolean | null;
  planned: boolean | null;
  provisioningSource: string | null;
  provisioningStatus: string | null;
  operationalStatus?: string | null;
  agentId?: string | null;
  defaultWorkstationId?: string | null;
  currentWorkstationId?: string | null;
  archivedAt?: string | null;
  deletedAt?: string | null;
  currentState?: Record<string, unknown> | null;
}

export interface DeploymentHardwareShellActivationAggregateSnapshot {
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
  hardwareCandidateCount: number;
  duplicateHardwareIdentityCount: number;
}

export interface DeploymentHardwareShellActivationSnapshot {
  session: DeploymentHardwareShellActivationSessionSnapshot | null;
  items: readonly DeploymentHardwareShellActivationItemSnapshot[];
  hardwareShell: DeploymentHardwareShellActivationHardwareSnapshot | null;
  hardwareLookup: DeploymentHardwareShellActivationHardwareLookupDiagnostics | null;
  aggregate: DeploymentHardwareShellActivationAggregateSnapshot;
}

export type DeploymentHardwareShellActivationHardwareLookupResult =
  | "not_attempted"
  | "zero_rows"
  | "multiple_rows"
  | "mapped";

export interface DeploymentHardwareShellActivationHardwareLookupDiagnostics {
  attempted: boolean;
  result: DeploymentHardwareShellActivationHardwareLookupResult;
  rowsReturned: number;
  deploymentHardwareKey: string | null;
  hardwareId: string | null;
}

export interface DeploymentHardwareShellActivationIssue {
  code: DeploymentHardwareShellActivationIssueCode;
  severity: DeploymentHardwareShellActivationIssueSeverity;
  message: string;
  sessionId: string | null;
  executionKey: string | null;
  executionItemKey: string | null;
  planItemKey: string | null;
  hardwareId: string | null;
  deploymentHardwareKey: string | null;
  sequence: number | null;
  diagnostics?: DeploymentHardwareShellActivationIssueDiagnostics | null;
}

export interface DeploymentHardwareShellActivationIssueDiagnostics {
  layer?: string | null;
  rpcAttempted?: boolean | null;
  hardwareLookupAttempted?: boolean | null;
  hardwareLookupResult?: DeploymentHardwareShellActivationHardwareLookupResult | null;
  hardwareLookupRowsReturned?: number | null;
  hardwareLookupDeploymentHardwareKey?: string | null;
  hardwareLookupHardwareId?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  errorDetails?: string | null;
  errorHint?: string | null;
  exceptionType?: string | null;
  exceptionMessage?: string | null;
}

export interface DeploymentHardwareShellActivationDownstreamCounts {
  hardwaresActivated: 0;
  itemsCompleted: 0;
  dependenciesProgressed: 0;
  bindingsWritten: 0;
  sessionsCompleted: 0;
  rollbacksExecuted: 0;
  deploymentFinalized: 0;
}

export interface DeploymentHardwareShellActivationResult {
  ok: boolean;
  status: DeploymentHardwareShellActivationStatus;
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
  hardwareId: string | null;
  deploymentHardwareKey: string | null;
  hardwareDisplayName: string | null;
  hardwareActive: boolean | null;
  hardwareProvisioningStatus: string | null;
  hardwareProvisioningSource: string | null;
  expectedCurrentState: Record<string, unknown> | null;
  attemptCount: number;
  itemStartedAt: string | null;
  leaseExpiresAt: string | null;
  activatableCount: 0 | 1;
  reusedCount: 0 | 1;
  conflictCount: number;
  blockerCount: number;
  warningCount: number;
  issues: readonly DeploymentHardwareShellActivationIssue[];
  downstream: DeploymentHardwareShellActivationDownstreamCounts;
}

export function emptyHardwareShellActivationAggregate(): DeploymentHardwareShellActivationAggregateSnapshot {
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
    hardwareCandidateCount: 0,
    duplicateHardwareIdentityCount: 0,
  };
}

export function cloneHardwareShellActivationSnapshot(
  snapshot: DeploymentHardwareShellActivationSnapshot,
): DeploymentHardwareShellActivationSnapshot {
  return {
    session: snapshot.session ? { ...snapshot.session } : null,
    items: snapshot.items.map(cloneHardwareShellActivationItem),
    hardwareShell: snapshot.hardwareShell ? { ...snapshot.hardwareShell } : null,
    hardwareLookup: snapshot.hardwareLookup ? { ...snapshot.hardwareLookup } : null,
    aggregate: {
      ...snapshot.aggregate,
      succeededPlanItemKeys: [...snapshot.aggregate.succeededPlanItemKeys],
    },
  };
}

export function cloneHardwareShellActivationItem(
  item: DeploymentHardwareShellActivationItemSnapshot,
): DeploymentHardwareShellActivationItemSnapshot {
  return {
    ...item,
    dependencyKeys: Array.isArray(item.dependencyKeys) ? [...item.dependencyKeys] : item.dependencyKeys,
    expectedCurrentState: item.expectedCurrentState ? cloneRecord(item.expectedCurrentState) : null,
    targetState: item.targetState ? cloneRecord(item.targetState) : null,
  };
}


export type DeploymentHardwareShellActivationAtomicStatus =
  | "activated"
  | "already_activated"
  | "blocked"
  | "conflict"
  | "not_found"
  | "error";

export interface DeploymentHardwareShellActivationAtomicCommand {
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
  expectedEntityType: "hardware_shell";
  expectedEntityId: string;
  expectedAction: "activate";
  expectedItemStartedAt: string;
  expectedAttemptCount: number;
  hardwareId: string;
  expectedHardwareKey: string;
  expectedCurrentState: Record<string, unknown>;
  targetState: Record<string, unknown>;
  proposedActivatedAt: string;
}

export interface DeploymentHardwareShellActivationAtomicResult {
  ok: boolean;
  status: DeploymentHardwareShellActivationAtomicStatus;
  clinicId: string | null;
  deploymentRunKey: string | null;
  sessionId: string | null;
  executionKey: string | null;
  itemId: string | null;
  executionItemKey: string | null;
  planItemKey: string | null;
  sequence: number | null;
  hardwareId: string | null;
  deploymentHardwareKey: string | null;
  hardwareStateBefore: Record<string, unknown> | null;
  hardwareStateAfter: Record<string, unknown> | null;
  activatedAt: string | null;
  issueCode: string | null;
  message: string;
}
function cloneRecord(value: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}
