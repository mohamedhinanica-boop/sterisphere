import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ServerDeploymentActivationExecutionClaimResult } from "./deployment-activation-execution-claim-server";
import {
  progressActivationExecutionDependencyForServerDeployment,
} from "./deployment-activation-execution-dependency-progression-server";
import type { ServerDeploymentActivationExecutionItemCompletionResult } from "./deployment-activation-execution-item-completion-server";
import {
  progressHardwareBindingDependency,
  type DeploymentHardwareBindingDependencyProgressionResult,
} from "./deployment-hardware-binding-dependency-progression";
import type { DeploymentHardwareBindingExecutionResult } from "./deployment-hardware-binding-execution-adapter";
import type { DeploymentHardwareBindingItemCompletionResult } from "./deployment-hardware-binding-item-completion";

export async function progressHardwareBindingDependencyForServerDeployment(
  client: SupabaseClient,
  input: {
    binding: DeploymentHardwareBindingExecutionResult;
    completion: DeploymentHardwareBindingItemCompletionResult;
    claim: ServerDeploymentActivationExecutionClaimResult | null;
    requestedAt: string;
  },
): Promise<DeploymentHardwareBindingDependencyProgressionResult> {
  return progressHardwareBindingDependency(
    async (validated) => progressActivationExecutionDependencyForServerDeployment(client, {
      clinicId: validated.completion.clinicId ?? "",
      deploymentRunId: validated.completion.deploymentRunKey ?? "",
      deploymentActivationExecutionClaim: validated.claim,
      deploymentActivationExecutionItemCompletion: normalizeCompletion(validated.completion, validated.claim),
      dependencyProgressionRequestedAt: validated.requestedAt,
    }),
    input,
  );
}

function normalizeCompletion(
  completion: DeploymentHardwareBindingItemCompletionResult,
  claim: ServerDeploymentActivationExecutionClaimResult | null,
): ServerDeploymentActivationExecutionItemCompletionResult {
  return {
    ok: completion.ok,
    status: completion.status,
    claimantId: claim?.claimantId ?? null,
    clinicId: completion.clinicId,
    deploymentRunId: completion.deploymentRunKey,
    sessionId: completion.sessionId,
    executionKey: completion.executionKey,
    itemId: completion.itemId,
    executionItemKey: completion.executionItemKey,
    planItemKey: completion.planItemKey,
    sequence: completion.sequence,
    entityType: completion.entityType,
    action: completion.action,
    startedAt: null,
    completedAt: completion.completedAt,
    attemptCount: 1,
    executionStatusBefore: completion.status === "already_completed" ? "succeeded" : "running",
    executionStatusAfter: completion.ok ? "succeeded" : null,
    completionResult: completion.status,
    issueCode: completion.issueCode,
    completedCount: completion.completedCount,
    reusedCount: completion.reusedCount,
    conflicts: completion.status === "conflict" ? 1 : 0,
    blockers: completion.ok ? 0 : completion.issues.length,
    warnings: 0,
    issues: [],
    downstream: {
      itemsCompleted: 0,
      dependenciesUnlocked: 0,
      providersActivated: 0,
      sterilizersActivated: 0,
      workstationsActivated: 0,
      hardwareActivated: 0,
      bindingsWritten: 0,
      deploymentFinalized: 0,
    },
    message: completion.message,
  };
}
