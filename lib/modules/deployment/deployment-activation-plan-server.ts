import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildActivationReadinessExpectedPlanFromDraft,
} from "./deployment-activation-readiness-server";
import {
  createDeploymentActivationPlanService,
  type DeploymentActivationPlanService,
} from "./deployment-activation-plan-service";
import type {
  DeploymentActivationPlanDownstreamCounts,
  DeploymentActivationPlanIssue,
  DeploymentActivationPlanItem,
  DeploymentActivationPlanResult,
} from "./deployment-activation-plan-types";
import {
  SupabaseDeploymentActivationPlanRepository,
} from "./deployment-activation-plan-supabase-repository";
import type { DeploymentDraft } from "./deployment-draft";
import type {
  ServerDeploymentActivationReadinessResult,
} from "./deployment-activation-readiness-server";
import type {
  ServerDeploymentPlannedAssignmentResolutionResult,
} from "./deployment-planned-assignment-resolution-server";

export type ServerDeploymentActivationPlanStatus =
  | "ready"
  | "blocked"
  | "error"
  | "skipped";

export interface ServerDeploymentActivationPlanCommand {
  clinicId: string;
  deploymentRunId: string;
  draft: DeploymentDraft;
  deploymentActivationReadiness: ServerDeploymentActivationReadinessResult;
  plannedAssignmentResolution: ServerDeploymentPlannedAssignmentResolutionResult;
  createdAt?: string;
}

export interface ServerDeploymentActivationPlanResult {
  ok: boolean;
  status: ServerDeploymentActivationPlanStatus;
  clinicId: string | null;
  deploymentRunId: string | null;
  planKey: string | null;
  itemsRequested: number;
  itemsPlanned: number;
  itemsBlocked: number;
  reversibleItems: number;
  irreversibleItems: number;
  blockers: number;
  warnings: number;
  issues: readonly DeploymentActivationPlanIssue[];
  planItems: readonly DeploymentActivationPlanItem[];
  downstream: DeploymentActivationPlanDownstreamCounts;
  message: string;
}

export function createServerDeploymentActivationPlanService(
  client: SupabaseClient,
): DeploymentActivationPlanService {
  return createDeploymentActivationPlanService(
    new SupabaseDeploymentActivationPlanRepository(client),
  );
}

export async function buildActivationPlanForServerDeployment(
  client: SupabaseClient,
  command: ServerDeploymentActivationPlanCommand,
): Promise<ServerDeploymentActivationPlanResult> {
  if (command.deploymentActivationReadiness.status !== "ready") {
    return {
      ok: false,
      status: "skipped",
      clinicId: command.clinicId,
      deploymentRunId: command.deploymentRunId,
      planKey: null,
      itemsRequested: 0,
      itemsPlanned: 0,
      itemsBlocked: 0,
      reversibleItems: 0,
      irreversibleItems: 0,
      blockers: 0,
      warnings: 0,
      issues: [],
      planItems: [],
      downstream: zeroDownstream(),
      message:
        "Controlled activation planning was skipped because deployment activation readiness is not ready.",
    };
  }

  try {
    const result = await createServerDeploymentActivationPlanService(
      client,
    ).buildActivationPlan({
      clinicId: command.clinicId,
      deploymentRunId: command.deploymentRunId,
      readiness: command.deploymentActivationReadiness,
      resolvedAssignments: command.plannedAssignmentResolution.records,
      expected: buildActivationReadinessExpectedPlanFromDraft(command.draft, {
        clinicId: command.clinicId,
        timestamp: command.createdAt,
      }),
    });

    return mapActivationPlanResult(result, {
      clinicId: command.clinicId,
      deploymentRunId: command.deploymentRunId,
    });
  } catch {
    return {
      ok: false,
      status: "error",
      clinicId: command.clinicId,
      deploymentRunId: command.deploymentRunId,
      planKey: null,
      itemsRequested: 0,
      itemsPlanned: 0,
      itemsBlocked: 0,
      reversibleItems: 0,
      irreversibleItems: 0,
      blockers: 0,
      warnings: 0,
      issues: [],
      planItems: [],
      downstream: zeroDownstream(),
      message:
        "Controlled activation planning could not complete. No activation plan was created and no records were modified.",
    };
  }
}

function mapActivationPlanResult(
  result: DeploymentActivationPlanResult,
  context: {
    clinicId: string;
    deploymentRunId: string;
  },
): ServerDeploymentActivationPlanResult {
  return {
    ok: result.ok,
    status: result.status,
    clinicId: context.clinicId,
    deploymentRunId: context.deploymentRunId,
    planKey: result.planKey,
    itemsRequested: result.itemsRequested,
    itemsPlanned: result.itemsPlanned,
    itemsBlocked: result.itemsBlocked,
    reversibleItems: result.reversibleItems,
    irreversibleItems: result.irreversibleItems,
    blockers: result.blockers,
    warnings: result.warnings,
    issues: result.issues,
    planItems: result.planItems,
    downstream: result.downstream,
    message: result.message,
  };
}

function zeroDownstream(): DeploymentActivationPlanDownstreamCounts {
  return {
    requested: 0,
    created: 0,
    reused: 0,
    skipped: 0,
    conflicts: 0,
  };
}
