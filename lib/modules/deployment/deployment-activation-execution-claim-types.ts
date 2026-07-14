export type DeploymentActivationExecutionClaimStatus =
  | "claimable"
  | "already_owned"
  | "lease_expired_reclaimable"
  | "blocked"
  | "conflict"
  | "error";

export type DeploymentActivationExecutionClaimIssueSeverity =
  | "blocker"
  | "warning";

export type DeploymentActivationExecutionClaimIssueCode =
  | "missing_session"
  | "clinic_identity_mismatch"
  | "deployment_run_identity_mismatch"
  | "session_identity_mismatch"
  | "execution_key_mismatch"
  | "plan_key_mismatch"
  | "claimant_invalid"
  | "claim_timestamp_invalid"
  | "lease_duration_invalid"
  | "preparation_not_ready"
  | "execution_status_not_claimable"
  | "session_blockers_present"
  | "session_timestamp_present"
  | "ownership_shape_inconsistent"
  | "session_owned_by_another_executor"
  | "expired_lease_reclaimable"
  | "expired_lease_ambiguous"
  | "incomplete_item_set"
  | "duplicate_item_identity"
  | "invalid_item_lifecycle"
  | "attempt_evidence_present"
  | "execution_timestamp_present"
  | "rollback_timestamp_present"
  | "item_error_present"
  | "dependency_integrity_invalid"
  | "rollback_unimplemented"
  | "execution_mutation_unavailable"
  | "repository_error";

export interface DeploymentActivationExecutionClaimCommand {
  clinicId: string;
  deploymentRunId: string;
  sessionId: string;
  executionKey: string;
  planKey: string;
  claimantId: string;
  leaseDurationSeconds: number;
  claimRequestedAt: string;
  expectedItemCount: number;
  expectedExecutionStatus: "prepared";
}

export interface DeploymentActivationExecutionClaimSessionSnapshot {
  id: string;
  clinicId: string;
  deploymentRunRecordId: string;
  deploymentRunId: string;
  executionKey: string;
  planKey: string;
  preparationStatus: string;
  executionStatus: string;
  itemsRequested: number;
  itemsReady: number;
  itemsPending: number;
  itemsBlocked: number;
  blockers: number;
  executionOwner: string | null;
  ownershipToken: string | null;
  leaseExpiresAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  failedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface DeploymentActivationExecutionClaimItemCompletenessSnapshot {
  durableItemCount: number;
  duplicateExecutionItemKeyCount: number;
  duplicatePlanItemKeyCount: number;
  duplicateSequenceCount: number;
  invalidPreparedItemCount: number;
  runningOrTerminalItemCount: number;
  runningItemCount: number;
  terminalItemCount: number;
  runningItemsWithAttemptOne: number;
  runningItemsWithValidStartedAt: number;
  runningItemsWithCompletionEvidence: number;
  pendingItemsWithAttempts: number;
  pendingItemsWithExecutionTimestamps: number;
  pendingItemsWithRollbackTimestamps: number;
  pendingItemsWithErrors: number;
  itemsWithAttempts: number;
  itemsWithExecutionTimestamps: number;
  itemsWithRollbackTimestamps: number;
  itemsWithErrors: number;
  readyItemCount: number;
  pendingItemCount: number;
  blockedItemCount: number;
  firstExecutableSequence: number | null;
  firstExecutableStatus: "ready" | "pending" | "blocked" | "running" | "terminal" | null;
  readyRootItemCount: number;
  pendingExecutableWithoutSatisfiedDependencies: number;
  dependencyIntegrityIssueCount: number;
}

export interface DeploymentActivationExecutionClaimSnapshot {
  session: DeploymentActivationExecutionClaimSessionSnapshot | null;
  itemCompleteness: DeploymentActivationExecutionClaimItemCompletenessSnapshot;
}

export interface DeploymentActivationExecutionClaimIssue {
  code: DeploymentActivationExecutionClaimIssueCode;
  severity: DeploymentActivationExecutionClaimIssueSeverity;
  sessionId: string | null;
  executionKey: string | null;
  message: string;
}

export interface DeploymentActivationExecutionClaimDownstreamCounts {
  sessionsClaimed: 0;
  sessionsStarted: 0;
  itemsClaimed: 0;
  itemsStarted: 0;
  itemsSucceeded: 0;
  itemsFailed: 0;
  itemsRolledBack: 0;
  entitiesActivated: 0;
  bindingsWritten: 0;
  deploymentRunsFinalized: 0;
}

export interface DeploymentActivationExecutionClaimResult {
  ok: boolean;
  status: DeploymentActivationExecutionClaimStatus;
  sessionId: string | null;
  executionKey: string | null;
  claimantId: string | null;
  proposedOwnershipToken: string | null;
  proposedLeaseStartedAt: string | null;
  proposedLeaseExpiresAt: string | null;
  leaseDurationSeconds: number | null;
  existingOwner: string | null;
  existingLeaseExpiresAt: string | null;
  itemCompleteness: DeploymentActivationExecutionClaimItemCompletenessSnapshot;
  blockers: number;
  warnings: number;
  issues: readonly DeploymentActivationExecutionClaimIssue[];
  downstream: DeploymentActivationExecutionClaimDownstreamCounts;
  message: string;
}


export type DeploymentActivationExecutionAtomicClaimMode =
  | "fresh"
  | "same_owner"
  | "expired_reclaim";

export type DeploymentActivationExecutionAtomicClaimStatus =
  | "claimed"
  | "already_owned"
  | "reclaimed"
  | "blocked"
  | "conflict"
  | "not_found"
  | "error";

export interface DeploymentActivationExecutionAtomicClaimCommand {
  mode: DeploymentActivationExecutionAtomicClaimMode;
  clinicId: string;
  deploymentRunId: string;
  sessionId: string;
  executionKey: string;
  claimantId: string;
  proposedOwnershipToken: string;
  claimRequestedAt: string;
  proposedLeaseExpiresAt: string;
  expectedItemCount: number;
  expectedPreviousOwner?: string | null;
  expectedPreviousOwnershipToken?: string | null;
  expectedPreviousLeaseExpiresAt?: string | null;
}

export interface DeploymentActivationExecutionAtomicClaimResult {
  ok: boolean;
  status: DeploymentActivationExecutionAtomicClaimStatus;
  sessionId: string | null;
  executionKey: string | null;
  owner: string | null;
  ownershipToken: string | null;
  leaseExpiresAt: string | null;
  executionStatus: string | null;
  itemCount: number;
  issueCode: string | null;
  message: string;
}
export interface DeploymentActivationExecutionClaimTokenFactoryInput {
  sessionId: string;
  claimantId: string;
  claimRequestedAt: string;
}

export type DeploymentActivationExecutionClaimTokenFactory = (
  input: DeploymentActivationExecutionClaimTokenFactoryInput,
) => string;

export const MIN_EXECUTION_CLAIM_LEASE_SECONDS = 30;
export const MAX_EXECUTION_CLAIM_LEASE_SECONDS = 15 * 60;

export function emptyClaimItemCompleteness(): DeploymentActivationExecutionClaimItemCompletenessSnapshot {
  return {
    durableItemCount: 0,
    duplicateExecutionItemKeyCount: 0,
    duplicatePlanItemKeyCount: 0,
    duplicateSequenceCount: 0,
    invalidPreparedItemCount: 0,
    runningOrTerminalItemCount: 0,
    runningItemCount: 0,
    terminalItemCount: 0,
    runningItemsWithAttemptOne: 0,
    runningItemsWithValidStartedAt: 0,
    runningItemsWithCompletionEvidence: 0,
    pendingItemsWithAttempts: 0,
    pendingItemsWithExecutionTimestamps: 0,
    pendingItemsWithRollbackTimestamps: 0,
    pendingItemsWithErrors: 0,
    itemsWithAttempts: 0,
    itemsWithExecutionTimestamps: 0,
    itemsWithRollbackTimestamps: 0,
    itemsWithErrors: 0,
    readyItemCount: 0,
    pendingItemCount: 0,
    blockedItemCount: 0,
    firstExecutableSequence: null,
    firstExecutableStatus: null,
    readyRootItemCount: 0,
    pendingExecutableWithoutSatisfiedDependencies: 0,
    dependencyIntegrityIssueCount: 0,
  };
}

export function cloneClaimItemCompleteness(
  value: DeploymentActivationExecutionClaimItemCompletenessSnapshot,
): DeploymentActivationExecutionClaimItemCompletenessSnapshot {
  return { ...value };
}

export function cloneClaimSessionSnapshot(
  value: DeploymentActivationExecutionClaimSessionSnapshot,
): DeploymentActivationExecutionClaimSessionSnapshot {
  return { ...value };
}
