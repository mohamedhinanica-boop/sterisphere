import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ServerDeploymentActivationExecutionClaimResult } from "./deployment-activation-execution-claim-server";
import type { ServerDeploymentActivationExecutionDependencyProgressionResult } from "./deployment-activation-execution-dependency-progression-server";
import {
  startNextActivationExecutionItemWithRepository,
  type DeploymentActivationExecutionAtomicNextItemStartRepository,
} from "./deployment-activation-execution-next-item-start-server";
import { SupabaseDeploymentActivationExecutionNextItemStartRepository } from "./deployment-activation-execution-next-item-start-supabase-repository";
import type { DeploymentActivationExecutionAtomicNextItemStartCommand } from "./deployment-activation-execution-next-item-start-types";
import type { DeploymentHardwareBindingDependencyProgressionResult } from "./deployment-hardware-binding-dependency-progression";
import type { DeploymentHardwareBindingExecutionResult } from "./deployment-hardware-binding-execution-adapter";
import type { DeploymentHardwareBindingItemCompletionResult } from "./deployment-hardware-binding-item-completion";
import {
  startHardwareBindingSuccessor,
  type DeploymentHardwareBindingSuccessorStartResult,
} from "./deployment-hardware-binding-successor-start";

export async function startHardwareBindingSuccessorForServerDeployment(
  client: SupabaseClient,
  input: {
    binding: DeploymentHardwareBindingExecutionResult;
    completion: DeploymentHardwareBindingItemCompletionResult;
    progression: DeploymentHardwareBindingDependencyProgressionResult;
    claim: ServerDeploymentActivationExecutionClaimResult | null;
    requestedAt: string;
  },
): Promise<DeploymentHardwareBindingSuccessorStartResult> {
  const repository = new SupabaseDeploymentActivationExecutionNextItemStartRepository(client);
  return startHardwareBindingSuccessor(
    async (validated) => startNextActivationExecutionItemWithRepository(
      exactSuccessorRepository(repository, validated.progression),
      {
        clinicId: validated.progression.clinicId ?? "",
        deploymentRunId: validated.progression.deploymentRunKey ?? "",
        deploymentActivationExecutionClaim: validated.claim,
        deploymentActivationExecutionDependencyProgression: normalizeProgression(validated.progression, validated.claim),
        nextItemStartedAt: validated.requestedAt,
      },
    ),
    input,
  );
}

function exactSuccessorRepository(
  repository: SupabaseDeploymentActivationExecutionNextItemStartRepository,
  progression: DeploymentHardwareBindingDependencyProgressionResult,
): DeploymentActivationExecutionAtomicNextItemStartRepository {
  return {
    loadNextItemStartSnapshot: (input) => repository.loadNextItemStartSnapshot(input),
    startNextItemAtomically: (command) => {
      assertExactSuccessor(command, progression);
      return repository.startNextItemAtomically(command);
    },
  };
}

function assertExactSuccessor(
  command: DeploymentActivationExecutionAtomicNextItemStartCommand,
  progression: DeploymentHardwareBindingDependencyProgressionResult,
): void {
  if (
    command.itemId !== progression.successorItemId ||
    command.executionItemKey !== progression.successorExecutionItemKey ||
    command.planItemKey !== progression.successorPlanItemKey ||
    command.expectedSequence !== progression.successorSequence ||
    command.expectedEntityType !== progression.successorEntityType ||
    command.expectedEntityId !== progression.successorEntityId ||
    command.expectedAction !== progression.successorAction
  ) {
    throw new Error("Persisted next-item candidate does not match the Hardware Binding progression successor.");
  }
}

function normalizeProgression(
  progression: DeploymentHardwareBindingDependencyProgressionResult,
  claim: ServerDeploymentActivationExecutionClaimResult | null,
): ServerDeploymentActivationExecutionDependencyProgressionResult {
  return {
    ok: progression.ok,
    status: progression.status,
    claimantId: claim?.claimantId ?? null,
    clinicId: progression.clinicId,
    deploymentRunId: progression.deploymentRunKey,
    sessionId: progression.sessionId,
    executionKey: progression.executionKey,
    completedItemId: progression.sourceItemId,
    completedExecutionItemKey: progression.sourceExecutionItemKey,
    completedPlanItemKey: progression.sourcePlanItemKey,
    completedSequence: progression.sourceSequence,
    completedStartedAt: null,
    completedCompletedAt: progression.completedAt,
    completedAttemptCount: 1,
    nextItemId: progression.successorItemId,
    nextExecutionItemKey: progression.successorExecutionItemKey,
    nextPlanItemKey: progression.successorPlanItemKey,
    nextSequence: progression.successorSequence,
    nextEntityType: progression.successorEntityType,
    nextEntityId: progression.successorEntityId,
    nextAction: progression.successorAction,
    nextAttemptCount: 0,
    statusBefore: progression.status === "already_progressed" ? "ready" : "pending",
    statusAfter: progression.successorStatus,
    progressionResult: progression.status === "not_attempted" ? null : progression.status,
    issueCode: progression.issueCode,
    progressedCount: progression.progressedCount,
    reusedCount: progression.reusedCount,
    conflicts: progression.status === "conflict" ? 1 : 0,
    blockers: progression.ok ? 0 : progression.issues.filter((issue) => issue.severity === "blocker").length,
    warnings: progression.issues.filter((issue) => issue.severity === "warning").length,
    issues: [],
    downstream: {
      itemsReadied: 0,
      itemsStarted: 0,
      itemsSucceeded: 0,
      entitiesActivated: 0,
      bindingsWritten: 0,
      sessionsCompleted: 0,
      deploymentsFinalized: 0,
      rollbacksExecuted: 0,
    },
    message: progression.message,
  };
}
