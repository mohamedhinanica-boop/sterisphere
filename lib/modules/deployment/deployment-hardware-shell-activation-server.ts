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
  DeploymentHardwareShellActivationRepository,
} from "./deployment-hardware-shell-activation-repository";
import {
  DeploymentHardwareShellActivationService,
} from "./deployment-hardware-shell-activation-service";
import {
  DeploymentHardwareShellActivationRepositoryError,
  SupabaseDeploymentHardwareShellActivationRepository,
} from "./deployment-hardware-shell-activation-supabase-repository";
import {
  cloneHardwareShellActivationSnapshot,
  type DeploymentHardwareShellActivationAtomicCommand,
  type DeploymentHardwareShellActivationAtomicResult,
  type DeploymentHardwareShellActivationDownstreamCounts,
  type DeploymentHardwareShellActivationIssue,
  type DeploymentHardwareShellActivationIssueDiagnostics,
  type DeploymentHardwareShellActivationResult,
  type DeploymentHardwareShellActivationSnapshot,
} from "./deployment-hardware-shell-activation-types";

export type ServerDeploymentHardwareShellActivationStatus =
  | "activated"
  | "already_activated"
  | "not_attempted"
  | "blocked"
  | "conflict"
  | "not_found"
  | "error";

export interface ServerDeploymentHardwareShellActivationCommand {
  clinicId: string;
  deploymentRunId: string;
  deploymentActivationExecutionClaim:
    | ServerDeploymentActivationExecutionClaimResult
    | null;
  deploymentActivationExecutionNextItemStart:
    | ServerDeploymentActivationExecutionNextItemStartResult
    | null;
  hardwareActivatedAt?: string | null;
}

export interface ServerDeploymentHardwareShellActivationResult {
  ok: boolean;
  status: ServerDeploymentHardwareShellActivationStatus;
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
  hardwareId: string | null;
  deploymentHardwareKey: string | null;
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
  issues: readonly DeploymentHardwareShellActivationIssue[];
  downstream: DeploymentHardwareShellActivationDownstreamCounts;
}

export interface DeploymentHardwareShellActivationAtomicRepository
  extends DeploymentHardwareShellActivationRepository {
  activateHardwareShellAtomically(
    command: DeploymentHardwareShellActivationAtomicCommand,
  ): Promise<DeploymentHardwareShellActivationAtomicResult>;
}

export interface ActivateHardwareShellWithRepositoryOptions {
  claimantId?: string;
  ownershipTokenResolver?: (
    claim: ServerDeploymentActivationExecutionClaimResult,
  ) => string | null;
}

export async function activateHardwareShellForServerDeployment(
  client: SupabaseClient,
  command: ServerDeploymentHardwareShellActivationCommand,
): Promise<ServerDeploymentHardwareShellActivationResult> {
  return activateHardwareShellWithRepository(
    new SupabaseDeploymentHardwareShellActivationRepository(client),
    command,
  );
}

export async function activateHardwareShellWithRepository(
  repository: DeploymentHardwareShellActivationAtomicRepository,
  command: ServerDeploymentHardwareShellActivationCommand,
  options: ActivateHardwareShellWithRepositoryOptions = {},
): Promise<ServerDeploymentHardwareShellActivationResult> {
  const prerequisite = validatePrerequisite(command, options);

  if (!prerequisite.ok) {
    return prerequisite.result;
  }

  const activationCommand = prerequisite.activationCommand;
  const expectedLeaseExpiresAt = prerequisite.expectedLeaseExpiresAt;
  let latestAssessment: DeploymentHardwareShellActivationResult | null = null;

  try {
    const snapshot = await repository.loadHardwareShellActivationSnapshot({
      clinicId: activationCommand.clinicId,
      deploymentRunKey: activationCommand.deploymentRunKey,
      sessionId: activationCommand.sessionId,
      executionKey: activationCommand.executionKey,
    });
    const stableSnapshot = cloneHardwareShellActivationSnapshot(snapshot);
    const service = new DeploymentHardwareShellActivationService(
      createStaticHardwareShellActivationSnapshotRepository(stableSnapshot),
    );
    const assessment = await service.assessHardwareShellActivation(activationCommand);
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
          "Hardware shell is already activated. No hardware mutation was performed.",
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
        "Hardware shell activation assessment failed safely. No fallback mutation was attempted.",
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

    const atomicResult = await repository.activateHardwareShellAtomically(
      atomicCommand.command,
    );

    return mapAtomicResult(
      activationCommand,
      assessment,
      atomicResult,
      publicIssues,
    );
  } catch (caught) {
    return safeError(
      activationCommand,
      latestAssessment,
      "Hardware shell activation failed safely. No fallback mutation was attempted.",
      [],
      issueDiagnostics(caught, activationCommand.ownershipToken),
    );
  }
}

function validatePrerequisite(
  command: ServerDeploymentHardwareShellActivationCommand,
  options: ActivateHardwareShellWithRepositoryOptions,
):
  | {
      ok: true;
      activationCommand: Parameters<DeploymentHardwareShellActivationService["assessHardwareShellActivation"]>[0];
      expectedLeaseExpiresAt: string;
    }
  | { ok: false; result: ServerDeploymentHardwareShellActivationResult } {
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
          "Hardware shell activation was skipped because the deterministic next item is not running.",
      },
    };
  }

  if (
    nextItemStart.entityType !== "hardware_shell" ||
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
          "Hardware shell activation was not attempted because the running item targets another activation entity.",
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
            "Hardware shell activation could not access server-only ownership evidence.",
          ),
        ],
        message:
          "Hardware shell activation failed safely because server-only ownership evidence was unavailable.",
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
      now: command.hardwareActivatedAt ?? new Date().toISOString(),
    },
  };
}

function buildAtomicCommand(
  command: Parameters<DeploymentHardwareShellActivationService["assessHardwareShellActivation"]>[0],
  assessment: DeploymentHardwareShellActivationResult,
  expectedLeaseExpiresAt: string,
):
  | { ok: true; command: DeploymentHardwareShellActivationAtomicCommand }
  | { ok: false; result: ServerDeploymentHardwareShellActivationResult } {
  if (
    assessment.status !== "activatable" ||
    !assessment.itemId ||
    !assessment.executionItemKey ||
    !assessment.planItemKey ||
    assessment.sequence === null ||
    !assessment.entityId ||
    !assessment.itemStartedAt ||
    !assessment.hardwareId ||
    !assessment.deploymentHardwareKey
  ) {
    return {
      ok: false,
      result: safeError(
        command,
        assessment,
        "Hardware shell activation assessment did not produce complete atomic activation evidence.",
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
      expectedEntityType: "hardware_shell",
      expectedEntityId: assessment.entityId,
      expectedAction: "activate",
      expectedItemStartedAt: assessment.itemStartedAt,
      expectedAttemptCount: assessment.attemptCount,
      hardwareId: assessment.hardwareId,
      expectedHardwareKey: assessment.deploymentHardwareKey,
      expectedCurrentState: hardwareTransitionState(assessment.expectedCurrentState),
      targetState: {
        provisioningStatus: "active",
        active: true,
      },
      proposedActivatedAt: command.now,
    },
  };
}

function mapAtomicResult(
  command: Parameters<DeploymentHardwareShellActivationService["assessHardwareShellActivation"]>[0],
  assessment: DeploymentHardwareShellActivationResult,
  result: DeploymentHardwareShellActivationAtomicResult,
  assessmentIssues: readonly DeploymentHardwareShellActivationIssue[],
): ServerDeploymentHardwareShellActivationResult {
  if (result.status === "activated" || result.status === "already_activated") {
    return {
      ...baseResult(command, assessment),
      ok: true,
      status: result.status,
      result: result.status,
      hardwareId: result.hardwareId ?? assessment.hardwareId,
      deploymentHardwareKey: result.deploymentHardwareKey ?? assessment.deploymentHardwareKey,
      provisioningSourceBefore: readString(result.hardwareStateBefore?.provisioningSource) ?? assessment.hardwareProvisioningSource,
      provisioningSourceAfter: readString(result.hardwareStateAfter?.provisioningSource) ?? (result.status === "activated" ? "setup_draft" : assessment.hardwareProvisioningSource),
      provisioningStatusBefore: readString(result.hardwareStateBefore?.provisioningStatus) ?? assessment.hardwareProvisioningStatus,
      provisioningStatusAfter: readString(result.hardwareStateAfter?.provisioningStatus) ?? (result.status === "activated" ? "active" : assessment.hardwareProvisioningStatus),
      activeBefore: readBoolean(result.hardwareStateBefore?.active) ?? assessment.hardwareActive,
      activeAfter: readBoolean(result.hardwareStateAfter?.active) ?? (result.status === "activated" ? true : assessment.hardwareActive),
      activatedAt: result.activatedAt,
      activatedCount: result.status === "activated" ? 1 : 0,
      reusedCount: result.status === "already_activated" ? 1 : 0,
      warnings: warningCount(assessmentIssues),
      issues: assessmentIssues,
      message: result.status === "activated"
        ? "Hardware shell was atomically activated. No item completion, dependency progression, binding, rollback, or finalization occurred."
        : "Hardware shell was already activated. No hardware mutation was performed.",
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
      ? "missing_hardware_shell"
      : result.status === "conflict"
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
      ? `Atomic hardware shell activation RPC returned ${result.issueCode}.`
      : "Atomic hardware shell activation RPC did not activate the hardware shell.",
  );
  const issues = [...assessmentIssues, atomicIssue];

  return {
    ...baseResult(command, assessment),
    ok: false,
    status,
    result: result.status,
    hardwareId: result.hardwareId ?? assessment.hardwareId,
    deploymentHardwareKey: result.deploymentHardwareKey ?? assessment.deploymentHardwareKey,
    provisioningSourceBefore: readString(result.hardwareStateBefore?.provisioningSource) ?? assessment.hardwareProvisioningSource,
    provisioningSourceAfter: readString(result.hardwareStateAfter?.provisioningSource) ?? assessment.hardwareProvisioningSource,
    provisioningStatusBefore: readString(result.hardwareStateBefore?.provisioningStatus) ?? assessment.hardwareProvisioningStatus,
    provisioningStatusAfter: readString(result.hardwareStateAfter?.provisioningStatus) ?? assessment.hardwareProvisioningStatus,
    activeBefore: readBoolean(result.hardwareStateBefore?.active) ?? assessment.hardwareActive,
    activeAfter: readBoolean(result.hardwareStateAfter?.active) ?? assessment.hardwareActive,
    activatedAt: result.activatedAt,
    conflicts: status === "conflict" ? 1 : 0,
    blockers: blockerCount(issues) || 1,
    warnings: warningCount(issues),
    issues,
    message:
      result.message ||
      "Hardware shell activation did not activate the hardware shell. No fallback mutation was attempted.",
  };
}

function baseResult(
  command: Parameters<DeploymentHardwareShellActivationService["assessHardwareShellActivation"]>[0],
  assessment: DeploymentHardwareShellActivationResult | null,
): ServerDeploymentHardwareShellActivationResult {
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
    hardwareId: assessment?.hardwareId ?? null,
    deploymentHardwareKey: assessment?.deploymentHardwareKey ?? null,
    provisioningSourceBefore: assessment?.hardwareProvisioningSource ?? null,
    provisioningSourceAfter: assessment?.hardwareProvisioningSource ?? null,
    provisioningStatusBefore: assessment?.hardwareProvisioningStatus ?? null,
    provisioningStatusAfter: assessment?.hardwareProvisioningStatus ?? null,
    activeBefore: assessment?.hardwareActive ?? null,
    activeAfter: assessment?.hardwareActive ?? null,
    activatedAt: null,
  };
}

function emptyResult(input: {
  clinicId: string | null;
  deploymentRunKey: string | null;
  sessionId: string | null;
  executionKey: string | null;
  claimantId: string | null;
}): ServerDeploymentHardwareShellActivationResult {
  return {
    ok: false,
    status: "not_attempted",
    message: "Hardware shell activation was not attempted.",
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
    hardwareId: null,
    deploymentHardwareKey: null,
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
  command: Parameters<DeploymentHardwareShellActivationService["assessHardwareShellActivation"]>[0],
  assessment: DeploymentHardwareShellActivationResult | null,
  message: string,
  issues: readonly DeploymentHardwareShellActivationIssue[] = [],
  diagnostics?: DeploymentHardwareShellActivationIssueDiagnostics | null,
): ServerDeploymentHardwareShellActivationResult {
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
          diagnostics?.errorMessage ?? diagnostics?.exceptionMessage ?? "Hardware shell activation repository failed safely.",
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
  issues: readonly DeploymentHardwareShellActivationIssue[],
): DeploymentHardwareShellActivationIssue[] {
  return issues.filter(
    (current) => current.code !== "hardware_shell_activation_persistence_unavailable",
  );
}

function blockerCount(
  issues: readonly DeploymentHardwareShellActivationIssue[],
): number {
  return issues.filter((current) => current.severity === "blocker").length;
}

function warningCount(
  issues: readonly DeploymentHardwareShellActivationIssue[],
): number {
  return issues.filter((current) => current.severity === "warning").length;
}

function issue(
  code: DeploymentHardwareShellActivationIssue["code"],
  sessionId: string | null,
  executionKey: string | null,
  executionItemKey: string | null,
  planItemKey: string | null,
  hardwareId: string | null,
  deploymentHardwareKey: string | null,
  sequence: number | null,
  message: string,
  diagnostics: DeploymentHardwareShellActivationIssueDiagnostics | null = null,
): DeploymentHardwareShellActivationIssue {
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
    diagnostics,
  };
}

function createStaticHardwareShellActivationSnapshotRepository(
  snapshot: DeploymentHardwareShellActivationSnapshot,
): DeploymentHardwareShellActivationRepository {
  return {
    async loadHardwareShellActivationSnapshot() {
      return cloneHardwareShellActivationSnapshot(snapshot);
    },
    async activateHardwareShellAtomically() {
      throw new Error("Static hardware shell activation assessment repository cannot mutate hardware shells.");
    },
  };
}

function issueDiagnostics(
  caught: unknown,
  sensitiveToken: string | null,
): DeploymentHardwareShellActivationIssueDiagnostics {
  if (caught instanceof DeploymentHardwareShellActivationRepositoryError) {
    return {
      layer: caught.layer,
      rpcAttempted: rpcAttempted(caught.layer),
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
      layer: "server_composition",
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
    layer: "server_composition",
    rpcAttempted: false,
    errorCode: null,
    errorMessage: null,
    errorDetails: null,
    errorHint: null,
    exceptionType: typeof caught,
    exceptionMessage: sanitizeDiagnostic(String(caught), sensitiveToken),
  };
}

function rpcAttempted(layer: string): boolean {
  return layer === "atomic_rpc" || layer === "atomic_rpc_response_mapping";
}

function zeroDownstream(): DeploymentHardwareShellActivationDownstreamCounts {
  return {
    hardwaresActivated: 0,
    itemsCompleted: 0,
    dependenciesProgressed: 0,
    bindingsWritten: 0,
    sessionsCompleted: 0,
    rollbacksExecuted: 0,
    deploymentFinalized: 0,
  };
}

function hardwareTransitionState(state: Record<string, unknown> | null): Record<string, unknown> {
  return {
    deploymentHardwareKey: state?.deploymentHardwareKey ?? null,
    provisioningSource: state?.provisioningSource ?? null,
    provisioningStatus: state?.provisioningStatus ?? null,
    active: state?.active ?? null,
    operationalStatus: state?.operationalStatus ?? null,
    agentId: state?.agentId ?? null,
    defaultWorkstationId: state?.defaultWorkstationId ?? null,
    currentWorkstationId: state?.currentWorkstationId ?? null,
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