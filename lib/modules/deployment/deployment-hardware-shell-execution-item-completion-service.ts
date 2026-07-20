import type {
  DeploymentHardwareShellExecutionItemCompletionRepository,
} from "./deployment-hardware-shell-execution-item-completion-repository";
import {
  cloneHardwareShellExecutionItemCompletionSnapshot,
  emptyHardwareShellExecutionItemCompletionAggregate,
  type DeploymentHardwareShellExecutionItemCompletionAggregateSnapshot,
  type DeploymentHardwareShellExecutionItemCompletionCommand,
  type DeploymentHardwareShellExecutionItemCompletionDownstreamCounts,
  type DeploymentHardwareShellExecutionItemCompletionIssue,
  type DeploymentHardwareShellExecutionItemCompletionIssueCode,
  type DeploymentHardwareShellExecutionItemCompletionIssueSeverity,
  type DeploymentHardwareShellExecutionItemCompletionItemSnapshot,
  type DeploymentHardwareShellExecutionItemCompletionHardwareSnapshot,
  type DeploymentHardwareShellExecutionItemCompletionResult,
  type DeploymentHardwareShellExecutionItemCompletionSessionSnapshot,
  type DeploymentHardwareShellExecutionItemCompletionSnapshot,
  type DeploymentHardwareShellExecutionItemCompletionStatus,
} from "./deployment-hardware-shell-execution-item-completion-types";

type CompletionMode = "completable" | "already_completed";

export class DeploymentHardwareShellExecutionItemCompletionService {
  constructor(
    private readonly repository: DeploymentHardwareShellExecutionItemCompletionRepository,
  ) {}

  async assessHardwareShellExecutionItemCompletion(
    command: DeploymentHardwareShellExecutionItemCompletionCommand,
  ): Promise<DeploymentHardwareShellExecutionItemCompletionResult> {
    const commandIssues = validateCommand(command);

    if (hasBlocker(commandIssues)) {
      return buildResult({
        status: "blocked",
        command,
        snapshot: emptySnapshot(),
        issues: commandIssues,
        message: "Hardware-shell execution-item completion assessment rejected invalid input before repository access.",
      });
    }

    try {
      const snapshot = cloneHardwareShellExecutionItemCompletionSnapshot(
        await this.repository.loadHardwareShellExecutionItemCompletionSnapshot({
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
        : "Hardware-shell execution-item completion repository failed safely.";
      return buildResult({
        status: "error",
        command,
        snapshot: emptySnapshot(),
        issues: [commandIssue("repository_error", command, message)],
        message: "Hardware-shell execution-item completion assessment could not complete because repository evidence was unavailable.",
      });
    }
  }
}

export function createDeploymentHardwareShellExecutionItemCompletionService(
  repository: DeploymentHardwareShellExecutionItemCompletionRepository,
): DeploymentHardwareShellExecutionItemCompletionService {
  return new DeploymentHardwareShellExecutionItemCompletionService(repository);
}

function assessSnapshot(
  command: DeploymentHardwareShellExecutionItemCompletionCommand,
  snapshot: DeploymentHardwareShellExecutionItemCompletionSnapshot,
): DeploymentHardwareShellExecutionItemCompletionResult {
  const presenceIssues = validatePresence(command, snapshot);
  if (hasBlocker(presenceIssues)) {
    return buildResult({
      status: "not_found",
      command,
      snapshot,
      issues: presenceIssues,
      message: "Hardware-shell execution-item completion assessment found missing session, item, or hardware evidence.",
    });
  }

  const session = snapshot.session as DeploymentHardwareShellExecutionItemCompletionSessionSnapshot;
  const item = snapshot.item as DeploymentHardwareShellExecutionItemCompletionItemSnapshot;
  const hardware = snapshot.hardware as DeploymentHardwareShellExecutionItemCompletionHardwareSnapshot;
  const mode: CompletionMode = item.executionStatus === "succeeded" ? "already_completed" : "completable";
  const orderedItems = [...snapshot.items].sort(compareItems);
  const issues = [
    ...validateSession(command, session),
    ...validateAggregate(session, snapshot.aggregate, mode),
    ...validateItem(command, session, item, hardware, snapshot.aggregate, mode),
    ...validateHardware(command, session, item, hardware),
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
      message: "Hardware-shell execution-item completion assessment blocked because completion evidence is not safe.",
    });
  }

  return buildResult({
    status: mode,
    command,
    snapshot,
    issues: standardWarnings(session, item, hardware),
    message: mode === "already_completed"
      ? "Hardware-shell activation execution item is already completed. No item mutation was performed."
      : "Hardware-shell activation execution item is completable. No item completion was persisted.",
  });
}

function validateCommand(
  command: DeploymentHardwareShellExecutionItemCompletionCommand,
): DeploymentHardwareShellExecutionItemCompletionIssue[] {
  const issues: DeploymentHardwareShellExecutionItemCompletionIssue[] = [];

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
  command: DeploymentHardwareShellExecutionItemCompletionCommand,
  snapshot: DeploymentHardwareShellExecutionItemCompletionSnapshot,
): DeploymentHardwareShellExecutionItemCompletionIssue[] {
  const issues: DeploymentHardwareShellExecutionItemCompletionIssue[] = [];

  if (!snapshot.session) {
    issues.push(commandIssue("missing_session", command, "Activation execution session was not found."));
  }
  if (!snapshot.item) {
    issues.push(commandIssue("missing_item", command, "Hardware-shell activation execution item was not found."));
  }
  if (!snapshot.hardware) {
    issues.push(commandIssue("missing_hardware_shell", command, "Activated hardware shell evidence was not found."));
  }

  return issues.sort(compareIssues);
}

function validateSession(
  command: DeploymentHardwareShellExecutionItemCompletionCommand,
  session: DeploymentHardwareShellExecutionItemCompletionSessionSnapshot,
): DeploymentHardwareShellExecutionItemCompletionIssue[] {
  const issues: DeploymentHardwareShellExecutionItemCompletionIssue[] = [];

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
  session: DeploymentHardwareShellExecutionItemCompletionSessionSnapshot,
  aggregate: DeploymentHardwareShellExecutionItemCompletionAggregateSnapshot,
  mode: CompletionMode,
): DeploymentHardwareShellExecutionItemCompletionIssue[] {
  const issues: DeploymentHardwareShellExecutionItemCompletionIssue[] = [];
  const expectedRunning = mode === "completable" ? 1 : 0;

  if (aggregate.totalItemCount !== session.itemsRequested || aggregate.totalItemCount < 1) {
    issues.push(blocker("item_count_mismatch", session, null, null, "Durable execution item count does not match requested item evidence."));
  }
  if (aggregate.runningItemCount !== expectedRunning || aggregate.runningHardwareItemCount !== expectedRunning) {
    issues.push(blocker(expectedRunning === 1 ? "no_running_item" : "multiple_running_items", session, null, null, "Running hardware execution item evidence is not deterministic."));
  }
  if (aggregate.runningItemCount > 1 || aggregate.runningHardwareItemCount > 1) {
    issues.push(blocker("multiple_running_items", session, null, null, "More than one execution item is running."));
  }
  if (aggregate.readyItemCount > 0) {
    issues.push(blocker("ready_item_ambiguity", session, null, null, "A ready item exists while hardware completion is being assessed."));
  }
  if (aggregate.failedItemCount > 0) {
    issues.push(blocker("later_item_drift", session, null, null, "Execution items include failed evidence."));
  }
  if (aggregate.duplicateExecutionItemKeyCount > 0 || aggregate.duplicatePlanItemKeyCount > 0 || aggregate.duplicateSequenceCount > 0) {
    issues.push(blocker("duplicate_item_identity", session, null, null, "Duplicate execution item identity prevents hardware item completion."));
  }
  if (aggregate.duplicateHardwareDeploymentIdentityCount > 0) {
    issues.push(blocker("duplicate_hardware_identity", session, null, null, "Duplicate hardware deployment identity prevents hardware item completion."));
  }
  if (aggregate.unexpectedTouchedLaterItemCount > 0) {
    issues.push(blocker("later_item_drift", session, null, null, "Later execution item evidence is not clean."));
  }

  return issues;
}

function validateItem(
  command: DeploymentHardwareShellExecutionItemCompletionCommand,
  session: DeploymentHardwareShellExecutionItemCompletionSessionSnapshot,
  item: DeploymentHardwareShellExecutionItemCompletionItemSnapshot,
  hardware: DeploymentHardwareShellExecutionItemCompletionHardwareSnapshot,
  aggregate: DeploymentHardwareShellExecutionItemCompletionAggregateSnapshot,
  mode: CompletionMode,
): DeploymentHardwareShellExecutionItemCompletionIssue[] {
  const issues: DeploymentHardwareShellExecutionItemCompletionIssue[] = [];
  const expectedSequence = mode === "already_completed"
    ? aggregate.priorSucceededPrefixCount
    : aggregate.priorSucceededPrefixCount + 1;

  if (item.sessionId !== session.sessionId) {
    issues.push(blocker("item_session_mismatch", session, item, hardware, "Execution item does not belong to the execution session."));
  }
  if (item.sequence !== expectedSequence) {
    issues.push(blocker("wrong_running_item", session, item, hardware, "Hardware item is not the deterministic next sequence after the succeeded prefix."));
  }
  if (item.entityType !== "hardware_shell") {
    issues.push(blocker("wrong_entity_type", session, item, hardware, "Only hardware-shell execution items are completion-eligible."));
  }
  if (item.action !== "activate") {
    issues.push(blocker("wrong_action", session, item, hardware, "Only activate action items are completion-eligible."));
  }
  if (mode === "completable" && item.executionStatus !== "running") {
    issues.push(blocker("item_not_running", session, item, hardware, "Hardware-shell activation item is not running."));
  }
  if (mode === "already_completed" && item.executionStatus !== "succeeded") {
    issues.push(blocker("item_not_succeeded", session, item, hardware, "Hardware-shell activation item is not succeeded."));
  }
  if (item.attemptCount !== 1) {
    issues.push(blocker("item_attempt_invalid", session, item, hardware, "Hardware-shell completion requires exactly one item attempt."));
  }
  if (!item.startedAt || !isValidTimestamp(item.startedAt)) {
    issues.push(blocker("item_started_at_missing", session, item, hardware, "Hardware-shell item is missing valid started_at evidence."));
  }
  if (mode === "completable" && item.completedAt !== null) {
    issues.push(blocker("item_completed_timestamp_present", session, item, hardware, "Completable hardware-shell item already has completed_at evidence."));
  }
  if (mode === "already_completed") {
    if (!item.completedAt || !isValidTimestamp(item.completedAt)) {
      issues.push(blocker("item_completed_timestamp_missing", session, item, hardware, "Already-completed hardware-shell item requires completed_at evidence."));
    } else if (item.startedAt && Date.parse(item.completedAt) < Date.parse(item.startedAt)) {
      issues.push(blocker("item_completion_before_start", session, item, hardware, "Hardware-shell item completed before it started."));
    }
  }
  if (item.rolledBackAt !== null) {
    issues.push(blocker("item_rollback_evidence_present", session, item, hardware, "Hardware-shell item has rollback evidence."));
  }
  if (item.errorCode !== null || item.errorMessage !== null) {
    issues.push(blocker("item_error_present", session, item, hardware, "Hardware-shell item has error evidence."));
  }
  if (item.entityId !== hardware.hardwareId) {
    issues.push(blocker("hardware_identity_mismatch", session, item, hardware, "Hardware-shell item entity id does not match hardware id."));
  }
  if (item.deploymentKey !== hardware.deploymentHardwareKey) {
    issues.push(blocker("hardware_identity_mismatch", session, item, hardware, "Hardware-shell item deployment key does not match hardware deployment key."));
  }

  return issues;
}

function validateHardware(
  command: DeploymentHardwareShellExecutionItemCompletionCommand,
  session: DeploymentHardwareShellExecutionItemCompletionSessionSnapshot,
  item: DeploymentHardwareShellExecutionItemCompletionItemSnapshot,
  hardware: DeploymentHardwareShellExecutionItemCompletionHardwareSnapshot,
): DeploymentHardwareShellExecutionItemCompletionIssue[] {
  const issues: DeploymentHardwareShellExecutionItemCompletionIssue[] = [];

  if (!isUuid(hardware.hardwareId) || !item.entityId || !isUuid(item.entityId)) {
    issues.push(blocker("hardware_uuid_invalid", session, item, hardware, "Hardware shell and execution-item entity identities must be UUIDs."));
  }
  if (hardware.clinicId !== command.clinicId || hardware.clinicId !== session.clinicId) {
    issues.push(blocker("hardware_clinic_mismatch", session, item, hardware, "Hardware shell does not belong to the execution clinic."));
  }
  if (!hardware.deploymentHardwareKey || hardware.deploymentHardwareKey !== item.deploymentKey) {
    issues.push(blocker("hardware_identity_mismatch", session, item, hardware, "Hardware shell deployment identity does not match item evidence."));
  }
  if (hardware.provisioningSource !== "setup_draft") {
    issues.push(blocker("hardware_provisioning_source_invalid", session, item, hardware, "Hardware shell must be sourced from setup_draft."));
  }
  if (hardware.provisioningStatus !== "active") {
    issues.push(blocker("hardware_provisioning_status_invalid", session, item, hardware, "Hardware shell must already be active before item completion."));
  }
  if (hardware.active !== true) {
    issues.push(blocker("hardware_active_state_invalid", session, item, hardware, "Hardware shell must already be active before item completion."));
  }
  if (!targetStateMatchesHardware(item.targetState, hardware)) {
    issues.push(blocker("hardware_target_state_mismatch", session, item, hardware, "Hardware shell durable state does not match item target state."));
  }

  return issues;
}

function validateDependencies(
  session: DeploymentHardwareShellExecutionItemCompletionSessionSnapshot,
  item: DeploymentHardwareShellExecutionItemCompletionItemSnapshot,
  items: readonly DeploymentHardwareShellExecutionItemCompletionItemSnapshot[],
): DeploymentHardwareShellExecutionItemCompletionIssue[] {
  const issues: DeploymentHardwareShellExecutionItemCompletionIssue[] = [];
  const dependencies = item.dependencyKeys;

  if (!Array.isArray(dependencies)) {
    return [blocker("dependency_integrity_invalid", session, item, null, "Dependency evidence is malformed.")];
  }

  if (new Set(dependencies).size !== dependencies.length) {
    issues.push(blocker("duplicate_dependency_keys", session, item, null, "Hardware-shell item has duplicate dependency keys."));
  }

  for (const dependencyKey of dependencies) {
    if (dependencyKey === item.planItemKey) {
      issues.push(blocker("self_dependency", session, item, null, "Hardware-shell item depends on itself."));
      continue;
    }

    const dependency = items.find((current) => current.planItemKey === dependencyKey) ?? null;
    if (!dependency) {
      issues.push(blocker("missing_dependency", session, item, null, "Hardware-shell item dependency is missing."));
      continue;
    }
    if (dependency.sequence >= item.sequence) {
      issues.push(blocker("later_dependency", session, item, null, "Hardware-shell item dependency is not an earlier item."));
    }
    if (dependency.executionStatus !== "succeeded") {
      issues.push(blocker("pending_dependency", session, item, null, "Hardware-shell item dependency has not succeeded."));
    }
  }

  return issues;
}

function validatePriorPrefix(
  session: DeploymentHardwareShellExecutionItemCompletionSessionSnapshot,
  item: DeploymentHardwareShellExecutionItemCompletionItemSnapshot,
  items: readonly DeploymentHardwareShellExecutionItemCompletionItemSnapshot[],
): DeploymentHardwareShellExecutionItemCompletionIssue[] {
  const issues: DeploymentHardwareShellExecutionItemCompletionIssue[] = [];
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
  session: DeploymentHardwareShellExecutionItemCompletionSessionSnapshot,
  item: DeploymentHardwareShellExecutionItemCompletionItemSnapshot,
): DeploymentHardwareShellExecutionItemCompletionIssue[] {
  const issues: DeploymentHardwareShellExecutionItemCompletionIssue[] = [];

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
  session: DeploymentHardwareShellExecutionItemCompletionSessionSnapshot,
  item: DeploymentHardwareShellExecutionItemCompletionItemSnapshot,
  items: readonly DeploymentHardwareShellExecutionItemCompletionItemSnapshot[],
): DeploymentHardwareShellExecutionItemCompletionIssue[] {
  const issues: DeploymentHardwareShellExecutionItemCompletionIssue[] = [];

  for (const later of items.filter((current) => current.sequence > item.sequence)) {
    if (later.executionStatus !== "pending" || later.attemptCount !== 0 || later.startedAt !== null || later.completedAt !== null || later.rolledBackAt !== null || later.errorCode !== null || later.errorMessage !== null) {
      issues.push(blocker("later_item_drift", session, later, null, "Later execution item has lifecycle drift."));
    }
  }

  return issues;
}

function buildResult(input: {
  status: DeploymentHardwareShellExecutionItemCompletionStatus;
  command: DeploymentHardwareShellExecutionItemCompletionCommand;
  snapshot: DeploymentHardwareShellExecutionItemCompletionSnapshot;
  issues: readonly DeploymentHardwareShellExecutionItemCompletionIssue[];
  message: string;
}): DeploymentHardwareShellExecutionItemCompletionResult {
  const issues = [...input.issues].sort(compareIssues);
  const item = input.snapshot.item;
  const hardware = input.snapshot.hardware;
  const session = input.snapshot.session;

  return {
    ok: input.status === "completable" || input.status === "already_completed",
    status: input.status,
    claimantId: input.command.claimantId || null,
    clinicId: hardware?.clinicId ?? session?.clinicId ?? input.command.clinicId ?? null,
    deploymentRunId: session?.deploymentRunId ?? input.command.deploymentRunId ?? null,
    sessionId: session?.sessionId ?? input.command.sessionId ?? null,
    executionKey: session?.executionKey ?? input.command.executionKey ?? null,
    itemId: item?.itemId ?? null,
    executionItemKey: item?.executionItemKey ?? null,
    planItemKey: item?.planItemKey ?? null,
    sequence: item?.sequence ?? null,
    entityType: item?.entityType ?? null,
    entityId: item?.entityId ?? null,
    deploymentHardwareKey: hardware?.deploymentHardwareKey ?? item?.deploymentKey ?? null,
    action: item?.action ?? null,
    itemStatusBefore: item?.executionStatus ?? null,
    itemStatusAfter: input.status === "completable" ? "succeeded" : item?.executionStatus ?? null,
    attemptCount: item?.attemptCount ?? 0,
    startedAt: item?.startedAt ?? null,
    completedAt: input.status === "completable" ? input.command.proposedCompletedAt : item?.completedAt ?? null,
    hardwareId: hardware?.hardwareId ?? null,
    hardwareStatus: hardware?.provisioningStatus ?? null,
    hardwareActive: hardware?.active ?? null,
    hardwareCurrentState: hardware?.currentState ? JSON.parse(JSON.stringify(hardware.currentState)) as Record<string, unknown> : null,
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
  session: DeploymentHardwareShellExecutionItemCompletionSessionSnapshot,
  item: DeploymentHardwareShellExecutionItemCompletionItemSnapshot,
  hardware: DeploymentHardwareShellExecutionItemCompletionHardwareSnapshot,
): DeploymentHardwareShellExecutionItemCompletionIssue[] {
  return [
    issue("hardware_item_completion_persistence_unavailable", "warning", session, item, hardware, "Hardware item-completion persistence is future work; this assessment is read-only."),
    issue("dependency_progression_after_hardware_completion_unavailable", "warning", session, item, hardware, "Dependency progression after hardware completion is future work."),
    issue("next_hardware_item_start_unavailable", "warning", session, item, hardware, "Starting the next hardware item is future work."),
    issue("rollback_execution_unavailable", "warning", session, item, hardware, "Rollback execution is future work."),
  ];
}

function targetStateMatchesHardware(
  targetState: Record<string, unknown> | null,
  hardware: DeploymentHardwareShellExecutionItemCompletionHardwareSnapshot,
): boolean {
  if (!targetState) return false;
  const keys = Object.keys(targetState).sort();
  return keys.length === 2 && keys[0] === "active" && keys[1] === "provisioningStatus" &&
    stringField(targetState, "provisioningStatus") === hardware.provisioningStatus &&
    targetState.active === hardware.active;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function statusForIssues(
  issues: readonly DeploymentHardwareShellExecutionItemCompletionIssue[],
): "blocked" | "conflict" | "not_found" {
  if (issues.some((issue) => ["missing_session", "missing_item", "missing_hardware_shell"].includes(issue.code))) {
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
    "hardware_clinic_mismatch",
    "hardware_identity_mismatch",
  ].includes(issue.code)) ? "conflict" : "blocked";
}

function addCommandIssue(
  issues: DeploymentHardwareShellExecutionItemCompletionIssue[],
  condition: boolean,
  code: DeploymentHardwareShellExecutionItemCompletionIssueCode,
  command: DeploymentHardwareShellExecutionItemCompletionCommand,
  message: string,
): void {
  if (condition) {
    issues.push(commandIssue(code, command, message));
  }
}

function commandIssue(
  code: DeploymentHardwareShellExecutionItemCompletionIssueCode,
  command: DeploymentHardwareShellExecutionItemCompletionCommand,
  message: string,
): DeploymentHardwareShellExecutionItemCompletionIssue {
  return {
    code,
    severity: "blocker",
    message: redactToken(message, command.ownershipToken),
    sessionId: command.sessionId,
    executionKey: command.executionKey,
    executionItemKey: null,
    planItemKey: null,
    hardwareId: null,
    deploymentHardwareKey: null,
    sequence: null,
  };
}

function blocker(
  code: DeploymentHardwareShellExecutionItemCompletionIssueCode,
  session: DeploymentHardwareShellExecutionItemCompletionSessionSnapshot,
  item: DeploymentHardwareShellExecutionItemCompletionItemSnapshot | null,
  hardware: DeploymentHardwareShellExecutionItemCompletionHardwareSnapshot | null,
  message: string,
): DeploymentHardwareShellExecutionItemCompletionIssue {
  return issue(code, "blocker", session, item, hardware, message);
}

function issue(
  code: DeploymentHardwareShellExecutionItemCompletionIssueCode,
  severity: DeploymentHardwareShellExecutionItemCompletionIssueSeverity,
  session: DeploymentHardwareShellExecutionItemCompletionSessionSnapshot,
  item: DeploymentHardwareShellExecutionItemCompletionItemSnapshot | null,
  hardware: DeploymentHardwareShellExecutionItemCompletionHardwareSnapshot | null,
  message: string,
): DeploymentHardwareShellExecutionItemCompletionIssue {
  return {
    code,
    severity,
    message,
    sessionId: session.sessionId,
    executionKey: session.executionKey,
    executionItemKey: item?.executionItemKey ?? null,
    planItemKey: item?.planItemKey ?? null,
    hardwareId: hardware?.hardwareId ?? null,
    deploymentHardwareKey: hardware?.deploymentHardwareKey ?? item?.deploymentKey ?? null,
    sequence: item?.sequence ?? null,
  };
}

function compareItems(
  left: DeploymentHardwareShellExecutionItemCompletionItemSnapshot,
  right: DeploymentHardwareShellExecutionItemCompletionItemSnapshot,
): number {
  return left.sequence - right.sequence || left.executionItemKey.localeCompare(right.executionItemKey);
}

function compareIssues(
  left: DeploymentHardwareShellExecutionItemCompletionIssue,
  right: DeploymentHardwareShellExecutionItemCompletionIssue,
): number {
  return left.severity.localeCompare(right.severity) ||
    left.code.localeCompare(right.code) ||
    Number(left.sequence ?? 0) - Number(right.sequence ?? 0) ||
    String(left.sessionId ?? "").localeCompare(String(right.sessionId ?? "")) ||
    String(left.executionItemKey ?? "").localeCompare(String(right.executionItemKey ?? "")) ||
    String(left.planItemKey ?? "").localeCompare(String(right.planItemKey ?? ""));
}

function hasBlocker(issues: readonly DeploymentHardwareShellExecutionItemCompletionIssue[]): boolean {
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

function zeroDownstream(): DeploymentHardwareShellExecutionItemCompletionDownstreamCounts {
  return {
    itemsCompleted: 0,
    dependenciesProgressed: 0,
    nextItemsStarted: 0,
    providersActivated: 0,
    sterilizersActivated: 0,
    hardwaresActivated: 0,
    hardwareActivated: 0,
    bindingsWritten: 0,
    sessionsCompleted: 0,
    rollbacksExecuted: 0,
    deploymentFinalized: 0,
  };
}

function emptySnapshot(): DeploymentHardwareShellExecutionItemCompletionSnapshot {
  return {
    session: null,
    item: null,
    items: [],
    hardware: null,
    aggregate: emptyHardwareShellExecutionItemCompletionAggregate(),
  };
}
