import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getServerDeploymentActivationExecutionClaimOwnershipToken,
  SETUP_RUNTIME_ACTIVATION_EXECUTION_CLAIMANT_ID,
  type ServerDeploymentActivationExecutionClaimResult,
} from "./deployment-activation-execution-claim-server";
import type {
  ServerDeploymentSterilizerShellActivationResult,
} from "./deployment-sterilizer-shell-activation-server";
import type {
  DeploymentSterilizerShellExecutionItemCompletionRepository,
} from "./deployment-sterilizer-shell-execution-item-completion-repository";
import {
  DeploymentSterilizerShellExecutionItemCompletionService,
} from "./deployment-sterilizer-shell-execution-item-completion-service";
import {
  DeploymentSterilizerShellExecutionItemCompletionRepositoryError,
  SupabaseDeploymentSterilizerShellExecutionItemCompletionRepository,
} from "./deployment-sterilizer-shell-execution-item-completion-supabase-repository";
import {
  cloneSterilizerShellExecutionItemCompletionSnapshot,
  type DeploymentSterilizerShellExecutionAtomicItemCompletionCommand,
  type DeploymentSterilizerShellExecutionAtomicItemCompletionDiagnostics,
  type DeploymentSterilizerShellExecutionAtomicItemCompletionResult,
  type DeploymentSterilizerShellExecutionItemCompletionDownstreamCounts,
  type DeploymentSterilizerShellExecutionItemCompletionIssue,
  type DeploymentSterilizerShellExecutionItemCompletionResult,
  type DeploymentSterilizerShellExecutionItemCompletionSnapshot,
} from "./deployment-sterilizer-shell-execution-item-completion-types";

export type ServerDeploymentSterilizerShellExecutionItemCompletionStatus =
  | "completed"
  | "already_completed"
  | "not_attempted"
  | "blocked"
  | "conflict"
  | "not_found"
  | "error";

export interface ServerDeploymentSterilizerShellExecutionItemCompletionCommand {
  clinicId: string;
  deploymentRunId: string;
  deploymentActivationExecutionClaim:
    | ServerDeploymentActivationExecutionClaimResult
    | null;
  deploymentSterilizerShellActivation:
    | ServerDeploymentSterilizerShellActivationResult
    | null;
  itemCompletionRequestedAt?: string | null;
}

export interface ServerDeploymentSterilizerShellExecutionItemCompletionResult {
  ok: boolean;
  status: ServerDeploymentSterilizerShellExecutionItemCompletionStatus;
  message: string;
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
  entityId: string | null;
  deploymentSterilizerKey: string | null;
  action: string | null;
  itemStatusBefore: string | null;
  itemStatusAfter: string | null;
  attemptCount: number;
  startedAt: string | null;
  completedAt: string | null;
  sterilizerId: string | null;
  sterilizerStatus: string | null;
  sterilizerActive: boolean | null;
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
  issues: readonly DeploymentSterilizerShellExecutionItemCompletionIssue[];
  diagnostics: DeploymentSterilizerShellExecutionAtomicItemCompletionDiagnostics | null;
  downstream: DeploymentSterilizerShellExecutionItemCompletionDownstreamCounts;
}

export async function completeSterilizerShellExecutionItemForServerDeployment(
  client: SupabaseClient,
  command: ServerDeploymentSterilizerShellExecutionItemCompletionCommand,
): Promise<ServerDeploymentSterilizerShellExecutionItemCompletionResult> {
  return completeSterilizerShellExecutionItemWithRepository(
    new SupabaseDeploymentSterilizerShellExecutionItemCompletionRepository(client),
    command,
  );
}

export async function completeSterilizerShellExecutionItemWithRepository(
  repository: DeploymentSterilizerShellExecutionItemCompletionRepository,
  command: ServerDeploymentSterilizerShellExecutionItemCompletionCommand,
): Promise<ServerDeploymentSterilizerShellExecutionItemCompletionResult> {
  const prerequisite = validatePrerequisite(command);

  if (!prerequisite.ok) {
    return prerequisite.result;
  }

  const completionCommand = prerequisite.completionCommand;
  const expectedLeaseExpiresAt = prerequisite.expectedLeaseExpiresAt;
  let latestAssessment: DeploymentSterilizerShellExecutionItemCompletionResult | null = null;

  try {
    const snapshot = await repository.loadSterilizerShellExecutionItemCompletionSnapshot({
      clinicId: completionCommand.clinicId,
      deploymentRunId: completionCommand.deploymentRunId,
      sessionId: completionCommand.sessionId,
      executionKey: completionCommand.executionKey,
    });
    const stableSnapshot = cloneSterilizerShellExecutionItemCompletionSnapshot(snapshot);
    const service = new DeploymentSterilizerShellExecutionItemCompletionService(
      createStaticSterilizerShellExecutionItemCompletionSnapshotRepository(stableSnapshot),
    );
    const assessment = await service.assessSterilizerShellExecutionItemCompletion(completionCommand);
    latestAssessment = assessment;
    const publicIssues = filterRuntimeIssues(assessment.issues);

    if (assessment.status === "already_completed") {
      return {
        ...baseResult(completionCommand, assessment),
        ok: true,
        status: "already_completed",
        completionResult: "already_completed",
        reusedCount: 1,
        warnings: warningCount(publicIssues),
        issues: publicIssues,
        message:
          "Sterilizer-shell activation execution item is already completed. No item mutation was performed.",
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
        "Sterilizer-shell execution item completion assessment failed safely. No fallback mutation was attempted.",
        publicIssues,
      );
    }

    const atomicCommand = buildAtomicCommand(
      completionCommand,
      assessment,
      expectedLeaseExpiresAt,
    );

    if (!atomicCommand.ok) {
      return atomicCommand.result;
    }

    const atomicResult = await repository.completeSterilizerShellExecutionItemAtomically(
      atomicCommand.command,
    );

    return mapAtomicResult(
      completionCommand,
      assessment,
      atomicResult,
      publicIssues,
    );
  } catch (caught) {
    return safeError(
      completionCommand,
      latestAssessment,
      "Sterilizer-shell execution item completion failed safely. No fallback mutation was attempted.",
      [],
      issueDiagnostics(caught, completionCommand.ownershipToken),
    );
  }
}

function validatePrerequisite(
  command: ServerDeploymentSterilizerShellExecutionItemCompletionCommand,
):
  | {
      ok: true;
      completionCommand: Parameters<DeploymentSterilizerShellExecutionItemCompletionService["assessSterilizerShellExecutionItemCompletion"]>[0];
      expectedLeaseExpiresAt: string;
    }
  | { ok: false; result: ServerDeploymentSterilizerShellExecutionItemCompletionResult } {
  const activation = command.deploymentSterilizerShellActivation;
  const claim = command.deploymentActivationExecutionClaim;
  const claimantId =
    activation?.claimantId ??
    claim?.claimantId ??
    SETUP_RUNTIME_ACTIVATION_EXECUTION_CLAIMANT_ID;

  if (
    !activation?.ok ||
    !["activated", "already_activated"].includes(activation.status) ||
    !activation.clinicId ||
    !activation.deploymentRunKey ||
    !activation.sessionId ||
    !activation.executionKey ||
    !claim?.ok
  ) {
    return {
      ok: false,
      result: {
        ...emptyResult({
          clinicId: activation?.clinicId ?? command.clinicId,
          deploymentRunId: activation?.deploymentRunKey ?? command.deploymentRunId,
          sessionId: activation?.sessionId ?? claim?.sessionId ?? null,
          executionKey: activation?.executionKey ?? claim?.executionKey ?? null,
          claimantId,
        }),
        message:
          "Sterilizer-shell execution item completion was skipped because sterilizer shell activation did not complete successfully.",
      },
    };
  }

  const ownershipToken = getServerDeploymentActivationExecutionClaimOwnershipToken(claim);

  if (!ownershipToken || !claim.leaseExpiresAt) {
    return {
      ok: false,
      result: {
        ...emptyResult({
          clinicId: activation.clinicId,
          deploymentRunId: activation.deploymentRunKey,
          sessionId: activation.sessionId,
          executionKey: activation.executionKey,
          claimantId,
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
            activation.sterilizerId,
            activation.deploymentSterilizerKey,
            activation.sequence,
            "Sterilizer-shell execution item completion could not access server-only ownership evidence.",
          ),
        ],
        message:
          "Sterilizer-shell execution item completion failed safely because server-only ownership evidence was unavailable.",
      },
    };
  }

  return {
    ok: true,
    expectedLeaseExpiresAt: claim.leaseExpiresAt,
    completionCommand: {
      clinicId: activation.clinicId,
      deploymentRunId: activation.deploymentRunKey,
      sessionId: activation.sessionId,
      executionKey: activation.executionKey,
      claimantId,
      ownershipToken,
      proposedCompletedAt: command.itemCompletionRequestedAt ?? new Date().toISOString(),
    },
  };
}

function buildAtomicCommand(
  command: Parameters<DeploymentSterilizerShellExecutionItemCompletionService["assessSterilizerShellExecutionItemCompletion"]>[0],
  assessment: DeploymentSterilizerShellExecutionItemCompletionResult,
  expectedLeaseExpiresAt: string,
):
  | { ok: true; command: DeploymentSterilizerShellExecutionAtomicItemCompletionCommand }
  | { ok: false; result: ServerDeploymentSterilizerShellExecutionItemCompletionResult } {
  if (
    assessment.status !== "completable" ||
    !assessment.itemId ||
    !assessment.executionItemKey ||
    !assessment.planItemKey ||
    assessment.sequence === null ||
    assessment.entityType !== "sterilizer_shell" ||
    !assessment.entityId ||
    assessment.action !== "activate" ||
    !assessment.startedAt ||
    !assessment.sterilizerId ||
    !assessment.deploymentSterilizerKey
  ) {
    return {
      ok: false,
      result: safeError(
        command,
        assessment,
        "Sterilizer-shell execution item completion assessment did not produce complete atomic completion evidence.",
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
      expectedLeaseExpiresAt,
      itemId: assessment.itemId,
      executionItemKey: assessment.executionItemKey,
      planItemKey: assessment.planItemKey,
      expectedSequence: assessment.sequence,
      expectedEntityType: "sterilizer_shell",
      expectedEntityId: assessment.entityId,
      expectedDeploymentSterilizerKey: assessment.deploymentSterilizerKey,
      expectedAction: "activate",
      expectedItemStartedAt: assessment.startedAt,
      expectedAttemptCount: assessment.attemptCount,
      sterilizerId: assessment.sterilizerId,
      expectedSterilizerState: {
        deploymentSterilizerKey: assessment.deploymentSterilizerKey,
        provisioningSource: "setup_draft",
        provisioningStatus: assessment.sterilizerStatus,
        active: assessment.sterilizerActive,
      },
      expectedTargetState: {
        provisioningStatus: "active",
        active: true,
      },
      proposedCompletedAt: assessment.completedAt ?? command.proposedCompletedAt,
    },
  };
}

function mapAtomicResult(
  command: Parameters<DeploymentSterilizerShellExecutionItemCompletionService["assessSterilizerShellExecutionItemCompletion"]>[0],
  assessment: DeploymentSterilizerShellExecutionItemCompletionResult,
  result: DeploymentSterilizerShellExecutionAtomicItemCompletionResult,
  assessmentIssues: readonly DeploymentSterilizerShellExecutionItemCompletionIssue[],
): ServerDeploymentSterilizerShellExecutionItemCompletionResult {
  if (result.status === "completed" || result.status === "already_completed") {
    return {
      ...baseResult(command, assessment),
      ok: true,
      status: result.status,
      completionResult: result.status,
      itemStatusBefore: result.itemStatusBefore ?? assessment.itemStatusBefore,
      itemStatusAfter: result.itemStatusAfter ?? "succeeded",
      completedAt: result.completedAt ?? assessment.completedAt,
      completedCount: result.status === "completed" ? 1 : 0,
      reusedCount: result.status === "already_completed" ? 1 : 0,
      warnings: warningCount(assessmentIssues),
      issues: assessmentIssues,
      message: result.status === "completed"
        ? "Sterilizer-shell activation execution item was atomically completed. No dependency progression, rollback, or finalization occurred."
        : "Sterilizer-shell activation execution item was already completed. No item mutation was performed.",
    };
  }

  const status = result.status === "conflict"
    ? "conflict"
    : result.status === "not_found"
      ? "not_found"
      : result.status === "error"
        ? "error"
        : "blocked";
  const atomicIssue = issue(
    status === "not_found"
      ? "missing_item"
      : status === "conflict"
        ? "sterilizer_identity_mismatch"
        : "repository_error",
    command.sessionId,
    command.executionKey,
    result.executionItemKey ?? assessment.executionItemKey,
    result.planItemKey ?? assessment.planItemKey,
    result.sterilizerId ?? assessment.sterilizerId,
    result.deploymentSterilizerKey ?? assessment.deploymentSterilizerKey,
    result.sequence ?? assessment.sequence,
    result.issueCode
      ? `Atomic sterilizer-shell execution item completion RPC returned ${result.issueCode}.`
      : "Atomic sterilizer-shell execution item completion RPC did not complete the item.",
  );
  const issues = [...assessmentIssues, atomicIssue];

  return {
    ...baseResult(command, assessment),
    ok: false,
    status,
    completionResult: result.status,
    itemStatusBefore: result.itemStatusBefore ?? assessment.itemStatusBefore,
    itemStatusAfter: result.itemStatusAfter ?? assessment.itemStatusBefore,
    completedAt: result.completedAt ?? assessment.completedAt,
    issueCode: result.issueCode,
    conflicts: status === "conflict" ? 1 : 0,
    blockers: blockerCount(issues) || 1,
    warnings: warningCount(issues),
    issues,
    diagnostics: result.diagnostics ?? null,
    message:
      result.message ||
      "Sterilizer-shell execution item completion did not complete the item. No fallback mutation was attempted.",
  };
}

function baseResult(
  command: Parameters<DeploymentSterilizerShellExecutionItemCompletionService["assessSterilizerShellExecutionItemCompletion"]>[0],
  assessment: DeploymentSterilizerShellExecutionItemCompletionResult | null,
): ServerDeploymentSterilizerShellExecutionItemCompletionResult {
  return {
    ...emptyResult({
      clinicId: command.clinicId,
      deploymentRunId: command.deploymentRunId,
      sessionId: command.sessionId,
      executionKey: command.executionKey,
      claimantId: command.claimantId,
    }),
    itemId: assessment?.itemId ?? null,
    executionItemKey: assessment?.executionItemKey ?? null,
    planItemKey: assessment?.planItemKey ?? null,
    sequence: assessment?.sequence ?? null,
    entityType: assessment?.entityType ?? null,
    entityId: assessment?.entityId ?? null,
    deploymentSterilizerKey: assessment?.deploymentSterilizerKey ?? null,
    action: assessment?.action ?? null,
    itemStatusBefore: assessment?.itemStatusBefore ?? null,
    itemStatusAfter: assessment?.itemStatusBefore ?? null,
    attemptCount: assessment?.attemptCount ?? 0,
    startedAt: assessment?.startedAt ?? null,
    completedAt: assessment?.completedAt ?? null,
    sterilizerId: assessment?.sterilizerId ?? null,
    sterilizerStatus: assessment?.sterilizerStatus ?? null,
    sterilizerActive: assessment?.sterilizerActive ?? null,
  };
}

function emptyResult(input: {
  clinicId: string | null;
  deploymentRunId: string | null;
  sessionId: string | null;
  executionKey: string | null;
  claimantId: string | null;
}): ServerDeploymentSterilizerShellExecutionItemCompletionResult {
  return {
    ok: false,
    status: "not_attempted",
    message: "Sterilizer-shell execution item completion was not attempted.",
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
    entityId: null,
    deploymentSterilizerKey: null,
    action: null,
    itemStatusBefore: null,
    itemStatusAfter: null,
    attemptCount: 0,
    startedAt: null,
    completedAt: null,
    sterilizerId: null,
    sterilizerStatus: null,
    sterilizerActive: null,
    completionResult: null,
    issueCode: null,
    completedCount: 0,
    reusedCount: 0,
    conflicts: 0,
    blockers: 0,
    warnings: 0,
    issues: [],
    diagnostics: null,
    downstream: zeroDownstream(),
  };
}

function safeError(
  command: Parameters<DeploymentSterilizerShellExecutionItemCompletionService["assessSterilizerShellExecutionItemCompletion"]>[0],
  assessment: DeploymentSterilizerShellExecutionItemCompletionResult | null,
  message: string,
  issues: readonly DeploymentSterilizerShellExecutionItemCompletionIssue[] = [],
  diagnostics: DeploymentSterilizerShellExecutionAtomicItemCompletionDiagnostics | null = null,
): ServerDeploymentSterilizerShellExecutionItemCompletionResult {
  const safeIssues = issues.length
    ? issues
    : [
        issue(
          "repository_error",
          command.sessionId,
          command.executionKey,
          assessment?.executionItemKey ?? null,
          assessment?.planItemKey ?? null,
          assessment?.sterilizerId ?? null,
          assessment?.deploymentSterilizerKey ?? null,
          assessment?.sequence ?? null,
          diagnostics?.errorMessage ?? "Sterilizer-shell execution item completion repository failed safely.",
        ),
      ];

  return {
    ...baseResult(command, assessment),
    status: "error",
    completionResult: "error",
    blockers: blockerCount(safeIssues) || 1,
    warnings: warningCount(safeIssues),
    issues: safeIssues,
    diagnostics,
    message,
  };
}

function createStaticSterilizerShellExecutionItemCompletionSnapshotRepository(
  snapshot: DeploymentSterilizerShellExecutionItemCompletionSnapshot,
): DeploymentSterilizerShellExecutionItemCompletionRepository {
  return {
    async loadSterilizerShellExecutionItemCompletionSnapshot() {
      return cloneSterilizerShellExecutionItemCompletionSnapshot(snapshot);
    },
    async completeSterilizerShellExecutionItemAtomically() {
      throw new Error("Static sterilizer-shell item completion assessment repository cannot mutate execution items.");
    },
  };
}

function filterRuntimeIssues(
  issues: readonly DeploymentSterilizerShellExecutionItemCompletionIssue[],
): DeploymentSterilizerShellExecutionItemCompletionIssue[] {
  return issues.filter(
    (current) => current.code !== "sterilizer_item_completion_persistence_unavailable",
  );
}

function blockerCount(
  issues: readonly DeploymentSterilizerShellExecutionItemCompletionIssue[],
): number {
  return issues.filter((current) => current.severity === "blocker").length;
}

function warningCount(
  issues: readonly DeploymentSterilizerShellExecutionItemCompletionIssue[],
): number {
  return issues.filter((current) => current.severity === "warning").length;
}

function issue(
  code: DeploymentSterilizerShellExecutionItemCompletionIssue["code"],
  sessionId: string | null,
  executionKey: string | null,
  executionItemKey: string | null,
  planItemKey: string | null,
  sterilizerId: string | null,
  deploymentSterilizerKey: string | null,
  sequence: number | null,
  message: string,
): DeploymentSterilizerShellExecutionItemCompletionIssue {
  return {
    code,
    severity: "blocker",
    sessionId,
    executionKey,
    executionItemKey,
    planItemKey,
    sterilizerId,
    deploymentSterilizerKey,
    sequence,
    message,
  };
}

function issueDiagnostics(
  caught: unknown,
  sensitiveToken: string | null,
): DeploymentSterilizerShellExecutionAtomicItemCompletionDiagnostics {
  if (caught instanceof DeploymentSterilizerShellExecutionItemCompletionRepositoryError) {
    return {
      layer: caught.diagnostics.layer ?? "repository",
      errorCode: sanitizeDiagnostic(caught.diagnostics.errorCode, sensitiveToken),
      errorMessage: sanitizeDiagnostic(caught.diagnostics.errorMessage ?? caught.message, sensitiveToken),
      errorDetails: sanitizeDiagnostic(caught.diagnostics.errorDetails, sensitiveToken),
      errorHint: sanitizeDiagnostic(caught.diagnostics.errorHint, sensitiveToken),
    };
  }

  if (caught instanceof Error) {
    return {
      layer: "server_composition",
      errorCode: null,
      errorMessage: sanitizeDiagnostic(caught.message, sensitiveToken),
      errorDetails: null,
      errorHint: null,
    };
  }

  return {
    layer: "server_composition",
    errorCode: null,
    errorMessage: sanitizeDiagnostic(String(caught), sensitiveToken),
    errorDetails: null,
    errorHint: null,
  };
}

function sanitizeDiagnostic(value: string | null | undefined, sensitiveToken: string | null): string | null {
  if (!value) {
    return value ?? null;
  }

  return sensitiveToken ? value.split(sensitiveToken).join("[redacted]") : value;
}

function zeroDownstream(): DeploymentSterilizerShellExecutionItemCompletionDownstreamCounts {
  return {
    itemsCompleted: 0,
    dependenciesProgressed: 0,
    nextItemsStarted: 0,
    providersActivated: 0,
    sterilizersActivated: 0,
    workstationsActivated: 0,
    hardwareActivated: 0,
    bindingsWritten: 0,
    sessionsCompleted: 0,
    rollbacksExecuted: 0,
    deploymentFinalized: 0,
  };
}
