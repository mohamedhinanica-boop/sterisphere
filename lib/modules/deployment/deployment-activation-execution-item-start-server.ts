import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getServerDeploymentActivationExecutionClaimOwnershipToken,
  SETUP_RUNTIME_ACTIVATION_EXECUTION_CLAIMANT_ID,
  type ServerDeploymentActivationExecutionClaimResult,
} from "./deployment-activation-execution-claim-server";
import type {
  ServerDeploymentActivationExecutionStartResult,
} from "./deployment-activation-execution-start-server";
import type {
  DeploymentActivationExecutionItemStartRepository,
} from "./deployment-activation-execution-item-start-repository";
import {
  DeploymentActivationExecutionItemStartService,
} from "./deployment-activation-execution-item-start-service";
import {
  SupabaseDeploymentActivationExecutionItemStartRepository,
} from "./deployment-activation-execution-item-start-supabase-repository";
import {
  cloneItemStartAggregate,
  cloneItemStartCandidate,
  cloneItemStartSession,
  emptyItemStartAggregate,
  type DeploymentActivationExecutionAtomicItemStartCommand,
  type DeploymentActivationExecutionAtomicItemStartResult,
  type DeploymentActivationExecutionItemStartDownstreamCounts,
  type DeploymentActivationExecutionItemStartIssue,
  type DeploymentActivationExecutionItemStartResult,
  type DeploymentActivationExecutionItemStartSnapshot,
} from "./deployment-activation-execution-item-start-types";

export type ServerDeploymentActivationExecutionItemStartStatus =
  | "started"
  | "already_started"
  | "blocked"
  | "conflict"
  | "not_found"
  | "error"
  | "not_attempted";

export interface ServerDeploymentActivationExecutionItemStartCommand {
  clinicId: string;
  deploymentRunId: string;
  deploymentActivationExecutionClaim:
    | ServerDeploymentActivationExecutionClaimResult
    | null;
  deploymentActivationExecutionStart:
    | ServerDeploymentActivationExecutionStartResult
    | null;
  itemStartRequestedAt?: string | null;
}

export interface ServerDeploymentActivationExecutionItemStartResult {
  ok: boolean;
  status: ServerDeploymentActivationExecutionItemStartStatus;
  claimantId: string | null;
  sessionId: string | null;
  executionKey: string | null;
  itemId: string | null;
  executionItemKey: string | null;
  planItemKey: string | null;
  sequence: number | null;
  entityType: string | null;
  entityKey: string | null;
  entityId: string | null;
  action: string | null;
  itemExecutionStatus: string | null;
  attemptCount: number;
  startedAt: string | null;
  leaseExpiresAt: string | null;
  dependencyCount: number;
  reversible: boolean | null;
  itemStartResult:
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
  issues: readonly DeploymentActivationExecutionItemStartIssue[];
  downstream: DeploymentActivationExecutionItemStartDownstreamCounts;
  message: string;
}

export interface DeploymentActivationExecutionAtomicItemStartRepository
  extends DeploymentActivationExecutionItemStartRepository {
  startExecutionItemAtomically(
    command: DeploymentActivationExecutionAtomicItemStartCommand,
  ): Promise<DeploymentActivationExecutionAtomicItemStartResult>;
}

export interface StartActivationExecutionItemWithRepositoryOptions {
  claimantId?: string;
  ownershipTokenResolver?: (
    claim: ServerDeploymentActivationExecutionClaimResult,
  ) => string | null;
}

export async function startActivationExecutionItemForServerDeployment(
  client: SupabaseClient,
  command: ServerDeploymentActivationExecutionItemStartCommand,
): Promise<ServerDeploymentActivationExecutionItemStartResult> {
  return startActivationExecutionItemWithRepository(
    new SupabaseDeploymentActivationExecutionItemStartRepository(client),
    command,
  );
}

export async function startActivationExecutionItemWithRepository(
  repository: DeploymentActivationExecutionAtomicItemStartRepository,
  command: ServerDeploymentActivationExecutionItemStartCommand,
  options: StartActivationExecutionItemWithRepositoryOptions = {},
): Promise<ServerDeploymentActivationExecutionItemStartResult> {
  const prerequisite = validatePrerequisite(command, options);

  if (!prerequisite.ok) {
    return prerequisite.result;
  }

  const itemStartCommand = prerequisite.itemStartCommand;

  try {
    const snapshot = await repository.loadExecutionItemStartSnapshot({
      clinicId: itemStartCommand.clinicId,
      deploymentRunId: itemStartCommand.deploymentRunId,
      sessionId: itemStartCommand.sessionId,
      executionKey: itemStartCommand.executionKey,
    });
    const stableSnapshot = cloneSnapshot(snapshot);
    const service = new DeploymentActivationExecutionItemStartService(
      createStaticItemStartSnapshotRepository(stableSnapshot),
    );
    const assessment = await service.assessItemStart(itemStartCommand);
    const publicIssues = filterRuntimeIssues(assessment.issues);

    if (assessment.status === "already_started") {
      return {
        ...baseResult(itemStartCommand, assessment),
        ok: true,
        status: "already_started",
        itemStartResult: "already_started",
        reusedCount: 1,
        warnings: warningCount(publicIssues),
        issues: publicIssues,
        message:
          "The existing running execution item was reused. No second item was started and no activation action was executed.",
      };
    }

    if (
      assessment.status === "blocked" ||
      assessment.status === "conflict" ||
      assessment.status === "not_found"
    ) {
      return {
        ...baseResult(itemStartCommand, assessment),
        ok: false,
        status: assessment.status,
        itemStartResult: assessment.status,
        conflicts: assessment.status === "conflict" ? 1 : 0,
        blockers: blockerCount(publicIssues),
        warnings: warningCount(publicIssues),
        issues: publicIssues,
        message: assessment.message,
      };
    }

    if (assessment.status === "error") {
      return safeError(
        itemStartCommand,
        assessment,
        "Activation execution item-start assessment failed safely. No fallback mutation was attempted.",
        publicIssues,
      );
    }

    const atomicCommand = buildAtomicCommand(itemStartCommand, assessment);

    if (!atomicCommand.ok) {
      return atomicCommand.result;
    }

    const atomicResult = await repository.startExecutionItemAtomically(
      atomicCommand.command,
    );

    return mapAtomicResult(
      itemStartCommand,
      assessment,
      atomicResult,
      publicIssues,
    );
  } catch {
    return safeError(
      itemStartCommand,
      null,
      "Activation execution item start failed safely. No fallback mutation was attempted.",
    );
  }
}

function validatePrerequisite(
  command: ServerDeploymentActivationExecutionItemStartCommand,
  options: StartActivationExecutionItemWithRepositoryOptions,
):
  | {
      ok: true;
      itemStartCommand: Parameters<DeploymentActivationExecutionItemStartService["assessItemStart"]>[0];
    }
  | { ok: false; result: ServerDeploymentActivationExecutionItemStartResult } {
  const start = command.deploymentActivationExecutionStart;
  const claim = command.deploymentActivationExecutionClaim;
  const claimantId =
    options.claimantId ?? SETUP_RUNTIME_ACTIVATION_EXECUTION_CLAIMANT_ID;

  if (
    !start?.ok ||
    !["started", "already_started"].includes(start.status) ||
    !start.sessionId ||
    !start.executionKey ||
    !start.claimantId ||
    !start.leaseExpiresAt ||
    !claim?.ok
  ) {
    return {
      ok: false,
      result: {
        ...emptyResult({
          sessionId: start?.sessionId ?? claim?.sessionId ?? null,
          executionKey: start?.executionKey ?? claim?.executionKey ?? null,
          claimantId: start?.claimantId ?? claim?.claimantId ?? claimantId,
        }),
        message:
          "Activation execution item start was skipped because execution-session start did not complete successfully.",
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
          sessionId: start.sessionId,
          executionKey: start.executionKey,
          claimantId: start.claimantId,
        }),
        status: "error",
        blockers: 1,
        issues: [
          issue(
            "repository_error",
            start.sessionId,
            start.executionKey,
            null,
            null,
            "Activation execution item start could not access server-only ownership evidence.",
          ),
        ],
        message:
          "Activation execution item start failed safely because server-only ownership evidence was unavailable.",
      },
    };
  }

  const stableTimestamp =
    command.itemStartRequestedAt ?? new Date().toISOString();

  return {
    ok: true,
    itemStartCommand: {
      clinicId: command.clinicId,
      deploymentRunId: command.deploymentRunId,
      sessionId: start.sessionId,
      executionKey: start.executionKey,
      claimantId: start.claimantId,
      ownershipToken,
      assessmentTimestamp: stableTimestamp,
    },
  };
}

function buildAtomicCommand(
  command: Parameters<DeploymentActivationExecutionItemStartService["assessItemStart"]>[0],
  assessment: DeploymentActivationExecutionItemStartResult,
):
  | { ok: true; command: DeploymentActivationExecutionAtomicItemStartCommand }
  | { ok: false; result: ServerDeploymentActivationExecutionItemStartResult } {
  if (
    assessment.status !== "startable" ||
    !assessment.leaseExpiresAt ||
    !assessment.itemId ||
    !assessment.executionItemKey ||
    !assessment.planItemKey ||
    assessment.sequence === null ||
    !assessment.action ||
    !assessment.entityType
  ) {
    return {
      ok: false,
      result: safeError(
        command,
        assessment,
        "Activation execution item-start assessment did not produce complete atomic item-start evidence.",
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
      expectedLeaseExpiresAt: assessment.leaseExpiresAt,
      itemId: assessment.itemId,
      executionItemKey: assessment.executionItemKey,
      planItemKey: assessment.planItemKey,
      expectedSequence: assessment.sequence,
      expectedAction: assessment.action,
      expectedEntityType: assessment.entityType,
      expectedEntityKey: assessment.entityKey,
      proposedStartedAt: command.assessmentTimestamp,
      expectedAttemptCount: assessment.attemptCount,
    },
  };
}

function mapAtomicResult(
  command: Parameters<DeploymentActivationExecutionItemStartService["assessItemStart"]>[0],
  assessment: DeploymentActivationExecutionItemStartResult,
  result: DeploymentActivationExecutionAtomicItemStartResult,
  assessmentIssues: readonly DeploymentActivationExecutionItemStartIssue[],
): ServerDeploymentActivationExecutionItemStartResult {
  if (result.status === "started") {
    return {
      ...baseResult(command, assessment),
      ok: true,
      status: "started",
      itemId: result.itemId ?? assessment.itemId,
      executionItemKey: result.executionItemKey ?? assessment.executionItemKey,
      planItemKey: result.planItemKey ?? assessment.planItemKey,
      sequence: result.sequence ?? assessment.sequence,
      entityType: result.entityType ?? assessment.entityType,
      entityKey: result.entityKey ?? assessment.entityKey,
      action: result.action ?? assessment.action,
      itemExecutionStatus: result.executionStatus ?? "running",
      attemptCount: result.attemptCount,
      startedAt: result.startedAt ?? command.assessmentTimestamp,
      leaseExpiresAt: result.leaseExpiresAt ?? assessment.leaseExpiresAt,
      itemStartResult: result.status,
      startedCount: 1,
      warnings: warningCount(assessmentIssues),
      issues: assessmentIssues,
      message:
        "The first execution item is running under exclusive ownership. Its activation action has not been executed.",
    };
  }

  if (result.status === "already_started") {
    return {
      ...baseResult(command, assessment),
      ok: true,
      status: "already_started",
      itemId: result.itemId ?? assessment.itemId,
      executionItemKey: result.executionItemKey ?? assessment.executionItemKey,
      planItemKey: result.planItemKey ?? assessment.planItemKey,
      sequence: result.sequence ?? assessment.sequence,
      entityType: result.entityType ?? assessment.entityType,
      entityKey: result.entityKey ?? assessment.entityKey,
      action: result.action ?? assessment.action,
      itemExecutionStatus: result.executionStatus ?? "running",
      attemptCount: result.attemptCount || assessment.attemptCount,
      startedAt: result.startedAt ?? assessment.startedAt,
      leaseExpiresAt: result.leaseExpiresAt ?? assessment.leaseExpiresAt,
      itemStartResult: result.status,
      reusedCount: 1,
      warnings: warningCount(assessmentIssues),
      issues: assessmentIssues,
      message:
        "The existing running execution item was reused. No second item was started and no activation action was executed.",
    };
  }

  const status =
    result.status === "conflict"
      ? "conflict"
      : result.status === "not_found"
        ? "not_found"
        : result.status === "error"
          ? "error"
          : "blocked";
  const atomicIssue = issue(
    result.status === "not_found"
      ? "missing_candidate_item"
      : result.status === "conflict"
        ? "ownership_token_mismatch"
        : "repository_error",
    command.sessionId,
    command.executionKey,
    result.executionItemKey ?? assessment.executionItemKey,
    result.planItemKey ?? assessment.planItemKey,
    result.issueCode
      ? `Atomic execution item-start RPC returned ${result.issueCode}.`
      : "Atomic execution item-start RPC did not start the execution item.",
  );
  const issues = [...assessmentIssues, atomicIssue];

  return {
    ...baseResult(command, assessment),
    ok: false,
    status,
    itemStartResult: result.status,
    leaseExpiresAt: result.leaseExpiresAt ?? assessment.leaseExpiresAt,
    conflicts: status === "conflict" ? 1 : 0,
    blockers: blockerCount(issues) || 1,
    warnings: warningCount(issues),
    issues,
    message:
      result.message ||
      "Activation execution atomic item start did not complete. No activation action was executed.",
  };
}

function baseResult(
  command: Parameters<DeploymentActivationExecutionItemStartService["assessItemStart"]>[0],
  assessment: DeploymentActivationExecutionItemStartResult | null,
): ServerDeploymentActivationExecutionItemStartResult {
  return {
    ...emptyResult({
      sessionId: command.sessionId,
      executionKey: command.executionKey,
      claimantId: command.claimantId,
    }),
    itemId: assessment?.itemId ?? null,
    executionItemKey: assessment?.executionItemKey ?? null,
    planItemKey: assessment?.planItemKey ?? null,
    sequence: assessment?.sequence ?? null,
    entityType: assessment?.entityType ?? null,
    entityKey: assessment?.entityKey ?? null,
    entityId: assessment?.entityId ?? null,
    action: assessment?.action ?? null,
    itemExecutionStatus: assessment?.itemExecutionStatus ?? null,
    attemptCount: assessment?.attemptCount ?? 0,
    startedAt: assessment?.startedAt ?? null,
    leaseExpiresAt: assessment?.leaseExpiresAt ?? null,
    dependencyCount: assessment?.dependencyCount ?? 0,
    reversible: assessment?.reversible ?? null,
  };
}

function emptyResult(input: {
  sessionId: string | null;
  executionKey: string | null;
  claimantId: string | null;
}): ServerDeploymentActivationExecutionItemStartResult {
  return {
    ok: false,
    status: "not_attempted",
    claimantId: input.claimantId,
    sessionId: input.sessionId,
    executionKey: input.executionKey,
    itemId: null,
    executionItemKey: null,
    planItemKey: null,
    sequence: null,
    entityType: null,
    entityKey: null,
    entityId: null,
    action: null,
    itemExecutionStatus: null,
    attemptCount: 0,
    startedAt: null,
    leaseExpiresAt: null,
    dependencyCount: 0,
    reversible: null,
    itemStartResult: null,
    startedCount: 0,
    reusedCount: 0,
    conflicts: 0,
    blockers: 0,
    warnings: 0,
    issues: [],
    downstream: zeroDownstream(),
    message: "Activation execution item start was not attempted.",
  };
}

function safeError(
  command: Parameters<DeploymentActivationExecutionItemStartService["assessItemStart"]>[0],
  assessment: DeploymentActivationExecutionItemStartResult | null,
  message: string,
  issues: readonly DeploymentActivationExecutionItemStartIssue[] = [],
): ServerDeploymentActivationExecutionItemStartResult {
  const safeIssues = issues.length
    ? issues
    : [
        issue(
          "repository_error",
          command.sessionId,
          command.executionKey,
          assessment?.executionItemKey ?? null,
          assessment?.planItemKey ?? null,
          "Activation execution item-start repository failed safely.",
        ),
      ];

  return {
    ...baseResult(command, assessment),
    status: "error",
    blockers: blockerCount(safeIssues) || 1,
    warnings: warningCount(safeIssues),
    issues: safeIssues,
    message,
  };
}

function filterRuntimeIssues(
  issues: readonly DeploymentActivationExecutionItemStartIssue[],
): DeploymentActivationExecutionItemStartIssue[] {
  return issues.filter(
    (current) => current.code !== "item_start_persistence_unimplemented",
  );
}

function blockerCount(
  issues: readonly DeploymentActivationExecutionItemStartIssue[],
): number {
  return issues.filter((current) => current.severity === "blocker").length;
}

function warningCount(
  issues: readonly DeploymentActivationExecutionItemStartIssue[],
): number {
  return issues.filter((current) => current.severity === "warning").length;
}

function issue(
  code: DeploymentActivationExecutionItemStartIssue["code"],
  sessionId: string | null,
  executionKey: string | null,
  executionItemKey: string | null,
  planItemKey: string | null,
  message: string,
): DeploymentActivationExecutionItemStartIssue {
  return {
    code,
    severity: "blocker",
    sessionId,
    executionKey,
    executionItemKey,
    planItemKey,
    message,
  };
}

function createStaticItemStartSnapshotRepository(
  snapshot: DeploymentActivationExecutionItemStartSnapshot,
): DeploymentActivationExecutionItemStartRepository {
  return {
    async loadExecutionItemStartSnapshot() {
      return cloneSnapshot(snapshot);
    },
  };
}

function cloneSnapshot(
  snapshot: DeploymentActivationExecutionItemStartSnapshot,
): DeploymentActivationExecutionItemStartSnapshot {
  return {
    session: snapshot.session ? cloneItemStartSession(snapshot.session) : null,
    candidateItem: snapshot.candidateItem
      ? cloneItemStartCandidate(snapshot.candidateItem)
      : null,
    aggregate: cloneItemStartAggregate(
      snapshot.aggregate ?? emptyItemStartAggregate(),
    ),
  };
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