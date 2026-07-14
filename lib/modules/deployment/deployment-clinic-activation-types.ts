export type DeploymentClinicActivationStatus =
  | "activation_ready"
  | "already_activated"
  | "blocked"
  | "conflict"
  | "not_found"
  | "error";

export type DeploymentClinicActivationIssueSeverity = "blocker" | "warning";

export type DeploymentClinicActivationIssueCode =
  | "missing_session"
  | "missing_item"
  | "missing_clinic"
  | "clinic_identity_mismatch"
  | "deployment_run_identity_mismatch"
  | "session_identity_mismatch"
  | "execution_key_mismatch"
  | "item_identity_mismatch"
  | "item_session_mismatch"
  | "item_entity_mismatch"
  | "ownership_shape_inconsistent"
  | "session_owned_by_another_executor"
  | "ownership_token_mismatch"
  | "lease_missing"
  | "lease_expired"
  | "lease_timestamp_malformed"
  | "claimant_invalid"
  | "ownership_token_invalid"
  | "assessment_timestamp_invalid"
  | "session_not_running"
  | "session_timestamp_missing"
  | "terminal_session_timestamp_present"
  | "item_not_running"
  | "item_attempt_invalid"
  | "item_timestamp_missing"
  | "item_terminal_evidence_present"
  | "item_error_present"
  | "item_dependency_present"
  | "item_expected_state_missing"
  | "item_target_state_missing"
  | "unsupported_target_state"
  | "clinic_archived_or_deleted"
  | "clinic_lifecycle_incompatible"
  | "clinic_provisioning_incompatible"
  | "clinic_deployment_ownership_mismatch"
  | "clinic_state_mismatch"
  | "clinic_already_active_conflict"
  | "activation_persistence_unimplemented"
  | "item_completion_unimplemented"
  | "dependency_progression_unimplemented"
  | "rollback_execution_unimplemented"
  | "repository_error";

export interface DeploymentClinicActivationCommand {
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
}

export interface DeploymentClinicActivationSessionSnapshot {
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
}

export interface DeploymentClinicActivationItemSnapshot {
  itemId: string;
  sessionId: string;
  executionItemKey: string;
  planItemKey: string;
  sequence: number;
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
  expectedCurrentState: Record<string, unknown> | null;
  targetState: Record<string, unknown> | null;
}

export interface DeploymentClinicActivationClinicSnapshot {
  id: string;
  clinicId?: string | null;
  deploymentRunId: string | null;
  deploymentStatus: string | null;
  deployedAt: string | null;
  active: boolean | null;
  provisioningSource: string | null;
  provisioningStatus: string | null;
  archivedAt: string | null;
  deletedAt: string | null;
  currentState: Record<string, unknown> | null;
}

export interface DeploymentClinicActivationSnapshot {
  session: DeploymentClinicActivationSessionSnapshot | null;
  item: DeploymentClinicActivationItemSnapshot | null;
  clinic: DeploymentClinicActivationClinicSnapshot | null;
}

export interface DeploymentClinicActivationIssue {
  code: DeploymentClinicActivationIssueCode;
  severity: DeploymentClinicActivationIssueSeverity;
  sessionId: string | null;
  executionKey: string | null;
  executionItemKey: string | null;
  planItemKey: string | null;
  message: string;
}

export interface DeploymentClinicActivationDownstreamCounts {
  clinicsActivated: 0;
  itemsSucceeded: 0;
  dependenciesUnlocked: 0;
  providersActivated: 0;
  sterilizersActivated: 0;
  workstationsActivated: 0;
  hardwareActivated: 0;
  bindingsWritten: 0;
  deploymentFinalized: 0;
}

export interface DeploymentClinicActivationResult {
  ok: boolean;
  status: DeploymentClinicActivationStatus;
  clinicId: string | null;
  deploymentRunId: string | null;
  sessionId: string | null;
  executionKey: string | null;
  itemId: string | null;
  executionItemKey: string | null;
  planItemKey: string | null;
  claimantId: string | null;
  leaseExpiresAt: string | null;
  currentClinicState: Record<string, unknown> | null;
  proposedClinicState: Record<string, unknown> | null;
  blockers: number;
  warnings: number;
  issues: readonly DeploymentClinicActivationIssue[];
  downstream: DeploymentClinicActivationDownstreamCounts;
  message: string;
}

export type DeploymentClinicActivationAtomicStatus =
  | "activated"
  | "already_activated"
  | "blocked"
  | "conflict"
  | "not_found"
  | "error";

export interface DeploymentClinicActivationAtomicCommand {
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
  expectedItemStartedAt: string;
  expectedAttemptCount: number;
  expectedCurrentState: Record<string, unknown>;
  targetState: Record<string, unknown>;
  proposedActivatedAt: string;
}

export interface DeploymentClinicActivationAtomicResult {
  ok: boolean;
  status: DeploymentClinicActivationAtomicStatus;
  clinicId: string | null;
  deploymentRunId: string | null;
  sessionId: string | null;
  executionKey: string | null;
  itemId: string | null;
  executionItemKey: string | null;
  planItemKey: string | null;
  clinicStateBefore: Record<string, unknown> | null;
  clinicStateAfter: Record<string, unknown> | null;
  activatedAt: string | null;
  issueCode: string | null;
  message: string;
}
export function cloneClinicActivationSnapshot(
  snapshot: DeploymentClinicActivationSnapshot,
): DeploymentClinicActivationSnapshot {
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
  };
}

export function cloneRecord(value: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}
