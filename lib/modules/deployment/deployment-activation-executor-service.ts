import type {
  DeploymentActivationExecutorContext,
  DeploymentActivationExecutorHandlerResult,
  DeploymentActivationExecutorIssue,
  DeploymentActivationExecutorIssueCode,
  DeploymentActivationExecutorIssueSeverity,
  DeploymentActivationExecutorItem,
  DeploymentActivationExecutorResult,
  DeploymentActivationExecutorStatus,
} from "./deployment-activation-executor-types";
import {
  cloneActivationExecutorContext,
  cloneActivationExecutorItem,
  createActivationExecutorDispatchKey,
  zeroActivationExecutorDownstream,
} from "./deployment-activation-executor-types";
import type {
  DeploymentActivationExecutorHandler,
} from "./deployment-activation-executor-handler";
import type {
  DeploymentActivationExecutorRegistry,
} from "./deployment-activation-executor-registry";

export class DeploymentActivationExecutorService {
  constructor(
    private readonly registry: DeploymentActivationExecutorRegistry,
  ) {}

  async dispatch(input: {
    item: DeploymentActivationExecutorItem;
    context: DeploymentActivationExecutorContext;
  }): Promise<DeploymentActivationExecutorResult> {
    const item = cloneActivationExecutorItem(input.item);
    const context = cloneActivationExecutorContext(input.context);
    const dispatchKey = createActivationExecutorDispatchKey(item.entityType, item.action).key;
    const lifecycleIssues = [
      ...validateContext(context, item, dispatchKey),
      ...validateRunningItem(item, dispatchKey),
    ];

    if (hasBlocker(lifecycleIssues)) {
      return buildResult({
        status: statusForIssues(lifecycleIssues),
        item,
        context,
        dispatchKey,
        handlerId: null,
        issues: lifecycleIssues,
        message: "Activation executor blocked before handler dispatch because running item evidence is not safe.",
      });
    }

    const handler = this.registry.resolve(item.entityType, item.action);

    if (!handler) {
      return buildResult({
        status: "unsupported",
        item,
        context,
        dispatchKey,
        handlerId: null,
        issues: [issue("unsupported_execution_handler", "blocker", "No activation executor handler is registered for this entity/action pair.", item, dispatchKey, null)],
        message: "Activation executor found no registered handler for the running execution item.",
      });
    }

    try {
      const handlerResult = await handler.handle({
        context: Object.freeze({ ...context }),
        item: Object.freeze(cloneActivationExecutorItem(item)),
      });

      return buildResult({
        status: handlerResult.status,
        item,
        context,
        dispatchKey,
        handlerId: handler.handlerId,
        issues: normalizeHandlerIssues(handlerResult, item, dispatchKey, handler.handlerId, context.ownershipToken),
        message: redactToken(handlerResult.message, context.ownershipToken),
      });
    } catch (caught) {
      const rawMessage = caught instanceof Error ? caught.message : "Activation executor handler failed safely.";
      return buildResult({
        status: "error",
        item,
        context,
        dispatchKey,
        handlerId: handler.handlerId,
        issues: [issue("handler_error", "blocker", redactToken(rawMessage, context.ownershipToken), item, dispatchKey, handler.handlerId)],
        message: "Activation executor handler failed safely. No mutation was performed.",
      });
    }
  }
}

export function createDeploymentActivationExecutorService(
  registry: DeploymentActivationExecutorRegistry,
): DeploymentActivationExecutorService {
  return new DeploymentActivationExecutorService(registry);
}

function validateContext(
  context: DeploymentActivationExecutorContext,
  item: DeploymentActivationExecutorItem,
  dispatchKey: string,
): DeploymentActivationExecutorIssue[] {
  const issues: DeploymentActivationExecutorIssue[] = [];

  if (!context.claimantId.trim()) {
    issues.push(issue("invalid_claimant", "blocker", "Claimant id is required for activation executor dispatch.", item, dispatchKey, null));
  }

  if (!Number.isFinite(Date.parse(context.executedAt))) {
    issues.push(issue("invalid_execution_timestamp", "blocker", "Activation executor timestamp must be valid.", item, dispatchKey, null));
  }

  return issues;
}

function validateRunningItem(
  item: DeploymentActivationExecutorItem,
  dispatchKey: string,
): DeploymentActivationExecutorIssue[] {
  const issues: DeploymentActivationExecutorIssue[] = [];

  if (item.executionStatus !== "running") {
    issues.push(issue("item_not_running", "blocker", "Activation executor requires a currently running execution item.", item, dispatchKey, null));
  }

  if (item.attemptCount !== 1) {
    issues.push(issue("attempt_count_invalid", "blocker", "Activation executor requires exactly one running item attempt.", item, dispatchKey, null));
  }

  if (!item.startedAt || !Number.isFinite(Date.parse(item.startedAt))) {
    issues.push(issue("started_at_missing", "blocker", "Activation executor requires valid started_at evidence.", item, dispatchKey, null));
  }

  if (item.completedAt !== null) {
    issues.push(issue("completion_evidence_present", "blocker", "Activation executor cannot handle an already completed item.", item, dispatchKey, null));
  }

  if (item.rolledBackAt !== null) {
    issues.push(issue("rollback_evidence_present", "blocker", "Activation executor cannot handle an item with rollback evidence.", item, dispatchKey, null));
  }

  if (item.errorCode !== null || item.errorMessage !== null) {
    issues.push(issue("item_error_evidence_present", "blocker", "Activation executor cannot handle an item with error evidence.", item, dispatchKey, null));
  }

  return issues;
}

function normalizeHandlerIssues(
  handlerResult: DeploymentActivationExecutorHandlerResult,
  item: DeploymentActivationExecutorItem,
  dispatchKey: string,
  handlerId: string,
  ownershipToken: string,
): DeploymentActivationExecutorIssue[] {
  const provided = handlerResult.issues ?? [];
  const defaultCode = defaultIssueCodeForStatus(handlerResult.status);
  const issues = provided.length > 0
    ? provided.map((current) => ({
        ...current,
        message: redactToken(current.message, ownershipToken),
        dispatchKey: current.dispatchKey ?? dispatchKey,
        handlerId: current.handlerId ?? handlerId,
      }))
    : defaultCode
      ? [issue(defaultCode, "blocker", redactToken(handlerResult.message, ownershipToken), item, dispatchKey, handlerId)]
      : [];

  return issues.sort(compareIssues);
}

function defaultIssueCodeForStatus(
  status: DeploymentActivationExecutorStatus,
): DeploymentActivationExecutorIssueCode | null {
  switch (status) {
    case "blocked":
      return "handler_blocked";
    case "conflict":
      return "handler_conflict";
    case "not_found":
      return "handler_not_found";
    case "error":
      return "handler_error";
    case "unsupported":
      return "unsupported_execution_handler";
    default:
      return null;
  }
}

function buildResult(input: {
  status: DeploymentActivationExecutorStatus;
  item: DeploymentActivationExecutorItem;
  context: DeploymentActivationExecutorContext;
  dispatchKey: string;
  handlerId: string | null;
  issues: readonly DeploymentActivationExecutorIssue[];
  message: string;
}): DeploymentActivationExecutorResult {
  const issues = [...input.issues].sort(compareIssues);

  return {
    ok: input.status === "handled" || input.status === "already_applied",
    status: input.status,
    message: redactToken(input.message, input.context.ownershipToken),
    dispatchKey: input.dispatchKey,
    claimantId: input.context.claimantId || null,
    clinicId: input.item.clinicId,
    deploymentRunId: input.item.deploymentRunId,
    sessionId: input.item.sessionId,
    executionKey: input.item.executionKey,
    itemId: input.item.itemId,
    executionItemKey: input.item.executionItemKey,
    planItemKey: input.item.planItemKey,
    sequence: input.item.sequence,
    entityType: input.item.entityType,
    entityId: input.item.entityId,
    deploymentKey: input.item.deploymentKey,
    action: input.item.action,
    handlerId: input.handlerId,
    handledCount: input.status === "handled" ? 1 : 0,
    reusedCount: input.status === "already_applied" ? 1 : 0,
    unsupportedCount: input.status === "unsupported" ? 1 : 0,
    conflicts: input.status === "conflict" ? Math.max(1, issues.filter((current) => current.severity === "blocker").length) : 0,
    blockers: issues.filter((current) => current.severity === "blocker").length,
    warnings: issues.filter((current) => current.severity === "warning").length,
    issues,
    downstream: zeroActivationExecutorDownstream(),
  };
}

function statusForIssues(
  issues: readonly DeploymentActivationExecutorIssue[],
): DeploymentActivationExecutorStatus {
  return issues.some((current) => current.code === "item_not_running") ? "conflict" : "blocked";
}

function issue(
  code: DeploymentActivationExecutorIssueCode,
  severity: DeploymentActivationExecutorIssueSeverity,
  message: string,
  item: DeploymentActivationExecutorItem,
  dispatchKey: string,
  handlerId: string | null,
): DeploymentActivationExecutorIssue {
  return {
    code,
    severity,
    message,
    dispatchKey,
    handlerId,
    sessionId: item.sessionId,
    executionKey: item.executionKey,
    executionItemKey: item.executionItemKey,
    planItemKey: item.planItemKey,
    sequence: item.sequence,
  };
}

function hasBlocker(issues: readonly DeploymentActivationExecutorIssue[]): boolean {
  return issues.some((current) => current.severity === "blocker");
}

function compareIssues(
  left: DeploymentActivationExecutorIssue,
  right: DeploymentActivationExecutorIssue,
): number {
  return (
    left.severity.localeCompare(right.severity) ||
    left.code.localeCompare(right.code) ||
    Number(left.sequence ?? 0) - Number(right.sequence ?? 0) ||
    String(left.dispatchKey ?? "").localeCompare(String(right.dispatchKey ?? "")) ||
    String(left.handlerId ?? "").localeCompare(String(right.handlerId ?? "")) ||
    String(left.executionItemKey ?? "").localeCompare(String(right.executionItemKey ?? ""))
  );
}

function redactToken(value: string, token: string): string {
  return token ? value.split(token).join("[redacted]") : value;
}
