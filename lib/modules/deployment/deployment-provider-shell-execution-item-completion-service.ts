import type {
  DeploymentProviderShellExecutionItemCompletionRepository,
} from "./deployment-provider-shell-execution-item-completion-repository";
import {
  cloneProviderShellExecutionItemCompletionSnapshot,
  emptyProviderShellExecutionItemCompletionAggregate,
  type DeploymentProviderShellExecutionItemCompletionAggregateSnapshot,
  type DeploymentProviderShellExecutionItemCompletionCommand,
  type DeploymentProviderShellExecutionItemCompletionDownstreamCounts,
  type DeploymentProviderShellExecutionItemCompletionIssue,
  type DeploymentProviderShellExecutionItemCompletionIssueCode,
  type DeploymentProviderShellExecutionItemCompletionIssueSeverity,
  type DeploymentProviderShellExecutionItemCompletionItemSnapshot,
  type DeploymentProviderShellExecutionItemCompletionProviderSnapshot,
  type DeploymentProviderShellExecutionItemCompletionResult,
  type DeploymentProviderShellExecutionItemCompletionSessionSnapshot,
  type DeploymentProviderShellExecutionItemCompletionSnapshot,
  type DeploymentProviderShellExecutionItemCompletionStatus,
} from "./deployment-provider-shell-execution-item-completion-types";

type CompletionMode = "completable" | "already_completed";

export class DeploymentProviderShellExecutionItemCompletionService {
  constructor(
    private readonly repository: DeploymentProviderShellExecutionItemCompletionRepository,
  ) {}

  async assessProviderShellExecutionItemCompletion(
    command: DeploymentProviderShellExecutionItemCompletionCommand,
  ): Promise<DeploymentProviderShellExecutionItemCompletionResult> {
    const commandIssues = validateCommand(command);

    if (hasBlocker(commandIssues)) {
      return buildResult({
        status: "blocked",
        command,
        snapshot: emptySnapshot(),
        issues: commandIssues,
        message: "Provider-shell execution-item completion assessment rejected invalid input before repository access.",
      });
    }

    try {
      const snapshot = cloneProviderShellExecutionItemCompletionSnapshot(
        await this.repository.loadProviderShellExecutionItemCompletionSnapshot({
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
        : "Provider-shell execution-item completion repository failed safely.";
      return buildResult({
        status: "error",
        command,
        snapshot: emptySnapshot(),
        issues: [commandIssue("repository_error", command, message)],
        message: "Provider-shell execution-item completion assessment could not complete because repository evidence was unavailable.",
      });
    }
  }
}

export function createDeploymentProviderShellExecutionItemCompletionService(
  repository: DeploymentProviderShellExecutionItemCompletionRepository,
): DeploymentProviderShellExecutionItemCompletionService {
  return new DeploymentProviderShellExecutionItemCompletionService(repository);
}

function assessSnapshot(
  command: DeploymentProviderShellExecutionItemCompletionCommand,
  snapshot: DeploymentProviderShellExecutionItemCompletionSnapshot,
): DeploymentProviderShellExecutionItemCompletionResult {
  const presenceIssues = validatePresence(command, snapshot);
  if (hasBlocker(presenceIssues)) {
    return buildResult({
      status: "not_found",
      command,
      snapshot,
      issues: presenceIssues,
      message: "Provider-shell execution-item completion assessment found missing session, item, or provider evidence.",
    });
  }

  const session = snapshot.session as DeploymentProviderShellExecutionItemCompletionSessionSnapshot;
  const item = snapshot.item as DeploymentProviderShellExecutionItemCompletionItemSnapshot;
  const provider = snapshot.provider as DeploymentProviderShellExecutionItemCompletionProviderSnapshot;
  const mode: CompletionMode = item.executionStatus === "succeeded" ? "already_completed" : "completable";
  const orderedItems = [...snapshot.items].sort(compareItems);
  const issues = [
    ...validateSession(command, session),
    ...validateAggregate(session, snapshot.aggregate, mode),
    ...validateItem(command, session, item, provider, snapshot.aggregate, mode),
    ...validateProvider(command, session, item, provider),
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
      message: "Provider-shell execution-item completion assessment blocked because completion evidence is not safe.",
    });
  }

  return buildResult({
    status: mode,
    command,
    snapshot,
    issues: standardWarnings(session, item, provider),
    message: mode === "already_completed"
      ? "Provider-shell activation execution item is already completed. No item mutation was performed."
      : "Provider-shell activation execution item is completable. No item completion was persisted.",
  });
}

function validateCommand(
  command: DeploymentProviderShellExecutionItemCompletionCommand,
): DeploymentProviderShellExecutionItemCompletionIssue[] {
  const issues: DeploymentProviderShellExecutionItemCompletionIssue[] = [];

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
  command: DeploymentProviderShellExecutionItemCompletionCommand,
  snapshot: DeploymentProviderShellExecutionItemCompletionSnapshot,
): DeploymentProviderShellExecutionItemCompletionIssue[] {
  const issues: DeploymentProviderShellExecutionItemCompletionIssue[] = [];

  if (!snapshot.session) {
    issues.push(commandIssue("missing_session", command, "Activation execution session was not found."));
  }
  if (!snapshot.item) {
    issues.push(commandIssue("missing_item", command, "Provider-shell activation execution item was not found."));
  }
  if (!snapshot.provider) {
    issues.push(commandIssue("missing_provider_shell", command, "Activated provider shell evidence was not found."));
  }

  return issues.sort(compareIssues);
}

function validateSession(
  command: DeploymentProviderShellExecutionItemCompletionCommand,
  session: DeploymentProviderShellExecutionItemCompletionSessionSnapshot,
): DeploymentProviderShellExecutionItemCompletionIssue[] {
  const issues: DeploymentProviderShellExecutionItemCompletionIssue[] = [];

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
  session: DeploymentProviderShellExecutionItemCompletionSessionSnapshot,
  aggregate: DeploymentProviderShellExecutionItemCompletionAggregateSnapshot,
  mode: CompletionMode,
): DeploymentProviderShellExecutionItemCompletionIssue[] {
  const issues: DeploymentProviderShellExecutionItemCompletionIssue[] = [];
  const expectedRunning = mode === "completable" ? 1 : 0;

  if (aggregate.totalItemCount !== session.itemsRequested || aggregate.totalItemCount < 1) {
    issues.push(blocker("item_count_mismatch", session, null, null, "Durable execution item count does not match requested item evidence."));
  }
  if (aggregate.runningItemCount !== expectedRunning || aggregate.runningProviderItemCount !== expectedRunning) {
    issues.push(blocker(expectedRunning === 1 ? "no_running_item" : "multiple_running_items", session, null, null, "Running provider execution item evidence is not deterministic."));
  }
  if (aggregate.runningItemCount > 1 || aggregate.runningProviderItemCount > 1) {
    issues.push(blocker("multiple_running_items", session, null, null, "More than one execution item is running."));
  }
  if (aggregate.readyItemCount > 0) {
    issues.push(blocker("ready_item_ambiguity", session, null, null, "A ready item exists while provider completion is being assessed."));
  }
  if (aggregate.failedItemCount > 0) {
    issues.push(blocker("later_item_drift", session, null, null, "Execution items include failed evidence."));
  }
  if (aggregate.duplicateExecutionItemKeyCount > 0 || aggregate.duplicatePlanItemKeyCount > 0 || aggregate.duplicateSequenceCount > 0) {
    issues.push(blocker("duplicate_item_identity", session, null, null, "Duplicate execution item identity prevents provider item completion."));
  }
  if (aggregate.duplicateProviderDeploymentIdentityCount > 0) {
    issues.push(blocker("duplicate_provider_identity", session, null, null, "Duplicate provider deployment identity prevents provider item completion."));
  }
  if (aggregate.unexpectedTouchedLaterItemCount > 0) {
    issues.push(blocker("later_item_drift", session, null, null, "Later execution item evidence is not clean."));
  }

  return issues;
}

function validateItem(
  command: DeploymentProviderShellExecutionItemCompletionCommand,
  session: DeploymentProviderShellExecutionItemCompletionSessionSnapshot,
  item: DeploymentProviderShellExecutionItemCompletionItemSnapshot,
  provider: DeploymentProviderShellExecutionItemCompletionProviderSnapshot,
  aggregate: DeploymentProviderShellExecutionItemCompletionAggregateSnapshot,
  mode: CompletionMode,
): DeploymentProviderShellExecutionItemCompletionIssue[] {
  const issues: DeploymentProviderShellExecutionItemCompletionIssue[] = [];
  const expectedSequence = mode === "already_completed"
    ? aggregate.priorSucceededPrefixCount
    : aggregate.priorSucceededPrefixCount + 1;

  if (item.sessionId !== session.sessionId) {
    issues.push(blocker("item_session_mismatch", session, item, provider, "Execution item does not belong to the execution session."));
  }
  if (item.sequence !== expectedSequence) {
    issues.push(blocker("wrong_running_item", session, item, provider, "Provider item is not the deterministic next sequence after the succeeded prefix."));
  }
  if (item.entityType !== "provider_shell") {
    issues.push(blocker("wrong_entity_type", session, item, provider, "Only provider-shell execution items are completion-eligible."));
  }
  if (item.action !== "activate") {
    issues.push(blocker("wrong_action", session, item, provider, "Only activate action items are completion-eligible."));
  }
  if (mode === "completable" && item.executionStatus !== "running") {
    issues.push(blocker("item_not_running", session, item, provider, "Provider-shell activation item is not running."));
  }
  if (mode === "already_completed" && item.executionStatus !== "succeeded") {
    issues.push(blocker("item_not_succeeded", session, item, provider, "Provider-shell activation item is not succeeded."));
  }
  if (item.attemptCount !== 1) {
    issues.push(blocker("item_attempt_invalid", session, item, provider, "Provider-shell completion requires exactly one item attempt."));
  }
  if (!item.startedAt || !isValidTimestamp(item.startedAt)) {
    issues.push(blocker("item_started_at_missing", session, item, provider, "Provider-shell item is missing valid started_at evidence."));
  }
  if (mode === "completable" && item.completedAt !== null) {
    issues.push(blocker("item_completed_timestamp_present", session, item, provider, "Completable provider-shell item already has completed_at evidence."));
  }
  if (mode === "already_completed") {
    if (!item.completedAt || !isValidTimestamp(item.completedAt)) {
      issues.push(blocker("item_completed_timestamp_missing", session, item, provider, "Already-completed provider-shell item requires completed_at evidence."));
    } else if (item.startedAt && Date.parse(item.completedAt) < Date.parse(item.startedAt)) {
      issues.push(blocker("item_completion_before_start", session, item, provider, "Provider-shell item completed before it started."));
    }
  }
  if (item.rolledBackAt !== null) {
    issues.push(blocker("item_rollback_evidence_present", session, item, provider, "Provider-shell item has rollback evidence."));
  }
  if (item.errorCode !== null || item.errorMessage !== null) {
    issues.push(blocker("item_error_present", session, item, provider, "Provider-shell item has error evidence."));
  }
  if (item.entityId !== provider.providerId) {
    issues.push(blocker("provider_identity_mismatch", session, item, provider, "Provider-shell item entity id does not match provider id."));
  }
  if (item.deploymentKey !== provider.deploymentProviderKey) {
    issues.push(blocker("provider_identity_mismatch", session, item, provider, "Provider-shell item deployment key does not match provider deployment key."));
  }

  return issues;
}

function validateProvider(
  command: DeploymentProviderShellExecutionItemCompletionCommand,
  session: DeploymentProviderShellExecutionItemCompletionSessionSnapshot,
  item: DeploymentProviderShellExecutionItemCompletionItemSnapshot,
  provider: DeploymentProviderShellExecutionItemCompletionProviderSnapshot,
): DeploymentProviderShellExecutionItemCompletionIssue[] {
  const issues: DeploymentProviderShellExecutionItemCompletionIssue[] = [];

  if (provider.clinicId !== command.clinicId || provider.clinicId !== session.clinicId) {
    issues.push(blocker("provider_clinic_mismatch", session, item, provider, "Provider shell does not belong to the execution clinic."));
  }
  if (!provider.deploymentProviderKey || provider.deploymentProviderKey !== item.deploymentKey) {
    issues.push(blocker("provider_identity_mismatch", session, item, provider, "Provider shell deployment identity does not match item evidence."));
  }
  if (provider.provisioningSource !== "setup_draft") {
    issues.push(blocker("provider_provisioning_source_invalid", session, item, provider, "Provider shell must be sourced from setup_draft."));
  }
  if (provider.provisioningStatus !== "active") {
    issues.push(blocker("provider_provisioning_status_invalid", session, item, provider, "Provider shell must already be active before item completion."));
  }
  if (provider.active !== true) {
    issues.push(blocker("provider_active_state_invalid", session, item, provider, "Provider shell must already be active before item completion."));
  }
  if (!targetStateMatchesProvider(item.targetState, provider)) {
    issues.push(blocker("provider_target_state_mismatch", session, item, provider, "Provider shell durable state does not match item target state."));
  }

  return issues;
}

function validateDependencies(
  session: DeploymentProviderShellExecutionItemCompletionSessionSnapshot,
  item: DeploymentProviderShellExecutionItemCompletionItemSnapshot,
  items: readonly DeploymentProviderShellExecutionItemCompletionItemSnapshot[],
): DeploymentProviderShellExecutionItemCompletionIssue[] {
  const issues: DeploymentProviderShellExecutionItemCompletionIssue[] = [];
  const dependencies = item.dependencyKeys;

  if (!Array.isArray(dependencies)) {
    return [blocker("dependency_integrity_invalid", session, item, null, "Dependency evidence is malformed.")];
  }

  if (new Set(dependencies).size !== dependencies.length) {
    issues.push(blocker("duplicate_dependency_keys", session, item, null, "Provider-shell item has duplicate dependency keys."));
  }

  for (const dependencyKey of dependencies) {
    if (dependencyKey === item.planItemKey) {
      issues.push(blocker("self_dependency", session, item, null, "Provider-shell item depends on itself."));
      continue;
    }

    const dependency = items.find((current) => current.planItemKey === dependencyKey) ?? null;
    if (!dependency) {
      issues.push(blocker("missing_dependency", session, item, null, "Provider-shell item dependency is missing."));
      continue;
    }
    if (dependency.sequence >= item.sequence) {
      issues.push(blocker("later_dependency", session, item, null, "Provider-shell item dependency is not an earlier item."));
    }
    if (dependency.executionStatus !== "succeeded") {
      issues.push(blocker("pending_dependency", session, item, null, "Provider-shell item dependency has not succeeded."));
    }
  }

  return issues;
}

function validatePriorPrefix(
  session: DeploymentProviderShellExecutionItemCompletionSessionSnapshot,
  item: DeploymentProviderShellExecutionItemCompletionItemSnapshot,
  items: readonly DeploymentProviderShellExecutionItemCompletionItemSnapshot[],
): DeploymentProviderShellExecutionItemCompletionIssue[] {
  const issues: DeploymentProviderShellExecutionItemCompletionIssue[] = [];
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
  session: DeploymentProviderShellExecutionItemCompletionSessionSnapshot,
  item: DeploymentProviderShellExecutionItemCompletionItemSnapshot,
): DeploymentProviderShellExecutionItemCompletionIssue[] {
  const issues: DeploymentProviderShellExecutionItemCompletionIssue[] = [];

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
  session: DeploymentProviderShellExecutionItemCompletionSessionSnapshot,
  item: DeploymentProviderShellExecutionItemCompletionItemSnapshot,
  items: readonly DeploymentProviderShellExecutionItemCompletionItemSnapshot[],
): DeploymentProviderShellExecutionItemCompletionIssue[] {
  const issues: DeploymentProviderShellExecutionItemCompletionIssue[] = [];

  for (const later of items.filter((current) => current.sequence > item.sequence)) {
    if (later.executionStatus !== "pending" || later.attemptCount !== 0 || later.startedAt !== null || later.completedAt !== null || later.rolledBackAt !== null || later.errorCode !== null || later.errorMessage !== null) {
      issues.push(blocker("later_item_drift", session, later, null, "Later execution item has lifecycle drift."));
    }
  }

  return issues;
}

function buildResult(input: {
  status: DeploymentProviderShellExecutionItemCompletionStatus;
  command: DeploymentProviderShellExecutionItemCompletionCommand;
  snapshot: DeploymentProviderShellExecutionItemCompletionSnapshot;
  issues: readonly DeploymentProviderShellExecutionItemCompletionIssue[];
  message: string;
}): DeploymentProviderShellExecutionItemCompletionResult {
  const issues = [...input.issues].sort(compareIssues);
  const item = input.snapshot.item;
  const provider = input.snapshot.provider;
  const session = input.snapshot.session;

  return {
    ok: input.status === "completable" || input.status === "already_completed",
    status: input.status,
    claimantId: input.command.claimantId || null,
    clinicId: provider?.clinicId ?? session?.clinicId ?? input.command.clinicId ?? null,
    deploymentRunId: session?.deploymentRunId ?? input.command.deploymentRunId ?? null,
    sessionId: session?.sessionId ?? input.command.sessionId ?? null,
    executionKey: session?.executionKey ?? input.command.executionKey ?? null,
    itemId: item?.itemId ?? null,
    executionItemKey: item?.executionItemKey ?? null,
    planItemKey: item?.planItemKey ?? null,
    sequence: item?.sequence ?? null,
    entityType: item?.entityType ?? null,
    entityId: item?.entityId ?? null,
    deploymentProviderKey: provider?.deploymentProviderKey ?? item?.deploymentKey ?? null,
    action: item?.action ?? null,
    itemStatusBefore: item?.executionStatus ?? null,
    itemStatusAfter: input.status === "completable" ? "succeeded" : item?.executionStatus ?? null,
    attemptCount: item?.attemptCount ?? 0,
    startedAt: item?.startedAt ?? null,
    completedAt: input.status === "completable" ? input.command.proposedCompletedAt : item?.completedAt ?? null,
    providerId: provider?.providerId ?? null,
    providerStatus: provider?.provisioningStatus ?? null,
    providerActive: provider?.active ?? null,
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
  session: DeploymentProviderShellExecutionItemCompletionSessionSnapshot,
  item: DeploymentProviderShellExecutionItemCompletionItemSnapshot,
  provider: DeploymentProviderShellExecutionItemCompletionProviderSnapshot,
): DeploymentProviderShellExecutionItemCompletionIssue[] {
  return [
    issue("provider_item_completion_persistence_unavailable", "warning", session, item, provider, "Provider item-completion persistence is future work; this assessment is read-only."),
    issue("dependency_progression_after_provider_completion_unavailable", "warning", session, item, provider, "Dependency progression after provider completion is future work."),
    issue("next_provider_item_start_unavailable", "warning", session, item, provider, "Starting the next provider item is future work."),
    issue("rollback_execution_unavailable", "warning", session, item, provider, "Rollback execution is future work."),
  ];
}

function targetStateMatchesProvider(
  targetState: Record<string, unknown> | null,
  provider: DeploymentProviderShellExecutionItemCompletionProviderSnapshot,
): boolean {
  return stringField(targetState, "deploymentProviderKey") === provider.deploymentProviderKey &&
    stringField(targetState, "provisioningSource") === "setup_draft" &&
    stringField(targetState, "provisioningStatus") === provider.provisioningStatus &&
    targetState?.active === provider.active;
}

function statusForIssues(
  issues: readonly DeploymentProviderShellExecutionItemCompletionIssue[],
): "blocked" | "conflict" | "not_found" {
  if (issues.some((issue) => ["missing_session", "missing_item", "missing_provider_shell"].includes(issue.code))) {
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
    "provider_clinic_mismatch",
    "provider_identity_mismatch",
  ].includes(issue.code)) ? "conflict" : "blocked";
}

function addCommandIssue(
  issues: DeploymentProviderShellExecutionItemCompletionIssue[],
  condition: boolean,
  code: DeploymentProviderShellExecutionItemCompletionIssueCode,
  command: DeploymentProviderShellExecutionItemCompletionCommand,
  message: string,
): void {
  if (condition) {
    issues.push(commandIssue(code, command, message));
  }
}

function commandIssue(
  code: DeploymentProviderShellExecutionItemCompletionIssueCode,
  command: DeploymentProviderShellExecutionItemCompletionCommand,
  message: string,
): DeploymentProviderShellExecutionItemCompletionIssue {
  return {
    code,
    severity: "blocker",
    message: redactToken(message, command.ownershipToken),
    sessionId: command.sessionId,
    executionKey: command.executionKey,
    executionItemKey: null,
    planItemKey: null,
    providerId: null,
    deploymentProviderKey: null,
    sequence: null,
  };
}

function blocker(
  code: DeploymentProviderShellExecutionItemCompletionIssueCode,
  session: DeploymentProviderShellExecutionItemCompletionSessionSnapshot,
  item: DeploymentProviderShellExecutionItemCompletionItemSnapshot | null,
  provider: DeploymentProviderShellExecutionItemCompletionProviderSnapshot | null,
  message: string,
): DeploymentProviderShellExecutionItemCompletionIssue {
  return issue(code, "blocker", session, item, provider, message);
}

function issue(
  code: DeploymentProviderShellExecutionItemCompletionIssueCode,
  severity: DeploymentProviderShellExecutionItemCompletionIssueSeverity,
  session: DeploymentProviderShellExecutionItemCompletionSessionSnapshot,
  item: DeploymentProviderShellExecutionItemCompletionItemSnapshot | null,
  provider: DeploymentProviderShellExecutionItemCompletionProviderSnapshot | null,
  message: string,
): DeploymentProviderShellExecutionItemCompletionIssue {
  return {
    code,
    severity,
    message,
    sessionId: session.sessionId,
    executionKey: session.executionKey,
    executionItemKey: item?.executionItemKey ?? null,
    planItemKey: item?.planItemKey ?? null,
    providerId: provider?.providerId ?? null,
    deploymentProviderKey: provider?.deploymentProviderKey ?? item?.deploymentKey ?? null,
    sequence: item?.sequence ?? null,
  };
}

function compareItems(
  left: DeploymentProviderShellExecutionItemCompletionItemSnapshot,
  right: DeploymentProviderShellExecutionItemCompletionItemSnapshot,
): number {
  return left.sequence - right.sequence || left.executionItemKey.localeCompare(right.executionItemKey);
}

function compareIssues(
  left: DeploymentProviderShellExecutionItemCompletionIssue,
  right: DeploymentProviderShellExecutionItemCompletionIssue,
): number {
  return left.severity.localeCompare(right.severity) ||
    left.code.localeCompare(right.code) ||
    Number(left.sequence ?? 0) - Number(right.sequence ?? 0) ||
    String(left.sessionId ?? "").localeCompare(String(right.sessionId ?? "")) ||
    String(left.executionItemKey ?? "").localeCompare(String(right.executionItemKey ?? "")) ||
    String(left.planItemKey ?? "").localeCompare(String(right.planItemKey ?? ""));
}

function hasBlocker(issues: readonly DeploymentProviderShellExecutionItemCompletionIssue[]): boolean {
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

function zeroDownstream(): DeploymentProviderShellExecutionItemCompletionDownstreamCounts {
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

function emptySnapshot(): DeploymentProviderShellExecutionItemCompletionSnapshot {
  return {
    session: null,
    item: null,
    items: [],
    provider: null,
    aggregate: emptyProviderShellExecutionItemCompletionAggregate(),
  };
}
