export type DeploymentActivationExecutorStatus =
  | "handled"
  | "already_applied"
  | "blocked"
  | "conflict"
  | "not_found"
  | "unsupported"
  | "error";

export type DeploymentActivationExecutorIssueSeverity = "blocker" | "warning";

export type DeploymentActivationExecutorIssueCode =
  | "invalid_claimant"
  | "invalid_execution_timestamp"
  | "item_not_running"
  | "attempt_count_invalid"
  | "started_at_missing"
  | "completion_evidence_present"
  | "rollback_evidence_present"
  | "item_error_evidence_present"
  | "unsupported_execution_handler"
  | "duplicate_execution_handler"
  | "handler_blocked"
  | "handler_conflict"
  | "handler_not_found"
  | "handler_error";

export interface DeploymentActivationExecutorItem {
  clinicId: string;
  deploymentRunKey: string;
  sessionId: string;
  executionKey: string;
  planKey: string;
  itemId: string;
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
  reversible: boolean;
  rollbackBehavior: string | null;
}

export interface DeploymentActivationExecutorContext {
  claimantId: string;
  ownershipToken: string;
  leaseExpiresAt: string | null;
  executedAt: string;
}

export interface DeploymentActivationExecutorDispatchKey {
  entityType: string;
  action: string;
  key: string;
}

export interface DeploymentActivationExecutorIssue {
  code: DeploymentActivationExecutorIssueCode;
  severity: DeploymentActivationExecutorIssueSeverity;
  message: string;
  dispatchKey: string | null;
  handlerId: string | null;
  sessionId: string | null;
  executionKey: string | null;
  executionItemKey: string | null;
  planItemKey: string | null;
  sequence: number | null;
  diagnostics?: Record<string, unknown> | null;
}

export interface DeploymentActivationExecutorDownstream {
  entitiesActivated: 0;
  itemsCompleted: 0;
  dependenciesProgressed: 0;
  itemsStarted: 0;
  bindingsWritten: 0;
  assignmentsFinalized: 0;
  sessionsCompleted: 0;
  deploymentsFinalized: 0;
  rollbacksExecuted: 0;
}

export interface DeploymentActivationExecutorHandlerResult {
  status: DeploymentActivationExecutorStatus;
  message: string;
  issues?: readonly DeploymentActivationExecutorIssue[];
  handlerEvidence?: Record<string, unknown> | null;
}

export interface DeploymentActivationExecutorResult {
  ok: boolean;
  status: DeploymentActivationExecutorStatus;
  message: string;
  dispatchKey: string;
  claimantId: string | null;
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
  deploymentKey: string | null;
  action: string | null;
  handlerId: string | null;
  handledCount: 0 | 1;
  reusedCount: 0 | 1;
  unsupportedCount: 0 | 1;
  conflicts: number;
  blockers: number;
  warnings: number;
  issues: readonly DeploymentActivationExecutorIssue[];
  handlerEvidence: Record<string, unknown> | null;
  downstream: DeploymentActivationExecutorDownstream;
}

export function createActivationExecutorDispatchKey(
  entityType: string,
  action: string,
): DeploymentActivationExecutorDispatchKey {
  const canonicalEntityType = canonicalizeDispatchPart(entityType);
  const canonicalAction = canonicalizeDispatchPart(action);

  return {
    entityType: canonicalEntityType,
    action: canonicalAction,
    key: `${canonicalEntityType}:${canonicalAction}`,
  };
}

export function zeroActivationExecutorDownstream(): DeploymentActivationExecutorDownstream {
  return {
    entitiesActivated: 0,
    itemsCompleted: 0,
    dependenciesProgressed: 0,
    itemsStarted: 0,
    bindingsWritten: 0,
    assignmentsFinalized: 0,
    sessionsCompleted: 0,
    deploymentsFinalized: 0,
    rollbacksExecuted: 0,
  };
}

export function cloneActivationExecutorItem(
  item: DeploymentActivationExecutorItem,
): DeploymentActivationExecutorItem {
  return {
    ...item,
    dependencyKeys: [...item.dependencyKeys],
    expectedCurrentState: item.expectedCurrentState ? cloneRecord(item.expectedCurrentState) : null,
    targetState: item.targetState ? cloneRecord(item.targetState) : null,
  };
}

export function cloneActivationExecutorContext(
  context: DeploymentActivationExecutorContext,
): DeploymentActivationExecutorContext {
  return { ...context };
}

function canonicalizeDispatchPart(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "");
}

function cloneRecord(value: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}
