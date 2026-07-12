import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  DeploymentActivationExecutionRepository,
} from "./deployment-activation-execution-repository";
import type {
  DeploymentActivationExecutionCommand,
  DeploymentActivationExecutionCurrentStateSnapshot,
  DeploymentActivationExecutionDeploymentRunSnapshot,
  DeploymentActivationExecutionSnapshot,
} from "./deployment-activation-execution-types";
import type {
  DeploymentActivationPlanItem,
} from "./deployment-activation-plan-types";

const DEPLOYMENT_RUN_COLUMNS = [
  "deployment_run_id",
  "clinic_id",
  "lifecycle_state",
  "deployment_status",
].join(",");

const CLINIC_COLUMNS = ["id", "deployment_status"].join(",");
const CLINIC_SETTINGS_COLUMNS = ["id", "clinic_id"].join(",");

const PROVIDER_COLUMNS = [
  "id",
  "clinic_id",
  "deployment_provider_key",
  "provisioning_status",
  "active",
].join(",");

const STERILIZER_COLUMNS = [
  "id",
  "clinic_id",
  "deployment_sterilizer_key",
  "provisioning_status",
  "active",
].join(",");

const WORKSTATION_COLUMNS = [
  "id",
  "clinic_id",
  "deployment_workstation_key",
  "provisioning_status",
  "active",
].join(",");

const HARDWARE_COLUMNS = [
  "id",
  "clinic_id",
  "deployment_hardware_key",
  "provisioning_status",
  "active",
  "status",
  "agent_id",
  "default_workstation_id",
  "current_workstation_id",
].join(",");

const HARDWARE_ASSIGNMENT_COLUMNS = [
  "id",
  "clinic_id",
  "deployment_hardware_key",
  "assignment_key",
  "target_type",
  "target_deployment_key",
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
  deployment_status: string | null;
};

type ClinicSettingsRow = {
  id: string;
  clinic_id: string | null;
};

type ProviderRow = {
  id: string;
  clinic_id: string | null;
  deployment_provider_key: string | null;
  provisioning_status: string | null;
  active: boolean | null;
};

type SterilizerRow = {
  id: string;
  clinic_id: string | null;
  deployment_sterilizer_key: string | null;
  provisioning_status: string | null;
  active: boolean | null;
};

type WorkstationRow = {
  id: string;
  clinic_id: string | null;
  deployment_workstation_key: string | null;
  provisioning_status: string | null;
  active: boolean | null;
};

type HardwareRow = {
  id: string;
  clinic_id: string | null;
  deployment_hardware_key: string | null;
  provisioning_status: string | null;
  active: boolean | null;
  status: string | null;
  agent_id: string | null;
  default_workstation_id: string | null;
  current_workstation_id: string | null;
};

type HardwareAssignmentRow = {
  id: string;
  clinic_id: string | null;
  deployment_hardware_key: string | null;
  assignment_key: string | null;
  target_type: string | null;
  target_deployment_key: string | null;
  assignment_status: string | null;
  active: boolean | null;
};

interface SupabaseErrorLike {
  code?: string;
  message: string;
}

export class DeploymentActivationExecutionRepositoryError extends Error {
  readonly code: string | null;

  constructor(message: string, code: string | null = null) {
    super(message);
    this.name = "DeploymentActivationExecutionRepositoryError";
    this.code = code;
  }
}

export class SupabaseDeploymentActivationExecutionRepository
  implements DeploymentActivationExecutionRepository
{
  constructor(private readonly client: SupabaseClient) {}

  async getExecutionSnapshot(
    command: DeploymentActivationExecutionCommand,
  ): Promise<DeploymentActivationExecutionSnapshot> {
    const deploymentRun = await this.findDeploymentRun(
      command.deploymentRunId,
    );

    const currentStates = await Promise.all(
      [...command.planItems]
        .sort(comparePlanItems)
        .map((item) => this.findCurrentState(command, item, deploymentRun)),
    );

    return {
      deploymentRun,
      existingExecution: executionIdentityNotPersisted(),
      currentStates: currentStates.filter(
        (state): state is DeploymentActivationExecutionCurrentStateSnapshot =>
          state !== null,
      ),
    };
  }

  private async findDeploymentRun(
    deploymentRunId: string,
  ): Promise<DeploymentActivationExecutionDeploymentRunSnapshot | null> {
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

  private async findCurrentState(
    command: DeploymentActivationExecutionCommand,
    item: DeploymentActivationPlanItem,
    deploymentRun: DeploymentActivationExecutionDeploymentRunSnapshot | null,
  ): Promise<DeploymentActivationExecutionCurrentStateSnapshot | null> {
    switch (item.entityType) {
      case "deployment_run":
        return deploymentRun
          ? currentState(item, mapDeploymentRunCurrentState(deploymentRun))
          : null;
      case "clinic":
        return this.findClinicCurrentState(command, item);
      case "clinic_settings":
        return this.findClinicSettingsCurrentState(command, item);
      case "provider_shell":
        return this.findProviderCurrentState(command, item);
      case "sterilizer_shell":
        return this.findSterilizerCurrentState(command, item);
      case "workstation_shell":
        return this.findWorkstationCurrentState(command, item);
      case "hardware_shell":
        return this.findHardwareCurrentState(command, item);
      case "hardware_binding":
        return this.findHardwareBindingCurrentState(command, item);
      case "hardware_assignment":
        return this.findHardwareAssignmentCurrentState(command, item);
      case "activation_plan":
        return null;
    }
  }

  private async findClinicCurrentState(
    command: DeploymentActivationExecutionCommand,
    item: DeploymentActivationPlanItem,
  ): Promise<DeploymentActivationExecutionCurrentStateSnapshot | null> {
    const clinicId = item.entityId ?? command.clinicId;
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

    return rows[0]
      ? currentState(item, mapClinicCurrentState(rows[0], command.clinicId))
      : null;
  }

  private async findClinicSettingsCurrentState(
    command: DeploymentActivationExecutionCommand,
    item: DeploymentActivationPlanItem,
  ): Promise<DeploymentActivationExecutionCurrentStateSnapshot | null> {
    const query = this.client
      .from("clinic_settings")
      .select(CLINIC_SETTINGS_COLUMNS)
      .limit(2);

    const { data, error } = item.entityId
      ? await query.eq("id", item.entityId)
      : await query.eq("clinic_id", command.clinicId);

    if (error) {
      throw toRepositoryError(error);
    }

    const rows = (data ?? []) as unknown as ClinicSettingsRow[];
    assertAtMostOne(rows, "clinic_settings");

    return rows[0]
      ? currentState(
          item,
          mapClinicSettingsCurrentState(rows[0], command.clinicId),
        )
      : null;
  }

  private async findProviderCurrentState(
    command: DeploymentActivationExecutionCommand,
    item: DeploymentActivationPlanItem,
  ): Promise<DeploymentActivationExecutionCurrentStateSnapshot | null> {
    const row = await this.findClinicDeploymentKeyedRow<ProviderRow>({
      tableName: "providers",
      columns: PROVIDER_COLUMNS,
      clinicId: command.clinicId,
      deploymentKeyColumn: "deployment_provider_key",
      deploymentKey: item.deploymentKey,
      entityId: item.entityId,
      entityName: "provider_shell",
    });

    return row ? currentState(item, mapProviderCurrentState(row, item)) : null;
  }

  private async findSterilizerCurrentState(
    command: DeploymentActivationExecutionCommand,
    item: DeploymentActivationPlanItem,
  ): Promise<DeploymentActivationExecutionCurrentStateSnapshot | null> {
    const row = await this.findClinicDeploymentKeyedRow<SterilizerRow>({
      tableName: "sterilizers",
      columns: STERILIZER_COLUMNS,
      clinicId: command.clinicId,
      deploymentKeyColumn: "deployment_sterilizer_key",
      deploymentKey: item.deploymentKey,
      entityId: item.entityId,
      entityName: "sterilizer_shell",
    });

    return row
      ? currentState(item, mapSterilizerCurrentState(row, item))
      : null;
  }

  private async findWorkstationCurrentState(
    command: DeploymentActivationExecutionCommand,
    item: DeploymentActivationPlanItem,
  ): Promise<DeploymentActivationExecutionCurrentStateSnapshot | null> {
    const row = await this.findClinicDeploymentKeyedRow<WorkstationRow>({
      tableName: "clinical_workstations",
      columns: WORKSTATION_COLUMNS,
      clinicId: command.clinicId,
      deploymentKeyColumn: "deployment_workstation_key",
      deploymentKey: item.deploymentKey,
      entityId: item.entityId,
      entityName: "workstation_shell",
    });

    return row
      ? currentState(item, mapWorkstationCurrentState(row, item))
      : null;
  }

  private async findHardwareCurrentState(
    command: DeploymentActivationExecutionCommand,
    item: DeploymentActivationPlanItem,
  ): Promise<DeploymentActivationExecutionCurrentStateSnapshot | null> {
    const row = await this.findHardwareRow(command, item);

    return row ? currentState(item, mapHardwareCurrentState(row, item)) : null;
  }

  private async findHardwareBindingCurrentState(
    command: DeploymentActivationExecutionCommand,
    item: DeploymentActivationPlanItem,
  ): Promise<DeploymentActivationExecutionCurrentStateSnapshot | null> {
    const row = await this.findHardwareRow(command, item);

    return row
      ? currentState(item, mapHardwareBindingCurrentState(row, item))
      : null;
  }

  private async findHardwareAssignmentCurrentState(
    command: DeploymentActivationExecutionCommand,
    item: DeploymentActivationPlanItem,
  ): Promise<DeploymentActivationExecutionCurrentStateSnapshot | null> {
    const row = await this.findClinicDeploymentKeyedRow<HardwareAssignmentRow>({
      tableName: "deployment_hardware_assignments",
      columns: HARDWARE_ASSIGNMENT_COLUMNS,
      clinicId: command.clinicId,
      deploymentKeyColumn: "deployment_hardware_key",
      deploymentKey: item.deploymentKey,
      entityId: item.entityId,
      entityName: "hardware_assignment",
    });

    return row
      ? currentState(item, mapHardwareAssignmentCurrentState(row, item))
      : null;
  }

  private async findHardwareRow(
    command: DeploymentActivationExecutionCommand,
    item: DeploymentActivationPlanItem,
  ): Promise<HardwareRow | null> {
    return this.findClinicDeploymentKeyedRow<HardwareRow>({
      tableName: "clinical_hardware_devices",
      columns: HARDWARE_COLUMNS,
      clinicId: command.clinicId,
      deploymentKeyColumn: "deployment_hardware_key",
      deploymentKey: item.deploymentKey,
      entityId: item.entityId,
      entityName: "hardware_shell",
    });
  }

  private async findClinicDeploymentKeyedRow<Row extends { id: string }>(
    input: {
      tableName: string;
      columns: string;
      clinicId: string;
      deploymentKeyColumn: string;
      deploymentKey: string | null;
      entityId: string | null;
      entityName: string;
    },
  ): Promise<Row | null> {
    if (input.deploymentKey) {
      const { data, error } = await this.client
        .from(input.tableName)
        .select(input.columns)
        .eq("clinic_id", input.clinicId)
        .eq(input.deploymentKeyColumn, input.deploymentKey)
        .limit(2);

      if (error) {
        throw toRepositoryError(error);
      }

      const rows = (data ?? []) as unknown as Row[];
      assertAtMostOne(rows, input.entityName);

      if (!rows[0]) {
        return null;
      }

      if (input.entityId && rows[0].id !== input.entityId) {
        return rows[0];
      }

      return rows[0];
    }

    if (!input.entityId) {
      return null;
    }

    const { data, error } = await this.client
      .from(input.tableName)
      .select(input.columns)
      .eq("id", input.entityId)
      .limit(2);

    if (error) {
      throw toRepositoryError(error);
    }

    const rows = (data ?? []) as unknown as Row[];
    assertAtMostOne(rows, input.entityName);

    return rows[0] ?? null;
  }
}

export function mapDeploymentRunRow(
  row: DeploymentRunRow,
): DeploymentActivationExecutionDeploymentRunSnapshot {
  return {
    deploymentRunId: row.deployment_run_id,
    clinicId: row.clinic_id,
    lifecycleState: row.lifecycle_state,
    deploymentStatus: row.deployment_status,
    executionOwnerKey: null,
  };
}

export function mapDeploymentRunCurrentState(
  row: DeploymentActivationExecutionDeploymentRunSnapshot,
): Record<string, unknown> {
  return {
    deploymentStatus: row.deploymentStatus,
  };
}

export function mapClinicCurrentState(
  row: ClinicRow,
  expectedClinicId: string,
): Record<string, unknown> {
  if (row.id !== expectedClinicId) {
    return incompatibleState("clinic_ownership_mismatch", {
      clinicId: row.id,
      expectedClinicId,
    });
  }

  return {
    deploymentStatus: row.deployment_status,
  };
}

export function mapClinicSettingsCurrentState(
  row: ClinicSettingsRow,
  expectedClinicId: string,
): Record<string, unknown> {
  if (row.clinic_id !== expectedClinicId) {
    return incompatibleState("clinic_ownership_mismatch", {
      clinicId: row.clinic_id,
      expectedClinicId,
    });
  }

  return {
    unsupportedActivationField: "not_persisted",
  };
}

export function mapProviderCurrentState(
  row: ProviderRow,
  item: DeploymentActivationPlanItem,
): Record<string, unknown> {
  return keyedShellState({
    rowId: row.id,
    expectedEntityId: item.entityId,
    rowClinicId: row.clinic_id,
    expectedClinicId: item.clinicId,
    rowDeploymentKey: row.deployment_provider_key,
    expectedDeploymentKey: item.deploymentKey,
    provisioningStatus: row.provisioning_status,
    active: row.active,
  });
}

export function mapSterilizerCurrentState(
  row: SterilizerRow,
  item: DeploymentActivationPlanItem,
): Record<string, unknown> {
  return keyedShellState({
    rowId: row.id,
    expectedEntityId: item.entityId,
    rowClinicId: row.clinic_id,
    expectedClinicId: item.clinicId,
    rowDeploymentKey: row.deployment_sterilizer_key,
    expectedDeploymentKey: item.deploymentKey,
    provisioningStatus: row.provisioning_status,
    active: row.active,
  });
}

export function mapWorkstationCurrentState(
  row: WorkstationRow,
  item: DeploymentActivationPlanItem,
): Record<string, unknown> {
  return keyedShellState({
    rowId: row.id,
    expectedEntityId: item.entityId,
    rowClinicId: row.clinic_id,
    expectedClinicId: item.clinicId,
    rowDeploymentKey: row.deployment_workstation_key,
    expectedDeploymentKey: item.deploymentKey,
    provisioningStatus: row.provisioning_status,
    active: row.active,
  });
}

export function mapHardwareCurrentState(
  row: HardwareRow,
  item: DeploymentActivationPlanItem,
): Record<string, unknown> {
  return keyedShellState({
    rowId: row.id,
    expectedEntityId: item.entityId,
    rowClinicId: row.clinic_id,
    expectedClinicId: item.clinicId,
    rowDeploymentKey: row.deployment_hardware_key,
    expectedDeploymentKey: item.deploymentKey,
    provisioningStatus: row.provisioning_status,
    active: row.active,
  });
}

export function mapHardwareBindingCurrentState(
  row: HardwareRow,
  item: DeploymentActivationPlanItem,
): Record<string, unknown> {
  const keyedState = keyedShellState({
    rowId: row.id,
    expectedEntityId: item.entityId,
    rowClinicId: row.clinic_id,
    expectedClinicId: item.clinicId,
    rowDeploymentKey: row.deployment_hardware_key,
    expectedDeploymentKey: item.deploymentKey,
    provisioningStatus: row.provisioning_status,
    active: row.active,
  });

  if ("__incompatible" in keyedState) {
    return keyedState;
  }

  return {
    hardwareId: row.id,
    targetId: row.current_workstation_id ?? row.default_workstation_id,
    targetType: item.currentState.targetType ?? null,
  };
}

export function mapHardwareOperationalBindingEvidence(
  row: HardwareRow,
): Record<string, unknown> {
  return {
    agentId: row.agent_id,
    defaultWorkstationId: row.default_workstation_id,
    currentWorkstationId: row.current_workstation_id,
    status: row.status,
  };
}

export function mapHardwareAssignmentCurrentState(
  row: HardwareAssignmentRow,
  item: DeploymentActivationPlanItem,
): Record<string, unknown> {
  const keyedState = keyedShellState({
    rowId: row.id,
    expectedEntityId: item.entityId,
    rowClinicId: row.clinic_id,
    expectedClinicId: item.clinicId,
    rowDeploymentKey: row.deployment_hardware_key,
    expectedDeploymentKey: item.deploymentKey,
    provisioningStatus: row.assignment_status,
    active: row.active,
  });

  if ("__incompatible" in keyedState) {
    return keyedState;
  }

  return {
    assignmentStatus: row.assignment_status,
    active: row.active,
  };
}

export function executionIdentityNotPersisted(): null {
  return null;
}

export function assertAtMostOne(
  rows: readonly unknown[],
  entityName: string,
): void {
  if (rows.length > 1) {
    throw new DeploymentActivationExecutionRepositoryError(
      `Duplicate ${entityName} rows prevent deterministic activation execution preparation.`,
    );
  }
}

function keyedShellState(input: {
  rowId: string;
  expectedEntityId: string | null;
  rowClinicId: string | null;
  expectedClinicId: string;
  rowDeploymentKey: string | null;
  expectedDeploymentKey: string | null;
  provisioningStatus: string | null;
  active: boolean | null;
}): Record<string, unknown> {
  if (input.expectedEntityId && input.rowId !== input.expectedEntityId) {
    return incompatibleState("entity_id_mismatch", {
      entityId: input.rowId,
      expectedEntityId: input.expectedEntityId,
    });
  }

  if (input.rowClinicId !== input.expectedClinicId) {
    return incompatibleState("clinic_ownership_mismatch", {
      clinicId: input.rowClinicId,
      expectedClinicId: input.expectedClinicId,
    });
  }

  if (input.rowDeploymentKey !== input.expectedDeploymentKey) {
    return incompatibleState("deployment_key_mismatch", {
      deploymentKey: input.rowDeploymentKey,
      expectedDeploymentKey: input.expectedDeploymentKey,
    });
  }

  return {
    provisioningStatus: input.provisioningStatus,
    active: input.active,
  };
}

function incompatibleState(
  reason: string,
  evidence: Record<string, unknown>,
): Record<string, unknown> {
  return {
    __incompatible: reason,
    ...evidence,
  };
}

function currentState(
  item: DeploymentActivationPlanItem,
  state: Record<string, unknown>,
): DeploymentActivationExecutionCurrentStateSnapshot {
  return {
    planItemKey: item.planItemKey,
    currentState: state,
  };
}

function comparePlanItems(
  left: DeploymentActivationPlanItem,
  right: DeploymentActivationPlanItem,
): number {
  return (
    left.sequence - right.sequence ||
    left.planItemKey.localeCompare(right.planItemKey)
  );
}

function toRepositoryError(
  error: SupabaseErrorLike,
): DeploymentActivationExecutionRepositoryError {
  return new DeploymentActivationExecutionRepositoryError(
    error.message,
    error.code ?? null,
  );
}
