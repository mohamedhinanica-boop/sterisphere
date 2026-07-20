import type {
  DeploymentSterilizerShellActivationRepository,
} from "./deployment-sterilizer-shell-activation-repository";
import {
  cloneSterilizerShellActivationSnapshot,
  emptySterilizerShellActivationAggregate,
  type DeploymentSterilizerShellActivationCommand,
  type DeploymentSterilizerShellActivationDownstreamCounts,
  type DeploymentSterilizerShellActivationIssue,
  type DeploymentSterilizerShellActivationIssueCode,
  type DeploymentSterilizerShellActivationIssueSeverity,
  type DeploymentSterilizerShellActivationItemSnapshot,
  type DeploymentSterilizerShellActivationSterilizerLookupDiagnostics,
  type DeploymentSterilizerShellActivationSterilizerSnapshot,
  type DeploymentSterilizerShellActivationResult,
  type DeploymentSterilizerShellActivationSessionSnapshot,
  type DeploymentSterilizerShellActivationSnapshot,
  type DeploymentSterilizerShellActivationStatus,
} from "./deployment-sterilizer-shell-activation-types";

type SterilizerActivationMode = "activatable" | "already_activated" | "blocked";

export class DeploymentSterilizerShellActivationService {
  constructor(
    private readonly repository: DeploymentSterilizerShellActivationRepository,
  ) {}

  async assessSterilizerShellActivation(
    command: DeploymentSterilizerShellActivationCommand,
  ): Promise<DeploymentSterilizerShellActivationResult> {
    const commandIssues = validateCommand(command);

    if (hasBlocker(commandIssues)) {
      return buildResult({
        status: "blocked",
        command,
        snapshot: emptySnapshot(),
        runningItem: null,
        issues: commandIssues,
        message: "Sterilizer shell activation assessment rejected invalid input before repository access.",
      });
    }

    try {
      const snapshot = cloneSterilizerShellActivationSnapshot(
        await this.repository.loadSterilizerShellActivationSnapshot({
          clinicId: command.clinicId,
          deploymentRunKey: command.deploymentRunKey,
          sessionId: command.sessionId,
          executionKey: command.executionKey,
        }),
      );

      return assessSnapshot(command, snapshot);
    } catch (caught) {
      const message = caught instanceof Error
        ? redactToken(caught.message, command.ownershipToken)
        : "Sterilizer shell activation repository failed safely.";

      return buildResult({
        status: "error",
        command,
        snapshot: emptySnapshot(),
        runningItem: null,
        issues: [commandIssue("repository_error", command, message)],
        message: "Sterilizer shell activation assessment could not complete because repository evidence was unavailable.",
      });
    }
  }
}

export function createDeploymentSterilizerShellActivationService(
  repository: DeploymentSterilizerShellActivationRepository,
): DeploymentSterilizerShellActivationService {
  return new DeploymentSterilizerShellActivationService(repository);
}

function assessSnapshot(
  command: DeploymentSterilizerShellActivationCommand,
  snapshot: DeploymentSterilizerShellActivationSnapshot,
): DeploymentSterilizerShellActivationResult {
  if (!snapshot.session) {
    return buildResult({
      status: "not_found",
      command,
      snapshot,
      runningItem: null,
      issues: [commandIssue("missing_session", command, "Activation execution session was not found.")],
      message: "Sterilizer shell activation assessment found no running execution session.",
    });
  }

  const session = snapshot.session;
  const orderedItems = [...snapshot.items].sort(compareItems);
  const prefix = getSucceededPrefix(orderedItems);
  const runningItems = orderedItems.filter((item) => item.executionStatus === "running");
  const runningItem = runningItems[0] ?? orderedItems.find((item) => item.sequence === prefix.length + 1) ?? null;
  const mode = activationMode(snapshot.sterilizerShell);
  const issues = [
    ...validateIdentity(command, session),
    ...validateSessionLifecycle(session),
    ...validateOwnership(command, session),
    ...validateAggregate(session, snapshot),
    ...validateSucceededPrefix(session, orderedItems, prefix),
    ...validateRunningItem(session, runningItem, prefix.length + 1),
    ...validateSterilizerShell(command, session, runningItem, snapshot.sterilizerShell, snapshot.aggregate, mode, snapshot.sterilizerLookup),
    ...validateLaterItems(session, orderedItems, runningItem),
  ];

  if (hasBlocker(issues)) {
    return buildResult({
      status: statusForIssues(issues),
      command,
      snapshot,
      runningItem,
      issues,
      message: "Sterilizer shell activation assessment blocked because session, item, or sterilizer evidence is not safe.",
    });
  }

  const status = mode === "already_activated" ? "already_activated" : "activatable";

  return buildResult({
    status,
    command,
    snapshot,
    runningItem,
    issues: runningItem ? standardWarnings(session, runningItem, snapshot.sterilizerShell) : [],
    message: status === "already_activated"
      ? "Sterilizer shell is already activated. No sterilizer mutation was performed."
      : "Sterilizer shell is activatable. No sterilizer mutation was persisted.",
  });
}

function validateCommand(
  command: DeploymentSterilizerShellActivationCommand,
): DeploymentSterilizerShellActivationIssue[] {
  const issues: DeploymentSterilizerShellActivationIssue[] = [];

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
  command: DeploymentSterilizerShellActivationCommand,
  session: DeploymentSterilizerShellActivationSessionSnapshot,
): DeploymentSterilizerShellActivationIssue[] {
  const issues: DeploymentSterilizerShellActivationIssue[] = [];

  addCommandIssue(issues, session.clinicId !== command.clinicId, "clinic_identity_mismatch", command, "Execution session clinic does not match the sterilizer activation request.");
  addCommandIssue(issues, session.deploymentRunKey !== command.deploymentRunKey, "deployment_run_identity_mismatch", command, "Execution session deployment run does not match the sterilizer activation request.");
  addCommandIssue(issues, session.sessionId !== command.sessionId, "session_identity_mismatch", command, "Execution session id does not match the sterilizer activation request.");
  addCommandIssue(issues, session.executionKey !== command.executionKey, "execution_key_mismatch", command, "Execution session key does not match the sterilizer activation request.");

  return issues;
}

function validateSessionLifecycle(
  session: DeploymentSterilizerShellActivationSessionSnapshot,
): DeploymentSterilizerShellActivationIssue[] {
  const issues: DeploymentSterilizerShellActivationIssue[] = [];

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

  return issues;
}

function validateOwnership(
  command: DeploymentSterilizerShellActivationCommand,
  session: DeploymentSterilizerShellActivationSessionSnapshot,
): DeploymentSterilizerShellActivationIssue[] {
  const issues: DeploymentSterilizerShellActivationIssue[] = [];

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
    issues.push(blocker("ownership_token_mismatch", session, null, null, "Execution session ownership token does not match the sterilizer activation request."));
  }

  if (Date.parse(session.leaseExpiresAt) <= Date.parse(command.now)) {
    issues.push(blocker("lease_expired", session, null, null, "Execution session lease is not active."));
  }

  return issues;
}

function validateAggregate(
  session: DeploymentSterilizerShellActivationSessionSnapshot,
  snapshot: DeploymentSterilizerShellActivationSnapshot,
): DeploymentSterilizerShellActivationIssue[] {
  const issues: DeploymentSterilizerShellActivationIssue[] = [];
  const aggregate = snapshot.aggregate;

  if (aggregate.totalItemCount !== session.itemsRequested || aggregate.totalItemCount !== snapshot.items.length || aggregate.totalItemCount < 1) {
    issues.push(blocker("item_count_mismatch", session, null, null, "Durable execution item count does not match requested item evidence."));
  }

  if (aggregate.runningItemCount === 0) {
    issues.push(blocker("no_running_item", session, null, null, "No running sterilizer activation item exists."));
  }

  if (aggregate.runningItemCount > 1) {
    issues.push(blocker("multiple_running_items", session, null, null, "More than one execution item is running."));
  }

  if (aggregate.failedItemCount > 0) {
    issues.push(blocker("later_item_drift", session, null, null, "Execution items include failed evidence."));
  }

  if (aggregate.duplicateExecutionItemKeyCount > 0 || aggregate.duplicatePlanItemKeyCount > 0 || aggregate.duplicateSequenceCount > 0) {
    issues.push(blocker("duplicate_item_identity", session, null, null, "Duplicate durable execution item identity prevents sterilizer activation assessment."));
  }

  if (aggregate.succeededContiguousPrefixLength !== aggregate.succeededItemCount) {
    issues.push(blocker("non_contiguous_succeeded_prefix", session, null, null, "Succeeded execution prefix is not contiguous from sequence 1."));
  }

  if (aggregate.laterPendingItemIntegrityIssueCount > 0) {
    issues.push(blocker("later_item_drift", session, null, null, "Later pending item integrity evidence is not clean."));
  }

  return issues;
}

function validateSucceededPrefix(
  session: DeploymentSterilizerShellActivationSessionSnapshot,
  items: readonly DeploymentSterilizerShellActivationItemSnapshot[],
  prefix: readonly DeploymentSterilizerShellActivationItemSnapshot[],
): DeploymentSterilizerShellActivationIssue[] {
  const issues: DeploymentSterilizerShellActivationIssue[] = [];

  for (let index = 0; index < prefix.length; index += 1) {
    const item = prefix[index];
    if (item.sequence !== index + 1) {
      issues.push(blocker("non_contiguous_succeeded_prefix", session, item, null, "Succeeded execution prefix is not contiguous from sequence 1."));
    }

    issues.push(...validateSucceededItem(session, item));
  }

  if (items.some((item) => item.sequence > prefix.length && item.executionStatus === "succeeded")) {
    issues.push(blocker("non_contiguous_succeeded_prefix", session, null, null, "Succeeded item appears after the contiguous prefix."));
  }

  return issues;
}

function validateSucceededItem(
  session: DeploymentSterilizerShellActivationSessionSnapshot,
  item: DeploymentSterilizerShellActivationItemSnapshot,
): DeploymentSterilizerShellActivationIssue[] {
  const issues: DeploymentSterilizerShellActivationIssue[] = [];

  if (item.attemptCount !== 1) {
    issues.push(blocker("succeeded_item_attempt_invalid", session, item, null, "Succeeded item must have exactly one attempt."));
  }

  if (!item.startedAt || !isValidTimestamp(item.startedAt) || !item.completedAt || !isValidTimestamp(item.completedAt)) {
    issues.push(blocker("succeeded_item_timestamp_missing", session, item, null, "Succeeded item requires valid started_at and completed_at evidence."));
  } else if (Date.parse(item.completedAt) < Date.parse(item.startedAt)) {
    issues.push(blocker("succeeded_item_completion_before_start", session, item, null, "Succeeded item completed before it started."));
  }

  if (item.rolledBackAt !== null) {
    issues.push(blocker("succeeded_item_rollback_evidence_present", session, item, null, "Succeeded item has rollback evidence."));
  }

  if (item.errorCode !== null || item.errorMessage !== null) {
    issues.push(blocker("succeeded_item_error_present", session, item, null, "Succeeded item has error evidence."));
  }

  return issues;
}

function validateRunningItem(
  session: DeploymentSterilizerShellActivationSessionSnapshot,
  item: DeploymentSterilizerShellActivationItemSnapshot | null,
  expectedSequence: number,
): DeploymentSterilizerShellActivationIssue[] {
  if (!item) {
    return [blocker("no_running_item", session, null, null, "No deterministic running sterilizer activation item exists.")];
  }

  const issues: DeploymentSterilizerShellActivationIssue[] = [];

  if (item.sequence !== expectedSequence) {
    issues.push(blocker("running_item_sequence_mismatch", session, item, null, "Running sterilizer activation item is not the deterministic next sequence after the succeeded prefix."));
  }

  if (item.executionStatus !== "running") {
    issues.push(blocker("running_item_status_invalid", session, item, null, "Sterilizer activation item must be running."));
  }

  if (item.attemptCount !== 1) {
    issues.push(blocker("running_item_attempt_invalid", session, item, null, "Sterilizer activation item must have exactly one attempt."));
  }

  if (!item.startedAt || !isValidTimestamp(item.startedAt)) {
    issues.push(blocker("running_item_started_at_missing", session, item, null, "Sterilizer activation item requires valid started_at evidence."));
  }

  if (item.completedAt !== null) {
    issues.push(blocker("running_item_completion_evidence_present", session, item, null, "Sterilizer activation item must not have completed_at evidence."));
  }

  if (item.rolledBackAt !== null) {
    issues.push(blocker("running_item_rollback_evidence_present", session, item, null, "Sterilizer activation item has rollback evidence."));
  }

  if (item.errorCode !== null || item.errorMessage !== null) {
    issues.push(blocker("running_item_error_present", session, item, null, "Sterilizer activation item has error evidence."));
  }

  if (!item.entityId || !item.entityId.trim()) {
    issues.push(blocker("running_item_entity_identity_missing", session, item, null, "Sterilizer activation item entity identity is missing."));
  }

  if (item.entityType !== "sterilizer_shell" || item.action !== "activate") {
    issues.push(blocker("unsupported_running_item_lifecycle", session, item, null, "Only sterilizer-shell activate items are supported by this assessment."));
  }

  return issues;
}

function validateSterilizerShell(
  command: DeploymentSterilizerShellActivationCommand,
  session: DeploymentSterilizerShellActivationSessionSnapshot,
  item: DeploymentSterilizerShellActivationItemSnapshot | null,
  sterilizer: DeploymentSterilizerShellActivationSterilizerSnapshot | null,
  aggregate: DeploymentSterilizerShellActivationSnapshot["aggregate"],
  mode: SterilizerActivationMode,
  sterilizerLookup: DeploymentSterilizerShellActivationSterilizerLookupDiagnostics | null,
): DeploymentSterilizerShellActivationIssue[] {
  if (!sterilizer) {
    return [commandIssue("missing_sterilizer_shell", command, "Sterilizer shell was not found.", sterilizerLookupIssueDiagnostics(sterilizerLookup))];
  }

  const issues: DeploymentSterilizerShellActivationIssue[] = [];

  if (aggregate.sterilizerCandidateCount !== 1) {
    issues.push(sterilizerIssue("duplicate_sterilizer_identity", session, item, sterilizer, "Sterilizer activation assessment requires exactly one sterilizer shell candidate."));
  }

  if (aggregate.duplicateSterilizerIdentityCount > 0) {
    issues.push(sterilizerIssue("duplicate_sterilizer_identity", session, item, sterilizer, "Duplicate sterilizer shell deployment identity prevents activation assessment."));
  }

  if (sterilizer.clinicId !== session.clinicId || sterilizer.clinicId !== command.clinicId) {
    issues.push(sterilizerIssue("sterilizer_clinic_mismatch", session, item, sterilizer, "Sterilizer shell does not belong to the execution clinic."));
  }

  const expectedSterilizerKey = item ? deploymentSterilizerKeyFromItem(item) : null;
  const entityIdMatchesSterilizer = item?.entityId === sterilizer.sterilizerId || item?.entityId === sterilizer.deploymentSterilizerKey;
  if (!sterilizer.deploymentSterilizerKey || (expectedSterilizerKey !== null && sterilizer.deploymentSterilizerKey !== expectedSterilizerKey) || !entityIdMatchesSterilizer) {
    issues.push(sterilizerIssue("sterilizer_identity_mismatch", session, item, sterilizer, "Sterilizer shell identity does not match the running execution item."));
  }

  if (sterilizer.provisioningSource !== "setup_draft") {
    issues.push(sterilizerIssue("sterilizer_provisioning_source_invalid", session, item, sterilizer, "Sterilizer shell must be sourced from setup_draft."));
  }

  if (mode === "already_activated") {
    if (sterilizer.active !== true) {
      issues.push(sterilizerIssue("sterilizer_active_state_invalid", session, item, sterilizer, "Already-activated sterilizer shell must be active."));
    }
    if (sterilizer.provisioningStatus !== "active") {
      issues.push(sterilizerIssue("sterilizer_provisioning_status_invalid", session, item, sterilizer, "Already-activated sterilizer shell must have active provisioning status."));
    }
    return issues;
  }

  if (sterilizer.placeholder !== true) {
    issues.push(sterilizerIssue("sterilizer_placeholder_invalid", session, item, sterilizer, "Sterilizer shell must retain placeholder semantics before activation."));
  }

  if (sterilizer.active !== false) {
    issues.push(sterilizerIssue("sterilizer_active_state_invalid", session, item, sterilizer, "Sterilizer shell must be inactive before activation."));
  }

  if (sterilizer.provisioningStatus !== "planned") {
    issues.push(sterilizerIssue("sterilizer_provisioning_status_invalid", session, item, sterilizer, "Sterilizer shell provisioning status must be planned before activation."));
  }

  return issues;
}

function deploymentSterilizerKeyFromItem(
  item: DeploymentSterilizerShellActivationItemSnapshot,
): string | null {
  return stringField(item.expectedCurrentState, "deploymentSterilizerKey") ??
    stringField(item.expectedCurrentState, "deployment_sterilizer_key") ??
    stringField(item.targetState, "deploymentSterilizerKey") ??
    stringField(item.targetState, "deployment_sterilizer_key") ??
    fallbackDeploymentSterilizerKey(item.entityId);
}

function fallbackDeploymentSterilizerKey(value: string | null): string | null {
  if (!value || isUuid(value)) {
    return null;
  }

  return value;
}

function stringField(source: Record<string, unknown> | null, key: string): string | null {
  const value = source?.[key];
  return typeof value === "string" && value.trim() ? value : null;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function sterilizerLookupIssueDiagnostics(
  sterilizerLookup: DeploymentSterilizerShellActivationSterilizerLookupDiagnostics | null,
): DeploymentSterilizerShellActivationIssue["diagnostics"] {
  if (!sterilizerLookup) {
    return null;
  }

  return {
    layer: "snapshot_sterilizer_lookup",
    rpcAttempted: false,
    sterilizerLookupAttempted: sterilizerLookup.attempted,
    sterilizerLookupResult: sterilizerLookup.result,
    sterilizerLookupRowsReturned: sterilizerLookup.rowsReturned,
    sterilizerLookupDeploymentSterilizerKey: sterilizerLookup.deploymentSterilizerKey,
    sterilizerLookupSterilizerId: sterilizerLookup.sterilizerId,
  };
}
function validateLaterItems(
  session: DeploymentSterilizerShellActivationSessionSnapshot,
  items: readonly DeploymentSterilizerShellActivationItemSnapshot[],
  runningItem: DeploymentSterilizerShellActivationItemSnapshot | null,
): DeploymentSterilizerShellActivationIssue[] {
  if (!runningItem) {
    return [];
  }

  const issues: DeploymentSterilizerShellActivationIssue[] = [];

  for (const item of items.filter((current) => current.sequence > runningItem.sequence)) {
    if (
      item.executionStatus !== "pending" ||
      item.attemptCount !== 0 ||
      item.startedAt !== null ||
      item.completedAt !== null ||
      item.rolledBackAt !== null ||
      item.errorCode !== null ||
      item.errorMessage !== null
    ) {
      issues.push(blocker("later_item_drift", session, item, null, "Later execution item has lifecycle drift."));
    }
  }

  return issues;
}

function activationMode(
  sterilizer: DeploymentSterilizerShellActivationSterilizerSnapshot | null,
): SterilizerActivationMode {
  if (!sterilizer) {
    return "blocked";
  }

  return sterilizer.active === true || sterilizer.provisioningStatus === "active"
    ? "already_activated"
    : "activatable";
}

function getSucceededPrefix(
  items: readonly DeploymentSterilizerShellActivationItemSnapshot[],
): DeploymentSterilizerShellActivationItemSnapshot[] {
  const prefix: DeploymentSterilizerShellActivationItemSnapshot[] = [];
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

function buildResult(input: {
  status: DeploymentSterilizerShellActivationStatus;
  command: DeploymentSterilizerShellActivationCommand;
  snapshot: DeploymentSterilizerShellActivationSnapshot;
  runningItem: DeploymentSterilizerShellActivationItemSnapshot | null;
  issues: readonly DeploymentSterilizerShellActivationIssue[];
  message: string;
}): DeploymentSterilizerShellActivationResult {
  const issues = [...input.issues].sort(compareIssues);
  const session = input.snapshot.session;
  const sterilizer = input.snapshot.sterilizerShell;
  const item = input.runningItem;

  return {
    ok: input.status === "activatable" || input.status === "already_activated",
    status: input.status,
    message: input.message,
    claimantId: input.command.claimantId || null,
    clinicId: sterilizer?.clinicId ?? session?.clinicId ?? input.command.clinicId ?? null,
    deploymentRunKey: session?.deploymentRunKey ?? input.command.deploymentRunKey ?? null,
    sessionId: session?.sessionId ?? input.command.sessionId ?? null,
    executionKey: session?.executionKey ?? input.command.executionKey ?? null,
    planKey: session?.planKey ?? null,
    itemId: item?.itemId ?? null,
    executionItemKey: item?.executionItemKey ?? null,
    planItemKey: item?.planItemKey ?? null,
    sequence: item?.sequence ?? null,
    entityType: item?.entityType ?? null,
    entityId: item?.entityId ?? null,
    action: item?.action ?? null,
    sterilizerId: sterilizer?.sterilizerId ?? null,
    deploymentSterilizerKey: sterilizer?.deploymentSterilizerKey ?? null,
    sterilizerDisplayName: null,
    sterilizerActive: sterilizer?.active ?? null,
    sterilizerProvisioningStatus: sterilizer?.provisioningStatus ?? null,
    sterilizerProvisioningSource: sterilizer?.provisioningSource ?? null,
    attemptCount: item?.attemptCount ?? 0,
    itemStartedAt: item?.startedAt ?? null,
    leaseExpiresAt: session?.leaseExpiresAt ?? null,
    activatableCount: input.status === "activatable" ? 1 : 0,
    reusedCount: input.status === "already_activated" ? 1 : 0,
    conflictCount: input.status === "conflict" ? 1 : 0,
    blockerCount: issues.filter((issue) => issue.severity === "blocker").length,
    warningCount: issues.filter((issue) => issue.severity === "warning").length,
    issues,
    downstream: zeroDownstream(),
  };
}

function standardWarnings(
  session: DeploymentSterilizerShellActivationSessionSnapshot,
  item: DeploymentSterilizerShellActivationItemSnapshot,
  sterilizer: DeploymentSterilizerShellActivationSterilizerSnapshot | null,
): DeploymentSterilizerShellActivationIssue[] {
  return [
    sterilizerIssue("sterilizer_shell_activation_persistence_unavailable", session, item, sterilizer, "Atomic sterilizer-shell activation persistence is not implemented in this slice.", "warning"),
    sterilizerIssue("item_completion_unavailable", session, item, sterilizer, "Sterilizer activation item completion remains a future boundary.", "warning"),
    sterilizerIssue("dependency_progression_unavailable", session, item, sterilizer, "Dependency progression for later items remains a future boundary.", "warning"),
    sterilizerIssue("rollback_unavailable", session, item, sterilizer, "Rollback execution remains a future boundary.", "warning"),
  ];
}

function statusForIssues(
  issues: readonly DeploymentSterilizerShellActivationIssue[],
): "blocked" | "conflict" | "not_found" {
  if (issues.some((issue) => ["missing_session", "missing_sterilizer_shell", "no_running_item"].includes(issue.code))) {
    return "not_found";
  }

  return issues.some((issue) => [
    "clinic_identity_mismatch",
    "deployment_run_identity_mismatch",
    "session_identity_mismatch",
    "execution_key_mismatch",
    "session_owned_by_another_executor",
    "ownership_token_mismatch",
    "sterilizer_clinic_mismatch",
    "sterilizer_identity_mismatch",
  ].includes(issue.code))
    ? "conflict"
    : "blocked";
}

function addCommandIssue(
  issues: DeploymentSterilizerShellActivationIssue[],
  condition: boolean,
  code: DeploymentSterilizerShellActivationIssueCode,
  command: DeploymentSterilizerShellActivationCommand,
  message: string,
): void {
  if (condition) {
    issues.push(commandIssue(code, command, message));
  }
}

function commandIssue(
  code: DeploymentSterilizerShellActivationIssueCode,
  command: DeploymentSterilizerShellActivationCommand,
  message: string,
  diagnostics: DeploymentSterilizerShellActivationIssue["diagnostics"] = null,
): DeploymentSterilizerShellActivationIssue {
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
    diagnostics,
  };
}

function blocker(
  code: DeploymentSterilizerShellActivationIssueCode,
  session: DeploymentSterilizerShellActivationSessionSnapshot,
  item: DeploymentSterilizerShellActivationItemSnapshot | null,
  sterilizer: DeploymentSterilizerShellActivationSterilizerSnapshot | null,
  message: string,
  severity: DeploymentSterilizerShellActivationIssueSeverity = "blocker",
): DeploymentSterilizerShellActivationIssue {
  return {
    code,
    severity,
    message,
    sessionId: session.sessionId,
    executionKey: session.executionKey,
    executionItemKey: item?.executionItemKey ?? null,
    planItemKey: item?.planItemKey ?? null,
    sterilizerId: sterilizer?.sterilizerId ?? null,
    deploymentSterilizerKey: sterilizer?.deploymentSterilizerKey ?? null,
    sequence: item?.sequence ?? null,
  };
}

function sterilizerIssue(
  code: DeploymentSterilizerShellActivationIssueCode,
  session: DeploymentSterilizerShellActivationSessionSnapshot,
  item: DeploymentSterilizerShellActivationItemSnapshot | null,
  sterilizer: DeploymentSterilizerShellActivationSterilizerSnapshot | null,
  message: string,
  severity: DeploymentSterilizerShellActivationIssueSeverity = "blocker",
): DeploymentSterilizerShellActivationIssue {
  return blocker(code, session, item, sterilizer, message, severity);
}

function compareItems(
  left: DeploymentSterilizerShellActivationItemSnapshot,
  right: DeploymentSterilizerShellActivationItemSnapshot,
): number {
  return left.sequence - right.sequence || left.executionItemKey.localeCompare(right.executionItemKey);
}

function compareIssues(
  left: DeploymentSterilizerShellActivationIssue,
  right: DeploymentSterilizerShellActivationIssue,
): number {
  return (
    left.severity.localeCompare(right.severity) ||
    left.code.localeCompare(right.code) ||
    Number(left.sequence ?? 0) - Number(right.sequence ?? 0) ||
    String(left.sessionId ?? "").localeCompare(String(right.sessionId ?? "")) ||
    String(left.executionKey ?? "").localeCompare(String(right.executionKey ?? "")) ||
    String(left.executionItemKey ?? "").localeCompare(String(right.executionItemKey ?? "")) ||
    String(left.planItemKey ?? "").localeCompare(String(right.planItemKey ?? "")) ||
    String(left.deploymentSterilizerKey ?? "").localeCompare(String(right.deploymentSterilizerKey ?? ""))
  );
}

function hasBlocker(issues: readonly DeploymentSterilizerShellActivationIssue[]): boolean {
  return issues.some((issue) => issue.severity === "blocker");
}

function isValidTimestamp(value: string): boolean {
  return Number.isFinite(Date.parse(value));
}

function redactToken(value: string, token: string): string {
  return token ? value.split(token).join("[redacted]") : value;
}

function zeroDownstream(): DeploymentSterilizerShellActivationDownstreamCounts {
  return {
    sterilizersActivated: 0,
    itemsCompleted: 0,
    dependenciesProgressed: 0,
    bindingsWritten: 0,
    sessionsCompleted: 0,
    rollbacksExecuted: 0,
    deploymentFinalized: 0,
  };
}

function emptySnapshot(): DeploymentSterilizerShellActivationSnapshot {
  return {
    session: null,
    items: [],
    sterilizerShell: null,
    sterilizerLookup: null,
    aggregate: emptySterilizerShellActivationAggregate(),
  };
}
