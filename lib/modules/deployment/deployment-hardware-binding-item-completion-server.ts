import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getServerDeploymentActivationExecutionClaimOwnershipToken, type ServerDeploymentActivationExecutionClaimResult } from "./deployment-activation-execution-claim-server";
import type { ServerDeploymentActivationExecutionNextItemStartResult } from "./deployment-activation-execution-next-item-start-server";
import type { DeploymentActivationExecutionItem } from "./deployment-activation-execution-types";
import { SupabaseDeploymentActivationExecutionItemCompletionRepository } from "./deployment-activation-execution-item-completion-supabase-repository";
import type { DeploymentHardwareBindingExecutionResult } from "./deployment-hardware-binding-execution-adapter";
import {
  DeploymentHardwareBindingItemCompletionService,
  type DeploymentHardwareBindingItemCompletionResult,
} from "./deployment-hardware-binding-item-completion";

export async function completeHardwareBindingItemForServerDeployment(
  client: SupabaseClient,
  input: {
    binding: DeploymentHardwareBindingExecutionResult;
    runningItem: ServerDeploymentActivationExecutionNextItemStartResult;
    claim: ServerDeploymentActivationExecutionClaimResult;
    preparedExecutionItems: readonly DeploymentActivationExecutionItem[];
    completedAt: string;
  },
): Promise<DeploymentHardwareBindingItemCompletionResult> {
  const plannerMatches = input.preparedExecutionItems.filter((item) =>
    item.executionItemKey === input.runningItem.executionItemKey &&
    item.planItemKey === input.runningItem.planItemKey &&
    item.sequence === input.runningItem.sequence
  );
  const planner = plannerMatches.length === 1 ? plannerMatches[0] : null;
  const service = new DeploymentHardwareBindingItemCompletionService(
    new SupabaseDeploymentActivationExecutionItemCompletionRepository(client),
  );
  return service.complete({
    binding: input.binding,
    itemStatus: input.runningItem.ok && ["started", "already_started"].includes(input.runningItem.status) ? "running" : input.runningItem.status,
    claimantId: input.runningItem.claimantId ?? input.claim.claimantId,
    claimedClaimantId: input.claim.claimantId,
    ownershipToken: getServerDeploymentActivationExecutionClaimOwnershipToken(input.claim),
    expectedLeaseExpiresAt: input.claim.leaseExpiresAt,
    startedAt: input.runningItem.startedAt,
    attemptCount: input.runningItem.attemptCount,
    runningItemId: input.runningItem.itemId,
    runningExecutionItemKey: input.runningItem.executionItemKey,
    runningPlanItemKey: input.runningItem.planItemKey,
    runningSequence: input.runningItem.sequence,
    runningEntityType: input.runningItem.entityType,
    runningEntityId: input.runningItem.entityId,
    runningAction: input.runningItem.action,
    plannerDeploymentHardwareKey: planner?.deploymentKey ?? null,
    plannerExpectedState: planner?.currentState ?? null,
    plannerTargetState: planner?.targetState ?? null,
    proposedCompletedAt: input.completedAt,
  });
}
