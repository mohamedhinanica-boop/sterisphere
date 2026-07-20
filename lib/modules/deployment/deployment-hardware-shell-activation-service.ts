import type {
  DeploymentHardwareShellActivationRepository,
} from "./deployment-hardware-shell-activation-repository";
import {
  cloneHardwareShellActivationSnapshot,
  emptyHardwareShellActivationAggregate,
  type DeploymentHardwareShellActivationCommand,
  type DeploymentHardwareShellActivationDownstreamCounts,
  type DeploymentHardwareShellActivationIssue,
  type DeploymentHardwareShellActivationIssueCode,
  type DeploymentHardwareShellActivationIssueSeverity,
  type DeploymentHardwareShellActivationItemSnapshot,
  type DeploymentHardwareShellActivationHardwareLookupDiagnostics,
  type DeploymentHardwareShellActivationHardwareSnapshot,
  type DeploymentHardwareShellActivationResult,
  type DeploymentHardwareShellActivationSessionSnapshot,
  type DeploymentHardwareShellActivationSnapshot,
  type DeploymentHardwareShellActivationStatus,
} from "./deployment-hardware-shell-activation-types";

type HardwareActivationMode = "activatable" | "already_activated" | "blocked";

export class DeploymentHardwareShellActivationService {
  constructor(
    private readonly repository: DeploymentHardwareShellActivationRepository,
  ) {}

  async assessHardwareShellActivation(
    command: DeploymentHardwareShellActivationCommand,
  ): Promise<DeploymentHardwareShellActivationResult> {
    const commandIssues = validateCommand(command);

    if (hasBlocker(commandIssues)) {
      return buildResult({
        status: "blocked",
        command,
        snapshot: emptySnapshot(),
        runningItem: null,
        issues: commandIssues,
        message: "Hardware shell activation assessment rejected invalid input before repository access.",
      });
    }

    try {
      const snapshot = cloneHardwareShellActivationSnapshot(
        await this.repository.loadHardwareShellActivationSnapshot({
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
        : "Hardware shell activation repository failed safely.";

      return buildResult({
        status: "error",
        command,
        snapshot: emptySnapshot(),
        runningItem: null,
        issues: [commandIssue("repository_error", command, message)],
        message: "Hardware shell activation assessment could not complete because repository evidence was unavailable.",
      });
    }
  }
}

export function createDeploymentHardwareShellActivationService(
  repository: DeploymentHardwareShellActivationRepository,
): DeploymentHardwareShellActivationService {
  return new DeploymentHardwareShellActivationService(repository);
}

function assessSnapshot(
  command: DeploymentHardwareShellActivationCommand,
  snapshot: DeploymentHardwareShellActivationSnapshot,
): DeploymentHardwareShellActivationResult {
  if (!snapshot.session) {
    return buildResult({
      status: "not_found",
      command,
      snapshot,
      runningItem: null,
      issues: [commandIssue("missing_session", command, "Activation execution session was not found.")],
      message: "Hardware shell activation assessment found no running execution session.",
    });
  }

  const session = snapshot.session;
  const orderedItems = [...snapshot.items].sort(compareItems);
  const prefix = getSucceededPrefix(orderedItems);
  const runningItems = orderedItems.filter((item) => item.executionStatus === "running");
  const runningItem = runningItems[0] ?? orderedItems.find((item) => item.sequence === prefix.length + 1) ?? null;
  const mode = activationMode(snapshot.hardwareShell);
  const issues = [
    ...validateIdentity(command, session),
    ...validateSessionLifecycle(session),
    ...validateOwnership(command, session),
    ...validateAggregate(session, snapshot),
    ...validateSucceededPrefix(session, orderedItems, prefix),
    ...validateRunningItem(session, runningItem, prefix.length + 1),
    ...validateHardwareShell(command, session, runningItem, snapshot.hardwareShell, snapshot.aggregate, mode, snapshot.hardwareLookup),
    ...validateLaterItems(session, orderedItems, runningItem),
  ];

  if (hasBlocker(issues)) {
    return buildResult({
      status: statusForIssues(issues),
      command,
      snapshot,
      runningItem,
      issues,
      message: "Hardware shell activation assessment blocked because session, item, or hardware evidence is not safe.",
    });
  }

  const status = mode === "already_activated" ? "already_activated" : "activatable";

  return buildResult({
    status,
    command,
    snapshot,
    runningItem,
    issues: runningItem ? standardWarnings(session, runningItem, snapshot.hardwareShell) : [],
    message: status === "already_activated"
      ? "Hardware shell is already activated. No hardware mutation was performed."
      : "Hardware shell is activatable. No hardware mutation was persisted.",
  });
}

function validateCommand(
  command: DeploymentHardwareShellActivationCommand,
): DeploymentHardwareShellActivationIssue[] {
  const issues: DeploymentHardwareShellActivationIssue[] = [];

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
  command: DeploymentHardwareShellActivationCommand,
  session: DeploymentHardwareShellActivationSessionSnapshot,
): DeploymentHardwareShellActivationIssue[] {
  const issues: DeploymentHardwareShellActivationIssue[] = [];

  addCommandIssue(issues, session.clinicId !== command.clinicId, "clinic_identity_mismatch", command, "Execution session clinic does not match the hardware activation request.");
  addCommandIssue(issues, session.deploymentRunKey !== command.deploymentRunKey, "deployment_run_identity_mismatch", command, "Execution session deployment run does not match the hardware activation request.");
  addCommandIssue(issues, session.sessionId !== command.sessionId, "session_identity_mismatch", command, "Execution session id does not match the hardware activation request.");
  addCommandIssue(issues, session.executionKey !== command.executionKey, "execution_key_mismatch", command, "Execution session key does not match the hardware activation request.");

  return issues;
}

function validateSessionLifecycle(
  session: DeploymentHardwareShellActivationSessionSnapshot,
): DeploymentHardwareShellActivationIssue[] {
  const issues: DeploymentHardwareShellActivationIssue[] = [];

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
  command: DeploymentHardwareShellActivationCommand,
  session: DeploymentHardwareShellActivationSessionSnapshot,
): DeploymentHardwareShellActivationIssue[] {
  const issues: DeploymentHardwareShellActivationIssue[] = [];

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
    issues.push(blocker("ownership_token_mismatch", session, null, null, "Execution session ownership token does not match the hardware activation request."));
  }

  if (Date.parse(session.leaseExpiresAt) <= Date.parse(command.now)) {
    issues.push(blocker("lease_expired", session, null, null, "Execution session lease is not active."));
  }

  return issues;
}

function validateAggregate(
  session: DeploymentHardwareShellActivationSessionSnapshot,
  snapshot: DeploymentHardwareShellActivationSnapshot,
): DeploymentHardwareShellActivationIssue[] {
  const issues: DeploymentHardwareShellActivationIssue[] = [];
  const aggregate = snapshot.aggregate;

  if (aggregate.totalItemCount !== session.itemsRequested || aggregate.totalItemCount !== snapshot.items.length || aggregate.totalItemCount < 1) {
    issues.push(blocker("item_count_mismatch", session, null, null, "Durable execution item count does not match requested item evidence."));
  }

  if (aggregate.runningItemCount === 0) {
    issues.push(blocker("no_running_item", session, null, null, "No running hardware activation item exists."));
  }

  if (aggregate.runningItemCount > 1) {
    issues.push(blocker("multiple_running_items", session, null, null, "More than one execution item is running."));
  }

  if (aggregate.failedItemCount > 0) {
    issues.push(blocker("later_item_drift", session, null, null, "Execution items include failed evidence."));
  }

  if (aggregate.duplicateExecutionItemKeyCount > 0 || aggregate.duplicatePlanItemKeyCount > 0 || aggregate.duplicateSequenceCount > 0) {
    issues.push(blocker("duplicate_item_identity", session, null, null, "Duplicate durable execution item identity prevents hardware activation assessment."));
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
  session: DeploymentHardwareShellActivationSessionSnapshot,
  items: readonly DeploymentHardwareShellActivationItemSnapshot[],
  prefix: readonly DeploymentHardwareShellActivationItemSnapshot[],
): DeploymentHardwareShellActivationIssue[] {
  const issues: DeploymentHardwareShellActivationIssue[] = [];

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
  session: DeploymentHardwareShellActivationSessionSnapshot,
  item: DeploymentHardwareShellActivationItemSnapshot,
): DeploymentHardwareShellActivationIssue[] {
  const issues: DeploymentHardwareShellActivationIssue[] = [];

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
  session: DeploymentHardwareShellActivationSessionSnapshot,
  item: DeploymentHardwareShellActivationItemSnapshot | null,
  expectedSequence: number,
): DeploymentHardwareShellActivationIssue[] {
  if (!item) {
    return [blocker("no_running_item", session, null, null, "No deterministic running hardware activation item exists.")];
  }

  const issues: DeploymentHardwareShellActivationIssue[] = [];

  if (item.sequence !== expectedSequence) {
    issues.push(blocker("running_item_sequence_mismatch", session, item, null, "Running hardware activation item is not the deterministic next sequence after the succeeded prefix."));
  }

  if (item.executionStatus !== "running") {
    issues.push(blocker("running_item_status_invalid", session, item, null, "Hardware activation item must be running."));
  }

  if (item.attemptCount !== 1) {
    issues.push(blocker("running_item_attempt_invalid", session, item, null, "Hardware activation item must have exactly one attempt."));
  }

  if (!item.startedAt || !isValidTimestamp(item.startedAt)) {
    issues.push(blocker("running_item_started_at_missing", session, item, null, "Hardware activation item requires valid started_at evidence."));
  }

  if (item.completedAt !== null) {
    issues.push(blocker("running_item_completion_evidence_present", session, item, null, "Hardware activation item must not have completed_at evidence."));
  }

  if (item.rolledBackAt !== null) {
    issues.push(blocker("running_item_rollback_evidence_present", session, item, null, "Hardware activation item has rollback evidence."));
  }

  if (item.errorCode !== null || item.errorMessage !== null) {
    issues.push(blocker("running_item_error_present", session, item, null, "Hardware activation item has error evidence."));
  }

  if (!item.entityId || !item.entityId.trim()) {
    issues.push(blocker("running_item_entity_identity_missing", session, item, null, "Hardware activation item entity identity is missing."));
  }

  if (item.entityType !== "hardware_shell" || item.action !== "activate") {
    issues.push(blocker("unsupported_running_item_lifecycle", session, item, null, "Only hardware-shell activate items are supported by this assessment."));
  }

  return issues;
}

function validateHardwareShell(
  command: DeploymentHardwareShellActivationCommand,
  session: DeploymentHardwareShellActivationSessionSnapshot,
  item: DeploymentHardwareShellActivationItemSnapshot | null,
  hardware: DeploymentHardwareShellActivationHardwareSnapshot | null,
  aggregate: DeploymentHardwareShellActivationSnapshot["aggregate"],
  mode: HardwareActivationMode,
  hardwareLookup: DeploymentHardwareShellActivationHardwareLookupDiagnostics | null,
): DeploymentHardwareShellActivationIssue[] {
  if (!hardware) {
    return [commandIssue("missing_hardware_shell", command, "Hardware shell was not found.", hardwareLookupIssueDiagnostics(hardwareLookup))];
  }

  const issues: DeploymentHardwareShellActivationIssue[] = [];

  if (aggregate.hardwareCandidateCount !== 1) {
    issues.push(hardwareIssue("duplicate_hardware_identity", session, item, hardware, "Hardware activation assessment requires exactly one hardware shell candidate."));
  }

  if (aggregate.duplicateHardwareIdentityCount > 0) {
    issues.push(hardwareIssue("duplicate_hardware_identity", session, item, hardware, "Duplicate hardware shell deployment identity prevents activation assessment."));
  }

  if (hardware.clinicId !== session.clinicId || hardware.clinicId !== command.clinicId) {
    issues.push(hardwareIssue("hardware_clinic_mismatch", session, item, hardware, "Hardware shell does not belong to the execution clinic."));
  }

  const expectedHardwareKey = item ? deploymentHardwareKeyFromItem(item) : null;
  const entityIdMatchesHardware = item?.entityId === hardware.hardwareId;
  if (!hardware.deploymentHardwareKey || (expectedHardwareKey !== null && hardware.deploymentHardwareKey !== expectedHardwareKey) || !entityIdMatchesHardware) {
    issues.push(hardwareIssue("hardware_identity_mismatch", session, item, hardware, "Hardware shell identity does not match the running execution item."));
  }

  if (!isUuid(hardware.hardwareId) || !item?.entityId || !isUuid(item.entityId)) {
    issues.push(hardwareIssue("hardware_uuid_invalid", session, item, hardware, "Hardware shell and execution-item entity identities must be UUIDs."));
  }

  if (!isTransitionOnlyTargetState(item?.targetState ?? null)) {
    issues.push(hardwareIssue("hardware_target_state_invalid", session, item, hardware, "Hardware activation target state must contain only provisioningStatus=active and active=true."));
  }

  if (hardware.provisioningSource !== "setup_draft") {
    issues.push(hardwareIssue("hardware_provisioning_source_invalid", session, item, hardware, "Hardware shell must be sourced from setup_draft."));
  }

  if (mode === "already_activated") {
    if (hardware.active !== true) {
      issues.push(hardwareIssue("hardware_active_state_invalid", session, item, hardware, "Already-activated hardware shell must be active."));
    }
    if (hardware.provisioningStatus !== "active") {
      issues.push(hardwareIssue("hardware_provisioning_status_invalid", session, item, hardware, "Already-activated hardware shell must have active provisioning status."));
    }
    return issues;
  }

  if (!matchesImmutableCurrentState(item?.expectedCurrentState ?? null, hardware)) {
    issues.push(hardwareIssue(
      "hardware_current_state_invalid",
      session,
      item,
      hardware,
      "Hardware immutable current-state evidence does not match the selected shell.",
      "blocker",
      hardwareImmutableStateDiagnostics(item?.expectedCurrentState ?? null, hardware.currentState ?? null),
    ));
  }

  if (hardware.planned !== true) {
    issues.push(hardwareIssue("hardware_planned_invalid", session, item, hardware, "Hardware shell must retain planned semantics before activation."));
  }

  if (hardware.active !== false) {
    issues.push(hardwareIssue("hardware_active_state_invalid", session, item, hardware, "Hardware shell must be inactive before activation."));
  }

  if (hardware.provisioningStatus !== "planned") {
    issues.push(hardwareIssue("hardware_provisioning_status_invalid", session, item, hardware, "Hardware shell provisioning status must be planned before activation."));
  }

  return issues;
}

function deploymentHardwareKeyFromItem(
  item: DeploymentHardwareShellActivationItemSnapshot,
): string | null {
  return stringField(item.expectedCurrentState, "deploymentHardwareKey") ??
    stringField(item.expectedCurrentState, "deployment_hardware_key");
}


const HARDWARE_IMMUTABLE_STATE_FIELDS = [
  "id", "clinicId", "deploymentHardwareKey", "provisioningSource", "provisioningStatus",
  "active", "operationalStatus", "agentId", "defaultWorkstationId", "currentWorkstationId",
] as const;

export function hardwareImmutableStateDiagnostics(
  expectedPlannerState: Record<string, unknown> | null,
  repositoryCurrentState: Record<string, unknown> | null,
): NonNullable<DeploymentHardwareShellActivationIssue["diagnostics"]> {
  const expected = immutableStateSnapshot(expectedPlannerState);
  const actual = immutableStateSnapshot(repositoryCurrentState);
  const differingFields: string[] = [];
  const differences: Record<string, { expected: { present: boolean; value?: unknown }; actual: { present: boolean; value?: unknown } }> = {};

  for (const field of HARDWARE_IMMUTABLE_STATE_FIELDS) {
    const expectedValue = fieldValue(expectedPlannerState, field);
    const actualValue = fieldValue(repositoryCurrentState, field);
    if (expectedValue.present !== actualValue.present || !Object.is(expectedValue.value, actualValue.value)) {
      differingFields.push(field);
      differences[field] = { expected: evidenceValue(expectedValue), actual: evidenceValue(actualValue) };
    }
  }

  return { differingFields, expectedPlannerState: expected, repositoryCurrentState: actual, differences };
}

function immutableStateSnapshot(state: Record<string, unknown> | null): Record<string, unknown> {
  const snapshot: Record<string, unknown> = {};
  for (const field of HARDWARE_IMMUTABLE_STATE_FIELDS) {
    if (state && Object.prototype.hasOwnProperty.call(state, field)) snapshot[field] = state[field];
  }
  return snapshot;
}

function fieldValue(state: Record<string, unknown> | null, field: string): { present: boolean; value: unknown } {
  const present = state !== null && Object.prototype.hasOwnProperty.call(state, field);
  return { present, value: present ? state[field] : undefined };
}

function evidenceValue(input: { present: boolean; value: unknown }): { present: boolean; value?: unknown } {
  return input.present ? { present: true, value: input.value } : { present: false };
}
function matchesImmutableCurrentState(
  state: Record<string, unknown> | null,
  hardware: DeploymentHardwareShellActivationHardwareSnapshot,
): boolean {
  return state !== null && hardware.currentState !== null && hardware.currentState !== undefined &&
    JSON.stringify(state) === JSON.stringify(hardware.currentState);
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


function hardwareLookupIssueDiagnostics(
  hardwareLookup: DeploymentHardwareShellActivationHardwareLookupDiagnostics | null,
): DeploymentHardwareShellActivationIssue["diagnostics"] {
  if (!hardwareLookup) {
    return null;
  }

  return {
    layer: "snapshot_hardware_lookup",
    rpcAttempted: false,
    hardwareLookupAttempted: hardwareLookup.attempted,
    hardwareLookupResult: hardwareLookup.result,
    hardwareLookupRowsReturned: hardwareLookup.rowsReturned,
    hardwareLookupDeploymentHardwareKey: hardwareLookup.deploymentHardwareKey,
    hardwareLookupHardwareId: hardwareLookup.hardwareId,
  };
}
function validateLaterItems(
  session: DeploymentHardwareShellActivationSessionSnapshot,
  items: readonly DeploymentHardwareShellActivationItemSnapshot[],
  runningItem: DeploymentHardwareShellActivationItemSnapshot | null,
): DeploymentHardwareShellActivationIssue[] {
  if (!runningItem) {
    return [];
  }

  const issues: DeploymentHardwareShellActivationIssue[] = [];

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
  hardware: DeploymentHardwareShellActivationHardwareSnapshot | null,
): HardwareActivationMode {
  if (!hardware) {
    return "blocked";
  }

  return hardware.active === true || hardware.provisioningStatus === "active"
    ? "already_activated"
    : "activatable";
}

function getSucceededPrefix(
  items: readonly DeploymentHardwareShellActivationItemSnapshot[],
): DeploymentHardwareShellActivationItemSnapshot[] {
  const prefix: DeploymentHardwareShellActivationItemSnapshot[] = [];
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
  status: DeploymentHardwareShellActivationStatus;
  command: DeploymentHardwareShellActivationCommand;
  snapshot: DeploymentHardwareShellActivationSnapshot;
  runningItem: DeploymentHardwareShellActivationItemSnapshot | null;
  issues: readonly DeploymentHardwareShellActivationIssue[];
  message: string;
}): DeploymentHardwareShellActivationResult {
  const issues = [...input.issues].sort(compareIssues);
  const session = input.snapshot.session;
  const hardware = input.snapshot.hardwareShell;
  const item = input.runningItem;

  return {
    ok: input.status === "activatable" || input.status === "already_activated",
    status: input.status,
    message: input.message,
    claimantId: input.command.claimantId || null,
    clinicId: hardware?.clinicId ?? session?.clinicId ?? input.command.clinicId ?? null,
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
    hardwareId: hardware?.hardwareId ?? null,
    deploymentHardwareKey: hardware?.deploymentHardwareKey ?? null,
    hardwareDisplayName: null,
    hardwareActive: hardware?.active ?? null,
    hardwareProvisioningStatus: hardware?.provisioningStatus ?? null,
    hardwareProvisioningSource: hardware?.provisioningSource ?? null,
    expectedCurrentState: item?.expectedCurrentState ? JSON.parse(JSON.stringify(item.expectedCurrentState)) as Record<string, unknown> : null,
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
  session: DeploymentHardwareShellActivationSessionSnapshot,
  item: DeploymentHardwareShellActivationItemSnapshot,
  hardware: DeploymentHardwareShellActivationHardwareSnapshot | null,
): DeploymentHardwareShellActivationIssue[] {
  return [
    hardwareIssue("hardware_shell_activation_persistence_unavailable", session, item, hardware, "Atomic hardware-shell activation persistence is not implemented in this slice.", "warning"),
    hardwareIssue("item_completion_unavailable", session, item, hardware, "Hardware activation item completion remains a future boundary.", "warning"),
    hardwareIssue("dependency_progression_unavailable", session, item, hardware, "Dependency progression for later items remains a future boundary.", "warning"),
    hardwareIssue("rollback_unavailable", session, item, hardware, "Rollback execution remains a future boundary.", "warning"),
  ];
}

function statusForIssues(
  issues: readonly DeploymentHardwareShellActivationIssue[],
): "blocked" | "conflict" | "not_found" {
  if (issues.some((issue) => ["missing_session", "missing_hardware_shell", "no_running_item"].includes(issue.code))) {
    return "not_found";
  }

  return issues.some((issue) => [
    "clinic_identity_mismatch",
    "deployment_run_identity_mismatch",
    "session_identity_mismatch",
    "execution_key_mismatch",
    "session_owned_by_another_executor",
    "ownership_token_mismatch",
    "hardware_clinic_mismatch",
    "hardware_identity_mismatch",
  ].includes(issue.code))
    ? "conflict"
    : "blocked";
}

function addCommandIssue(
  issues: DeploymentHardwareShellActivationIssue[],
  condition: boolean,
  code: DeploymentHardwareShellActivationIssueCode,
  command: DeploymentHardwareShellActivationCommand,
  message: string,
): void {
  if (condition) {
    issues.push(commandIssue(code, command, message));
  }
}

function commandIssue(
  code: DeploymentHardwareShellActivationIssueCode,
  command: DeploymentHardwareShellActivationCommand,
  message: string,
  diagnostics: DeploymentHardwareShellActivationIssue["diagnostics"] = null,
): DeploymentHardwareShellActivationIssue {
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
    diagnostics,
  };
}

function blocker(
  code: DeploymentHardwareShellActivationIssueCode,
  session: DeploymentHardwareShellActivationSessionSnapshot,
  item: DeploymentHardwareShellActivationItemSnapshot | null,
  hardware: DeploymentHardwareShellActivationHardwareSnapshot | null,
  message: string,
  severity: DeploymentHardwareShellActivationIssueSeverity = "blocker",
  diagnostics: DeploymentHardwareShellActivationIssue["diagnostics"] = null,
): DeploymentHardwareShellActivationIssue {
  return {
    code,
    severity,
    message,
    sessionId: session.sessionId,
    executionKey: session.executionKey,
    executionItemKey: item?.executionItemKey ?? null,
    planItemKey: item?.planItemKey ?? null,
    hardwareId: hardware?.hardwareId ?? null,
    deploymentHardwareKey: hardware?.deploymentHardwareKey ?? null,
    sequence: item?.sequence ?? null,
    diagnostics,
  };
}

function hardwareIssue(
  code: DeploymentHardwareShellActivationIssueCode,
  session: DeploymentHardwareShellActivationSessionSnapshot,
  item: DeploymentHardwareShellActivationItemSnapshot | null,
  hardware: DeploymentHardwareShellActivationHardwareSnapshot | null,
  message: string,
  severity: DeploymentHardwareShellActivationIssueSeverity = "blocker",
  diagnostics: DeploymentHardwareShellActivationIssue["diagnostics"] = null,
): DeploymentHardwareShellActivationIssue {
  return blocker(code, session, item, hardware, message, severity, diagnostics);
}

function compareItems(
  left: DeploymentHardwareShellActivationItemSnapshot,
  right: DeploymentHardwareShellActivationItemSnapshot,
): number {
  return left.sequence - right.sequence || left.executionItemKey.localeCompare(right.executionItemKey);
}

function compareIssues(
  left: DeploymentHardwareShellActivationIssue,
  right: DeploymentHardwareShellActivationIssue,
): number {
  return (
    left.severity.localeCompare(right.severity) ||
    left.code.localeCompare(right.code) ||
    Number(left.sequence ?? 0) - Number(right.sequence ?? 0) ||
    String(left.sessionId ?? "").localeCompare(String(right.sessionId ?? "")) ||
    String(left.executionKey ?? "").localeCompare(String(right.executionKey ?? "")) ||
    String(left.executionItemKey ?? "").localeCompare(String(right.executionItemKey ?? "")) ||
    String(left.planItemKey ?? "").localeCompare(String(right.planItemKey ?? "")) ||
    String(left.deploymentHardwareKey ?? "").localeCompare(String(right.deploymentHardwareKey ?? ""))
  );
}

function hasBlocker(issues: readonly DeploymentHardwareShellActivationIssue[]): boolean {
  return issues.some((issue) => issue.severity === "blocker");
}

function isValidTimestamp(value: string): boolean {
  return Number.isFinite(Date.parse(value));
}

function redactToken(value: string, token: string): string {
  return token ? value.split(token).join("[redacted]") : value;
}

function zeroDownstream(): DeploymentHardwareShellActivationDownstreamCounts {
  return {
    hardwaresActivated: 0,
    itemsCompleted: 0,
    dependenciesProgressed: 0,
    bindingsWritten: 0,
    sessionsCompleted: 0,
    rollbacksExecuted: 0,
    deploymentFinalized: 0,
  };
}

function emptySnapshot(): DeploymentHardwareShellActivationSnapshot {
  return {
    session: null,
    items: [],
    hardwareShell: null,
    hardwareLookup: null,
    aggregate: emptyHardwareShellActivationAggregate(),
  };
}
