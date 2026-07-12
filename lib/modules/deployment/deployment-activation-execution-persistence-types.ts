import type {
  DeploymentActivationExecutionItem,
  DeploymentActivationExecutionResult,
  DeploymentActivationExecutionRollbackBoundary,
} from "./deployment-activation-execution-types";
import type {
  DeploymentActivationPlanAction,
  DeploymentActivationPlanEntityType,
} from "./deployment-activation-plan-types";

export type DeploymentActivationExecutionPersistenceStatus =
  | "created"
  | "reused"
  | "conflict"
  | "blocked"
  | "error";

export type DeploymentActivationExecutionPersistedSessionStatus =
  | "prepared"
  | "claimed"
  | "running"
  | "partially_completed"
  | "completed"
  | "failed"
  | "rollback_required"
  | "rolling_back"
  | "rolled_back"
  | "cancelled";

export type DeploymentActivationExecutionPersistedItemStatus =
  | "ready"
  | "pending"
  | "running"
  | "succeeded"
  | "failed"
  | "rolled_back";

export type DeploymentActivationExecutionRollbackStatus =
  | "not_started"
  | "not_supported"
  | "pending"
  | "completed"
  | "failed";

export type DeploymentActivationExecutionPersistenceIssueCode =
  | "preparation_not_ready"
  | "execution_identity_missing"
  | "plan_identity_missing"
  | "clinic_identity_missing"
  | "deployment_run_identity_missing"
  | "item_count_mismatch"
  | "duplicate_execution_item_key"
  | "duplicate_plan_item_key"
  | "duplicate_sequence"
  | "item_identity_mismatch"
  | "unsupported_item_status"
  | "unsupported_action"
  | "attempt_count_not_zero"
  | "execution_timestamp_present"
  | "rollback_boundary_invalid"
  | "session_identity_conflict"
  | "session_state_conflict"
  | "item_identity_conflict"
  | "item_state_conflict"
  | "immutable_evidence_conflict"
  | "repository_error";

export interface DeploymentActivationExecutionPersistenceIssue {
  code: DeploymentActivationExecutionPersistenceIssueCode;
  severity: "blocker" | "warning";
  executionKey: string | null;
  planItemKey: string | null;
  executionItemKey: string | null;
  message: string;
}

export interface DeploymentActivationExecutionPersistenceCommand {
  preparation: DeploymentActivationExecutionResult;
  payloadHash?: string | null;
  preparationEvidence?: Record<string, unknown>;
  executionMetadata?: Record<string, unknown>;
  createdAt?: string | null;
}

export interface CreateDeploymentActivationExecutionSessionPayload {
  clinicId: string;
  deploymentRunId: string;
  executionKey: string;
  planKey: string;
  payloadHash: string | null;
  preparationStatus: "ready";
  executionStatus: "prepared";
  executionOwner: string | null;
  ownershipToken: string | null;
  leaseExpiresAt: string | null;
  itemsRequested: number;
  itemsReady: number;
  itemsPending: number;
  itemsBlocked: number;
  reversibleItems: number;
  irreversibleItems: number;
  blockers: number;
  warnings: number;
  rollbackBoundary: DeploymentActivationExecutionRollbackBoundary;
  preparationEvidence: Record<string, unknown>;
  executionMetadata: Record<string, unknown>;
  startedAt: string | null;
  completedAt: string | null;
  failedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface DeploymentActivationExecutionSessionRecord
  extends CreateDeploymentActivationExecutionSessionPayload {
  id: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateDeploymentActivationExecutionItemPayload {
  sessionId: string;
  clinicId: string;
  deploymentRunId: string;
  executionKey: string;
  executionItemKey: string;
  planItemKey: string;
  sequence: number;
  dependencyLevel: number;
  entityType: DeploymentActivationPlanEntityType;
  entityId: string | null;
  deploymentKey: string | null;
  action: DeploymentActivationPlanAction;
  expectedCurrentState: Record<string, unknown>;
  targetState: Record<string, unknown>;
  dependencyKeys: readonly string[];
  executionStatus: "ready" | "pending";
  attemptCount: 0;
  reversible: boolean;
  rollbackAction: string | null;
  rollbackStatus: DeploymentActivationExecutionRollbackStatus;
  errorCode: string | null;
  errorMessage: string | null;
  executionEvidence: Record<string, unknown>;
  startedAt: string | null;
  completedAt: string | null;
  rolledBackAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface DeploymentActivationExecutionItemRecord
  extends CreateDeploymentActivationExecutionItemPayload {
  id: string;
  createdAt: string;
  updatedAt: string;
}

export interface DeploymentActivationExecutionPersistenceDownstreamCounts {
  itemsClaimed: 0;
  itemsStarted: 0;
  itemsSucceeded: 0;
  itemsFailed: 0;
  itemsRolledBack: 0;
  sessionsCompleted: 0;
  sessionsFailed: 0;
  bindingsWritten: 0;
  entitiesActivated: 0;
  deploymentRunsFinalized: 0;
}

export interface DeploymentActivationExecutionPersistenceResult {
  ok: boolean;
  status: DeploymentActivationExecutionPersistenceStatus;
  sessionId: string | null;
  executionKey: string | null;
  planKey: string | null;
  sessionCreated: 0 | 1;
  sessionReused: 0 | 1;
  itemsRequested: number;
  itemsCreated: number;
  itemsReused: number;
  itemsConflicted: number;
  blockers: number;
  warnings: number;
  issues: readonly DeploymentActivationExecutionPersistenceIssue[];
  downstream: DeploymentActivationExecutionPersistenceDownstreamCounts;
  message: string;
}

export function buildSessionPayloadFromPreparation(
  command: DeploymentActivationExecutionPersistenceCommand,
): CreateDeploymentActivationExecutionSessionPayload | null {
  const preparation = command.preparation;

  if (
    preparation.status !== "ready" ||
    !preparation.executionKey ||
    !preparation.planKey ||
    !preparation.clinicId ||
    !preparation.deploymentRunId
  ) {
    return null;
  }

  return {
    clinicId: preparation.clinicId,
    deploymentRunId: preparation.deploymentRunId,
    executionKey: preparation.executionKey,
    planKey: preparation.planKey,
    payloadHash: command.payloadHash ?? null,
    preparationStatus: "ready",
    executionStatus: "prepared",
    executionOwner: null,
    ownershipToken: null,
    leaseExpiresAt: null,
    itemsRequested: preparation.itemsRequested,
    itemsReady: preparation.itemsReady,
    itemsPending: preparation.itemsPending,
    itemsBlocked: preparation.itemsBlocked,
    reversibleItems: preparation.reversibleItems,
    irreversibleItems: preparation.irreversibleItems,
    blockers: preparation.blockers,
    warnings: preparation.warnings,
    rollbackBoundary: cloneRollbackBoundary(preparation.rollbackBoundary),
    preparationEvidence: cloneRecord(command.preparationEvidence ?? {
      status: preparation.status,
      executionKey: preparation.executionKey,
      planKey: preparation.planKey,
      itemsRequested: preparation.itemsRequested,
      itemsReady: preparation.itemsReady,
      itemsPending: preparation.itemsPending,
      itemsBlocked: preparation.itemsBlocked,
      blockers: preparation.blockers,
      warnings: preparation.warnings,
    }),
    executionMetadata: cloneRecord(command.executionMetadata ?? {}),
    startedAt: null,
    completedAt: null,
    failedAt: null,
    createdAt: command.createdAt ?? null,
    updatedAt: command.createdAt ?? null,
  };
}

export function buildItemPayloadFromPreparationItem(input: {
  sessionId: string;
  clinicId: string;
  deploymentRunId: string;
  executionKey: string;
  item: DeploymentActivationExecutionItem;
  createdAt?: string | null;
}): CreateDeploymentActivationExecutionItemPayload {
  return {
    sessionId: input.sessionId,
    clinicId: input.clinicId,
    deploymentRunId: input.deploymentRunId,
    executionKey: input.executionKey,
    executionItemKey: input.item.executionItemKey,
    planItemKey: input.item.planItemKey,
    sequence: input.item.sequence,
    dependencyLevel: input.item.evidence.dependencyLevel,
    entityType: input.item.entityType,
    entityId: input.item.entityId,
    deploymentKey: input.item.deploymentKey,
    action: input.item.action,
    expectedCurrentState: cloneRecord(input.item.currentState),
    targetState: cloneRecord(input.item.targetState),
    dependencyKeys: [...input.item.dependencyKeys],
    executionStatus: input.item.executionStatus === "ready" ? "ready" : "pending",
    attemptCount: 0,
    reversible: input.item.reversible,
    rollbackAction: input.item.rollbackAction,
    rollbackStatus: input.item.rollbackAction ? "not_started" : "not_supported",
    errorCode: null,
    errorMessage: null,
    executionEvidence: cloneRecord(input.item.evidence as unknown as Record<string, unknown>),
    startedAt: null,
    completedAt: null,
    rolledBackAt: null,
    createdAt: input.createdAt ?? null,
    updatedAt: input.createdAt ?? null,
  };
}

export function cloneRollbackBoundary(
  boundary: DeploymentActivationExecutionRollbackBoundary,
): DeploymentActivationExecutionRollbackBoundary {
  return {
    lastReversibleSequence: boundary.lastReversibleSequence,
    firstIrreversibleSequence: boundary.firstIrreversibleSequence,
    rollbackSupportedItemKeys: [...boundary.rollbackSupportedItemKeys],
    rollbackUnsupportedItemKeys: [...boundary.rollbackUnsupportedItemKeys],
    wouldCrossIrreversibleBoundary: boundary.wouldCrossIrreversibleBoundary,
  };
}

export function cloneRecord(value: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}
