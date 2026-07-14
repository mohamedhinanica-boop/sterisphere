import type {
  DeploymentActivationExecutionItemStartRepository,
} from "./deployment-activation-execution-item-start-repository";
import {
  cloneItemStartAggregate,
  cloneItemStartCandidate,
  emptyItemStartAggregate,
  type DeploymentActivationExecutionItemStartAggregateSnapshot,
  type DeploymentActivationExecutionItemStartCandidateSnapshot,
  type DeploymentActivationExecutionItemStartCommand,
  type DeploymentActivationExecutionItemStartDownstreamCounts,
  type DeploymentActivationExecutionItemStartIssue,
  type DeploymentActivationExecutionItemStartIssueCode,
  type DeploymentActivationExecutionItemStartIssueSeverity,
  type DeploymentActivationExecutionItemStartResult,
  type DeploymentActivationExecutionItemStartSessionSnapshot,
  type DeploymentActivationExecutionItemStartStatus,
} from "./deployment-activation-execution-item-start-types";

export class DeploymentActivationExecutionItemStartService {
  constructor(
    private readonly repository: DeploymentActivationExecutionItemStartRepository,
  ) {}

  async assessItemStart(
    command: DeploymentActivationExecutionItemStartCommand,
  ): Promise<DeploymentActivationExecutionItemStartResult> {
    const commandIssues = validateCommand(command);

    if (hasBlocker(commandIssues)) {
      return buildResult({
        status: "blocked",
        command,
        session: null,
        candidate: null,
        aggregate: emptyItemStartAggregate(),
        issues: commandIssues,
        message:
          "Activation execution item-start assessment rejected invalid input before repository access.",
      });
    }

    try {
      const snapshot = await this.repository.loadExecutionItemStartSnapshot({
        clinicId: command.clinicId,
        deploymentRunId: command.deploymentRunId,
        sessionId: command.sessionId,
        executionKey: command.executionKey,
      });

      return assessSnapshot(
        command,
        snapshot.session ? { ...snapshot.session } : null,
        snapshot.candidateItem ? cloneItemStartCandidate(snapshot.candidateItem) : null,
        cloneItemStartAggregate(snapshot.aggregate),
      );
    } catch {
      return buildResult({
        status: "error",
        command,
        session: null,
        candidate: null,
        aggregate: emptyItemStartAggregate(),
        issues: [
          commandIssue(
            "repository_error",
            command,
            "Activation execution item-start repository failed safely.",
          ),
        ],
        message:
          "Activation execution item-start assessment could not complete because repository evidence was unavailable.",
      });
    }
  }
}

export function createDeploymentActivationExecutionItemStartService(
  repository: DeploymentActivationExecutionItemStartRepository,
): DeploymentActivationExecutionItemStartService {
  return new DeploymentActivationExecutionItemStartService(repository);
}

function assessSnapshot(
  command: DeploymentActivationExecutionItemStartCommand,
  session: DeploymentActivationExecutionItemStartSessionSnapshot | null,
  candidate: DeploymentActivationExecutionItemStartCandidateSnapshot | null,
  aggregate: DeploymentActivationExecutionItemStartAggregateSnapshot,
): DeploymentActivationExecutionItemStartResult {
  if (!session) {
    return buildResult({
      status: "not_found",
      command,
      session,
      candidate,
      aggregate,
      issues: [
        commandIssue(
          "missing_session",
          command,
          "Activation execution session was not found.",
        ),
      ],
      message:
        "Activation execution item-start assessment found no running execution session.",
    });
  }

  const mode = aggregate.runningItemCount === 1 ? "already_started" : "startable";
  const issues = [
    ...validateIdentity(command, session),
    ...validateSessionLifecycle(session),
    ...validateOwnership(command, session),
    ...validateAggregate(session, aggregate, mode),
    ...validateCandidate(session, candidate, aggregate, mode),
  ];

  if (hasBlocker(issues)) {
    return buildResult({
      status: statusForIssues(issues),
      command,
      session,
      candidate,
      aggregate,
      issues,
      message:
        "Activation execution item-start assessment blocked because item evidence is not start-safe.",
    });
  }

  if (!candidate) {
    return buildResult({
      status: "not_found",
      command,
      session,
      candidate,
      aggregate,
      issues: [
        blocker(
          "missing_candidate_item",
          session,
          null,
          "No deterministic candidate execution item was found.",
        ),
      ],
      message:
        "Activation execution item-start assessment found no candidate item.",
    });
  }

  if (mode === "already_started") {
    return buildResult({
      status: "already_started",
      command,
      session,
      candidate,
      aggregate,
      issues: standardWarnings(session, candidate),
      message:
        "Activation execution item is already running for this session. No item mutation was performed.",
    });
  }

  return buildResult({
    status: "startable",
    command,
    session,
    candidate,
    aggregate,
    issues: standardWarnings(session, candidate),
    message:
      "Activation execution item is startable. No item start was persisted.",
  });
}

function validateCommand(
  command: DeploymentActivationExecutionItemStartCommand,
): DeploymentActivationExecutionItemStartIssue[] {
  const issues: DeploymentActivationExecutionItemStartIssue[] = [];

  if (!command.claimantId.trim()) {
    issues.push(commandIssue("claimant_invalid", command, "Claimant id is required."));
  }

  if (!command.ownershipToken.trim()) {
    issues.push(commandIssue("ownership_token_invalid", command, "Ownership token is required."));
  }

  if (!isValidTimestamp(command.assessmentTimestamp)) {
    issues.push(commandIssue("assessment_timestamp_invalid", command, "Assessment timestamp must be valid."));
  }

  return issues.sort(compareIssues);
}

function validateIdentity(
  command: DeploymentActivationExecutionItemStartCommand,
  session: DeploymentActivationExecutionItemStartSessionSnapshot,
): DeploymentActivationExecutionItemStartIssue[] {
  const issues: DeploymentActivationExecutionItemStartIssue[] = [];

  addIdentityIssue(issues, session.clinicId !== command.clinicId, "clinic_identity_mismatch", command, "Execution session clinic does not match the item-start request.");
  addIdentityIssue(issues, session.deploymentRunId !== command.deploymentRunId, "deployment_run_identity_mismatch", command, "Execution session deployment run does not match the item-start request.");
  addIdentityIssue(issues, session.sessionId !== command.sessionId, "session_identity_mismatch", command, "Execution session id does not match the item-start request.");
  addIdentityIssue(issues, session.executionKey !== command.executionKey, "execution_key_mismatch", command, "Execution session key does not match the item-start request.");

  return issues;
}

function validateSessionLifecycle(
  session: DeploymentActivationExecutionItemStartSessionSnapshot,
): DeploymentActivationExecutionItemStartIssue[] {
  const issues: DeploymentActivationExecutionItemStartIssue[] = [];

  if (session.executionStatus !== "running") {
    issues.push(blocker("execution_status_not_running", session, null, "Execution session is not running."));
  }

  if (!session.startedAt || !isValidTimestamp(session.startedAt)) {
    issues.push(blocker("session_timestamp_missing", session, null, "Execution session is missing valid started_at evidence."));
  }

  if (session.completedAt !== null || session.failedAt !== null) {
    issues.push(blocker("terminal_timestamp_present", session, null, "Execution session has terminal lifecycle timestamps."));
  }

  return issues;
}

function validateOwnership(
  command: DeploymentActivationExecutionItemStartCommand,
  session: DeploymentActivationExecutionItemStartSessionSnapshot,
): DeploymentActivationExecutionItemStartIssue[] {
  const issues: DeploymentActivationExecutionItemStartIssue[] = [];

  if (!session.executionOwner || !session.ownershipToken) {
    issues.push(blocker("ownership_shape_inconsistent", session, null, "Execution session requires owner and token evidence before item start."));
  }

  if (!session.leaseExpiresAt) {
    issues.push(blocker("lease_missing", session, null, "Execution session requires active lease evidence before item start."));
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
    issues.push(blocker("ownership_token_mismatch", session, null, "Execution session ownership token does not match the item-start request."));
  }

  if (Date.parse(session.leaseExpiresAt) <= Date.parse(command.assessmentTimestamp)) {
    issues.push(blocker("lease_expired", session, null, "Execution session lease is not active."));
  }

  return issues;
}

function validateAggregate(
  session: DeploymentActivationExecutionItemStartSessionSnapshot,
  aggregate: DeploymentActivationExecutionItemStartAggregateSnapshot,
  mode: "startable" | "already_started",
): DeploymentActivationExecutionItemStartIssue[] {
  const issues: DeploymentActivationExecutionItemStartIssue[] = [];
  const expectedPending = aggregate.totalItemCount - aggregate.readyItemCount - aggregate.runningItemCount - aggregate.succeededItemCount;

  if (
    aggregate.totalItemCount !== session.itemsRequested ||
    aggregate.totalItemCount < 1 ||
    aggregate.pendingItemCount !== expectedPending
  ) {
    issues.push(blocker("incomplete_item_set", session, null, "Durable execution item count does not match item-start evidence."));
  }

  if (mode === "startable") {
    if (aggregate.readyItemCount === 0) {
      issues.push(blocker("no_ready_item", session, null, "No ready execution item exists."));
    }

    if (aggregate.readyItemCount > 1) {
      issues.push(blocker("multiple_ready_items", session, null, "More than one ready execution item exists."));
    }

    if (aggregate.runningItemCount > 0) {
      issues.push(blocker("multiple_running_items", session, null, "Running execution item evidence exists before item start."));
    }

    if (aggregate.timestampedItemCount > 0) {
      issues.push(blocker("execution_timestamp_present", session, null, "Execution item timestamp evidence exists before item start."));
    }
  } else {
    if (aggregate.runningItemCount > 1) {
      issues.push(blocker("multiple_running_items", session, null, "More than one running execution item exists."));
    }

    if (aggregate.readyItemCount > 0) {
      issues.push(blocker("multiple_ready_items", session, null, "Ready execution item evidence is ambiguous while one item is running."));
    }

    if (aggregate.timestampedItemCount > 1) {
      issues.push(blocker("execution_timestamp_present", session, null, "Unexpected execution timestamp evidence exists outside the running item."));
    }
  }

  if (aggregate.failedItemCount > 0 || aggregate.blockedItemCount > 0) {
    issues.push(blocker("invalid_item_lifecycle", session, null, "Execution items include failed or blocked statuses."));
  }

  if (mode === "startable" && aggregate.attemptedItemCount > 0) {
    issues.push(blocker("attempt_evidence_present", session, null, "Execution items already have attempt evidence."));
  }

  if (mode === "already_started" && aggregate.attemptedItemCount !== 1) {
    issues.push(blocker("attempt_evidence_present", session, null, "Exactly one running execution item must have attempt evidence for reuse."));
  }

  if (aggregate.rollbackEvidenceCount > 0) {
    issues.push(blocker("rollback_evidence_present", session, null, "Execution items already have rollback evidence."));
  }

  if (aggregate.errorEvidenceCount > 0) {
    issues.push(blocker("item_error_present", session, null, "Execution items already have error evidence."));
  }

  if (
    aggregate.duplicateExecutionItemKeyCount > 0 ||
    aggregate.duplicatePlanItemKeyCount > 0 ||
    aggregate.duplicateSequenceCount > 0
  ) {
    issues.push(blocker("duplicate_item_identity", session, null, "Duplicate durable execution item identity prevents item start."));
  }

  if (aggregate.malformedDependencyCount > 0) {
    issues.push(blocker("dependency_integrity_invalid", session, null, "Execution item dependency evidence is malformed."));
  }

  return issues;
}

function validateCandidate(
  session: DeploymentActivationExecutionItemStartSessionSnapshot,
  candidate: DeploymentActivationExecutionItemStartCandidateSnapshot | null,
  aggregate: DeploymentActivationExecutionItemStartAggregateSnapshot,
  mode: "startable" | "already_started",
): DeploymentActivationExecutionItemStartIssue[] {
  if (!candidate) {
    return [blocker("missing_candidate_item", session, null, "No deterministic candidate execution item was found.")];
  }

  const issues: DeploymentActivationExecutionItemStartIssue[] = [];
  const expectedStatus = mode === "already_started" ? "running" : "ready";

  if (candidate.sessionId !== session.sessionId) {
    issues.push(blocker("candidate_identity_mismatch", session, candidate, "Candidate item does not belong to the execution session."));
  }

  if (candidate.executionStatus !== expectedStatus) {
    issues.push(blocker("candidate_status_invalid", session, candidate, "Candidate item lifecycle status is not start-safe."));
  }

  if (mode === "startable" && candidate.attemptCount !== 0) {
    issues.push(blocker("candidate_attempt_present", session, candidate, "Candidate item already has attempt evidence."));
  }

  if (mode === "already_started" && candidate.attemptCount !== 1) {
    issues.push(blocker("candidate_attempt_present", session, candidate, "Running candidate item must have exactly one attempt for reuse."));
  }

  if (candidate.completedAt !== null || candidate.rolledBackAt !== null) {
    issues.push(blocker("candidate_timestamp_present", session, candidate, "Candidate item has terminal or rollback timestamps."));
  }

  if (mode === "startable" && candidate.startedAt !== null) {
    issues.push(blocker("candidate_timestamp_present", session, candidate, "Candidate ready item already has a start timestamp."));
  }

  if (mode === "already_started" && (!candidate.startedAt || !isValidTimestamp(candidate.startedAt))) {
    issues.push(blocker("candidate_timestamp_present", session, candidate, "Running candidate item is missing valid start evidence."));
  }

  if (candidate.errorCode !== null || candidate.errorMessage !== null) {
    issues.push(blocker("candidate_error_present", session, candidate, "Candidate item has error evidence."));
  }

  if (aggregate.firstSequence !== candidate.sequence) {
    issues.push(blocker("candidate_sequence_mismatch", session, candidate, "Candidate sequence does not match aggregate first-item evidence."));
  }

  if (aggregate.firstExecutionStatus !== candidate.executionStatus) {
    issues.push(blocker("candidate_identity_mismatch", session, candidate, "Candidate status does not match aggregate first-item evidence."));
  }

  if (!dependenciesSatisfied(candidate.dependencyKeys, aggregate.succeededPlanItemKeys)) {
    issues.push(blocker("dependency_integrity_invalid", session, candidate, "Candidate dependencies are not satisfied by prior succeeded items."));
  }

  if (candidate.sequence === 1 && candidate.dependencyKeys.length > 0) {
    issues.push(blocker("dependency_integrity_invalid", session, candidate, "The first execution item must not declare dependencies."));
  }

  return issues;
}

function dependenciesSatisfied(
  dependencyKeys: readonly string[],
  succeededPlanItemKeys: readonly string[],
): boolean {
  const succeeded = new Set(succeededPlanItemKeys);
  return dependencyKeys.every((key) => succeeded.has(key));
}

function buildResult(input: {
  status: DeploymentActivationExecutionItemStartStatus;
  command: DeploymentActivationExecutionItemStartCommand;
  session: DeploymentActivationExecutionItemStartSessionSnapshot | null;
  candidate: DeploymentActivationExecutionItemStartCandidateSnapshot | null;
  aggregate: DeploymentActivationExecutionItemStartAggregateSnapshot;
  issues: readonly DeploymentActivationExecutionItemStartIssue[];
  message: string;
}): DeploymentActivationExecutionItemStartResult {
  const issues = [...input.issues].sort(compareIssues);

  return {
    ok: input.status === "startable" || input.status === "already_started",
    status: input.status,
    sessionId: input.session?.sessionId ?? input.command.sessionId ?? null,
    executionKey: input.session?.executionKey ?? input.command.executionKey ?? null,
    claimantId: input.command.claimantId || null,
    itemId: input.candidate?.itemId ?? null,
    executionItemKey: input.candidate?.executionItemKey ?? null,
    planItemKey: input.candidate?.planItemKey ?? null,
    sequence: input.candidate?.sequence ?? null,
    entityType: input.candidate?.entityType ?? null,
    entityKey: input.candidate?.entityKey ?? null,
    entityId: input.candidate?.entityId ?? null,
    action: input.candidate?.action ?? null,
    itemExecutionStatus: input.candidate?.executionStatus ?? null,
    attemptCount: input.candidate?.attemptCount ?? 0,
    startedAt: input.candidate?.startedAt ?? null,
    leaseExpiresAt: input.session?.leaseExpiresAt ?? null,
    dependencyCount: input.candidate?.dependencyKeys.length ?? 0,
    reversible: input.candidate?.reversible ?? null,
    irreversible: input.candidate ? !input.candidate.reversible : null,
    blockers: issues.filter((current) => current.severity === "blocker").length,
    warnings: issues.filter((current) => current.severity === "warning").length,
    issues,
    downstream: zeroDownstream(),
    message: input.message,
  };
}

function standardWarnings(
  session: DeploymentActivationExecutionItemStartSessionSnapshot,
  candidate: DeploymentActivationExecutionItemStartCandidateSnapshot,
): DeploymentActivationExecutionItemStartIssue[] {
  return [
    blocker("item_start_persistence_unimplemented", session, candidate, "Atomic item-start persistence is not implemented in this slice.", "warning"),
    blocker("activation_execution_unimplemented", session, candidate, "Activation execution is not implemented in this slice.", "warning"),
    blocker("dependency_progression_unimplemented", session, candidate, "Dependency progression is not implemented in this slice.", "warning"),
    blocker("rollback_execution_unimplemented", session, candidate, "Rollback execution is not implemented in this slice.", "warning"),
  ];
}

function statusForIssues(
  issues: readonly DeploymentActivationExecutionItemStartIssue[],
): "blocked" | "conflict" | "not_found" {
  if (issues.some((current) => current.code === "missing_session" || current.code === "missing_candidate_item")) {
    return "not_found";
  }

  return issues.some((current) =>
    [
      "clinic_identity_mismatch",
      "deployment_run_identity_mismatch",
      "session_identity_mismatch",
      "execution_key_mismatch",
      "session_owned_by_another_executor",
      "ownership_token_mismatch",
      "candidate_identity_mismatch",
    ].includes(current.code),
  )
    ? "conflict"
    : "blocked";
}

function addIdentityIssue(
  issues: DeploymentActivationExecutionItemStartIssue[],
  condition: boolean,
  code: DeploymentActivationExecutionItemStartIssueCode,
  command: DeploymentActivationExecutionItemStartCommand,
  message: string,
): void {
  if (condition) {
    issues.push(commandIssue(code, command, message));
  }
}

function commandIssue(
  code: DeploymentActivationExecutionItemStartIssueCode,
  command: DeploymentActivationExecutionItemStartCommand,
  message: string,
): DeploymentActivationExecutionItemStartIssue {
  return issue({
    code,
    severity: "blocker",
    sessionId: command.sessionId,
    executionKey: command.executionKey,
    executionItemKey: null,
    planItemKey: null,
    message,
  });
}

function blocker(
  code: DeploymentActivationExecutionItemStartIssueCode,
  session: DeploymentActivationExecutionItemStartSessionSnapshot,
  candidate: DeploymentActivationExecutionItemStartCandidateSnapshot | null,
  message: string,
  severity: DeploymentActivationExecutionItemStartIssueSeverity = "blocker",
): DeploymentActivationExecutionItemStartIssue {
  return issue({
    code,
    severity,
    sessionId: session.sessionId,
    executionKey: session.executionKey,
    executionItemKey: candidate?.executionItemKey ?? null,
    planItemKey: candidate?.planItemKey ?? null,
    message,
  });
}

function issue(input: {
  code: DeploymentActivationExecutionItemStartIssueCode;
  severity: DeploymentActivationExecutionItemStartIssueSeverity;
  sessionId: string | null;
  executionKey: string | null;
  executionItemKey: string | null;
  planItemKey: string | null;
  message: string;
}): DeploymentActivationExecutionItemStartIssue {
  return { ...input };
}

function hasBlocker(
  issues: readonly DeploymentActivationExecutionItemStartIssue[],
): boolean {
  return issues.some((current) => current.severity === "blocker");
}

function isValidTimestamp(value: string): boolean {
  return Number.isFinite(Date.parse(value));
}

function compareIssues(
  left: DeploymentActivationExecutionItemStartIssue,
  right: DeploymentActivationExecutionItemStartIssue,
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

function zeroDownstream(): DeploymentActivationExecutionItemStartDownstreamCounts {
  return {
    itemsStarted: 0,
    itemsSucceeded: 0,
    entitiesActivated: 0,
    bindingsWritten: 0,
    deploymentFinalized: 0,
  };
}