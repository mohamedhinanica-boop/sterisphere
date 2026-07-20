import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getServerDeploymentActivationExecutionClaimOwnershipToken,
  SETUP_RUNTIME_ACTIVATION_EXECUTION_CLAIMANT_ID,
  type ServerDeploymentActivationExecutionClaimResult,
} from "./deployment-activation-execution-claim-server";
import type {
  ServerDeploymentActivationExecutionNextItemStartResult,
} from "./deployment-activation-execution-next-item-start-server";
import type {
  DeploymentSterilizerShellActivationRepository,
} from "./deployment-sterilizer-shell-activation-repository";
import {
  DeploymentSterilizerShellActivationService,
} from "./deployment-sterilizer-shell-activation-service";
import {
  DeploymentSterilizerShellActivationRepositoryError,
  SupabaseDeploymentSterilizerShellActivationRepository,
} from "./deployment-sterilizer-shell-activation-supabase-repository";
import {
  cloneSterilizerShellActivationSnapshot,
  type DeploymentSterilizerShellActivationAtomicCommand,
  type DeploymentSterilizerShellActivationAtomicResult,
  type DeploymentSterilizerShellActivationDownstreamCounts,
  type DeploymentSterilizerShellActivationIssue,
  type DeploymentSterilizerShellActivationIssueDiagnostics,
  type DeploymentSterilizerShellActivationResult,
  type DeploymentSterilizerShellActivationSnapshot,
} from "./deployment-sterilizer-shell-activation-types";

export type ServerDeploymentSterilizerShellActivationStatus =
  | "activated"
  | "already_activated"
  | "not_attempted"
  | "blocked"
  | "conflict"
  | "not_found"
  | "error";

export interface ServerDeploymentSterilizerShellActivationCommand {
  clinicId: string;
  deploymentRunId: string;
  deploymentActivationExecutionClaim:
    | ServerDeploymentActivationExecutionClaimResult
    | null;
  deploymentActivationExecutionNextItemStart:
    | ServerDeploymentActivationExecutionNextItemStartResult
    | null;
  sterilizerActivatedAt?: string | null;
}

export interface ServerDeploymentSterilizerShellActivationResult {
  ok: boolean;
  status: ServerDeploymentSterilizerShellActivationStatus;
  message: string;
  claimantId: string | null;
  clinicId: string | null;
  deploymentRunKey: string | null;
  sessionId: string | null;
  executionKey: string | null;
  planKey: string | null;
  itemId: string | null;
  executionItemKey: string | null;
  planItemKey: string | null;
  sequence: number | null;
  sterilizerId: string | null;
  deploymentSterilizerKey: string | null;
  provisioningSourceBefore: string | null;
  provisioningSourceAfter: string | null;
  provisioningStatusBefore: string | null;
  provisioningStatusAfter: string | null;
  activeBefore: boolean | null;
  activeAfter: boolean | null;
  activatedAt: string | null;
  result:
    | "activated"
    | "already_activated"
    | "blocked"
    | "conflict"
    | "not_found"
    | "error"
    | null;
  activatedCount: 0 | 1;
  reusedCount: 0 | 1;
  conflicts: number;
  blockers: number;
  warnings: number;
  issues: readonly DeploymentSterilizerShellActivationIssue[];
  downstream: DeploymentSterilizerShellActivationDownstreamCounts;
}

export interface DeploymentSterilizerShellActivationAtomicRepository
  extends DeploymentSterilizerShellActivationRepository {
  activateSterilizerShellAtomically(
    command: DeploymentSterilizerShellActivationAtomicCommand,
  ): Promise<DeploymentSterilizerShellActivationAtomicResult>;
}

export interface ActivateSterilizerShellWithRepositoryOptions {
  claimantId?: string;
  ownershipTokenResolver?: (
    claim: ServerDeploymentActivationExecutionClaimResult,
  ) => string | null;
}

export async function activateSterilizerShellForServerDeployment(
  client: SupabaseClient,
  command: ServerDeploymentSterilizerShellActivationCommand,
): Promise<ServerDeploymentSterilizerShellActivationResult> {
  return activateSterilizerShellWithRepository(
    new SupabaseDeploymentSterilizerShellActivationRepository(client),
    command,
  );
}

export async function activateSterilizerShellWithRepository(
  repository: DeploymentSterilizerShellActivationAtomicRepository,
  command: ServerDeploymentSterilizerShellActivationCommand,
  options: ActivateSterilizerShellWithRepositoryOptions = {},
): Promise<ServerDeploymentSterilizerShellActivationResult> {
  const prerequisite = validatePrerequisite(command, options);

  if (!prerequisite.ok) {
    return prerequisite.result;
  }

  const activationCommand = prerequisite.activationCommand;
  const expectedLeaseExpiresAt = prerequisite.expectedLeaseExpiresAt;
  let latestAssessment: DeploymentSterilizerShellActivationResult | null = null;

  try {
    const snapshot = await repository.loadSterilizerShellActivationSnapshot({
      clinicId: activationCommand.clinicId,
      deploymentRunKey: activationCommand.deploymentRunKey,
      sessionId: activationCommand.sessionId,
      executionKey: activationCommand.executionKey,
    });
    const stableSnapshot = cloneSterilizerShellActivationSnapshot(snapshot);
    const service = new DeploymentSterilizerShellActivationService(
      createStaticSterilizerShellActivationSnapshotRepository(stableSnapshot),
    );
    const assessment = await service.assessSterilizerShellActivation(activationCommand);
    latestAssessment = assessment;
    const publicIssues = filterRuntimeIssues(assessment.issues);

    if (assessment.status === "already_activated") {
      return {
        ...baseResult(activationCommand, assessment),
        ok: true,
        status: "already_activated",
        result: "already_activated",
        reusedCount: 1,
        warnings: warningCount(publicIssues),
        issues: publicIssues,
        message:
          "Sterilizer shell is already activated. No sterilizer mutation was performed.",
      };
    }

    if (
      assessment.status === "blocked" ||
      assessment.status === "conflict" ||
      assessment.status === "not_found"
    ) {
      return {
        ...baseResult(activationCommand, assessment),
        ok: false,
        status: assessment.status,
        result: assessment.status,
        conflicts: assessment.status === "conflict" ? 1 : 0,
        blockers: blockerCount(publicIssues),
        warnings: warningCount(publicIssues),
        issues: publicIssues,
        message: assessment.message,
      };
    }

    if (assessment.status === "error") {
      return safeError(
        activationCommand,
        assessment,
        "Sterilizer shell activation assessment failed safely. No fallback mutation was attempted.",
        publicIssues,
      );
    }

    const atomicCommand = buildAtomicCommand(
      activationCommand,
      assessment,
      expectedLeaseExpiresAt,
    );

    if (!atomicCommand.ok) {
      return atomicCommand.result;
    }

    const atomicResult = await repository.activateSterilizerShellAtomically(
      atomicCommand.command,
    );

    return mapAtomicResult(
      activationCommand,
      assessment,
      atomicResult,
      publicIssues,
    );
  } catch (caught) {
    const diagnostics = issueDiagnostics(caught, activationCommand.ownershipToken);
    console.error("deployment_sterilizer_activation_failed", {
      stage: diagnostics.stage,
      operation: diagnostics.operation,
      failureClassification: diagnostics.failureClassification,
      rpcAttempted: diagnostics.rpcAttempted,
      dataReturned: diagnostics.dataReturned,
      errorCode: diagnostics.errorCode,
      errorMessage: diagnostics.errorMessage ?? diagnostics.exceptionMessage,
      errorDetails: diagnostics.errorDetails,
      errorHint: diagnostics.errorHint,
      exceptionType: diagnostics.exceptionType,
    });
    return safeError(
      activationCommand,
      latestAssessment,
      "Sterilizer shell activation failed safely. No fallback mutation was attempted.",
      [],
      diagnostics,
    );
  }
}

function validatePrerequisite(
  command: ServerDeploymentSterilizerShellActivationCommand,
  options: ActivateSterilizerShellWithRepositoryOptions,
):
  | {
      ok: true;
      activationCommand: Parameters<DeploymentSterilizerShellActivationService["assessSterilizerShellActivation"]>[0];
      expectedLeaseExpiresAt: string;
    }
  | { ok: false; result: ServerDeploymentSterilizerShellActivationResult } {
  const nextItemStart = command.deploymentActivationExecutionNextItemStart;
  const claim = command.deploymentActivationExecutionClaim;
  const claimantId =
    options.claimantId ?? SETUP_RUNTIME_ACTIVATION_EXECUTION_CLAIMANT_ID;

  if (
    !nextItemStart?.ok ||
    !["started", "already_started"].includes(nextItemStart.status) ||
    !nextItemStart.clinicId ||
    !nextItemStart.deploymentRunKey ||
    !nextItemStart.sessionId ||
    !nextItemStart.executionKey ||
    !claim?.ok
  ) {
    return {
      ok: false,
      result: {
        ...emptyResult({
          clinicId: nextItemStart?.clinicId ?? command.clinicId,
          deploymentRunKey: nextItemStart?.deploymentRunKey ?? command.deploymentRunId,
          sessionId: nextItemStart?.sessionId ?? claim?.sessionId ?? null,
          executionKey: nextItemStart?.executionKey ?? claim?.executionKey ?? null,
          claimantId: nextItemStart?.claimantId ?? claim?.claimantId ?? claimantId,
        }),
        message:
          "Sterilizer shell activation was skipped because the deterministic next item is not running.",
      },
    };
  }

  if (
    nextItemStart.entityType !== "sterilizer_shell" ||
    nextItemStart.action !== "activate"
  ) {
    return {
      ok: false,
      result: {
        ...emptyResult({
          clinicId: nextItemStart.clinicId,
          deploymentRunKey: nextItemStart.deploymentRunKey,
          sessionId: nextItemStart.sessionId,
          executionKey: nextItemStart.executionKey,
          claimantId: nextItemStart.claimantId ?? claim.claimantId ?? claimantId,
        }),
        planKey: nextItemStart.planKey,
        itemId: nextItemStart.itemId,
        executionItemKey: nextItemStart.executionItemKey,
        planItemKey: nextItemStart.planItemKey,
        sequence: nextItemStart.sequence,
        message:
          "Sterilizer shell activation was not attempted because the running item targets another activation entity.",
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
          clinicId: nextItemStart.clinicId,
          deploymentRunKey: nextItemStart.deploymentRunKey,
          sessionId: nextItemStart.sessionId,
          executionKey: nextItemStart.executionKey,
          claimantId: nextItemStart.claimantId ?? claim.claimantId ?? claimantId,
        }),
        status: "error",
        blockers: 1,
        issues: [
          issue(
            "repository_error",
            nextItemStart.sessionId,
            nextItemStart.executionKey,
            nextItemStart.executionItemKey,
            nextItemStart.planItemKey,
            null,
            null,
            nextItemStart.sequence,
            "Sterilizer shell activation could not access server-only ownership evidence.",
          ),
        ],
        message:
          "Sterilizer shell activation failed safely because server-only ownership evidence was unavailable.",
      },
    };
  }

  return {
    ok: true,
    expectedLeaseExpiresAt: claim.leaseExpiresAt,
    activationCommand: {
      clinicId: nextItemStart.clinicId,
      deploymentRunKey: nextItemStart.deploymentRunKey,
      sessionId: nextItemStart.sessionId,
      executionKey: nextItemStart.executionKey,
      claimantId: nextItemStart.claimantId ?? claim.claimantId ?? claimantId,
      ownershipToken,
      now: command.sterilizerActivatedAt ?? new Date().toISOString(),
    },
  };
}

function buildAtomicCommand(
  command: Parameters<DeploymentSterilizerShellActivationService["assessSterilizerShellActivation"]>[0],
  assessment: DeploymentSterilizerShellActivationResult,
  expectedLeaseExpiresAt: string,
):
  | { ok: true; command: DeploymentSterilizerShellActivationAtomicCommand }
  | { ok: false; result: ServerDeploymentSterilizerShellActivationResult } {
  if (
    assessment.status !== "activatable" ||
    !assessment.itemId ||
    !assessment.executionItemKey ||
    !assessment.planItemKey ||
    assessment.sequence === null ||
    !assessment.entityId ||
    !assessment.itemStartedAt ||
    !assessment.sterilizerId ||
    !assessment.deploymentSterilizerKey
  ) {
    return {
      ok: false,
      result: safeError(
        command,
        assessment,
        "Sterilizer shell activation assessment did not produce complete atomic activation evidence.",
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
      itemId: assessment.itemId,
      executionItemKey: assessment.executionItemKey,
      planItemKey: assessment.planItemKey,
      expectedSequence: assessment.sequence,
      expectedEntityType: "sterilizer_shell",
      expectedEntityId: assessment.entityId,
      expectedAction: "activate",
      expectedItemStartedAt: assessment.itemStartedAt,
      expectedAttemptCount: assessment.attemptCount,
      sterilizerId: assessment.sterilizerId,
      expectedSterilizerKey: assessment.deploymentSterilizerKey,
      expectedCurrentState: {
        deploymentSterilizerKey: assessment.deploymentSterilizerKey,
        provisioningSource: assessment.sterilizerProvisioningSource,
        provisioningStatus: assessment.sterilizerProvisioningStatus,
        active: assessment.sterilizerActive,
      },
      targetState: {
        provisioningStatus: "active",
        active: true,
      },
      proposedActivatedAt: command.now,
    },
  };
}

function mapAtomicResult(
  command: Parameters<DeploymentSterilizerShellActivationService["assessSterilizerShellActivation"]>[0],
  assessment: DeploymentSterilizerShellActivationResult,
  result: DeploymentSterilizerShellActivationAtomicResult,
  assessmentIssues: readonly DeploymentSterilizerShellActivationIssue[],
): ServerDeploymentSterilizerShellActivationResult {
  if (result.status === "activated" || result.status === "already_activated") {
    return {
      ...baseResult(command, assessment),
      ok: true,
      status: result.status,
      result: result.status,
      sterilizerId: result.sterilizerId ?? assessment.sterilizerId,
      deploymentSterilizerKey: result.deploymentSterilizerKey ?? assessment.deploymentSterilizerKey,
      provisioningSourceBefore: readString(result.sterilizerStateBefore?.provisioningSource) ?? assessment.sterilizerProvisioningSource,
      provisioningSourceAfter: readString(result.sterilizerStateAfter?.provisioningSource) ?? (result.status === "activated" ? "setup_draft" : assessment.sterilizerProvisioningSource),
      provisioningStatusBefore: readString(result.sterilizerStateBefore?.provisioningStatus) ?? assessment.sterilizerProvisioningStatus,
      provisioningStatusAfter: readString(result.sterilizerStateAfter?.provisioningStatus) ?? (result.status === "activated" ? "active" : assessment.sterilizerProvisioningStatus),
      activeBefore: readBoolean(result.sterilizerStateBefore?.active) ?? assessment.sterilizerActive,
      activeAfter: readBoolean(result.sterilizerStateAfter?.active) ?? (result.status === "activated" ? true : assessment.sterilizerActive),
      activatedAt: result.activatedAt,
      activatedCount: result.status === "activated" ? 1 : 0,
      reusedCount: result.status === "already_activated" ? 1 : 0,
      warnings: warningCount(assessmentIssues),
      issues: assessmentIssues,
      message: result.status === "activated"
        ? "Sterilizer shell was atomically activated. No item completion, dependency progression, binding, rollback, or finalization occurred."
        : "Sterilizer shell was already activated. No sterilizer mutation was performed.",
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
    result.status === "not_found"
      ? "missing_sterilizer_shell"
      : result.status === "conflict"
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
      ? `Atomic sterilizer shell activation RPC returned ${result.issueCode}.`
      : "Atomic sterilizer shell activation RPC did not activate the sterilizer shell.",
  );
  const issues = [...assessmentIssues, atomicIssue];

  return {
    ...baseResult(command, assessment),
    ok: false,
    status,
    result: result.status,
    sterilizerId: result.sterilizerId ?? assessment.sterilizerId,
    deploymentSterilizerKey: result.deploymentSterilizerKey ?? assessment.deploymentSterilizerKey,
    provisioningSourceBefore: readString(result.sterilizerStateBefore?.provisioningSource) ?? assessment.sterilizerProvisioningSource,
    provisioningSourceAfter: readString(result.sterilizerStateAfter?.provisioningSource) ?? assessment.sterilizerProvisioningSource,
    provisioningStatusBefore: readString(result.sterilizerStateBefore?.provisioningStatus) ?? assessment.sterilizerProvisioningStatus,
    provisioningStatusAfter: readString(result.sterilizerStateAfter?.provisioningStatus) ?? assessment.sterilizerProvisioningStatus,
    activeBefore: readBoolean(result.sterilizerStateBefore?.active) ?? assessment.sterilizerActive,
    activeAfter: readBoolean(result.sterilizerStateAfter?.active) ?? assessment.sterilizerActive,
    activatedAt: result.activatedAt,
    conflicts: status === "conflict" ? 1 : 0,
    blockers: blockerCount(issues) || 1,
    warnings: warningCount(issues),
    issues,
    message:
      result.message ||
      "Sterilizer shell activation did not activate the sterilizer shell. No fallback mutation was attempted.",
  };
}

function baseResult(
  command: Parameters<DeploymentSterilizerShellActivationService["assessSterilizerShellActivation"]>[0],
  assessment: DeploymentSterilizerShellActivationResult | null,
): ServerDeploymentSterilizerShellActivationResult {
  return {
    ...emptyResult({
      clinicId: command.clinicId,
      deploymentRunKey: command.deploymentRunKey,
      sessionId: command.sessionId,
      executionKey: command.executionKey,
      claimantId: command.claimantId,
    }),
    planKey: assessment?.planKey ?? null,
    itemId: assessment?.itemId ?? null,
    executionItemKey: assessment?.executionItemKey ?? null,
    planItemKey: assessment?.planItemKey ?? null,
    sequence: assessment?.sequence ?? null,
    sterilizerId: assessment?.sterilizerId ?? null,
    deploymentSterilizerKey: assessment?.deploymentSterilizerKey ?? null,
    provisioningSourceBefore: assessment?.sterilizerProvisioningSource ?? null,
    provisioningSourceAfter: assessment?.sterilizerProvisioningSource ?? null,
    provisioningStatusBefore: assessment?.sterilizerProvisioningStatus ?? null,
    provisioningStatusAfter: assessment?.sterilizerProvisioningStatus ?? null,
    activeBefore: assessment?.sterilizerActive ?? null,
    activeAfter: assessment?.sterilizerActive ?? null,
    activatedAt: null,
  };
}

function emptyResult(input: {
  clinicId: string | null;
  deploymentRunKey: string | null;
  sessionId: string | null;
  executionKey: string | null;
  claimantId: string | null;
}): ServerDeploymentSterilizerShellActivationResult {
  return {
    ok: false,
    status: "not_attempted",
    message: "Sterilizer shell activation was not attempted.",
    claimantId: input.claimantId,
    clinicId: input.clinicId,
    deploymentRunKey: input.deploymentRunKey,
    sessionId: input.sessionId,
    executionKey: input.executionKey,
    planKey: null,
    itemId: null,
    executionItemKey: null,
    planItemKey: null,
    sequence: null,
    sterilizerId: null,
    deploymentSterilizerKey: null,
    provisioningSourceBefore: null,
    provisioningSourceAfter: null,
    provisioningStatusBefore: null,
    provisioningStatusAfter: null,
    activeBefore: null,
    activeAfter: null,
    activatedAt: null,
    result: null,
    activatedCount: 0,
    reusedCount: 0,
    conflicts: 0,
    blockers: 0,
    warnings: 0,
    issues: [],
    downstream: zeroDownstream(),
  };
}

function safeError(
  command: Parameters<DeploymentSterilizerShellActivationService["assessSterilizerShellActivation"]>[0],
  assessment: DeploymentSterilizerShellActivationResult | null,
  message: string,
  issues: readonly DeploymentSterilizerShellActivationIssue[] = [],
  diagnostics?: DeploymentSterilizerShellActivationIssueDiagnostics | null,
): ServerDeploymentSterilizerShellActivationResult {
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
          diagnostics?.errorMessage ?? diagnostics?.exceptionMessage ?? "Sterilizer shell activation repository failed safely.",
          diagnostics,
        ),
      ];

  return {
    ...baseResult(command, assessment),
    status: "error",
    result: "error",
    blockers: blockerCount(safeIssues) || 1,
    warnings: warningCount(safeIssues),
    issues: safeIssues,
    message,
  };
}

function filterRuntimeIssues(
  issues: readonly DeploymentSterilizerShellActivationIssue[],
): DeploymentSterilizerShellActivationIssue[] {
  return issues.filter(
    (current) => current.code !== "sterilizer_shell_activation_persistence_unavailable",
  );
}

function blockerCount(
  issues: readonly DeploymentSterilizerShellActivationIssue[],
): number {
  return issues.filter((current) => current.severity === "blocker").length;
}

function warningCount(
  issues: readonly DeploymentSterilizerShellActivationIssue[],
): number {
  return issues.filter((current) => current.severity === "warning").length;
}

function issue(
  code: DeploymentSterilizerShellActivationIssue["code"],
  sessionId: string | null,
  executionKey: string | null,
  executionItemKey: string | null,
  planItemKey: string | null,
  sterilizerId: string | null,
  deploymentSterilizerKey: string | null,
  sequence: number | null,
  message: string,
  diagnostics: DeploymentSterilizerShellActivationIssueDiagnostics | null = null,
): DeploymentSterilizerShellActivationIssue {
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
    diagnostics,
  };
}

function createStaticSterilizerShellActivationSnapshotRepository(
  snapshot: DeploymentSterilizerShellActivationSnapshot,
): DeploymentSterilizerShellActivationRepository {
  return {
    async loadSterilizerShellActivationSnapshot() {
      return cloneSterilizerShellActivationSnapshot(snapshot);
    },
    async activateSterilizerShellAtomically() {
      throw new Error("Static sterilizer shell activation assessment repository cannot mutate sterilizer shells.");
    },
  };
}

function issueDiagnostics(
  caught: unknown,
  sensitiveToken: string | null,
): DeploymentSterilizerShellActivationIssueDiagnostics {
  if (caught instanceof DeploymentSterilizerShellActivationRepositoryError) {
    return {
      stage: caught.stage,
      operation: caught.operation,
      failureClassification: caught.failureClassification,
      layer: caught.layer,
      rpcAttempted: caught.rpcAttempted,
      dataReturned: caught.dataReturned,
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
      stage: "server_composition",
      operation: "activateSterilizerShellWithRepository",
      failureClassification: caught.name === "AbortError" || /\b(abort|timeout|timed out)\b/i.test(caught.message)
        ? "execution_timeout_or_abort"
        : "rpc_not_reached",
      layer: "server_composition",
      rpcAttempted: false,
      dataReturned: false,
      errorCode: null,
      errorMessage: null,
      errorDetails: null,
      errorHint: null,
      exceptionType: caught.name || "Error",
      exceptionMessage: sanitizeDiagnostic(caught.message, sensitiveToken),
    };
  }

  return {
    stage: "server_composition",
    operation: "activateSterilizerShellWithRepository",
    failureClassification: "rpc_not_reached",
    layer: "server_composition",
    rpcAttempted: false,
    dataReturned: false,
    errorCode: null,
    errorMessage: null,
    errorDetails: null,
    errorHint: null,
    exceptionType: typeof caught,
    exceptionMessage: sanitizeDiagnostic(String(caught), sensitiveToken),
  };
}


function zeroDownstream(): DeploymentSterilizerShellActivationDownstreamCounts {
  return {
    sterilizersActivated: 0,
    itemsCompleted: 0,
    dependenciesProgressed: 0,
    bindingsWritten: 0,
    sessionsCompleted: 0,
    rollbacksExecuted: 0,
    deploymentFinalized: 0,
  };
}

function readString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function readBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function sanitizeDiagnostic(value: string | null | undefined, sensitiveToken: string | null): string | null {
  if (!value) {
    return value ?? null;
  }

  return sensitiveToken ? value.split(sensitiveToken).join("[redacted]") : value;
}