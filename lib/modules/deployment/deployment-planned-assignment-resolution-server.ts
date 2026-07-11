import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createDeploymentPlannedAssignmentResolutionService,
  type DeploymentPlannedAssignmentResolutionService,
} from "./deployment-planned-assignment-resolution-service";
import {
  SupabaseDeploymentPlannedAssignmentResolutionRepository,
} from "./deployment-planned-assignment-resolution-supabase-repository";
import type {
  DeploymentPlannedAssignmentResolutionCounts,
  DeploymentPlannedAssignmentResolutionIssue,
  DeploymentPlannedAssignmentResolvedRecord,
} from "./deployment-planned-assignment-resolution-types";

export type ServerDeploymentPlannedAssignmentResolutionStatus =
  | "resolved"
  | "unresolved"
  | "error";

export interface ServerDeploymentPlannedAssignmentResolutionCommand {
  clinicId: string;
}

export interface ServerDeploymentPlannedAssignmentResolutionResult {
  ok: boolean;
  status: ServerDeploymentPlannedAssignmentResolutionStatus;
  clinicId: string | null;
  requested: number;
  resolved: number;
  unresolved: number;
  missingHardware: number;
  missingTargets: number;
  incompatibleHardware: number;
  incompatibleTargets: number;
  records: readonly DeploymentPlannedAssignmentResolvedRecord[];
  issues: readonly DeploymentPlannedAssignmentResolutionIssue[];
  downstream: {
    requested: 0;
    created: 0;
    reused: 0;
    skipped: 0;
    conflicts: 0;
  };
  message: string;
}

export function createServerDeploymentPlannedAssignmentResolutionService(
  client: SupabaseClient,
): DeploymentPlannedAssignmentResolutionService {
  return createDeploymentPlannedAssignmentResolutionService(
    new SupabaseDeploymentPlannedAssignmentResolutionRepository(client),
  );
}

export async function resolvePlannedAssignmentsForServerDeployment(
  client: SupabaseClient,
  command: ServerDeploymentPlannedAssignmentResolutionCommand,
): Promise<ServerDeploymentPlannedAssignmentResolutionResult> {
  try {
    const result =
      await createServerDeploymentPlannedAssignmentResolutionService(
        client,
      ).resolveAssignmentsForClinic(command.clinicId);

    return {
      ok: result.ok,
      status: result.status,
      clinicId: command.clinicId,
      ...mapCounts(result.counts),
      records: result.records,
      issues: result.issues,
      downstream: result.downstream,
      message: result.message,
    };
  } catch {
    return {
      ok: false,
      status: "error",
      clinicId: command.clinicId,
      requested: 0,
      resolved: 0,
      unresolved: 0,
      missingHardware: 0,
      missingTargets: 0,
      incompatibleHardware: 0,
      incompatibleTargets: 0,
      records: [],
      issues: [],
      downstream: {
        requested: 0,
        created: 0,
        reused: 0,
        skipped: 0,
        conflicts: 0,
      },
      message:
        "Planned assignment resolution could not complete. Logical assignments remain persisted, but activation preparation is blocked.",
    };
  }
}

function mapCounts(
  counts: DeploymentPlannedAssignmentResolutionCounts,
): Pick<
  ServerDeploymentPlannedAssignmentResolutionResult,
  | "requested"
  | "resolved"
  | "unresolved"
  | "missingHardware"
  | "missingTargets"
  | "incompatibleHardware"
  | "incompatibleTargets"
> {
  return {
    requested: counts.requested,
    resolved: counts.resolved,
    unresolved: counts.unresolved,
    missingHardware: counts.missingHardware,
    missingTargets: counts.missingTargets,
    incompatibleHardware: counts.incompatibleHardware,
    incompatibleTargets: counts.incompatibleTargets,
  };
}
