import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getServerDeploymentActivationExecutionClaimOwnershipToken,
  SETUP_RUNTIME_ACTIVATION_EXECUTION_CLAIMANT_ID,
  type ServerDeploymentActivationExecutionClaimResult,
} from "./deployment-activation-execution-claim-server";
import type {
  ServerDeploymentHardwareShellActivationResult,
} from "./deployment-hardware-shell-activation-server";
import type {
  DeploymentHardwareShellExecutionItemCompletionRepository,
} from "./deployment-hardware-shell-execution-item-completion-repository";
import {
  DeploymentHardwareShellExecutionItemCompletionService,
} from "./deployment-hardware-shell-execution-item-completion-service";
import {
  DeploymentHardwareShellExecutionItemCompletionRepositoryError,
  SupabaseDeploymentHardwareShellExecutionItemCompletionRepository,
} from "./deployment-hardware-shell-execution-item-completion-supabase-repository";
import {
  cloneHardwareShellExecutionItemCompletionSnapshot,
  type DeploymentHardwareShellExecutionAtomicItemCompletionCommand,
  type DeploymentHardwareShellExecutionAtomicItemCompletionDiagnostics,
  type DeploymentHardwareShellExecutionAtomicItemCompletionResult,
  type DeploymentHardwareShellExecutionItemCompletionDownstreamCounts,
  type DeploymentHardwareShellExecutionItemCompletionIssue,
  type DeploymentHardwareShellExecutionItemCompletionResult,
  type DeploymentHardwareShellExecutionItemCompletionSnapshot,
} from "./deployment-hardware-shell-execution-item-completion-types";

export type ServerDeploymentHardwareShellExecutionItemCompletionStatus =
  | "completed"
  | "already_completed"
  | "not_attempted"
  | "blocked"
  | "conflict"
  | "not_found"
  | "error";

export interface ServerDeploymentHardwareShellExecutionItemCompletionCommand {
  clinicId: string;
  deploymentRunId: string;
  deploymentActivationExecutionClaim:
    | ServerDeploymentActivationExecutionClaimResult
    | null;
  deploymentHardwareShellActivation:
    | ServerDeploymentHardwareShellActivationResult
    | null;
  itemCompletionRequestedAt?: string | null;
}

export interface ServerDeploymentHardwareShellExecutionItemCompletionResult {
  ok: boolean;
  status: ServerDeploymentHardwareShellExecutionItemCompletionStatus;
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
  deploymentHardwareKey: string | null;
  action: string | null;
  itemStatusBefore: string | null;
  itemStatusAfter: string | null;
  attemptCount: number;
  startedAt: string | null;
  completedAt: string | null;
  hardwareId: string | null;
  hardwareStatus: string | null;
  hardwareActive: boolean | null;
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
  issues: readonly DeploymentHardwareShellExecutionItemCompletionIssue[];
  diagnostics: DeploymentHardwareShellExecutionAtomicItemCompletionDiagnostics | null;
  downstream: DeploymentHardwareShellExecutionItemCompletionDownstreamCounts;
}

export async function completeHardwareShellExecutionItemForServerDeployment(
  client: SupabaseClient,
  command: ServerDeploymentHardwareShellExecutionItemCompletionCommand,
): Promise<ServerDeploymentHardwareShellExecutionItemCompletionResult> {
  return completeHardwareShellExecutionItemWithRepository(
    new SupabaseDeploymentHardwareShellExecutionItemCompletionRepository(client),
    command,
  );
}

export async function completeHardwareShellExecutionItemWithRepository(
  repository: DeploymentHardwareShellExecutionItemCompletionRepository,
  command: ServerDeploymentHardwareShellExecutionItemCompletionCommand,
): Promise<ServerDeploymentHardwareShellExecutionItemCompletionResult> {
  const prerequisite = validatePrerequisite(command);

  if (!prerequisite.ok) {
    return prerequisite.result;
  }

  const completionCommand = prerequisite.completionCommand;
  const expectedLeaseExpiresAt = prerequisite.expectedLeaseExpiresAt;
  let latestAssessment: DeploymentHardwareShellExecutionItemCompletionResult | null = null;

  try {
    const snapshot = await repository.loadHardwareShellExecutionItemCompletionSnapshot({
      clinicId: completionCommand.clinicId,
      deploymentRunId: completionCommand.deploymentRunId,
      sessionId: completionCommand.sessionId,
      executionKey: completionCommand.executionKey,
    });
    const stableSnapshot = cloneHardwareShellExecutionItemCompletionSnapshot(snapshot);
    const service = new DeploymentHardwareShellExecutionItemCompletionService(
      createStaticHardwareShellExecutionItemCompletionSnapshotRepository(stableSnapshot),
    );
    const assessment = await service.assessHardwareShellExecutionItemCompletion(completionCommand);
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
          "Hardware-shell activation execution item is already completed. No item mutation was performed.",
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
        "Hardware-shell execution item completion assessment failed safely. No fallback mutation was attempted.",
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

    const atomicResult = await repository.completeHardwareShellExecutionItemAtomically(
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
      "Hardware-shell execution item completion failed safely. No fallback mutation was attempted.",
      [],
      issueDiagnostics(caught, completionCommand.ownershipToken),
    );
  }
}

function validatePrerequisite(
  command: ServerDeploymentHardwareShellExecutionItemCompletionCommand,
):
  | {
      ok: true;
      completionCommand: Parameters<DeploymentHardwareShellExecutionItemCompletionService["assessHardwareShellExecutionItemCompletion"]>[0];
      expectedLeaseExpiresAt: string;
    }
  | { ok: false; result: ServerDeploymentHardwareShellExecutionItemCompletionResult } {
  const activation = command.deploymentHardwareShellActivation;
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
          "Hardware-shell execution item completion was skipped because hardware shell activation did not complete successfully.",
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
            activation.hardwareId,
            activation.deploymentHardwareKey,
            activation.sequence,
            "Hardware-shell execution item completion could not access server-only ownership evidence.",
          ),
        ],
        message:
          "Hardware-shell execution item completion failed safely because server-only ownership evidence was unavailable.",
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
  command: Parameters<DeploymentHardwareShellExecutionItemCompletionService["assessHardwareShellExecutionItemCompletion"]>[0],
  assessment: DeploymentHardwareShellExecutionItemCompletionResult,
  expectedLeaseExpiresAt: string,
):
  | { ok: true; command: DeploymentHardwareShellExecutionAtomicItemCompletionCommand }
  | { ok: false; result: ServerDeploymentHardwareShellExecutionItemCompletionResult } {
  if (
    assessment.status !== "completable" ||
    !assessment.itemId ||
    !assessment.executionItemKey ||
    !assessment.planItemKey ||
    assessment.sequence === null ||
    assessment.entityType !== "hardware_shell" ||
    !assessment.entityId ||
    assessment.action !== "activate" ||
    !assessment.startedAt ||
    !assessment.hardwareId ||
    !assessment.deploymentHardwareKey
  ) {
    return {
      ok: false,
      result: safeError(
        command,
        assessment,
        "Hardware-shell execution item completion assessment did not produce complete atomic completion evidence.",
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
      expectedEntityType: "hardware_shell",
      expectedEntityId: assessment.entityId,
      expectedDeploymentHardwareKey: assessment.deploymentHardwareKey,
      expectedAction: "activate",
      expectedItemStartedAt: assessment.startedAt,
      expectedAttemptCount: assessment.attemptCount,
      hardwareId: assessment.hardwareId,
      expectedHardwareState: assessment.hardwareCurrentState ?? {
        deploymentHardwareKey: assessment.deploymentHardwareKey,
        provisioningSource: "setup_draft",
        provisioningStatus: assessment.hardwareStatus,
        active: assessment.hardwareActive,
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
  command: Parameters<DeploymentHardwareShellExecutionItemCompletionService["assessHardwareShellExecutionItemCompletion"]>[0],
  assessment: DeploymentHardwareShellExecutionItemCompletionResult,
  result: DeploymentHardwareShellExecutionAtomicItemCompletionResult,
  assessmentIssues: readonly DeploymentHardwareShellExecutionItemCompletionIssue[],
): ServerDeploymentHardwareShellExecutionItemCompletionResult {
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
        ? "Hardware-shell activation execution item was atomically completed. No dependency progression, rollback, or finalization occurred."
        : "Hardware-shell activation execution item was already completed. No item mutation was performed.",
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
        ? "hardware_identity_mismatch"
        : "repository_error",
    command.sessionId,
    command.executionKey,
    result.executionItemKey ?? assessment.executionItemKey,
    result.planItemKey ?? assessment.planItemKey,
    result.hardwareId ?? assessment.hardwareId,
    result.deploymentHardwareKey ?? assessment.deploymentHardwareKey,
    result.sequence ?? assessment.sequence,
    result.issueCode
      ? `Atomic hardware-shell execution item completion RPC returned ${result.issueCode}.`
      : "Atomic hardware-shell execution item completion RPC did not complete the item.",
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
      "Hardware-shell execution item completion did not complete the item. No fallback mutation was attempted.",
  };
}

function baseResult(
  command: Parameters<DeploymentHardwareShellExecutionItemCompletionService["assessHardwareShellExecutionItemCompletion"]>[0],
  assessment: DeploymentHardwareShellExecutionItemCompletionResult | null,
): ServerDeploymentHardwareShellExecutionItemCompletionResult {
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
    deploymentHardwareKey: assessment?.deploymentHardwareKey ?? null,
    action: assessment?.action ?? null,
    itemStatusBefore: assessment?.itemStatusBefore ?? null,
    itemStatusAfter: assessment?.itemStatusBefore ?? null,
    attemptCount: assessment?.attemptCount ?? 0,
    startedAt: assessment?.startedAt ?? null,
    completedAt: assessment?.completedAt ?? null,
    hardwareId: assessment?.hardwareId ?? null,
    hardwareStatus: assessment?.hardwareStatus ?? null,
    hardwareActive: assessment?.hardwareActive ?? null,
  };
}

function emptyResult(input: {
  clinicId: string | null;
  deploymentRunId: string | null;
  sessionId: string | null;
  executionKey: string | null;
  claimantId: string | null;
}): ServerDeploymentHardwareShellExecutionItemCompletionResult {
  return {
    ok: false,
    status: "not_attempted",
    message: "Hardware-shell execution item completion was not attempted.",
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
    deploymentHardwareKey: null,
    action: null,
    itemStatusBefore: null,
    itemStatusAfter: null,
    attemptCount: 0,
    startedAt: null,
    completedAt: null,
    hardwareId: null,
    hardwareStatus: null,
    hardwareActive: null,
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
  command: Parameters<DeploymentHardwareShellExecutionItemCompletionService["assessHardwareShellExecutionItemCompletion"]>[0],
  assessment: DeploymentHardwareShellExecutionItemCompletionResult | null,
  message: string,
  issues: readonly DeploymentHardwareShellExecutionItemCompletionIssue[] = [],
  diagnostics: DeploymentHardwareShellExecutionAtomicItemCompletionDiagnostics | null = null,
): ServerDeploymentHardwareShellExecutionItemCompletionResult {
  const safeIssues = issues.length
    ? issues
    : [
        issue(
          "repository_error",
          command.sessionId,
          command.executionKey,
          assessment?.executionItemKey ?? null,
          assessment?.planItemKey ?? null,
          assessment?.hardwareId ?? null,
          assessment?.deploymentHardwareKey ?? null,
          assessment?.sequence ?? null,
          diagnostics?.errorMessage ?? "Hardware-shell execution item completion repository failed safely.",
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

function createStaticHardwareShellExecutionItemCompletionSnapshotRepository(
  snapshot: DeploymentHardwareShellExecutionItemCompletionSnapshot,
): DeploymentHardwareShellExecutionItemCompletionRepository {
  return {
    async loadHardwareShellExecutionItemCompletionSnapshot() {
      return cloneHardwareShellExecutionItemCompletionSnapshot(snapshot);
    },
    async completeHardwareShellExecutionItemAtomically() {
      throw new Error("Static hardware-shell item completion assessment repository cannot mutate execution items.");
    },
  };
}

function filterRuntimeIssues(
  issues: readonly DeploymentHardwareShellExecutionItemCompletionIssue[],
): DeploymentHardwareShellExecutionItemCompletionIssue[] {
  return issues.filter(
    (current) => current.code !== "hardware_item_completion_persistence_unavailable",
  );
}

function blockerCount(
  issues: readonly DeploymentHardwareShellExecutionItemCompletionIssue[],
): number {
  return issues.filter((current) => current.severity === "blocker").length;
}

function warningCount(
  issues: readonly DeploymentHardwareShellExecutionItemCompletionIssue[],
): number {
  return issues.filter((current) => current.severity === "warning").length;
}

function issue(
  code: DeploymentHardwareShellExecutionItemCompletionIssue["code"],
  sessionId: string | null,
  executionKey: string | null,
  executionItemKey: string | null,
  planItemKey: string | null,
  hardwareId: string | null,
  deploymentHardwareKey: string | null,
  sequence: number | null,
  message: string,
): DeploymentHardwareShellExecutionItemCompletionIssue {
  return {
    code,
    severity: "blocker",
    sessionId,
    executionKey,
    executionItemKey,
    planItemKey,
    hardwareId,
    deploymentHardwareKey,
    sequence,
    message,
  };
}

function issueDiagnostics(
  caught: unknown,
  sensitiveToken: string | null,
): DeploymentHardwareShellExecutionAtomicItemCompletionDiagnostics {
  if (caught instanceof DeploymentHardwareShellExecutionItemCompletionRepositoryError) {
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

function zeroDownstream(): DeploymentHardwareShellExecutionItemCompletionDownstreamCounts {
  return {
    itemsCompleted: 0,
    dependenciesProgressed: 0,
    nextItemsStarted: 0,
    providersActivated: 0,
    sterilizersActivated: 0,
    hardwaresActivated: 0,
    hardwareActivated: 0,
    bindingsWritten: 0,
    sessionsCompleted: 0,
    rollbacksExecuted: 0,
    deploymentFinalized: 0,
  };
}
