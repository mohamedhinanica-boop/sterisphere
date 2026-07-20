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
  DeploymentWorkstationShellActivationRepository,
} from "./deployment-workstation-shell-activation-repository";
import {
  DeploymentWorkstationShellActivationService,
} from "./deployment-workstation-shell-activation-service";
import {
  DeploymentWorkstationShellActivationRepositoryError,
  SupabaseDeploymentWorkstationShellActivationRepository,
} from "./deployment-workstation-shell-activation-supabase-repository";
import {
  cloneWorkstationShellActivationSnapshot,
  type DeploymentWorkstationShellActivationAtomicCommand,
  type DeploymentWorkstationShellActivationAtomicResult,
  type DeploymentWorkstationShellActivationDownstreamCounts,
  type DeploymentWorkstationShellActivationIssue,
  type DeploymentWorkstationShellActivationIssueDiagnostics,
  type DeploymentWorkstationShellActivationResult,
  type DeploymentWorkstationShellActivationSnapshot,
} from "./deployment-workstation-shell-activation-types";

export type ServerDeploymentWorkstationShellActivationStatus =
  | "activated"
  | "already_activated"
  | "not_attempted"
  | "blocked"
  | "conflict"
  | "not_found"
  | "error";

export interface ServerDeploymentWorkstationShellActivationCommand {
  clinicId: string;
  deploymentRunId: string;
  deploymentActivationExecutionClaim:
    | ServerDeploymentActivationExecutionClaimResult
    | null;
  deploymentActivationExecutionNextItemStart:
    | ServerDeploymentActivationExecutionNextItemStartResult
    | null;
  workstationActivatedAt?: string | null;
}

export interface ServerDeploymentWorkstationShellActivationResult {
  ok: boolean;
  status: ServerDeploymentWorkstationShellActivationStatus;
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
  workstationId: string | null;
  deploymentWorkstationKey: string | null;
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
  issues: readonly DeploymentWorkstationShellActivationIssue[];
  downstream: DeploymentWorkstationShellActivationDownstreamCounts;
}

export interface DeploymentWorkstationShellActivationAtomicRepository
  extends DeploymentWorkstationShellActivationRepository {
  activateWorkstationShellAtomically(
    command: DeploymentWorkstationShellActivationAtomicCommand,
  ): Promise<DeploymentWorkstationShellActivationAtomicResult>;
}

export interface ActivateWorkstationShellWithRepositoryOptions {
  claimantId?: string;
  ownershipTokenResolver?: (
    claim: ServerDeploymentActivationExecutionClaimResult,
  ) => string | null;
}

export async function activateWorkstationShellForServerDeployment(
  client: SupabaseClient,
  command: ServerDeploymentWorkstationShellActivationCommand,
): Promise<ServerDeploymentWorkstationShellActivationResult> {
  return activateWorkstationShellWithRepository(
    new SupabaseDeploymentWorkstationShellActivationRepository(client),
    command,
  );
}

export async function activateWorkstationShellWithRepository(
  repository: DeploymentWorkstationShellActivationAtomicRepository,
  command: ServerDeploymentWorkstationShellActivationCommand,
  options: ActivateWorkstationShellWithRepositoryOptions = {},
): Promise<ServerDeploymentWorkstationShellActivationResult> {
  const prerequisite = validatePrerequisite(command, options);

  if (!prerequisite.ok) {
    return prerequisite.result;
  }

  const activationCommand = prerequisite.activationCommand;
  const expectedLeaseExpiresAt = prerequisite.expectedLeaseExpiresAt;
  let latestAssessment: DeploymentWorkstationShellActivationResult | null = null;

  try {
    const snapshot = await repository.loadWorkstationShellActivationSnapshot({
      clinicId: activationCommand.clinicId,
      deploymentRunKey: activationCommand.deploymentRunKey,
      sessionId: activationCommand.sessionId,
      executionKey: activationCommand.executionKey,
    });
    const stableSnapshot = cloneWorkstationShellActivationSnapshot(snapshot);
    const service = new DeploymentWorkstationShellActivationService(
      createStaticWorkstationShellActivationSnapshotRepository(stableSnapshot),
    );
    const assessment = await service.assessWorkstationShellActivation(activationCommand);
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
          "Workstation shell is already activated. No workstation mutation was performed.",
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
        "Workstation shell activation assessment failed safely. No fallback mutation was attempted.",
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

    const atomicResult = await repository.activateWorkstationShellAtomically(
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
      "Workstation shell activation failed safely. No fallback mutation was attempted.",
      [],
      issueDiagnostics(caught, activationCommand.ownershipToken),
    );
  }
}

function validatePrerequisite(
  command: ServerDeploymentWorkstationShellActivationCommand,
  options: ActivateWorkstationShellWithRepositoryOptions,
):
  | {
      ok: true;
      activationCommand: Parameters<DeploymentWorkstationShellActivationService["assessWorkstationShellActivation"]>[0];
      expectedLeaseExpiresAt: string;
    }
  | { ok: false; result: ServerDeploymentWorkstationShellActivationResult } {
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
          "Workstation shell activation was skipped because the deterministic next item is not running.",
      },
    };
  }

  if (
    nextItemStart.entityType !== "workstation_shell" ||
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
          "Workstation shell activation was not attempted because the running item targets another activation entity.",
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
            "Workstation shell activation could not access server-only ownership evidence.",
          ),
        ],
        message:
          "Workstation shell activation failed safely because server-only ownership evidence was unavailable.",
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
      now: command.workstationActivatedAt ?? new Date().toISOString(),
    },
  };
}

function buildAtomicCommand(
  command: Parameters<DeploymentWorkstationShellActivationService["assessWorkstationShellActivation"]>[0],
  assessment: DeploymentWorkstationShellActivationResult,
  expectedLeaseExpiresAt: string,
):
  | { ok: true; command: DeploymentWorkstationShellActivationAtomicCommand }
  | { ok: false; result: ServerDeploymentWorkstationShellActivationResult } {
  if (
    assessment.status !== "activatable" ||
    !assessment.itemId ||
    !assessment.executionItemKey ||
    !assessment.planItemKey ||
    assessment.sequence === null ||
    !assessment.entityId ||
    !assessment.itemStartedAt ||
    !assessment.workstationId ||
    !assessment.deploymentWorkstationKey
  ) {
    return {
      ok: false,
      result: safeError(
        command,
        assessment,
        "Workstation shell activation assessment did not produce complete atomic activation evidence.",
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
      expectedEntityType: "workstation_shell",
      expectedEntityId: assessment.entityId,
      expectedAction: "activate",
      expectedItemStartedAt: assessment.itemStartedAt,
      expectedAttemptCount: assessment.attemptCount,
      workstationId: assessment.workstationId,
      expectedWorkstationKey: assessment.deploymentWorkstationKey,
      expectedCurrentState: {
        deploymentWorkstationKey: assessment.deploymentWorkstationKey,
        provisioningSource: assessment.workstationProvisioningSource,
        provisioningStatus: assessment.workstationProvisioningStatus,
        active: assessment.workstationActive,
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
  command: Parameters<DeploymentWorkstationShellActivationService["assessWorkstationShellActivation"]>[0],
  assessment: DeploymentWorkstationShellActivationResult,
  result: DeploymentWorkstationShellActivationAtomicResult,
  assessmentIssues: readonly DeploymentWorkstationShellActivationIssue[],
): ServerDeploymentWorkstationShellActivationResult {
  if (result.status === "activated" || result.status === "already_activated") {
    return {
      ...baseResult(command, assessment),
      ok: true,
      status: result.status,
      result: result.status,
      workstationId: result.workstationId ?? assessment.workstationId,
      deploymentWorkstationKey: result.deploymentWorkstationKey ?? assessment.deploymentWorkstationKey,
      provisioningSourceBefore: readString(result.workstationStateBefore?.provisioningSource) ?? assessment.workstationProvisioningSource,
      provisioningSourceAfter: readString(result.workstationStateAfter?.provisioningSource) ?? (result.status === "activated" ? "setup_draft" : assessment.workstationProvisioningSource),
      provisioningStatusBefore: readString(result.workstationStateBefore?.provisioningStatus) ?? assessment.workstationProvisioningStatus,
      provisioningStatusAfter: readString(result.workstationStateAfter?.provisioningStatus) ?? (result.status === "activated" ? "active" : assessment.workstationProvisioningStatus),
      activeBefore: readBoolean(result.workstationStateBefore?.active) ?? assessment.workstationActive,
      activeAfter: readBoolean(result.workstationStateAfter?.active) ?? (result.status === "activated" ? true : assessment.workstationActive),
      activatedAt: result.activatedAt,
      activatedCount: result.status === "activated" ? 1 : 0,
      reusedCount: result.status === "already_activated" ? 1 : 0,
      warnings: warningCount(assessmentIssues),
      issues: assessmentIssues,
      message: result.status === "activated"
        ? "Workstation shell was atomically activated. No item completion, dependency progression, binding, rollback, or finalization occurred."
        : "Workstation shell was already activated. No workstation mutation was performed.",
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
      ? "missing_workstation_shell"
      : result.status === "conflict"
        ? "workstation_identity_mismatch"
        : "repository_error",
    command.sessionId,
    command.executionKey,
    result.executionItemKey ?? assessment.executionItemKey,
    result.planItemKey ?? assessment.planItemKey,
    result.workstationId ?? assessment.workstationId,
    result.deploymentWorkstationKey ?? assessment.deploymentWorkstationKey,
    result.sequence ?? assessment.sequence,
    result.issueCode
      ? `Atomic workstation shell activation RPC returned ${result.issueCode}.`
      : "Atomic workstation shell activation RPC did not activate the workstation shell.",
  );
  const issues = [...assessmentIssues, atomicIssue];

  return {
    ...baseResult(command, assessment),
    ok: false,
    status,
    result: result.status,
    workstationId: result.workstationId ?? assessment.workstationId,
    deploymentWorkstationKey: result.deploymentWorkstationKey ?? assessment.deploymentWorkstationKey,
    provisioningSourceBefore: readString(result.workstationStateBefore?.provisioningSource) ?? assessment.workstationProvisioningSource,
    provisioningSourceAfter: readString(result.workstationStateAfter?.provisioningSource) ?? assessment.workstationProvisioningSource,
    provisioningStatusBefore: readString(result.workstationStateBefore?.provisioningStatus) ?? assessment.workstationProvisioningStatus,
    provisioningStatusAfter: readString(result.workstationStateAfter?.provisioningStatus) ?? assessment.workstationProvisioningStatus,
    activeBefore: readBoolean(result.workstationStateBefore?.active) ?? assessment.workstationActive,
    activeAfter: readBoolean(result.workstationStateAfter?.active) ?? assessment.workstationActive,
    activatedAt: result.activatedAt,
    conflicts: status === "conflict" ? 1 : 0,
    blockers: blockerCount(issues) || 1,
    warnings: warningCount(issues),
    issues,
    message:
      result.message ||
      "Workstation shell activation did not activate the workstation shell. No fallback mutation was attempted.",
  };
}

function baseResult(
  command: Parameters<DeploymentWorkstationShellActivationService["assessWorkstationShellActivation"]>[0],
  assessment: DeploymentWorkstationShellActivationResult | null,
): ServerDeploymentWorkstationShellActivationResult {
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
    workstationId: assessment?.workstationId ?? null,
    deploymentWorkstationKey: assessment?.deploymentWorkstationKey ?? null,
    provisioningSourceBefore: assessment?.workstationProvisioningSource ?? null,
    provisioningSourceAfter: assessment?.workstationProvisioningSource ?? null,
    provisioningStatusBefore: assessment?.workstationProvisioningStatus ?? null,
    provisioningStatusAfter: assessment?.workstationProvisioningStatus ?? null,
    activeBefore: assessment?.workstationActive ?? null,
    activeAfter: assessment?.workstationActive ?? null,
    activatedAt: null,
  };
}

function emptyResult(input: {
  clinicId: string | null;
  deploymentRunKey: string | null;
  sessionId: string | null;
  executionKey: string | null;
  claimantId: string | null;
}): ServerDeploymentWorkstationShellActivationResult {
  return {
    ok: false,
    status: "not_attempted",
    message: "Workstation shell activation was not attempted.",
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
    workstationId: null,
    deploymentWorkstationKey: null,
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
  command: Parameters<DeploymentWorkstationShellActivationService["assessWorkstationShellActivation"]>[0],
  assessment: DeploymentWorkstationShellActivationResult | null,
  message: string,
  issues: readonly DeploymentWorkstationShellActivationIssue[] = [],
  diagnostics?: DeploymentWorkstationShellActivationIssueDiagnostics | null,
): ServerDeploymentWorkstationShellActivationResult {
  const safeIssues = issues.length
    ? issues
    : [
        issue(
          "repository_error",
          command.sessionId,
          command.executionKey,
          assessment?.executionItemKey ?? null,
          assessment?.planItemKey ?? null,
          assessment?.workstationId ?? null,
          assessment?.deploymentWorkstationKey ?? null,
          assessment?.sequence ?? null,
          diagnostics?.errorMessage ?? diagnostics?.exceptionMessage ?? "Workstation shell activation repository failed safely.",
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
  issues: readonly DeploymentWorkstationShellActivationIssue[],
): DeploymentWorkstationShellActivationIssue[] {
  return issues.filter(
    (current) => current.code !== "workstation_shell_activation_persistence_unavailable",
  );
}

function blockerCount(
  issues: readonly DeploymentWorkstationShellActivationIssue[],
): number {
  return issues.filter((current) => current.severity === "blocker").length;
}

function warningCount(
  issues: readonly DeploymentWorkstationShellActivationIssue[],
): number {
  return issues.filter((current) => current.severity === "warning").length;
}

function issue(
  code: DeploymentWorkstationShellActivationIssue["code"],
  sessionId: string | null,
  executionKey: string | null,
  executionItemKey: string | null,
  planItemKey: string | null,
  workstationId: string | null,
  deploymentWorkstationKey: string | null,
  sequence: number | null,
  message: string,
  diagnostics: DeploymentWorkstationShellActivationIssueDiagnostics | null = null,
): DeploymentWorkstationShellActivationIssue {
  return {
    code,
    severity: "blocker",
    sessionId,
    executionKey,
    executionItemKey,
    planItemKey,
    workstationId,
    deploymentWorkstationKey,
    sequence,
    message,
    diagnostics,
  };
}

function createStaticWorkstationShellActivationSnapshotRepository(
  snapshot: DeploymentWorkstationShellActivationSnapshot,
): DeploymentWorkstationShellActivationRepository {
  return {
    async loadWorkstationShellActivationSnapshot() {
      return cloneWorkstationShellActivationSnapshot(snapshot);
    },
    async activateWorkstationShellAtomically() {
      throw new Error("Static workstation shell activation assessment repository cannot mutate workstation shells.");
    },
  };
}

function issueDiagnostics(
  caught: unknown,
  sensitiveToken: string | null,
): DeploymentWorkstationShellActivationIssueDiagnostics {
  if (caught instanceof DeploymentWorkstationShellActivationRepositoryError) {
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

function zeroDownstream(): DeploymentWorkstationShellActivationDownstreamCounts {
  return {
    workstationsActivated: 0,
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