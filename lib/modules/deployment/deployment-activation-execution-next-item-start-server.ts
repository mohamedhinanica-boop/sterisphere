import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getServerDeploymentActivationExecutionClaimOwnershipToken,
  SETUP_RUNTIME_ACTIVATION_EXECUTION_CLAIMANT_ID,
  type ServerDeploymentActivationExecutionClaimResult,
} from "./deployment-activation-execution-claim-server";
import type {
  DeploymentActivationExecutionNextItemStartRepository,
} from "./deployment-activation-execution-next-item-start-repository";
import {
  DeploymentActivationExecutionNextItemStartService,
} from "./deployment-activation-execution-next-item-start-service";
import {
  DeploymentActivationExecutionNextItemStartRepositoryError,
  SupabaseDeploymentActivationExecutionNextItemStartRepository,
} from "./deployment-activation-execution-next-item-start-supabase-repository";
import {
  cloneNextItemStartSnapshot,
  type DeploymentActivationExecutionAtomicNextItemStartCommand,
  type DeploymentActivationExecutionAtomicNextItemStartResult,
  type DeploymentActivationExecutionNextItemStartDownstreamCounts,
  type DeploymentActivationExecutionNextItemStartIssue,
  type DeploymentActivationExecutionNextItemStartResult,
  type DeploymentActivationExecutionNextItemStartSnapshot,
} from "./deployment-activation-execution-next-item-start-types";
import type {
  ServerDeploymentActivationExecutionDependencyProgressionResult,
} from "./deployment-activation-execution-dependency-progression-server";

export type ServerDeploymentActivationExecutionNextItemStartStatus =
  | "started"
  | "already_started"
  | "blocked"
  | "conflict"
  | "not_found"
  | "error"
  | "not_attempted";

export interface ServerDeploymentActivationExecutionNextItemStartCommand {
  clinicId: string;
  deploymentRunId: string;
  deploymentActivationExecutionClaim:
    | ServerDeploymentActivationExecutionClaimResult
    | null;
  deploymentActivationExecutionDependencyProgression:
    | ServerDeploymentActivationExecutionDependencyProgressionResult
    | null;
  nextItemStartedAt?: string | null;
}

export interface ServerDeploymentActivationExecutionNextItemStartResult {
  ok: boolean;
  status: ServerDeploymentActivationExecutionNextItemStartStatus;
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
  entityType: string | null;
  entityId: string | null;
  action: string | null;
  attemptCount: number;
  startedAt: string | null;
  leaseExpiresAt: string | null;
  result:
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
  issues: readonly DeploymentActivationExecutionNextItemStartIssue[];
  downstream: DeploymentActivationExecutionNextItemStartDownstreamCounts;
}

export interface DeploymentActivationExecutionAtomicNextItemStartRepository
  extends DeploymentActivationExecutionNextItemStartRepository {
  startNextItemAtomically(
    command: DeploymentActivationExecutionAtomicNextItemStartCommand,
  ): Promise<DeploymentActivationExecutionAtomicNextItemStartResult>;
}

export interface StartNextActivationExecutionItemWithRepositoryOptions {
  claimantId?: string;
  ownershipTokenResolver?: (
    claim: ServerDeploymentActivationExecutionClaimResult,
  ) => string | null;
}

export async function startNextActivationExecutionItemForServerDeployment(
  client: SupabaseClient,
  command: ServerDeploymentActivationExecutionNextItemStartCommand,
): Promise<ServerDeploymentActivationExecutionNextItemStartResult> {
  return startNextActivationExecutionItemWithRepository(
    new SupabaseDeploymentActivationExecutionNextItemStartRepository(client),
    command,
  );
}

export async function startNextActivationExecutionItemWithRepository(
  repository: DeploymentActivationExecutionAtomicNextItemStartRepository,
  command: ServerDeploymentActivationExecutionNextItemStartCommand,
  options: StartNextActivationExecutionItemWithRepositoryOptions = {},
): Promise<ServerDeploymentActivationExecutionNextItemStartResult> {
  const prerequisite = validatePrerequisite(command, options);

  if (!prerequisite.ok) {
    return prerequisite.result;
  }

  const startCommand = prerequisite.startCommand;
  const expectedLeaseExpiresAt = prerequisite.expectedLeaseExpiresAt;
  let latestAssessment: DeploymentActivationExecutionNextItemStartResult | null = null;

  try {
    const snapshot = await repository.loadNextItemStartSnapshot({
      clinicId: startCommand.clinicId,
      deploymentRunKey: startCommand.deploymentRunKey,
      sessionId: startCommand.sessionId,
      executionKey: startCommand.executionKey,
    });
    const stableSnapshot = cloneNextItemStartSnapshot(snapshot);
    const service = new DeploymentActivationExecutionNextItemStartService(
      createStaticNextItemStartSnapshotRepository(stableSnapshot),
    );
    const assessment = await service.assessNextItemStart(startCommand);
    latestAssessment = assessment;
    const publicIssues = filterRuntimeIssues(assessment.issues);

    if (assessment.status === "already_started") {
      return {
        ...baseResult(startCommand, assessment),
        ok: true,
        status: "already_started",
        result: "already_started",
        reusedCount: 1,
        warnings: warningCount(publicIssues),
        issues: publicIssues,
        message:
          "The deterministic next activation execution item is already running. No RPC mutation was attempted.",
      };
    }

    if (
      assessment.status === "blocked" ||
      assessment.status === "conflict" ||
      assessment.status === "not_found"
    ) {
      return {
        ...baseResult(startCommand, assessment),
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
        startCommand,
        assessment,
        "Activation execution next-item start assessment failed safely. No fallback mutation was attempted.",
        publicIssues,
      );
    }

    const atomicCommand = buildAtomicCommand(
      startCommand,
      assessment,
      expectedLeaseExpiresAt,
    );

    if (!atomicCommand.ok) {
      return atomicCommand.result;
    }

    const atomicResult = await repository.startNextItemAtomically(
      atomicCommand.command,
    );

    return mapAtomicResult(startCommand, assessment, atomicResult, publicIssues);
  } catch (caught) {
    return safeError(
      startCommand,
      latestAssessment,
      "Activation execution next-item start failed safely. No fallback mutation was attempted.",
      [],
      messageFromCaught(caught, startCommand.ownershipToken),
    );
  }
}

function validatePrerequisite(
  command: ServerDeploymentActivationExecutionNextItemStartCommand,
  options: StartNextActivationExecutionItemWithRepositoryOptions,
):
  | {
      ok: true;
      startCommand: Parameters<DeploymentActivationExecutionNextItemStartService["assessNextItemStart"]>[0];
      expectedLeaseExpiresAt: string;
    }
  | { ok: false; result: ServerDeploymentActivationExecutionNextItemStartResult } {
  const progression = command.deploymentActivationExecutionDependencyProgression;
  const claim = command.deploymentActivationExecutionClaim;
  const claimantId =
    options.claimantId ?? SETUP_RUNTIME_ACTIVATION_EXECUTION_CLAIMANT_ID;

  if (
    !progression?.ok ||
    !["progressed", "already_progressed"].includes(progression.status) ||
    !progression.clinicId ||
    !progression.deploymentRunId ||
    !progression.sessionId ||
    !progression.executionKey ||
    !claim?.ok
  ) {
    return {
      ok: false,
      result: {
        ...emptyResult({
          clinicId: progression?.clinicId ?? command.clinicId,
          deploymentRunKey: progression?.deploymentRunId ?? command.deploymentRunId,
          sessionId: progression?.sessionId ?? claim?.sessionId ?? null,
          executionKey: progression?.executionKey ?? claim?.executionKey ?? null,
          claimantId: progression?.claimantId ?? claim?.claimantId ?? claimantId,
        }),
        message:
          "Activation execution next-item start was skipped because dependency progression did not ready or reuse the deterministic next item.",
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
          clinicId: progression.clinicId,
          deploymentRunKey: progression.deploymentRunId,
          sessionId: progression.sessionId,
          executionKey: progression.executionKey,
          claimantId: progression.claimantId ?? claim.claimantId ?? claimantId,
        }),
        status: "error",
        blockers: 1,
        issues: [
          issue(
            "repository_error",
            progression.sessionId,
            progression.executionKey,
            progression.nextExecutionItemKey,
            progression.nextPlanItemKey,
            progression.nextEntityType,
            progression.nextEntityId,
            progression.nextSequence,
            "Activation execution next-item start could not access server-only ownership evidence.",
          ),
        ],
        message:
          "Activation execution next-item start failed safely because server-only ownership evidence was unavailable.",
      },
    };
  }

  return {
    ok: true,
    expectedLeaseExpiresAt: claim.leaseExpiresAt,
    startCommand: {
      clinicId: progression.clinicId,
      deploymentRunKey: progression.deploymentRunId,
      sessionId: progression.sessionId,
      executionKey: progression.executionKey,
      claimantId: progression.claimantId ?? claim.claimantId ?? claimantId,
      ownershipToken,
      now: command.nextItemStartedAt ?? new Date().toISOString(),
    },
  };
}

function buildAtomicCommand(
  command: Parameters<DeploymentActivationExecutionNextItemStartService["assessNextItemStart"]>[0],
  assessment: DeploymentActivationExecutionNextItemStartResult,
  expectedLeaseExpiresAt: string,
):
  | { ok: true; command: DeploymentActivationExecutionAtomicNextItemStartCommand }
  | { ok: false; result: ServerDeploymentActivationExecutionNextItemStartResult } {
  if (
    assessment.status !== "startable" ||
    !assessment.itemId ||
    !assessment.executionItemKey ||
    !assessment.planItemKey ||
    assessment.sequence === null ||
    !assessment.entityType ||
    !assessment.action
  ) {
    return {
      ok: false,
      result: safeError(
        command,
        assessment,
        "Activation execution next-item start assessment did not produce complete atomic start evidence.",
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
      expectedEntityType: assessment.entityType,
      expectedEntityId: assessment.entityId,
      expectedAction: assessment.action,
      expectedAttemptCount: assessment.attemptCount,
      expectedDependencyKeys: assessment.dependencyKeys,
      proposedStartedAt: command.now,
    },
  };
}

function mapAtomicResult(
  command: Parameters<DeploymentActivationExecutionNextItemStartService["assessNextItemStart"]>[0],
  assessment: DeploymentActivationExecutionNextItemStartResult,
  result: DeploymentActivationExecutionAtomicNextItemStartResult,
  assessmentIssues: readonly DeploymentActivationExecutionNextItemStartIssue[],
): ServerDeploymentActivationExecutionNextItemStartResult {
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
      entityId: result.entityId ?? assessment.entityId,
      action: result.action ?? assessment.action,
      attemptCount: result.attemptCount,
      startedAt: result.startedAt ?? assessment.itemStartedAt,
      leaseExpiresAt: result.leaseExpiresAt ?? assessment.leaseExpiresAt,
      result: "started",
      startedCount: 1,
      warnings: warningCount(assessmentIssues),
      issues: assessmentIssues,
      message:
        "The deterministic next activation execution item was atomically started. No entity was activated and the item was not completed.",
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
      entityId: result.entityId ?? assessment.entityId,
      action: result.action ?? assessment.action,
      attemptCount: result.attemptCount || assessment.attemptCount,
      startedAt: result.startedAt ?? assessment.itemStartedAt,
      leaseExpiresAt: result.leaseExpiresAt ?? assessment.leaseExpiresAt,
      result: "already_started",
      reusedCount: 1,
      warnings: warningCount(assessmentIssues),
      issues: assessmentIssues,
      message:
        "The deterministic next activation execution item was already running. No entity was activated and no item was completed.",
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
      ? "no_start_candidate"
      : result.status === "conflict"
        ? "ownership_token_mismatch"
        : "repository_error",
    command.sessionId,
    command.executionKey,
    result.executionItemKey ?? assessment.executionItemKey,
    result.planItemKey ?? assessment.planItemKey,
    result.entityType ?? assessment.entityType,
    result.entityId ?? assessment.entityId,
    result.sequence ?? assessment.sequence,
    result.issueCode
      ? `Atomic next-item start RPC returned ${result.issueCode}.`
      : "Atomic next-item start RPC did not start the next item.",
  );
  const issues = [...assessmentIssues, atomicIssue];

  return {
    ...baseResult(command, assessment),
    ok: false,
    status,
    result: result.status,
    itemId: result.itemId ?? assessment.itemId,
    executionItemKey: result.executionItemKey ?? assessment.executionItemKey,
    planItemKey: result.planItemKey ?? assessment.planItemKey,
    sequence: result.sequence ?? assessment.sequence,
    entityType: result.entityType ?? assessment.entityType,
    entityId: result.entityId ?? assessment.entityId,
    action: result.action ?? assessment.action,
    attemptCount: result.attemptCount || assessment.attemptCount,
    startedAt: result.startedAt ?? assessment.itemStartedAt,
    leaseExpiresAt: result.leaseExpiresAt ?? assessment.leaseExpiresAt,
    conflicts: status === "conflict" ? 1 : 0,
    blockers: blockerCount(issues) || 1,
    warnings: warningCount(issues),
    issues,
    message:
      result.message ||
      "Activation execution next-item start did not start the next item. No fallback mutation was attempted.",
  };
}

function baseResult(
  command: Parameters<DeploymentActivationExecutionNextItemStartService["assessNextItemStart"]>[0],
  assessment: DeploymentActivationExecutionNextItemStartResult | null,
): ServerDeploymentActivationExecutionNextItemStartResult {
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
    entityType: assessment?.entityType ?? null,
    entityId: assessment?.entityId ?? null,
    action: assessment?.action ?? null,
    attemptCount: assessment?.attemptCount ?? 0,
    startedAt: assessment?.itemStartedAt ?? null,
    leaseExpiresAt: assessment?.leaseExpiresAt ?? null,
  };
}

function emptyResult(input: {
  clinicId: string | null;
  deploymentRunKey: string | null;
  sessionId: string | null;
  executionKey: string | null;
  claimantId: string | null;
}): ServerDeploymentActivationExecutionNextItemStartResult {
  return {
    ok: false,
    status: "not_attempted",
    message: "Activation execution next-item start was not attempted.",
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
    entityType: null,
    entityId: null,
    action: null,
    attemptCount: 0,
    startedAt: null,
    leaseExpiresAt: null,
    result: null,
    startedCount: 0,
    reusedCount: 0,
    conflicts: 0,
    blockers: 0,
    warnings: 0,
    issues: [],
    downstream: zeroDownstream(),
  };
}

function safeError(
  command: Parameters<DeploymentActivationExecutionNextItemStartService["assessNextItemStart"]>[0],
  assessment: DeploymentActivationExecutionNextItemStartResult | null,
  message: string,
  issues: readonly DeploymentActivationExecutionNextItemStartIssue[] = [],
  caughtMessage?: string | null,
): ServerDeploymentActivationExecutionNextItemStartResult {
  const safeIssues = issues.length
    ? issues
    : [
        issue(
          "repository_error",
          command.sessionId,
          command.executionKey,
          assessment?.executionItemKey ?? null,
          assessment?.planItemKey ?? null,
          assessment?.entityType ?? null,
          assessment?.entityId ?? null,
          assessment?.sequence ?? null,
          caughtMessage ?? "Activation execution next-item start repository failed safely.",
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

function messageFromCaught(caught: unknown, sensitiveToken: string | null): string {
  if (caught instanceof DeploymentActivationExecutionNextItemStartRepositoryError) {
    return sanitizeDiagnostic(caught.message, sensitiveToken) ?? "Activation execution next-item start repository failed safely.";
  }

  if (caught instanceof Error) {
    return sanitizeDiagnostic(caught.message, sensitiveToken) ?? "Activation execution next-item start repository failed safely.";
  }

  return sanitizeDiagnostic(String(caught), sensitiveToken) ?? "Activation execution next-item start repository failed safely.";
}

function filterRuntimeIssues(
  issues: readonly DeploymentActivationExecutionNextItemStartIssue[],
): DeploymentActivationExecutionNextItemStartIssue[] {
  return issues.filter(
    (current) => current.code !== "atomic_next_item_start_persistence_unavailable",
  );
}

function blockerCount(
  issues: readonly DeploymentActivationExecutionNextItemStartIssue[],
): number {
  return issues.filter((current) => current.severity === "blocker").length;
}

function warningCount(
  issues: readonly DeploymentActivationExecutionNextItemStartIssue[],
): number {
  return issues.filter((current) => current.severity === "warning").length;
}

function issue(
  code: DeploymentActivationExecutionNextItemStartIssue["code"],
  sessionId: string | null,
  executionKey: string | null,
  executionItemKey: string | null,
  planItemKey: string | null,
  entityType: string | null,
  entityId: string | null,
  sequence: number | null,
  message: string,
): DeploymentActivationExecutionNextItemStartIssue {
  return {
    code,
    severity: "blocker",
    sessionId,
    executionKey,
    executionItemKey,
    planItemKey,
    entityType,
    entityId,
    sequence,
    message,
  };
}

function createStaticNextItemStartSnapshotRepository(
  snapshot: DeploymentActivationExecutionNextItemStartSnapshot,
): DeploymentActivationExecutionNextItemStartRepository {
  return {
    async loadNextItemStartSnapshot() {
      return cloneNextItemStartSnapshot(snapshot);
    },
    async startNextItemAtomically() {
      throw new Error("Static next-item start assessment repository cannot mutate execution items.");
    },
  };
}

function zeroDownstream(): DeploymentActivationExecutionNextItemStartDownstreamCounts {
  return {
    itemsStarted: 0,
    itemsSucceeded: 0,
    entitiesActivated: 0,
    bindingsWritten: 0,
    itemsCompleted: 0,
    dependenciesProgressed: 0,
    finalized: 0,
  };
}

function sanitizeDiagnostic(value: string | null, sensitiveToken: string | null): string | null {
  if (!value) {
    return value;
  }

  return sensitiveToken ? value.split(sensitiveToken).join("[redacted]") : value;
}