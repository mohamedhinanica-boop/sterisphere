import type {
  DeploymentActivationExecutionDependencyProgressionRepository,
} from "./deployment-activation-execution-dependency-progression-repository";
import {
  cloneDependencyProgressionSnapshot,
  emptyDependencyProgressionAggregate,
  type DeploymentActivationExecutionDependencyProgressionCommand,
  type DeploymentActivationExecutionDependencyProgressionDownstreamCounts,
  type DeploymentActivationExecutionDependencyProgressionIssue,
  type DeploymentActivationExecutionDependencyProgressionIssueCode,
  type DeploymentActivationExecutionDependencyProgressionIssueSeverity,
  type DeploymentActivationExecutionDependencyProgressionItemSnapshot,
  type DeploymentActivationExecutionDependencyProgressionResult,
  type DeploymentActivationExecutionDependencyProgressionSessionSnapshot,
  type DeploymentActivationExecutionDependencyProgressionSnapshot,
  type DeploymentActivationExecutionDependencyProgressionStatus,
} from "./deployment-activation-execution-dependency-progression-types";

export class DeploymentActivationExecutionDependencyProgressionService {
  constructor(
    private readonly repository: DeploymentActivationExecutionDependencyProgressionRepository,
  ) {}

  async assessDependencyProgression(
    command: DeploymentActivationExecutionDependencyProgressionCommand,
  ): Promise<DeploymentActivationExecutionDependencyProgressionResult> {
    const commandIssues = validateCommand(command);

    if (hasBlocker(commandIssues)) {
      return buildResult({
        status: "blocked",
        command,
        snapshot: emptySnapshot(),
        completedItem: null,
        nextItem: null,
        issues: commandIssues,
        message:
          "Activation execution dependency-progression assessment rejected invalid input before repository access.",
      });
    }

    try {
      const snapshot = cloneDependencyProgressionSnapshot(
        await this.repository.loadDependencyProgressionSnapshot({
          clinicId: command.clinicId,
          deploymentRunKey: command.deploymentRunKey,
          sessionId: command.sessionId,
          executionKey: command.executionKey,
        }),
      );

      return assessSnapshot(command, snapshot);
    } catch {
      return buildResult({
        status: "error",
        command,
        snapshot: emptySnapshot(),
        completedItem: null,
        nextItem: null,
        issues: [
          commandIssue(
            "repository_error",
            command,
            "Activation execution dependency-progression repository failed safely.",
          ),
        ],
        message:
          "Activation execution dependency-progression assessment could not complete because repository evidence was unavailable.",
      });
    }
  }
}

export function createDeploymentActivationExecutionDependencyProgressionService(
  repository: DeploymentActivationExecutionDependencyProgressionRepository,
): DeploymentActivationExecutionDependencyProgressionService {
  return new DeploymentActivationExecutionDependencyProgressionService(repository);
}

function assessSnapshot(
  command: DeploymentActivationExecutionDependencyProgressionCommand,
  snapshot: DeploymentActivationExecutionDependencyProgressionSnapshot,
): DeploymentActivationExecutionDependencyProgressionResult {
  if (!snapshot.session) {
    return buildResult({
      status: "not_found",
      command,
      snapshot,
      completedItem: null,
      nextItem: null,
      issues: [commandIssue("missing_session", command, "Activation execution session was not found.")],
      message:
        "Activation execution dependency-progression assessment found no running execution session.",
    });
  }

  const session = snapshot.session;
  const orderedItems = [...snapshot.items].sort(compareItems);
  const prefix = getSucceededPrefix(orderedItems);
  const completedItem = prefix[prefix.length - 1] ?? null;
  const expectedNextSequence = prefix.length + 1;
  const nextItems = orderedItems.filter((item) => item.sequence === expectedNextSequence);
  const nextItem = nextItems[0] ?? null;
  const mode = nextItem?.executionStatus === "ready" ? "already_progressed" : "progressable";
  const issues = [
    ...validateIdentity(command, session),
    ...validateSessionLifecycle(session),
    ...validateOwnership(command, session),
    ...validateAggregate(session, snapshot),
    ...validateSucceededPrefix(session, orderedItems, prefix),
    ...validateNextItem(session, orderedItems, prefix, nextItems, mode),
    ...validateDependencyGraph(session, orderedItems, nextItem),
    ...validateLaterItems(session, orderedItems, expectedNextSequence),
  ];

  if (hasBlocker(issues)) {
    return buildResult({
      status: statusForIssues(issues),
      command,
      snapshot,
      completedItem,
      nextItem,
      issues,
      message:
        "Activation execution dependency-progression assessment blocked because item dependency evidence is not safe.",
    });
  }

  return buildResult({
    status: mode,
    command,
    snapshot,
    completedItem,
    nextItem,
    issues: nextItem ? standardWarnings(session, nextItem) : [],
    message:
      mode === "already_progressed"
        ? "The next deterministic execution item is already ready. No item mutation was performed."
        : "The next deterministic execution item is progressable. No pending-to-ready mutation was persisted.",
  });
}

function validateCommand(
  command: DeploymentActivationExecutionDependencyProgressionCommand,
): DeploymentActivationExecutionDependencyProgressionIssue[] {
  const issues: DeploymentActivationExecutionDependencyProgressionIssue[] = [];

  if (!command.claimantId.trim()) {
    issues.push(commandIssue("claimant_invalid", command, "Claimant id is required."));
  }

  if (!command.ownershipToken.trim()) {
    issues.push(commandIssue("ownership_token_invalid", command, "Ownership token is required."));
  }

  if (!isValidTimestamp(command.now)) {
    issues.push(commandIssue("assessment_timestamp_invalid", command, "Assessment timestamp must be valid."));
  }

  return issues.sort(compareIssues);
}

function validateIdentity(
  command: DeploymentActivationExecutionDependencyProgressionCommand,
  session: DeploymentActivationExecutionDependencyProgressionSessionSnapshot,
): DeploymentActivationExecutionDependencyProgressionIssue[] {
  const issues: DeploymentActivationExecutionDependencyProgressionIssue[] = [];

  addCommandIssue(issues, session.clinicId !== command.clinicId, "clinic_identity_mismatch", command, "Execution session clinic does not match the dependency-progression request.");
  addCommandIssue(issues, session.deploymentRunKey !== command.deploymentRunKey, "deployment_run_identity_mismatch", command, "Execution session deployment run does not match the dependency-progression request.");
  addCommandIssue(issues, session.sessionId !== command.sessionId, "session_identity_mismatch", command, "Execution session id does not match the dependency-progression request.");
  addCommandIssue(issues, session.executionKey !== command.executionKey, "execution_key_mismatch", command, "Execution session key does not match the dependency-progression request.");

  return issues;
}

function validateSessionLifecycle(
  session: DeploymentActivationExecutionDependencyProgressionSessionSnapshot,
): DeploymentActivationExecutionDependencyProgressionIssue[] {
  const issues: DeploymentActivationExecutionDependencyProgressionIssue[] = [];

  if (session.preparationStatus !== "ready") {
    issues.push(blocker("preparation_status_not_ready", session, null, "Execution session preparation is not ready."));
  }

  if (session.executionStatus !== "running") {
    issues.push(blocker("session_not_running", session, null, "Execution session is not running."));
  }

  if (!session.startedAt || !isValidTimestamp(session.startedAt)) {
    issues.push(blocker("session_timestamp_missing", session, null, "Execution session is missing valid started_at evidence."));
  }

  if (
    session.completedAt !== null ||
    session.failedAt !== null ||
    session.cancelledAt !== null ||
    session.rolledBackAt !== null
  ) {
    issues.push(blocker("terminal_session_timestamp_present", session, null, "Execution session has terminal lifecycle evidence."));
  }

  return issues;
}

function validateOwnership(
  command: DeploymentActivationExecutionDependencyProgressionCommand,
  session: DeploymentActivationExecutionDependencyProgressionSessionSnapshot,
): DeploymentActivationExecutionDependencyProgressionIssue[] {
  const issues: DeploymentActivationExecutionDependencyProgressionIssue[] = [];

  if (!session.executionOwner || !session.ownershipToken) {
    issues.push(blocker("ownership_shape_inconsistent", session, null, "Execution session requires owner and token evidence."));
  }

  if (!session.leaseExpiresAt) {
    issues.push(blocker("lease_missing", session, null, "Execution session requires active lease evidence."));
    return issues;
  }

  if (!isValidTimestamp(session.leaseExpiresAt)) {
    issues.push(blocker("lease_timestamp_malformed", session, null, "Execution session lease expiration is malformed."));
    return issues;
  }

  if (session.executionOwner && session.executionOwner !== command.claimantId) {
    issues.push(blocker("session_owned_by_another_executor", session, null, "Execution session is owned by another executor."));
  }

  if (session.ownershipToken && session.ownershipToken !== command.ownershipToken) {
    issues.push(blocker("ownership_token_mismatch", session, null, "Execution session ownership token does not match the dependency-progression request."));
  }

  if (Date.parse(session.leaseExpiresAt) <= Date.parse(command.now)) {
    issues.push(blocker("lease_expired", session, null, "Execution session lease is not active."));
  }

  return issues;
}

function validateAggregate(
  session: DeploymentActivationExecutionDependencyProgressionSessionSnapshot,
  snapshot: DeploymentActivationExecutionDependencyProgressionSnapshot,
): DeploymentActivationExecutionDependencyProgressionIssue[] {
  const issues: DeploymentActivationExecutionDependencyProgressionIssue[] = [];
  const aggregate = snapshot.aggregate;

  if (
    aggregate.totalItemCount !== session.itemsRequested ||
    aggregate.totalItemCount !== snapshot.items.length ||
    aggregate.totalItemCount < 1
  ) {
    issues.push(blocker("item_count_mismatch", session, null, "Durable execution item count does not match requested item evidence."));
  }

  if (aggregate.readyItemCount > 1) {
    issues.push(blocker("multiple_ready_items", session, null, "More than one ready execution item exists."));
  }

  if (aggregate.runningItemCount > 0) {
    issues.push(blocker("running_item_present", session, null, "Running execution item evidence exists before dependency progression."));
  }

  if (aggregate.failedOrTerminalItemCount > 0) {
    issues.push(blocker("terminal_item_present", session, null, "Execution items include failed or terminal statuses."));
  }

  if (aggregate.rollbackEvidenceCount > 0) {
    issues.push(blocker("later_item_drift", session, null, "Execution item rollback evidence exists."));
  }

  if (aggregate.errorEvidenceCount > 0) {
    issues.push(blocker("later_item_drift", session, null, "Execution item error evidence exists."));
  }

  if (aggregate.malformedDependencyCount > 0) {
    issues.push(blocker("dependency_keys_malformed", session, null, "Execution item dependency key evidence is malformed."));
  }

  if (
    aggregate.duplicateExecutionItemKeyCount > 0 ||
    aggregate.duplicatePlanItemKeyCount > 0 ||
    aggregate.duplicateSequenceCount > 0
  ) {
    issues.push(blocker("duplicate_item_identity", session, null, "Duplicate durable execution item identity prevents dependency progression."));
  }

  return issues;
}

function validateSucceededPrefix(
  session: DeploymentActivationExecutionDependencyProgressionSessionSnapshot,
  items: readonly DeploymentActivationExecutionDependencyProgressionItemSnapshot[],
  prefix: readonly DeploymentActivationExecutionDependencyProgressionItemSnapshot[],
): DeploymentActivationExecutionDependencyProgressionIssue[] {
  const issues: DeploymentActivationExecutionDependencyProgressionIssue[] = [];

  if (prefix.length === 0) {
    issues.push(blocker("no_succeeded_prefix", session, null, "No contiguous succeeded execution prefix exists."));
  }

  for (let index = 0; index < prefix.length; index += 1) {
    const item = prefix[index];
    const expectedSequence = index + 1;

    if (item.sequence !== expectedSequence) {
      issues.push(blocker("non_contiguous_succeeded_prefix", session, item, "Succeeded execution prefix is not contiguous from sequence 1."));
    }

    issues.push(...validateSucceededItem(session, item));
  }

  const firstNonPrefixSucceeded = items.find(
    (item) => item.sequence > prefix.length && item.executionStatus === "succeeded",
  );

  if (firstNonPrefixSucceeded) {
    issues.push(blocker("non_contiguous_succeeded_prefix", session, firstNonPrefixSucceeded, "Succeeded item appears after the contiguous prefix."));
  }

  return issues;
}

function validateSucceededItem(
  session: DeploymentActivationExecutionDependencyProgressionSessionSnapshot,
  item: DeploymentActivationExecutionDependencyProgressionItemSnapshot,
): DeploymentActivationExecutionDependencyProgressionIssue[] {
  const issues: DeploymentActivationExecutionDependencyProgressionIssue[] = [];

  if (item.attemptCount !== 1) {
    issues.push(blocker("succeeded_item_attempt_invalid", session, item, "Succeeded item must have exactly one attempt."));
  }

  if (!item.startedAt || !isValidTimestamp(item.startedAt) || !item.completedAt || !isValidTimestamp(item.completedAt)) {
    issues.push(blocker("succeeded_item_timestamp_missing", session, item, "Succeeded item requires valid started_at and completed_at evidence."));
  } else if (Date.parse(item.completedAt) < Date.parse(item.startedAt)) {
    issues.push(blocker("succeeded_item_completion_before_start", session, item, "Succeeded item completed before it started."));
  }

  if (item.rolledBackAt !== null) {
    issues.push(blocker("succeeded_item_rollback_evidence_present", session, item, "Succeeded item has rollback evidence."));
  }

  if (item.errorCode !== null || item.errorMessage !== null) {
    issues.push(blocker("succeeded_item_error_present", session, item, "Succeeded item has error evidence."));
  }

  return issues;
}

function validateNextItem(
  session: DeploymentActivationExecutionDependencyProgressionSessionSnapshot,
  items: readonly DeploymentActivationExecutionDependencyProgressionItemSnapshot[],
  prefix: readonly DeploymentActivationExecutionDependencyProgressionItemSnapshot[],
  nextItems: readonly DeploymentActivationExecutionDependencyProgressionItemSnapshot[],
  mode: "progressable" | "already_progressed",
): DeploymentActivationExecutionDependencyProgressionIssue[] {
  const issues: DeploymentActivationExecutionDependencyProgressionIssue[] = [];
  const expectedNextSequence = prefix.length + 1;
  const nextItem = nextItems[0] ?? null;

  if (nextItems.length === 0) {
    issues.push(blocker("next_item_missing", session, null, "No next deterministic pending execution item exists."));
    if (items.some((item) => item.sequence > expectedNextSequence)) {
      issues.push(blocker("next_sequence_gap", session, null, "Execution item sequence has a gap after the succeeded prefix."));
    }
    return issues;
  }

  if (nextItems.length > 1) {
    issues.push(blocker("deterministic_candidate_ambiguity", session, nextItem, "More than one execution item has the next deterministic sequence."));
  }

  const allowedStatus = mode === "already_progressed" ? "ready" : "pending";

  if (nextItem && nextItem.executionStatus !== allowedStatus) {
    issues.push(blocker("next_item_status_invalid", session, nextItem, "Next item is not in the expected pending or ready state."));
  }

  if (nextItem) {
    if (nextItem.attemptCount !== 0) {
      issues.push(blocker("next_item_attempt_evidence_present", session, nextItem, "Next item has attempt evidence."));
    }

    if (nextItem.startedAt !== null || nextItem.completedAt !== null) {
      issues.push(blocker("next_item_timestamp_evidence_present", session, nextItem, "Next item has execution timestamp evidence."));
    }

    if (nextItem.rolledBackAt !== null) {
      issues.push(blocker("next_item_rollback_evidence_present", session, nextItem, "Next item has rollback evidence."));
    }

    if (nextItem.errorCode !== null || nextItem.errorMessage !== null) {
      issues.push(blocker("next_item_error_present", session, nextItem, "Next item has error evidence."));
    }

    if (!isSupportedEntityAction(nextItem)) {
      issues.push(blocker("unsupported_entity_action_lifecycle", session, nextItem, "Next item entity/action lifecycle is not supported for dependency progression assessment."));
    }
  }

  return issues;
}

function validateDependencyGraph(
  session: DeploymentActivationExecutionDependencyProgressionSessionSnapshot,
  items: readonly DeploymentActivationExecutionDependencyProgressionItemSnapshot[],
  nextItem: DeploymentActivationExecutionDependencyProgressionItemSnapshot | null,
): DeploymentActivationExecutionDependencyProgressionIssue[] {
  if (!nextItem) {
    return [];
  }

  const issues: DeploymentActivationExecutionDependencyProgressionIssue[] = [];

  if (!Array.isArray(nextItem.dependencyKeys)) {
    return [blocker("dependency_keys_malformed", session, nextItem, "Next item dependency keys are malformed.")];
  }

  const dependencies = nextItem.dependencyKeys;
  const uniqueDependencies = new Set(dependencies);

  if (uniqueDependencies.size !== dependencies.length) {
    issues.push(blocker("duplicate_dependency_key", session, nextItem, "Next item contains duplicate dependency keys."));
  }

  const itemsByPlanKey = new Map(items.map((item) => [item.planItemKey, item]));

  for (const dependencyKey of dependencies) {
    const dependencyItem = itemsByPlanKey.get(dependencyKey);

    if (!dependencyItem) {
      issues.push(blocker("dependency_item_missing", session, nextItem, "Next item dependency does not reference an existing plan item."));
      continue;
    }

    if (dependencyItem.planItemKey === nextItem.planItemKey) {
      issues.push(blocker("dependency_self_reference", session, nextItem, "Next item cannot depend on itself."));
    }

    if (dependencyItem.sequence >= nextItem.sequence) {
      issues.push(blocker("dependency_on_later_item", session, nextItem, "Next item dependency references itself or a later item."));
    }

    if (dependencyItem.executionStatus !== "succeeded") {
      issues.push(blocker("dependency_not_succeeded", session, nextItem, "Next item dependency is not succeeded."));
    }
  }

  return issues;
}

function validateLaterItems(
  session: DeploymentActivationExecutionDependencyProgressionSessionSnapshot,
  items: readonly DeploymentActivationExecutionDependencyProgressionItemSnapshot[],
  nextSequence: number,
): DeploymentActivationExecutionDependencyProgressionIssue[] {
  const issues: DeploymentActivationExecutionDependencyProgressionIssue[] = [];

  for (const item of items.filter((current) => current.sequence > nextSequence)) {
    if (
      item.executionStatus !== "pending" ||
      item.attemptCount !== 0 ||
      item.startedAt !== null ||
      item.completedAt !== null ||
      item.rolledBackAt !== null ||
      item.errorCode !== null ||
      item.errorMessage !== null
    ) {
      issues.push(blocker("later_item_drift", session, item, "Later pending item has lifecycle drift."));
    }
  }

  return issues;
}

function getSucceededPrefix(
  items: readonly DeploymentActivationExecutionDependencyProgressionItemSnapshot[],
): DeploymentActivationExecutionDependencyProgressionItemSnapshot[] {
  const prefix: DeploymentActivationExecutionDependencyProgressionItemSnapshot[] = [];
  let expectedSequence = 1;

  for (const item of items) {
    if (item.sequence !== expectedSequence || item.executionStatus !== "succeeded") {
      break;
    }

    prefix.push(item);
    expectedSequence += 1;
  }

  return prefix;
}

function isSupportedEntityAction(
  item: DeploymentActivationExecutionDependencyProgressionItemSnapshot,
): boolean {
  return Boolean(item.entityType.trim()) && Boolean(item.action.trim());
}

function buildResult(input: {
  status: DeploymentActivationExecutionDependencyProgressionStatus;
  command: DeploymentActivationExecutionDependencyProgressionCommand;
  snapshot: DeploymentActivationExecutionDependencyProgressionSnapshot;
  completedItem: DeploymentActivationExecutionDependencyProgressionItemSnapshot | null;
  nextItem: DeploymentActivationExecutionDependencyProgressionItemSnapshot | null;
  issues: readonly DeploymentActivationExecutionDependencyProgressionIssue[];
  message: string;
}): DeploymentActivationExecutionDependencyProgressionResult {
  const issues = [...input.issues].sort(compareIssues);
  const session = input.snapshot.session;
  const nextItem = input.nextItem;
  const completedItem = input.completedItem;

  return {
    ok: input.status === "progressable" || input.status === "already_progressed",
    status: input.status,
    message: input.message,
    clinicId: session?.clinicId ?? input.command.clinicId ?? null,
    deploymentRunKey: session?.deploymentRunKey ?? input.command.deploymentRunKey ?? null,
    sessionId: session?.sessionId ?? input.command.sessionId ?? null,
    executionKey: session?.executionKey ?? input.command.executionKey ?? null,
    claimantId: input.command.claimantId || null,
    completedItemId: completedItem?.itemId ?? null,
    completedExecutionItemKey: completedItem?.executionItemKey ?? null,
    completedPlanItemKey: completedItem?.planItemKey ?? null,
    completedSequence: completedItem?.sequence ?? null,
    completedStartedAt: completedItem?.startedAt ?? null,
    completedCompletedAt: completedItem?.completedAt ?? null,
    completedAttemptCount: completedItem?.attemptCount ?? 0,
    nextItemId: nextItem?.itemId ?? null,
    nextExecutionItemKey: nextItem?.executionItemKey ?? null,
    nextPlanItemKey: nextItem?.planItemKey ?? null,
    nextSequence: nextItem?.sequence ?? null,
    nextEntityType: nextItem?.entityType ?? null,
    nextEntityId: nextItem?.entityId ?? null,
    nextAction: nextItem?.action ?? null,
    nextAttemptCount: nextItem?.attemptCount ?? 0,
    currentNextItemStatus: nextItem?.executionStatus ?? null,
    proposedNextItemStatus:
      input.status === "progressable" || input.status === "already_progressed"
        ? "ready"
        : null,
    dependencyKeys: nextItem && Array.isArray(nextItem.dependencyKeys)
      ? [...nextItem.dependencyKeys]
      : [],
    blockerCount: issues.filter((current) => current.severity === "blocker").length,
    warningCount: issues.filter((current) => current.severity === "warning").length,
    issues,
    downstream: zeroDownstream(),
  };
}

function standardWarnings(
  session: DeploymentActivationExecutionDependencyProgressionSessionSnapshot,
  nextItem: DeploymentActivationExecutionDependencyProgressionItemSnapshot,
): DeploymentActivationExecutionDependencyProgressionIssue[] {
  return [
    blocker("dependency_progression_persistence_unimplemented", session, nextItem, "Dependency progression persistence is not implemented in this slice.", "warning"),
    blocker("next_item_start_unimplemented", session, nextItem, "Next-item start is not implemented in this slice.", "warning"),
    blocker("rollback_execution_unimplemented", session, nextItem, "Rollback execution is not implemented in this slice.", "warning"),
  ];
}

function statusForIssues(
  issues: readonly DeploymentActivationExecutionDependencyProgressionIssue[],
): "blocked" | "conflict" | "not_found" {
  if (issues.some((current) => current.code === "missing_session" || current.code === "next_item_missing")) {
    return "not_found";
  }

  return issues.some((current) =>
    [
      "clinic_identity_mismatch",
      "deployment_run_identity_mismatch",
      "session_identity_mismatch",
      "execution_key_mismatch",
      "session_owned_by_another_executor",
      "ownership_token_mismatch",
    ].includes(current.code),
  )
    ? "conflict"
    : "blocked";
}

function addCommandIssue(
  issues: DeploymentActivationExecutionDependencyProgressionIssue[],
  condition: boolean,
  code: DeploymentActivationExecutionDependencyProgressionIssueCode,
  command: DeploymentActivationExecutionDependencyProgressionCommand,
  message: string,
): void {
  if (condition) {
    issues.push(commandIssue(code, command, message));
  }
}

function commandIssue(
  code: DeploymentActivationExecutionDependencyProgressionIssueCode,
  command: DeploymentActivationExecutionDependencyProgressionCommand,
  message: string,
): DeploymentActivationExecutionDependencyProgressionIssue {
  return {
    code,
    severity: "blocker",
    message,
    sessionId: command.sessionId,
    executionKey: command.executionKey,
    executionItemKey: null,
    planItemKey: null,
    entityType: null,
    entityKey: null,
    sequence: null,
  };
}

function blocker(
  code: DeploymentActivationExecutionDependencyProgressionIssueCode,
  session: DeploymentActivationExecutionDependencyProgressionSessionSnapshot,
  item: DeploymentActivationExecutionDependencyProgressionItemSnapshot | null,
  message: string,
  severity: DeploymentActivationExecutionDependencyProgressionIssueSeverity = "blocker",
): DeploymentActivationExecutionDependencyProgressionIssue {
  return {
    code,
    severity,
    message,
    sessionId: session.sessionId,
    executionKey: session.executionKey,
    executionItemKey: item?.executionItemKey ?? null,
    planItemKey: item?.planItemKey ?? null,
    entityType: item?.entityType ?? null,
    entityKey: item?.entityId ?? null,
    sequence: item?.sequence ?? null,
  };
}

function compareItems(
  left: DeploymentActivationExecutionDependencyProgressionItemSnapshot,
  right: DeploymentActivationExecutionDependencyProgressionItemSnapshot,
): number {
  return left.sequence - right.sequence || left.executionItemKey.localeCompare(right.executionItemKey);
}

function hasBlocker(
  issues: readonly DeploymentActivationExecutionDependencyProgressionIssue[],
): boolean {
  return issues.some((current) => current.severity === "blocker");
}

function isValidTimestamp(value: string): boolean {
  return Number.isFinite(Date.parse(value));
}

function compareIssues(
  left: DeploymentActivationExecutionDependencyProgressionIssue,
  right: DeploymentActivationExecutionDependencyProgressionIssue,
): number {
  return (
    left.severity.localeCompare(right.severity) ||
    left.code.localeCompare(right.code) ||
    Number(left.sequence ?? 0) - Number(right.sequence ?? 0) ||
    String(left.sessionId ?? "").localeCompare(String(right.sessionId ?? "")) ||
    String(left.executionKey ?? "").localeCompare(String(right.executionKey ?? "")) ||
    String(left.executionItemKey ?? "").localeCompare(String(right.executionItemKey ?? "")) ||
    String(left.planItemKey ?? "").localeCompare(String(right.planItemKey ?? ""))
  );
}

function zeroDownstream(): DeploymentActivationExecutionDependencyProgressionDownstreamCounts {
  return {
    itemsReadied: 0,
    itemsStarted: 0,
    itemsSucceeded: 0,
    entitiesActivated: 0,
    bindingsWritten: 0,
    sessionsCompleted: 0,
    deploymentsFinalized: 0,
    rollbacksExecuted: 0,
  };
}

function emptySnapshot(): DeploymentActivationExecutionDependencyProgressionSnapshot {
  return {
    session: null,
    items: [],
    aggregate: emptyDependencyProgressionAggregate(),
  };
}