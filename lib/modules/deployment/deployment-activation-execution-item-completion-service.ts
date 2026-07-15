import {
  buildClinicActivationCurrentState,
  canonicalizeActivationCurrentState,
  compareActivationCurrentStates,
} from "./deployment-activation-current-state";
import type {
  DeploymentActivationExecutionItemCompletionRepository,
} from "./deployment-activation-execution-item-completion-repository";
import {
  cloneItemCompletionSnapshot,
  cloneRecord,
  emptyItemCompletionAggregate,
  type DeploymentActivationExecutionItemCompletionAggregateSnapshot,
  type DeploymentActivationExecutionItemCompletionCommand,
  type DeploymentActivationExecutionItemCompletionDownstreamCounts,
  type DeploymentActivationExecutionItemCompletionIssue,
  type DeploymentActivationExecutionItemCompletionIssueCode,
  type DeploymentActivationExecutionItemCompletionIssueSeverity,
  type DeploymentActivationExecutionItemCompletionItemSnapshot,
  type DeploymentActivationExecutionItemCompletionResult,
  type DeploymentActivationExecutionItemCompletionSessionSnapshot,
  type DeploymentActivationExecutionItemCompletionSnapshot,
  type DeploymentActivationExecutionItemCompletionStatus,
} from "./deployment-activation-execution-item-completion-types";

const SUPPORTED_CLINIC_TARGET = canonicalizeActivationCurrentState({
  deploymentStatus: "deployed",
});

export class DeploymentActivationExecutionItemCompletionService {
  constructor(
    private readonly repository: DeploymentActivationExecutionItemCompletionRepository,
  ) {}

  async assessItemCompletion(
    command: DeploymentActivationExecutionItemCompletionCommand,
  ): Promise<DeploymentActivationExecutionItemCompletionResult> {
    const commandIssues = validateCommand(command);

    if (hasBlocker(commandIssues)) {
      return buildResult({
        status: "blocked",
        command,
        snapshot: emptySnapshot(),
        currentDurableState: null,
        issues: commandIssues,
        message:
          "Activation execution item-completion assessment rejected invalid input before repository access.",
      });
    }

    try {
      const snapshot = cloneItemCompletionSnapshot(
        await this.repository.loadExecutionItemCompletionSnapshot({
          clinicId: command.clinicId,
          deploymentRunId: command.deploymentRunId,
          sessionId: command.sessionId,
          executionKey: command.executionKey,
          itemId: command.itemId,
          executionItemKey: command.executionItemKey,
          planItemKey: command.planItemKey,
        }),
      );

      return assessSnapshot(command, snapshot);
    } catch {
      return buildResult({
        status: "error",
        command,
        snapshot: emptySnapshot(),
        currentDurableState: null,
        issues: [
          commandIssue(
            "repository_error",
            command,
            "Activation execution item-completion repository failed safely.",
          ),
        ],
        message:
          "Activation execution item-completion assessment could not complete because repository evidence was unavailable.",
      });
    }
  }
}

export function createDeploymentActivationExecutionItemCompletionService(
  repository: DeploymentActivationExecutionItemCompletionRepository,
): DeploymentActivationExecutionItemCompletionService {
  return new DeploymentActivationExecutionItemCompletionService(repository);
}

function assessSnapshot(
  command: DeploymentActivationExecutionItemCompletionCommand,
  snapshot: DeploymentActivationExecutionItemCompletionSnapshot,
): DeploymentActivationExecutionItemCompletionResult {
  const missingIssues = validatePresence(command, snapshot);

  if (hasBlocker(missingIssues)) {
    return buildResult({
      status: "not_found",
      command,
      snapshot,
      currentDurableState: null,
      issues: missingIssues,
      message:
        "Activation execution item-completion assessment found missing session, item, or clinic evidence.",
    });
  }

  const session = snapshot.session as DeploymentActivationExecutionItemCompletionSessionSnapshot;
  const item = snapshot.item as DeploymentActivationExecutionItemCompletionItemSnapshot;
  const mode = item.executionStatus === "succeeded" ? "already_completed" : "completable";
  const currentDurableState = buildCurrentDurableState(snapshot);
  const issues = [
    ...validateSession(command, session),
    ...validateItem(command, session, item, mode),
    ...validateClinic(command, snapshot, currentDurableState),
    ...validateAggregate(session, snapshot.aggregate, mode),
  ];

  if (hasBlocker(issues)) {
    return buildResult({
      status: statusForIssues(issues),
      command,
      snapshot,
      currentDurableState,
      issues,
      message:
        "Activation execution item-completion assessment blocked because completion evidence is not safe.",
    });
  }

  return buildResult({
    status: mode,
    command,
    snapshot,
    currentDurableState,
    issues: standardWarnings(command, item),
    message:
      mode === "already_completed"
        ? "Activation execution item is already completed. No item mutation was performed."
        : "Activation execution item is completable. No item completion was persisted.",
  });
}

function validateCommand(
  command: DeploymentActivationExecutionItemCompletionCommand,
): DeploymentActivationExecutionItemCompletionIssue[] {
  const issues: DeploymentActivationExecutionItemCompletionIssue[] = [];

  if (!command.claimantId.trim()) {
    issues.push(commandIssue("claimant_invalid", command, "Claimant id is required."));
  }

  if (!command.ownershipToken.trim()) {
    issues.push(commandIssue("ownership_token_invalid", command, "Ownership token is required."));
  }

  if (!isValidTimestamp(command.assessmentTimestamp)) {
    issues.push(commandIssue("assessment_timestamp_invalid", command, "Assessment timestamp must be valid."));
  }

  if (!isValidTimestamp(command.proposedCompletedAt)) {
    issues.push(commandIssue("proposed_completed_at_invalid", command, "Proposed completed_at timestamp must be valid."));
  }

  return issues.sort(compareIssues);
}

function validatePresence(
  command: DeploymentActivationExecutionItemCompletionCommand,
  snapshot: DeploymentActivationExecutionItemCompletionSnapshot,
): DeploymentActivationExecutionItemCompletionIssue[] {
  const issues: DeploymentActivationExecutionItemCompletionIssue[] = [];

  if (!snapshot.session) {
    issues.push(commandIssue("missing_session", command, "Activation execution session was not found."));
  }

  if (!snapshot.item) {
    issues.push(commandIssue("missing_item", command, "Running or completed clinic activation item was not found."));
  }

  if (!snapshot.clinic) {
    issues.push(commandIssue("missing_clinic", command, "Durable clinic activation evidence was not found."));
  }

  return issues.sort(compareIssues);
}

function validateSession(
  command: DeploymentActivationExecutionItemCompletionCommand,
  session: DeploymentActivationExecutionItemCompletionSessionSnapshot,
): DeploymentActivationExecutionItemCompletionIssue[] {
  const issues: DeploymentActivationExecutionItemCompletionIssue[] = [];

  addCommandIssue(issues, session.clinicId !== command.clinicId, "clinic_identity_mismatch", command, "Execution session clinic does not match the completion request.");
  addCommandIssue(issues, session.deploymentRunId !== command.deploymentRunId, "deployment_run_identity_mismatch", command, "Execution session deployment run does not match the completion request.");
  addCommandIssue(issues, session.sessionId !== command.sessionId, "session_identity_mismatch", command, "Execution session id does not match the completion request.");
  addCommandIssue(issues, session.executionKey !== command.executionKey, "execution_key_mismatch", command, "Execution session key does not match the completion request.");

  if (session.executionStatus !== "running") {
    issues.push(blocker("session_not_running", session, null, "Execution session is not running."));
  }

  if (!session.startedAt || !isValidTimestamp(session.startedAt)) {
    issues.push(blocker("session_timestamp_missing", session, null, "Execution session is missing valid started_at evidence."));
  }

  if (session.completedAt !== null || session.failedAt !== null) {
    issues.push(blocker("terminal_session_timestamp_present", session, null, "Execution session has terminal lifecycle timestamps."));
  }

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
    issues.push(blocker("ownership_token_mismatch", session, null, "Execution session ownership token does not match the completion request."));
  }

  if (Date.parse(session.leaseExpiresAt) <= Date.parse(command.assessmentTimestamp)) {
    issues.push(blocker("lease_expired", session, null, "Execution session lease is not active."));
  }

  return issues;
}

function validateItem(
  command: DeploymentActivationExecutionItemCompletionCommand,
  session: DeploymentActivationExecutionItemCompletionSessionSnapshot,
  item: DeploymentActivationExecutionItemCompletionItemSnapshot,
  mode: "completable" | "already_completed",
): DeploymentActivationExecutionItemCompletionIssue[] {
  const issues: DeploymentActivationExecutionItemCompletionIssue[] = [];

  addCommandIssue(issues, item.itemId !== command.itemId, "item_identity_mismatch", command, "Execution item id does not match the completion request.");
  addCommandIssue(issues, item.executionItemKey !== command.executionItemKey, "item_identity_mismatch", command, "Execution item key does not match the completion request.");
  addCommandIssue(issues, item.planItemKey !== command.planItemKey, "item_identity_mismatch", command, "Plan item key does not match the completion request.");

  if (item.sessionId !== session.sessionId) {
    issues.push(blocker("item_session_mismatch", session, item, "Execution item does not belong to the execution session."));
  }

  if (mode === "completable" && item.executionStatus !== "running") {
    issues.push(blocker("item_not_running", session, item, "Execution item is not running."));
  }

  if (mode === "already_completed" && item.executionStatus !== "succeeded") {
    issues.push(blocker("item_not_succeeded", session, item, "Execution item is not succeeded."));
  }

  if (item.sequence !== 1) {
    issues.push(blocker("wrong_sequence", session, item, "Only the sequence-1 clinic activation item is completion-eligible in this slice."));
  }

  if (item.entityType !== "clinic") {
    issues.push(blocker("wrong_entity_type", session, item, "Only clinic activation items are completion-eligible in this slice."));
  }

  if (item.entityId !== command.clinicId) {
    issues.push(blocker("wrong_entity_id", session, item, "Clinic activation item entity id does not match the clinic."));
  }

  if (item.action !== "activate") {
    issues.push(blocker("wrong_action", session, item, "Only activate action items are completion-eligible in this slice."));
  }

  if (item.attemptCount !== 1) {
    issues.push(blocker("item_attempt_invalid", session, item, "Completion requires exactly one item attempt."));
  }

  if (!item.startedAt || !isValidTimestamp(item.startedAt)) {
    issues.push(blocker("item_timestamp_missing", session, item, "Execution item is missing valid started_at evidence."));
  }

  if (mode === "completable" && item.completedAt !== null) {
    issues.push(blocker("item_completed_timestamp_present", session, item, "Completable item already has completed_at evidence."));
  }

  if (mode === "already_completed" && (!item.completedAt || !isValidTimestamp(item.completedAt))) {
    issues.push(blocker("item_completed_timestamp_missing", session, item, "Already-completed item requires valid completed_at evidence."));
  }

  if (item.rolledBackAt !== null) {
    issues.push(blocker("item_rollback_evidence_present", session, item, "Execution item has rollback evidence."));
  }

  if (item.errorCode !== null || item.errorMessage !== null) {
    issues.push(blocker("item_error_present", session, item, "Execution item has error evidence."));
  }

  if (!Array.isArray(item.dependencyKeys)) {
    issues.push(blocker("dependency_integrity_invalid", session, item, "Execution item dependency evidence is malformed."));
  } else if (item.dependencyKeys.length > 0) {
    issues.push(blocker("dependency_integrity_invalid", session, item, "Sequence-1 clinic activation item must not have dependencies."));
  }

  if (!item.expectedCurrentState) {
    issues.push(blocker("item_expected_state_missing", session, item, "Execution item is missing expected current state evidence."));
  }

  if (!item.targetState) {
    issues.push(blocker("item_target_state_missing", session, item, "Execution item is missing target state evidence."));
  } else if (!isSupportedTargetState(item.targetState)) {
    issues.push(blocker("unsupported_target_state", session, item, "Execution item target state is not the supported deployed clinic target."));
  }

  return issues;
}

function validateClinic(
  command: DeploymentActivationExecutionItemCompletionCommand,
  snapshot: DeploymentActivationExecutionItemCompletionSnapshot,
  currentDurableState: Record<string, unknown> | null,
): DeploymentActivationExecutionItemCompletionIssue[] {
  const issues: DeploymentActivationExecutionItemCompletionIssue[] = [];
  const session = snapshot.session as DeploymentActivationExecutionItemCompletionSessionSnapshot;
  const item = snapshot.item as DeploymentActivationExecutionItemCompletionItemSnapshot;
  const clinic = snapshot.clinic;

  if (!clinic) {
    return issues;
  }

  if (clinic.clinicId !== command.clinicId || clinic.clinicId !== session.clinicId) {
    issues.push(blocker("clinic_identity_mismatch", session, item, "Durable clinic row does not match the completion request."));
  }

  if (clinic.deploymentStatus !== "deployed") {
    issues.push(blocker("clinic_not_deployed", session, item, "Durable clinic is not deployed."));
  }

  if (!clinic.deployedAt || !isValidTimestamp(clinic.deployedAt)) {
    issues.push(blocker("clinic_deployed_at_missing", session, item, "Durable clinic deployed_at evidence is missing or malformed."));
  }

  if (item.targetState && currentDurableState) {
    const targetComparisonState = canonicalizeActivationCurrentState({
      deploymentStatus: clinic.deploymentStatus,
    });
    const comparison = compareActivationCurrentStates(
      item.targetState,
      targetComparisonState,
    );

    if (!comparison.equivalent) {
      issues.push(blocker("clinic_target_state_mismatch", session, item, "Durable clinic state does not match the execution item target state."));
    }
  }

  return issues;
}

function validateAggregate(
  session: DeploymentActivationExecutionItemCompletionSessionSnapshot,
  aggregate: DeploymentActivationExecutionItemCompletionAggregateSnapshot,
  mode: "completable" | "already_completed",
): DeploymentActivationExecutionItemCompletionIssue[] {
  const issues: DeploymentActivationExecutionItemCompletionIssue[] = [];
  const expectedRunning = mode === "completable" ? 1 : 0;
  const expectedSucceeded = mode === "already_completed" ? 1 : 0;
  const expectedPending = aggregate.totalItemCount - expectedRunning - expectedSucceeded;

  if (
    aggregate.totalItemCount !== session.itemsRequested ||
    aggregate.totalItemCount < 1 ||
    aggregate.pendingItemCount !== expectedPending
  ) {
    issues.push(blocker("incomplete_item_set", session, null, "Execution item aggregate does not match requested item count or pending-item expectations."));
  }

  if (mode === "completable") {
    if (aggregate.runningItemCount === 0) {
      issues.push(blocker("no_running_item", session, null, "No running execution item exists for completion."));
    }

    if (aggregate.runningItemCount > 1) {
      issues.push(blocker("multiple_running_items", session, null, "More than one execution item is running."));
    }

    if (aggregate.succeededItemCount > 0) {
      issues.push(blocker("unrelated_item_execution_evidence", session, null, "Succeeded item evidence exists before completing the first item."));
    }
  } else {
    if (aggregate.runningItemCount > 0) {
      issues.push(blocker("multiple_running_items", session, null, "Running item evidence remains after completion."));
    }

    if (aggregate.succeededItemCount !== 1) {
      issues.push(blocker("unrelated_item_execution_evidence", session, null, "Already-completed reuse requires exactly one succeeded item."));
    }
  }

  if (aggregate.failedItemCount > 0) {
    issues.push(blocker("failed_item_present", session, null, "Failed execution item evidence exists."));
  }

  if (aggregate.attemptedItemCount !== 1 || aggregate.timestampedItemCount !== 1) {
    issues.push(blocker("unrelated_item_execution_evidence", session, null, "Only the sequence-1 clinic item may have attempt or timestamp evidence."));
  }

  if (aggregate.rollbackEvidenceCount > 0) {
    issues.push(blocker("item_rollback_evidence_present", session, null, "Execution item rollback evidence exists."));
  }

  if (aggregate.errorEvidenceCount > 0) {
    issues.push(blocker("item_error_present", session, null, "Execution item error evidence exists."));
  }

  if (
    aggregate.duplicateExecutionItemKeyCount > 0 ||
    aggregate.duplicatePlanItemKeyCount > 0 ||
    aggregate.duplicateSequenceCount > 0
  ) {
    issues.push(blocker("duplicate_item_identity", session, null, "Duplicate execution item identity prevents completion."));
  }

  return issues;
}

function buildCurrentDurableState(
  snapshot: DeploymentActivationExecutionItemCompletionSnapshot,
): Record<string, unknown> | null {
  const clinic = snapshot.clinic;

  if (!clinic) {
    return null;
  }

  return canonicalizeActivationCurrentState(
    clinic.currentState ??
      buildClinicActivationCurrentState({
        clinicId: clinic.clinicId,
        deploymentStatus: clinic.deploymentStatus,
      }),
  );
}

function isSupportedTargetState(targetState: Record<string, unknown>): boolean {
  return compareActivationCurrentStates(
    SUPPORTED_CLINIC_TARGET,
    canonicalizeActivationCurrentState(targetState),
  ).equivalent;
}

function buildResult(input: {
  status: DeploymentActivationExecutionItemCompletionStatus;
  command: DeploymentActivationExecutionItemCompletionCommand;
  snapshot: DeploymentActivationExecutionItemCompletionSnapshot;
  currentDurableState: Record<string, unknown> | null;
  issues: readonly DeploymentActivationExecutionItemCompletionIssue[];
  message: string;
}): DeploymentActivationExecutionItemCompletionResult {
  const issues = [...input.issues].sort(compareIssues);
  const item = input.snapshot.item;

  return {
    ok:
      input.status === "completable" ||
      input.status === "already_completed",
    status: input.status,
    claimantId: input.command.claimantId || null,
    clinicId:
      input.snapshot.clinic?.clinicId ??
      input.snapshot.session?.clinicId ??
      input.command.clinicId ??
      null,
    deploymentRunId:
      input.snapshot.session?.deploymentRunId ??
      input.command.deploymentRunId ??
      null,
    sessionId: input.snapshot.session?.sessionId ?? input.command.sessionId ?? null,
    executionKey:
      input.snapshot.session?.executionKey ?? input.command.executionKey ?? null,
    itemId: item?.itemId ?? input.command.itemId ?? null,
    executionItemKey:
      item?.executionItemKey ?? input.command.executionItemKey ?? null,
    planItemKey: item?.planItemKey ?? input.command.planItemKey ?? null,
    sequence: item?.sequence ?? null,
    entityType: item?.entityType ?? null,
    action: item?.action ?? null,
    startedAt: item?.startedAt ?? null,
    existingCompletedAt: item?.completedAt ?? null,
    proposedCompletedAt:
      input.status === "completable" ? input.command.proposedCompletedAt : null,
    leaseExpiresAt: input.snapshot.session?.leaseExpiresAt ?? null,
    attemptCount: item?.attemptCount ?? 0,
    currentDurableState: input.currentDurableState
      ? cloneRecord(input.currentDurableState)
      : null,
    targetState: item?.targetState ? cloneRecord(item.targetState) : null,
    blockers: issues.filter((current) => current.severity === "blocker").length,
    warnings: issues.filter((current) => current.severity === "warning").length,
    issues,
    downstream: zeroDownstream(),
    message: input.message,
  };
}

function standardWarnings(
  command: DeploymentActivationExecutionItemCompletionCommand,
  item: DeploymentActivationExecutionItemCompletionItemSnapshot,
): DeploymentActivationExecutionItemCompletionIssue[] {
  return [
    issue("completion_persistence_unavailable", "warning", command, item, "Atomic item-completion persistence is not implemented in this slice."),
    issue("dependency_progression_unimplemented", "warning", command, item, "Dependency progression is not implemented in this slice."),
    issue("rollback_execution_unimplemented", "warning", command, item, "Rollback execution is not implemented in this slice."),
    issue("session_completion_unimplemented", "warning", command, item, "Execution-session completion is not implemented in this slice."),
  ];
}

function statusForIssues(
  issues: readonly DeploymentActivationExecutionItemCompletionIssue[],
): "blocked" | "conflict" | "not_found" {
  if (
    issues.some((current) =>
      ["missing_session", "missing_item", "missing_clinic"].includes(current.code),
    )
  ) {
    return "not_found";
  }

  return issues.some((current) =>
    [
      "clinic_identity_mismatch",
      "deployment_run_identity_mismatch",
      "session_identity_mismatch",
      "execution_key_mismatch",
      "item_identity_mismatch",
      "item_session_mismatch",
      "wrong_running_item",
      "wrong_entity_id",
      "session_owned_by_another_executor",
      "ownership_token_mismatch",
    ].includes(current.code),
  )
    ? "conflict"
    : "blocked";
}

function addCommandIssue(
  issues: DeploymentActivationExecutionItemCompletionIssue[],
  condition: boolean,
  code: DeploymentActivationExecutionItemCompletionIssueCode,
  command: DeploymentActivationExecutionItemCompletionCommand,
  message: string,
): void {
  if (condition) {
    issues.push(commandIssue(code, command, message));
  }
}

function commandIssue(
  code: DeploymentActivationExecutionItemCompletionIssueCode,
  command: DeploymentActivationExecutionItemCompletionCommand,
  message: string,
): DeploymentActivationExecutionItemCompletionIssue {
  return {
    code,
    severity: "blocker",
    sessionId: command.sessionId,
    executionKey: command.executionKey,
    executionItemKey: command.executionItemKey,
    planItemKey: command.planItemKey,
    message,
  };
}

function blocker(
  code: DeploymentActivationExecutionItemCompletionIssueCode,
  session: DeploymentActivationExecutionItemCompletionSessionSnapshot,
  itemSnapshot: DeploymentActivationExecutionItemCompletionItemSnapshot | null,
  message: string,
): DeploymentActivationExecutionItemCompletionIssue {
  return {
    code,
    severity: "blocker",
    sessionId: session.sessionId,
    executionKey: session.executionKey,
    executionItemKey: itemSnapshot?.executionItemKey ?? null,
    planItemKey: itemSnapshot?.planItemKey ?? null,
    message,
  };
}

function issue(
  code: DeploymentActivationExecutionItemCompletionIssueCode,
  severity: DeploymentActivationExecutionItemCompletionIssueSeverity,
  command: DeploymentActivationExecutionItemCompletionCommand,
  itemSnapshot: DeploymentActivationExecutionItemCompletionItemSnapshot,
  message: string,
): DeploymentActivationExecutionItemCompletionIssue {
  return {
    code,
    severity,
    sessionId: command.sessionId,
    executionKey: command.executionKey,
    executionItemKey: itemSnapshot.executionItemKey,
    planItemKey: itemSnapshot.planItemKey,
    message,
  };
}

function hasBlocker(
  issues: readonly DeploymentActivationExecutionItemCompletionIssue[],
): boolean {
  return issues.some((current) => current.severity === "blocker");
}

function isValidTimestamp(value: string): boolean {
  return Number.isFinite(Date.parse(value));
}

function compareIssues(
  left: DeploymentActivationExecutionItemCompletionIssue,
  right: DeploymentActivationExecutionItemCompletionIssue,
): number {
  return (
    left.severity.localeCompare(right.severity) ||
    left.code.localeCompare(right.code) ||
    String(left.sessionId ?? "").localeCompare(String(right.sessionId ?? "")) ||
    String(left.executionKey ?? "").localeCompare(String(right.executionKey ?? "")) ||
    String(left.executionItemKey ?? "").localeCompare(String(right.executionItemKey ?? "")) ||
    String(left.planItemKey ?? "").localeCompare(String(right.planItemKey ?? ""))
  );
}

function zeroDownstream(): DeploymentActivationExecutionItemCompletionDownstreamCounts {
  return {
    itemsCompleted: 0,
    dependenciesUnlocked: 0,
    providersActivated: 0,
    sterilizersActivated: 0,
    workstationsActivated: 0,
    hardwareActivated: 0,
    bindingsWritten: 0,
    deploymentFinalized: 0,
  };
}

function emptySnapshot(): DeploymentActivationExecutionItemCompletionSnapshot {
  return {
    session: null,
    item: null,
    clinic: null,
    aggregate: emptyItemCompletionAggregate(),
  };
}
