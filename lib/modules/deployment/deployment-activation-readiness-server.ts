import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildHardwareShellPayloadsFromDraft,
} from "./deployment-hardware-payload";
import {
  buildProviderShellPayloadsFromDraft,
} from "./deployment-provider-payload";
import {
  buildSterilizerShellPayloadsFromDraft,
} from "./deployment-sterilizer-payload";
import {
  buildWorkstationShellPayloadsFromDraft,
} from "./deployment-workstation-payload";
import {
  createDeploymentActivationReadinessService,
  type DeploymentActivationReadinessService,
} from "./deployment-activation-readiness-service";
import type {
  DeploymentActivationReadinessRepository,
} from "./deployment-activation-readiness-repository";
import {
  SupabaseDeploymentActivationReadinessRepository,
} from "./deployment-activation-readiness-supabase-repository";
import type {
  DeploymentActivationReadinessAssessmentCommand,
  DeploymentActivationReadinessDownstreamCounts,
  DeploymentActivationReadinessExpectedPlan,
  DeploymentActivationReadinessIssue,
  DeploymentActivationReadinessResult,
  DeploymentActivationReadinessSnapshot,
} from "./deployment-activation-readiness-types";
import type {
  ServerDeploymentAssignmentTargetValidationResult,
} from "./deployment-assignment-target-validation-server";
import type { DeploymentDraft } from "./deployment-draft";
import type {
  ServerDeploymentPlannedAssignmentResolutionResult,
} from "./deployment-planned-assignment-resolution-server";

export type ServerDeploymentActivationReadinessStatus =
  | "ready"
  | "blocked"
  | "error";

export interface ServerDeploymentActivationReadinessCommand {
  clinicId: string;
  deploymentRunId: string;
  draft: DeploymentDraft;
  assignmentTargetValidation: ServerDeploymentAssignmentTargetValidationResult;
  plannedAssignmentResolution: ServerDeploymentPlannedAssignmentResolutionResult;
  createdAt?: string;
}

export interface ServerDeploymentActivationReadinessResult {
  ok: boolean;
  status: ServerDeploymentActivationReadinessStatus;
  clinicId: string | null;
  deploymentRunId: string | null;
  checksRequested: number;
  checksPassed: number;
  checksFailed: number;
  blockers: number;
  warnings: number;
  issues: readonly DeploymentActivationReadinessIssue[];
  downstream: DeploymentActivationReadinessDownstreamCounts;
  message: string;
}

export function createServerDeploymentActivationReadinessService(
  client: SupabaseClient,
  evidence: Pick<
    ServerDeploymentActivationReadinessCommand,
    "assignmentTargetValidation" | "plannedAssignmentResolution"
  >,
): DeploymentActivationReadinessService {
  return createDeploymentActivationReadinessService(
    createRuntimeEvidenceActivationReadinessRepository(
      new SupabaseDeploymentActivationReadinessRepository(client),
      evidence,
    ),
  );
}

export async function assessActivationReadinessForServerDeployment(
  client: SupabaseClient,
  command: ServerDeploymentActivationReadinessCommand,
): Promise<ServerDeploymentActivationReadinessResult> {
  try {
    const result = await createServerDeploymentActivationReadinessService(
      client,
      command,
    ).assessDeploymentActivationReadiness({
      clinicId: command.clinicId,
      deploymentRunId: command.deploymentRunId,
      expected: buildActivationReadinessExpectedPlanFromDraft(command.draft, {
        clinicId: command.clinicId,
        timestamp: command.createdAt,
      }),
    });

    return mapReadinessResult(result, {
      clinicId: command.clinicId,
      deploymentRunId: command.deploymentRunId,
    });
  } catch {
    return {
      ok: false,
      status: "error",
      clinicId: command.clinicId,
      deploymentRunId: command.deploymentRunId,
      checksRequested: 0,
      checksPassed: 0,
      checksFailed: 0,
      blockers: 0,
      warnings: 0,
      issues: [],
      downstream: zeroDownstream(),
      message:
        "Deployment activation readiness could not complete. Planned infrastructure remains inactive and unbound.",
    };
  }
}

export function createRuntimeEvidenceActivationReadinessRepository(
  durableRepository: DeploymentActivationReadinessRepository,
  evidence: Pick<
    ServerDeploymentActivationReadinessCommand,
    "assignmentTargetValidation" | "plannedAssignmentResolution"
  >,
): DeploymentActivationReadinessRepository {
  return {
    async getReadinessSnapshot(
      command: DeploymentActivationReadinessAssessmentCommand,
    ): Promise<DeploymentActivationReadinessSnapshot> {
      const snapshot = await durableRepository.getReadinessSnapshot(command);

      return {
        ...snapshot,
        assignmentTargetValidation: {
          requested: evidence.assignmentTargetValidation.requested,
          valid: evidence.assignmentTargetValidation.valid,
          invalid: evidence.assignmentTargetValidation.invalid,
          missingTargets: evidence.assignmentTargetValidation.missingTargets,
          incompatibleTargets:
            evidence.assignmentTargetValidation.incompatibleTargets,
        },
        plannedAssignmentResolution: {
          requested: evidence.plannedAssignmentResolution.requested,
          resolved: evidence.plannedAssignmentResolution.resolved,
          unresolved: evidence.plannedAssignmentResolution.unresolved,
          missingHardware:
            evidence.plannedAssignmentResolution.missingHardware,
          missingTargets: evidence.plannedAssignmentResolution.missingTargets,
          incompatibleHardware:
            evidence.plannedAssignmentResolution.incompatibleHardware,
          incompatibleTargets:
            evidence.plannedAssignmentResolution.incompatibleTargets,
        },
      };
    },
  };
}

export function buildActivationReadinessExpectedPlanFromDraft(
  draft: DeploymentDraft,
  context: {
    clinicId: string;
    timestamp?: string;
  },
): DeploymentActivationReadinessExpectedPlan {
  return {
    providerKeys: buildProviderShellPayloadsFromDraft(draft, context).map(
      (payload) => payload.deploymentProviderKey,
    ),
    sterilizerKeys: buildSterilizerShellPayloadsFromDraft(draft, context).map(
      (payload) => payload.deploymentSterilizerKey,
    ),
    workstationKeys: buildWorkstationShellPayloadsFromDraft(draft, context).map(
      (payload) => payload.deploymentWorkstationKey,
    ),
    hardwareKeys: buildHardwareShellPayloadsFromDraft(draft, context).map(
      (payload) => payload.deploymentHardwareKey,
    ),
  };
}

function mapReadinessResult(
  result: DeploymentActivationReadinessResult,
  context: {
    clinicId: string;
    deploymentRunId: string;
  },
): ServerDeploymentActivationReadinessResult {
  return {
    ok: result.ok,
    status: result.status,
    clinicId: context.clinicId,
    deploymentRunId: context.deploymentRunId,
    checksRequested: result.checksRequested,
    checksPassed: result.checksPassed,
    checksFailed: result.checksFailed,
    blockers: result.blockers,
    warnings: result.warnings,
    issues: result.issues,
    downstream: result.downstream,
    message: result.message,
  };
}

function zeroDownstream(): DeploymentActivationReadinessDownstreamCounts {
  return {
    requested: 0,
    created: 0,
    reused: 0,
    skipped: 0,
    conflicts: 0,
  };
}
