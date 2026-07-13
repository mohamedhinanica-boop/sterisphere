import type {
  DeploymentActivationExecutionStartRepository,
} from "./deployment-activation-execution-start-repository";
import {
  cloneStartItemIntegrity,
  emptyStartItemIntegrity,
  type DeploymentActivationExecutionStartCommand,
  type DeploymentActivationExecutionStartDownstreamCounts,
  type DeploymentActivationExecutionStartIssue,
  type DeploymentActivationExecutionStartIssueCode,
  type DeploymentActivationExecutionStartIssueSeverity,
  type DeploymentActivationExecutionStartItemIntegritySnapshot,
  type DeploymentActivationExecutionStartResult,
  type DeploymentActivationExecutionStartSessionSnapshot,
  type DeploymentActivationExecutionStartStatus,
} from "./deployment-activation-execution-start-types";

export class DeploymentActivationExecutionStartService {
  constructor(
    private readonly repository: DeploymentActivationExecutionStartRepository,
  ) {}

  async assessStart(
    command: DeploymentActivationExecutionStartCommand,
  ): Promise<DeploymentActivationExecutionStartResult> {
    const commandIssues = validateCommand(command);

    if (hasBlocker(commandIssues)) {
      return buildResult({
        status: "blocked",
        command,
        session: null,
        itemIntegrity: emptyStartItemIntegrity(),
        issues: commandIssues,
        message:
          "Activation execution start assessment rejected invalid start input before repository access.",
      });
    }

    try {
      const snapshot = await this.repository.loadExecutionStartSnapshot({
        clinicId: command.clinicId,
        deploymentRunId: command.deploymentRunId,
        sessionId: command.sessionId,
        executionKey: command.executionKey,
      });

      return assessSnapshot(
        command,
        snapshot.session ? { ...snapshot.session } : null,
        cloneStartItemIntegrity(snapshot.itemIntegrity),
      );
    } catch {
      return buildResult({
        status: "error",
        command,
        session: null,
        itemIntegrity: emptyStartItemIntegrity(),
        issues: [
          issue({
            code: "repository_error",
            severity: "blocker",
            sessionId: command.sessionId,
            executionKey: command.executionKey,
            message:
              "Activation execution start repository failed safely.",
          }),
        ],
        message:
          "Activation execution start assessment could not complete because repository evidence was unavailable.",
      });
    }
  }
}

export function createDeploymentActivationExecutionStartService(
  repository: DeploymentActivationExecutionStartRepository,
): DeploymentActivationExecutionStartService {
  return new DeploymentActivationExecutionStartService(repository);
}

function assessSnapshot(
  command: DeploymentActivationExecutionStartCommand,
  session: DeploymentActivationExecutionStartSessionSnapshot | null,
  itemIntegrity: DeploymentActivationExecutionStartItemIntegritySnapshot,
): DeploymentActivationExecutionStartResult {
  if (!session) {
    return buildResult({
      status: "blocked",
      command,
      session,
      itemIntegrity,
      issues: [
        issue({
          code: "missing_session",
          severity: "blocker",
          sessionId: command.sessionId,
          executionKey: command.executionKey,
          message: "Activation execution session was not found.",
        }),
      ],
      message:
        "Activation execution start assessment found no execution session to start.",
    });
  }

  const issues = [
    ...validateIdentity(command, session),
    ...validateLifecycle(session),
    ...validateOwnership(command, session),
    ...validateItemIntegrity(session, itemIntegrity),
  ];

  if (hasBlocker(issues)) {
    return buildResult({
      status: statusForIssues(issues),
      command,
      session,
      itemIntegrity,
      issues,
      message:
        "Activation execution start assessment blocked session start because execution evidence is not start-safe.",
    });
  }

  if (session.executionStatus === "running") {
    return buildResult({
      status: "already_started",
      command,
      session,
      itemIntegrity,
      issues: standardWarnings(command, session),
      message:
        "Activation execution session is already running for this owner. No resume or item execution was performed.",
    });
  }

  return buildResult({
    status: "startable",
    command,
    session,
    itemIntegrity,
    proposedExecutionStatus: "running",
    proposedStartedAt: command.currentTimestamp,
    issues: standardWarnings(command, session),
    message:
      "Activation execution session is startable. No session start was persisted.",
  });
}

function validateCommand(
  command: DeploymentActivationExecutionStartCommand,
): DeploymentActivationExecutionStartIssue[] {
  const issues: DeploymentActivationExecutionStartIssue[] = [];

  if (!command.claimantId.trim()) {
    issues.push(commandIssue("claimant_invalid", command, "Claimant id is required."));
  }

  if (!command.ownershipToken.trim()) {
    issues.push(commandIssue("ownership_token_invalid", command, "Ownership token is required."));
  }

  if (!isValidTimestamp(command.currentTimestamp)) {
    issues.push(commandIssue("current_timestamp_invalid", command, "Current timestamp must be valid."));
  }

  return issues.sort(compareIssues);
}

function validateIdentity(
  command: DeploymentActivationExecutionStartCommand,
  session: DeploymentActivationExecutionStartSessionSnapshot,
): DeploymentActivationExecutionStartIssue[] {
  const issues: DeploymentActivationExecutionStartIssue[] = [];

  addIdentityIssue(issues, session.clinicId !== command.clinicId, "clinic_identity_mismatch", command, "Execution session clinic does not match the start request.");
  addIdentityIssue(issues, session.deploymentRunId !== command.deploymentRunId, "deployment_run_identity_mismatch", command, "Execution session deployment run does not match the start request.");
  addIdentityIssue(issues, session.id !== command.sessionId, "session_identity_mismatch", command, "Execution session id does not match the start request.");
  addIdentityIssue(issues, session.executionKey !== command.executionKey, "execution_key_mismatch", command, "Execution session key does not match the start request.");

  return issues;
}

function validateLifecycle(
  session: DeploymentActivationExecutionStartSessionSnapshot,
): DeploymentActivationExecutionStartIssue[] {
  const issues: DeploymentActivationExecutionStartIssue[] = [];

  if (session.preparationStatus !== "ready") {
    issues.push(blocker("preparation_not_ready", session, "Execution session preparation status is not ready."));
  }

  if (session.executionStatus === "claimed") {
    if (session.startedAt !== null) {
      issues.push(blocker("session_timestamp_present", session, "Claimed execution session already has a start timestamp."));
    }
  } else if (session.executionStatus === "running") {
    if (session.startedAt === null || !isValidTimestamp(session.startedAt)) {
      issues.push(blocker("session_timestamp_present", session, "Running execution session is missing a valid start timestamp."));
    }
  } else {
    issues.push(blocker("execution_status_not_startable", session, "Execution session lifecycle status is not startable."));
  }

  if (session.completedAt !== null || session.failedAt !== null) {
    issues.push(blocker("terminal_timestamp_present", session, "Execution session has terminal lifecycle timestamps."));
  }

  return issues;
}

function validateOwnership(
  command: DeploymentActivationExecutionStartCommand,
  session: DeploymentActivationExecutionStartSessionSnapshot,
): DeploymentActivationExecutionStartIssue[] {
  const issues: DeploymentActivationExecutionStartIssue[] = [];

  if (!session.executionOwner || !session.ownershipToken || !session.leaseExpiresAt) {
    issues.push(blocker("ownership_shape_inconsistent", session, "Execution session requires owner, token, and active lease evidence before start."));
    return issues;
  }

  if (!isValidTimestamp(session.leaseExpiresAt)) {
    issues.push(blocker("lease_timestamp_malformed", session, "Execution session lease expiration is malformed."));
    return issues;
  }

  if (session.executionOwner !== command.claimantId) {
    issues.push(blocker("session_owned_by_another_executor", session, "Execution session is owned by another executor."));
  }

  if (session.ownershipToken !== command.ownershipToken) {
    issues.push(blocker("ownership_token_mismatch", session, "Execution session ownership token does not match the start request."));
  }

  if (Date.parse(session.leaseExpiresAt) <= Date.parse(command.currentTimestamp)) {
    issues.push(blocker("lease_expired", session, "Execution session lease is not active."));
  }

  return issues;
}

function validateItemIntegrity(
  session: DeploymentActivationExecutionStartSessionSnapshot,
  items: DeploymentActivationExecutionStartItemIntegritySnapshot,
): DeploymentActivationExecutionStartIssue[] {
  const issues: DeploymentActivationExecutionStartIssue[] = [];

  if (
    items.durableItemCount !== session.itemsRequested ||
    items.readyItemCount + items.pendingItemCount !== items.durableItemCount
  ) {
    issues.push(blocker("incomplete_item_set", session, "Durable execution item count does not match start-safe session evidence."));
  }

  if (
    session.itemsReady !== items.readyItemCount ||
    session.itemsPending !== items.pendingItemCount ||
    session.itemsBlocked !== 0
  ) {
    issues.push(blocker("session_counter_mismatch", session, "Session item counters do not match durable item evidence."));
  }

  if (items.invalidStatusCount > 0) {
    issues.push(blocker("invalid_item_lifecycle", session, "Execution items include unsupported pre-start statuses."));
  }

  if (items.attemptedItemCount > 0) {
    issues.push(blocker("attempt_evidence_present", session, "Execution items already have attempt evidence."));
  }

  if (items.itemExecutionTimestampCount > 0) {
    issues.push(blocker("execution_timestamp_present", session, "Execution items already have execution timestamps."));
  }

  if (items.rollbackTimestampCount > 0) {
    issues.push(blocker("rollback_timestamp_present", session, "Execution items already have rollback timestamps."));
  }

  if (items.errorEvidenceCount > 0) {
    issues.push(blocker("item_error_present", session, "Execution items already have error evidence."));
  }

  if (
    items.duplicateExecutionItemKeyCount > 0 ||
    items.duplicatePlanItemKeyCount > 0 ||
    items.duplicateSequenceCount > 0
  ) {
    issues.push(blocker("duplicate_item_identity", session, "Duplicate durable execution item identity prevents session start."));
  }

  if (
    items.readyRootCount !== 1 ||
    items.pendingRootCount !== 0 ||
    items.malformedDependencyCount > 0 ||
    items.firstSequence !== 1 ||
    items.firstItemStatus !== "ready"
  ) {
    issues.push(blocker("dependency_integrity_invalid", session, "Execution item dependency evidence is not start-safe."));
  }

  return issues;
}

function buildResult(input: {
  status: DeploymentActivationExecutionStartStatus;
  command: DeploymentActivationExecutionStartCommand;
  session: DeploymentActivationExecutionStartSessionSnapshot | null;
  itemIntegrity: DeploymentActivationExecutionStartItemIntegritySnapshot;
  issues: readonly DeploymentActivationExecutionStartIssue[];
  message: string;
  proposedExecutionStatus?: "running" | null;
  proposedStartedAt?: string | null;
}): DeploymentActivationExecutionStartResult {
  const issues = [...input.issues].sort(compareIssues);

  return {
    ok: input.status === "startable" || input.status === "already_started",
    status: input.status,
    sessionId: input.session?.id ?? input.command.sessionId ?? null,
    executionKey: input.session?.executionKey ?? input.command.executionKey ?? null,
    planKey: input.session?.planKey ?? null,
    owner: input.session?.executionOwner ?? null,
    currentLeaseExpiresAt: input.session?.leaseExpiresAt ?? null,
    proposedExecutionStatus: input.proposedExecutionStatus ?? null,
    proposedStartedAt: input.proposedStartedAt ?? null,
    itemsRequested: input.session?.itemsRequested ?? 0,
    itemsReady: input.itemIntegrity.readyItemCount,
    itemsPending: input.itemIntegrity.pendingItemCount,
    blockers: issues.filter((current) => current.severity === "blocker").length,
    warnings: issues.filter((current) => current.severity === "warning").length,
    issues,
    downstream: zeroDownstream(),
    message: input.message,
  };
}

function standardWarnings(
  command: DeploymentActivationExecutionStartCommand,
  session: DeploymentActivationExecutionStartSessionSnapshot,
): DeploymentActivationExecutionStartIssue[] {
  return [
    issue({
      code: "start_persistence_unimplemented",
      severity: "warning",
      sessionId: session.id,
      executionKey: command.executionKey,
      message: "Session start persistence is not implemented in this slice.",
    }),
    issue({
      code: "item_execution_unimplemented",
      severity: "warning",
      sessionId: session.id,
      executionKey: command.executionKey,
      message: "Execution item start is not implemented in this slice.",
    }),
    issue({
      code: "heartbeat_unimplemented",
      severity: "warning",
      sessionId: session.id,
      executionKey: command.executionKey,
      message: "Lease heartbeat and renewal are not implemented in this slice.",
    }),
    issue({
      code: "rollback_unavailable",
      severity: "warning",
      sessionId: session.id,
      executionKey: command.executionKey,
      message: "Rollback execution remains unavailable.",
    }),
  ];
}

function statusForIssues(
  issues: readonly DeploymentActivationExecutionStartIssue[],
): "blocked" | "conflict" {
  return issues.some((current) =>
    [
      "clinic_identity_mismatch",
      "deployment_run_identity_mismatch",
      "session_identity_mismatch",
      "execution_key_mismatch",
      "session_owned_by_another_executor",
      "ownership_token_mismatch",
    ].includes(current.code),
  )
    ? "conflict"
    : "blocked";
}

function commandIssue(
  code: DeploymentActivationExecutionStartIssueCode,
  command: DeploymentActivationExecutionStartCommand,
  message: string,
): DeploymentActivationExecutionStartIssue {
  return issue({
    code,
    severity: "blocker",
    sessionId: command.sessionId,
    executionKey: command.executionKey,
    message,
  });
}

function addIdentityIssue(
  issues: DeploymentActivationExecutionStartIssue[],
  condition: boolean,
  code: DeploymentActivationExecutionStartIssueCode,
  command: DeploymentActivationExecutionStartCommand,
  message: string,
): void {
  if (condition) {
    issues.push(commandIssue(code, command, message));
  }
}

function blocker(
  code: DeploymentActivationExecutionStartIssueCode,
  session: DeploymentActivationExecutionStartSessionSnapshot,
  message: string,
): DeploymentActivationExecutionStartIssue {
  return issue({
    code,
    severity: "blocker",
    sessionId: session.id,
    executionKey: session.executionKey,
    message,
  });
}

function issue(input: {
  code: DeploymentActivationExecutionStartIssueCode;
  severity: DeploymentActivationExecutionStartIssueSeverity;
  sessionId: string | null;
  executionKey: string | null;
  message: string;
}): DeploymentActivationExecutionStartIssue {
  return {
    code: input.code,
    severity: input.severity,
    sessionId: input.sessionId,
    executionKey: input.executionKey,
    message: input.message,
  };
}

function hasBlocker(
  issues: readonly DeploymentActivationExecutionStartIssue[],
): boolean {
  return issues.some((current) => current.severity === "blocker");
}

function isValidTimestamp(value: string): boolean {
  return Number.isFinite(Date.parse(value));
}

function compareIssues(
  left: DeploymentActivationExecutionStartIssue,
  right: DeploymentActivationExecutionStartIssue,
): number {
  return (
    left.severity.localeCompare(right.severity) ||
    left.code.localeCompare(right.code) ||
    String(left.sessionId ?? "").localeCompare(String(right.sessionId ?? "")) ||
    String(left.executionKey ?? "").localeCompare(String(right.executionKey ?? ""))
  );
}

function zeroDownstream(): DeploymentActivationExecutionStartDownstreamCounts {
  return {
    sessionsStarted: 0,
    itemsStarted: 0,
    itemsSucceeded: 0,
    itemsFailed: 0,
    itemsRolledBack: 0,
    entitiesActivated: 0,
    bindingsWritten: 0,
    deploymentRunsFinalized: 0,
    rollbacksExecuted: 0,
  };
}