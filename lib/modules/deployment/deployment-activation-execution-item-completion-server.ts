import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getServerDeploymentActivationExecutionClaimOwnershipToken,
  SETUP_RUNTIME_ACTIVATION_EXECUTION_CLAIMANT_ID,
  type ServerDeploymentActivationExecutionClaimResult,
} from "./deployment-activation-execution-claim-server";
import type {
  DeploymentActivationExecutionItemCompletionRepository,
} from "./deployment-activation-execution-item-completion-repository";
import {
  DeploymentActivationExecutionItemCompletionService,
} from "./deployment-activation-execution-item-completion-service";
import {
  SupabaseDeploymentActivationExecutionItemCompletionRepository,
} from "./deployment-activation-execution-item-completion-supabase-repository";
import {
  cloneItemCompletionSnapshot,
  type DeploymentActivationExecutionAtomicItemCompletionCommand,
  type DeploymentActivationExecutionAtomicItemCompletionResult,
  type DeploymentActivationExecutionItemCompletionDownstreamCounts,
  type DeploymentActivationExecutionItemCompletionIssue,
  type DeploymentActivationExecutionItemCompletionResult,
  type DeploymentActivationExecutionItemCompletionSnapshot,
} from "./deployment-activation-execution-item-completion-types";
import type {
  ServerDeploymentClinicActivationResult,
} from "./deployment-clinic-activation-server";

export type ServerDeploymentActivationExecutionItemCompletionStatus =
  | "completed"
  | "already_completed"
  | "blocked"
  | "conflict"
  | "not_found"
  | "error"
  | "not_attempted";

export interface ServerDeploymentActivationExecutionItemCompletionCommand {
  clinicId: string;
  deploymentRunId: string;
  deploymentActivationExecutionClaim:
    | ServerDeploymentActivationExecutionClaimResult
    | null;
  deploymentClinicActivation: ServerDeploymentClinicActivationResult | null;
  itemCompletionRequestedAt?: string | null;
}

export interface ServerDeploymentActivationExecutionItemCompletionResult {
  ok: boolean;
  status: ServerDeploymentActivationExecutionItemCompletionStatus;
  claimantId: string | null;
  clinicId: string | null;
  deploymentRunId: string | null;
  sessionId: string | null;
  executionKey: string | null;
  itemId: string | null;
  executionItemKey: string | null;
  planItemKey: string | null;
  sequence: number | null;
  entityType: string | null;
  action: string | null;
  startedAt: string | null;
  completedAt: string | null;
  attemptCount: number;
  executionStatusBefore: string | null;
  executionStatusAfter: string | null;
  completionResult:
    | "completed"
    | "already_completed"
    | "blocked"
    | "conflict"
    | "not_found"
    | "error"
    | null;
  issueCode: string | null;
  completedCount: 0 | 1;
  reusedCount: 0 | 1;
  conflicts: number;
  blockers: number;
  warnings: number;
  issues: readonly DeploymentActivationExecutionItemCompletionIssue[];
  downstream: DeploymentActivationExecutionItemCompletionDownstreamCounts;
  message: string;
}

export interface DeploymentActivationExecutionAtomicItemCompletionRepository
  extends DeploymentActivationExecutionItemCompletionRepository {
  completeExecutionItemAtomically(
    command: DeploymentActivationExecutionAtomicItemCompletionCommand,
  ): Promise<DeploymentActivationExecutionAtomicItemCompletionResult>;
}

export interface CompleteActivationExecutionItemWithRepositoryOptions {
  claimantId?: string;
  ownershipTokenResolver?: (
    claim: ServerDeploymentActivationExecutionClaimResult,
  ) => string | null;
}

export async function completeActivationExecutionItemForServerDeployment(
  client: SupabaseClient,
  command: ServerDeploymentActivationExecutionItemCompletionCommand,
): Promise<ServerDeploymentActivationExecutionItemCompletionResult> {
  return completeActivationExecutionItemWithRepository(
    new SupabaseDeploymentActivationExecutionItemCompletionRepository(client),
    command,
  );
}

export async function completeActivationExecutionItemWithRepository(
  repository: DeploymentActivationExecutionAtomicItemCompletionRepository,
  command: ServerDeploymentActivationExecutionItemCompletionCommand,
  options: CompleteActivationExecutionItemWithRepositoryOptions = {},
): Promise<ServerDeploymentActivationExecutionItemCompletionResult> {
  const prerequisite = validatePrerequisite(command, options);

  if (!prerequisite.ok) {
    return prerequisite.result;
  }

  const completionCommand = prerequisite.completionCommand;

  try {
    const snapshot = await repository.loadExecutionItemCompletionSnapshot({
      clinicId: completionCommand.clinicId,
      deploymentRunId: completionCommand.deploymentRunId,
      sessionId: completionCommand.sessionId,
      executionKey: completionCommand.executionKey,
      itemId: completionCommand.itemId,
      executionItemKey: completionCommand.executionItemKey,
      planItemKey: completionCommand.planItemKey,
    });
    const stableSnapshot = cloneItemCompletionSnapshot(snapshot);
    const service = new DeploymentActivationExecutionItemCompletionService(
      createStaticItemCompletionSnapshotRepository(stableSnapshot),
    );
    const assessment = await service.assessItemCompletion(completionCommand);
    const publicIssues = filterRuntimeIssues(assessment.issues);

    if (assessment.status === "already_completed") {
      return {
        ...baseResult(completionCommand, assessment),
        ok: true,
        status: "already_completed",
        completionResult: "already_completed",
        completedAt: assessment.existingCompletedAt,
        executionStatusBefore: "succeeded",
        executionStatusAfter: "succeeded",
        reusedCount: 1,
        warnings: warningCount(publicIssues),
        issues: publicIssues,
        message:
          "The clinic activation execution item was already completed. No timestamp or dependency state was changed.",
      };
    }

    if (
      assessment.status === "blocked" ||
      assessment.status === "conflict" ||
      assessment.status === "not_found"
    ) {
      return {
        ...baseResult(completionCommand, assessment),
        ok: false,
        status: assessment.status,
        completionResult: assessment.status,
        conflicts: assessment.status === "conflict" ? 1 : 0,
        blockers: blockerCount(publicIssues),
        warnings: warningCount(publicIssues),
        issues: publicIssues,
        message: assessment.message,
      };
    }

    if (assessment.status === "error") {
      return safeError(
        completionCommand,
        assessment,
        "Activation execution item-completion assessment failed safely. No fallback mutation was attempted.",
        publicIssues,
      );
    }

    const atomicCommand = buildAtomicCommand(completionCommand, assessment);

    if (!atomicCommand.ok) {
      return atomicCommand.result;
    }

    const atomicResult = await repository.completeExecutionItemAtomically(
      atomicCommand.command,
    );

    return mapAtomicResult(
      completionCommand,
      assessment,
      atomicResult,
      publicIssues,
    );
  } catch {
    return safeError(
      completionCommand,
      null,
      "Activation execution item completion failed safely. No fallback mutation was attempted.",
    );
  }
}

function validatePrerequisite(
  command: ServerDeploymentActivationExecutionItemCompletionCommand,
  options: CompleteActivationExecutionItemWithRepositoryOptions,
):
  | {
      ok: true;
      completionCommand: Parameters<DeploymentActivationExecutionItemCompletionService["assessItemCompletion"]>[0];
    }
  | { ok: false; result: ServerDeploymentActivationExecutionItemCompletionResult } {
  const activation = command.deploymentClinicActivation;
  const claim = command.deploymentActivationExecutionClaim;
  const claimantId =
    options.claimantId ?? SETUP_RUNTIME_ACTIVATION_EXECUTION_CLAIMANT_ID;

  if (
    !activation?.ok ||
    !["activated", "already_activated"].includes(activation.status) ||
    !activation.clinicId ||
    !activation.deploymentRunId ||
    !activation.sessionId ||
    !activation.executionKey ||
    !activation.itemId ||
    !activation.executionItemKey ||
    !activation.planItemKey ||
    !activation.claimantId ||
    !claim?.ok
  ) {
    return {
      ok: false,
      result: {
        ...emptyResult({
          clinicId: activation?.clinicId ?? command.clinicId,
          deploymentRunId: activation?.deploymentRunId ?? command.deploymentRunId,
          sessionId: activation?.sessionId ?? claim?.sessionId ?? null,
          executionKey: activation?.executionKey ?? claim?.executionKey ?? null,
          claimantId: activation?.claimantId ?? claim?.claimantId ?? claimantId,
        }),
        message:
          "Activation execution item completion was skipped because clinic activation did not complete successfully.",
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
          clinicId: activation.clinicId,
          deploymentRunId: activation.deploymentRunId,
          sessionId: activation.sessionId,
          executionKey: activation.executionKey,
          claimantId: activation.claimantId,
        }),
        status: "error",
        blockers: 1,
        issues: [
          issue(
            "repository_error",
            activation.sessionId,
            activation.executionKey,
            activation.executionItemKey,
            activation.planItemKey,
            "Activation execution item completion could not access server-only ownership evidence.",
          ),
        ],
        message:
          "Activation execution item completion failed safely because server-only ownership evidence was unavailable.",
      },
    };
  }

  const stableTimestamp =
    command.itemCompletionRequestedAt ?? new Date().toISOString();

  return {
    ok: true,
    completionCommand: {
      clinicId: activation.clinicId,
      deploymentRunId: activation.deploymentRunId,
      sessionId: activation.sessionId,
      executionKey: activation.executionKey,
      itemId: activation.itemId,
      executionItemKey: activation.executionItemKey,
      planItemKey: activation.planItemKey,
      claimantId: activation.claimantId,
      ownershipToken,
      assessmentTimestamp: stableTimestamp,
      proposedCompletedAt: stableTimestamp,
    },
  };
}

function buildAtomicCommand(
  command: Parameters<DeploymentActivationExecutionItemCompletionService["assessItemCompletion"]>[0],
  assessment: DeploymentActivationExecutionItemCompletionResult,
):
  | { ok: true; command: DeploymentActivationExecutionAtomicItemCompletionCommand }
  | { ok: false; result: ServerDeploymentActivationExecutionItemCompletionResult } {
  if (
    assessment.status !== "completable" ||
    !assessment.itemId ||
    !assessment.executionItemKey ||
    !assessment.planItemKey ||
    assessment.sequence === null ||
    !assessment.entityType ||
    !assessment.action ||
    !assessment.startedAt ||
    !assessment.proposedCompletedAt ||
    !assessment.leaseExpiresAt
  ) {
    return {
      ok: false,
      result: safeError(
        command,
        assessment,
        "Activation execution item-completion assessment did not produce complete atomic completion evidence.",
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
      expectedEntityType: assessment.entityType,
      expectedAction: assessment.action,
      expectedStartedAt: assessment.startedAt,
      expectedAttemptCount: assessment.attemptCount,
      proposedCompletedAt: assessment.proposedCompletedAt,
    },
  };
}

function mapAtomicResult(
  command: Parameters<DeploymentActivationExecutionItemCompletionService["assessItemCompletion"]>[0],
  assessment: DeploymentActivationExecutionItemCompletionResult,
  result: DeploymentActivationExecutionAtomicItemCompletionResult,
  assessmentIssues: readonly DeploymentActivationExecutionItemCompletionIssue[],
): ServerDeploymentActivationExecutionItemCompletionResult {
  if (result.status === "completed") {
    return {
      ...baseResult(command, assessment),
      ok: true,
      status: "completed",
      itemId: result.itemId ?? assessment.itemId,
      executionItemKey: result.executionItemKey ?? assessment.executionItemKey,
      planItemKey: result.planItemKey ?? assessment.planItemKey,
      sequence: result.sequence ?? assessment.sequence,
      entityType: result.entityType ?? assessment.entityType,
      action: result.action ?? assessment.action,
      startedAt: result.startedAt ?? assessment.startedAt,
      completedAt: result.completedAt ?? assessment.proposedCompletedAt,
      attemptCount: result.attemptCount || 1,
      executionStatusBefore: result.executionStatusBefore ?? "running",
      executionStatusAfter: result.executionStatusAfter ?? "succeeded",
      completionResult: result.status,
      completedCount: 1,
      warnings: warningCount(assessmentIssues),
      issues: assessmentIssues,
      message:
        "The clinic activation execution item was marked succeeded. Dependency progression remains unavailable.",
    };
  }

  if (result.status === "already_completed") {
    return {
      ...baseResult(command, assessment),
      ok: true,
      status: "already_completed",
      itemId: result.itemId ?? assessment.itemId,
      executionItemKey: result.executionItemKey ?? assessment.executionItemKey,
      planItemKey: result.planItemKey ?? assessment.planItemKey,
      sequence: result.sequence ?? assessment.sequence,
      entityType: result.entityType ?? assessment.entityType,
      action: result.action ?? assessment.action,
      startedAt: result.startedAt ?? assessment.startedAt,
      completedAt: result.completedAt ?? assessment.existingCompletedAt,
      attemptCount: result.attemptCount || assessment.attemptCount,
      executionStatusBefore: result.executionStatusBefore ?? "succeeded",
      executionStatusAfter: result.executionStatusAfter ?? "succeeded",
      completionResult: result.status,
      reusedCount: 1,
      warnings: warningCount(assessmentIssues),
      issues: assessmentIssues,
      message:
        "The clinic activation execution item was already completed. No timestamp or dependency state was changed.",
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
      ? "missing_item"
      : result.status === "conflict"
        ? "ownership_token_mismatch"
        : "repository_error",
    command.sessionId,
    command.executionKey,
    result.executionItemKey ?? assessment.executionItemKey,
    result.planItemKey ?? assessment.planItemKey,
    result.issueCode
      ? `Atomic execution item-completion RPC returned ${result.issueCode}.`
      : "Atomic execution item-completion RPC did not complete the item.",
  );
  const issues = [...assessmentIssues, atomicIssue];

  return {
    ...baseResult(command, assessment),
    ok: false,
    status,
    completionResult: result.status,
    issueCode: result.issueCode,
    completedAt: result.completedAt ?? assessment.existingCompletedAt,
    executionStatusBefore: result.executionStatusBefore,
    executionStatusAfter: result.executionStatusAfter,
    conflicts: status === "conflict" ? 1 : 0,
    blockers: blockerCount(issues) || 1,
    warnings: warningCount(issues),
    issues,
    message:
      result.message ||
      "Activation execution atomic item completion did not complete. No dependency progression was attempted.",
  };
}

function baseResult(
  command: Parameters<DeploymentActivationExecutionItemCompletionService["assessItemCompletion"]>[0],
  assessment: DeploymentActivationExecutionItemCompletionResult | null,
): ServerDeploymentActivationExecutionItemCompletionResult {
  return {
    ...emptyResult({
      clinicId: command.clinicId,
      deploymentRunId: command.deploymentRunId,
      sessionId: command.sessionId,
      executionKey: command.executionKey,
      claimantId: command.claimantId,
    }),
    itemId: assessment?.itemId ?? command.itemId,
    executionItemKey: assessment?.executionItemKey ?? command.executionItemKey,
    planItemKey: assessment?.planItemKey ?? command.planItemKey,
    sequence: assessment?.sequence ?? null,
    entityType: assessment?.entityType ?? null,
    action: assessment?.action ?? null,
    startedAt: assessment?.startedAt ?? null,
    completedAt: assessment?.existingCompletedAt ?? null,
    attemptCount: assessment?.attemptCount ?? 0,
  };
}

function emptyResult(input: {
  clinicId: string | null;
  deploymentRunId: string | null;
  sessionId: string | null;
  executionKey: string | null;
  claimantId: string | null;
}): ServerDeploymentActivationExecutionItemCompletionResult {
  return {
    ok: false,
    status: "not_attempted",
    claimantId: input.claimantId,
    clinicId: input.clinicId,
    deploymentRunId: input.deploymentRunId,
    sessionId: input.sessionId,
    executionKey: input.executionKey,
    itemId: null,
    executionItemKey: null,
    planItemKey: null,
    sequence: null,
    entityType: null,
    action: null,
    startedAt: null,
    completedAt: null,
    attemptCount: 0,
    executionStatusBefore: null,
    executionStatusAfter: null,
    completionResult: null,
    issueCode: null,
    completedCount: 0,
    reusedCount: 0,
    conflicts: 0,
    blockers: 0,
    warnings: 0,
    issues: [],
    downstream: zeroDownstream(),
    message: "Activation execution item completion was not attempted.",
  };
}

function safeError(
  command: Parameters<DeploymentActivationExecutionItemCompletionService["assessItemCompletion"]>[0],
  assessment: DeploymentActivationExecutionItemCompletionResult | null,
  message: string,
  issues: readonly DeploymentActivationExecutionItemCompletionIssue[] = [],
): ServerDeploymentActivationExecutionItemCompletionResult {
  const safeIssues = issues.length
    ? issues
    : [
        issue(
          "repository_error",
          command.sessionId,
          command.executionKey,
          assessment?.executionItemKey ?? command.executionItemKey,
          assessment?.planItemKey ?? command.planItemKey,
          "Activation execution item-completion repository failed safely.",
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
  issues: readonly DeploymentActivationExecutionItemCompletionIssue[],
): DeploymentActivationExecutionItemCompletionIssue[] {
  return issues.filter(
    (current) => current.code !== "completion_persistence_unavailable",
  );
}

function blockerCount(
  issues: readonly DeploymentActivationExecutionItemCompletionIssue[],
): number {
  return issues.filter((current) => current.severity === "blocker").length;
}

function warningCount(
  issues: readonly DeploymentActivationExecutionItemCompletionIssue[],
): number {
  return issues.filter((current) => current.severity === "warning").length;
}

function issue(
  code: DeploymentActivationExecutionItemCompletionIssue["code"],
  sessionId: string | null,
  executionKey: string | null,
  executionItemKey: string | null,
  planItemKey: string | null,
  message: string,
): DeploymentActivationExecutionItemCompletionIssue {
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

function createStaticItemCompletionSnapshotRepository(
  snapshot: DeploymentActivationExecutionItemCompletionSnapshot,
): DeploymentActivationExecutionItemCompletionRepository {
  return {
    async loadExecutionItemCompletionSnapshot() {
      return cloneItemCompletionSnapshot(snapshot);
    },
  };
}

function zeroDownstream(): DeploymentActivationExecutionItemCompletionDownstreamCounts {
  return {
    itemsCompleted: 0,
    dependenciesUnlocked: 0,
    providersActivated: 0,
    sterilizersActivated: 0,
    workstationsActivated: 0,
    hardwareActivated: 0,
    bindingsWritten: 0,
    deploymentFinalized: 0,
  };
}
