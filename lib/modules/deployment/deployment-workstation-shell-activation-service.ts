import type {
  DeploymentWorkstationShellActivationRepository,
} from "./deployment-workstation-shell-activation-repository";
import {
  cloneWorkstationShellActivationSnapshot,
  emptyWorkstationShellActivationAggregate,
  type DeploymentWorkstationShellActivationCommand,
  type DeploymentWorkstationShellActivationDownstreamCounts,
  type DeploymentWorkstationShellActivationIssue,
  type DeploymentWorkstationShellActivationIssueCode,
  type DeploymentWorkstationShellActivationIssueSeverity,
  type DeploymentWorkstationShellActivationItemSnapshot,
  type DeploymentWorkstationShellActivationWorkstationLookupDiagnostics,
  type DeploymentWorkstationShellActivationWorkstationSnapshot,
  type DeploymentWorkstationShellActivationResult,
  type DeploymentWorkstationShellActivationSessionSnapshot,
  type DeploymentWorkstationShellActivationSnapshot,
  type DeploymentWorkstationShellActivationStatus,
} from "./deployment-workstation-shell-activation-types";

type WorkstationActivationMode = "activatable" | "already_activated" | "blocked";

export class DeploymentWorkstationShellActivationService {
  constructor(
    private readonly repository: DeploymentWorkstationShellActivationRepository,
  ) {}

  async assessWorkstationShellActivation(
    command: DeploymentWorkstationShellActivationCommand,
  ): Promise<DeploymentWorkstationShellActivationResult> {
    const commandIssues = validateCommand(command);

    if (hasBlocker(commandIssues)) {
      return buildResult({
        status: "blocked",
        command,
        snapshot: emptySnapshot(),
        runningItem: null,
        issues: commandIssues,
        message: "Workstation shell activation assessment rejected invalid input before repository access.",
      });
    }

    try {
      const snapshot = cloneWorkstationShellActivationSnapshot(
        await this.repository.loadWorkstationShellActivationSnapshot({
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
        : "Workstation shell activation repository failed safely.";

      return buildResult({
        status: "error",
        command,
        snapshot: emptySnapshot(),
        runningItem: null,
        issues: [commandIssue("repository_error", command, message)],
        message: "Workstation shell activation assessment could not complete because repository evidence was unavailable.",
      });
    }
  }
}

export function createDeploymentWorkstationShellActivationService(
  repository: DeploymentWorkstationShellActivationRepository,
): DeploymentWorkstationShellActivationService {
  return new DeploymentWorkstationShellActivationService(repository);
}

function assessSnapshot(
  command: DeploymentWorkstationShellActivationCommand,
  snapshot: DeploymentWorkstationShellActivationSnapshot,
): DeploymentWorkstationShellActivationResult {
  if (!snapshot.session) {
    return buildResult({
      status: "not_found",
      command,
      snapshot,
      runningItem: null,
      issues: [commandIssue("missing_session", command, "Activation execution session was not found.")],
      message: "Workstation shell activation assessment found no running execution session.",
    });
  }

  const session = snapshot.session;
  const orderedItems = [...snapshot.items].sort(compareItems);
  const prefix = getSucceededPrefix(orderedItems);
  const runningItems = orderedItems.filter((item) => item.executionStatus === "running");
  const runningItem = runningItems[0] ?? orderedItems.find((item) => item.sequence === prefix.length + 1) ?? null;
  const mode = activationMode(snapshot.workstationShell);
  const issues = [
    ...validateIdentity(command, session),
    ...validateSessionLifecycle(session),
    ...validateOwnership(command, session),
    ...validateAggregate(session, snapshot),
    ...validateSucceededPrefix(session, orderedItems, prefix),
    ...validateRunningItem(session, runningItem, prefix.length + 1),
    ...validateWorkstationShell(command, session, runningItem, snapshot.workstationShell, snapshot.aggregate, mode, snapshot.workstationLookup),
    ...validateLaterItems(session, orderedItems, runningItem),
  ];

  if (hasBlocker(issues)) {
    return buildResult({
      status: statusForIssues(issues),
      command,
      snapshot,
      runningItem,
      issues,
      message: "Workstation shell activation assessment blocked because session, item, or workstation evidence is not safe.",
    });
  }

  const status = mode === "already_activated" ? "already_activated" : "activatable";

  return buildResult({
    status,
    command,
    snapshot,
    runningItem,
    issues: runningItem ? standardWarnings(session, runningItem, snapshot.workstationShell) : [],
    message: status === "already_activated"
      ? "Workstation shell is already activated. No workstation mutation was performed."
      : "Workstation shell is activatable. No workstation mutation was persisted.",
  });
}

function validateCommand(
  command: DeploymentWorkstationShellActivationCommand,
): DeploymentWorkstationShellActivationIssue[] {
  const issues: DeploymentWorkstationShellActivationIssue[] = [];

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
  command: DeploymentWorkstationShellActivationCommand,
  session: DeploymentWorkstationShellActivationSessionSnapshot,
): DeploymentWorkstationShellActivationIssue[] {
  const issues: DeploymentWorkstationShellActivationIssue[] = [];

  addCommandIssue(issues, session.clinicId !== command.clinicId, "clinic_identity_mismatch", command, "Execution session clinic does not match the workstation activation request.");
  addCommandIssue(issues, session.deploymentRunKey !== command.deploymentRunKey, "deployment_run_identity_mismatch", command, "Execution session deployment run does not match the workstation activation request.");
  addCommandIssue(issues, session.sessionId !== command.sessionId, "session_identity_mismatch", command, "Execution session id does not match the workstation activation request.");
  addCommandIssue(issues, session.executionKey !== command.executionKey, "execution_key_mismatch", command, "Execution session key does not match the workstation activation request.");

  return issues;
}

function validateSessionLifecycle(
  session: DeploymentWorkstationShellActivationSessionSnapshot,
): DeploymentWorkstationShellActivationIssue[] {
  const issues: DeploymentWorkstationShellActivationIssue[] = [];

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
  command: DeploymentWorkstationShellActivationCommand,
  session: DeploymentWorkstationShellActivationSessionSnapshot,
): DeploymentWorkstationShellActivationIssue[] {
  const issues: DeploymentWorkstationShellActivationIssue[] = [];

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
    issues.push(blocker("ownership_token_mismatch", session, null, null, "Execution session ownership token does not match the workstation activation request."));
  }

  if (Date.parse(session.leaseExpiresAt) <= Date.parse(command.now)) {
    issues.push(blocker("lease_expired", session, null, null, "Execution session lease is not active."));
  }

  return issues;
}

function validateAggregate(
  session: DeploymentWorkstationShellActivationSessionSnapshot,
  snapshot: DeploymentWorkstationShellActivationSnapshot,
): DeploymentWorkstationShellActivationIssue[] {
  const issues: DeploymentWorkstationShellActivationIssue[] = [];
  const aggregate = snapshot.aggregate;

  if (aggregate.totalItemCount !== session.itemsRequested || aggregate.totalItemCount !== snapshot.items.length || aggregate.totalItemCount < 1) {
    issues.push(blocker("item_count_mismatch", session, null, null, "Durable execution item count does not match requested item evidence."));
  }

  if (aggregate.runningItemCount === 0) {
    issues.push(blocker("no_running_item", session, null, null, "No running workstation activation item exists."));
  }

  if (aggregate.runningItemCount > 1) {
    issues.push(blocker("multiple_running_items", session, null, null, "More than one execution item is running."));
  }

  if (aggregate.failedItemCount > 0) {
    issues.push(blocker("later_item_drift", session, null, null, "Execution items include failed evidence."));
  }

  if (aggregate.duplicateExecutionItemKeyCount > 0 || aggregate.duplicatePlanItemKeyCount > 0 || aggregate.duplicateSequenceCount > 0) {
    issues.push(blocker("duplicate_item_identity", session, null, null, "Duplicate durable execution item identity prevents workstation activation assessment."));
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
  session: DeploymentWorkstationShellActivationSessionSnapshot,
  items: readonly DeploymentWorkstationShellActivationItemSnapshot[],
  prefix: readonly DeploymentWorkstationShellActivationItemSnapshot[],
): DeploymentWorkstationShellActivationIssue[] {
  const issues: DeploymentWorkstationShellActivationIssue[] = [];

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
  session: DeploymentWorkstationShellActivationSessionSnapshot,
  item: DeploymentWorkstationShellActivationItemSnapshot,
): DeploymentWorkstationShellActivationIssue[] {
  const issues: DeploymentWorkstationShellActivationIssue[] = [];

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
  session: DeploymentWorkstationShellActivationSessionSnapshot,
  item: DeploymentWorkstationShellActivationItemSnapshot | null,
  expectedSequence: number,
): DeploymentWorkstationShellActivationIssue[] {
  if (!item) {
    return [blocker("no_running_item", session, null, null, "No deterministic running workstation activation item exists.")];
  }

  const issues: DeploymentWorkstationShellActivationIssue[] = [];

  if (item.sequence !== expectedSequence) {
    issues.push(blocker("running_item_sequence_mismatch", session, item, null, "Running workstation activation item is not the deterministic next sequence after the succeeded prefix."));
  }

  if (item.executionStatus !== "running") {
    issues.push(blocker("running_item_status_invalid", session, item, null, "Workstation activation item must be running."));
  }

  if (item.attemptCount !== 1) {
    issues.push(blocker("running_item_attempt_invalid", session, item, null, "Workstation activation item must have exactly one attempt."));
  }

  if (!item.startedAt || !isValidTimestamp(item.startedAt)) {
    issues.push(blocker("running_item_started_at_missing", session, item, null, "Workstation activation item requires valid started_at evidence."));
  }

  if (item.completedAt !== null) {
    issues.push(blocker("running_item_completion_evidence_present", session, item, null, "Workstation activation item must not have completed_at evidence."));
  }

  if (item.rolledBackAt !== null) {
    issues.push(blocker("running_item_rollback_evidence_present", session, item, null, "Workstation activation item has rollback evidence."));
  }

  if (item.errorCode !== null || item.errorMessage !== null) {
    issues.push(blocker("running_item_error_present", session, item, null, "Workstation activation item has error evidence."));
  }

  if (!item.entityId || !item.entityId.trim()) {
    issues.push(blocker("running_item_entity_identity_missing", session, item, null, "Workstation activation item entity identity is missing."));
  }

  if (item.entityType !== "workstation_shell" || item.action !== "activate") {
    issues.push(blocker("unsupported_running_item_lifecycle", session, item, null, "Only workstation-shell activate items are supported by this assessment."));
  }

  return issues;
}

function validateWorkstationShell(
  command: DeploymentWorkstationShellActivationCommand,
  session: DeploymentWorkstationShellActivationSessionSnapshot,
  item: DeploymentWorkstationShellActivationItemSnapshot | null,
  workstation: DeploymentWorkstationShellActivationWorkstationSnapshot | null,
  aggregate: DeploymentWorkstationShellActivationSnapshot["aggregate"],
  mode: WorkstationActivationMode,
  workstationLookup: DeploymentWorkstationShellActivationWorkstationLookupDiagnostics | null,
): DeploymentWorkstationShellActivationIssue[] {
  if (!workstation) {
    return [commandIssue("missing_workstation_shell", command, "Workstation shell was not found.", workstationLookupIssueDiagnostics(workstationLookup))];
  }

  const issues: DeploymentWorkstationShellActivationIssue[] = [];

  if (aggregate.workstationCandidateCount !== 1) {
    issues.push(workstationIssue("duplicate_workstation_identity", session, item, workstation, "Workstation activation assessment requires exactly one workstation shell candidate."));
  }

  if (aggregate.duplicateWorkstationIdentityCount > 0) {
    issues.push(workstationIssue("duplicate_workstation_identity", session, item, workstation, "Duplicate workstation shell deployment identity prevents activation assessment."));
  }

  if (workstation.clinicId !== session.clinicId || workstation.clinicId !== command.clinicId) {
    issues.push(workstationIssue("workstation_clinic_mismatch", session, item, workstation, "Workstation shell does not belong to the execution clinic."));
  }

  const expectedWorkstationKey = item ? deploymentWorkstationKeyFromItem(item) : null;
  const entityIdMatchesWorkstation = item?.entityId === workstation.workstationId;
  if (!workstation.deploymentWorkstationKey || (expectedWorkstationKey !== null && workstation.deploymentWorkstationKey !== expectedWorkstationKey) || !entityIdMatchesWorkstation) {
    issues.push(workstationIssue("workstation_identity_mismatch", session, item, workstation, "Workstation shell identity does not match the running execution item."));
  }

  if (!isUuid(workstation.workstationId) || !item?.entityId || !isUuid(item.entityId)) {
    issues.push(workstationIssue("workstation_uuid_invalid", session, item, workstation, "Workstation shell and execution-item entity identities must be UUIDs."));
  }

  if (!isTransitionOnlyTargetState(item?.targetState ?? null)) {
    issues.push(workstationIssue("workstation_target_state_invalid", session, item, workstation, "Workstation activation target state must contain only provisioningStatus=active and active=true."));
  }

  if (workstation.provisioningSource !== "setup_draft") {
    issues.push(workstationIssue("workstation_provisioning_source_invalid", session, item, workstation, "Workstation shell must be sourced from setup_draft."));
  }

  if (mode === "already_activated") {
    if (workstation.active !== true) {
      issues.push(workstationIssue("workstation_active_state_invalid", session, item, workstation, "Already-activated workstation shell must be active."));
    }
    if (workstation.provisioningStatus !== "active") {
      issues.push(workstationIssue("workstation_provisioning_status_invalid", session, item, workstation, "Already-activated workstation shell must have active provisioning status."));
    }
    return issues;
  }

  if (!matchesImmutableCurrentState(item?.expectedCurrentState ?? null, workstation)) {
    issues.push(workstationIssue("workstation_current_state_invalid", session, item, workstation, "Workstation immutable current-state evidence does not match the selected shell."));
  }

  if (workstation.planned !== true) {
    issues.push(workstationIssue("workstation_planned_invalid", session, item, workstation, "Workstation shell must retain planned semantics before activation."));
  }

  if (workstation.active !== false) {
    issues.push(workstationIssue("workstation_active_state_invalid", session, item, workstation, "Workstation shell must be inactive before activation."));
  }

  if (workstation.provisioningStatus !== "planned") {
    issues.push(workstationIssue("workstation_provisioning_status_invalid", session, item, workstation, "Workstation shell provisioning status must be planned before activation."));
  }

  return issues;
}

function deploymentWorkstationKeyFromItem(
  item: DeploymentWorkstationShellActivationItemSnapshot,
): string | null {
  return stringField(item.expectedCurrentState, "deploymentWorkstationKey") ??
    stringField(item.expectedCurrentState, "deployment_workstation_key");
}


function matchesImmutableCurrentState(
  state: Record<string, unknown> | null,
  workstation: DeploymentWorkstationShellActivationWorkstationSnapshot,
): boolean {
  return state?.deploymentWorkstationKey === workstation.deploymentWorkstationKey &&
    state.provisioningSource === workstation.provisioningSource &&
    state.provisioningStatus === workstation.provisioningStatus &&
    state.active === workstation.active;
}

function isTransitionOnlyTargetState(state: Record<string, unknown> | null): boolean {
  if (!state) return false;
  const keys = Object.keys(state).sort();
  return keys.length === 2 && keys[0] === "active" && keys[1] === "provisioningStatus" &&
    state.active === true && state.provisioningStatus === "active";
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function stringField(source: Record<string, unknown> | null, key: string): string | null {
  const value = source?.[key];
  return typeof value === "string" && value.trim() ? value : null;
}


function workstationLookupIssueDiagnostics(
  workstationLookup: DeploymentWorkstationShellActivationWorkstationLookupDiagnostics | null,
): DeploymentWorkstationShellActivationIssue["diagnostics"] {
  if (!workstationLookup) {
    return null;
  }

  return {
    layer: "snapshot_workstation_lookup",
    rpcAttempted: false,
    workstationLookupAttempted: workstationLookup.attempted,
    workstationLookupResult: workstationLookup.result,
    workstationLookupRowsReturned: workstationLookup.rowsReturned,
    workstationLookupDeploymentWorkstationKey: workstationLookup.deploymentWorkstationKey,
    workstationLookupWorkstationId: workstationLookup.workstationId,
  };
}
function validateLaterItems(
  session: DeploymentWorkstationShellActivationSessionSnapshot,
  items: readonly DeploymentWorkstationShellActivationItemSnapshot[],
  runningItem: DeploymentWorkstationShellActivationItemSnapshot | null,
): DeploymentWorkstationShellActivationIssue[] {
  if (!runningItem) {
    return [];
  }

  const issues: DeploymentWorkstationShellActivationIssue[] = [];

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
  workstation: DeploymentWorkstationShellActivationWorkstationSnapshot | null,
): WorkstationActivationMode {
  if (!workstation) {
    return "blocked";
  }

  return workstation.active === true || workstation.provisioningStatus === "active"
    ? "already_activated"
    : "activatable";
}

function getSucceededPrefix(
  items: readonly DeploymentWorkstationShellActivationItemSnapshot[],
): DeploymentWorkstationShellActivationItemSnapshot[] {
  const prefix: DeploymentWorkstationShellActivationItemSnapshot[] = [];
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
  status: DeploymentWorkstationShellActivationStatus;
  command: DeploymentWorkstationShellActivationCommand;
  snapshot: DeploymentWorkstationShellActivationSnapshot;
  runningItem: DeploymentWorkstationShellActivationItemSnapshot | null;
  issues: readonly DeploymentWorkstationShellActivationIssue[];
  message: string;
}): DeploymentWorkstationShellActivationResult {
  const issues = [...input.issues].sort(compareIssues);
  const session = input.snapshot.session;
  const workstation = input.snapshot.workstationShell;
  const item = input.runningItem;

  return {
    ok: input.status === "activatable" || input.status === "already_activated",
    status: input.status,
    message: input.message,
    claimantId: input.command.claimantId || null,
    clinicId: workstation?.clinicId ?? session?.clinicId ?? input.command.clinicId ?? null,
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
    workstationId: workstation?.workstationId ?? null,
    deploymentWorkstationKey: workstation?.deploymentWorkstationKey ?? null,
    workstationDisplayName: null,
    workstationActive: workstation?.active ?? null,
    workstationProvisioningStatus: workstation?.provisioningStatus ?? null,
    workstationProvisioningSource: workstation?.provisioningSource ?? null,
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
  session: DeploymentWorkstationShellActivationSessionSnapshot,
  item: DeploymentWorkstationShellActivationItemSnapshot,
  workstation: DeploymentWorkstationShellActivationWorkstationSnapshot | null,
): DeploymentWorkstationShellActivationIssue[] {
  return [
    workstationIssue("workstation_shell_activation_persistence_unavailable", session, item, workstation, "Atomic workstation-shell activation persistence is not implemented in this slice.", "warning"),
    workstationIssue("item_completion_unavailable", session, item, workstation, "Workstation activation item completion remains a future boundary.", "warning"),
    workstationIssue("dependency_progression_unavailable", session, item, workstation, "Dependency progression for later items remains a future boundary.", "warning"),
    workstationIssue("rollback_unavailable", session, item, workstation, "Rollback execution remains a future boundary.", "warning"),
  ];
}

function statusForIssues(
  issues: readonly DeploymentWorkstationShellActivationIssue[],
): "blocked" | "conflict" | "not_found" {
  if (issues.some((issue) => ["missing_session", "missing_workstation_shell", "no_running_item"].includes(issue.code))) {
    return "not_found";
  }

  return issues.some((issue) => [
    "clinic_identity_mismatch",
    "deployment_run_identity_mismatch",
    "session_identity_mismatch",
    "execution_key_mismatch",
    "session_owned_by_another_executor",
    "ownership_token_mismatch",
    "workstation_clinic_mismatch",
    "workstation_identity_mismatch",
  ].includes(issue.code))
    ? "conflict"
    : "blocked";
}

function addCommandIssue(
  issues: DeploymentWorkstationShellActivationIssue[],
  condition: boolean,
  code: DeploymentWorkstationShellActivationIssueCode,
  command: DeploymentWorkstationShellActivationCommand,
  message: string,
): void {
  if (condition) {
    issues.push(commandIssue(code, command, message));
  }
}

function commandIssue(
  code: DeploymentWorkstationShellActivationIssueCode,
  command: DeploymentWorkstationShellActivationCommand,
  message: string,
  diagnostics: DeploymentWorkstationShellActivationIssue["diagnostics"] = null,
): DeploymentWorkstationShellActivationIssue {
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
    diagnostics,
  };
}

function blocker(
  code: DeploymentWorkstationShellActivationIssueCode,
  session: DeploymentWorkstationShellActivationSessionSnapshot,
  item: DeploymentWorkstationShellActivationItemSnapshot | null,
  workstation: DeploymentWorkstationShellActivationWorkstationSnapshot | null,
  message: string,
  severity: DeploymentWorkstationShellActivationIssueSeverity = "blocker",
): DeploymentWorkstationShellActivationIssue {
  return {
    code,
    severity,
    message,
    sessionId: session.sessionId,
    executionKey: session.executionKey,
    executionItemKey: item?.executionItemKey ?? null,
    planItemKey: item?.planItemKey ?? null,
    workstationId: workstation?.workstationId ?? null,
    deploymentWorkstationKey: workstation?.deploymentWorkstationKey ?? null,
    sequence: item?.sequence ?? null,
  };
}

function workstationIssue(
  code: DeploymentWorkstationShellActivationIssueCode,
  session: DeploymentWorkstationShellActivationSessionSnapshot,
  item: DeploymentWorkstationShellActivationItemSnapshot | null,
  workstation: DeploymentWorkstationShellActivationWorkstationSnapshot | null,
  message: string,
  severity: DeploymentWorkstationShellActivationIssueSeverity = "blocker",
): DeploymentWorkstationShellActivationIssue {
  return blocker(code, session, item, workstation, message, severity);
}

function compareItems(
  left: DeploymentWorkstationShellActivationItemSnapshot,
  right: DeploymentWorkstationShellActivationItemSnapshot,
): number {
  return left.sequence - right.sequence || left.executionItemKey.localeCompare(right.executionItemKey);
}

function compareIssues(
  left: DeploymentWorkstationShellActivationIssue,
  right: DeploymentWorkstationShellActivationIssue,
): number {
  return (
    left.severity.localeCompare(right.severity) ||
    left.code.localeCompare(right.code) ||
    Number(left.sequence ?? 0) - Number(right.sequence ?? 0) ||
    String(left.sessionId ?? "").localeCompare(String(right.sessionId ?? "")) ||
    String(left.executionKey ?? "").localeCompare(String(right.executionKey ?? "")) ||
    String(left.executionItemKey ?? "").localeCompare(String(right.executionItemKey ?? "")) ||
    String(left.planItemKey ?? "").localeCompare(String(right.planItemKey ?? "")) ||
    String(left.deploymentWorkstationKey ?? "").localeCompare(String(right.deploymentWorkstationKey ?? ""))
  );
}

function hasBlocker(issues: readonly DeploymentWorkstationShellActivationIssue[]): boolean {
  return issues.some((issue) => issue.severity === "blocker");
}

function isValidTimestamp(value: string): boolean {
  return Number.isFinite(Date.parse(value));
}

function redactToken(value: string, token: string): string {
  return token ? value.split(token).join("[redacted]") : value;
}

function zeroDownstream(): DeploymentWorkstationShellActivationDownstreamCounts {
  return {
    workstationsActivated: 0,
    itemsCompleted: 0,
    dependenciesProgressed: 0,
    bindingsWritten: 0,
    sessionsCompleted: 0,
    rollbacksExecuted: 0,
    deploymentFinalized: 0,
  };
}

function emptySnapshot(): DeploymentWorkstationShellActivationSnapshot {
  return {
    session: null,
    items: [],
    workstationShell: null,
    workstationLookup: null,
    aggregate: emptyWorkstationShellActivationAggregate(),
  };
}
