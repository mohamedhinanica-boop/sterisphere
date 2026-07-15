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
  DeploymentProviderShellActivationRepository,
} from "./deployment-provider-shell-activation-repository";
import {
  DeploymentProviderShellActivationService,
} from "./deployment-provider-shell-activation-service";
import {
  DeploymentProviderShellActivationRepositoryError,
  SupabaseDeploymentProviderShellActivationRepository,
} from "./deployment-provider-shell-activation-supabase-repository";
import {
  cloneProviderShellActivationSnapshot,
  type DeploymentProviderShellActivationAtomicCommand,
  type DeploymentProviderShellActivationAtomicResult,
  type DeploymentProviderShellActivationDownstreamCounts,
  type DeploymentProviderShellActivationIssue,
  type DeploymentProviderShellActivationIssueDiagnostics,
  type DeploymentProviderShellActivationResult,
  type DeploymentProviderShellActivationSnapshot,
} from "./deployment-provider-shell-activation-types";

export type ServerDeploymentProviderShellActivationStatus =
  | "activated"
  | "already_activated"
  | "not_attempted"
  | "blocked"
  | "conflict"
  | "not_found"
  | "error";

export interface ServerDeploymentProviderShellActivationCommand {
  clinicId: string;
  deploymentRunId: string;
  deploymentActivationExecutionClaim:
    | ServerDeploymentActivationExecutionClaimResult
    | null;
  deploymentActivationExecutionNextItemStart:
    | ServerDeploymentActivationExecutionNextItemStartResult
    | null;
  providerActivatedAt?: string | null;
}

export interface ServerDeploymentProviderShellActivationResult {
  ok: boolean;
  status: ServerDeploymentProviderShellActivationStatus;
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
  providerId: string | null;
  deploymentProviderKey: string | null;
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
  issues: readonly DeploymentProviderShellActivationIssue[];
  downstream: DeploymentProviderShellActivationDownstreamCounts;
}

export interface DeploymentProviderShellActivationAtomicRepository
  extends DeploymentProviderShellActivationRepository {
  activateProviderShellAtomically(
    command: DeploymentProviderShellActivationAtomicCommand,
  ): Promise<DeploymentProviderShellActivationAtomicResult>;
}

export interface ActivateProviderShellWithRepositoryOptions {
  claimantId?: string;
  ownershipTokenResolver?: (
    claim: ServerDeploymentActivationExecutionClaimResult,
  ) => string | null;
}

export async function activateProviderShellForServerDeployment(
  client: SupabaseClient,
  command: ServerDeploymentProviderShellActivationCommand,
): Promise<ServerDeploymentProviderShellActivationResult> {
  return activateProviderShellWithRepository(
    new SupabaseDeploymentProviderShellActivationRepository(client),
    command,
  );
}

export async function activateProviderShellWithRepository(
  repository: DeploymentProviderShellActivationAtomicRepository,
  command: ServerDeploymentProviderShellActivationCommand,
  options: ActivateProviderShellWithRepositoryOptions = {},
): Promise<ServerDeploymentProviderShellActivationResult> {
  const prerequisite = validatePrerequisite(command, options);

  if (!prerequisite.ok) {
    return prerequisite.result;
  }

  const activationCommand = prerequisite.activationCommand;
  const expectedLeaseExpiresAt = prerequisite.expectedLeaseExpiresAt;
  let latestAssessment: DeploymentProviderShellActivationResult | null = null;

  try {
    const snapshot = await repository.loadProviderShellActivationSnapshot({
      clinicId: activationCommand.clinicId,
      deploymentRunKey: activationCommand.deploymentRunKey,
      sessionId: activationCommand.sessionId,
      executionKey: activationCommand.executionKey,
    });
    const stableSnapshot = cloneProviderShellActivationSnapshot(snapshot);
    const service = new DeploymentProviderShellActivationService(
      createStaticProviderShellActivationSnapshotRepository(stableSnapshot),
    );
    const assessment = await service.assessProviderShellActivation(activationCommand);
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
          "Provider shell is already activated. No provider mutation was performed.",
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
        "Provider shell activation assessment failed safely. No fallback mutation was attempted.",
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

    const atomicResult = await repository.activateProviderShellAtomically(
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
      "Provider shell activation failed safely. No fallback mutation was attempted.",
      [],
      issueDiagnostics(caught, activationCommand.ownershipToken),
    );
  }
}

function validatePrerequisite(
  command: ServerDeploymentProviderShellActivationCommand,
  options: ActivateProviderShellWithRepositoryOptions,
):
  | {
      ok: true;
      activationCommand: Parameters<DeploymentProviderShellActivationService["assessProviderShellActivation"]>[0];
      expectedLeaseExpiresAt: string;
    }
  | { ok: false; result: ServerDeploymentProviderShellActivationResult } {
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
          "Provider shell activation was skipped because the deterministic next item is not running.",
      },
    };
  }

  if (
    nextItemStart.entityType !== "provider_shell" ||
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
          "Provider shell activation was not attempted because the running item targets another activation entity.",
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
            "Provider shell activation could not access server-only ownership evidence.",
          ),
        ],
        message:
          "Provider shell activation failed safely because server-only ownership evidence was unavailable.",
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
      now: command.providerActivatedAt ?? new Date().toISOString(),
    },
  };
}

function buildAtomicCommand(
  command: Parameters<DeploymentProviderShellActivationService["assessProviderShellActivation"]>[0],
  assessment: DeploymentProviderShellActivationResult,
  expectedLeaseExpiresAt: string,
):
  | { ok: true; command: DeploymentProviderShellActivationAtomicCommand }
  | { ok: false; result: ServerDeploymentProviderShellActivationResult } {
  if (
    assessment.status !== "activatable" ||
    !assessment.itemId ||
    !assessment.executionItemKey ||
    !assessment.planItemKey ||
    assessment.sequence === null ||
    !assessment.entityId ||
    !assessment.itemStartedAt ||
    !assessment.providerId ||
    !assessment.deploymentProviderKey
  ) {
    return {
      ok: false,
      result: safeError(
        command,
        assessment,
        "Provider shell activation assessment did not produce complete atomic activation evidence.",
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
      expectedEntityType: "provider_shell",
      expectedEntityId: assessment.entityId,
      expectedAction: "activate",
      expectedItemStartedAt: assessment.itemStartedAt,
      expectedAttemptCount: assessment.attemptCount,
      providerId: assessment.providerId,
      expectedProviderKey: assessment.deploymentProviderKey,
      expectedCurrentState: {
        deploymentProviderKey: assessment.deploymentProviderKey,
        provisioningSource: assessment.providerProvisioningSource,
        provisioningStatus: assessment.providerProvisioningStatus,
        active: assessment.providerActive,
      },
      targetState: {
        deploymentProviderKey: assessment.deploymentProviderKey,
        provisioningSource: "setup_draft",
        provisioningStatus: "active",
        active: true,
      },
      proposedActivatedAt: command.now,
    },
  };
}

function mapAtomicResult(
  command: Parameters<DeploymentProviderShellActivationService["assessProviderShellActivation"]>[0],
  assessment: DeploymentProviderShellActivationResult,
  result: DeploymentProviderShellActivationAtomicResult,
  assessmentIssues: readonly DeploymentProviderShellActivationIssue[],
): ServerDeploymentProviderShellActivationResult {
  if (result.status === "activated" || result.status === "already_activated") {
    return {
      ...baseResult(command, assessment),
      ok: true,
      status: result.status,
      result: result.status,
      providerId: result.providerId ?? assessment.providerId,
      deploymentProviderKey: result.deploymentProviderKey ?? assessment.deploymentProviderKey,
      provisioningSourceBefore: readString(result.providerStateBefore?.provisioningSource) ?? assessment.providerProvisioningSource,
      provisioningSourceAfter: readString(result.providerStateAfter?.provisioningSource) ?? (result.status === "activated" ? "setup_draft" : assessment.providerProvisioningSource),
      provisioningStatusBefore: readString(result.providerStateBefore?.provisioningStatus) ?? assessment.providerProvisioningStatus,
      provisioningStatusAfter: readString(result.providerStateAfter?.provisioningStatus) ?? (result.status === "activated" ? "active" : assessment.providerProvisioningStatus),
      activeBefore: readBoolean(result.providerStateBefore?.active) ?? assessment.providerActive,
      activeAfter: readBoolean(result.providerStateAfter?.active) ?? (result.status === "activated" ? true : assessment.providerActive),
      activatedAt: result.activatedAt,
      activatedCount: result.status === "activated" ? 1 : 0,
      reusedCount: result.status === "already_activated" ? 1 : 0,
      warnings: warningCount(assessmentIssues),
      issues: assessmentIssues,
      message: result.status === "activated"
        ? "Provider shell was atomically activated. No item completion, dependency progression, binding, rollback, or finalization occurred."
        : "Provider shell was already activated. No provider mutation was performed.",
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
      ? "missing_provider_shell"
      : result.status === "conflict"
        ? "provider_identity_mismatch"
        : "repository_error",
    command.sessionId,
    command.executionKey,
    result.executionItemKey ?? assessment.executionItemKey,
    result.planItemKey ?? assessment.planItemKey,
    result.providerId ?? assessment.providerId,
    result.deploymentProviderKey ?? assessment.deploymentProviderKey,
    result.sequence ?? assessment.sequence,
    result.issueCode
      ? `Atomic provider shell activation RPC returned ${result.issueCode}.`
      : "Atomic provider shell activation RPC did not activate the provider shell.",
  );
  const issues = [...assessmentIssues, atomicIssue];

  return {
    ...baseResult(command, assessment),
    ok: false,
    status,
    result: result.status,
    providerId: result.providerId ?? assessment.providerId,
    deploymentProviderKey: result.deploymentProviderKey ?? assessment.deploymentProviderKey,
    provisioningSourceBefore: readString(result.providerStateBefore?.provisioningSource) ?? assessment.providerProvisioningSource,
    provisioningSourceAfter: readString(result.providerStateAfter?.provisioningSource) ?? assessment.providerProvisioningSource,
    provisioningStatusBefore: readString(result.providerStateBefore?.provisioningStatus) ?? assessment.providerProvisioningStatus,
    provisioningStatusAfter: readString(result.providerStateAfter?.provisioningStatus) ?? assessment.providerProvisioningStatus,
    activeBefore: readBoolean(result.providerStateBefore?.active) ?? assessment.providerActive,
    activeAfter: readBoolean(result.providerStateAfter?.active) ?? assessment.providerActive,
    activatedAt: result.activatedAt,
    conflicts: status === "conflict" ? 1 : 0,
    blockers: blockerCount(issues) || 1,
    warnings: warningCount(issues),
    issues,
    message:
      result.message ||
      "Provider shell activation did not activate the provider shell. No fallback mutation was attempted.",
  };
}

function baseResult(
  command: Parameters<DeploymentProviderShellActivationService["assessProviderShellActivation"]>[0],
  assessment: DeploymentProviderShellActivationResult | null,
): ServerDeploymentProviderShellActivationResult {
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
    providerId: assessment?.providerId ?? null,
    deploymentProviderKey: assessment?.deploymentProviderKey ?? null,
    provisioningSourceBefore: assessment?.providerProvisioningSource ?? null,
    provisioningSourceAfter: assessment?.providerProvisioningSource ?? null,
    provisioningStatusBefore: assessment?.providerProvisioningStatus ?? null,
    provisioningStatusAfter: assessment?.providerProvisioningStatus ?? null,
    activeBefore: assessment?.providerActive ?? null,
    activeAfter: assessment?.providerActive ?? null,
    activatedAt: null,
  };
}

function emptyResult(input: {
  clinicId: string | null;
  deploymentRunKey: string | null;
  sessionId: string | null;
  executionKey: string | null;
  claimantId: string | null;
}): ServerDeploymentProviderShellActivationResult {
  return {
    ok: false,
    status: "not_attempted",
    message: "Provider shell activation was not attempted.",
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
    providerId: null,
    deploymentProviderKey: null,
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
  command: Parameters<DeploymentProviderShellActivationService["assessProviderShellActivation"]>[0],
  assessment: DeploymentProviderShellActivationResult | null,
  message: string,
  issues: readonly DeploymentProviderShellActivationIssue[] = [],
  diagnostics?: DeploymentProviderShellActivationIssueDiagnostics | null,
): ServerDeploymentProviderShellActivationResult {
  const safeIssues = issues.length
    ? issues
    : [
        issue(
          "repository_error",
          command.sessionId,
          command.executionKey,
          assessment?.executionItemKey ?? null,
          assessment?.planItemKey ?? null,
          assessment?.providerId ?? null,
          assessment?.deploymentProviderKey ?? null,
          assessment?.sequence ?? null,
          diagnostics?.errorMessage ?? diagnostics?.exceptionMessage ?? "Provider shell activation repository failed safely.",
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
  issues: readonly DeploymentProviderShellActivationIssue[],
): DeploymentProviderShellActivationIssue[] {
  return issues.filter(
    (current) => current.code !== "provider_shell_activation_persistence_unavailable",
  );
}

function blockerCount(
  issues: readonly DeploymentProviderShellActivationIssue[],
): number {
  return issues.filter((current) => current.severity === "blocker").length;
}

function warningCount(
  issues: readonly DeploymentProviderShellActivationIssue[],
): number {
  return issues.filter((current) => current.severity === "warning").length;
}

function issue(
  code: DeploymentProviderShellActivationIssue["code"],
  sessionId: string | null,
  executionKey: string | null,
  executionItemKey: string | null,
  planItemKey: string | null,
  providerId: string | null,
  deploymentProviderKey: string | null,
  sequence: number | null,
  message: string,
  diagnostics: DeploymentProviderShellActivationIssueDiagnostics | null = null,
): DeploymentProviderShellActivationIssue {
  return {
    code,
    severity: "blocker",
    sessionId,
    executionKey,
    executionItemKey,
    planItemKey,
    providerId,
    deploymentProviderKey,
    sequence,
    message,
    diagnostics,
  };
}

function createStaticProviderShellActivationSnapshotRepository(
  snapshot: DeploymentProviderShellActivationSnapshot,
): DeploymentProviderShellActivationRepository {
  return {
    async loadProviderShellActivationSnapshot() {
      return cloneProviderShellActivationSnapshot(snapshot);
    },
    async activateProviderShellAtomically() {
      throw new Error("Static provider shell activation assessment repository cannot mutate provider shells.");
    },
  };
}

function issueDiagnostics(
  caught: unknown,
  sensitiveToken: string | null,
): DeploymentProviderShellActivationIssueDiagnostics {
  if (caught instanceof DeploymentProviderShellActivationRepositoryError) {
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

function zeroDownstream(): DeploymentProviderShellActivationDownstreamCounts {
  return {
    providersActivated: 0,
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