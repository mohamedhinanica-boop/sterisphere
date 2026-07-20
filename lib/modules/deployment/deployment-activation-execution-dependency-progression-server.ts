import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getServerDeploymentActivationExecutionClaimOwnershipToken,
  SETUP_RUNTIME_ACTIVATION_EXECUTION_CLAIMANT_ID,
  type ServerDeploymentActivationExecutionClaimResult,
} from "./deployment-activation-execution-claim-server";
import type {
  DeploymentActivationExecutionDependencyProgressionRepository,
} from "./deployment-activation-execution-dependency-progression-repository";
import {
  DeploymentActivationExecutionDependencyProgressionService,
} from "./deployment-activation-execution-dependency-progression-service";
import {
  DeploymentActivationExecutionDependencyProgressionRepositoryError,
  SupabaseDeploymentActivationExecutionDependencyProgressionRepository,
} from "./deployment-activation-execution-dependency-progression-supabase-repository";
import {
  cloneDependencyProgressionSnapshot,
  type DeploymentActivationExecutionAtomicDependencyProgressionCommand,
  type DeploymentActivationExecutionAtomicDependencyProgressionResult,
  type DeploymentActivationExecutionDependencyProgressionDownstreamCounts,
  type DeploymentActivationExecutionDependencyProgressionIssue,
  type DeploymentActivationExecutionDependencyProgressionIssueDiagnostics,
  type DeploymentActivationExecutionDependencyProgressionResult,
  type DeploymentActivationExecutionDependencyProgressionSnapshot,
} from "./deployment-activation-execution-dependency-progression-types";
import type {
  ServerDeploymentActivationExecutionItemCompletionResult,
} from "./deployment-activation-execution-item-completion-server";
import type {
  ServerDeploymentProviderShellExecutionItemCompletionResult,
} from "./deployment-provider-shell-execution-item-completion-server";
import type { ServerDeploymentSterilizerShellExecutionItemCompletionResult } from "./deployment-sterilizer-shell-execution-item-completion-server";
import type { ServerDeploymentWorkstationShellExecutionItemCompletionResult } from "./deployment-workstation-shell-execution-item-completion-server";
import type { ServerDeploymentHardwareShellExecutionItemCompletionResult } from "./deployment-hardware-shell-execution-item-completion-server";

export type ServerDeploymentActivationExecutionDependencyProgressionStatus =
  | "progressed"
  | "already_progressed"
  | "blocked"
  | "conflict"
  | "not_found"
  | "error"
  | "not_attempted";

export interface ServerDeploymentActivationExecutionDependencyProgressionCommand {
  clinicId: string;
  deploymentRunId: string;
  deploymentActivationExecutionClaim:
    | ServerDeploymentActivationExecutionClaimResult
    | null;
  deploymentActivationExecutionItemCompletion:
    | ServerDeploymentActivationExecutionItemCompletionResult
    | ServerDeploymentProviderShellExecutionItemCompletionResult
    | ServerDeploymentSterilizerShellExecutionItemCompletionResult
    | ServerDeploymentWorkstationShellExecutionItemCompletionResult
    | ServerDeploymentHardwareShellExecutionItemCompletionResult
    | null;
  dependencyProgressionRequestedAt?: string | null;
}

export interface ServerDeploymentActivationExecutionDependencyProgressionResult {
  ok: boolean;
  status: ServerDeploymentActivationExecutionDependencyProgressionStatus;
  claimantId: string | null;
  clinicId: string | null;
  deploymentRunId: string | null;
  sessionId: string | null;
  executionKey: string | null;
  completedItemId: string | null;
  completedExecutionItemKey: string | null;
  completedPlanItemKey: string | null;
  completedSequence: number | null;
  completedStartedAt: string | null;
  completedCompletedAt: string | null;
  completedAttemptCount: number;
  nextItemId: string | null;
  nextExecutionItemKey: string | null;
  nextPlanItemKey: string | null;
  nextSequence: number | null;
  nextEntityType: string | null;
  nextEntityId: string | null;
  nextAction: string | null;
  nextAttemptCount: number;
  statusBefore: string | null;
  statusAfter: string | null;
  progressionResult:
    | "progressed"
    | "already_progressed"
    | "blocked"
    | "conflict"
    | "not_found"
    | "error"
    | null;
  issueCode: string | null;
  progressedCount: 0 | 1;
  reusedCount: 0 | 1;
  conflicts: number;
  blockers: number;
  warnings: number;
  issues: readonly DeploymentActivationExecutionDependencyProgressionIssue[];
  downstream: DeploymentActivationExecutionDependencyProgressionDownstreamCounts;
  message: string;
}

export interface DeploymentActivationExecutionAtomicDependencyProgressionRepository
  extends DeploymentActivationExecutionDependencyProgressionRepository {
  progressDependencyAtomically(
    command: DeploymentActivationExecutionAtomicDependencyProgressionCommand,
  ): Promise<DeploymentActivationExecutionAtomicDependencyProgressionResult>;
}

export interface ProgressActivationExecutionDependencyWithRepositoryOptions {
  claimantId?: string;
  ownershipTokenResolver?: (
    claim: ServerDeploymentActivationExecutionClaimResult,
  ) => string | null;
}

export async function progressActivationExecutionDependencyForServerDeployment(
  client: SupabaseClient,
  command: ServerDeploymentActivationExecutionDependencyProgressionCommand,
): Promise<ServerDeploymentActivationExecutionDependencyProgressionResult> {
  return progressActivationExecutionDependencyWithRepository(
    new SupabaseDeploymentActivationExecutionDependencyProgressionRepository(client),
    command,
  );
}

export async function progressActivationExecutionDependencyWithRepository(
  repository: DeploymentActivationExecutionAtomicDependencyProgressionRepository,
  command: ServerDeploymentActivationExecutionDependencyProgressionCommand,
  options: ProgressActivationExecutionDependencyWithRepositoryOptions = {},
): Promise<ServerDeploymentActivationExecutionDependencyProgressionResult> {
  const prerequisite = validatePrerequisite(command, options);

  if (!prerequisite.ok) {
    return prerequisite.result;
  }

  const progressionCommand = prerequisite.progressionCommand;
  const expectedLeaseExpiresAt = prerequisite.expectedLeaseExpiresAt;
  let latestAssessment: DeploymentActivationExecutionDependencyProgressionResult | null = null;

  try {
    const snapshot = await repository.loadDependencyProgressionSnapshot({
      clinicId: progressionCommand.clinicId,
      deploymentRunKey: progressionCommand.deploymentRunKey,
      sessionId: progressionCommand.sessionId,
      executionKey: progressionCommand.executionKey,
    });
    const stableSnapshot = cloneDependencyProgressionSnapshot(snapshot);
    const service = new DeploymentActivationExecutionDependencyProgressionService(
      createStaticDependencyProgressionSnapshotRepository(stableSnapshot),
    );
    const assessment = await service.assessDependencyProgression(progressionCommand);
    latestAssessment = assessment;
    const publicIssues = filterRuntimeIssues(assessment.issues);

    if (assessment.status === "already_progressed") {
      return {
        ...baseResult(progressionCommand, assessment),
        ok: true,
        status: "already_progressed",
        statusBefore: assessment.currentNextItemStatus ?? "ready",
        statusAfter: "ready",
        progressionResult: "already_progressed",
        reusedCount: 1,
        warnings: warningCount(publicIssues),
        issues: publicIssues,
        message:
          "The next deterministic activation execution item was already ready. No RPC mutation was attempted.",
      };
    }

    if (
      assessment.status === "blocked" ||
      assessment.status === "conflict" ||
      assessment.status === "not_found"
    ) {
      return {
        ...baseResult(progressionCommand, assessment),
        ok: false,
        status: assessment.status,
        progressionResult: assessment.status,
        conflicts: assessment.status === "conflict" ? 1 : 0,
        blockers: blockerCount(publicIssues),
        warnings: warningCount(publicIssues),
        issues: publicIssues,
        message: assessment.message,
      };
    }

    if (assessment.status === "error") {
      return safeError(
        progressionCommand,
        assessment,
        "Activation execution dependency-progression assessment failed safely. No fallback mutation was attempted.",
        publicIssues,
      );
    }

    const atomicCommand = buildAtomicCommand(
      progressionCommand,
      assessment,
      expectedLeaseExpiresAt,
    );

    if (!atomicCommand.ok) {
      return atomicCommand.result;
    }

    const atomicResult = await repository.progressDependencyAtomically(
      atomicCommand.command,
    );

    return mapAtomicResult(
      progressionCommand,
      assessment,
      atomicResult,
      publicIssues,
    );
  } catch (caught) {
    return safeError(
      progressionCommand,
      latestAssessment,
      "Activation execution dependency progression failed safely. No fallback mutation was attempted.",
      [],
      diagnosticsFromCaught(caught, progressionCommand.ownershipToken),
    );
  }
}

function validatePrerequisite(
  command: ServerDeploymentActivationExecutionDependencyProgressionCommand,
  options: ProgressActivationExecutionDependencyWithRepositoryOptions,
):
  | {
      ok: true;
      progressionCommand: Parameters<DeploymentActivationExecutionDependencyProgressionService["assessDependencyProgression"]>[0];
      expectedLeaseExpiresAt: string;
    }
  | { ok: false; result: ServerDeploymentActivationExecutionDependencyProgressionResult } {
  const completion = command.deploymentActivationExecutionItemCompletion;
  const claim = command.deploymentActivationExecutionClaim;
  const claimantId =
    options.claimantId ?? SETUP_RUNTIME_ACTIVATION_EXECUTION_CLAIMANT_ID;

  if (
    !completion?.ok ||
    !["completed", "already_completed"].includes(completion.status) ||
    !completion.clinicId ||
    !completion.deploymentRunId ||
    !completion.sessionId ||
    !completion.executionKey ||
    !completion.claimantId ||
    !claim?.ok
  ) {
    return {
      ok: false,
      result: {
        ...emptyResult({
          clinicId: completion?.clinicId ?? command.clinicId,
          deploymentRunId: completion?.deploymentRunId ?? command.deploymentRunId,
          sessionId: completion?.sessionId ?? claim?.sessionId ?? null,
          executionKey: completion?.executionKey ?? claim?.executionKey ?? null,
          claimantId: completion?.claimantId ?? claim?.claimantId ?? claimantId,
        }),
        message:
          "Activation execution dependency progression was skipped because item completion did not complete successfully.",
      },
    };
  }

  const ownershipToken =
    options.ownershipTokenResolver?.(claim) ??
    getServerDeploymentActivationExecutionClaimOwnershipToken(claim);

  if (!ownershipToken || !claim.leaseExpiresAt) {
    return {
      ok: false,
      result: {
        ...emptyResult({
          clinicId: completion.clinicId,
          deploymentRunId: completion.deploymentRunId,
          sessionId: completion.sessionId,
          executionKey: completion.executionKey,
          claimantId: completion.claimantId,
        }),
        status: "error",
        blockers: 1,
        issues: [
          issue(
            "repository_error",
            completion.sessionId,
            completion.executionKey,
            completion.executionItemKey,
            completion.planItemKey,
            "Activation execution dependency progression could not access server-only ownership evidence.",
          ),
        ],
        message:
          "Activation execution dependency progression failed safely because server-only ownership evidence was unavailable.",
      },
    };
  }

  return {
    ok: true,
    expectedLeaseExpiresAt: claim.leaseExpiresAt,
    progressionCommand: {
      clinicId: completion.clinicId,
      deploymentRunKey: completion.deploymentRunId,
      sessionId: completion.sessionId,
      executionKey: completion.executionKey,
      claimantId: completion.claimantId,
      ownershipToken,
      now: command.dependencyProgressionRequestedAt ?? new Date().toISOString(),
    },
  };
}

function buildAtomicCommand(
  command: Parameters<DeploymentActivationExecutionDependencyProgressionService["assessDependencyProgression"]>[0],
  assessment: DeploymentActivationExecutionDependencyProgressionResult,
  expectedLeaseExpiresAt: string,
):
  | { ok: true; command: DeploymentActivationExecutionAtomicDependencyProgressionCommand }
  | { ok: false; result: ServerDeploymentActivationExecutionDependencyProgressionResult } {
  if (
    assessment.status !== "progressable" ||
    !assessment.completedItemId ||
    !assessment.completedExecutionItemKey ||
    !assessment.completedPlanItemKey ||
    assessment.completedSequence === null ||
    !assessment.nextItemId ||
    !assessment.nextExecutionItemKey ||
    !assessment.nextPlanItemKey ||
    assessment.nextSequence === null ||
    !assessment.nextEntityType ||
    !assessment.nextAction ||
    !assessment.proposedNextItemStatus
  ) {
    return {
      ok: false,
      result: safeError(
        command,
        assessment,
        "Activation execution dependency-progression assessment did not produce complete atomic progression evidence.",
      ),
    };
  }

  if (!assessment.completedStartedAt || !assessment.completedCompletedAt) {
    return {
      ok: false,
      result: safeError(
        command,
        assessment,
        "Activation execution dependency-progression assessment did not expose complete predecessor timestamp evidence.",
      ),
    };
  }

  return {
    ok: true,
    command: {
      clinicId: command.clinicId,
      deploymentRunKey: command.deploymentRunKey,
      sessionId: command.sessionId,
      executionKey: command.executionKey,
      claimantId: command.claimantId,
      ownershipToken: command.ownershipToken,
      expectedLeaseExpiresAt,
      completedItemId: assessment.completedItemId,
      completedExecutionItemKey: assessment.completedExecutionItemKey,
      completedPlanItemKey: assessment.completedPlanItemKey,
      completedSequence: assessment.completedSequence,
      completedStartedAt: assessment.completedStartedAt,
      completedCompletedAt: assessment.completedCompletedAt,
      completedAttemptCount: assessment.completedAttemptCount,
      nextItemId: assessment.nextItemId,
      nextExecutionItemKey: assessment.nextExecutionItemKey,
      nextPlanItemKey: assessment.nextPlanItemKey,
      nextSequence: assessment.nextSequence,
      nextEntityType: assessment.nextEntityType,
      nextEntityId: assessment.nextEntityId,
      nextAction: assessment.nextAction,
      expectedNextStatus: "pending",
      expectedNextAttemptCount: 0,
      expectedDependencyKeys: assessment.dependencyKeys,
      progressedAt: command.now,
    },
  };
}

function mapAtomicResult(
  command: Parameters<DeploymentActivationExecutionDependencyProgressionService["assessDependencyProgression"]>[0],
  assessment: DeploymentActivationExecutionDependencyProgressionResult,
  result: DeploymentActivationExecutionAtomicDependencyProgressionResult,
  assessmentIssues: readonly DeploymentActivationExecutionDependencyProgressionIssue[],
): ServerDeploymentActivationExecutionDependencyProgressionResult {
  if (result.status === "progressed") {
    return {
      ...baseResult(command, assessment),
      ok: true,
      status: "progressed",
      nextItemId: result.nextItemId ?? assessment.nextItemId,
      nextExecutionItemKey: result.nextExecutionItemKey ?? assessment.nextExecutionItemKey,
      nextPlanItemKey: result.nextPlanItemKey ?? assessment.nextPlanItemKey,
      nextSequence: result.nextSequence ?? assessment.nextSequence,
      nextEntityType: result.nextEntityType ?? assessment.nextEntityType,
      nextEntityId: result.nextEntityId ?? assessment.nextEntityId,
      nextAction: result.nextAction ?? assessment.nextAction,
      statusBefore: result.nextStatusBefore ?? assessment.currentNextItemStatus,
      statusAfter: result.nextStatusAfter ?? "ready",
      progressionResult: result.status,
      progressedCount: 1,
      warnings: warningCount(assessmentIssues),
      issues: assessmentIssues,
      message:
        "The next deterministic activation execution item was marked ready. It was not started and no entity was activated.",
    };
  }

  if (result.status === "already_progressed") {
    return {
      ...baseResult(command, assessment),
      ok: true,
      status: "already_progressed",
      nextItemId: result.nextItemId ?? assessment.nextItemId,
      nextExecutionItemKey: result.nextExecutionItemKey ?? assessment.nextExecutionItemKey,
      nextPlanItemKey: result.nextPlanItemKey ?? assessment.nextPlanItemKey,
      nextSequence: result.nextSequence ?? assessment.nextSequence,
      nextEntityType: result.nextEntityType ?? assessment.nextEntityType,
      nextEntityId: result.nextEntityId ?? assessment.nextEntityId,
      nextAction: result.nextAction ?? assessment.nextAction,
      statusBefore: result.nextStatusBefore ?? "ready",
      statusAfter: result.nextStatusAfter ?? "ready",
      progressionResult: result.status,
      reusedCount: 1,
      warnings: warningCount(assessmentIssues),
      issues: assessmentIssues,
      message:
        "The next deterministic activation execution item was already ready. No item was started and no entity was activated.",
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
      ? "next_item_missing"
      : result.status === "conflict"
        ? "ownership_token_mismatch"
        : "repository_error",
    command.sessionId,
    command.executionKey,
    result.nextExecutionItemKey ?? assessment.nextExecutionItemKey,
    result.nextPlanItemKey ?? assessment.nextPlanItemKey,
    result.issueCode
      ? `Atomic dependency-progression RPC returned ${result.issueCode}.`
      : "Atomic dependency-progression RPC did not ready the next item.",
  );
  const issues = [...assessmentIssues, atomicIssue];

  return {
    ...baseResult(command, assessment),
    ok: false,
    status,
    progressionResult: result.status,
    issueCode: result.issueCode,
    statusBefore: result.nextStatusBefore ?? assessment.currentNextItemStatus,
    statusAfter: result.nextStatusAfter,
    conflicts: status === "conflict" ? 1 : 0,
    blockers: blockerCount(issues) || 1,
    warnings: warningCount(issues),
    issues,
    message:
      result.message ||
      "Activation execution dependency progression did not ready the next item. No fallback mutation was attempted.",
  };
}

function baseResult(
  command: Parameters<DeploymentActivationExecutionDependencyProgressionService["assessDependencyProgression"]>[0],
  assessment: DeploymentActivationExecutionDependencyProgressionResult | null,
): ServerDeploymentActivationExecutionDependencyProgressionResult {
  return {
    ...emptyResult({
      clinicId: command.clinicId,
      deploymentRunId: command.deploymentRunKey,
      sessionId: command.sessionId,
      executionKey: command.executionKey,
      claimantId: command.claimantId,
    }),
    completedItemId: assessment?.completedItemId ?? null,
    completedExecutionItemKey: assessment?.completedExecutionItemKey ?? null,
    completedPlanItemKey: assessment?.completedPlanItemKey ?? null,
    completedSequence: assessment?.completedSequence ?? null,
    completedStartedAt: assessment?.completedStartedAt ?? null,
    completedCompletedAt: assessment?.completedCompletedAt ?? null,
    completedAttemptCount: assessment?.completedAttemptCount ?? 0,
    nextItemId: assessment?.nextItemId ?? null,
    nextExecutionItemKey: assessment?.nextExecutionItemKey ?? null,
    nextPlanItemKey: assessment?.nextPlanItemKey ?? null,
    nextSequence: assessment?.nextSequence ?? null,
    nextEntityType: assessment?.nextEntityType ?? null,
    nextEntityId: assessment?.nextEntityId ?? null,
    nextAction: assessment?.nextAction ?? null,
    nextAttemptCount: assessment?.nextAttemptCount ?? 0,
    statusBefore: assessment?.currentNextItemStatus ?? null,
    statusAfter: assessment?.proposedNextItemStatus ?? null,
  };
}

function emptyResult(input: {
  clinicId: string | null;
  deploymentRunId: string | null;
  sessionId: string | null;
  executionKey: string | null;
  claimantId: string | null;
}): ServerDeploymentActivationExecutionDependencyProgressionResult {
  return {
    ok: false,
    status: "not_attempted",
    claimantId: input.claimantId,
    clinicId: input.clinicId,
    deploymentRunId: input.deploymentRunId,
    sessionId: input.sessionId,
    executionKey: input.executionKey,
    completedItemId: null,
    completedExecutionItemKey: null,
    completedPlanItemKey: null,
    completedSequence: null,
    completedStartedAt: null,
    completedCompletedAt: null,
    completedAttemptCount: 0,
    nextItemId: null,
    nextExecutionItemKey: null,
    nextPlanItemKey: null,
    nextSequence: null,
    nextEntityType: null,
    nextEntityId: null,
    nextAction: null,
    nextAttemptCount: 0,
    statusBefore: null,
    statusAfter: null,
    progressionResult: null,
    issueCode: null,
    progressedCount: 0,
    reusedCount: 0,
    conflicts: 0,
    blockers: 0,
    warnings: 0,
    issues: [],
    downstream: zeroDownstream(),
    message: "Activation execution dependency progression was not attempted.",
  };
}

function safeError(
  command: Parameters<DeploymentActivationExecutionDependencyProgressionService["assessDependencyProgression"]>[0],
  assessment: DeploymentActivationExecutionDependencyProgressionResult | null,
  message: string,
  issues: readonly DeploymentActivationExecutionDependencyProgressionIssue[] = [],
  diagnostics?: DeploymentActivationExecutionDependencyProgressionIssueDiagnostics,
): ServerDeploymentActivationExecutionDependencyProgressionResult {
  const safeIssues = issues.length
    ? issues
    : [
        issue(
          "repository_error",
          command.sessionId,
          command.executionKey,
          assessment?.nextExecutionItemKey ?? null,
          assessment?.nextPlanItemKey ?? null,
          "Activation execution dependency-progression repository failed safely.",
                  diagnostics,
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

function diagnosticsFromCaught(
  caught: unknown,
  sensitiveToken: string | null,
): DeploymentActivationExecutionDependencyProgressionIssueDiagnostics {
  if (caught instanceof DeploymentActivationExecutionDependencyProgressionRepositoryError) {
    return {
      layer: caught.layer,
      rpcAttempted: rpcAttemptedForLayer(caught.layer),
      errorCode: sanitizeDiagnostic(caught.code, sensitiveToken),
      errorMessage: sanitizeDiagnostic(caught.message, sensitiveToken),
      errorDetails: sanitizeDiagnostic(caught.details, sensitiveToken),
      errorHint: sanitizeDiagnostic(caught.hint, sensitiveToken),
      exceptionType: null,
      exceptionMessage: null,
    };
  }

  if (caught instanceof Error) {
    return {
      layer: "server_boundary",
      rpcAttempted: false,
      errorCode: null,
      errorMessage: null,
      errorDetails: null,
      errorHint: null,
      exceptionType: caught.name || "Error",
      exceptionMessage: sanitizeDiagnostic(caught.message, sensitiveToken),
    };
  }

  return {
    layer: "server_boundary",
    rpcAttempted: false,
    errorCode: null,
    errorMessage: null,
    errorDetails: null,
    errorHint: null,
    exceptionType: typeof caught,
    exceptionMessage: sanitizeDiagnostic(String(caught), sensitiveToken),
  };
}

function rpcAttemptedForLayer(layer: string): boolean {
  return layer === "atomic_rpc" || layer === "atomic_rpc_response_mapping";
}
function sanitizeDiagnostic(value: string | null, sensitiveToken: string | null): string | null {
  if (!value) {
    return value;
  }

  return sensitiveToken ? value.split(sensitiveToken).join("[redacted]") : value;
}
function filterRuntimeIssues(
  issues: readonly DeploymentActivationExecutionDependencyProgressionIssue[],
): DeploymentActivationExecutionDependencyProgressionIssue[] {
  return issues.filter(
    (current) => current.code !== "dependency_progression_persistence_unimplemented",
  );
}

function blockerCount(
  issues: readonly DeploymentActivationExecutionDependencyProgressionIssue[],
): number {
  return issues.filter((current) => current.severity === "blocker").length;
}

function warningCount(
  issues: readonly DeploymentActivationExecutionDependencyProgressionIssue[],
): number {
  return issues.filter((current) => current.severity === "warning").length;
}

function issue(
  code: DeploymentActivationExecutionDependencyProgressionIssue["code"],
  sessionId: string | null,
  executionKey: string | null,
  executionItemKey: string | null,
  planItemKey: string | null,
  message: string,
  diagnostics?: DeploymentActivationExecutionDependencyProgressionIssueDiagnostics,
): DeploymentActivationExecutionDependencyProgressionIssue {
  return {
    code,
    severity: "blocker",
    sessionId,
    executionKey,
    executionItemKey,
    planItemKey,
    message,
      ...(diagnostics ? { diagnostics } : {}),
  };
}

function createStaticDependencyProgressionSnapshotRepository(
  snapshot: DeploymentActivationExecutionDependencyProgressionSnapshot,
): DeploymentActivationExecutionDependencyProgressionRepository {
  return {
    async loadDependencyProgressionSnapshot() {
      return cloneDependencyProgressionSnapshot(snapshot);
    },
  };
}

function zeroDownstream(): DeploymentActivationExecutionDependencyProgressionDownstreamCounts {
  return {
    itemsReadied: 0,
    itemsStarted: 0,
    itemsSucceeded: 0,
    entitiesActivated: 0,
    bindingsWritten: 0,
    sessionsCompleted: 0,
    deploymentsFinalized: 0,
    rollbacksExecuted: 0,
  };
}
