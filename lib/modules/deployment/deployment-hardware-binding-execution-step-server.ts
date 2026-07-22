import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getServerDeploymentActivationExecutionClaimOwnershipToken,
  type ServerDeploymentActivationExecutionClaimResult,
} from "./deployment-activation-execution-claim-server";
import type { ServerDeploymentActivationExecutionNextItemStartResult } from "./deployment-activation-execution-next-item-start-server";
import type { DeploymentActivationExecutionItem } from "./deployment-activation-execution-types";
import { executeHardwareBindingForServerDeployment } from "./deployment-hardware-binding-execution-server";
import { completeHardwareBindingItemForServerDeployment } from "./deployment-hardware-binding-item-completion-server";
import { progressHardwareBindingDependencyForServerDeployment } from "./deployment-hardware-binding-dependency-progression-server";
import { startHardwareBindingSuccessorForServerDeployment } from "./deployment-hardware-binding-successor-start-server";
import type { DeploymentHardwareBindingSuccessorStartResult } from "./deployment-hardware-binding-successor-start";
import {
  executeHardwareBindingExecutionStep,
  type DeploymentHardwareBindingExecutionStepResult,
} from "./deployment-hardware-binding-execution-step";

export interface ServerDeploymentHardwareBindingExecutionStepCommand {
  clinicId: string;
  deploymentRunKey: string;
  sessionId: string;
  executionKey: string;
  planKey: string;
  claim: ServerDeploymentActivationExecutionClaimResult | null;
  runningSuccessor: DeploymentHardwareBindingSuccessorStartResult | null;
  preparedExecutionItems: readonly DeploymentActivationExecutionItem[];
  requestedAt: string;
}

export async function executeHardwareBindingExecutionStepForServerDeployment(
  client: SupabaseClient,
  command: ServerDeploymentHardwareBindingExecutionStepCommand,
): Promise<DeploymentHardwareBindingExecutionStepResult> {
  const runningItem = toRunningItem(command.runningSuccessor, command);
  const ownershipToken = getServerDeploymentActivationExecutionClaimOwnershipToken(command.claim);

  return executeHardwareBindingExecutionStep(
    {
      now: () => new Date().toISOString(),
      executeBinding: ({ runningItem: current, executedAt }) => executeHardwareBindingForServerDeployment(client, {
        deploymentActivationExecutionClaim: command.claim,
        runningItem: current,
        preparedExecutionItems: command.preparedExecutionItems,
        bindingExecutedAt: executedAt,
      }),
      completeItem: ({ binding, runningItem: current, requestedAt }) => completeHardwareBindingItemForServerDeployment(client, {
        binding,
        runningItem: current,
        claim: command.claim!,
        preparedExecutionItems: command.preparedExecutionItems,
        completionRequestedAt: requestedAt,
      }),
      progressDependencies: ({ binding, completion, requestedAt }) => progressHardwareBindingDependencyForServerDeployment(client, {
        binding,
        completion,
        claim: command.claim,
        requestedAt,
      }),
      startSuccessor: ({ binding, completion, progression, requestedAt }) => startHardwareBindingSuccessorForServerDeployment(client, {
        binding,
        completion,
        progression,
        claim: command.claim,
        requestedAt,
      }),
    },
    {
      clinicId: command.clinicId,
      deploymentRunKey: command.deploymentRunKey,
      sessionId: command.sessionId,
      executionKey: command.executionKey,
      planKey: command.planKey,
      claim: command.claim,
      ownershipToken,
      runningItems: runningItem ? [runningItem] : [],
      preparedExecutionItems: command.preparedExecutionItems,
      requestedAt: command.requestedAt,
    },
  );
}

function toRunningItem(
  value: DeploymentHardwareBindingSuccessorStartResult | null,
  command: ServerDeploymentHardwareBindingExecutionStepCommand,
): ServerDeploymentActivationExecutionNextItemStartResult | null {
  if (!value) return null;
  const status = value.status === "started" || value.status === "already_started" ? value.status : "error";
  return {
    ok: value.ok,
    status,
    message: value.message,
    claimantId: command.claim?.claimantId ?? null,
    clinicId: value.clinicId,
    deploymentRunKey: value.deploymentRunKey,
    sessionId: value.sessionId,
    executionKey: value.executionKey,
    planKey: command.planKey,
    itemId: value.successorItemId,
    executionItemKey: value.successorExecutionItemKey,
    planItemKey: value.successorPlanItemKey,
    sequence: value.successorSequence,
    entityType: value.successorEntityType,
    entityId: value.successorEntityId,
    action: value.successorAction,
    attemptCount: value.attemptCount,
    startedAt: value.startedAt,
    leaseExpiresAt: command.claim?.leaseExpiresAt ?? null,
    result: status,
    startedCount: value.startedCount,
    reusedCount: value.reusedCount,
    conflicts: value.status === "conflict" ? 1 : 0,
    blockers: value.ok ? 0 : value.issues.filter((issue) => issue.severity === "blocker").length,
    warnings: value.issues.filter((issue) => issue.severity === "warning").length,
    issues: [],
    downstream: {
      itemsStarted: 0,
      itemsSucceeded: 0,
      entitiesActivated: 0,
      bindingsWritten: 0,
      itemsCompleted: 0,
      dependenciesProgressed: 0,
      finalized: 0,
    },
  };
}