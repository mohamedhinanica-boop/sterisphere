import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  DeploymentWorkstationRepository,
  DeploymentWorkstationShellPersistenceResult,
} from "./deployment-workstation-repository";
import type {
  CreateDeploymentWorkstationShellPayload,
  DeploymentWorkstationShellRecord,
} from "./deployment-workstation-types";

type DeploymentWorkstationDatabasePayload = {
  clinic_id: string;
  deployment_workstation_key: string;
  name: string;
  workstation_type: string;
  display_order: number;
  status: "planned";
  supports_printer: boolean;
  supports_usb_scanner: boolean;
  supports_camera: boolean;
  supports_sound: boolean;
  supports_sterilizer: boolean;
  location_label: string | null;
  agent_url: null;
  active: false;
  provisioning_source: "setup_draft";
  provisioning_status: "planned";
  created_at?: string;
  updated_at?: string;
};

type DeploymentWorkstationDatabaseRow = DeploymentWorkstationDatabasePayload & {
  id: string;
  clinic_id: string | null;
  deployment_workstation_key: string | null;
  name: string;
  workstation_type: DeploymentWorkstationShellRecord["workstationType"];
  display_order: number | null;
  status: DeploymentWorkstationShellRecord["status"];
  location_label: string | null;
  agent_url: string | null;
  active: boolean | null;
  provisioning_source: string | null;
  provisioning_status: "planned" | "active" | "archived" | null;
  created_at: string;
  updated_at?: string | null;
};

interface SupabaseErrorLike {
  code?: string;
  message: string;
}

export class DeploymentWorkstationRepositoryError extends Error {
  readonly code: string | null;

  constructor(message: string, code: string | null = null) {
    super(message);
    this.name = "DeploymentWorkstationRepositoryError";
    this.code = code;
  }
}

export class SupabaseDeploymentWorkstationRepository
  implements DeploymentWorkstationRepository
{
  constructor(private readonly client: SupabaseClient) {}

  async findWorkstationByDeploymentKey(
    clinicId: string,
    deploymentWorkstationKey: string,
  ): Promise<DeploymentWorkstationShellRecord | null> {
    const { data, error } = await this.client
      .from("clinical_workstations")
      .select("*")
      .eq("clinic_id", clinicId)
      .eq("deployment_workstation_key", deploymentWorkstationKey)
      .maybeSingle();

    if (error) {
      throw toRepositoryError(error);
    }

    return data ? mapWorkstationRowToRecord(data) : null;
  }

  async createWorkstationShell(
    payload: CreateDeploymentWorkstationShellPayload,
  ): Promise<DeploymentWorkstationShellPersistenceResult> {
    const payloadValidationMessage = validateWorkstationShellPayload(payload);

    if (payloadValidationMessage) {
      return {
        ok: false,
        workstation: null,
        message: payloadValidationMessage,
      };
    }

    const existingWorkstation = await this.findWorkstationByDeploymentKey(
      payload.clinicId,
      payload.deploymentWorkstationKey,
    );

    if (existingWorkstation) {
      return resolveExistingWorkstationShell(existingWorkstation);
    }

    const { data, error } = await this.client
      .from("clinical_workstations")
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
      workstation: mapWorkstationRowToRecord(data),
      message: "Workstation planned shell provisioned for draft clinic.",
    };
  }

  async listDeploymentWorkstationShells(
    clinicId: string,
  ): Promise<readonly DeploymentWorkstationShellRecord[]> {
    const { data, error } = await this.client
      .from("clinical_workstations")
      .select("*")
      .eq("clinic_id", clinicId)
      .not("deployment_workstation_key", "is", null)
      .order("deployment_workstation_key", { ascending: true });

    if (error) {
      throw toRepositoryError(error);
    }

    return (data ?? []).map((row) =>
      mapWorkstationRowToRecord(row as DeploymentWorkstationDatabaseRow),
    );
  }

  private async resolveCreateConflictAfterUniqueViolation(
    payload: CreateDeploymentWorkstationShellPayload,
  ): Promise<DeploymentWorkstationShellPersistenceResult> {
    const existingWorkstation = await this.findWorkstationByDeploymentKey(
      payload.clinicId,
      payload.deploymentWorkstationKey,
    );

    if (existingWorkstation) {
      return resolveExistingWorkstationShell(existingWorkstation);
    }

    return {
      ok: false,
      workstation: null,
      message:
        "Workstation shell unique conflict could not be resolved safely; this may be a clinic-scoped name collision or missing deployment metadata constraint.",
    };
  }
}

export function mapCreatePayloadToDatabasePayload(
  payload: CreateDeploymentWorkstationShellPayload,
): DeploymentWorkstationDatabasePayload {
  return {
    clinic_id: payload.clinicId,
    deployment_workstation_key: payload.deploymentWorkstationKey,
    name: payload.name,
    workstation_type: payload.workstationType,
    display_order: payload.displayOrder,
    status: "planned",
    supports_printer: payload.capabilities.printer,
    supports_usb_scanner: payload.capabilities.usb_scanner,
    supports_camera: payload.capabilities.camera,
    supports_sound: payload.capabilities.sound,
    supports_sterilizer: payload.capabilities.sterilizer,
    location_label: payload.locationLabel,
    agent_url: null,
    active: false,
    provisioning_source: "setup_draft",
    provisioning_status: "planned",
    created_at: payload.createdAt,
    updated_at: payload.updatedAt,
  };
}

export function mapWorkstationRowToRecord(
  row: DeploymentWorkstationDatabaseRow,
): DeploymentWorkstationShellRecord {
  return {
    id: row.id,
    clinicId: row.clinic_id,
    deploymentWorkstationKey: row.deployment_workstation_key,
    name: row.name,
    workstationType: row.workstation_type,
    displayOrder: row.display_order ?? 100,
    status: row.status,
    capabilities: {
      printer: row.supports_printer,
      usb_scanner: row.supports_usb_scanner,
      camera: row.supports_camera,
      sound: row.supports_sound,
      sterilizer: row.supports_sterilizer,
    },
    locationLabel: row.location_label,
    agentUrl: row.agent_url,
    active: row.active === false ? false : true,
    provisioningSource: row.provisioning_source,
    provisioningStatus: row.provisioning_status ?? "active",
    createdAt: row.created_at,
    updatedAt: row.updated_at ?? null,
  };
}

function validateWorkstationShellPayload(
  payload: CreateDeploymentWorkstationShellPayload,
): string | null {
  if (!payload.clinicId.trim()) {
    return "Workstation shell creation requires a clinic id.";
  }

  if (!payload.deploymentWorkstationKey.trim()) {
    return "Workstation shell creation requires a deployment workstation key.";
  }

  if (!payload.name.trim()) {
    return "Workstation shell creation requires a clinic-scoped name.";
  }

  if (payload.displayOrder < 1) {
    return "Workstation shell creation requires a positive display order.";
  }

  if (
    payload.provisioningSource !== "setup_draft" ||
    payload.provisioningStatus !== "planned" ||
    payload.status !== "planned" ||
    payload.active !== false ||
    payload.agentUrl !== null
  ) {
    return "Workstation shell creation accepts only inactive setup_draft planned shells without an agent URL.";
  }

  return null;
}

function resolveExistingWorkstationShell(
  workstation: DeploymentWorkstationShellRecord,
): DeploymentWorkstationShellPersistenceResult {
  if (isReusableWorkstationShell(workstation)) {
    return {
      ok: true,
      workstation,
      message:
        "Workstation planned shell already exists for this clinic; reuse it.",
    };
  }

  return {
    ok: false,
    workstation,
    message:
      "Workstation deployment key is already used by a non-planned workstation record.",
  };
}

function isReusableWorkstationShell(
  workstation: DeploymentWorkstationShellRecord,
): boolean {
  return (
    workstation.clinicId !== null &&
    workstation.deploymentWorkstationKey !== null &&
    workstation.provisioningSource === "setup_draft" &&
    workstation.provisioningStatus === "planned" &&
    workstation.status === "planned" &&
    workstation.active === false &&
    workstation.agentUrl === null
  );
}

function isUniqueViolation(error: SupabaseErrorLike): boolean {
  return error.code === "23505";
}

function toRepositoryError(
  error: SupabaseErrorLike,
): DeploymentWorkstationRepositoryError {
  return new DeploymentWorkstationRepositoryError(
    error.message,
    error.code ?? null,
  );
}
