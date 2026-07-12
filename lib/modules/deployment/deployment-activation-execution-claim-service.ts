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
              "Prepared activation execution session was not found.",
          }),
        ],
        message:
          "Activation execution claim assessment found no prepared session to claim.",
      });
    }

    const issues = [
      ...validateIdentity(command, session),
      ...validatePreparedLifecycle(session),
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
          "Activation execution claim assessment blocked ownership because prepared evidence is not claim-safe.",
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
          "Prepared activation execution session is claimable. No ownership was persisted.",
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
          "Prepared activation execution session already has an active lease for this claimant. No renewal was persisted.",
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
              "Prepared activation execution session has an active lease owned by another executor.",
          }),
        ],
        message:
          "Activation execution claim assessment found an active lease owned by another executor.",
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
            "Existing lease is expired and prepared evidence remains untouched; reclaim is proposal-only.",
        }),
        ...standardWarnings(command, session),
      ],
      message:
        "Prepared activation execution session has an expired lease and untouched evidence, so a future atomic reclaim may be safe.",
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
    "Prepared session clinic does not match the claim request.",
  );
  addIdentityIssue(
    issues,
    session.deploymentRunId !== command.deploymentRunId,
    "deployment_run_identity_mismatch",
    command,
    "Prepared session deployment run does not match the claim request.",
  );
  addIdentityIssue(
    issues,
    session.id !== command.sessionId,
    "session_identity_mismatch",
    command,
    "Prepared session id does not match the claim request.",
  );
  addIdentityIssue(
    issues,
    session.executionKey !== command.executionKey,
    "execution_key_mismatch",
    command,
    "Prepared session execution key does not match the claim request.",
  );
  addIdentityIssue(
    issues,
    session.planKey !== command.planKey,
    "plan_key_mismatch",
    command,
    "Prepared session plan key does not match the claim request.",
  );

  return issues;
}

function validatePreparedLifecycle(
  session: DeploymentActivationExecutionClaimSessionSnapshot,
): DeploymentActivationExecutionClaimIssue[] {
  const issues: DeploymentActivationExecutionClaimIssue[] = [];

  if (session.preparationStatus !== "ready") {
    issues.push(blocker("preparation_not_ready", session, "Prepared session preparation status is not ready."));
  }

  if (session.executionStatus !== "prepared") {
    issues.push(blocker("execution_status_not_claimable", session, "Prepared session execution status is not claimable."));
  }

  if (session.blockers > 0 || session.itemsBlocked > 0) {
    issues.push(blocker("session_blockers_present", session, "Prepared session has blockers or blocked items."));
  }

  if (session.startedAt || session.completedAt || session.failedAt) {
    issues.push(blocker("session_timestamp_present", session, "Prepared session has execution lifecycle timestamps."));
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

  if (presentCount !== 0 && presentCount !== ownershipFields.length) {
    return [
      blocker(
        "ownership_shape_inconsistent",
        session,
        "Prepared session ownership fields are partially populated.",
      ),
    ];
  }

  if (session.leaseExpiresAt && !isValidIsoDate(session.leaseExpiresAt)) {
    return [
      blocker(
        "ownership_shape_inconsistent",
        session,
        "Prepared session lease expiration is malformed.",
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

  if (
    items.durableItemCount !== session.itemsRequested ||
    items.durableItemCount !== command.expectedItemCount ||
    session.itemsRequested !== command.expectedItemCount ||
    items.readyItemCount + items.pendingItemCount !== session.itemsRequested
  ) {
    issues.push(blocker("incomplete_item_set", session, "Durable execution item count does not match prepared session evidence."));
  }

  if (
    items.duplicateExecutionItemKeyCount > 0 ||
    items.duplicatePlanItemKeyCount > 0 ||
    items.duplicateSequenceCount > 0
  ) {
    issues.push(blocker("duplicate_item_identity", session, "Duplicate durable execution item identities prevent claiming."));
  }

  if (
    items.invalidPreparedItemCount > 0 ||
    items.runningOrTerminalItemCount > 0 ||
    items.blockedItemCount > 0
  ) {
    issues.push(blocker("invalid_item_lifecycle", session, "Execution items are not all ready or pending prepared items."));
  }

  if (items.itemsWithAttempts > 0) {
    issues.push(blocker("attempt_evidence_present", session, "Execution items already have attempt evidence."));
  }

  if (items.itemsWithExecutionTimestamps > 0) {
    issues.push(blocker("execution_timestamp_present", session, "Execution items already have execution timestamps."));
  }

  if (items.itemsWithRollbackTimestamps > 0) {
    issues.push(blocker("rollback_timestamp_present", session, "Execution items already have rollback timestamps."));
  }

  if (items.itemsWithErrors > 0) {
    issues.push(blocker("item_error_present", session, "Execution items already have error evidence."));
  }

  if (
    items.readyItemCount < 1 ||
    items.readyRootItemCount !== 1 ||
    items.firstExecutableStatus !== "ready" ||
    items.firstExecutableSequence === null ||
    items.pendingExecutableWithoutSatisfiedDependencies > 0 ||
    items.dependencyIntegrityIssueCount > 0
  ) {
    issues.push(blocker("dependency_integrity_invalid", session, "Prepared execution dependency readiness is not claim-safe."));
  }

  return issues;
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
  const timestamp = Date.parse(value);

  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value;
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
