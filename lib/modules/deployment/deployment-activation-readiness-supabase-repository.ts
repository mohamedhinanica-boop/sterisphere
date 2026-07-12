import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  DeploymentActivationReadinessRepository,
} from "./deployment-activation-readiness-repository";
import type {
  DeploymentActivationReadinessAssessmentCommand,
  DeploymentActivationReadinessClinicRoot,
  DeploymentActivationReadinessClinicSettings,
  DeploymentActivationReadinessDeploymentRun,
  DeploymentActivationReadinessHardwareAssignment,
  DeploymentActivationReadinessHardwareShell,
  DeploymentActivationReadinessProviderShell,
  DeploymentActivationReadinessSnapshot,
  DeploymentActivationReadinessSterilizerShell,
  DeploymentActivationReadinessWorkstationShell,
} from "./deployment-activation-readiness-types";

const DEPLOYMENT_RUN_COLUMNS = [
  "deployment_run_id",
  "clinic_id",
  "lifecycle_state",
  "deployment_status",
].join(",");

const CLINIC_COLUMNS = ["id"].join(",");
const CLINIC_SETTINGS_COLUMNS = ["id", "clinic_id"].join(",");

const PROVIDER_SHELL_COLUMNS = [
  "id",
  "clinic_id",
  "deployment_provider_key",
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

const WORKSTATION_SHELL_COLUMNS = [
  "id",
  "clinic_id",
  "deployment_workstation_key",
  "provisioning_source",
  "provisioning_status",
  "active",
].join(",");

const HARDWARE_SHELL_COLUMNS = [
  "id",
  "clinic_id",
  "deployment_hardware_key",
  "provisioning_source",
  "provisioning_status",
  "active",
  "agent_id",
  "default_workstation_id",
  "current_workstation_id",
  "status",
].join(",");

const HARDWARE_ASSIGNMENT_COLUMNS = [
  "id",
  "clinic_id",
  "deployment_hardware_key",
  "assignment_key",
  "target_type",
  "target_deployment_key",
  "assignment_source",
  "assignment_status",
  "active",
].join(",");

type DeploymentRunRow = {
  deployment_run_id: string;
  clinic_id: string | null;
  lifecycle_state: string | null;
  deployment_status: string | null;
};

type ClinicRow = {
  id: string;
};

type ClinicSettingsRow = {
  id: string;
  clinic_id: string | null;
};

type ProviderShellRow = {
  id: string;
  clinic_id: string | null;
  deployment_provider_key: string | null;
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

type WorkstationShellRow = {
  id: string;
  clinic_id: string | null;
  deployment_workstation_key: string | null;
  provisioning_source: string | null;
  provisioning_status: string | null;
  active: boolean | null;
};

type HardwareShellRow = {
  id: string;
  clinic_id: string | null;
  deployment_hardware_key: string | null;
  provisioning_source: string | null;
  provisioning_status: string | null;
  active: boolean | null;
  agent_id: string | null;
  default_workstation_id: string | null;
  current_workstation_id: string | null;
  status: string | null;
};

type HardwareAssignmentRow = {
  id: string;
  clinic_id: string | null;
  deployment_hardware_key: string | null;
  assignment_key: string | null;
  target_type: string;
  target_deployment_key: string | null;
  assignment_source: string | null;
  assignment_status: string | null;
  active: boolean | null;
};

interface SupabaseErrorLike {
  code?: string;
  message: string;
}

export class DeploymentActivationReadinessRepositoryError extends Error {
  readonly code: string | null;

  constructor(message: string, code: string | null = null) {
    super(message);
    this.name = "DeploymentActivationReadinessRepositoryError";
    this.code = code;
  }
}

export class SupabaseDeploymentActivationReadinessRepository
  implements DeploymentActivationReadinessRepository
{
  constructor(private readonly client: SupabaseClient) {}

  async getReadinessSnapshot(
    command: DeploymentActivationReadinessAssessmentCommand,
  ): Promise<DeploymentActivationReadinessSnapshot> {
    const [
      deploymentRun,
      clinic,
      clinicSettings,
      providerShells,
      sterilizerShells,
      workstationShells,
      hardwareShells,
      hardwareAssignments,
    ] = await Promise.all([
      this.findDeploymentRun(command.deploymentRunId),
      this.findClinic(command.clinicId),
      this.findClinicSettings(command.clinicId),
      this.listProviderShells(command.clinicId),
      this.listSterilizerShells(command.clinicId),
      this.listWorkstationShells(command.clinicId),
      this.listHardwareShells(command.clinicId),
      this.listHardwareAssignments(command.clinicId),
    ]);

    return {
      deploymentRun,
      clinic,
      clinicSettings,
      providerShells,
      sterilizerShells,
      workstationShells,
      hardwareShells,
      hardwareAssignments,
      ...externalRuntimeEvidenceBoundary(),
    };
  }

  private async findDeploymentRun(
    deploymentRunId: string,
  ): Promise<DeploymentActivationReadinessDeploymentRun | null> {
    const { data, error } = await this.client
      .from("deployment_runs")
      .select(DEPLOYMENT_RUN_COLUMNS)
      .eq("deployment_run_id", deploymentRunId)
      .limit(2);

    if (error) {
      throw toRepositoryError(error);
    }

    const rows = (data ?? []) as unknown as DeploymentRunRow[];
    assertAtMostOne(rows, "deployment_run");

    return rows[0] ? mapDeploymentRunRow(rows[0]) : null;
  }

  private async findClinic(
    clinicId: string,
  ): Promise<DeploymentActivationReadinessClinicRoot | null> {
    const { data, error } = await this.client
      .from("clinics")
      .select(CLINIC_COLUMNS)
      .eq("id", clinicId)
      .limit(2);

    if (error) {
      throw toRepositoryError(error);
    }

    const rows = (data ?? []) as unknown as ClinicRow[];
    assertAtMostOne(rows, "clinic");

    return rows[0] ? mapClinicRow(rows[0]) : null;
  }

  private async findClinicSettings(
    clinicId: string,
  ): Promise<DeploymentActivationReadinessClinicSettings | null> {
    const { data, error } = await this.client
      .from("clinic_settings")
      .select(CLINIC_SETTINGS_COLUMNS)
      .eq("clinic_id", clinicId)
      .limit(2);

    if (error) {
      throw toRepositoryError(error);
    }

    const rows = (data ?? []) as unknown as ClinicSettingsRow[];
    assertAtMostOne(rows, "clinic_settings");

    return rows[0] ? mapClinicSettingsRow(rows[0]) : null;
  }

  private async listProviderShells(
    clinicId: string,
  ): Promise<readonly DeploymentActivationReadinessProviderShell[]> {
    const { data, error } = await this.client
      .from("providers")
      .select(PROVIDER_SHELL_COLUMNS)
      .eq("clinic_id", clinicId)
      .not("deployment_provider_key", "is", null)
      .order("deployment_provider_key", { ascending: true })
      .order("id", { ascending: true });

    if (error) {
      throw toRepositoryError(error);
    }

    return ((data ?? []) as unknown as ProviderShellRow[]).map(
      mapProviderShellRow,
    );
  }

  private async listSterilizerShells(
    clinicId: string,
  ): Promise<readonly DeploymentActivationReadinessSterilizerShell[]> {
    const { data, error } = await this.client
      .from("sterilizers")
      .select(STERILIZER_SHELL_COLUMNS)
      .eq("clinic_id", clinicId)
      .not("deployment_sterilizer_key", "is", null)
      .order("deployment_sterilizer_key", { ascending: true })
      .order("id", { ascending: true });

    if (error) {
      throw toRepositoryError(error);
    }

    return ((data ?? []) as unknown as SterilizerShellRow[]).map(
      mapSterilizerShellRow,
    );
  }

  private async listWorkstationShells(
    clinicId: string,
  ): Promise<readonly DeploymentActivationReadinessWorkstationShell[]> {
    const { data, error } = await this.client
      .from("clinical_workstations")
      .select(WORKSTATION_SHELL_COLUMNS)
      .eq("clinic_id", clinicId)
      .not("deployment_workstation_key", "is", null)
      .order("deployment_workstation_key", { ascending: true })
      .order("id", { ascending: true });

    if (error) {
      throw toRepositoryError(error);
    }

    return ((data ?? []) as unknown as WorkstationShellRow[]).map(
      mapWorkstationShellRow,
    );
  }

  private async listHardwareShells(
    clinicId: string,
  ): Promise<readonly DeploymentActivationReadinessHardwareShell[]> {
    const { data, error } = await this.client
      .from("clinical_hardware_devices")
      .select(HARDWARE_SHELL_COLUMNS)
      .eq("clinic_id", clinicId)
      .not("deployment_hardware_key", "is", null)
      .order("deployment_hardware_key", { ascending: true })
      .order("id", { ascending: true });

    if (error) {
      throw toRepositoryError(error);
    }

    return ((data ?? []) as unknown as HardwareShellRow[]).map(
      mapHardwareShellRow,
    );
  }

  private async listHardwareAssignments(
    clinicId: string,
  ): Promise<readonly DeploymentActivationReadinessHardwareAssignment[]> {
    const { data, error } = await this.client
      .from("deployment_hardware_assignments")
      .select(HARDWARE_ASSIGNMENT_COLUMNS)
      .eq("clinic_id", clinicId)
      .order("deployment_hardware_key", { ascending: true })
      .order("assignment_key", { ascending: true })
      .order("id", { ascending: true });

    if (error) {
      throw toRepositoryError(error);
    }

    return ((data ?? []) as unknown as HardwareAssignmentRow[]).map(
      mapHardwareAssignmentRow,
    );
  }
}

export function externalRuntimeEvidenceBoundary(): Pick<
  DeploymentActivationReadinessSnapshot,
  "assignmentTargetValidation" | "plannedAssignmentResolution"
> {
  return {
    assignmentTargetValidation: null,
    plannedAssignmentResolution: null,
  };
}

export function mapDeploymentRunRow(
  row: DeploymentRunRow,
): DeploymentActivationReadinessDeploymentRun {
  return {
    deploymentRunId: row.deployment_run_id,
    clinicId: row.clinic_id,
    lifecycleState: row.lifecycle_state,
    deploymentStatus: row.deployment_status,
  };
}

export function mapClinicRow(
  row: ClinicRow,
): DeploymentActivationReadinessClinicRoot {
  return {
    id: row.id,
  };
}

export function mapClinicSettingsRow(
  row: ClinicSettingsRow,
): DeploymentActivationReadinessClinicSettings {
  return {
    id: row.id,
    clinicId: row.clinic_id,
  };
}

export function mapProviderShellRow(
  row: ProviderShellRow,
): DeploymentActivationReadinessProviderShell {
  return {
    id: row.id,
    clinicId: row.clinic_id,
    deploymentProviderKey: row.deployment_provider_key,
    provisioningSource: row.provisioning_source,
    provisioningStatus: row.provisioning_status,
    active: row.active === false ? false : true,
  };
}

export function mapSterilizerShellRow(
  row: SterilizerShellRow,
): DeploymentActivationReadinessSterilizerShell {
  return {
    id: row.id,
    clinicId: row.clinic_id,
    deploymentSterilizerKey: row.deployment_sterilizer_key,
    provisioningSource: row.provisioning_source,
    provisioningStatus: row.provisioning_status,
    active: row.active === false ? false : true,
  };
}

export function mapWorkstationShellRow(
  row: WorkstationShellRow,
): DeploymentActivationReadinessWorkstationShell {
  return {
    id: row.id,
    clinicId: row.clinic_id,
    deploymentWorkstationKey: row.deployment_workstation_key,
    provisioningSource: row.provisioning_source,
    provisioningStatus: row.provisioning_status,
    active: row.active === false ? false : true,
  };
}

export function mapHardwareShellRow(
  row: HardwareShellRow,
): DeploymentActivationReadinessHardwareShell {
  return {
    id: row.id,
    clinicId: row.clinic_id,
    deploymentHardwareKey: row.deployment_hardware_key,
    provisioningSource: row.provisioning_source,
    provisioningStatus: row.provisioning_status,
    active: row.active === false ? false : true,
    agentId: row.agent_id,
    defaultWorkstationId: row.default_workstation_id,
    currentWorkstationId: row.current_workstation_id,
    status: row.status,
  };
}

export function mapHardwareAssignmentRow(
  row: HardwareAssignmentRow,
): DeploymentActivationReadinessHardwareAssignment {
  return {
    id: row.id,
    clinicId: row.clinic_id,
    deploymentHardwareKey: row.deployment_hardware_key,
    assignmentKey: row.assignment_key,
    targetType: row.target_type,
    targetDeploymentKey: row.target_deployment_key,
    assignmentSource: row.assignment_source,
    assignmentStatus: row.assignment_status,
    active: row.active === false ? false : true,
  };
}

function assertAtMostOne(rows: readonly unknown[], entityName: string): void {
  if (rows.length > 1) {
    throw new DeploymentActivationReadinessRepositoryError(
      `Duplicate ${entityName} rows prevent deterministic activation readiness assessment.`,
    );
  }
}

function toRepositoryError(
  error: SupabaseErrorLike,
): DeploymentActivationReadinessRepositoryError {
  return new DeploymentActivationReadinessRepositoryError(
    error.message,
    error.code ?? null,
  );
}
