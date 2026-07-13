import "server-only";

import { randomBytes } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DeploymentActivationExecutionClaimService,
} from "./deployment-activation-execution-claim-service";
import {
  SupabaseDeploymentActivationExecutionClaimRepository,
} from "./deployment-activation-execution-claim-supabase-repository";
import type {
  DeploymentActivationExecutionClaimRepository,
} from "./deployment-activation-execution-claim-repository";
import {
  cloneClaimItemCompleteness,
  cloneClaimSessionSnapshot,
  emptyClaimItemCompleteness,
  type DeploymentActivationExecutionAtomicClaimCommand,
  type DeploymentActivationExecutionAtomicClaimMode,
  type DeploymentActivationExecutionAtomicClaimResult,
  type DeploymentActivationExecutionClaimCommand,
  type DeploymentActivationExecutionClaimDownstreamCounts,
  type DeploymentActivationExecutionClaimIssue,
  type DeploymentActivationExecutionClaimSnapshot,
  type DeploymentActivationExecutionClaimTokenFactory,
} from "./deployment-activation-execution-claim-types";
import type {
  ServerDeploymentActivationExecutionPersistenceResult,
} from "./deployment-activation-execution-persistence-server";

export const SETUP_RUNTIME_ACTIVATION_EXECUTION_CLAIMANT_ID =
  "sterisphere-setup-runtime-deployment-executor";

export const SETUP_RUNTIME_ACTIVATION_EXECUTION_LEASE_SECONDS = 5 * 60;

export type ServerDeploymentActivationExecutionClaimStatus =
  | "claimed"
  | "already_owned"
  | "reclaimed"
  | "blocked"
  | "conflict"
  | "error"
  | "not_attempted";

export interface ServerDeploymentActivationExecutionClaimCommand {
  clinicId: string;
  deploymentRunId: string;
  deploymentActivationExecutionPersistence:
    ServerDeploymentActivationExecutionPersistenceResult | null;
  claimRequestedAt?: string | null;
}

export interface ServerDeploymentActivationExecutionClaimResult {
  ok: boolean;
  status: ServerDeploymentActivationExecutionClaimStatus;
  sessionId: string | null;
  executionKey: string | null;
  planKey: string | null;
  claimantId: string | null;
  persistedOwnerId: string | null;
  leaseExpiresAt: string | null;
  claimMode: DeploymentActivationExecutionAtomicClaimMode | null;
  ownershipResult: DeploymentActivationExecutionAtomicClaimResult["status"] | null;
  sessionClaimed: 0 | 1;
  sessionReused: 0 | 1;
  sessionReclaimed: 0 | 1;
  conflicts: number;
  blockers: number;
  warnings: number;
  issues: readonly DeploymentActivationExecutionClaimIssue[];
  downstream: DeploymentActivationExecutionClaimDownstreamCounts;
  message: string;
}

export interface DeploymentActivationExecutionAtomicClaimRepository
  extends DeploymentActivationExecutionClaimRepository {
  claimFreshSession(
    command: Omit<DeploymentActivationExecutionAtomicClaimCommand, "mode">,
  ): Promise<DeploymentActivationExecutionAtomicClaimResult>;
  confirmSameOwnerClaim(
    command: Omit<DeploymentActivationExecutionAtomicClaimCommand, "mode">,
  ): Promise<DeploymentActivationExecutionAtomicClaimResult>;
  reclaimExpiredSession(
    command: Omit<DeploymentActivationExecutionAtomicClaimCommand, "mode">,
  ): Promise<DeploymentActivationExecutionAtomicClaimResult>;
}

export interface ClaimActivationExecutionWithRepositoryOptions {
  claimantId?: string;
  leaseDurationSeconds?: number;
  tokenFactory?: DeploymentActivationExecutionClaimTokenFactory;
}

export async function claimActivationExecutionForServerDeployment(
  client: SupabaseClient,
  command: ServerDeploymentActivationExecutionClaimCommand,
): Promise<ServerDeploymentActivationExecutionClaimResult> {
  return claimActivationExecutionWithRepository(
    new SupabaseDeploymentActivationExecutionClaimRepository(client),
    command,
    {
      tokenFactory: secureOwnershipTokenFactory,
    },
  );
}

export async function claimActivationExecutionWithRepository(
  repository: DeploymentActivationExecutionAtomicClaimRepository,
  command: ServerDeploymentActivationExecutionClaimCommand,
  options: ClaimActivationExecutionWithRepositoryOptions = {},
): Promise<ServerDeploymentActivationExecutionClaimResult> {
  const prerequisite = validatePrerequisite(command, options);

  if (!prerequisite.ok) {
    return prerequisite.result;
  }

  const claimCommand = prerequisite.claimCommand;

  try {
    const snapshot = await repository.getClaimSnapshot({
      clinicId: claimCommand.clinicId,
      deploymentRunId: claimCommand.deploymentRunId,
      sessionId: claimCommand.sessionId,
      executionKey: claimCommand.executionKey,
    });
    const stableSnapshot = cloneSnapshot(snapshot);
    const service = new DeploymentActivationExecutionClaimService(
      createStaticClaimSnapshotRepository(stableSnapshot),
      {
        tokenFactory: options.tokenFactory ?? secureOwnershipTokenFactory,
      },
    );
    const assessment = await service.assessClaim(claimCommand);

    if (assessment.status === "blocked" || assessment.status === "conflict") {
      return {
        ...baseResult(claimCommand, command.deploymentActivationExecutionPersistence?.planKey ?? null),
        ok: false,
        status: assessment.status,
        persistedOwnerId: assessment.existingOwner,
        leaseExpiresAt: assessment.existingLeaseExpiresAt,
        conflicts: assessment.status === "conflict" ? 1 : 0,
        blockers: assessment.blockers,
        warnings: assessment.warnings,
        issues: assessment.issues,
        message: assessment.message,
      };
    }

    if (assessment.status === "error") {
      return safeError(
        claimCommand,
        command.deploymentActivationExecutionPersistence?.planKey ?? null,
        "Activation execution claim assessment failed safely. No execution session ownership was changed.",
        assessment.issues,
      );
    }

    const atomicMode = modeForAssessment(assessment.status);
    const atomicCommand = buildAtomicCommand(
      claimCommand,
      atomicMode,
      assessment.proposedOwnershipToken,
      assessment.proposedLeaseExpiresAt,
      stableSnapshot,
    );

    if (!atomicCommand.ok) {
      return atomicCommand.result;
    }

    const atomicResult = await executeAtomicClaim(
      repository,
      atomicMode,
      atomicCommand.command,
    );

    if (!atomicResult.ok) {
      return {
        ...baseResult(claimCommand, command.deploymentActivationExecutionPersistence?.planKey ?? null),
        ok: false,
        status: atomicResult.status === "conflict" ? "conflict" : "blocked",
        persistedOwnerId: atomicResult.owner,
        leaseExpiresAt: atomicResult.leaseExpiresAt,
        claimMode: atomicMode,
        ownershipResult: atomicResult.status,
        conflicts: atomicResult.status === "conflict" ? 1 : 0,
        blockers: 1,
        warnings: assessment.warnings,
        issues: assessment.issues,
        message:
          atomicResult.message ||
          "Activation execution atomic claim did not complete. No execution started.",
      };
    }

    return mapAtomicSuccess(
      claimCommand,
      command.deploymentActivationExecutionPersistence?.planKey ?? null,
      atomicMode,
      atomicResult,
      assessment.issues,
      assessment.warnings,
    );
  } catch {
    return safeError(
      claimCommand,
      command.deploymentActivationExecutionPersistence?.planKey ?? null,
      "Activation execution atomic claim failed safely. No fallback mutation was attempted.",
    );
  }
}

function validatePrerequisite(
  command: ServerDeploymentActivationExecutionClaimCommand,
  options: ClaimActivationExecutionWithRepositoryOptions,
):
  | { ok: true; claimCommand: DeploymentActivationExecutionClaimCommand }
  | { ok: false; result: ServerDeploymentActivationExecutionClaimResult } {
  const persistence = command.deploymentActivationExecutionPersistence;
  const claimantId =
    options.claimantId ?? SETUP_RUNTIME_ACTIVATION_EXECUTION_CLAIMANT_ID;
  const leaseDurationSeconds =
    options.leaseDurationSeconds ??
    SETUP_RUNTIME_ACTIVATION_EXECUTION_LEASE_SECONDS;
  const claimRequestedAt =
    command.claimRequestedAt ?? new Date().toISOString();

  if (
    !persistence?.ok ||
    !persistence.sessionId ||
    !persistence.executionKey ||
    !persistence.planKey ||
    persistence.itemsRequested < 1 ||
    persistence.itemsConflicted > 0
  ) {
    return {
      ok: false,
      result: {
        ...emptyResult({
          sessionId: persistence?.sessionId ?? null,
          executionKey: persistence?.executionKey ?? null,
          planKey: persistence?.planKey ?? null,
          claimantId,
        }),
        message:
          "Activation execution claim was skipped because prepared execution persistence is incomplete or incompatible.",
      },
    };
  }

  return {
    ok: true,
    claimCommand: {
      clinicId: command.clinicId,
      deploymentRunId: command.deploymentRunId,
      sessionId: persistence.sessionId,
      executionKey: persistence.executionKey,
      planKey: persistence.planKey,
      claimantId,
      leaseDurationSeconds,
      claimRequestedAt,
      expectedItemCount: persistence.itemsRequested,
      expectedExecutionStatus: "prepared",
    },
  };
}

function buildAtomicCommand(
  claimCommand: DeploymentActivationExecutionClaimCommand,
  mode: DeploymentActivationExecutionAtomicClaimMode,
  proposedOwnershipToken: string | null,
  proposedLeaseExpiresAt: string | null,
  snapshot: DeploymentActivationExecutionClaimSnapshot,
):
  | {
      ok: true;
      command: Omit<DeploymentActivationExecutionAtomicClaimCommand, "mode">;
    }
  | { ok: false; result: ServerDeploymentActivationExecutionClaimResult } {
  if (!proposedOwnershipToken || !proposedLeaseExpiresAt) {
    return {
      ok: false,
      result: safeError(
        claimCommand,
        snapshot.session?.planKey ?? claimCommand.planKey,
        "Activation execution claim assessment did not produce complete ownership evidence for atomic claiming.",
      ),
    };
  }

  return {
    ok: true,
    command: {
      clinicId: claimCommand.clinicId,
      deploymentRunId: claimCommand.deploymentRunId,
      sessionId: claimCommand.sessionId,
      executionKey: claimCommand.executionKey,
      claimantId: claimCommand.claimantId,
      proposedOwnershipToken,
      claimRequestedAt: claimCommand.claimRequestedAt,
      proposedLeaseExpiresAt,
      expectedItemCount: claimCommand.expectedItemCount,
      expectedPreviousOwner:
        mode === "fresh" ? null : snapshot.session?.executionOwner ?? null,
      expectedPreviousOwnershipToken:
        mode === "fresh" ? null : snapshot.session?.ownershipToken ?? null,
      expectedPreviousLeaseExpiresAt:
        mode === "fresh" ? null : snapshot.session?.leaseExpiresAt ?? null,
    },
  };
}

async function executeAtomicClaim(
  repository: DeploymentActivationExecutionAtomicClaimRepository,
  mode: DeploymentActivationExecutionAtomicClaimMode,
  command: Omit<DeploymentActivationExecutionAtomicClaimCommand, "mode">,
): Promise<DeploymentActivationExecutionAtomicClaimResult> {
  if (mode === "fresh") {
    return repository.claimFreshSession(command);
  }

  if (mode === "same_owner") {
    return repository.confirmSameOwnerClaim(command);
  }

  return repository.reclaimExpiredSession(command);
}

function mapAtomicSuccess(
  command: DeploymentActivationExecutionClaimCommand,
  planKey: string | null,
  mode: DeploymentActivationExecutionAtomicClaimMode,
  result: DeploymentActivationExecutionAtomicClaimResult,
  issues: readonly DeploymentActivationExecutionClaimIssue[],
  warningCount: number,
): ServerDeploymentActivationExecutionClaimResult {
  const status =
    result.status === "claimed"
      ? "claimed"
      : result.status === "already_owned"
        ? "already_owned"
        : "reclaimed";

  return {
    ...baseResult(command, planKey),
    ok: true,
    status,
    persistedOwnerId: result.owner,
    leaseExpiresAt: result.leaseExpiresAt,
    claimMode: mode,
    ownershipResult: result.status,
    sessionClaimed: result.status === "claimed" ? 1 : 0,
    sessionReused: result.status === "already_owned" ? 1 : 0,
    sessionReclaimed: result.status === "reclaimed" ? 1 : 0,
    warnings: warningCount,
    issues,
    message: successMessage(result.status),
  };
}

function successMessage(
  status: DeploymentActivationExecutionAtomicClaimResult["status"],
): string {
  if (status === "already_owned") {
    return "Existing execution-session ownership was reused and the lease was not extended. No activation has started.";
  }

  if (status === "reclaimed") {
    return "Expired execution-session ownership was atomically reclaimed after untouched evidence was verified. No activation has started.";
  }

  return "Execution session is now exclusively owned by the deployment executor. No activation has started.";
}

function modeForAssessment(
  status: "claimable" | "already_owned" | "lease_expired_reclaimable",
): DeploymentActivationExecutionAtomicClaimMode {
  if (status === "claimable") {
    return "fresh";
  }

  if (status === "already_owned") {
    return "same_owner";
  }

  return "expired_reclaim";
}

function safeError(
  command: DeploymentActivationExecutionClaimCommand,
  planKey: string | null,
  message: string,
  issues: readonly DeploymentActivationExecutionClaimIssue[] = [],
): ServerDeploymentActivationExecutionClaimResult {
  return {
    ...baseResult(command, planKey),
    ok: false,
    status: "error",
    blockers: issues.length ? issues.filter((issue) => issue.severity === "blocker").length : 1,
    warnings: issues.filter((issue) => issue.severity === "warning").length,
    issues,
    message,
  };
}

function baseResult(
  command: DeploymentActivationExecutionClaimCommand,
  planKey: string | null,
): ServerDeploymentActivationExecutionClaimResult {
  return emptyResult({
    sessionId: command.sessionId,
    executionKey: command.executionKey,
    planKey: planKey ?? command.planKey,
    claimantId: command.claimantId,
  });
}

function emptyResult(input: {
  sessionId: string | null;
  executionKey: string | null;
  planKey: string | null;
  claimantId: string | null;
}): ServerDeploymentActivationExecutionClaimResult {
  return {
    ok: false,
    status: "not_attempted",
    sessionId: input.sessionId,
    executionKey: input.executionKey,
    planKey: input.planKey,
    claimantId: input.claimantId,
    persistedOwnerId: null,
    leaseExpiresAt: null,
    claimMode: null,
    ownershipResult: null,
    sessionClaimed: 0,
    sessionReused: 0,
    sessionReclaimed: 0,
    conflicts: 0,
    blockers: 0,
    warnings: 0,
    issues: [],
    downstream: zeroDownstream(),
    message: "Activation execution claim was not attempted.",
  };
}

function createStaticClaimSnapshotRepository(
  snapshot: DeploymentActivationExecutionClaimSnapshot,
): DeploymentActivationExecutionClaimRepository {
  return {
    async getClaimSnapshot() {
      return cloneSnapshot(snapshot);
    },
  };
}

function cloneSnapshot(
  snapshot: DeploymentActivationExecutionClaimSnapshot,
): DeploymentActivationExecutionClaimSnapshot {
  return {
    session: snapshot.session
      ? cloneClaimSessionSnapshot(snapshot.session)
      : null,
    itemCompleteness: cloneClaimItemCompleteness(
      snapshot.itemCompleteness ?? emptyClaimItemCompleteness(),
    ),
  };
}

function zeroDownstream(): DeploymentActivationExecutionClaimDownstreamCounts {
  return {
    sessionsClaimed: 0,
    sessionsStarted: 0,
    itemsClaimed: 0,
    itemsStarted: 0,
    itemsSucceeded: 0,
    itemsFailed: 0,
    itemsRolledBack: 0,
    entitiesActivated: 0,
    bindingsWritten: 0,
    deploymentRunsFinalized: 0,
  };
}

function secureOwnershipTokenFactory(): string {
  return `claim:${randomBytes(32).toString("base64url")}`;
}
