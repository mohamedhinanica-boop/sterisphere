import type {
  DeploymentProviderShellActivationRepository,
} from "./deployment-provider-shell-activation-repository";
import {
  cloneProviderShellActivationSnapshot,
  emptyProviderShellActivationAggregate,
  type DeploymentProviderShellActivationCommand,
  type DeploymentProviderShellActivationDownstreamCounts,
  type DeploymentProviderShellActivationIssue,
  type DeploymentProviderShellActivationIssueCode,
  type DeploymentProviderShellActivationIssueSeverity,
  type DeploymentProviderShellActivationItemSnapshot,
  type DeploymentProviderShellActivationProviderLookupDiagnostics,
  type DeploymentProviderShellActivationProviderSnapshot,
  type DeploymentProviderShellActivationResult,
  type DeploymentProviderShellActivationSessionSnapshot,
  type DeploymentProviderShellActivationSnapshot,
  type DeploymentProviderShellActivationStatus,
} from "./deployment-provider-shell-activation-types";

type ProviderActivationMode = "activatable" | "already_activated" | "blocked";

export class DeploymentProviderShellActivationService {
  constructor(
    private readonly repository: DeploymentProviderShellActivationRepository,
  ) {}

  async assessProviderShellActivation(
    command: DeploymentProviderShellActivationCommand,
  ): Promise<DeploymentProviderShellActivationResult> {
    const commandIssues = validateCommand(command);

    if (hasBlocker(commandIssues)) {
      return buildResult({
        status: "blocked",
        command,
        snapshot: emptySnapshot(),
        runningItem: null,
        issues: commandIssues,
        message: "Provider shell activation assessment rejected invalid input before repository access.",
      });
    }

    try {
      const snapshot = cloneProviderShellActivationSnapshot(
        await this.repository.loadProviderShellActivationSnapshot({
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
        : "Provider shell activation repository failed safely.";

      return buildResult({
        status: "error",
        command,
        snapshot: emptySnapshot(),
        runningItem: null,
        issues: [commandIssue("repository_error", command, message)],
        message: "Provider shell activation assessment could not complete because repository evidence was unavailable.",
      });
    }
  }
}

export function createDeploymentProviderShellActivationService(
  repository: DeploymentProviderShellActivationRepository,
): DeploymentProviderShellActivationService {
  return new DeploymentProviderShellActivationService(repository);
}

function assessSnapshot(
  command: DeploymentProviderShellActivationCommand,
  snapshot: DeploymentProviderShellActivationSnapshot,
): DeploymentProviderShellActivationResult {
  if (!snapshot.session) {
    return buildResult({
      status: "not_found",
      command,
      snapshot,
      runningItem: null,
      issues: [commandIssue("missing_session", command, "Activation execution session was not found.")],
      message: "Provider shell activation assessment found no running execution session.",
    });
  }

  const session = snapshot.session;
  const orderedItems = [...snapshot.items].sort(compareItems);
  const prefix = getSucceededPrefix(orderedItems);
  const runningItems = orderedItems.filter((item) => item.executionStatus === "running");
  const runningItem = runningItems[0] ?? orderedItems.find((item) => item.sequence === prefix.length + 1) ?? null;
  const mode = activationMode(snapshot.providerShell);
  const issues = [
    ...validateIdentity(command, session),
    ...validateSessionLifecycle(session),
    ...validateOwnership(command, session),
    ...validateAggregate(session, snapshot),
    ...validateSucceededPrefix(session, orderedItems, prefix),
    ...validateRunningItem(session, runningItem, prefix.length + 1),
    ...validateProviderShell(command, session, runningItem, snapshot.providerShell, snapshot.aggregate, mode, snapshot.providerLookup),
    ...validateLaterItems(session, orderedItems, runningItem),
  ];

  if (hasBlocker(issues)) {
    return buildResult({
      status: statusForIssues(issues),
      command,
      snapshot,
      runningItem,
      issues,
      message: "Provider shell activation assessment blocked because session, item, or provider evidence is not safe.",
    });
  }

  const status = mode === "already_activated" ? "already_activated" : "activatable";

  return buildResult({
    status,
    command,
    snapshot,
    runningItem,
    issues: runningItem ? standardWarnings(session, runningItem, snapshot.providerShell) : [],
    message: status === "already_activated"
      ? "Provider shell is already activated. No provider mutation was performed."
      : "Provider shell is activatable. No provider mutation was persisted.",
  });
}

function validateCommand(
  command: DeploymentProviderShellActivationCommand,
): DeploymentProviderShellActivationIssue[] {
  const issues: DeploymentProviderShellActivationIssue[] = [];

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
  command: DeploymentProviderShellActivationCommand,
  session: DeploymentProviderShellActivationSessionSnapshot,
): DeploymentProviderShellActivationIssue[] {
  const issues: DeploymentProviderShellActivationIssue[] = [];

  addCommandIssue(issues, session.clinicId !== command.clinicId, "clinic_identity_mismatch", command, "Execution session clinic does not match the provider activation request.");
  addCommandIssue(issues, session.deploymentRunKey !== command.deploymentRunKey, "deployment_run_identity_mismatch", command, "Execution session deployment run does not match the provider activation request.");
  addCommandIssue(issues, session.sessionId !== command.sessionId, "session_identity_mismatch", command, "Execution session id does not match the provider activation request.");
  addCommandIssue(issues, session.executionKey !== command.executionKey, "execution_key_mismatch", command, "Execution session key does not match the provider activation request.");

  return issues;
}

function validateSessionLifecycle(
  session: DeploymentProviderShellActivationSessionSnapshot,
): DeploymentProviderShellActivationIssue[] {
  const issues: DeploymentProviderShellActivationIssue[] = [];

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
  command: DeploymentProviderShellActivationCommand,
  session: DeploymentProviderShellActivationSessionSnapshot,
): DeploymentProviderShellActivationIssue[] {
  const issues: DeploymentProviderShellActivationIssue[] = [];

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
    issues.push(blocker("ownership_token_mismatch", session, null, null, "Execution session ownership token does not match the provider activation request."));
  }

  if (Date.parse(session.leaseExpiresAt) <= Date.parse(command.now)) {
    issues.push(blocker("lease_expired", session, null, null, "Execution session lease is not active."));
  }

  return issues;
}

function validateAggregate(
  session: DeploymentProviderShellActivationSessionSnapshot,
  snapshot: DeploymentProviderShellActivationSnapshot,
): DeploymentProviderShellActivationIssue[] {
  const issues: DeploymentProviderShellActivationIssue[] = [];
  const aggregate = snapshot.aggregate;

  if (aggregate.totalItemCount !== session.itemsRequested || aggregate.totalItemCount !== snapshot.items.length || aggregate.totalItemCount < 1) {
    issues.push(blocker("item_count_mismatch", session, null, null, "Durable execution item count does not match requested item evidence."));
  }

  if (aggregate.runningItemCount === 0) {
    issues.push(blocker("no_running_item", session, null, null, "No running provider activation item exists."));
  }

  if (aggregate.runningItemCount > 1) {
    issues.push(blocker("multiple_running_items", session, null, null, "More than one execution item is running."));
  }

  if (aggregate.failedItemCount > 0) {
    issues.push(blocker("later_item_drift", session, null, null, "Execution items include failed evidence."));
  }

  if (aggregate.duplicateExecutionItemKeyCount > 0 || aggregate.duplicatePlanItemKeyCount > 0 || aggregate.duplicateSequenceCount > 0) {
    issues.push(blocker("duplicate_item_identity", session, null, null, "Duplicate durable execution item identity prevents provider activation assessment."));
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
  session: DeploymentProviderShellActivationSessionSnapshot,
  items: readonly DeploymentProviderShellActivationItemSnapshot[],
  prefix: readonly DeploymentProviderShellActivationItemSnapshot[],
): DeploymentProviderShellActivationIssue[] {
  const issues: DeploymentProviderShellActivationIssue[] = [];

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
  session: DeploymentProviderShellActivationSessionSnapshot,
  item: DeploymentProviderShellActivationItemSnapshot,
): DeploymentProviderShellActivationIssue[] {
  const issues: DeploymentProviderShellActivationIssue[] = [];

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
  session: DeploymentProviderShellActivationSessionSnapshot,
  item: DeploymentProviderShellActivationItemSnapshot | null,
  expectedSequence: number,
): DeploymentProviderShellActivationIssue[] {
  if (!item) {
    return [blocker("no_running_item", session, null, null, "No deterministic running provider activation item exists.")];
  }

  const issues: DeploymentProviderShellActivationIssue[] = [];

  if (item.sequence !== expectedSequence) {
    issues.push(blocker("running_item_sequence_mismatch", session, item, null, "Running provider activation item is not the deterministic next sequence after the succeeded prefix."));
  }

  if (item.executionStatus !== "running") {
    issues.push(blocker("running_item_status_invalid", session, item, null, "Provider activation item must be running."));
  }

  if (item.attemptCount !== 1) {
    issues.push(blocker("running_item_attempt_invalid", session, item, null, "Provider activation item must have exactly one attempt."));
  }

  if (!item.startedAt || !isValidTimestamp(item.startedAt)) {
    issues.push(blocker("running_item_started_at_missing", session, item, null, "Provider activation item requires valid started_at evidence."));
  }

  if (item.completedAt !== null) {
    issues.push(blocker("running_item_completion_evidence_present", session, item, null, "Provider activation item must not have completed_at evidence."));
  }

  if (item.rolledBackAt !== null) {
    issues.push(blocker("running_item_rollback_evidence_present", session, item, null, "Provider activation item has rollback evidence."));
  }

  if (item.errorCode !== null || item.errorMessage !== null) {
    issues.push(blocker("running_item_error_present", session, item, null, "Provider activation item has error evidence."));
  }

  if (!item.entityId || !item.entityId.trim()) {
    issues.push(blocker("running_item_entity_identity_missing", session, item, null, "Provider activation item entity identity is missing."));
  }

  if (item.entityType !== "provider_shell" || item.action !== "activate") {
    issues.push(blocker("unsupported_running_item_lifecycle", session, item, null, "Only provider-shell activate items are supported by this assessment."));
  }

  return issues;
}

function validateProviderShell(
  command: DeploymentProviderShellActivationCommand,
  session: DeploymentProviderShellActivationSessionSnapshot,
  item: DeploymentProviderShellActivationItemSnapshot | null,
  provider: DeploymentProviderShellActivationProviderSnapshot | null,
  aggregate: DeploymentProviderShellActivationSnapshot["aggregate"],
  mode: ProviderActivationMode,
  providerLookup: DeploymentProviderShellActivationProviderLookupDiagnostics | null,
): DeploymentProviderShellActivationIssue[] {
  if (!provider) {
    return [commandIssue("missing_provider_shell", command, "Provider shell was not found.", providerLookupIssueDiagnostics(providerLookup))];
  }

  const issues: DeploymentProviderShellActivationIssue[] = [];

  if (aggregate.providerCandidateCount !== 1) {
    issues.push(providerIssue("duplicate_provider_identity", session, item, provider, "Provider activation assessment requires exactly one provider shell candidate."));
  }

  if (aggregate.duplicateProviderIdentityCount > 0) {
    issues.push(providerIssue("duplicate_provider_identity", session, item, provider, "Duplicate provider shell deployment identity prevents activation assessment."));
  }

  if (provider.clinicId !== session.clinicId || provider.clinicId !== command.clinicId) {
    issues.push(providerIssue("provider_clinic_mismatch", session, item, provider, "Provider shell does not belong to the execution clinic."));
  }

  const expectedProviderKey = item ? deploymentProviderKeyFromItem(item) : null;
  const entityIdMatchesProvider = item?.entityId === provider.providerId || item?.entityId === provider.deploymentProviderKey;
  if (!provider.deploymentProviderKey || (expectedProviderKey !== null && provider.deploymentProviderKey !== expectedProviderKey) || !entityIdMatchesProvider) {
    issues.push(providerIssue("provider_identity_mismatch", session, item, provider, "Provider shell identity does not match the running execution item."));
  }

  if (provider.provisioningSource !== "setup_draft") {
    issues.push(providerIssue("provider_provisioning_source_invalid", session, item, provider, "Provider shell must be sourced from setup_draft."));
  }

  if (mode === "already_activated") {
    if (provider.active !== true) {
      issues.push(providerIssue("provider_active_state_invalid", session, item, provider, "Already-activated provider shell must be active."));
    }
    if (provider.provisioningStatus !== "active") {
      issues.push(providerIssue("provider_provisioning_status_invalid", session, item, provider, "Already-activated provider shell must have active provisioning status."));
    }
    return issues;
  }

  if (provider.placeholder !== true) {
    issues.push(providerIssue("provider_placeholder_invalid", session, item, provider, "Provider shell must retain placeholder semantics before activation."));
  }

  if (provider.active !== false) {
    issues.push(providerIssue("provider_active_state_invalid", session, item, provider, "Provider shell must be inactive before activation."));
  }

  if (!["placeholder", "planned"].includes(String(provider.provisioningStatus))) {
    issues.push(providerIssue("provider_provisioning_status_invalid", session, item, provider, "Provider shell provisioning status must be placeholder or planned before activation."));
  }

  return issues;
}

function deploymentProviderKeyFromItem(
  item: DeploymentProviderShellActivationItemSnapshot,
): string | null {
  return stringField(item.expectedCurrentState, "deploymentProviderKey") ??
    stringField(item.expectedCurrentState, "deployment_provider_key") ??
    stringField(item.targetState, "deploymentProviderKey") ??
    stringField(item.targetState, "deployment_provider_key") ??
    fallbackDeploymentProviderKey(item.entityId);
}

function fallbackDeploymentProviderKey(value: string | null): string | null {
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

function providerLookupIssueDiagnostics(
  providerLookup: DeploymentProviderShellActivationProviderLookupDiagnostics | null,
): DeploymentProviderShellActivationIssue["diagnostics"] {
  if (!providerLookup) {
    return null;
  }

  return {
    layer: "snapshot_provider_lookup",
    rpcAttempted: false,
    providerLookupAttempted: providerLookup.attempted,
    providerLookupResult: providerLookup.result,
    providerLookupRowsReturned: providerLookup.rowsReturned,
    providerLookupDeploymentProviderKey: providerLookup.deploymentProviderKey,
    providerLookupProviderId: providerLookup.providerId,
  };
}
function validateLaterItems(
  session: DeploymentProviderShellActivationSessionSnapshot,
  items: readonly DeploymentProviderShellActivationItemSnapshot[],
  runningItem: DeploymentProviderShellActivationItemSnapshot | null,
): DeploymentProviderShellActivationIssue[] {
  if (!runningItem) {
    return [];
  }

  const issues: DeploymentProviderShellActivationIssue[] = [];

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
  provider: DeploymentProviderShellActivationProviderSnapshot | null,
): ProviderActivationMode {
  if (!provider) {
    return "blocked";
  }

  return provider.active === true || provider.provisioningStatus === "active"
    ? "already_activated"
    : "activatable";
}

function getSucceededPrefix(
  items: readonly DeploymentProviderShellActivationItemSnapshot[],
): DeploymentProviderShellActivationItemSnapshot[] {
  const prefix: DeploymentProviderShellActivationItemSnapshot[] = [];
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
  status: DeploymentProviderShellActivationStatus;
  command: DeploymentProviderShellActivationCommand;
  snapshot: DeploymentProviderShellActivationSnapshot;
  runningItem: DeploymentProviderShellActivationItemSnapshot | null;
  issues: readonly DeploymentProviderShellActivationIssue[];
  message: string;
}): DeploymentProviderShellActivationResult {
  const issues = [...input.issues].sort(compareIssues);
  const session = input.snapshot.session;
  const provider = input.snapshot.providerShell;
  const item = input.runningItem;

  return {
    ok: input.status === "activatable" || input.status === "already_activated",
    status: input.status,
    message: input.message,
    claimantId: input.command.claimantId || null,
    clinicId: provider?.clinicId ?? session?.clinicId ?? input.command.clinicId ?? null,
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
    providerId: provider?.providerId ?? null,
    deploymentProviderKey: provider?.deploymentProviderKey ?? null,
    providerDisplayName: provider?.displayName ?? null,
    providerActive: provider?.active ?? null,
    providerProvisioningStatus: provider?.provisioningStatus ?? null,
    providerProvisioningSource: provider?.provisioningSource ?? null,
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
  session: DeploymentProviderShellActivationSessionSnapshot,
  item: DeploymentProviderShellActivationItemSnapshot,
  provider: DeploymentProviderShellActivationProviderSnapshot | null,
): DeploymentProviderShellActivationIssue[] {
  return [
    providerIssue("provider_shell_activation_persistence_unavailable", session, item, provider, "Atomic provider-shell activation persistence is not implemented in this slice.", "warning"),
    providerIssue("item_completion_unavailable", session, item, provider, "Provider activation item completion remains a future boundary.", "warning"),
    providerIssue("dependency_progression_unavailable", session, item, provider, "Dependency progression for later items remains a future boundary.", "warning"),
    providerIssue("rollback_unavailable", session, item, provider, "Rollback execution remains a future boundary.", "warning"),
  ];
}

function statusForIssues(
  issues: readonly DeploymentProviderShellActivationIssue[],
): "blocked" | "conflict" | "not_found" {
  if (issues.some((issue) => ["missing_session", "missing_provider_shell", "no_running_item"].includes(issue.code))) {
    return "not_found";
  }

  return issues.some((issue) => [
    "clinic_identity_mismatch",
    "deployment_run_identity_mismatch",
    "session_identity_mismatch",
    "execution_key_mismatch",
    "session_owned_by_another_executor",
    "ownership_token_mismatch",
    "provider_clinic_mismatch",
    "provider_identity_mismatch",
  ].includes(issue.code))
    ? "conflict"
    : "blocked";
}

function addCommandIssue(
  issues: DeploymentProviderShellActivationIssue[],
  condition: boolean,
  code: DeploymentProviderShellActivationIssueCode,
  command: DeploymentProviderShellActivationCommand,
  message: string,
): void {
  if (condition) {
    issues.push(commandIssue(code, command, message));
  }
}

function commandIssue(
  code: DeploymentProviderShellActivationIssueCode,
  command: DeploymentProviderShellActivationCommand,
  message: string,
  diagnostics: DeploymentProviderShellActivationIssue["diagnostics"] = null,
): DeploymentProviderShellActivationIssue {
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
    diagnostics,
  };
}

function blocker(
  code: DeploymentProviderShellActivationIssueCode,
  session: DeploymentProviderShellActivationSessionSnapshot,
  item: DeploymentProviderShellActivationItemSnapshot | null,
  provider: DeploymentProviderShellActivationProviderSnapshot | null,
  message: string,
  severity: DeploymentProviderShellActivationIssueSeverity = "blocker",
): DeploymentProviderShellActivationIssue {
  return {
    code,
    severity,
    message,
    sessionId: session.sessionId,
    executionKey: session.executionKey,
    executionItemKey: item?.executionItemKey ?? null,
    planItemKey: item?.planItemKey ?? null,
    providerId: provider?.providerId ?? null,
    deploymentProviderKey: provider?.deploymentProviderKey ?? null,
    sequence: item?.sequence ?? null,
  };
}

function providerIssue(
  code: DeploymentProviderShellActivationIssueCode,
  session: DeploymentProviderShellActivationSessionSnapshot,
  item: DeploymentProviderShellActivationItemSnapshot | null,
  provider: DeploymentProviderShellActivationProviderSnapshot | null,
  message: string,
  severity: DeploymentProviderShellActivationIssueSeverity = "blocker",
): DeploymentProviderShellActivationIssue {
  return blocker(code, session, item, provider, message, severity);
}

function compareItems(
  left: DeploymentProviderShellActivationItemSnapshot,
  right: DeploymentProviderShellActivationItemSnapshot,
): number {
  return left.sequence - right.sequence || left.executionItemKey.localeCompare(right.executionItemKey);
}

function compareIssues(
  left: DeploymentProviderShellActivationIssue,
  right: DeploymentProviderShellActivationIssue,
): number {
  return (
    left.severity.localeCompare(right.severity) ||
    left.code.localeCompare(right.code) ||
    Number(left.sequence ?? 0) - Number(right.sequence ?? 0) ||
    String(left.sessionId ?? "").localeCompare(String(right.sessionId ?? "")) ||
    String(left.executionKey ?? "").localeCompare(String(right.executionKey ?? "")) ||
    String(left.executionItemKey ?? "").localeCompare(String(right.executionItemKey ?? "")) ||
    String(left.planItemKey ?? "").localeCompare(String(right.planItemKey ?? "")) ||
    String(left.deploymentProviderKey ?? "").localeCompare(String(right.deploymentProviderKey ?? ""))
  );
}

function hasBlocker(issues: readonly DeploymentProviderShellActivationIssue[]): boolean {
  return issues.some((issue) => issue.severity === "blocker");
}

function isValidTimestamp(value: string): boolean {
  return Number.isFinite(Date.parse(value));
}

function redactToken(value: string, token: string): string {
  return token ? value.split(token).join("[redacted]") : value;
}

function zeroDownstream(): DeploymentProviderShellActivationDownstreamCounts {
  return {
    providersActivated: 0,
    itemsCompleted: 0,
    dependenciesProgressed: 0,
    bindingsWritten: 0,
    sessionsCompleted: 0,
    rollbacksExecuted: 0,
    deploymentFinalized: 0,
  };
}

function emptySnapshot(): DeploymentProviderShellActivationSnapshot {
  return {
    session: null,
    items: [],
    providerShell: null,
    providerLookup: null,
    aggregate: emptyProviderShellActivationAggregate(),
  };
}
