import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getServerDeploymentActivationExecutionClaimOwnershipToken,
  SETUP_RUNTIME_ACTIVATION_EXECUTION_CLAIMANT_ID,
  type ServerDeploymentActivationExecutionClaimResult,
} from "./deployment-activation-execution-claim-server";
import type {
  ServerDeploymentActivationExecutionItemStartResult,
} from "./deployment-activation-execution-item-start-server";
import type {
  DeploymentClinicActivationRepository,
} from "./deployment-clinic-activation-repository";
import {
  DeploymentClinicActivationService,
} from "./deployment-clinic-activation-service";
import {
  DeploymentClinicActivationRepositoryError,
  SupabaseDeploymentClinicActivationRepository,
} from "./deployment-clinic-activation-supabase-repository";
import {
  cloneClinicActivationSnapshot,
  cloneRecord,
  type DeploymentClinicActivationAtomicCommand,
  type DeploymentClinicActivationAtomicResult,
  type DeploymentClinicActivationCommand,
  type DeploymentClinicActivationDownstreamCounts,
  type DeploymentClinicActivationIssue,
  type DeploymentClinicActivationIssueDiagnostics,
  type DeploymentClinicActivationResult,
  type DeploymentClinicActivationSnapshot,
} from "./deployment-clinic-activation-types";

export type ServerDeploymentClinicActivationStatus =
  | "activated"
  | "already_activated"
  | "blocked"
  | "conflict"
  | "not_found"
  | "error"
  | "not_attempted";

export interface ServerDeploymentClinicActivationCommand {
  clinicId: string;
  deploymentRunId: string;
  deploymentActivationExecutionClaim:
    | ServerDeploymentActivationExecutionClaimResult
    | null;
  deploymentActivationExecutionItemStart:
    | ServerDeploymentActivationExecutionItemStartResult
    | null;
  activationRequestedAt?: string | null;
}

export interface ServerDeploymentClinicActivationResult {
  ok: boolean;
  status: ServerDeploymentClinicActivationStatus;
  claimantId: string | null;
  clinicId: string | null;
  deploymentRunId: string | null;
  sessionId: string | null;
  executionKey: string | null;
  itemId: string | null;
  executionItemKey: string | null;
  planItemKey: string | null;
  currentClinicState: Record<string, unknown> | null;
  targetClinicState: Record<string, unknown> | null;
  deployedAt: string | null;
  activationResult:
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
  issues: readonly DeploymentClinicActivationIssue[];
  downstream: DeploymentClinicActivationDownstreamCounts;
  message: string;
}

interface InternalClinicActivationCommand extends DeploymentClinicActivationCommand {
  expectedItemStartedAt: string;
}

export interface DeploymentClinicActivationAtomicRepository
  extends DeploymentClinicActivationRepository {
  activateClinicAtomically(
    command: DeploymentClinicActivationAtomicCommand,
  ): Promise<DeploymentClinicActivationAtomicResult>;
}

export interface ActivateClinicForServerDeploymentOptions {
  claimantId?: string;
  ownershipTokenResolver?: (
    claim: ServerDeploymentActivationExecutionClaimResult,
  ) => string | null;
}

export async function activateClinicForServerDeployment(
  client: SupabaseClient,
  command: ServerDeploymentClinicActivationCommand,
): Promise<ServerDeploymentClinicActivationResult> {
  return activateClinicWithRepository(
    new SupabaseDeploymentClinicActivationRepository(client),
    command,
  );
}

export async function activateClinicWithRepository(
  repository: DeploymentClinicActivationAtomicRepository,
  command: ServerDeploymentClinicActivationCommand,
  options: ActivateClinicForServerDeploymentOptions = {},
): Promise<ServerDeploymentClinicActivationResult> {
  const prerequisite = validatePrerequisite(command, options);

  if (!prerequisite.ok) {
    return prerequisite.result;
  }

  const activationCommand = prerequisite.activationCommand;

  try {
    const snapshot = await repository.loadClinicActivationSnapshot({
      clinicId: activationCommand.clinicId,
      deploymentRunId: activationCommand.deploymentRunId,
      sessionId: activationCommand.sessionId,
      executionKey: activationCommand.executionKey,
      itemId: activationCommand.itemId,
      executionItemKey: activationCommand.executionItemKey,
      planItemKey: activationCommand.planItemKey,
    });
    const stableSnapshot = cloneClinicActivationSnapshot(snapshot);
    const service = new DeploymentClinicActivationService(
      createStaticClinicActivationSnapshotRepository(stableSnapshot),
    );
    const assessment = await service.assessClinicActivation(activationCommand);
    const publicIssues = filterRuntimeIssues(assessment.issues);

    if (assessment.status === "already_activated") {
      return {
        ...baseResult(activationCommand, assessment),
        ok: true,
        status: "already_activated",
        activationResult: "already_activated",
        reusedCount: 1,
        warnings: warningCount(publicIssues),
        issues: publicIssues,
        deployedAt: stableSnapshot.clinic?.deployedAt ?? null,
        message:
          "The existing deployed clinic deployment state was reused. The execution item remains running and no dependent item was unlocked.",
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
        activationResult: assessment.status,
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
        "Clinic activation assessment failed safely. No fallback mutation was attempted.",
        publicIssues,
      );
    }

    const atomicCommand = buildAtomicCommand(activationCommand, assessment);

    if (!atomicCommand.ok) {
      return atomicCommand.result;
    }

    const atomicResult = await repository.activateClinicAtomically(
      atomicCommand.command,
    );

    return mapAtomicResult(
      activationCommand,
      assessment,
      atomicResult,
      publicIssues,
    );
  } catch (error) {
    return safeError(
      activationCommand,
      null,
      "Clinic activation failed safely. No fallback mutation was attempted.",
      [],
      diagnosticsFromUnknownError(error),
    );
  }
}

function validatePrerequisite(
  command: ServerDeploymentClinicActivationCommand,
  options: ActivateClinicForServerDeploymentOptions,
):
  | {
      ok: true;
      activationCommand: InternalClinicActivationCommand;
    }
  | { ok: false; result: ServerDeploymentClinicActivationResult } {
  const itemStart = command.deploymentActivationExecutionItemStart;
  const claim = command.deploymentActivationExecutionClaim;
  const claimantId =
    options.claimantId ?? SETUP_RUNTIME_ACTIVATION_EXECUTION_CLAIMANT_ID;

  if (
    !itemStart?.ok ||
    !["started", "already_started"].includes(itemStart.status) ||
    !itemStart.sessionId ||
    !itemStart.executionKey ||
    !itemStart.itemId ||
    !itemStart.executionItemKey ||
    !itemStart.planItemKey ||
    !itemStart.claimantId ||
    !itemStart.leaseExpiresAt ||
    !itemStart.startedAt ||
    !claim?.ok
  ) {
    return {
      ok: false,
      result: {
        ...emptyResult({
          clinicId: command.clinicId,
          deploymentRunId: command.deploymentRunId,
          sessionId: itemStart?.sessionId ?? claim?.sessionId ?? null,
          executionKey: itemStart?.executionKey ?? claim?.executionKey ?? null,
          claimantId: itemStart?.claimantId ?? claim?.claimantId ?? claimantId,
        }),
        message:
          "Clinic activation was skipped because activation execution item start did not complete successfully.",
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
          clinicId: command.clinicId,
          deploymentRunId: command.deploymentRunId,
          sessionId: itemStart.sessionId,
          executionKey: itemStart.executionKey,
          claimantId: itemStart.claimantId,
        }),
        status: "error",
        blockers: 1,
        issues: [
          issue(
            "repository_error",
            itemStart.sessionId,
            itemStart.executionKey,
            itemStart.executionItemKey,
            itemStart.planItemKey,
            "Clinic activation could not access server-only ownership evidence.",
          ),
        ],
        message:
          "Clinic activation failed safely because server-only ownership evidence was unavailable.",
      },
    };
  }

  const stableTimestamp =
    command.activationRequestedAt ?? new Date().toISOString();

  return {
    ok: true,
    activationCommand: {
      clinicId: command.clinicId,
      deploymentRunId: command.deploymentRunId,
      sessionId: itemStart.sessionId,
      executionKey: itemStart.executionKey,
      itemId: itemStart.itemId,
      executionItemKey: itemStart.executionItemKey,
      planItemKey: itemStart.planItemKey,
      claimantId: itemStart.claimantId,
      ownershipToken,
      assessmentTimestamp: stableTimestamp,
      expectedItemStartedAt: itemStart.startedAt,
    },
  };
}

function buildAtomicCommand(
  command: InternalClinicActivationCommand,
  assessment: DeploymentClinicActivationResult,
):
  | { ok: true; command: DeploymentClinicActivationAtomicCommand }
  | { ok: false; result: ServerDeploymentClinicActivationResult } {
  if (
    assessment.status !== "activation_ready" ||
    !assessment.leaseExpiresAt ||
    !assessment.itemId ||
    !assessment.executionItemKey ||
    !assessment.planItemKey ||
    !assessment.currentClinicState ||
    !assessment.proposedClinicState
  ) {
    return {
      ok: false,
      result: safeError(
        command,
        assessment,
        "Clinic activation assessment did not produce complete atomic activation evidence.",
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
      expectedItemStartedAt: command.expectedItemStartedAt,
      expectedAttemptCount: 1,
      expectedCurrentState: cloneRecord(assessment.currentClinicState),
      targetState: { deploymentStatus: "deployed" },
      proposedActivatedAt: command.assessmentTimestamp,
    },
  };
}

function mapAtomicResult(
  command: InternalClinicActivationCommand,
  assessment: DeploymentClinicActivationResult,
  result: DeploymentClinicActivationAtomicResult,
  assessmentIssues: readonly DeploymentClinicActivationIssue[],
): ServerDeploymentClinicActivationResult {
  if (result.status === "activated") {
    return {
      ...baseResult(command, assessment),
      ok: true,
      status: "activated",
      currentClinicState: result.clinicStateBefore ?? assessment.currentClinicState,
      targetClinicState: result.clinicStateAfter ?? assessment.proposedClinicState,
      deployedAt: result.activatedAt ?? command.assessmentTimestamp,
      activationResult: result.status,
      activatedCount: 1,
      warnings: warningCount(assessmentIssues),
      issues: assessmentIssues,
      message:
        "The clinic deployment state is deployed. The execution item is still running and no dependent item has been unlocked.",
    };
  }

  if (result.status === "already_activated") {
    return {
      ...baseResult(command, assessment),
      ok: true,
      status: "already_activated",
      currentClinicState: result.clinicStateBefore ?? assessment.currentClinicState,
      targetClinicState: result.clinicStateAfter ?? assessment.proposedClinicState,
      deployedAt: result.activatedAt,
      activationResult: result.status,
      reusedCount: 1,
      warnings: warningCount(assessmentIssues),
      issues: assessmentIssues,
      message:
        "The existing deployed clinic deployment state was reused. The execution item remains running and no dependent item was unlocked.",
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
      ? "missing_clinic"
      : result.status === "conflict"
        ? "clinic_state_mismatch"
        : "repository_error",
    command.sessionId,
    command.executionKey,
    result.executionItemKey ?? assessment.executionItemKey,
    result.planItemKey ?? assessment.planItemKey,
    result.issueCode
      ? `Atomic clinic activation RPC returned ${result.issueCode}.`
      : "Atomic clinic activation RPC did not activate the clinic.",
  );
  const issues = [...assessmentIssues, atomicIssue];

  return {
    ...baseResult(command, assessment),
    ok: false,
    status,
    currentClinicState: result.clinicStateBefore ?? assessment.currentClinicState,
    targetClinicState: result.clinicStateAfter ?? assessment.proposedClinicState,
    deployedAt: result.activatedAt,
    activationResult: result.status,
    conflicts: status === "conflict" ? 1 : 0,
    blockers: blockerCount(issues) || 1,
    warnings: warningCount(issues),
    issues,
    message:
      result.message ||
      "Atomic clinic activation did not complete. The execution item remains running.",
  };
}

function baseResult(
  command: InternalClinicActivationCommand,
  assessment: DeploymentClinicActivationResult | null,
): ServerDeploymentClinicActivationResult {
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
    currentClinicState: assessment?.currentClinicState ?? null,
    targetClinicState: assessment?.proposedClinicState ?? null,
  };
}

function emptyResult(input: {
  clinicId: string | null;
  deploymentRunId: string | null;
  sessionId: string | null;
  executionKey: string | null;
  claimantId: string | null;
}): ServerDeploymentClinicActivationResult {
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
    currentClinicState: null,
    targetClinicState: null,
    deployedAt: null,
    activationResult: null,
    activatedCount: 0,
    reusedCount: 0,
    conflicts: 0,
    blockers: 0,
    warnings: 0,
    issues: [],
    downstream: zeroDownstream(),
    message: "Clinic activation was not attempted.",
  };
}

function safeError(
  command: InternalClinicActivationCommand,
  assessment: DeploymentClinicActivationResult | null,
  message: string,
  issues: readonly DeploymentClinicActivationIssue[] = [],
  diagnostics: DeploymentClinicActivationIssueDiagnostics | null = null,
): ServerDeploymentClinicActivationResult {
  const safeIssues = issues.length
    ? issues
    : [
        issue(
          "repository_error",
          command.sessionId,
          command.executionKey,
          assessment?.executionItemKey ?? command.executionItemKey,
          assessment?.planItemKey ?? command.planItemKey,
          diagnostics?.errorMessage
            ? `Clinic activation repository failed safely. ${diagnostics.errorMessage}`
            : diagnostics?.exceptionMessage
              ? `Clinic activation repository failed safely. ${diagnostics.exceptionMessage}`
              : "Clinic activation repository failed safely.",
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

function diagnosticsFromUnknownError(
  error: unknown,
): DeploymentClinicActivationIssueDiagnostics {
  if (error instanceof DeploymentClinicActivationRepositoryError) {
    return error.diagnostics;
  }

  if (error instanceof Error) {
    return {
      layer: "unknown",
      exceptionType: error.name || error.constructor.name || "Error",
      exceptionMessage: error.message,
    };
  }

  return {
    layer: "unknown",
    exceptionType: typeof error,
    exceptionMessage: String(error),
  };
}
function filterRuntimeIssues(
  issues: readonly DeploymentClinicActivationIssue[],
): DeploymentClinicActivationIssue[] {
  return issues.filter(
    (current) => current.code !== "activation_persistence_unimplemented",
  );
}

function blockerCount(issues: readonly DeploymentClinicActivationIssue[]): number {
  return issues.filter((current) => current.severity === "blocker").length;
}

function warningCount(issues: readonly DeploymentClinicActivationIssue[]): number {
  return issues.filter((current) => current.severity === "warning").length;
}

function issue(
  code: DeploymentClinicActivationIssue["code"],
  sessionId: string | null,
  executionKey: string | null,
  executionItemKey: string | null,
  planItemKey: string | null,
  message: string,
  diagnostics: DeploymentClinicActivationIssueDiagnostics | null = null,
): DeploymentClinicActivationIssue {
  return {
    code,
    severity: "blocker",
    sessionId,
    executionKey,
    executionItemKey,
    planItemKey,
    message,
    diagnostics,
  };
}

function createStaticClinicActivationSnapshotRepository(
  snapshot: DeploymentClinicActivationSnapshot,
): DeploymentClinicActivationRepository {
  return {
    async loadClinicActivationSnapshot() {
      return cloneClinicActivationSnapshot(snapshot);
    },
  };
}

function zeroDownstream(): DeploymentClinicActivationDownstreamCounts {
  return {
    clinicsActivated: 0,
    itemsSucceeded: 0,
    dependenciesUnlocked: 0,
    providersActivated: 0,
    sterilizersActivated: 0,
    workstationsActivated: 0,
    hardwareActivated: 0,
    bindingsWritten: 0,
    deploymentFinalized: 0,
  };
}