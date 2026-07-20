import type {
  DeploymentWorkstationShellExecutionItemCompletionRepository,
} from "./deployment-workstation-shell-execution-item-completion-repository";
import {
  cloneWorkstationShellExecutionItemCompletionSnapshot,
  emptyWorkstationShellExecutionItemCompletionAggregate,
  type DeploymentWorkstationShellExecutionItemCompletionAggregateSnapshot,
  type DeploymentWorkstationShellExecutionItemCompletionCommand,
  type DeploymentWorkstationShellExecutionItemCompletionDownstreamCounts,
  type DeploymentWorkstationShellExecutionItemCompletionIssue,
  type DeploymentWorkstationShellExecutionItemCompletionIssueCode,
  type DeploymentWorkstationShellExecutionItemCompletionIssueSeverity,
  type DeploymentWorkstationShellExecutionItemCompletionItemSnapshot,
  type DeploymentWorkstationShellExecutionItemCompletionWorkstationSnapshot,
  type DeploymentWorkstationShellExecutionItemCompletionResult,
  type DeploymentWorkstationShellExecutionItemCompletionSessionSnapshot,
  type DeploymentWorkstationShellExecutionItemCompletionSnapshot,
  type DeploymentWorkstationShellExecutionItemCompletionStatus,
} from "./deployment-workstation-shell-execution-item-completion-types";

type CompletionMode = "completable" | "already_completed";

export class DeploymentWorkstationShellExecutionItemCompletionService {
  constructor(
    private readonly repository: DeploymentWorkstationShellExecutionItemCompletionRepository,
  ) {}

  async assessWorkstationShellExecutionItemCompletion(
    command: DeploymentWorkstationShellExecutionItemCompletionCommand,
  ): Promise<DeploymentWorkstationShellExecutionItemCompletionResult> {
    const commandIssues = validateCommand(command);

    if (hasBlocker(commandIssues)) {
      return buildResult({
        status: "blocked",
        command,
        snapshot: emptySnapshot(),
        issues: commandIssues,
        message: "Workstation-shell execution-item completion assessment rejected invalid input before repository access.",
      });
    }

    try {
      const snapshot = cloneWorkstationShellExecutionItemCompletionSnapshot(
        await this.repository.loadWorkstationShellExecutionItemCompletionSnapshot({
          clinicId: command.clinicId,
          deploymentRunId: command.deploymentRunId,
          sessionId: command.sessionId,
          executionKey: command.executionKey,
        }),
      );

      return assessSnapshot(command, snapshot);
    } catch (caught) {
      const message = caught instanceof Error
        ? redactToken(caught.message, command.ownershipToken)
        : "Workstation-shell execution-item completion repository failed safely.";
      return buildResult({
        status: "error",
        command,
        snapshot: emptySnapshot(),
        issues: [commandIssue("repository_error", command, message)],
        message: "Workstation-shell execution-item completion assessment could not complete because repository evidence was unavailable.",
      });
    }
  }
}

export function createDeploymentWorkstationShellExecutionItemCompletionService(
  repository: DeploymentWorkstationShellExecutionItemCompletionRepository,
): DeploymentWorkstationShellExecutionItemCompletionService {
  return new DeploymentWorkstationShellExecutionItemCompletionService(repository);
}

function assessSnapshot(
  command: DeploymentWorkstationShellExecutionItemCompletionCommand,
  snapshot: DeploymentWorkstationShellExecutionItemCompletionSnapshot,
): DeploymentWorkstationShellExecutionItemCompletionResult {
  const presenceIssues = validatePresence(command, snapshot);
  if (hasBlocker(presenceIssues)) {
    return buildResult({
      status: "not_found",
      command,
      snapshot,
      issues: presenceIssues,
      message: "Workstation-shell execution-item completion assessment found missing session, item, or workstation evidence.",
    });
  }

  const session = snapshot.session as DeploymentWorkstationShellExecutionItemCompletionSessionSnapshot;
  const item = snapshot.item as DeploymentWorkstationShellExecutionItemCompletionItemSnapshot;
  const workstation = snapshot.workstation as DeploymentWorkstationShellExecutionItemCompletionWorkstationSnapshot;
  const mode: CompletionMode = item.executionStatus === "succeeded" ? "already_completed" : "completable";
  const orderedItems = [...snapshot.items].sort(compareItems);
  const issues = [
    ...validateSession(command, session),
    ...validateAggregate(session, snapshot.aggregate, mode),
    ...validateItem(command, session, item, workstation, snapshot.aggregate, mode),
    ...validateWorkstation(command, session, item, workstation),
    ...validateDependencies(session, item, orderedItems),
    ...validatePriorPrefix(session, item, orderedItems),
    ...validateLaterItems(session, item, orderedItems),
  ];

  if (hasBlocker(issues)) {
    return buildResult({
      status: statusForIssues(issues),
      command,
      snapshot,
      issues,
      message: "Workstation-shell execution-item completion assessment blocked because completion evidence is not safe.",
    });
  }

  return buildResult({
    status: mode,
    command,
    snapshot,
    issues: standardWarnings(session, item, workstation),
    message: mode === "already_completed"
      ? "Workstation-shell activation execution item is already completed. No item mutation was performed."
      : "Workstation-shell activation execution item is completable. No item completion was persisted.",
  });
}

function validateCommand(
  command: DeploymentWorkstationShellExecutionItemCompletionCommand,
): DeploymentWorkstationShellExecutionItemCompletionIssue[] {
  const issues: DeploymentWorkstationShellExecutionItemCompletionIssue[] = [];

  if (!command.claimantId.trim()) {
    issues.push(commandIssue("claimant_invalid", command, "Claimant id is required."));
  }
  if (!command.ownershipToken.trim()) {
    issues.push(commandIssue("ownership_token_invalid", command, "Ownership token is required."));
  }
  if (!isValidTimestamp(command.proposedCompletedAt)) {
    issues.push(commandIssue("proposed_completed_at_invalid", command, "Proposed completed_at timestamp must be valid."));
  }

  return issues.sort(compareIssues);
}

function validatePresence(
  command: DeploymentWorkstationShellExecutionItemCompletionCommand,
  snapshot: DeploymentWorkstationShellExecutionItemCompletionSnapshot,
): DeploymentWorkstationShellExecutionItemCompletionIssue[] {
  const issues: DeploymentWorkstationShellExecutionItemCompletionIssue[] = [];

  if (!snapshot.session) {
    issues.push(commandIssue("missing_session", command, "Activation execution session was not found."));
  }
  if (!snapshot.item) {
    issues.push(commandIssue("missing_item", command, "Workstation-shell activation execution item was not found."));
  }
  if (!snapshot.workstation) {
    issues.push(commandIssue("missing_workstation_shell", command, "Activated workstation shell evidence was not found."));
  }

  return issues.sort(compareIssues);
}

function validateSession(
  command: DeploymentWorkstationShellExecutionItemCompletionCommand,
  session: DeploymentWorkstationShellExecutionItemCompletionSessionSnapshot,
): DeploymentWorkstationShellExecutionItemCompletionIssue[] {
  const issues: DeploymentWorkstationShellExecutionItemCompletionIssue[] = [];

  addCommandIssue(issues, session.clinicId !== command.clinicId, "clinic_identity_mismatch", command, "Execution session clinic does not match the completion request.");
  addCommandIssue(issues, session.deploymentRunId !== command.deploymentRunId, "deployment_run_identity_mismatch", command, "Execution session deployment run does not match the completion request.");
  addCommandIssue(issues, session.sessionId !== command.sessionId, "session_identity_mismatch", command, "Execution session id does not match the completion request.");
  addCommandIssue(issues, session.executionKey !== command.executionKey, "execution_key_mismatch", command, "Execution session key does not match the completion request.");

  if (session.preparationStatus !== "ready") {
    issues.push(blocker("preparation_status_not_ready", session, null, null, "Execution session preparation is not ready."));
  }
  if (session.executionStatus !== "running") {
    issues.push(blocker("session_not_running", session, null, null, "Execution session is not running."));
  }
  if (!session.startedAt || !isValidTimestamp(session.startedAt)) {
    issues.push(blocker("session_timestamp_missing", session, null, null, "Execution session is missing valid started_at evidence."));
  }
  if (session.completedAt !== null || session.failedAt !== null) {
    issues.push(blocker("terminal_session_timestamp_present", session, null, null, "Execution session has terminal lifecycle evidence."));
  }
  if (!session.executionOwner || !session.ownershipToken) {
    issues.push(blocker("ownership_shape_inconsistent", session, null, null, "Execution session requires owner and token evidence."));
  }
  if (!session.leaseExpiresAt) {
    issues.push(blocker("lease_missing", session, null, null, "Execution session requires active lease evidence."));
    return issues;
  }
  if (!isValidTimestamp(session.leaseExpiresAt)) {
    issues.push(blocker("lease_timestamp_malformed", session, null, null, "Execution session lease expiration is malformed."));
    return issues;
  }
  if (session.executionOwner && session.executionOwner !== command.claimantId) {
    issues.push(blocker("session_owned_by_another_executor", session, null, null, "Execution session is owned by another executor."));
  }
  if (session.ownershipToken && session.ownershipToken !== command.ownershipToken) {
    issues.push(blocker("ownership_token_mismatch", session, null, null, "Execution session ownership token does not match the completion request."));
  }
  if (Date.parse(session.leaseExpiresAt) <= Date.parse(command.proposedCompletedAt)) {
    issues.push(blocker("lease_expired", session, null, null, "Execution session lease is not active at the proposed completion timestamp."));
  }

  return issues;
}

function validateAggregate(
  session: DeploymentWorkstationShellExecutionItemCompletionSessionSnapshot,
  aggregate: DeploymentWorkstationShellExecutionItemCompletionAggregateSnapshot,
  mode: CompletionMode,
): DeploymentWorkstationShellExecutionItemCompletionIssue[] {
  const issues: DeploymentWorkstationShellExecutionItemCompletionIssue[] = [];
  const expectedRunning = mode === "completable" ? 1 : 0;

  if (aggregate.totalItemCount !== session.itemsRequested || aggregate.totalItemCount < 1) {
    issues.push(blocker("item_count_mismatch", session, null, null, "Durable execution item count does not match requested item evidence."));
  }
  if (aggregate.runningItemCount !== expectedRunning || aggregate.runningWorkstationItemCount !== expectedRunning) {
    issues.push(blocker(expectedRunning === 1 ? "no_running_item" : "multiple_running_items", session, null, null, "Running workstation execution item evidence is not deterministic."));
  }
  if (aggregate.runningItemCount > 1 || aggregate.runningWorkstationItemCount > 1) {
    issues.push(blocker("multiple_running_items", session, null, null, "More than one execution item is running."));
  }
  if (aggregate.readyItemCount > 0) {
    issues.push(blocker("ready_item_ambiguity", session, null, null, "A ready item exists while workstation completion is being assessed."));
  }
  if (aggregate.failedItemCount > 0) {
    issues.push(blocker("later_item_drift", session, null, null, "Execution items include failed evidence."));
  }
  if (aggregate.duplicateExecutionItemKeyCount > 0 || aggregate.duplicatePlanItemKeyCount > 0 || aggregate.duplicateSequenceCount > 0) {
    issues.push(blocker("duplicate_item_identity", session, null, null, "Duplicate execution item identity prevents workstation item completion."));
  }
  if (aggregate.duplicateWorkstationDeploymentIdentityCount > 0) {
    issues.push(blocker("duplicate_workstation_identity", session, null, null, "Duplicate workstation deployment identity prevents workstation item completion."));
  }
  if (aggregate.unexpectedTouchedLaterItemCount > 0) {
    issues.push(blocker("later_item_drift", session, null, null, "Later execution item evidence is not clean."));
  }

  return issues;
}

function validateItem(
  command: DeploymentWorkstationShellExecutionItemCompletionCommand,
  session: DeploymentWorkstationShellExecutionItemCompletionSessionSnapshot,
  item: DeploymentWorkstationShellExecutionItemCompletionItemSnapshot,
  workstation: DeploymentWorkstationShellExecutionItemCompletionWorkstationSnapshot,
  aggregate: DeploymentWorkstationShellExecutionItemCompletionAggregateSnapshot,
  mode: CompletionMode,
): DeploymentWorkstationShellExecutionItemCompletionIssue[] {
  const issues: DeploymentWorkstationShellExecutionItemCompletionIssue[] = [];
  const expectedSequence = mode === "already_completed"
    ? aggregate.priorSucceededPrefixCount
    : aggregate.priorSucceededPrefixCount + 1;

  if (item.sessionId !== session.sessionId) {
    issues.push(blocker("item_session_mismatch", session, item, workstation, "Execution item does not belong to the execution session."));
  }
  if (item.sequence !== expectedSequence) {
    issues.push(blocker("wrong_running_item", session, item, workstation, "Workstation item is not the deterministic next sequence after the succeeded prefix."));
  }
  if (item.entityType !== "workstation_shell") {
    issues.push(blocker("wrong_entity_type", session, item, workstation, "Only workstation-shell execution items are completion-eligible."));
  }
  if (item.action !== "activate") {
    issues.push(blocker("wrong_action", session, item, workstation, "Only activate action items are completion-eligible."));
  }
  if (mode === "completable" && item.executionStatus !== "running") {
    issues.push(blocker("item_not_running", session, item, workstation, "Workstation-shell activation item is not running."));
  }
  if (mode === "already_completed" && item.executionStatus !== "succeeded") {
    issues.push(blocker("item_not_succeeded", session, item, workstation, "Workstation-shell activation item is not succeeded."));
  }
  if (item.attemptCount !== 1) {
    issues.push(blocker("item_attempt_invalid", session, item, workstation, "Workstation-shell completion requires exactly one item attempt."));
  }
  if (!item.startedAt || !isValidTimestamp(item.startedAt)) {
    issues.push(blocker("item_started_at_missing", session, item, workstation, "Workstation-shell item is missing valid started_at evidence."));
  }
  if (mode === "completable" && item.completedAt !== null) {
    issues.push(blocker("item_completed_timestamp_present", session, item, workstation, "Completable workstation-shell item already has completed_at evidence."));
  }
  if (mode === "already_completed") {
    if (!item.completedAt || !isValidTimestamp(item.completedAt)) {
      issues.push(blocker("item_completed_timestamp_missing", session, item, workstation, "Already-completed workstation-shell item requires completed_at evidence."));
    } else if (item.startedAt && Date.parse(item.completedAt) < Date.parse(item.startedAt)) {
      issues.push(blocker("item_completion_before_start", session, item, workstation, "Workstation-shell item completed before it started."));
    }
  }
  if (item.rolledBackAt !== null) {
    issues.push(blocker("item_rollback_evidence_present", session, item, workstation, "Workstation-shell item has rollback evidence."));
  }
  if (item.errorCode !== null || item.errorMessage !== null) {
    issues.push(blocker("item_error_present", session, item, workstation, "Workstation-shell item has error evidence."));
  }
  if (item.entityId !== workstation.workstationId) {
    issues.push(blocker("workstation_identity_mismatch", session, item, workstation, "Workstation-shell item entity id does not match workstation id."));
  }
  if (item.deploymentKey !== workstation.deploymentWorkstationKey) {
    issues.push(blocker("workstation_identity_mismatch", session, item, workstation, "Workstation-shell item deployment key does not match workstation deployment key."));
  }

  return issues;
}

function validateWorkstation(
  command: DeploymentWorkstationShellExecutionItemCompletionCommand,
  session: DeploymentWorkstationShellExecutionItemCompletionSessionSnapshot,
  item: DeploymentWorkstationShellExecutionItemCompletionItemSnapshot,
  workstation: DeploymentWorkstationShellExecutionItemCompletionWorkstationSnapshot,
): DeploymentWorkstationShellExecutionItemCompletionIssue[] {
  const issues: DeploymentWorkstationShellExecutionItemCompletionIssue[] = [];

  if (!isUuid(workstation.workstationId) || !item.entityId || !isUuid(item.entityId)) {
    issues.push(blocker("workstation_uuid_invalid", session, item, workstation, "Workstation shell and execution-item entity identities must be UUIDs."));
  }
  if (workstation.clinicId !== command.clinicId || workstation.clinicId !== session.clinicId) {
    issues.push(blocker("workstation_clinic_mismatch", session, item, workstation, "Workstation shell does not belong to the execution clinic."));
  }
  if (!workstation.deploymentWorkstationKey || workstation.deploymentWorkstationKey !== item.deploymentKey) {
    issues.push(blocker("workstation_identity_mismatch", session, item, workstation, "Workstation shell deployment identity does not match item evidence."));
  }
  if (workstation.provisioningSource !== "setup_draft") {
    issues.push(blocker("workstation_provisioning_source_invalid", session, item, workstation, "Workstation shell must be sourced from setup_draft."));
  }
  if (workstation.provisioningStatus !== "active") {
    issues.push(blocker("workstation_provisioning_status_invalid", session, item, workstation, "Workstation shell must already be active before item completion."));
  }
  if (workstation.active !== true) {
    issues.push(blocker("workstation_active_state_invalid", session, item, workstation, "Workstation shell must already be active before item completion."));
  }
  if (!targetStateMatchesWorkstation(item.targetState, workstation)) {
    issues.push(blocker("workstation_target_state_mismatch", session, item, workstation, "Workstation shell durable state does not match item target state."));
  }

  return issues;
}

function validateDependencies(
  session: DeploymentWorkstationShellExecutionItemCompletionSessionSnapshot,
  item: DeploymentWorkstationShellExecutionItemCompletionItemSnapshot,
  items: readonly DeploymentWorkstationShellExecutionItemCompletionItemSnapshot[],
): DeploymentWorkstationShellExecutionItemCompletionIssue[] {
  const issues: DeploymentWorkstationShellExecutionItemCompletionIssue[] = [];
  const dependencies = item.dependencyKeys;

  if (!Array.isArray(dependencies)) {
    return [blocker("dependency_integrity_invalid", session, item, null, "Dependency evidence is malformed.")];
  }

  if (new Set(dependencies).size !== dependencies.length) {
    issues.push(blocker("duplicate_dependency_keys", session, item, null, "Workstation-shell item has duplicate dependency keys."));
  }

  for (const dependencyKey of dependencies) {
    if (dependencyKey === item.planItemKey) {
      issues.push(blocker("self_dependency", session, item, null, "Workstation-shell item depends on itself."));
      continue;
    }

    const dependency = items.find((current) => current.planItemKey === dependencyKey) ?? null;
    if (!dependency) {
      issues.push(blocker("missing_dependency", session, item, null, "Workstation-shell item dependency is missing."));
      continue;
    }
    if (dependency.sequence >= item.sequence) {
      issues.push(blocker("later_dependency", session, item, null, "Workstation-shell item dependency is not an earlier item."));
    }
    if (dependency.executionStatus !== "succeeded") {
      issues.push(blocker("pending_dependency", session, item, null, "Workstation-shell item dependency has not succeeded."));
    }
  }

  return issues;
}

function validatePriorPrefix(
  session: DeploymentWorkstationShellExecutionItemCompletionSessionSnapshot,
  item: DeploymentWorkstationShellExecutionItemCompletionItemSnapshot,
  items: readonly DeploymentWorkstationShellExecutionItemCompletionItemSnapshot[],
): DeploymentWorkstationShellExecutionItemCompletionIssue[] {
  const issues: DeploymentWorkstationShellExecutionItemCompletionIssue[] = [];
  const priorItems = items.filter((current) => current.sequence < item.sequence).sort(compareItems);

  for (let index = 0; index < priorItems.length; index += 1) {
    const current = priorItems[index];
    if (current.sequence !== index + 1 || current.executionStatus !== "succeeded") {
      issues.push(blocker("non_contiguous_succeeded_prefix", session, current, null, "Prior execution items do not form a contiguous succeeded prefix."));
      continue;
    }
    issues.push(...validateSucceededItem(session, current));
  }

  return issues;
}

function validateSucceededItem(
  session: DeploymentWorkstationShellExecutionItemCompletionSessionSnapshot,
  item: DeploymentWorkstationShellExecutionItemCompletionItemSnapshot,
): DeploymentWorkstationShellExecutionItemCompletionIssue[] {
  const issues: DeploymentWorkstationShellExecutionItemCompletionIssue[] = [];

  if (item.attemptCount !== 1) {
    issues.push(blocker("succeeded_item_attempt_invalid", session, item, null, "Succeeded prior item must have exactly one attempt."));
  }
  if (!item.startedAt || !isValidTimestamp(item.startedAt) || !item.completedAt || !isValidTimestamp(item.completedAt)) {
    issues.push(blocker("succeeded_item_timestamp_missing", session, item, null, "Succeeded prior item requires valid started_at and completed_at evidence."));
  } else if (Date.parse(item.completedAt) < Date.parse(item.startedAt)) {
    issues.push(blocker("succeeded_item_completion_before_start", session, item, null, "Succeeded prior item completed before it started."));
  }
  if (item.rolledBackAt !== null) {
    issues.push(blocker("succeeded_item_rollback_evidence_present", session, item, null, "Succeeded prior item has rollback evidence."));
  }
  if (item.errorCode !== null || item.errorMessage !== null) {
    issues.push(blocker("succeeded_item_error_present", session, item, null, "Succeeded prior item has error evidence."));
  }

  return issues;
}

function validateLaterItems(
  session: DeploymentWorkstationShellExecutionItemCompletionSessionSnapshot,
  item: DeploymentWorkstationShellExecutionItemCompletionItemSnapshot,
  items: readonly DeploymentWorkstationShellExecutionItemCompletionItemSnapshot[],
): DeploymentWorkstationShellExecutionItemCompletionIssue[] {
  const issues: DeploymentWorkstationShellExecutionItemCompletionIssue[] = [];

  for (const later of items.filter((current) => current.sequence > item.sequence)) {
    if (later.executionStatus !== "pending" || later.attemptCount !== 0 || later.startedAt !== null || later.completedAt !== null || later.rolledBackAt !== null || later.errorCode !== null || later.errorMessage !== null) {
      issues.push(blocker("later_item_drift", session, later, null, "Later execution item has lifecycle drift."));
    }
  }

  return issues;
}

function buildResult(input: {
  status: DeploymentWorkstationShellExecutionItemCompletionStatus;
  command: DeploymentWorkstationShellExecutionItemCompletionCommand;
  snapshot: DeploymentWorkstationShellExecutionItemCompletionSnapshot;
  issues: readonly DeploymentWorkstationShellExecutionItemCompletionIssue[];
  message: string;
}): DeploymentWorkstationShellExecutionItemCompletionResult {
  const issues = [...input.issues].sort(compareIssues);
  const item = input.snapshot.item;
  const workstation = input.snapshot.workstation;
  const session = input.snapshot.session;

  return {
    ok: input.status === "completable" || input.status === "already_completed",
    status: input.status,
    claimantId: input.command.claimantId || null,
    clinicId: workstation?.clinicId ?? session?.clinicId ?? input.command.clinicId ?? null,
    deploymentRunId: session?.deploymentRunId ?? input.command.deploymentRunId ?? null,
    sessionId: session?.sessionId ?? input.command.sessionId ?? null,
    executionKey: session?.executionKey ?? input.command.executionKey ?? null,
    itemId: item?.itemId ?? null,
    executionItemKey: item?.executionItemKey ?? null,
    planItemKey: item?.planItemKey ?? null,
    sequence: item?.sequence ?? null,
    entityType: item?.entityType ?? null,
    entityId: item?.entityId ?? null,
    deploymentWorkstationKey: workstation?.deploymentWorkstationKey ?? item?.deploymentKey ?? null,
    action: item?.action ?? null,
    itemStatusBefore: item?.executionStatus ?? null,
    itemStatusAfter: input.status === "completable" ? "succeeded" : item?.executionStatus ?? null,
    attemptCount: item?.attemptCount ?? 0,
    startedAt: item?.startedAt ?? null,
    completedAt: input.status === "completable" ? input.command.proposedCompletedAt : item?.completedAt ?? null,
    workstationId: workstation?.workstationId ?? null,
    workstationStatus: workstation?.provisioningStatus ?? null,
    workstationActive: workstation?.active ?? null,
    completionResult: input.status === "completable" ? "proposed" : input.status === "already_completed" ? "reused" : null,
    completableCount: input.status === "completable" ? 1 : 0,
    reusedCount: input.status === "already_completed" ? 1 : 0,
    conflicts: input.status === "conflict" ? 1 : 0,
    blockers: issues.filter((issue) => issue.severity === "blocker").length,
    warnings: issues.filter((issue) => issue.severity === "warning").length,
    issues,
    downstream: zeroDownstream(),
    message: input.message,
  };
}

function standardWarnings(
  session: DeploymentWorkstationShellExecutionItemCompletionSessionSnapshot,
  item: DeploymentWorkstationShellExecutionItemCompletionItemSnapshot,
  workstation: DeploymentWorkstationShellExecutionItemCompletionWorkstationSnapshot,
): DeploymentWorkstationShellExecutionItemCompletionIssue[] {
  return [
    issue("workstation_item_completion_persistence_unavailable", "warning", session, item, workstation, "Workstation item-completion persistence is future work; this assessment is read-only."),
    issue("dependency_progression_after_workstation_completion_unavailable", "warning", session, item, workstation, "Dependency progression after workstation completion is future work."),
    issue("next_workstation_item_start_unavailable", "warning", session, item, workstation, "Starting the next workstation item is future work."),
    issue("rollback_execution_unavailable", "warning", session, item, workstation, "Rollback execution is future work."),
  ];
}

function targetStateMatchesWorkstation(
  targetState: Record<string, unknown> | null,
  workstation: DeploymentWorkstationShellExecutionItemCompletionWorkstationSnapshot,
): boolean {
  if (!targetState) return false;
  const keys = Object.keys(targetState).sort();
  return keys.length === 2 && keys[0] === "active" && keys[1] === "provisioningStatus" &&
    stringField(targetState, "provisioningStatus") === workstation.provisioningStatus &&
    targetState.active === workstation.active;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function statusForIssues(
  issues: readonly DeploymentWorkstationShellExecutionItemCompletionIssue[],
): "blocked" | "conflict" | "not_found" {
  if (issues.some((issue) => ["missing_session", "missing_item", "missing_workstation_shell"].includes(issue.code))) {
    return "not_found";
  }
  return issues.some((issue) => [
    "clinic_identity_mismatch",
    "deployment_run_identity_mismatch",
    "session_identity_mismatch",
    "execution_key_mismatch",
    "session_owned_by_another_executor",
    "ownership_token_mismatch",
    "item_session_mismatch",
    "item_identity_mismatch",
    "workstation_clinic_mismatch",
    "workstation_identity_mismatch",
  ].includes(issue.code)) ? "conflict" : "blocked";
}

function addCommandIssue(
  issues: DeploymentWorkstationShellExecutionItemCompletionIssue[],
  condition: boolean,
  code: DeploymentWorkstationShellExecutionItemCompletionIssueCode,
  command: DeploymentWorkstationShellExecutionItemCompletionCommand,
  message: string,
): void {
  if (condition) {
    issues.push(commandIssue(code, command, message));
  }
}

function commandIssue(
  code: DeploymentWorkstationShellExecutionItemCompletionIssueCode,
  command: DeploymentWorkstationShellExecutionItemCompletionCommand,
  message: string,
): DeploymentWorkstationShellExecutionItemCompletionIssue {
  return {
    code,
    severity: "blocker",
    message: redactToken(message, command.ownershipToken),
    sessionId: command.sessionId,
    executionKey: command.executionKey,
    executionItemKey: null,
    planItemKey: null,
    workstationId: null,
    deploymentWorkstationKey: null,
    sequence: null,
  };
}

function blocker(
  code: DeploymentWorkstationShellExecutionItemCompletionIssueCode,
  session: DeploymentWorkstationShellExecutionItemCompletionSessionSnapshot,
  item: DeploymentWorkstationShellExecutionItemCompletionItemSnapshot | null,
  workstation: DeploymentWorkstationShellExecutionItemCompletionWorkstationSnapshot | null,
  message: string,
): DeploymentWorkstationShellExecutionItemCompletionIssue {
  return issue(code, "blocker", session, item, workstation, message);
}

function issue(
  code: DeploymentWorkstationShellExecutionItemCompletionIssueCode,
  severity: DeploymentWorkstationShellExecutionItemCompletionIssueSeverity,
  session: DeploymentWorkstationShellExecutionItemCompletionSessionSnapshot,
  item: DeploymentWorkstationShellExecutionItemCompletionItemSnapshot | null,
  workstation: DeploymentWorkstationShellExecutionItemCompletionWorkstationSnapshot | null,
  message: string,
): DeploymentWorkstationShellExecutionItemCompletionIssue {
  return {
    code,
    severity,
    message,
    sessionId: session.sessionId,
    executionKey: session.executionKey,
    executionItemKey: item?.executionItemKey ?? null,
    planItemKey: item?.planItemKey ?? null,
    workstationId: workstation?.workstationId ?? null,
    deploymentWorkstationKey: workstation?.deploymentWorkstationKey ?? item?.deploymentKey ?? null,
    sequence: item?.sequence ?? null,
  };
}

function compareItems(
  left: DeploymentWorkstationShellExecutionItemCompletionItemSnapshot,
  right: DeploymentWorkstationShellExecutionItemCompletionItemSnapshot,
): number {
  return left.sequence - right.sequence || left.executionItemKey.localeCompare(right.executionItemKey);
}

function compareIssues(
  left: DeploymentWorkstationShellExecutionItemCompletionIssue,
  right: DeploymentWorkstationShellExecutionItemCompletionIssue,
): number {
  return left.severity.localeCompare(right.severity) ||
    left.code.localeCompare(right.code) ||
    Number(left.sequence ?? 0) - Number(right.sequence ?? 0) ||
    String(left.sessionId ?? "").localeCompare(String(right.sessionId ?? "")) ||
    String(left.executionItemKey ?? "").localeCompare(String(right.executionItemKey ?? "")) ||
    String(left.planItemKey ?? "").localeCompare(String(right.planItemKey ?? ""));
}

function hasBlocker(issues: readonly DeploymentWorkstationShellExecutionItemCompletionIssue[]): boolean {
  return issues.some((issue) => issue.severity === "blocker");
}

function isValidTimestamp(value: string): boolean {
  return Number.isFinite(Date.parse(value));
}

function stringField(source: Record<string, unknown> | null, key: string): string | null {
  const value = source?.[key];
  return typeof value === "string" && value.trim() ? value : null;
}

function redactToken(value: string, token: string): string {
  return token ? value.split(token).join("[redacted]") : value;
}

function zeroDownstream(): DeploymentWorkstationShellExecutionItemCompletionDownstreamCounts {
  return {
    itemsCompleted: 0,
    dependenciesProgressed: 0,
    nextItemsStarted: 0,
    providersActivated: 0,
    sterilizersActivated: 0,
    workstationsActivated: 0,
    hardwareActivated: 0,
    bindingsWritten: 0,
    sessionsCompleted: 0,
    rollbacksExecuted: 0,
    deploymentFinalized: 0,
  };
}

function emptySnapshot(): DeploymentWorkstationShellExecutionItemCompletionSnapshot {
  return {
    session: null,
    item: null,
    items: [],
    workstation: null,
    aggregate: emptyWorkstationShellExecutionItemCompletionAggregate(),
  };
}
