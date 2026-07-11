import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildHardwareAssignmentPayloadsFromDraft,
} from "./deployment-hardware-assignment-payload";
import {
  createDeploymentAssignmentTargetValidationService,
  type DeploymentAssignmentTargetValidationService,
} from "./deployment-assignment-target-validation-service";
import {
  SupabaseDeploymentAssignmentTargetValidationRepository,
} from "./deployment-assignment-target-validation-supabase-repository";
import type { DeploymentDraft } from "./deployment-draft";
import type {
  DeploymentAssignmentTargetValidationAssignment,
  DeploymentAssignmentTargetValidationIssue,
} from "./deployment-assignment-target-validation-types";

export type ServerDeploymentAssignmentTargetValidationStatus =
  | "valid"
  | "invalid"
  | "error";

export interface ServerDeploymentAssignmentTargetValidationCommand {
  clinicId: string;
  draft: DeploymentDraft;
  createdAt?: string;
}

export interface ServerDeploymentAssignmentTargetValidationResult {
  ok: boolean;
  status: ServerDeploymentAssignmentTargetValidationStatus;
  clinicId: string | null;
  requested: number;
  valid: number;
  invalid: number;
  missingTargets: number;
  incompatibleTargets: number;
  issues: readonly DeploymentAssignmentTargetValidationIssue[];
  downstream: {
    requested: 0;
    created: 0;
    reused: 0;
    skipped: 0;
    conflicts: 0;
  };
  message: string;
}

export function createServerDeploymentAssignmentTargetValidationService(
  client: SupabaseClient,
): DeploymentAssignmentTargetValidationService {
  return createDeploymentAssignmentTargetValidationService(
    new SupabaseDeploymentAssignmentTargetValidationRepository(client),
  );
}

export async function validateAssignmentTargetsForServerDeployment(
  client: SupabaseClient,
  command: ServerDeploymentAssignmentTargetValidationCommand,
): Promise<ServerDeploymentAssignmentTargetValidationResult> {
  const createdAt = command.createdAt ?? new Date().toISOString();
  const payloads = buildHardwareAssignmentPayloadsFromDraft(command.draft, {
    clinicId: command.clinicId,
    timestamp: createdAt,
  });
  const assignments = payloads.map(mapPayloadToValidationAssignment);

  try {
    const result =
      await createServerDeploymentAssignmentTargetValidationService(
        client,
      ).validateAssignmentTargetsForClinicAssignments(
        command.clinicId,
        assignments,
      );

    return {
      ok: result.ok,
      status: result.status,
      clinicId: command.clinicId,
      requested: result.counts.requested,
      valid: result.counts.valid,
      invalid: result.counts.invalid,
      missingTargets: result.counts.missingTargets,
      incompatibleTargets: result.counts.incompatibleTargets,
      issues: result.issues,
      downstream: {
        requested: 0,
        created: 0,
        reused: 0,
        skipped: 0,
        conflicts: 0,
      },
      message: result.message,
    };
  } catch {
    return {
      ok: false,
      status: "error",
      clinicId: command.clinicId,
      requested: assignments.length,
      valid: 0,
      invalid: assignments.length,
      missingTargets: 0,
      incompatibleTargets: 0,
      issues: [],
      downstream: {
        requested: 0,
        created: 0,
        reused: 0,
        skipped: 0,
        conflicts: 0,
      },
      message:
        "Assignment target validation could not complete. Hardware assignment persistence was not attempted.",
    };
  }
}

function mapPayloadToValidationAssignment(
  payload: ReturnType<typeof buildHardwareAssignmentPayloadsFromDraft>[number],
): DeploymentAssignmentTargetValidationAssignment {
  return {
    clinicId: payload.clinicId,
    deploymentHardwareKey: payload.deploymentHardwareKey,
    deploymentHardwareAssignmentKey: payload.deploymentHardwareAssignmentKey,
    targetType: payload.targetType,
    targetDeploymentKey: payload.targetDeploymentKey,
    assignmentStatus: payload.assignmentStatus,
    assignmentSource: payload.assignmentSource,
    active: payload.active,
  };
}
