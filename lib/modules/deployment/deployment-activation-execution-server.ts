import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createDeploymentActivationExecutionService,
  type DeploymentActivationExecutionService,
} from "./deployment-activation-execution-service";
import type {
  DeploymentActivationExecutionDownstreamCounts,
  DeploymentActivationExecutionIssue,
  DeploymentActivationExecutionItem,
  DeploymentActivationExecutionResult,
  DeploymentActivationExecutionRollbackBoundary,
} from "./deployment-activation-execution-types";
import {
  SupabaseDeploymentActivationExecutionRepository,
} from "./deployment-activation-execution-supabase-repository";
import type {
  ServerDeploymentActivationPlanResult,
} from "./deployment-activation-plan-server";

export type ServerDeploymentActivationExecutionStatus =
  | "ready"
  | "blocked"
  | "error"
  | "skipped";

export interface ServerDeploymentActivationExecutionCommand {
  clinicId: string;
  deploymentRunId: string;
  deploymentActivationPlan: ServerDeploymentActivationPlanResult;
}

export interface ServerDeploymentActivationExecutionResult {
  ok: boolean;
  status: ServerDeploymentActivationExecutionStatus;
  executionKey: string | null;
  planKey: string | null;
  clinicId: string | null;
  deploymentRunId: string | null;
  itemsRequested: number;
  itemsReady: number;
  itemsBlocked: number;
  itemsPending: number;
  reversibleItems: number;
  irreversibleItems: number;
  blockers: number;
  warnings: number;
  issues: readonly DeploymentActivationExecutionIssue[];
  executionItems: readonly DeploymentActivationExecutionItem[];
  rollbackBoundary: DeploymentActivationExecutionRollbackBoundary;
  downstream: DeploymentActivationExecutionDownstreamCounts;
  message: string;
}

export function createServerDeploymentActivationExecutionService(
  client: SupabaseClient,
): DeploymentActivationExecutionService {
  return createDeploymentActivationExecutionService(
    new SupabaseDeploymentActivationExecutionRepository(client),
  );
}

export async function prepareActivationExecutionForServerDeployment(
  client: SupabaseClient,
  command: ServerDeploymentActivationExecutionCommand,
): Promise<ServerDeploymentActivationExecutionResult> {
  return prepareActivationExecutionWithService(
    createServerDeploymentActivationExecutionService(client),
    command,
  );
}

export async function prepareActivationExecutionWithService(
  service: DeploymentActivationExecutionService,
  command: ServerDeploymentActivationExecutionCommand,
): Promise<ServerDeploymentActivationExecutionResult> {
  if (
    command.deploymentActivationPlan.status !== "ready" ||
    command.deploymentActivationPlan.blockers > 0 ||
    command.deploymentActivationPlan.itemsBlocked > 0
  ) {
    return {
      ok: false,
      status: "skipped",
      executionKey: null,
      planKey: command.deploymentActivationPlan.planKey,
      clinicId: command.clinicId,
      deploymentRunId: command.deploymentRunId,
      itemsRequested: 0,
      itemsReady: 0,
      itemsBlocked: 0,
      itemsPending: 0,
      reversibleItems: 0,
      irreversibleItems: 0,
      blockers: 0,
      warnings: 0,
      issues: [],
      executionItems: [],
      rollbackBoundary: emptyRollbackBoundary(),
      downstream: zeroDownstream(),
      message:
        "Activation execution preparation was skipped because the controlled activation plan is not ready.",
    };
  }

  try {
    const result = await service.prepareExecutionSession({
      clinicId: command.clinicId,
      deploymentRunId: command.deploymentRunId,
      planKey: command.deploymentActivationPlan.planKey,
      planStatus: command.deploymentActivationPlan.status,
      blockers: command.deploymentActivationPlan.blockers,
      itemsBlocked: command.deploymentActivationPlan.itemsBlocked,
      planItems: command.deploymentActivationPlan.planItems,
    });

    return mapActivationExecutionResult(result, {
      clinicId: command.clinicId,
      deploymentRunId: command.deploymentRunId,
    });
  } catch {
    return {
      ok: false,
      status: "error",
      executionKey: null,
      planKey: command.deploymentActivationPlan.planKey,
      clinicId: command.clinicId,
      deploymentRunId: command.deploymentRunId,
      itemsRequested: 0,
      itemsReady: 0,
      itemsBlocked: 0,
      itemsPending: 0,
      reversibleItems: 0,
      irreversibleItems: 0,
      blockers: 0,
      warnings: 0,
      issues: [],
      executionItems: [],
      rollbackBoundary: emptyRollbackBoundary(),
      downstream: zeroDownstream(),
      message:
        "Activation execution preparation could not complete. No execution session was persisted and no activation occurred.",
    };
  }
}

function mapActivationExecutionResult(
  result: DeploymentActivationExecutionResult,
  context: {
    clinicId: string;
    deploymentRunId: string;
  },
): ServerDeploymentActivationExecutionResult {
  return {
    ok: result.ok,
    status: result.status,
    executionKey: result.executionKey,
    planKey: result.planKey,
    clinicId: result.clinicId ?? context.clinicId,
    deploymentRunId: result.deploymentRunId ?? context.deploymentRunId,
    itemsRequested: result.itemsRequested,
    itemsReady: result.itemsReady,
    itemsBlocked: result.itemsBlocked,
    itemsPending: result.itemsPending,
    reversibleItems: result.reversibleItems,
    irreversibleItems: result.irreversibleItems,
    blockers: result.blockers,
    warnings: result.warnings,
    issues: result.issues,
    executionItems: result.executionItems,
    rollbackBoundary: result.rollbackBoundary,
    downstream: result.downstream,
    message: result.message,
  };
}

function emptyRollbackBoundary(): DeploymentActivationExecutionRollbackBoundary {
  return {
    lastReversibleSequence: null,
    firstIrreversibleSequence: null,
    rollbackSupportedItemKeys: [],
    rollbackUnsupportedItemKeys: [],
    wouldCrossIrreversibleBoundary: false,
  };
}

function zeroDownstream(): DeploymentActivationExecutionDownstreamCounts {
  return {
    requested: 0,
    created: 0,
    reused: 0,
    skipped: 0,
    conflicts: 0,
  };
}
