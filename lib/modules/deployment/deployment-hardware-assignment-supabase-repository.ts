import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  DeploymentHardwareAssignmentPersistenceResult,
  DeploymentHardwareAssignmentRepository,
} from "./deployment-hardware-assignment-repository";
import {
  resolveExistingHardwareAssignment,
  validateHardwareAssignmentCreatePayload,
} from "./deployment-hardware-assignment-integrity";
import type {
  CreateDeploymentHardwareAssignmentPayload,
  DeploymentHardwareAssignmentMetadata,
  DeploymentHardwareAssignmentRecord,
  DeploymentHardwareAssignmentStatus,
  DeploymentHardwareAssignmentTargetType,
} from "./deployment-hardware-assignment-types";

type DeploymentHardwareAssignmentDatabasePayload = {
  clinic_id: string;
  deployment_hardware_key: string;
  assignment_key: string;
  target_type: DeploymentHardwareAssignmentTargetType;
  target_deployment_key: string | null;
  assignment_status: "planned";
  assignment_source: "setup_draft";
  active: false;
  display_order: number;
  reason: string | null;
  metadata: DeploymentHardwareAssignmentMetadata;
  created_at?: string;
  updated_at?: string;
};

type DeploymentHardwareAssignmentDatabaseRow = {
  id: string;
  clinic_id: string | null;
  deployment_hardware_key: string | null;
  assignment_key: string | null;
  target_type: DeploymentHardwareAssignmentTargetType;
  target_deployment_key: string | null;
  assignment_status: DeploymentHardwareAssignmentStatus | null;
  assignment_source: string | null;
  active: boolean | null;
  display_order: number | null;
  reason: string | null;
  metadata: DeploymentHardwareAssignmentMetadata | null;
  created_at: string;
  updated_at?: string | null;
};

interface SupabaseErrorLike {
  code?: string;
  message: string;
}

export class DeploymentHardwareAssignmentRepositoryError extends Error {
  readonly code: string | null;

  constructor(message: string, code: string | null = null) {
    super(message);
    this.name = "DeploymentHardwareAssignmentRepositoryError";
    this.code = code;
  }
}

export class SupabaseDeploymentHardwareAssignmentRepository
  implements DeploymentHardwareAssignmentRepository
{
  constructor(private readonly client: SupabaseClient) {}

  async findAssignmentByHardwareDeploymentKey(
    clinicId: string,
    deploymentHardwareKey: string,
  ): Promise<DeploymentHardwareAssignmentRecord | null> {
    const { data, error } = await this.client
      .from("deployment_hardware_assignments")
      .select("*")
      .eq("clinic_id", clinicId)
      .eq("deployment_hardware_key", deploymentHardwareKey)
      .maybeSingle();

    if (error) {
      throw toRepositoryError(error);
    }

    return data ? mapAssignmentRowToRecord(data) : null;
  }

  async createHardwareAssignment(
    payload: CreateDeploymentHardwareAssignmentPayload,
  ): Promise<DeploymentHardwareAssignmentPersistenceResult> {
    const payloadValidationMessage = validateHardwareAssignmentCreatePayload(payload);

    if (payloadValidationMessage) {
      return {
        ok: false,
        assignment: null,
        message: payloadValidationMessage,
      };
    }

    const existingAssignment =
      await this.findAssignmentByHardwareDeploymentKey(
        payload.clinicId,
        payload.deploymentHardwareKey,
      );

    if (existingAssignment) {
      return resolveExistingHardwareAssignment(existingAssignment, payload);
    }

    const { data, error } = await this.client
      .from("deployment_hardware_assignments")
      .insert(mapCreatePayloadToDatabasePayload(payload))
      .select("*")
      .single();

    if (error) {
      if (isUniqueViolation(error)) {
        return this.resolveCreateConflictAfterUniqueViolation(payload);
      }

      throw toRepositoryError(error);
    }

    return {
      ok: true,
      assignment: mapAssignmentRowToRecord(data),
      message: "Hardware planned assignment provisioned for draft clinic.",
    };
  }

  async listDeploymentHardwareAssignments(
    clinicId: string,
  ): Promise<readonly DeploymentHardwareAssignmentRecord[]> {
    const { data, error } = await this.client
      .from("deployment_hardware_assignments")
      .select("*")
      .eq("clinic_id", clinicId)
      .not("deployment_hardware_key", "is", null)
      .order("deployment_hardware_key", { ascending: true });

    if (error) {
      throw toRepositoryError(error);
    }

    return ((data ?? []) as DeploymentHardwareAssignmentDatabaseRow[]).map(
      mapAssignmentRowToRecord,
    );
  }

  private async resolveCreateConflictAfterUniqueViolation(
    payload: CreateDeploymentHardwareAssignmentPayload,
  ): Promise<DeploymentHardwareAssignmentPersistenceResult> {
    const existingAssignment =
      await this.findAssignmentByHardwareDeploymentKey(
        payload.clinicId,
        payload.deploymentHardwareKey,
      );

    if (existingAssignment) {
      return resolveExistingHardwareAssignment(existingAssignment, payload);
    }

    return {
      ok: false,
      assignment: null,
      message:
        "Hardware assignment unique conflict could not be resolved safely; the dedicated assignment table may be missing its clinic/deployment hardware key guardrail.",
    };
  }
}

export function mapCreatePayloadToDatabasePayload(
  payload: CreateDeploymentHardwareAssignmentPayload,
): DeploymentHardwareAssignmentDatabasePayload {
  return {
    clinic_id: payload.clinicId,
    deployment_hardware_key: payload.deploymentHardwareKey,
    assignment_key: payload.deploymentHardwareAssignmentKey,
    target_type: payload.targetType,
    target_deployment_key: payload.targetDeploymentKey,
    assignment_status: "planned",
    assignment_source: "setup_draft",
    active: false,
    display_order: payload.displayOrder,
    reason: payload.reason,
    metadata: payload.metadata,
    created_at: payload.createdAt,
    updated_at: payload.updatedAt,
  };
}

export function mapAssignmentRowToRecord(
  row: DeploymentHardwareAssignmentDatabaseRow,
): DeploymentHardwareAssignmentRecord {
  return {
    id: row.id,
    clinicId: row.clinic_id,
    deploymentHardwareAssignmentKey: row.assignment_key,
    deploymentHardwareKey: row.deployment_hardware_key,
    targetType: row.target_type,
    targetDeploymentKey: row.target_deployment_key,
    assignmentStatus: row.assignment_status ?? "active",
    assignmentSource: row.assignment_source,
    active: row.active === false ? false : true,
    displayOrder: row.display_order,
    reason: row.reason,
    metadata: row.metadata,
    createdAt: row.created_at,
    updatedAt: row.updated_at ?? null,
  };
}

function isUniqueViolation(error: SupabaseErrorLike): boolean {
  return error.code === "23505";
}

function toRepositoryError(
  error: SupabaseErrorLike,
): DeploymentHardwareAssignmentRepositoryError {
  return new DeploymentHardwareAssignmentRepositoryError(
    error.message,
    error.code ?? null,
  );
}