import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  DeploymentPlannedAssignmentResolutionRepository,
} from "./deployment-planned-assignment-resolution-repository";
import type {
  DeploymentPlannedAssignmentResolutionAssignment,
  DeploymentPlannedAssignmentResolutionHardwareShell,
  DeploymentPlannedAssignmentResolutionSterilizerShell,
  DeploymentPlannedAssignmentResolutionWorkstationShell,
} from "./deployment-planned-assignment-resolution-types";

const HARDWARE_ASSIGNMENT_COLUMNS = [
  "clinic_id",
  "deployment_hardware_key",
  "assignment_key",
  "target_type",
  "target_deployment_key",
  "assignment_status",
  "assignment_source",
  "active",
].join(",");

const HARDWARE_SHELL_COLUMNS = [
  "id",
  "clinic_id",
  "deployment_hardware_key",
  "status",
  "provisioning_source",
  "provisioning_status",
  "active",
  "agent_id",
  "default_workstation_id",
  "current_workstation_id",
].join(",");

const WORKSTATION_SHELL_COLUMNS = [
  "id",
  "clinic_id",
  "deployment_workstation_key",
  "status",
  "provisioning_source",
  "provisioning_status",
  "active",
].join(",");

const STERILIZER_SHELL_COLUMNS = [
  "id",
  "clinic_id",
  "deployment_sterilizer_key",
  "provisioning_source",
  "provisioning_status",
  "active",
].join(",");

type HardwareAssignmentRow = {
  clinic_id: string;
  deployment_hardware_key: string;
  assignment_key: string | null;
  target_type: string;
  target_deployment_key: string | null;
  assignment_status: string | null;
  assignment_source: string | null;
  active: boolean | null;
};

type HardwareShellRow = {
  id: string;
  clinic_id: string | null;
  deployment_hardware_key: string | null;
  status: string | null;
  provisioning_source: string | null;
  provisioning_status: string | null;
  active: boolean | null;
  agent_id: string | null;
  default_workstation_id: string | null;
  current_workstation_id: string | null;
};

type WorkstationShellRow = {
  id: string;
  clinic_id: string | null;
  deployment_workstation_key: string | null;
  status: string | null;
  provisioning_source: string | null;
  provisioning_status: string | null;
  active: boolean | null;
};

type SterilizerShellRow = {
  id: string;
  clinic_id: string | null;
  deployment_sterilizer_key: string | null;
  provisioning_source: string | null;
  provisioning_status: string | null;
  active: boolean | null;
};

interface SupabaseErrorLike {
  code?: string;
  message: string;
}

export class DeploymentPlannedAssignmentResolutionRepositoryError extends Error {
  readonly code: string | null;

  constructor(message: string, code: string | null = null) {
    super(message);
    this.name = "DeploymentPlannedAssignmentResolutionRepositoryError";
    this.code = code;
  }
}

export class SupabaseDeploymentPlannedAssignmentResolutionRepository
  implements DeploymentPlannedAssignmentResolutionRepository
{
  constructor(private readonly client: SupabaseClient) {}

  async listPlannedHardwareAssignments(
    clinicId: string,
  ): Promise<readonly DeploymentPlannedAssignmentResolutionAssignment[]> {
    const { data, error } = await this.client
      .from("deployment_hardware_assignments")
      .select(HARDWARE_ASSIGNMENT_COLUMNS)
      .eq("clinic_id", clinicId)
      .eq("assignment_source", "setup_draft")
      .eq("assignment_status", "planned")
      .eq("active", false)
      .order("deployment_hardware_key", { ascending: true });

    if (error) {
      throw toRepositoryError(error);
    }

    return ((data ?? []) as unknown as HardwareAssignmentRow[]).map((row) =>
      mapHardwareAssignmentRow(row),
    );
  }

  async findHardwareShellByDeploymentKey(
    clinicId: string,
    deploymentHardwareKey: string,
  ): Promise<DeploymentPlannedAssignmentResolutionHardwareShell | null> {
    const { data, error } = await this.client
      .from("clinical_hardware_devices")
      .select(HARDWARE_SHELL_COLUMNS)
      .eq("clinic_id", clinicId)
      .eq("deployment_hardware_key", deploymentHardwareKey)
      .limit(2);

    if (error) {
      throw toRepositoryError(error);
    }

    const rows = (data ?? []) as unknown as HardwareShellRow[];

    if (rows.length > 1) {
      throw new DeploymentPlannedAssignmentResolutionRepositoryError(
        "Duplicate same-clinic hardware deployment keys prevent deterministic planned assignment resolution.",
      );
    }

    return rows[0] ? mapHardwareShellRow(rows[0]) : null;
  }

  async findAnyHardwareShellByDeploymentKey(
    deploymentHardwareKey: string,
  ): Promise<DeploymentPlannedAssignmentResolutionHardwareShell | null> {
    const { data, error } = await this.client
      .from("clinical_hardware_devices")
      .select(HARDWARE_SHELL_COLUMNS)
      .eq("deployment_hardware_key", deploymentHardwareKey)
      .limit(1);

    if (error) {
      throw toRepositoryError(error);
    }

    const rows = (data ?? []) as unknown as HardwareShellRow[];

    return rows[0] ? mapHardwareShellRow(rows[0]) : null;
  }

  async findWorkstationShellByDeploymentKey(
    clinicId: string,
    deploymentWorkstationKey: string,
  ): Promise<DeploymentPlannedAssignmentResolutionWorkstationShell | null> {
    const { data, error } = await this.client
      .from("clinical_workstations")
      .select(WORKSTATION_SHELL_COLUMNS)
      .eq("clinic_id", clinicId)
      .eq("deployment_workstation_key", deploymentWorkstationKey)
      .limit(2);

    if (error) {
      throw toRepositoryError(error);
    }

    const rows = (data ?? []) as unknown as WorkstationShellRow[];

    if (rows.length > 1) {
      throw new DeploymentPlannedAssignmentResolutionRepositoryError(
        "Duplicate same-clinic workstation deployment keys prevent deterministic planned assignment resolution.",
      );
    }

    return rows[0] ? mapWorkstationShellRow(rows[0]) : null;
  }

  async findAnyWorkstationShellByDeploymentKey(
    deploymentWorkstationKey: string,
  ): Promise<DeploymentPlannedAssignmentResolutionWorkstationShell | null> {
    const { data, error } = await this.client
      .from("clinical_workstations")
      .select(WORKSTATION_SHELL_COLUMNS)
      .eq("deployment_workstation_key", deploymentWorkstationKey)
      .limit(1);

    if (error) {
      throw toRepositoryError(error);
    }

    const rows = (data ?? []) as unknown as WorkstationShellRow[];

    return rows[0] ? mapWorkstationShellRow(rows[0]) : null;
  }

  async findSterilizerShellByDeploymentKey(
    clinicId: string,
    deploymentSterilizerKey: string,
  ): Promise<DeploymentPlannedAssignmentResolutionSterilizerShell | null> {
    const { data, error } = await this.client
      .from("sterilizers")
      .select(STERILIZER_SHELL_COLUMNS)
      .eq("clinic_id", clinicId)
      .eq("deployment_sterilizer_key", deploymentSterilizerKey)
      .limit(2);

    if (error) {
      throw toRepositoryError(error);
    }

    const rows = (data ?? []) as unknown as SterilizerShellRow[];

    if (rows.length > 1) {
      throw new DeploymentPlannedAssignmentResolutionRepositoryError(
        "Duplicate same-clinic sterilizer deployment keys prevent deterministic planned assignment resolution.",
      );
    }

    return rows[0] ? mapSterilizerShellRow(rows[0]) : null;
  }

  async findAnySterilizerShellByDeploymentKey(
    deploymentSterilizerKey: string,
  ): Promise<DeploymentPlannedAssignmentResolutionSterilizerShell | null> {
    const { data, error } = await this.client
      .from("sterilizers")
      .select(STERILIZER_SHELL_COLUMNS)
      .eq("deployment_sterilizer_key", deploymentSterilizerKey)
      .limit(1);

    if (error) {
      throw toRepositoryError(error);
    }

    const rows = (data ?? []) as unknown as SterilizerShellRow[];

    return rows[0] ? mapSterilizerShellRow(rows[0]) : null;
  }
}

export function mapHardwareAssignmentRow(
  row: HardwareAssignmentRow,
): DeploymentPlannedAssignmentResolutionAssignment {
  return {
    clinicId: row.clinic_id,
    deploymentHardwareKey: row.deployment_hardware_key,
    assignmentKey: row.assignment_key,
    targetType: row.target_type,
    targetDeploymentKey: row.target_deployment_key,
  };
}

export function mapHardwareShellRow(
  row: HardwareShellRow,
): DeploymentPlannedAssignmentResolutionHardwareShell {
  return {
    id: row.id,
    clinicId: row.clinic_id,
    deploymentHardwareKey: row.deployment_hardware_key,
    status: row.status,
    provisioningSource: row.provisioning_source,
    provisioningStatus: row.provisioning_status,
    active: row.active === false ? false : true,
    agentId: row.agent_id,
    defaultWorkstationId: row.default_workstation_id,
    currentWorkstationId: row.current_workstation_id,
  };
}

export function mapWorkstationShellRow(
  row: WorkstationShellRow,
): DeploymentPlannedAssignmentResolutionWorkstationShell {
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

export function mapSterilizerShellRow(
  row: SterilizerShellRow,
): DeploymentPlannedAssignmentResolutionSterilizerShell {
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
): DeploymentPlannedAssignmentResolutionRepositoryError {
  return new DeploymentPlannedAssignmentResolutionRepositoryError(
    error.message,
    error.code ?? null,
  );
}