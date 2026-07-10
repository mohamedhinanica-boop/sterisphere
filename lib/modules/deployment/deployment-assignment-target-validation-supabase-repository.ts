import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  DeploymentAssignmentTargetValidationRepository,
} from "./deployment-assignment-target-validation-repository";
import type {
  DeploymentAssignmentTargetValidationAssignment,
  DeploymentAssignmentTargetValidationSterilizerTarget,
  DeploymentAssignmentTargetValidationWorkstationTarget,
} from "./deployment-assignment-target-validation-types";

const WORKSTATION_TARGET_COLUMNS = [
  "id",
  "clinic_id",
  "deployment_workstation_key",
  "status",
  "provisioning_source",
  "provisioning_status",
  "active",
].join(",");

const STERILIZER_TARGET_COLUMNS = [
  "id",
  "clinic_id",
  "deployment_sterilizer_key",
  "provisioning_source",
  "provisioning_status",
  "active",
].join(",");

type WorkstationTargetRow = {
  id: string;
  clinic_id: string | null;
  deployment_workstation_key: string | null;
  status: string | null;
  provisioning_source: string | null;
  provisioning_status: string | null;
  active: boolean | null;
};

type SterilizerTargetRow = {
  id: string;
  clinic_id: string | null;
  deployment_sterilizer_key: string | null;
  provisioning_source: string | null;
  provisioning_status: string | null;
  active: boolean | null;
};

type HardwareAssignmentRow = {
  deployment_hardware_key: string;
  assignment_key: string | null;
  target_type: string;
  target_deployment_key: string | null;
  assignment_status: string | null;
  assignment_source: string | null;
  active: boolean | null;
};

interface SupabaseErrorLike {
  code?: string;
  message: string;
}

export class DeploymentAssignmentTargetValidationRepositoryError extends Error {
  readonly code: string | null;

  constructor(message: string, code: string | null = null) {
    super(message);
    this.name = "DeploymentAssignmentTargetValidationRepositoryError";
    this.code = code;
  }
}

export class SupabaseDeploymentAssignmentTargetValidationRepository
  implements DeploymentAssignmentTargetValidationRepository
{
  constructor(private readonly client: SupabaseClient) {}

  async listPlannedHardwareAssignments(
    clinicId: string,
  ): Promise<readonly DeploymentAssignmentTargetValidationAssignment[]> {
    const { data, error } = await this.client
      .from("deployment_hardware_assignments")
      .select(
        [
          "deployment_hardware_key",
          "assignment_key",
          "target_type",
          "target_deployment_key",
          "assignment_status",
          "assignment_source",
          "active",
        ].join(","),
      )
      .eq("clinic_id", clinicId)
      .eq("assignment_source", "setup_draft")
      .eq("assignment_status", "planned")
      .order("deployment_hardware_key", { ascending: true });

    if (error) {
      throw toRepositoryError(error);
    }

    return ((data ?? []) as unknown as HardwareAssignmentRow[]).map((row) =>
      mapHardwareAssignmentRowToValidationAssignment(clinicId, row),
    );
  }

  async findWorkstationTargetByDeploymentKey(
    clinicId: string,
    deploymentWorkstationKey: string,
  ): Promise<DeploymentAssignmentTargetValidationWorkstationTarget | null> {
    const { data, error } = await this.client
      .from("clinical_workstations")
      .select(WORKSTATION_TARGET_COLUMNS)
      .eq("clinic_id", clinicId)
      .eq("deployment_workstation_key", deploymentWorkstationKey)
      .limit(2);

    if (error) {
      throw toRepositoryError(error);
    }

    const rows = (data ?? []) as unknown as WorkstationTargetRow[];

    if (rows.length > 1) {
      throw new DeploymentAssignmentTargetValidationRepositoryError(
        "Duplicate same-clinic workstation deployment keys prevent deterministic target validation.",
      );
    }

    return rows[0] ? mapWorkstationTargetRow(rows[0]) : null;
  }

  async findAnyWorkstationTargetByDeploymentKey(
    deploymentWorkstationKey: string,
  ): Promise<DeploymentAssignmentTargetValidationWorkstationTarget | null> {
    const { data, error } = await this.client
      .from("clinical_workstations")
      .select(WORKSTATION_TARGET_COLUMNS)
      .eq("deployment_workstation_key", deploymentWorkstationKey)
      .limit(1);

    if (error) {
      throw toRepositoryError(error);
    }

    const rows = (data ?? []) as unknown as WorkstationTargetRow[];

    return rows[0] ? mapWorkstationTargetRow(rows[0]) : null;
  }

  async findSterilizerTargetByDeploymentKey(
    clinicId: string,
    deploymentSterilizerKey: string,
  ): Promise<DeploymentAssignmentTargetValidationSterilizerTarget | null> {
    const { data, error } = await this.client
      .from("sterilizers")
      .select(STERILIZER_TARGET_COLUMNS)
      .eq("clinic_id", clinicId)
      .eq("deployment_sterilizer_key", deploymentSterilizerKey)
      .limit(2);

    if (error) {
      throw toRepositoryError(error);
    }

    const rows = (data ?? []) as unknown as SterilizerTargetRow[];

    if (rows.length > 1) {
      throw new DeploymentAssignmentTargetValidationRepositoryError(
        "Duplicate same-clinic sterilizer deployment keys prevent deterministic target validation.",
      );
    }

    return rows[0] ? mapSterilizerTargetRow(rows[0]) : null;
  }

  async findAnySterilizerTargetByDeploymentKey(
    deploymentSterilizerKey: string,
  ): Promise<DeploymentAssignmentTargetValidationSterilizerTarget | null> {
    const { data, error } = await this.client
      .from("sterilizers")
      .select(STERILIZER_TARGET_COLUMNS)
      .eq("deployment_sterilizer_key", deploymentSterilizerKey)
      .limit(1);

    if (error) {
      throw toRepositoryError(error);
    }

    const rows = (data ?? []) as unknown as SterilizerTargetRow[];

    return rows[0] ? mapSterilizerTargetRow(rows[0]) : null;
  }
}

export function mapHardwareAssignmentRowToValidationAssignment(
  clinicId: string,
  row: HardwareAssignmentRow,
): DeploymentAssignmentTargetValidationAssignment {
  return {
    clinicId,
    deploymentHardwareKey: row.deployment_hardware_key,
    deploymentHardwareAssignmentKey: row.assignment_key,
    targetType: row.target_type,
    targetDeploymentKey: row.target_deployment_key,
    assignmentStatus: row.assignment_status,
    assignmentSource: row.assignment_source,
    active: row.active === false ? false : true,
  };
}

export function mapWorkstationTargetRow(
  row: WorkstationTargetRow,
): DeploymentAssignmentTargetValidationWorkstationTarget {
  return {
    id: row.id,
    clinicId: row.clinic_id,
    deploymentWorkstationKey: row.deployment_workstation_key,
    status: row.status,
    provisioningSource: row.provisioning_source,
    provisioningStatus: row.provisioning_status,
    active: row.active === false ? false : true,
  };
}

export function mapSterilizerTargetRow(
  row: SterilizerTargetRow,
): DeploymentAssignmentTargetValidationSterilizerTarget {
  return {
    id: row.id,
    clinicId: row.clinic_id,
    deploymentSterilizerKey: row.deployment_sterilizer_key,
    provisioningSource: row.provisioning_source,
    provisioningStatus: row.provisioning_status,
    active: row.active === false ? false : true,
  };
}

function toRepositoryError(
  error: SupabaseErrorLike,
): DeploymentAssignmentTargetValidationRepositoryError {
  return new DeploymentAssignmentTargetValidationRepositoryError(
    error.message,
    error.code ?? null,
  );
}