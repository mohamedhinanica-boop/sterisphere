import type {
  DeploymentSterilizerShellExecutionItemCompletionRepository,
} from "./deployment-sterilizer-shell-execution-item-completion-repository";
import {
  cloneSterilizerShellExecutionItemCompletionSnapshot,
  emptySterilizerShellExecutionItemCompletionAggregate,
  type DeploymentSterilizerShellExecutionItemCompletionAggregateSnapshot,
  type DeploymentSterilizerShellExecutionItemCompletionCommand,
  type DeploymentSterilizerShellExecutionItemCompletionDownstreamCounts,
  type DeploymentSterilizerShellExecutionItemCompletionIssue,
  type DeploymentSterilizerShellExecutionItemCompletionIssueCode,
  type DeploymentSterilizerShellExecutionItemCompletionIssueSeverity,
  type DeploymentSterilizerShellExecutionItemCompletionItemSnapshot,
  type DeploymentSterilizerShellExecutionItemCompletionSterilizerSnapshot,
  type DeploymentSterilizerShellExecutionItemCompletionResult,
  type DeploymentSterilizerShellExecutionItemCompletionSessionSnapshot,
  type DeploymentSterilizerShellExecutionItemCompletionSnapshot,
  type DeploymentSterilizerShellExecutionItemCompletionStatus,
} from "./deployment-sterilizer-shell-execution-item-completion-types";

type CompletionMode = "completable" | "already_completed";

export class DeploymentSterilizerShellExecutionItemCompletionService {
  constructor(
    private readonly repository: DeploymentSterilizerShellExecutionItemCompletionRepository,
  ) {}

  async assessSterilizerShellExecutionItemCompletion(
    command: DeploymentSterilizerShellExecutionItemCompletionCommand,
  ): Promise<DeploymentSterilizerShellExecutionItemCompletionResult> {
    const commandIssues = validateCommand(command);

    if (hasBlocker(commandIssues)) {
      return buildResult({
        status: "blocked",
        command,
        snapshot: emptySnapshot(),
        issues: commandIssues,
        message: "Sterilizer-shell execution-item completion assessment rejected invalid input before repository access.",
      });
    }

    try {
      const snapshot = cloneSterilizerShellExecutionItemCompletionSnapshot(
        await this.repository.loadSterilizerShellExecutionItemCompletionSnapshot({
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
        : "Sterilizer-shell execution-item completion repository failed safely.";
      return buildResult({
        status: "error",
        command,
        snapshot: emptySnapshot(),
        issues: [commandIssue("repository_error", command, message)],
        message: "Sterilizer-shell execution-item completion assessment could not complete because repository evidence was unavailable.",
      });
    }
  }
}

export function createDeploymentSterilizerShellExecutionItemCompletionService(
  repository: DeploymentSterilizerShellExecutionItemCompletionRepository,
): DeploymentSterilizerShellExecutionItemCompletionService {
  return new DeploymentSterilizerShellExecutionItemCompletionService(repository);
}

function assessSnapshot(
  command: DeploymentSterilizerShellExecutionItemCompletionCommand,
  snapshot: DeploymentSterilizerShellExecutionItemCompletionSnapshot,
): DeploymentSterilizerShellExecutionItemCompletionResult {
  const presenceIssues = validatePresence(command, snapshot);
  if (hasBlocker(presenceIssues)) {
    return buildResult({
      status: "not_found",
      command,
      snapshot,
      issues: presenceIssues,
      message: "Sterilizer-shell execution-item completion assessment found missing session, item, or sterilizer evidence.",
    });
  }

  const session = snapshot.session as DeploymentSterilizerShellExecutionItemCompletionSessionSnapshot;
  const item = snapshot.item as DeploymentSterilizerShellExecutionItemCompletionItemSnapshot;
  const sterilizer = snapshot.sterilizer as DeploymentSterilizerShellExecutionItemCompletionSterilizerSnapshot;
  const mode: CompletionMode = item.executionStatus === "succeeded" ? "already_completed" : "completable";
  const orderedItems = [...snapshot.items].sort(compareItems);
  const issues = [
    ...validateSession(command, session),
    ...validateAggregate(session, snapshot.aggregate, mode),
    ...validateItem(command, session, item, sterilizer, snapshot.aggregate, mode),
    ...validateSterilizer(command, session, item, sterilizer),
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
      message: "Sterilizer-shell execution-item completion assessment blocked because completion evidence is not safe.",
    });
  }

  return buildResult({
    status: mode,
    command,
    snapshot,
    issues: standardWarnings(session, item, sterilizer),
    message: mode === "already_completed"
      ? "Sterilizer-shell activation execution item is already completed. No item mutation was performed."
      : "Sterilizer-shell activation execution item is completable. No item completion was persisted.",
  });
}

function validateCommand(
  command: DeploymentSterilizerShellExecutionItemCompletionCommand,
): DeploymentSterilizerShellExecutionItemCompletionIssue[] {
  const issues: DeploymentSterilizerShellExecutionItemCompletionIssue[] = [];

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
  command: DeploymentSterilizerShellExecutionItemCompletionCommand,
  snapshot: DeploymentSterilizerShellExecutionItemCompletionSnapshot,
): DeploymentSterilizerShellExecutionItemCompletionIssue[] {
  const issues: DeploymentSterilizerShellExecutionItemCompletionIssue[] = [];

  if (!snapshot.session) {
    issues.push(commandIssue("missing_session", command, "Activation execution session was not found."));
  }
  if (!snapshot.item) {
    issues.push(commandIssue("missing_item", command, "Sterilizer-shell activation execution item was not found."));
  }
  if (!snapshot.sterilizer) {
    issues.push(commandIssue("missing_sterilizer_shell", command, "Activated sterilizer shell evidence was not found."));
  }

  return issues.sort(compareIssues);
}

function validateSession(
  command: DeploymentSterilizerShellExecutionItemCompletionCommand,
  session: DeploymentSterilizerShellExecutionItemCompletionSessionSnapshot,
): DeploymentSterilizerShellExecutionItemCompletionIssue[] {
  const issues: DeploymentSterilizerShellExecutionItemCompletionIssue[] = [];

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
  session: DeploymentSterilizerShellExecutionItemCompletionSessionSnapshot,
  aggregate: DeploymentSterilizerShellExecutionItemCompletionAggregateSnapshot,
  mode: CompletionMode,
): DeploymentSterilizerShellExecutionItemCompletionIssue[] {
  const issues: DeploymentSterilizerShellExecutionItemCompletionIssue[] = [];
  const expectedRunning = mode === "completable" ? 1 : 0;

  if (aggregate.totalItemCount !== session.itemsRequested || aggregate.totalItemCount < 1) {
    issues.push(blocker("item_count_mismatch", session, null, null, "Durable execution item count does not match requested item evidence."));
  }
  if (aggregate.runningItemCount !== expectedRunning || aggregate.runningSterilizerItemCount !== expectedRunning) {
    issues.push(blocker(expectedRunning === 1 ? "no_running_item" : "multiple_running_items", session, null, null, "Running sterilizer execution item evidence is not deterministic."));
  }
  if (aggregate.runningItemCount > 1 || aggregate.runningSterilizerItemCount > 1) {
    issues.push(blocker("multiple_running_items", session, null, null, "More than one execution item is running."));
  }
  if (aggregate.readyItemCount > 0) {
    issues.push(blocker("ready_item_ambiguity", session, null, null, "A ready item exists while sterilizer completion is being assessed."));
  }
  if (aggregate.failedItemCount > 0) {
    issues.push(blocker("later_item_drift", session, null, null, "Execution items include failed evidence."));
  }
  if (aggregate.duplicateExecutionItemKeyCount > 0 || aggregate.duplicatePlanItemKeyCount > 0 || aggregate.duplicateSequenceCount > 0) {
    issues.push(blocker("duplicate_item_identity", session, null, null, "Duplicate execution item identity prevents sterilizer item completion."));
  }
  if (aggregate.duplicateSterilizerDeploymentIdentityCount > 0) {
    issues.push(blocker("duplicate_sterilizer_identity", session, null, null, "Duplicate sterilizer deployment identity prevents sterilizer item completion."));
  }
  if (aggregate.unexpectedTouchedLaterItemCount > 0) {
    issues.push(blocker("later_item_drift", session, null, null, "Later execution item evidence is not clean."));
  }

  return issues;
}

function validateItem(
  command: DeploymentSterilizerShellExecutionItemCompletionCommand,
  session: DeploymentSterilizerShellExecutionItemCompletionSessionSnapshot,
  item: DeploymentSterilizerShellExecutionItemCompletionItemSnapshot,
  sterilizer: DeploymentSterilizerShellExecutionItemCompletionSterilizerSnapshot,
  aggregate: DeploymentSterilizerShellExecutionItemCompletionAggregateSnapshot,
  mode: CompletionMode,
): DeploymentSterilizerShellExecutionItemCompletionIssue[] {
  const issues: DeploymentSterilizerShellExecutionItemCompletionIssue[] = [];
  const expectedSequence = mode === "already_completed"
    ? aggregate.priorSucceededPrefixCount
    : aggregate.priorSucceededPrefixCount + 1;

  if (item.sessionId !== session.sessionId) {
    issues.push(blocker("item_session_mismatch", session, item, sterilizer, "Execution item does not belong to the execution session."));
  }
  if (item.sequence !== expectedSequence) {
    issues.push(blocker("wrong_running_item", session, item, sterilizer, "Sterilizer item is not the deterministic next sequence after the succeeded prefix."));
  }
  if (item.entityType !== "sterilizer_shell") {
    issues.push(blocker("wrong_entity_type", session, item, sterilizer, "Only sterilizer-shell execution items are completion-eligible."));
  }
  if (item.action !== "activate") {
    issues.push(blocker("wrong_action", session, item, sterilizer, "Only activate action items are completion-eligible."));
  }
  if (mode === "completable" && item.executionStatus !== "running") {
    issues.push(blocker("item_not_running", session, item, sterilizer, "Sterilizer-shell activation item is not running."));
  }
  if (mode === "already_completed" && item.executionStatus !== "succeeded") {
    issues.push(blocker("item_not_succeeded", session, item, sterilizer, "Sterilizer-shell activation item is not succeeded."));
  }
  if (item.attemptCount !== 1) {
    issues.push(blocker("item_attempt_invalid", session, item, sterilizer, "Sterilizer-shell completion requires exactly one item attempt."));
  }
  if (!item.startedAt || !isValidTimestamp(item.startedAt)) {
    issues.push(blocker("item_started_at_missing", session, item, sterilizer, "Sterilizer-shell item is missing valid started_at evidence."));
  }
  if (mode === "completable" && item.completedAt !== null) {
    issues.push(blocker("item_completed_timestamp_present", session, item, sterilizer, "Completable sterilizer-shell item already has completed_at evidence."));
  }
  if (mode === "already_completed") {
    if (!item.completedAt || !isValidTimestamp(item.completedAt)) {
      issues.push(blocker("item_completed_timestamp_missing", session, item, sterilizer, "Already-completed sterilizer-shell item requires completed_at evidence."));
    } else if (item.startedAt && Date.parse(item.completedAt) < Date.parse(item.startedAt)) {
      issues.push(blocker("item_completion_before_start", session, item, sterilizer, "Sterilizer-shell item completed before it started."));
    }
  }
  if (item.rolledBackAt !== null) {
    issues.push(blocker("item_rollback_evidence_present", session, item, sterilizer, "Sterilizer-shell item has rollback evidence."));
  }
  if (item.errorCode !== null || item.errorMessage !== null) {
    issues.push(blocker("item_error_present", session, item, sterilizer, "Sterilizer-shell item has error evidence."));
  }
  if (item.entityId !== sterilizer.sterilizerId) {
    issues.push(blocker("sterilizer_identity_mismatch", session, item, sterilizer, "Sterilizer-shell item entity id does not match sterilizer id."));
  }
  if (item.deploymentKey !== sterilizer.deploymentSterilizerKey) {
    issues.push(blocker("sterilizer_identity_mismatch", session, item, sterilizer, "Sterilizer-shell item deployment key does not match sterilizer deployment key."));
  }

  return issues;
}

function validateSterilizer(
  command: DeploymentSterilizerShellExecutionItemCompletionCommand,
  session: DeploymentSterilizerShellExecutionItemCompletionSessionSnapshot,
  item: DeploymentSterilizerShellExecutionItemCompletionItemSnapshot,
  sterilizer: DeploymentSterilizerShellExecutionItemCompletionSterilizerSnapshot,
): DeploymentSterilizerShellExecutionItemCompletionIssue[] {
  const issues: DeploymentSterilizerShellExecutionItemCompletionIssue[] = [];

  if (sterilizer.clinicId !== command.clinicId || sterilizer.clinicId !== session.clinicId) {
    issues.push(blocker("sterilizer_clinic_mismatch", session, item, sterilizer, "Sterilizer shell does not belong to the execution clinic."));
  }
  if (!sterilizer.deploymentSterilizerKey || sterilizer.deploymentSterilizerKey !== item.deploymentKey) {
    issues.push(blocker("sterilizer_identity_mismatch", session, item, sterilizer, "Sterilizer shell deployment identity does not match item evidence."));
  }
  if (sterilizer.provisioningSource !== "setup_draft") {
    issues.push(blocker("sterilizer_provisioning_source_invalid", session, item, sterilizer, "Sterilizer shell must be sourced from setup_draft."));
  }
  if (sterilizer.provisioningStatus !== "active") {
    issues.push(blocker("sterilizer_provisioning_status_invalid", session, item, sterilizer, "Sterilizer shell must already be active before item completion."));
  }
  if (sterilizer.active !== true) {
    issues.push(blocker("sterilizer_active_state_invalid", session, item, sterilizer, "Sterilizer shell must already be active before item completion."));
  }
  if (!targetStateMatchesSterilizer(item.targetState, sterilizer)) {
    issues.push(blocker("sterilizer_target_state_mismatch", session, item, sterilizer, "Sterilizer shell durable state does not match item target state."));
  }

  return issues;
}

function validateDependencies(
  session: DeploymentSterilizerShellExecutionItemCompletionSessionSnapshot,
  item: DeploymentSterilizerShellExecutionItemCompletionItemSnapshot,
  items: readonly DeploymentSterilizerShellExecutionItemCompletionItemSnapshot[],
): DeploymentSterilizerShellExecutionItemCompletionIssue[] {
  const issues: DeploymentSterilizerShellExecutionItemCompletionIssue[] = [];
  const dependencies = item.dependencyKeys;

  if (!Array.isArray(dependencies)) {
    return [blocker("dependency_integrity_invalid", session, item, null, "Dependency evidence is malformed.")];
  }

  if (new Set(dependencies).size !== dependencies.length) {
    issues.push(blocker("duplicate_dependency_keys", session, item, null, "Sterilizer-shell item has duplicate dependency keys."));
  }

  for (const dependencyKey of dependencies) {
    if (dependencyKey === item.planItemKey) {
      issues.push(blocker("self_dependency", session, item, null, "Sterilizer-shell item depends on itself."));
      continue;
    }

    const dependency = items.find((current) => current.planItemKey === dependencyKey) ?? null;
    if (!dependency) {
      issues.push(blocker("missing_dependency", session, item, null, "Sterilizer-shell item dependency is missing."));
      continue;
    }
    if (dependency.sequence >= item.sequence) {
      issues.push(blocker("later_dependency", session, item, null, "Sterilizer-shell item dependency is not an earlier item."));
    }
    if (dependency.executionStatus !== "succeeded") {
      issues.push(blocker("pending_dependency", session, item, null, "Sterilizer-shell item dependency has not succeeded."));
    }
  }

  return issues;
}

function validatePriorPrefix(
  session: DeploymentSterilizerShellExecutionItemCompletionSessionSnapshot,
  item: DeploymentSterilizerShellExecutionItemCompletionItemSnapshot,
  items: readonly DeploymentSterilizerShellExecutionItemCompletionItemSnapshot[],
): DeploymentSterilizerShellExecutionItemCompletionIssue[] {
  const issues: DeploymentSterilizerShellExecutionItemCompletionIssue[] = [];
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
  session: DeploymentSterilizerShellExecutionItemCompletionSessionSnapshot,
  item: DeploymentSterilizerShellExecutionItemCompletionItemSnapshot,
): DeploymentSterilizerShellExecutionItemCompletionIssue[] {
  const issues: DeploymentSterilizerShellExecutionItemCompletionIssue[] = [];

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
  session: DeploymentSterilizerShellExecutionItemCompletionSessionSnapshot,
  item: DeploymentSterilizerShellExecutionItemCompletionItemSnapshot,
  items: readonly DeploymentSterilizerShellExecutionItemCompletionItemSnapshot[],
): DeploymentSterilizerShellExecutionItemCompletionIssue[] {
  const issues: DeploymentSterilizerShellExecutionItemCompletionIssue[] = [];

  for (const later of items.filter((current) => current.sequence > item.sequence)) {
    if (later.executionStatus !== "pending" || later.attemptCount !== 0 || later.startedAt !== null || later.completedAt !== null || later.rolledBackAt !== null || later.errorCode !== null || later.errorMessage !== null) {
      issues.push(blocker("later_item_drift", session, later, null, "Later execution item has lifecycle drift."));
    }
  }

  return issues;
}

function buildResult(input: {
  status: DeploymentSterilizerShellExecutionItemCompletionStatus;
  command: DeploymentSterilizerShellExecutionItemCompletionCommand;
  snapshot: DeploymentSterilizerShellExecutionItemCompletionSnapshot;
  issues: readonly DeploymentSterilizerShellExecutionItemCompletionIssue[];
  message: string;
}): DeploymentSterilizerShellExecutionItemCompletionResult {
  const issues = [...input.issues].sort(compareIssues);
  const item = input.snapshot.item;
  const sterilizer = input.snapshot.sterilizer;
  const session = input.snapshot.session;

  return {
    ok: input.status === "completable" || input.status === "already_completed",
    status: input.status,
    claimantId: input.command.claimantId || null,
    clinicId: sterilizer?.clinicId ?? session?.clinicId ?? input.command.clinicId ?? null,
    deploymentRunId: session?.deploymentRunId ?? input.command.deploymentRunId ?? null,
    sessionId: session?.sessionId ?? input.command.sessionId ?? null,
    executionKey: session?.executionKey ?? input.command.executionKey ?? null,
    itemId: item?.itemId ?? null,
    executionItemKey: item?.executionItemKey ?? null,
    planItemKey: item?.planItemKey ?? null,
    sequence: item?.sequence ?? null,
    entityType: item?.entityType ?? null,
    entityId: item?.entityId ?? null,
    deploymentSterilizerKey: sterilizer?.deploymentSterilizerKey ?? item?.deploymentKey ?? null,
    action: item?.action ?? null,
    itemStatusBefore: item?.executionStatus ?? null,
    itemStatusAfter: input.status === "completable" ? "succeeded" : item?.executionStatus ?? null,
    attemptCount: item?.attemptCount ?? 0,
    startedAt: item?.startedAt ?? null,
    completedAt: input.status === "completable" ? input.command.proposedCompletedAt : item?.completedAt ?? null,
    sterilizerId: sterilizer?.sterilizerId ?? null,
    sterilizerStatus: sterilizer?.provisioningStatus ?? null,
    sterilizerActive: sterilizer?.active ?? null,
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
  session: DeploymentSterilizerShellExecutionItemCompletionSessionSnapshot,
  item: DeploymentSterilizerShellExecutionItemCompletionItemSnapshot,
  sterilizer: DeploymentSterilizerShellExecutionItemCompletionSterilizerSnapshot,
): DeploymentSterilizerShellExecutionItemCompletionIssue[] {
  return [
    issue("sterilizer_item_completion_persistence_unavailable", "warning", session, item, sterilizer, "Sterilizer item-completion persistence is future work; this assessment is read-only."),
    issue("dependency_progression_after_sterilizer_completion_unavailable", "warning", session, item, sterilizer, "Dependency progression after sterilizer completion is future work."),
    issue("next_sterilizer_item_start_unavailable", "warning", session, item, sterilizer, "Starting the next sterilizer item is future work."),
    issue("rollback_execution_unavailable", "warning", session, item, sterilizer, "Rollback execution is future work."),
  ];
}

function targetStateMatchesSterilizer(
  targetState: Record<string, unknown> | null,
  sterilizer: DeploymentSterilizerShellExecutionItemCompletionSterilizerSnapshot,
): boolean {
  return stringField(targetState, "provisioningStatus") === sterilizer.provisioningStatus &&
    targetState?.active === sterilizer.active;
}

function statusForIssues(
  issues: readonly DeploymentSterilizerShellExecutionItemCompletionIssue[],
): "blocked" | "conflict" | "not_found" {
  if (issues.some((issue) => ["missing_session", "missing_item", "missing_sterilizer_shell"].includes(issue.code))) {
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
    "sterilizer_clinic_mismatch",
    "sterilizer_identity_mismatch",
  ].includes(issue.code)) ? "conflict" : "blocked";
}

function addCommandIssue(
  issues: DeploymentSterilizerShellExecutionItemCompletionIssue[],
  condition: boolean,
  code: DeploymentSterilizerShellExecutionItemCompletionIssueCode,
  command: DeploymentSterilizerShellExecutionItemCompletionCommand,
  message: string,
): void {
  if (condition) {
    issues.push(commandIssue(code, command, message));
  }
}

function commandIssue(
  code: DeploymentSterilizerShellExecutionItemCompletionIssueCode,
  command: DeploymentSterilizerShellExecutionItemCompletionCommand,
  message: string,
): DeploymentSterilizerShellExecutionItemCompletionIssue {
  return {
    code,
    severity: "blocker",
    message: redactToken(message, command.ownershipToken),
    sessionId: command.sessionId,
    executionKey: command.executionKey,
    executionItemKey: null,
    planItemKey: null,
    sterilizerId: null,
    deploymentSterilizerKey: null,
    sequence: null,
  };
}

function blocker(
  code: DeploymentSterilizerShellExecutionItemCompletionIssueCode,
  session: DeploymentSterilizerShellExecutionItemCompletionSessionSnapshot,
  item: DeploymentSterilizerShellExecutionItemCompletionItemSnapshot | null,
  sterilizer: DeploymentSterilizerShellExecutionItemCompletionSterilizerSnapshot | null,
  message: string,
): DeploymentSterilizerShellExecutionItemCompletionIssue {
  return issue(code, "blocker", session, item, sterilizer, message);
}

function issue(
  code: DeploymentSterilizerShellExecutionItemCompletionIssueCode,
  severity: DeploymentSterilizerShellExecutionItemCompletionIssueSeverity,
  session: DeploymentSterilizerShellExecutionItemCompletionSessionSnapshot,
  item: DeploymentSterilizerShellExecutionItemCompletionItemSnapshot | null,
  sterilizer: DeploymentSterilizerShellExecutionItemCompletionSterilizerSnapshot | null,
  message: string,
): DeploymentSterilizerShellExecutionItemCompletionIssue {
  return {
    code,
    severity,
    message,
    sessionId: session.sessionId,
    executionKey: session.executionKey,
    executionItemKey: item?.executionItemKey ?? null,
    planItemKey: item?.planItemKey ?? null,
    sterilizerId: sterilizer?.sterilizerId ?? null,
    deploymentSterilizerKey: sterilizer?.deploymentSterilizerKey ?? item?.deploymentKey ?? null,
    sequence: item?.sequence ?? null,
  };
}

function compareItems(
  left: DeploymentSterilizerShellExecutionItemCompletionItemSnapshot,
  right: DeploymentSterilizerShellExecutionItemCompletionItemSnapshot,
): number {
  return left.sequence - right.sequence || left.executionItemKey.localeCompare(right.executionItemKey);
}

function compareIssues(
  left: DeploymentSterilizerShellExecutionItemCompletionIssue,
  right: DeploymentSterilizerShellExecutionItemCompletionIssue,
): number {
  return left.severity.localeCompare(right.severity) ||
    left.code.localeCompare(right.code) ||
    Number(left.sequence ?? 0) - Number(right.sequence ?? 0) ||
    String(left.sessionId ?? "").localeCompare(String(right.sessionId ?? "")) ||
    String(left.executionItemKey ?? "").localeCompare(String(right.executionItemKey ?? "")) ||
    String(left.planItemKey ?? "").localeCompare(String(right.planItemKey ?? ""));
}

function hasBlocker(issues: readonly DeploymentSterilizerShellExecutionItemCompletionIssue[]): boolean {
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

function zeroDownstream(): DeploymentSterilizerShellExecutionItemCompletionDownstreamCounts {
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

function emptySnapshot(): DeploymentSterilizerShellExecutionItemCompletionSnapshot {
  return {
    session: null,
    item: null,
    items: [],
    sterilizer: null,
    aggregate: emptySterilizerShellExecutionItemCompletionAggregate(),
  };
}
