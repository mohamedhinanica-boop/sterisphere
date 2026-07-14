import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getServerDeploymentActivationExecutionClaimOwnershipToken,
  SETUP_RUNTIME_ACTIVATION_EXECUTION_CLAIMANT_ID,
  type ServerDeploymentActivationExecutionClaimResult,
} from "./deployment-activation-execution-claim-server";
import type {
  DeploymentActivationExecutionStartRepository,
} from "./deployment-activation-execution-start-repository";
import {
  DeploymentActivationExecutionStartService,
} from "./deployment-activation-execution-start-service";
import {
  SupabaseDeploymentActivationExecutionStartRepository,
} from "./deployment-activation-execution-start-supabase-repository";
import {
  cloneStartItemIntegrity,
  cloneStartSessionSnapshot,
  emptyStartItemIntegrity,
  type DeploymentActivationExecutionAtomicStartCommand,
  type DeploymentActivationExecutionAtomicStartResult,
  type DeploymentActivationExecutionStartDownstreamCounts,
  type DeploymentActivationExecutionStartIssue,
  type DeploymentActivationExecutionStartResult,
  type DeploymentActivationExecutionStartSnapshot,
} from "./deployment-activation-execution-start-types";

export type ServerDeploymentActivationExecutionStartStatus =
  | "started"
  | "already_started"
  | "blocked"
  | "conflict"
  | "error"
  | "not_attempted";

export interface ServerDeploymentActivationExecutionStartCommand {
  clinicId: string;
  deploymentRunId: string;
  deploymentActivationExecutionClaim:
    | ServerDeploymentActivationExecutionClaimResult
    | null;
  startRequestedAt?: string | null;
}

export interface ServerDeploymentActivationExecutionStartResult {
  ok: boolean;
  status: ServerDeploymentActivationExecutionStartStatus;
  sessionId: string | null;
  executionKey: string | null;
  planKey: string | null;
  claimantId: string | null;
  startedAt: string | null;
  leaseExpiresAt: string | null;
  startResult:
    | "started"
    | "already_started"
    | "blocked"
    | "conflict"
    | "not_found"
    | "error"
    | null;
  startedCount: 0 | 1;
  reusedCount: 0 | 1;
  conflicts: number;
  blockers: number;
  warnings: number;
  issues: readonly DeploymentActivationExecutionStartIssue[];
  downstream: DeploymentActivationExecutionStartDownstreamCounts;
  message: string;
}

export interface DeploymentActivationExecutionAtomicStartRepository
  extends DeploymentActivationExecutionStartRepository {
  startClaimedExecutionSessionAtomically(
    command: DeploymentActivationExecutionAtomicStartCommand,
  ): Promise<DeploymentActivationExecutionAtomicStartResult>;
}

export interface StartActivationExecutionWithRepositoryOptions {
  claimantId?: string;
  ownershipTokenResolver?: (
    claim: ServerDeploymentActivationExecutionClaimResult,
  ) => string | null;
}

export async function startActivationExecutionForServerDeployment(
  client: SupabaseClient,
  command: ServerDeploymentActivationExecutionStartCommand,
): Promise<ServerDeploymentActivationExecutionStartResult> {
  return startActivationExecutionWithRepository(
    new SupabaseDeploymentActivationExecutionStartRepository(client),
    command,
  );
}

export async function startActivationExecutionWithRepository(
  repository: DeploymentActivationExecutionAtomicStartRepository,
  command: ServerDeploymentActivationExecutionStartCommand,
  options: StartActivationExecutionWithRepositoryOptions = {},
): Promise<ServerDeploymentActivationExecutionStartResult> {
  const prerequisite = validatePrerequisite(command, options);

  if (!prerequisite.ok) {
    return prerequisite.result;
  }

  const startCommand = prerequisite.startCommand;

  try {
    const snapshot = await repository.loadExecutionStartSnapshot({
      clinicId: startCommand.clinicId,
      deploymentRunId: startCommand.deploymentRunId,
      sessionId: startCommand.sessionId,
      executionKey: startCommand.executionKey,
    });
    const stableSnapshot = cloneSnapshot(snapshot);
    const service = new DeploymentActivationExecutionStartService(
      createStaticStartSnapshotRepository(stableSnapshot),
    );
    const assessment = await service.assessStart(startCommand);
    const publicIssues = filterRuntimeIssues(assessment.issues);

    if (assessment.status === "already_started") {
      return {
        ...baseResult(startCommand, assessment.planKey),
        ok: true,
        status: "already_started",
        startedAt: stableSnapshot.session?.startedAt ?? null,
        leaseExpiresAt: assessment.currentLeaseExpiresAt,
        startResult: "already_started",
        reusedCount: 1,
        warnings: warningCount(publicIssues),
        issues: publicIssues,
        message:
          "Existing running execution session was reused. Existing item lifecycle evidence was preserved without starting another item.",
      };
    }

    if (assessment.status === "blocked" || assessment.status === "conflict") {
      return {
        ...baseResult(startCommand, assessment.planKey),
        ok: false,
        status: assessment.status,
        leaseExpiresAt: assessment.currentLeaseExpiresAt,
        conflicts: assessment.status === "conflict" ? 1 : 0,
        blockers: blockerCount(publicIssues),
        warnings: warningCount(publicIssues),
        issues: publicIssues,
        message: assessment.message,
      };
    }

    if (assessment.status === "error") {
      return safeError(
        startCommand,
        assessment.planKey,
        "Activation execution start assessment failed safely. No fallback mutation was attempted.",
        publicIssues,
      );
    }

    const atomicCommand = buildAtomicCommand(startCommand, assessment);

    if (!atomicCommand.ok) {
      return atomicCommand.result;
    }

    const atomicResult = await repository.startClaimedExecutionSessionAtomically(
      atomicCommand.command,
    );

    return mapAtomicResult(startCommand, assessment, atomicResult, publicIssues);
  } catch {
    return safeError(
      startCommand,
      null,
      "Activation execution start failed safely. No fallback mutation was attempted.",
    );
  }
}

function validatePrerequisite(
  command: ServerDeploymentActivationExecutionStartCommand,
  options: StartActivationExecutionWithRepositoryOptions,
):
  | { ok: true; startCommand: Parameters<DeploymentActivationExecutionStartService["assessStart"]>[0] }
  | { ok: false; result: ServerDeploymentActivationExecutionStartResult } {
  const claim = command.deploymentActivationExecutionClaim;
  const claimantId =
    options.claimantId ?? SETUP_RUNTIME_ACTIVATION_EXECUTION_CLAIMANT_ID;

  if (
    !claim?.ok ||
    !["claimed", "already_owned", "reclaimed"].includes(claim.status) ||
    !claim.sessionId ||
    !claim.executionKey ||
    !claim.planKey ||
    !claim.claimantId ||
    !claim.leaseExpiresAt
  ) {
    return {
      ok: false,
      result: {
        ...emptyResult({
          sessionId: claim?.sessionId ?? null,
          executionKey: claim?.executionKey ?? null,
          planKey: claim?.planKey ?? null,
          claimantId: claim?.claimantId ?? claimantId,
        }),
        message:
          "Activation execution start was skipped because ownership claim did not complete successfully.",
      },
    };
  }

  const ownershipToken =
    options.ownershipTokenResolver?.(claim) ??
    getServerDeploymentActivationExecutionClaimOwnershipToken(claim);

  if (!ownershipToken) {
    return {
      ok: false,
      result: {
        ...emptyResult({
          sessionId: claim.sessionId,
          executionKey: claim.executionKey,
          planKey: claim.planKey,
          claimantId: claim.claimantId,
        }),
        status: "error",
        blockers: 1,
        issues: [
          issue(
            "repository_error",
            claim.sessionId,
            claim.executionKey,
            "Activation execution start could not access server-only ownership evidence.",
          ),
        ],
        message:
          "Activation execution start failed safely because server-only ownership evidence was unavailable.",
      },
    };
  }

  return {
    ok: true,
    startCommand: {
      clinicId: command.clinicId,
      deploymentRunId: command.deploymentRunId,
      sessionId: claim.sessionId,
      executionKey: claim.executionKey,
      claimantId: claim.claimantId,
      ownershipToken,
      currentTimestamp: command.startRequestedAt ?? new Date().toISOString(),
    },
  };
}

function buildAtomicCommand(
  command: Parameters<DeploymentActivationExecutionStartService["assessStart"]>[0],
  assessment: DeploymentActivationExecutionStartResult,
):
  | { ok: true; command: DeploymentActivationExecutionAtomicStartCommand }
  | { ok: false; result: ServerDeploymentActivationExecutionStartResult } {
  if (
    assessment.status !== "startable" ||
    !assessment.currentLeaseExpiresAt ||
    !assessment.proposedStartedAt ||
    assessment.itemsRequested < 1
  ) {
    return {
      ok: false,
      result: safeError(
        command,
        assessment.planKey,
        "Activation execution start assessment did not produce complete atomic start evidence.",
      ),
    };
  }

  return {
    ok: true,
    command: {
      clinicId: command.clinicId,
      deploymentRunId: command.deploymentRunId,
      sessionId: command.sessionId,
      executionKey: command.executionKey,
      claimantId: command.claimantId,
      ownershipToken: command.ownershipToken,
      expectedLeaseExpiresAt: assessment.currentLeaseExpiresAt,
      proposedStartedAt: assessment.proposedStartedAt,
      expectedItemCount: assessment.itemsRequested,
    },
  };
}

function mapAtomicResult(
  command: Parameters<DeploymentActivationExecutionStartService["assessStart"]>[0],
  assessment: DeploymentActivationExecutionStartResult,
  result: DeploymentActivationExecutionAtomicStartResult,
  assessmentIssues: readonly DeploymentActivationExecutionStartIssue[],
): ServerDeploymentActivationExecutionStartResult {
  if (result.status === "started") {
    return {
      ...baseResult(command, assessment.planKey),
      ok: true,
      status: "started",
      startedAt: result.startedAt ?? assessment.proposedStartedAt,
      leaseExpiresAt: result.leaseExpiresAt ?? assessment.currentLeaseExpiresAt,
      startResult: result.status,
      startedCount: 1,
      warnings: warningCount(assessmentIssues),
      issues: assessmentIssues,
      message:
        "Execution session is running under exclusive ownership. No activation item has started.",
    };
  }

  if (result.status === "already_started") {
    return {
      ...baseResult(command, assessment.planKey),
      ok: true,
      status: "already_started",
      startedAt: result.startedAt,
      leaseExpiresAt: result.leaseExpiresAt ?? assessment.currentLeaseExpiresAt,
      startResult: result.status,
      reusedCount: 1,
      warnings: warningCount(assessmentIssues),
      issues: assessmentIssues,
      message:
        "Existing running execution session was reused. Existing item lifecycle evidence was preserved without starting another item.",
    };
  }

  const status = result.status === "conflict" ? "conflict" : result.status === "error" ? "error" : "blocked";
  const atomicIssue = issue(
    result.status === "not_found" ? "missing_session" : result.status === "conflict" ? "ownership_token_mismatch" : "repository_error",
    command.sessionId,
    command.executionKey,
    result.issueCode
      ? `Atomic execution-start RPC returned ${result.issueCode}.`
      : "Atomic execution-start RPC did not start the execution session.",
  );
  const issues = [...assessmentIssues, atomicIssue];

  return {
    ...baseResult(command, assessment.planKey),
    ok: false,
    status,
    leaseExpiresAt: result.leaseExpiresAt ?? assessment.currentLeaseExpiresAt,
    startResult: result.status,
    conflicts: status === "conflict" ? 1 : 0,
    blockers: blockerCount(issues) || 1,
    warnings: warningCount(issues),
    issues,
    message:
      result.message ||
      "Activation execution atomic start did not complete. No item execution began.",
  };
}

function baseResult(
  command: Parameters<DeploymentActivationExecutionStartService["assessStart"]>[0],
  planKey: string | null,
): ServerDeploymentActivationExecutionStartResult {
  return emptyResult({
    sessionId: command.sessionId,
    executionKey: command.executionKey,
    planKey,
    claimantId: command.claimantId,
  });
}

function emptyResult(input: {
  sessionId: string | null;
  executionKey: string | null;
  planKey: string | null;
  claimantId: string | null;
}): ServerDeploymentActivationExecutionStartResult {
  return {
    ok: false,
    status: "not_attempted",
    sessionId: input.sessionId,
    executionKey: input.executionKey,
    planKey: input.planKey,
    claimantId: input.claimantId,
    startedAt: null,
    leaseExpiresAt: null,
    startResult: null,
    startedCount: 0,
    reusedCount: 0,
    conflicts: 0,
    blockers: 0,
    warnings: 0,
    issues: [],
    downstream: zeroDownstream(),
    message: "Activation execution start was not attempted.",
  };
}

function safeError(
  command: Parameters<DeploymentActivationExecutionStartService["assessStart"]>[0],
  planKey: string | null,
  message: string,
  issues: readonly DeploymentActivationExecutionStartIssue[] = [],
): ServerDeploymentActivationExecutionStartResult {
  const safeIssues = issues.length
    ? issues
    : [
        issue(
          "repository_error",
          command.sessionId,
          command.executionKey,
          "Activation execution start repository failed safely.",
        ),
      ];

  return {
    ...baseResult(command, planKey),
    status: "error",
    blockers: blockerCount(safeIssues) || 1,
    warnings: warningCount(safeIssues),
    issues: safeIssues,
    message,
  };
}

function filterRuntimeIssues(
  issues: readonly DeploymentActivationExecutionStartIssue[],
): DeploymentActivationExecutionStartIssue[] {
  return issues.filter((current) => current.code !== "start_persistence_unimplemented");
}

function blockerCount(
  issues: readonly DeploymentActivationExecutionStartIssue[],
): number {
  return issues.filter((current) => current.severity === "blocker").length;
}

function warningCount(
  issues: readonly DeploymentActivationExecutionStartIssue[],
): number {
  return issues.filter((current) => current.severity === "warning").length;
}

function issue(
  code: DeploymentActivationExecutionStartIssue["code"],
  sessionId: string | null,
  executionKey: string | null,
  message: string,
): DeploymentActivationExecutionStartIssue {
  return {
    code,
    severity: "blocker",
    sessionId,
    executionKey,
    message,
  };
}

function createStaticStartSnapshotRepository(
  snapshot: DeploymentActivationExecutionStartSnapshot,
): DeploymentActivationExecutionStartRepository {
  return {
    async loadExecutionStartSnapshot() {
      return cloneSnapshot(snapshot);
    },
  };
}

function cloneSnapshot(
  snapshot: DeploymentActivationExecutionStartSnapshot,
): DeploymentActivationExecutionStartSnapshot {
  return {
    session: snapshot.session ? cloneStartSessionSnapshot(snapshot.session) : null,
    itemIntegrity: cloneStartItemIntegrity(
      snapshot.itemIntegrity ?? emptyStartItemIntegrity(),
    ),
  };
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
