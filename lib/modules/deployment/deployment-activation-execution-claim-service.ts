import type {
  DeploymentActivationExecutionClaimRepository,
} from "./deployment-activation-execution-claim-repository";
import {
  MAX_EXECUTION_CLAIM_LEASE_SECONDS,
  MIN_EXECUTION_CLAIM_LEASE_SECONDS,
  cloneClaimItemCompleteness,
  emptyClaimItemCompleteness,
  type DeploymentActivationExecutionClaimCommand,
  type DeploymentActivationExecutionClaimDownstreamCounts,
  type DeploymentActivationExecutionClaimIssue,
  type DeploymentActivationExecutionClaimIssueCode,
  type DeploymentActivationExecutionClaimIssueSeverity,
  type DeploymentActivationExecutionClaimItemCompletenessSnapshot,
  type DeploymentActivationExecutionClaimResult,
  type DeploymentActivationExecutionClaimSessionSnapshot,
  type DeploymentActivationExecutionClaimStatus,
  type DeploymentActivationExecutionClaimTokenFactory,
} from "./deployment-activation-execution-claim-types";

export interface DeploymentActivationExecutionClaimServiceOptions {
  tokenFactory?: DeploymentActivationExecutionClaimTokenFactory;
}

export class DeploymentActivationExecutionClaimService {
  private readonly tokenFactory: DeploymentActivationExecutionClaimTokenFactory;

  constructor(
    private readonly repository: DeploymentActivationExecutionClaimRepository,
    options: DeploymentActivationExecutionClaimServiceOptions = {},
  ) {
    this.tokenFactory =
      options.tokenFactory ?? deterministicOwnershipTokenFactory;
  }

  async assessClaim(
    command: DeploymentActivationExecutionClaimCommand,
  ): Promise<DeploymentActivationExecutionClaimResult> {
    const commandIssues = validateCommand(command);

    if (hasBlocker(commandIssues)) {
      return buildResult({
        status: "blocked",
        command,
        session: null,
        itemCompleteness: emptyClaimItemCompleteness(),
        issues: commandIssues,
        message:
          "Activation execution claim assessment rejected invalid claim input before repository access.",
      });
    }

    try {
      const snapshot = await this.repository.getClaimSnapshot({
        clinicId: command.clinicId,
        deploymentRunId: command.deploymentRunId,
        sessionId: command.sessionId,
        executionKey: command.executionKey,
      });
      const session = snapshot.session ? { ...snapshot.session } : null;
      const itemCompleteness = cloneClaimItemCompleteness(
        snapshot.itemCompleteness,
      );

      return this.assessSnapshot(command, session, itemCompleteness);
    } catch {
      return buildResult({
        status: "error",
        command,
        session: null,
        itemCompleteness: emptyClaimItemCompleteness(),
        issues: [
          issue({
            code: "repository_error",
            severity: "blocker",
            sessionId: command.sessionId,
            executionKey: command.executionKey,
            message:
              "Activation execution claim repository failed safely.",
          }),
        ],
        message:
          "Activation execution claim assessment could not complete because repository evidence was unavailable.",
      });
    }
  }

  private assessSnapshot(
    command: DeploymentActivationExecutionClaimCommand,
    session: DeploymentActivationExecutionClaimSessionSnapshot | null,
    itemCompleteness: DeploymentActivationExecutionClaimItemCompletenessSnapshot,
  ): DeploymentActivationExecutionClaimResult {
    if (!session) {
      return buildResult({
        status: "blocked",
        command,
        session,
        itemCompleteness,
        issues: [
          issue({
            code: "missing_session",
            severity: "blocker",
            sessionId: command.sessionId,
            executionKey: command.executionKey,
            message:
              "Activation execution session was not found.",
          }),
        ],
        message:
          "Activation execution claim assessment found no execution session to claim.",
      });
    }

    const issues = [
      ...validateIdentity(command, session),
      ...validateClaimLifecycle(session),
      ...validateItemCompleteness(command, session, itemCompleteness),
    ];
    const ownershipShapeIssues = validateOwnershipShape(session);
    issues.push(...ownershipShapeIssues);

    if (hasBlocker(issues)) {
      return buildResult({
        status: statusForBlockedIssues(issues),
        command,
        session,
        itemCompleteness,
        issues,
        message:
          "Activation execution claim assessment blocked ownership because execution evidence is not claim-safe.",
      });
    }

    const leaseState = readLeaseState(command, session);

    if (leaseState === "unowned") {
      return buildResult({
        status: "claimable",
        command,
        session,
        itemCompleteness,
        proposedOwnershipToken: this.tokenFactory({
          sessionId: command.sessionId,
          claimantId: command.claimantId,
          claimRequestedAt: command.claimRequestedAt,
        }),
        proposedLeaseStartedAt: command.claimRequestedAt,
        proposedLeaseExpiresAt: addSeconds(
          command.claimRequestedAt,
          command.leaseDurationSeconds,
        ),
        issues: standardWarnings(command, session),
        message:
          "Activation execution session is claimable. No ownership was persisted.",
      });
    }

    if (leaseState === "active-same-owner") {
      return buildResult({
        status: "already_owned",
        command,
        session,
        itemCompleteness,
        proposedOwnershipToken: session.ownershipToken,
        proposedLeaseStartedAt: command.claimRequestedAt,
        proposedLeaseExpiresAt: session.leaseExpiresAt,
        issues: standardWarnings(command, session),
        message:
          "Activation execution session already has an active lease for this claimant. No renewal was persisted.",
      });
    }

    if (leaseState === "active-other-owner") {
      return buildResult({
        status: "conflict",
        command,
        session,
        itemCompleteness,
        issues: [
          issue({
            code: "session_owned_by_another_executor",
            severity: "blocker",
            sessionId: session.id,
            executionKey: session.executionKey,
            message:
              "Activation execution session has an active lease owned by another executor.",
          }),
        ],
        message:
          "Activation execution claim assessment found an active lease owned by another executor.",
      });
    }

    if (session.executionStatus === "running") {
      return buildResult({
        status: "blocked",
        command,
        session,
        itemCompleteness,
        issues: [
          issue({
            code: "expired_lease_reclaimable",
            severity: "blocker",
            sessionId: session.id,
            executionKey: session.executionKey,
            message:
              "Running execution session has an expired lease and cannot be reclaimed or renewed by verification.",
          }),
          ...standardWarnings(command, session),
        ],
        message:
          "Activation execution claim assessment blocked ownership because the running session lease is expired.",
      });
    }

    return buildResult({
      status: "lease_expired_reclaimable",
      command,
      session,
      itemCompleteness,
      proposedOwnershipToken: this.tokenFactory({
        sessionId: command.sessionId,
        claimantId: command.claimantId,
        claimRequestedAt: command.claimRequestedAt,
      }),
      proposedLeaseStartedAt: command.claimRequestedAt,
      proposedLeaseExpiresAt: addSeconds(
        command.claimRequestedAt,
        command.leaseDurationSeconds,
      ),
      issues: [
        issue({
          code: "expired_lease_reclaimable",
          severity: "warning",
          sessionId: session.id,
          executionKey: session.executionKey,
          message:
            "Existing lease is expired and execution evidence remains untouched; reclaim is proposal-only.",
        }),
        ...standardWarnings(command, session),
      ],
      message:
        "Activation execution session has an expired lease and untouched evidence, so a future atomic reclaim may be safe.",
    });
  }
}

export function createDeploymentActivationExecutionClaimService(
  repository: DeploymentActivationExecutionClaimRepository,
  options: DeploymentActivationExecutionClaimServiceOptions = {},
): DeploymentActivationExecutionClaimService {
  return new DeploymentActivationExecutionClaimService(repository, options);
}

function validateCommand(
  command: DeploymentActivationExecutionClaimCommand,
): DeploymentActivationExecutionClaimIssue[] {
  const issues: DeploymentActivationExecutionClaimIssue[] = [];

  if (!command.claimantId.trim()) {
    issues.push(
      issue({
        code: "claimant_invalid",
        severity: "blocker",
        sessionId: command.sessionId,
        executionKey: command.executionKey,
        message: "Claimant id is required.",
      }),
    );
  }

  if (!isValidIsoDate(command.claimRequestedAt)) {
    issues.push(
      issue({
        code: "claim_timestamp_invalid",
        severity: "blocker",
        sessionId: command.sessionId,
        executionKey: command.executionKey,
        message: "Claim timestamp must be a valid ISO timestamp.",
      }),
    );
  }

  if (
    !Number.isFinite(command.leaseDurationSeconds) ||
    command.leaseDurationSeconds < MIN_EXECUTION_CLAIM_LEASE_SECONDS ||
    command.leaseDurationSeconds > MAX_EXECUTION_CLAIM_LEASE_SECONDS
  ) {
    issues.push(
      issue({
        code: "lease_duration_invalid",
        severity: "blocker",
        sessionId: command.sessionId,
        executionKey: command.executionKey,
        message:
          "Claim lease duration must be between 30 and 900 seconds.",
      }),
    );
  }

  return issues.sort(compareIssues);
}

function validateIdentity(
  command: DeploymentActivationExecutionClaimCommand,
  session: DeploymentActivationExecutionClaimSessionSnapshot,
): DeploymentActivationExecutionClaimIssue[] {
  const issues: DeploymentActivationExecutionClaimIssue[] = [];

  addIdentityIssue(
    issues,
    session.clinicId !== command.clinicId,
    "clinic_identity_mismatch",
    command,
    "Execution session clinic does not match the claim request.",
  );
  addIdentityIssue(
    issues,
    session.deploymentRunId !== command.deploymentRunId,
    "deployment_run_identity_mismatch",
    command,
    "Execution session deployment run does not match the claim request.",
  );
  addIdentityIssue(
    issues,
    session.id !== command.sessionId,
    "session_identity_mismatch",
    command,
    "Execution session id does not match the claim request.",
  );
  addIdentityIssue(
    issues,
    session.executionKey !== command.executionKey,
    "execution_key_mismatch",
    command,
    "Execution session execution key does not match the claim request.",
  );
  addIdentityIssue(
    issues,
    session.planKey !== command.planKey,
    "plan_key_mismatch",
    command,
    "Execution session plan key does not match the claim request.",
  );

  return issues;
}

function validateClaimLifecycle(
  session: DeploymentActivationExecutionClaimSessionSnapshot,
): DeploymentActivationExecutionClaimIssue[] {
  const issues: DeploymentActivationExecutionClaimIssue[] = [];

  if (session.preparationStatus !== "ready") {
    issues.push(blocker("preparation_not_ready", session, "Execution session preparation status is not ready."));
  }

  if (!["prepared", "claimed", "running"].includes(session.executionStatus)) {
    issues.push(blocker("execution_status_not_claimable", session, "Execution session lifecycle status is not claimable."));
  }

  if (session.blockers > 0 || session.itemsBlocked > 0) {
    issues.push(blocker("session_blockers_present", session, "Execution session has blockers or blocked items."));
  }

  if (session.executionStatus === "running") {
    if (!session.startedAt || !isValidIsoDate(session.startedAt)) {
      issues.push(blocker("session_timestamp_present", session, "Running execution session is missing valid start evidence."));
    }
  } else if (session.startedAt) {
    issues.push(blocker("session_timestamp_present", session, "Execution session has execution lifecycle timestamps."));
  }

  if (session.completedAt || session.failedAt) {
    issues.push(blocker("session_timestamp_present", session, "Execution session has terminal lifecycle timestamps."));
  }

  return issues;
}
function validateOwnershipShape(
  session: DeploymentActivationExecutionClaimSessionSnapshot,
): DeploymentActivationExecutionClaimIssue[] {
  const ownershipFields = [
    session.executionOwner,
    session.ownershipToken,
    session.leaseExpiresAt,
  ];
  const presentCount = ownershipFields.filter((value) => value !== null).length;

  if (session.executionStatus === "prepared" && presentCount !== 0) {
    return [
      blocker(
        "ownership_shape_inconsistent",
        session,
        "Prepared execution session must not have ownership evidence.",
      ),
    ];
  }

  if ((session.executionStatus === "claimed" || session.executionStatus === "running") && presentCount !== ownershipFields.length) {
    return [
      blocker(
        "ownership_shape_inconsistent",
        session,
        "Claimed or running execution session requires owner, token, and lease evidence.",
      ),
    ];
  }

  if (
    session.executionStatus !== "prepared" &&
    session.executionStatus !== "claimed" &&
    session.executionStatus !== "running" &&
    presentCount !== 0 &&
    presentCount !== ownershipFields.length
  ) {
    return [
      blocker(
        "ownership_shape_inconsistent",
        session,
        "Execution session ownership fields are partially populated.",
      ),
    ];
  }

  if (session.leaseExpiresAt && !isValidIsoDate(session.leaseExpiresAt)) {
    return [
      blocker(
        "ownership_shape_inconsistent",
        session,
        "Execution session lease expiration is malformed.",
      ),
    ];
  }

  return [];
}
function validateItemCompleteness(
  command: DeploymentActivationExecutionClaimCommand,
  session: DeploymentActivationExecutionClaimSessionSnapshot,
  items: DeploymentActivationExecutionClaimItemCompletenessSnapshot,
): DeploymentActivationExecutionClaimIssue[] {
  const issues: DeploymentActivationExecutionClaimIssue[] = [];

  if (!hasCompleteItemCount(command, session, items)) {
    issues.push(blocker("incomplete_item_set", session, "Durable execution item count does not match execution session evidence."));
  }

  if (
    items.duplicateExecutionItemKeyCount > 0 ||
    items.duplicatePlanItemKeyCount > 0 ||
    items.duplicateSequenceCount > 0
  ) {
    issues.push(blocker("duplicate_item_identity", session, "Duplicate durable execution item identities prevent claiming."));
  }

  if (issues.length === 0 && isStrictPreExecutionItemSet(session, items)) {
    return [];
  }

  if (issues.length === 0 && session.executionStatus === "running" && isCompatibleRunningItemSet(session, items)) {
    return [];
  }

  if (!hasCompleteLifecyclePartition(session, items)) {
    issues.push(blocker("incomplete_item_set", session, "Durable execution item lifecycle counts do not match execution session evidence."));
  }

  if (hasInvalidLifecycleEvidence(session, items)) {
    issues.push(blocker("invalid_item_lifecycle", session, lifecycleMessage(session)));
  }

  if (hasUnexpectedAttemptEvidence(session, items)) {
    issues.push(blocker("attempt_evidence_present", session, "Execution item attempt evidence is not claim-safe for this lifecycle."));
  }

  if (hasUnexpectedExecutionTimestampEvidence(session, items)) {
    issues.push(blocker("execution_timestamp_present", session, "Execution item timestamp evidence is not claim-safe for this lifecycle."));
  }

  if (hasUnexpectedRollbackTimestampEvidence(session, items)) {
    issues.push(blocker("rollback_timestamp_present", session, "Execution items already have rollback timestamps."));
  }

  if (hasUnexpectedItemErrorEvidence(session, items)) {
    issues.push(blocker("item_error_present", session, "Execution items already have error evidence."));
  }

  if (hasDependencyIntegrityIssue(session, items)) {
    issues.push(blocker("dependency_integrity_invalid", session, dependencyMessage(session)));
  }

  return issues;
}

function hasCompleteItemCount(
  command: DeploymentActivationExecutionClaimCommand,
  session: DeploymentActivationExecutionClaimSessionSnapshot,
  items: DeploymentActivationExecutionClaimItemCompletenessSnapshot,
): boolean {
  return (
    items.durableItemCount === session.itemsRequested &&
    items.durableItemCount === command.expectedItemCount &&
    session.itemsRequested === command.expectedItemCount
  );
}

function isStrictPreExecutionItemSet(
  session: DeploymentActivationExecutionClaimSessionSnapshot,
  items: DeploymentActivationExecutionClaimItemCompletenessSnapshot,
): boolean {
  return (
    items.readyItemCount + items.pendingItemCount === session.itemsRequested &&
    items.invalidPreparedItemCount === 0 &&
    items.runningOrTerminalItemCount === 0 &&
    items.blockedItemCount === 0 &&
    items.itemsWithAttempts === 0 &&
    items.itemsWithExecutionTimestamps === 0 &&
    items.itemsWithRollbackTimestamps === 0 &&
    items.itemsWithErrors === 0 &&
    items.readyItemCount >= 1 &&
    items.readyRootItemCount === 1 &&
    items.firstExecutableStatus === "ready" &&
    items.firstExecutableSequence !== null &&
    items.pendingExecutableWithoutSatisfiedDependencies === 0 &&
    items.dependencyIntegrityIssueCount === 0
  );
}

function isCompatibleRunningItemSet(
  session: DeploymentActivationExecutionClaimSessionSnapshot,
  items: DeploymentActivationExecutionClaimItemCompletenessSnapshot,
): boolean {
  return (
    items.runningItemCount === 1 &&
    items.terminalItemCount === 0 &&
    items.readyItemCount === 0 &&
    items.pendingItemCount === session.itemsRequested - 1 &&
    items.blockedItemCount === 0 &&
    items.firstExecutableStatus === "running" &&
    items.firstExecutableSequence !== null &&
    items.runningItemsWithAttemptOne === 1 &&
    items.runningItemsWithValidStartedAt === 1 &&
    items.runningItemsWithCompletionEvidence === 0 &&
    items.itemsWithAttempts === 1 &&
    items.itemsWithExecutionTimestamps === 1 &&
    items.itemsWithRollbackTimestamps === 0 &&
    items.itemsWithErrors === 0 &&
    items.pendingItemsWithAttempts === 0 &&
    items.pendingItemsWithExecutionTimestamps === 0 &&
    items.pendingItemsWithRollbackTimestamps === 0 &&
    items.pendingItemsWithErrors === 0 &&
    items.dependencyIntegrityIssueCount === 0
  );
}

function hasCompleteLifecyclePartition(
  session: DeploymentActivationExecutionClaimSessionSnapshot,
  items: DeploymentActivationExecutionClaimItemCompletenessSnapshot,
): boolean {
  if (session.executionStatus === "running") {
    return items.readyItemCount + items.pendingItemCount + items.runningItemCount === session.itemsRequested;
  }

  return items.readyItemCount + items.pendingItemCount === session.itemsRequested;
}

function hasInvalidLifecycleEvidence(
  session: DeploymentActivationExecutionClaimSessionSnapshot,
  items: DeploymentActivationExecutionClaimItemCompletenessSnapshot,
): boolean {
  if (session.executionStatus === "running") {
    return (
      items.runningItemCount !== 1 ||
      items.terminalItemCount > 0 ||
      items.readyItemCount > 0 ||
      items.blockedItemCount > 0 ||
      items.firstExecutableStatus !== "running"
    );
  }

  return (
    items.invalidPreparedItemCount > 0 ||
    items.runningOrTerminalItemCount > 0 ||
    items.blockedItemCount > 0
  );
}

function hasUnexpectedAttemptEvidence(
  session: DeploymentActivationExecutionClaimSessionSnapshot,
  items: DeploymentActivationExecutionClaimItemCompletenessSnapshot,
): boolean {
  if (session.executionStatus === "running") {
    return (
      items.runningItemsWithAttemptOne !== 1 ||
      items.itemsWithAttempts !== 1 ||
      items.pendingItemsWithAttempts > 0
    );
  }

  return items.itemsWithAttempts > 0;
}

function hasUnexpectedExecutionTimestampEvidence(
  session: DeploymentActivationExecutionClaimSessionSnapshot,
  items: DeploymentActivationExecutionClaimItemCompletenessSnapshot,
): boolean {
  if (session.executionStatus === "running") {
    return (
      items.runningItemsWithValidStartedAt !== 1 ||
      items.runningItemsWithCompletionEvidence > 0 ||
      items.itemsWithExecutionTimestamps !== 1 ||
      items.pendingItemsWithExecutionTimestamps > 0
    );
  }

  return items.itemsWithExecutionTimestamps > 0;
}

function hasUnexpectedRollbackTimestampEvidence(
  session: DeploymentActivationExecutionClaimSessionSnapshot,
  items: DeploymentActivationExecutionClaimItemCompletenessSnapshot,
): boolean {
  if (session.executionStatus === "running") {
    return items.itemsWithRollbackTimestamps > 0 || items.pendingItemsWithRollbackTimestamps > 0;
  }

  return items.itemsWithRollbackTimestamps > 0;
}

function hasUnexpectedItemErrorEvidence(
  session: DeploymentActivationExecutionClaimSessionSnapshot,
  items: DeploymentActivationExecutionClaimItemCompletenessSnapshot,
): boolean {
  if (session.executionStatus === "running") {
    return items.itemsWithErrors > 0 || items.pendingItemsWithErrors > 0;
  }

  return items.itemsWithErrors > 0;
}

function hasDependencyIntegrityIssue(
  session: DeploymentActivationExecutionClaimSessionSnapshot,
  items: DeploymentActivationExecutionClaimItemCompletenessSnapshot,
): boolean {
  if (session.executionStatus === "running") {
    return items.dependencyIntegrityIssueCount > 0;
  }

  return (
    items.readyItemCount < 1 ||
    items.readyRootItemCount !== 1 ||
    items.firstExecutableStatus !== "ready" ||
    items.firstExecutableSequence === null ||
    items.pendingExecutableWithoutSatisfiedDependencies > 0 ||
    items.dependencyIntegrityIssueCount > 0
  );
}

function lifecycleMessage(
  session: DeploymentActivationExecutionClaimSessionSnapshot,
): string {
  return session.executionStatus === "running"
    ? "Running execution session item lifecycle is not compatible with same-owner reuse."
    : "Execution items are not all ready or pending pre-execution items.";
}

function dependencyMessage(
  session: DeploymentActivationExecutionClaimSessionSnapshot,
): string {
  return session.executionStatus === "running"
    ? "Running execution session item dependency evidence is malformed."
    : "Execution dependency readiness is not claim-safe.";
}
type LeaseState =
  | "unowned"
  | "active-same-owner"
  | "active-other-owner"
  | "expired";

function readLeaseState(
  command: DeploymentActivationExecutionClaimCommand,
  session: DeploymentActivationExecutionClaimSessionSnapshot,
): LeaseState {
  if (!session.executionOwner || !session.ownershipToken || !session.leaseExpiresAt) {
    return "unowned";
  }

  const active =
    new Date(session.leaseExpiresAt).getTime() >
    new Date(command.claimRequestedAt).getTime();

  if (!active) {
    return "expired";
  }

  return session.executionOwner === command.claimantId
    ? "active-same-owner"
    : "active-other-owner";
}

function buildResult(input: {
  status: DeploymentActivationExecutionClaimStatus;
  command: DeploymentActivationExecutionClaimCommand;
  session: DeploymentActivationExecutionClaimSessionSnapshot | null;
  itemCompleteness: DeploymentActivationExecutionClaimItemCompletenessSnapshot;
  issues: readonly DeploymentActivationExecutionClaimIssue[];
  message: string;
  proposedOwnershipToken?: string | null;
  proposedLeaseStartedAt?: string | null;
  proposedLeaseExpiresAt?: string | null;
}): DeploymentActivationExecutionClaimResult {
  const issues = [...input.issues].sort(compareIssues);

  return {
    ok:
      input.status === "claimable" ||
      input.status === "already_owned" ||
      input.status === "lease_expired_reclaimable",
    status: input.status,
    sessionId: input.session?.id ?? input.command.sessionId ?? null,
    executionKey: input.session?.executionKey ?? input.command.executionKey ?? null,
    claimantId: input.command.claimantId || null,
    proposedOwnershipToken: input.proposedOwnershipToken ?? null,
    proposedLeaseStartedAt: input.proposedLeaseStartedAt ?? null,
    proposedLeaseExpiresAt: input.proposedLeaseExpiresAt ?? null,
    leaseDurationSeconds: input.command.leaseDurationSeconds,
    existingOwner: input.session?.executionOwner ?? null,
    existingLeaseExpiresAt: input.session?.leaseExpiresAt ?? null,
    itemCompleteness: cloneClaimItemCompleteness(input.itemCompleteness),
    blockers: issues.filter((current) => current.severity === "blocker").length,
    warnings: issues.filter((current) => current.severity === "warning").length,
    issues,
    downstream: zeroDownstream(),
    message: input.message,
  };
}

function standardWarnings(
  command: DeploymentActivationExecutionClaimCommand,
  session: DeploymentActivationExecutionClaimSessionSnapshot,
): DeploymentActivationExecutionClaimIssue[] {
  return [
    issue({
      code: "rollback_unimplemented",
      severity: "warning",
      sessionId: session.id,
      executionKey: command.executionKey,
      message:
        "Rollback execution remains unavailable; claim evidence is proposal-only.",
    }),
    issue({
      code: "execution_mutation_unavailable",
      severity: "warning",
      sessionId: session.id,
      executionKey: command.executionKey,
      message:
        "Execution mutation is not implemented in this slice.",
    }),
  ];
}

function addIdentityIssue(
  issues: DeploymentActivationExecutionClaimIssue[],
  condition: boolean,
  code: DeploymentActivationExecutionClaimIssueCode,
  command: DeploymentActivationExecutionClaimCommand,
  message: string,
): void {
  if (condition) {
    issues.push(
      issue({
        code,
        severity: "blocker",
        sessionId: command.sessionId,
        executionKey: command.executionKey,
        message,
      }),
    );
  }
}

function statusForBlockedIssues(
  issues: readonly DeploymentActivationExecutionClaimIssue[],
): "blocked" | "conflict" {
  return issues.some(
    (current) =>
      current.code === "clinic_identity_mismatch" ||
      current.code === "deployment_run_identity_mismatch" ||
      current.code === "session_identity_mismatch" ||
      current.code === "execution_key_mismatch" ||
      current.code === "plan_key_mismatch" ||
      current.code === "ownership_shape_inconsistent",
  )
    ? "conflict"
    : "blocked";
}

function blocker(
  code: DeploymentActivationExecutionClaimIssueCode,
  session: DeploymentActivationExecutionClaimSessionSnapshot,
  message: string,
): DeploymentActivationExecutionClaimIssue {
  return issue({
    code,
    severity: "blocker",
    sessionId: session.id,
    executionKey: session.executionKey,
    message,
  });
}

function issue(input: {
  code: DeploymentActivationExecutionClaimIssueCode;
  severity: DeploymentActivationExecutionClaimIssueSeverity;
  sessionId: string | null;
  executionKey: string | null;
  message: string;
}): DeploymentActivationExecutionClaimIssue {
  return {
    code: input.code,
    severity: input.severity,
    sessionId: input.sessionId,
    executionKey: input.executionKey,
    message: input.message,
  };
}

function hasBlocker(
  issues: readonly DeploymentActivationExecutionClaimIssue[],
): boolean {
  return issues.some((current) => current.severity === "blocker");
}

function isValidIsoDate(value: string): boolean {
  return Number.isFinite(Date.parse(value));
}

function addSeconds(value: string, seconds: number): string {
  return new Date(new Date(value).getTime() + seconds * 1000).toISOString();
}

function compareIssues(
  left: DeploymentActivationExecutionClaimIssue,
  right: DeploymentActivationExecutionClaimIssue,
): number {
  return (
    left.severity.localeCompare(right.severity) ||
    left.code.localeCompare(right.code) ||
    String(left.sessionId ?? "").localeCompare(String(right.sessionId ?? "")) ||
    String(left.executionKey ?? "").localeCompare(String(right.executionKey ?? ""))
  );
}

function deterministicOwnershipTokenFactory(
  input: Parameters<DeploymentActivationExecutionClaimTokenFactory>[0],
): string {
  return [
    "claim",
    input.sessionId,
    input.claimantId,
    input.claimRequestedAt.replace(/[^0-9A-Za-z]+/g, ""),
  ].join(":");
}

function zeroDownstream(): DeploymentActivationExecutionClaimDownstreamCounts {
  return {
    sessionsClaimed: 0,
    sessionsStarted: 0,
    itemsClaimed: 0,
    itemsStarted: 0,
    itemsSucceeded: 0,
    itemsFailed: 0,
    itemsRolledBack: 0,
    entitiesActivated: 0,
    bindingsWritten: 0,
    deploymentRunsFinalized: 0,
  };
}
