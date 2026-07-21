import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getServerDeploymentActivationExecutionClaimOwnershipToken,
  type ServerDeploymentActivationExecutionClaimResult,
} from "./deployment-activation-execution-claim-server";
import type { ServerDeploymentActivationExecutionNextItemStartResult } from "./deployment-activation-execution-next-item-start-server";
import type { DeploymentActivationExecutionItem } from "./deployment-activation-execution-types";
import { createDeploymentHardwareBindingService } from "./deployment-hardware-binding-server";
import {
  executeHardwareBinding,
  type DeploymentHardwareBindingExecutionResult,
} from "./deployment-hardware-binding-execution-adapter";

export interface ServerDeploymentHardwareBindingExecutionCommand {
  deploymentActivationExecutionClaim: ServerDeploymentActivationExecutionClaimResult | null;
  runningItem: ServerDeploymentActivationExecutionNextItemStartResult | null;
  preparedExecutionItems: readonly DeploymentActivationExecutionItem[];
  bindingExecutedAt: string;
}

export async function executeHardwareBindingForServerDeployment(
  client: SupabaseClient,
  command: ServerDeploymentHardwareBindingExecutionCommand,
): Promise<DeploymentHardwareBindingExecutionResult> {
  const running = command.runningItem;
  const claim = command.deploymentActivationExecutionClaim;
  const plannerMatches = running ? command.preparedExecutionItems.filter((item) =>
    item.executionItemKey === running.executionItemKey &&
    item.planItemKey === running.planItemKey &&
    item.sequence === running.sequence &&
    item.entityType === running.entityType &&
    item.entityId === running.entityId &&
    item.action === running.action
  ) : [];
  const planner = plannerMatches.length === 1 ? plannerMatches[0] : null;
  const ownershipToken = getServerDeploymentActivationExecutionClaimOwnershipToken(claim);

  return executeHardwareBinding(createDeploymentHardwareBindingService(client), {
    itemStatus: running?.ok && (running.status === "started" || running.status === "already_started")
      ? "running"
      : running?.status ?? "not_running",
    clinicId: running?.clinicId ?? null,
    deploymentRunKey: running?.deploymentRunKey ?? null,
    sessionId: running?.sessionId ?? null,
    executionKey: running?.executionKey ?? null,
    itemId: running?.itemId ?? null,
    executionItemKey: running?.executionItemKey ?? null,
    planItemKey: running?.planItemKey ?? null,
    sequence: running?.sequence ?? null,
    entityType: running?.entityType ?? null,
    entityId: running?.entityId ?? null,
    deploymentHardwareKey: planner?.deploymentKey ?? null,
    action: running?.action ?? null,
    claimantId: running?.claimantId ?? claim?.claimantId ?? null,
    ownershipToken,
    expectedLeaseExpiresAt: claim?.leaseExpiresAt ?? running?.leaseExpiresAt ?? null,
    startedAt: running?.startedAt ?? null,
    attemptCount: running?.attemptCount ?? 0,
    expectedCurrentState: planner?.currentState ?? null,
    targetState: planner?.targetState ?? null,
    proposedBoundAt: command.bindingExecutedAt,
  });
}
