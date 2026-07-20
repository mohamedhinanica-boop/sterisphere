import type {
  DeploymentActivationExecutionNextItemStartRepository,
} from "./deployment-activation-execution-next-item-start-repository";
import {
  cloneNextItemStartSnapshot,
  emptyNextItemStartAggregate,
  type DeploymentActivationExecutionNextItemStartCommand,
  type DeploymentActivationExecutionNextItemStartDownstreamCounts,
  type DeploymentActivationExecutionNextItemStartIssue,
  type DeploymentActivationExecutionNextItemStartIssueCode,
  type DeploymentActivationExecutionNextItemStartIssueSeverity,
  type DeploymentActivationExecutionNextItemStartItemSnapshot,
  type DeploymentActivationExecutionNextItemStartResult,
  type DeploymentActivationExecutionNextItemStartSessionSnapshot,
  type DeploymentActivationExecutionNextItemStartSnapshot,
  type DeploymentActivationExecutionNextItemStartStatus,
} from "./deployment-activation-execution-next-item-start-types";

export class DeploymentActivationExecutionNextItemStartService {
  constructor(
    private readonly repository: DeploymentActivationExecutionNextItemStartRepository,
  ) {}

  async assessNextItemStart(
    command: DeploymentActivationExecutionNextItemStartCommand,
  ): Promise<DeploymentActivationExecutionNextItemStartResult> {
    const commandIssues = validateCommand(command);

    if (hasBlocker(commandIssues)) {
      return buildResult({
        status: "blocked",
        command,
        snapshot: emptySnapshot(),
        candidate: null,
        issues: commandIssues,
        message: "Activation execution next-item start assessment rejected invalid input before repository access.",
      });
    }

    try {
      const snapshot = cloneNextItemStartSnapshot(
        await this.repository.loadNextItemStartSnapshot({
          clinicId: command.clinicId,
          deploymentRunKey: command.deploymentRunKey,
          sessionId: command.sessionId,
          executionKey: command.executionKey,
        }),
      );

      return assessSnapshot(command, snapshot);
    } catch (caught) {
      const message = caught instanceof Error ? redactToken(caught.message, command.ownershipToken) : "Activation execution next-item start repository failed safely.";
      return buildResult({
        status: "error",
        command,
        snapshot: emptySnapshot(),
        candidate: null,
        issues: [commandIssue("repository_error", command, message)],
        message: "Activation execution next-item start assessment could not complete because repository evidence was unavailable.",
      });
    }
  }
}

export function createDeploymentActivationExecutionNextItemStartService(
  repository: DeploymentActivationExecutionNextItemStartRepository,
): DeploymentActivationExecutionNextItemStartService {
  return new DeploymentActivationExecutionNextItemStartService(repository);
}

function assessSnapshot(
  command: DeploymentActivationExecutionNextItemStartCommand,
  snapshot: DeploymentActivationExecutionNextItemStartSnapshot,
): DeploymentActivationExecutionNextItemStartResult {
  if (!snapshot.session) {
    return buildResult({
      status: "not_found",
      command,
      snapshot,
      candidate: null,
      issues: [commandIssue("missing_session", command, "Activation execution session was not found.")],
      message: "Activation execution next-item start assessment found no running execution session.",
    });
  }

  const session = snapshot.session;
  const orderedItems = [...snapshot.items].sort(compareItems);
  const prefix = getSucceededPrefix(orderedItems);
  const expectedSequence = prefix.length + 1;
  const readyItems = orderedItems.filter((item) => item.executionStatus === "ready");
  const runningItems = orderedItems.filter((item) => item.executionStatus === "running");
  const mode = readyItems.length === 1 && runningItems.length === 0
    ? "startable"
    : runningItems.length === 1 && readyItems.length === 0
      ? "already_started"
      : "blocked";
  const candidate = mode === "already_started"
    ? runningItems[0] ?? null
    : readyItems[0] ?? runningItems[0] ?? orderedItems.find((item) => item.sequence === expectedSequence) ?? null;
  const issues = [
    ...validateIdentity(command, session),
    ...validateSessionLifecycle(session),
    ...validateOwnership(command, session),
    ...validateAggregate(session, snapshot, mode),
    ...validateSucceededPrefix(session, orderedItems, prefix),
    ...validateCandidate(session, candidate, expectedSequence, mode),
    ...validateDependencyGraph(session, orderedItems, candidate),
    ...validateLaterItems(session, orderedItems, candidate),
  ];

  if (hasBlocker(issues)) {
    return buildResult({
      status: statusForIssues(issues),
      command,
      snapshot,
      candidate,
      issues,
      message: "Activation execution next-item start assessment blocked because ready/running item evidence is not safe.",
    });
  }

  return buildResult({
    status: mode === "already_started" ? "already_started" : "startable",
    command,
    snapshot,
    candidate,
    issues: candidate ? standardWarnings(session, candidate) : [],
    message: mode === "already_started"
      ? "The deterministic next execution item is already running. No item mutation was performed."
      : "The deterministic next execution item is startable. No ready-to-running mutation was persisted.",
  });
}

function validateCommand(
  command: DeploymentActivationExecutionNextItemStartCommand,
): DeploymentActivationExecutionNextItemStartIssue[] {
  const issues: DeploymentActivationExecutionNextItemStartIssue[] = [];

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
  command: DeploymentActivationExecutionNextItemStartCommand,
  session: DeploymentActivationExecutionNextItemStartSessionSnapshot,
): DeploymentActivationExecutionNextItemStartIssue[] {
  const issues: DeploymentActivationExecutionNextItemStartIssue[] = [];

  addCommandIssue(issues, session.clinicId !== command.clinicId, "clinic_identity_mismatch", command, "Execution session clinic does not match the next-item start request.");
  addCommandIssue(issues, session.deploymentRunKey !== command.deploymentRunKey, "deployment_run_identity_mismatch", command, "Execution session deployment run does not match the next-item start request.");
  addCommandIssue(issues, session.sessionId !== command.sessionId, "session_identity_mismatch", command, "Execution session id does not match the next-item start request.");
  addCommandIssue(issues, session.executionKey !== command.executionKey, "execution_key_mismatch", command, "Execution session key does not match the next-item start request.");

  return issues;
}

function validateSessionLifecycle(
  session: DeploymentActivationExecutionNextItemStartSessionSnapshot,
): DeploymentActivationExecutionNextItemStartIssue[] {
  const issues: DeploymentActivationExecutionNextItemStartIssue[] = [];

  if (session.preparationStatus !== "ready") {
    issues.push(blocker("preparation_status_not_ready", session, null, "Execution session preparation is not ready."));
  }

  if (session.executionStatus !== "running") {
    issues.push(blocker("session_not_running", session, null, "Execution session is not running."));
  }

  if (!session.startedAt || !isValidTimestamp(session.startedAt)) {
    issues.push(blocker("session_timestamp_missing", session, null, "Execution session is missing valid started_at evidence."));
  }

  if (session.completedAt !== null || session.failedAt !== null) {
    issues.push(blocker("terminal_session_timestamp_present", session, null, "Execution session has terminal lifecycle evidence."));
  }

  return issues;
}

function validateOwnership(
  command: DeploymentActivationExecutionNextItemStartCommand,
  session: DeploymentActivationExecutionNextItemStartSessionSnapshot,
): DeploymentActivationExecutionNextItemStartIssue[] {
  const issues: DeploymentActivationExecutionNextItemStartIssue[] = [];

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
    issues.push(blocker("ownership_token_mismatch", session, null, "Execution session ownership token does not match the next-item start request."));
  }

  if (Date.parse(session.leaseExpiresAt) <= Date.parse(command.now)) {
    issues.push(blocker("lease_expired", session, null, "Execution session lease is not active."));
  }

  return issues;
}

function validateAggregate(
  session: DeploymentActivationExecutionNextItemStartSessionSnapshot,
  snapshot: DeploymentActivationExecutionNextItemStartSnapshot,
  mode: "startable" | "already_started" | "blocked",
): DeploymentActivationExecutionNextItemStartIssue[] {
  const issues: DeploymentActivationExecutionNextItemStartIssue[] = [];
  const aggregate = snapshot.aggregate;

  if (aggregate.totalItemCount !== session.itemsRequested || aggregate.totalItemCount !== snapshot.items.length || aggregate.totalItemCount < 1) {
    issues.push(blocker("item_count_mismatch", session, null, "Durable execution item count does not match requested item evidence."));
  }

  if (aggregate.readyItemCount === 0 && aggregate.runningItemCount === 0) {
    issues.push(blocker("no_start_candidate", session, null, "No ready or running deterministic execution item exists."));
  }

  if (aggregate.readyItemCount > 1) {
    issues.push(blocker("multiple_ready_items", session, null, "More than one ready execution item exists."));
  }

  if (aggregate.runningItemCount > 1) {
    issues.push(blocker("multiple_running_items", session, null, "More than one running execution item exists."));
  }

  if (aggregate.readyItemCount > 0 && aggregate.runningItemCount > 0) {
    issues.push(blocker("ready_running_ambiguity", session, null, "Ready and running execution item evidence cannot both exist for next-item start assessment."));
  }

  if (mode === "startable" && (aggregate.readyItemCount !== 1 || aggregate.runningItemCount !== 0)) {
    issues.push(blocker("candidate_status_invalid", session, null, "Startable assessment requires exactly one ready item and no running items."));
  }

  if (mode === "already_started" && (aggregate.runningItemCount !== 1 || aggregate.readyItemCount !== 0)) {
    issues.push(blocker("candidate_status_invalid", session, null, "Already-started assessment requires exactly one running item and no ready items."));
  }

  if (aggregate.failedItemCount > 0) {
    issues.push(blocker("later_item_drift", session, null, "Execution items include failed evidence."));
  }

  if (aggregate.duplicateExecutionItemKeyCount > 0 || aggregate.duplicatePlanItemKeyCount > 0 || aggregate.duplicateSequenceCount > 0) {
    issues.push(blocker("duplicate_item_identity", session, null, "Duplicate durable execution item identity prevents next-item start assessment."));
  }

  if (aggregate.succeededContiguousPrefixLength !== aggregate.succeededItemCount) {
    issues.push(blocker("non_contiguous_succeeded_prefix", session, null, "Succeeded execution prefix is not contiguous from sequence 1."));
  }

  if (aggregate.readyItemCandidateCount > 1) {
    issues.push(blocker("multiple_ready_items", session, null, "More than one ready candidate item exists."));
  }

  if (aggregate.laterPendingItemIntegrityIssueCount > 0) {
    issues.push(blocker("later_item_drift", session, null, "Later pending item integrity evidence is not clean."));
  }

  return issues;
}

function validateSucceededPrefix(
  session: DeploymentActivationExecutionNextItemStartSessionSnapshot,
  items: readonly DeploymentActivationExecutionNextItemStartItemSnapshot[],
  prefix: readonly DeploymentActivationExecutionNextItemStartItemSnapshot[],
): DeploymentActivationExecutionNextItemStartIssue[] {
  const issues: DeploymentActivationExecutionNextItemStartIssue[] = [];

  for (let index = 0; index < prefix.length; index += 1) {
    const item = prefix[index];
    if (item.sequence !== index + 1) {
      issues.push(blocker("non_contiguous_succeeded_prefix", session, item, "Succeeded execution prefix is not contiguous from sequence 1."));
    }

    issues.push(...validateSucceededItem(session, item));
  }

  if (items.some((item) => item.sequence > prefix.length && item.executionStatus === "succeeded")) {
    issues.push(blocker("non_contiguous_succeeded_prefix", session, null, "Succeeded item appears after the contiguous prefix."));
  }

  return issues;
}

function validateSucceededItem(
  session: DeploymentActivationExecutionNextItemStartSessionSnapshot,
  item: DeploymentActivationExecutionNextItemStartItemSnapshot,
): DeploymentActivationExecutionNextItemStartIssue[] {
  const issues: DeploymentActivationExecutionNextItemStartIssue[] = [];

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

function validateCandidate(
  session: DeploymentActivationExecutionNextItemStartSessionSnapshot,
  candidate: DeploymentActivationExecutionNextItemStartItemSnapshot | null,
  expectedSequence: number,
  mode: "startable" | "already_started" | "blocked",
): DeploymentActivationExecutionNextItemStartIssue[] {
  if (!candidate) {
    return [blocker("no_start_candidate", session, null, "No deterministic candidate item exists for next-item start assessment.")];
  }

  const issues: DeploymentActivationExecutionNextItemStartIssue[] = [];

  if (candidate.sequence !== expectedSequence) {
    issues.push(blocker("candidate_sequence_mismatch", session, candidate, "Candidate item is not the deterministic next sequence after the succeeded prefix."));
  }

  if (mode === "startable") {
    if (candidate.executionStatus !== "ready") {
      issues.push(blocker("candidate_status_invalid", session, candidate, "Startable candidate must be ready."));
    }
    if (candidate.attemptCount !== 0) {
      issues.push(blocker("candidate_attempt_invalid", session, candidate, "Startable candidate must have zero attempts."));
    }
    if (candidate.startedAt !== null || candidate.completedAt !== null) {
      issues.push(blocker("candidate_timestamp_evidence_present", session, candidate, "Startable candidate must not have execution timestamps."));
    }
  } else if (mode === "already_started") {
    if (candidate.executionStatus !== "running") {
      issues.push(blocker("candidate_status_invalid", session, candidate, "Already-started candidate must be running."));
    }
    if (candidate.attemptCount !== 1) {
      issues.push(blocker("candidate_attempt_invalid", session, candidate, "Already-started candidate must have exactly one attempt."));
    }
    if (!candidate.startedAt || !isValidTimestamp(candidate.startedAt)) {
      issues.push(blocker("candidate_started_at_missing", session, candidate, "Already-started candidate requires valid started_at evidence."));
    }
    if (candidate.completedAt !== null) {
      issues.push(blocker("candidate_completion_evidence_present", session, candidate, "Already-started candidate must not have completed_at evidence."));
    }
  } else {
    issues.push(blocker("candidate_status_invalid", session, candidate, "Candidate status is ambiguous for next-item start assessment."));
  }

  if (candidate.rolledBackAt !== null) {
    issues.push(blocker("candidate_rollback_evidence_present", session, candidate, "Candidate item has rollback evidence."));
  }

  if (candidate.errorCode !== null || candidate.errorMessage !== null) {
    issues.push(blocker("candidate_error_evidence_present", session, candidate, "Candidate item has error evidence."));
  }

  if (!candidate.entityId || !candidate.entityId.trim() || !candidate.entityType.trim()) {
    issues.push(blocker("candidate_entity_identity_missing", session, candidate, "Candidate entity identity is missing."));
  }

const lifecycleDispatch = auditEntityActionLifecycle(candidate, session.clinicId);
  if (!lifecycleDispatch.supported) {
    issues.push(blocker("unsupported_entity_action_lifecycle", session, candidate, "Candidate entity/action lifecycle is not supported for next-item start assessment.", "blocker", lifecycleDispatch));
  }

  return issues;
}

function validateDependencyGraph(
  session: DeploymentActivationExecutionNextItemStartSessionSnapshot,
  items: readonly DeploymentActivationExecutionNextItemStartItemSnapshot[],
  candidate: DeploymentActivationExecutionNextItemStartItemSnapshot | null,
): DeploymentActivationExecutionNextItemStartIssue[] {
  if (!candidate) {
    return [];
  }

  if (!Array.isArray(candidate.dependencyKeys)) {
    return [blocker("dependency_keys_malformed", session, candidate, "Candidate dependency keys are malformed.")];
  }

  const issues: DeploymentActivationExecutionNextItemStartIssue[] = [];
  const uniqueDependencies = new Set(candidate.dependencyKeys);

  if (uniqueDependencies.size !== candidate.dependencyKeys.length) {
    issues.push(blocker("duplicate_dependency_key", session, candidate, "Candidate contains duplicate dependency keys."));
  }

  const itemsByPlanKey = new Map(items.map((item) => [item.planItemKey, item]));

  for (const dependencyKey of candidate.dependencyKeys) {
    const dependencyItem = itemsByPlanKey.get(dependencyKey);

    if (!dependencyItem) {
      issues.push(blocker("dependency_item_missing", session, candidate, "Candidate dependency does not reference an existing plan item."));
      continue;
    }

    if (dependencyItem.planItemKey === candidate.planItemKey) {
      issues.push(blocker("dependency_self_reference", session, candidate, "Candidate cannot depend on itself."));
    }

    if (dependencyItem.sequence >= candidate.sequence) {
      issues.push(blocker("dependency_on_later_item", session, candidate, "Candidate dependency references itself or a later item."));
    }

    if (dependencyItem.executionStatus !== "succeeded") {
      issues.push(blocker("dependency_not_succeeded", session, candidate, "Candidate dependency is not succeeded."));
    }
  }

  return issues;
}

function validateLaterItems(
  session: DeploymentActivationExecutionNextItemStartSessionSnapshot,
  items: readonly DeploymentActivationExecutionNextItemStartItemSnapshot[],
  candidate: DeploymentActivationExecutionNextItemStartItemSnapshot | null,
): DeploymentActivationExecutionNextItemStartIssue[] {
  if (!candidate) {
    return [];
  }

  const issues: DeploymentActivationExecutionNextItemStartIssue[] = [];

  for (const item of items.filter((current) => current.sequence > candidate.sequence)) {
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
  items: readonly DeploymentActivationExecutionNextItemStartItemSnapshot[],
): DeploymentActivationExecutionNextItemStartItemSnapshot[] {
  const prefix: DeploymentActivationExecutionNextItemStartItemSnapshot[] = [];
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
  status: DeploymentActivationExecutionNextItemStartStatus;
  command: DeploymentActivationExecutionNextItemStartCommand;
  snapshot: DeploymentActivationExecutionNextItemStartSnapshot;
  candidate: DeploymentActivationExecutionNextItemStartItemSnapshot | null;
  issues: readonly DeploymentActivationExecutionNextItemStartIssue[];
  message: string;
}): DeploymentActivationExecutionNextItemStartResult {
  const issues = [...input.issues].sort(compareIssues);
  const session = input.snapshot.session;
  const candidate = input.candidate;

  return {
    ok: input.status === "startable" || input.status === "already_started",
    status: input.status,
    message: input.message,
    claimantId: input.command.claimantId || null,
    clinicId: session?.clinicId ?? input.command.clinicId ?? null,
    deploymentRunKey: session?.deploymentRunKey ?? input.command.deploymentRunKey ?? null,
    sessionId: session?.sessionId ?? input.command.sessionId ?? null,
    executionKey: session?.executionKey ?? input.command.executionKey ?? null,
    planKey: session?.planKey ?? null,
    itemId: candidate?.itemId ?? null,
    executionItemKey: candidate?.executionItemKey ?? null,
    planItemKey: candidate?.planItemKey ?? null,
    sequence: candidate?.sequence ?? null,
    entityType: candidate?.entityType ?? null,
    entityId: candidate?.entityId ?? null,
    action: candidate?.action ?? null,
    lifecycleEvidence: recognizedLifecycleEvidence(candidate, session?.clinicId ?? null),
    dependencyKeys: candidate?.dependencyKeys ? [...candidate.dependencyKeys] : [],
    attemptCount: candidate?.attemptCount ?? 0,
    itemStartedAt: candidate?.startedAt ?? null,
    leaseExpiresAt: session?.leaseExpiresAt ?? null,
    startableCount: input.status === "startable" ? 1 : 0,
    reusedCount: input.status === "already_started" ? 1 : 0,
    conflictCount: input.status === "conflict" ? 1 : 0,
    blockerCount: issues.filter((issue) => issue.severity === "blocker").length,
    warningCount: issues.filter((issue) => issue.severity === "warning").length,
    issues,
    downstream: zeroDownstream(),
  };
}

function standardWarnings(
  session: DeploymentActivationExecutionNextItemStartSessionSnapshot,
  item: DeploymentActivationExecutionNextItemStartItemSnapshot,
): DeploymentActivationExecutionNextItemStartIssue[] {
  return [
    blocker("atomic_next_item_start_persistence_unavailable", session, item, "Atomic next-item start persistence is not implemented in this slice.", "warning"),
    blocker("entity_activation_unavailable", session, item, "Entity activation remains a future boundary.", "warning"),
    blocker("rollback_unavailable", session, item, "Rollback execution remains a future boundary.", "warning"),
  ];
}

function statusForIssues(
  issues: readonly DeploymentActivationExecutionNextItemStartIssue[],
): "blocked" | "conflict" | "not_found" {
  if (issues.some((issue) => issue.code === "missing_session" || issue.code === "no_start_candidate")) {
    return "not_found";
  }

  return issues.some((issue) => [
    "clinic_identity_mismatch",
    "deployment_run_identity_mismatch",
    "session_identity_mismatch",
    "execution_key_mismatch",
    "session_owned_by_another_executor",
    "ownership_token_mismatch",
  ].includes(issue.code))
    ? "conflict"
    : "blocked";
}

function addCommandIssue(
  issues: DeploymentActivationExecutionNextItemStartIssue[],
  condition: boolean,
  code: DeploymentActivationExecutionNextItemStartIssueCode,
  command: DeploymentActivationExecutionNextItemStartCommand,
  message: string,
): void {
  if (condition) {
    issues.push(commandIssue(code, command, message));
  }
}

function commandIssue(
  code: DeploymentActivationExecutionNextItemStartIssueCode,
  command: DeploymentActivationExecutionNextItemStartCommand,
  message: string,
): DeploymentActivationExecutionNextItemStartIssue {
  return {
    code,
    severity: "blocker",
    message: redactToken(message, command.ownershipToken),
    sessionId: command.sessionId,
    executionKey: command.executionKey,
    executionItemKey: null,
    planItemKey: null,
    entityType: null,
    entityId: null,
    sequence: null,
  };
}

function blocker(
  code: DeploymentActivationExecutionNextItemStartIssueCode,
  session: DeploymentActivationExecutionNextItemStartSessionSnapshot,
  item: DeploymentActivationExecutionNextItemStartItemSnapshot | null,
  message: string,
severity: DeploymentActivationExecutionNextItemStartIssueSeverity = "blocker",
  lifecycleDispatch: DeploymentActivationExecutionNextItemStartIssue["lifecycleDispatch"] = null,
): DeploymentActivationExecutionNextItemStartIssue {
  return {
    code,
    severity,
    message,
    sessionId: session.sessionId,
    executionKey: session.executionKey,
    executionItemKey: item?.executionItemKey ?? null,
    planItemKey: item?.planItemKey ?? null,
    entityType: item?.entityType ?? null,
    entityId: item?.entityId ?? null,
sequence: item?.sequence ?? null,
    lifecycleDispatch,
  };
}

function compareItems(
  left: DeploymentActivationExecutionNextItemStartItemSnapshot,
  right: DeploymentActivationExecutionNextItemStartItemSnapshot,
): number {
  return left.sequence - right.sequence || left.executionItemKey.localeCompare(right.executionItemKey);
}

function compareIssues(
  left: DeploymentActivationExecutionNextItemStartIssue,
  right: DeploymentActivationExecutionNextItemStartIssue,
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

function hasBlocker(issues: readonly DeploymentActivationExecutionNextItemStartIssue[]): boolean {
  return issues.some((issue) => issue.severity === "blocker");
}

function auditEntityActionLifecycle(item: DeploymentActivationExecutionNextItemStartItemSnapshot, clinicId: string) {
  const hardwareBindingBranchReached = item.entityType === "hardware_binding";
  if (!hardwareBindingBranchReached && item.entityType !== "hardware_assignment" && Boolean(item.entityType.trim()) && item.action === "activate") {
    return lifecycleDispatch(item, "generic_activate" as const, false, true, []);
  }
  if (hardwareBindingBranchReached) {
    const rejectionReasons = hardwareBindingLifecycleRejectionReasons(item);
    return lifecycleDispatch(item, "hardware_binding_bind" as const, true, rejectionReasons.length === 0, rejectionReasons);
  }
  if (item.entityType === "hardware_assignment") {
    const rejectionReasons = hardwareAssignmentLifecycleRejectionReasons(item, clinicId);
    return lifecycleDispatch(item, "hardware_assignment_finalize" as const, false, isHardwareAssignmentFinalizeLifecycle(item, clinicId), rejectionReasons);
  }
  return lifecycleDispatch(item, "unsupported" as const, false, false, ["entity/action pair is neither generic activate, hardware_binding:bind, nor hardware_assignment:finalize"]);
}

function hardwareBindingLifecycleRejectionReasons(item: DeploymentActivationExecutionNextItemStartItemSnapshot): string[] {
  const reasons: string[] = [];
  const expected = item.expectedCurrentState;
  const target = item.targetState;
  if (item.action !== "bind") reasons.push(`action must be bind; received ${item.action || "<empty>"}`);
  if (!item.entityId?.trim()) reasons.push("entityId must be non-empty");
  if (!expected) reasons.push("expectedCurrentState is missing");
  if (!target) reasons.push("targetState is missing");
  if (!expected || !target) return reasons;

  validateAuthoritativeFieldSet(expected, HARDWARE_BINDING_EXPECTED_STATE_FIELDS, "expectedCurrentState", reasons);
  validateAuthoritativeFieldSet(target, HARDWARE_BINDING_TARGET_STATE_FIELDS, "targetState", reasons);
  if (!isUuidValue(expected.hardwareId)) reasons.push("expectedCurrentState.hardwareId must be a valid UUID");
  if (!isDeploymentKey(expected.deploymentHardwareKey, "hardware")) reasons.push("expectedCurrentState.deploymentHardwareKey must be a deterministic hardware deployment key");
  if (!isBindingTargetType(expected.targetType)) reasons.push("expectedCurrentState.targetType must be workstation or sterilizer");
  if (isBindingTargetType(expected.targetType) && !isDeploymentKey(expected.targetDeploymentKey, expected.targetType)) reasons.push("expectedCurrentState.targetDeploymentKey must match targetType and use its deterministic deployment-key shape");
  if (!isUuidValue(expected.targetId)) reasons.push("expectedCurrentState.targetId must be a valid UUID");
  if (!isUuidValue(target.hardwareId)) reasons.push("targetState.hardwareId must be a valid UUID");
  if (!isBindingTargetType(target.targetType)) reasons.push("targetState.targetType must be workstation or sterilizer");
  if (isBindingTargetType(target.targetType) && !isDeploymentKey(target.targetDeploymentKey, target.targetType)) reasons.push("targetState.targetDeploymentKey must match targetType and use its deterministic deployment-key shape");
  if (!isUuidValue(target.targetId)) reasons.push("targetState.targetId must be a valid UUID");
  if (item.entityId !== expected.hardwareId) reasons.push("entityId must match expectedCurrentState.hardwareId");
  if (expected.hardwareId !== target.hardwareId) reasons.push("hardwareId must match across expectedCurrentState and targetState");
  if (expected.targetId !== target.targetId) reasons.push("targetId must match across expectedCurrentState and targetState");
  if (expected.targetType !== target.targetType) reasons.push("targetType must match across expectedCurrentState and targetState");
  if (expected.targetDeploymentKey !== target.targetDeploymentKey) reasons.push("targetDeploymentKey must match across expectedCurrentState and targetState");
  return reasons;
}

function validateAuthoritativeFieldSet(
  state: Record<string, unknown>,
  fields: readonly string[],
  label: string,
  reasons: string[],
): void {
  const keys = Object.keys(state).filter((key) => !isSerializationMetadataKey(key)).sort();
  const required = [...fields].sort();
  const missing = required.filter((key) => !Object.prototype.hasOwnProperty.call(state, key));
  const extras = keys.filter((key) => !fields.includes(key));
  if (missing.length > 0) reasons.push(`${label} is missing authoritative fields: ${missing.join(", ")}`);
  if (extras.length > 0) reasons.push(`${label} contains unsupported fields: ${extras.join(", ")}`);
}

function isSerializationMetadataKey(key: string): boolean {
  return key === "__typename";
}

function isBindingTargetType(value: unknown): value is "workstation" | "sterilizer" {
  return value === "workstation" || value === "sterilizer";
}

function isUuidValue(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
function hardwareAssignmentLifecycleRejectionReasons(item: DeploymentActivationExecutionNextItemStartItemSnapshot, clinicId: string): string[] {
  const reasons: string[] = [];
  const expected = item.expectedCurrentState;
  const target = item.targetState;
  if (item.action !== "finalize") reasons.push(`action must be finalize; received ${item.action || "<empty>"}`);
  if (!expected) reasons.push("expectedCurrentState is missing");
  if (!target) reasons.push("targetState is missing");
  if (!expected || !target) return reasons;
  if (Object.keys(expected).sort().join("\u0000") !== [...HARDWARE_ASSIGNMENT_EXPECTED_STATE_FIELDS].sort().join("\u0000")) reasons.push("expectedCurrentState field set does not match the nine-field assignment contract");
  if (expected.id !== item.entityId) reasons.push("expectedCurrentState.id does not match entityId");
  if (expected.clinicId !== clinicId) reasons.push("expectedCurrentState.clinicId does not match the execution clinic");
  if (typeof expected.deploymentHardwareKey !== "string" || !expected.deploymentHardwareKey) reasons.push("deploymentHardwareKey is missing");
  if (typeof expected.assignmentKey !== "string" || !expected.assignmentKey) reasons.push("assignmentKey is missing");
  if (expected.assignmentSource !== "setup_draft") reasons.push("assignmentSource must be setup_draft");
  if (expected.assignmentStatus !== "planned") reasons.push("assignmentStatus must be planned");
  if (expected.active !== false) reasons.push("active must be false before start");
  if (expected.targetType === "unassigned" ? expected.targetDeploymentKey !== null : !(["workstation", "sterilizer"].includes(String(expected.targetType)) && typeof expected.targetDeploymentKey === "string" && expected.targetDeploymentKey.length > 0)) reasons.push("assignment target type/key shape is invalid");
  if (Object.keys(target).sort().join("\u0000") !== "active\u0000assignmentStatus" || target.assignmentStatus !== "active" || target.active !== true) reasons.push("targetState must contain only assignmentStatus=active and active=true");
  return reasons;
}

function lifecycleDispatch(
  item: DeploymentActivationExecutionNextItemStartItemSnapshot,
  selectedBranch: "generic_activate" | "hardware_binding_bind" | "hardware_assignment_finalize" | "unsupported",
  hardwareBindingBranchReached: boolean,
  supported: boolean,
  rejectionReasons: readonly string[],
) {
  return {
    runtimeEntityType: item.entityType,
    runtimeAction: item.action,
    selectedBranch,
    hardwareBindingBranchReached,
    supported,
    expectedState: safeLifecycleState(item.expectedCurrentState),
    targetState: safeLifecycleTarget(item.targetState),
    expectedCurrentStateKeys: Object.keys(item.expectedCurrentState ?? {}).sort(),
    targetStateKeys: Object.keys(item.targetState ?? {}).sort(),
    authoritativeExpectedState: projectHardwareBindingExpectedState(item.expectedCurrentState),
    authoritativeTargetState: projectHardwareBindingTargetState(item.targetState),
    crossStateConsistency: hardwareBindingCrossStateConsistency(item),
    rejectionReasons,
  };
}

function projectHardwareBindingExpectedState(state: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!state) return null;
  return {
    deploymentHardwareKey: state.deploymentHardwareKey,
    hardwareId: state.hardwareId,
    targetDeploymentKey: state.targetDeploymentKey,
    targetId: state.targetId,
    targetType: state.targetType,
  };
}

function projectHardwareBindingTargetState(state: Record<string, unknown> | null): Record<string, unknown> {
  if (!state) return {};
  return {
    hardwareId: state.hardwareId,
    targetDeploymentKey: state.targetDeploymentKey,
    targetId: state.targetId,
    targetType: state.targetType,
  };
}

function hardwareBindingCrossStateConsistency(item: DeploymentActivationExecutionNextItemStartItemSnapshot) {
  const expected = item.expectedCurrentState;
  const target = item.targetState;
  return {
    entityIdMatchesHardwareId: Boolean(expected && item.entityId === expected.hardwareId),
    hardwareIdMatches: Boolean(expected && target && expected.hardwareId === target.hardwareId),
    targetIdMatches: Boolean(expected && target && expected.targetId === target.targetId),
    targetTypeMatches: Boolean(expected && target && expected.targetType === target.targetType),
    targetDeploymentKeyMatches: Boolean(expected && target && expected.targetDeploymentKey === target.targetDeploymentKey),
  };
}
function safeLifecycleState(state: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!state) return null;
  const safe: Record<string, unknown> = {};
  for (const key of ["id", "clinicId", "deploymentHardwareKey", "assignmentKey", "targetType", "targetDeploymentKey", "assignmentSource", "assignmentStatus", "active"]) {
    if (Object.prototype.hasOwnProperty.call(state, key)) safe[key] = state[key];
  }
  return safe;
}

function safeLifecycleTarget(state: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!state) return null;
  const safe: Record<string, unknown> = {};
  for (const key of ["assignmentStatus", "active"]) {
    if (Object.prototype.hasOwnProperty.call(state, key)) safe[key] = state[key];
  }
  return safe;
}
function isSupportedEntityAction(item: DeploymentActivationExecutionNextItemStartItemSnapshot, clinicId: string): boolean {
  if (item.entityType === "hardware_binding") return isHardwareBindingBindLifecycle(item);
  if (item.entityType !== "hardware_assignment" && Boolean(item.entityType.trim()) && item.action === "activate") return true;
  return isHardwareAssignmentFinalizeLifecycle(item, clinicId);
}

const HARDWARE_BINDING_EXPECTED_STATE_FIELDS = [
  "deploymentHardwareKey", "hardwareId", "targetDeploymentKey", "targetId", "targetType",
] as const;

const HARDWARE_BINDING_TARGET_STATE_FIELDS = [
  "hardwareId", "targetDeploymentKey", "targetId", "targetType",
] as const;

function isHardwareBindingBindLifecycle(item: DeploymentActivationExecutionNextItemStartItemSnapshot): boolean {
  return item.entityType === "hardware_binding" && hardwareBindingLifecycleRejectionReasons(item).length === 0;
}

function isDeploymentKey(value: unknown, entity: "hardware" | "workstation" | "sterilizer"): boolean {
  return typeof value === "string" && new RegExp(`^${entity}-\\d{3}$`).test(value);
}
const HARDWARE_ASSIGNMENT_EXPECTED_STATE_FIELDS = [
  "id", "clinicId", "deploymentHardwareKey", "assignmentKey", "targetType",
  "targetDeploymentKey", "assignmentSource", "assignmentStatus", "active",
] as const;

function isHardwareAssignmentFinalizeLifecycle(item: DeploymentActivationExecutionNextItemStartItemSnapshot, clinicId: string | null): boolean {
  if (item.entityType !== "hardware_assignment" || item.action !== "finalize" || !item.expectedCurrentState || !item.targetState) return false;
  const expectedKeys = Object.keys(item.expectedCurrentState).sort();
  const targetKeys = Object.keys(item.targetState).sort();
  const targetType = item.expectedCurrentState.targetType;
  const targetDeploymentKey = item.expectedCurrentState.targetDeploymentKey;
  const targetShapeValid = targetType === "unassigned"
    ? targetDeploymentKey === null
    : (targetType === "workstation" || targetType === "sterilizer") && typeof targetDeploymentKey === "string" && targetDeploymentKey.length > 0;
  return expectedKeys.join("\u0000") === [...HARDWARE_ASSIGNMENT_EXPECTED_STATE_FIELDS].sort().join("\u0000") &&
    targetKeys.join("\u0000") === "active\u0000assignmentStatus" &&
    item.expectedCurrentState.id === item.entityId &&
    typeof item.expectedCurrentState.clinicId === "string" && item.expectedCurrentState.clinicId.length > 0 &&
    (clinicId === null || item.expectedCurrentState.clinicId === clinicId) &&
    typeof item.expectedCurrentState.deploymentHardwareKey === "string" && item.expectedCurrentState.deploymentHardwareKey.length > 0 &&
    typeof item.expectedCurrentState.assignmentKey === "string" && item.expectedCurrentState.assignmentKey.length > 0 &&
    item.expectedCurrentState.assignmentSource === "setup_draft" &&
    item.expectedCurrentState.assignmentStatus === "planned" &&
    item.expectedCurrentState.active === false && targetShapeValid &&
    item.targetState.assignmentStatus === "active" && item.targetState.active === true;
}

function recognizedLifecycleEvidence(item: DeploymentActivationExecutionNextItemStartItemSnapshot | null, clinicId: string | null) {
  if (item && isHardwareBindingBindLifecycle(item)) return {
    lifecycle: "hardware_binding:bind" as const,
    expectedStateFields: [...HARDWARE_BINDING_EXPECTED_STATE_FIELDS],
    targetState: {},
  };
  return item && isHardwareAssignmentFinalizeLifecycle(item, clinicId) ? {
    lifecycle: "hardware_assignment:finalize" as const,
    expectedStateFields: [...HARDWARE_ASSIGNMENT_EXPECTED_STATE_FIELDS],
    targetState: { assignmentStatus: "active" as const, active: true as const },
  } : null;
}
function isValidTimestamp(value: string): boolean {
  return Number.isFinite(Date.parse(value));
}

function redactToken(value: string, token: string): string {
  return token ? value.split(token).join("[redacted]") : value;
}

function zeroDownstream(): DeploymentActivationExecutionNextItemStartDownstreamCounts {
  return {
    itemsStarted: 0,
    itemsSucceeded: 0,
    entitiesActivated: 0,
    bindingsWritten: 0,
    itemsCompleted: 0,
    dependenciesProgressed: 0,
    finalized: 0,
  };
}

function emptySnapshot(): DeploymentActivationExecutionNextItemStartSnapshot {
  return {
    session: null,
    items: [],
    aggregate: emptyNextItemStartAggregate(),
  };
}