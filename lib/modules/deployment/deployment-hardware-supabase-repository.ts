import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  DeploymentHardwareRepository,
  DeploymentHardwareShellPersistenceResult,
} from "./deployment-hardware-repository";
import type {
  CreateDeploymentHardwareShellPayload,
  DeploymentHardwareCapability,
  DeploymentHardwareShellRecord,
  DeploymentHardwareType,
} from "./deployment-hardware-types";

type HardwareDeviceType =
  | "printer"
  | "usb_scanner"
  | "camera"
  | "speaker"
  | "sterilizer"
  | "environment_sensor"
  | "rfid_reader"
  | "nfc_reader"
  | "future_custom";

type HardwareDeviceStatus =
  | "discovered"
  | "registered"
  | "assigned"
  | "active"
  | "maintenance"
  | "retired"
  | "offline"
  | "needs_attention";

type HardwareDeviceHealth =
  | "unknown"
  | "healthy"
  | "warning"
  | "error"
  | "offline";

type HardwareMetadata = Record<string, unknown>;

type DeploymentHardwareDatabasePayload = {
  clinic_id: string;
  deployment_hardware_key: string;
  provisioning_source: "setup_draft";
  provisioning_status: "planned";
  active: false;
  display_order: number;
  agent_id: null;
  default_workstation_id: null;
  current_workstation_id: null;
  device_name: string;
  device_type: HardwareDeviceType;
  device_role: string;
  status: "discovered";
  health: "unknown";
  supports_print_labels: boolean;
  supports_scan_qr: boolean;
  supports_scan_barcode: boolean;
  supports_camera: false;
  supports_audio: false;
  supports_cycle_reading: false;
  supports_temperature: false;
  supports_humidity: false;
  metadata: HardwareMetadata;
  created_at?: string;
  updated_at?: string;
};

type DeploymentHardwareDatabaseRow = {
  id: string;
  clinic_id: string | null;
  deployment_hardware_key: string | null;
  provisioning_source: string | null;
  provisioning_status: "planned" | "active" | "archived" | null;
  active: boolean | null;
  display_order: number | null;
  agent_id: string | null;
  default_workstation_id: string | null;
  current_workstation_id: string | null;
  device_name: string;
  device_type: HardwareDeviceType;
  device_role: string | null;
  status: HardwareDeviceStatus;
  health: HardwareDeviceHealth;
  supports_print_labels: boolean;
  supports_scan_qr: boolean;
  supports_scan_barcode: boolean;
  supports_camera: boolean;
  supports_audio: boolean;
  supports_cycle_reading: boolean;
  supports_temperature: boolean;
  supports_humidity: boolean;
  metadata: HardwareMetadata | null;
  created_at: string;
  updated_at?: string | null;
};

interface SupabaseErrorLike {
  code?: string;
  message: string;
}

export class DeploymentHardwareRepositoryError extends Error {
  readonly code: string | null;

  constructor(message: string, code: string | null = null) {
    super(message);
    this.name = "DeploymentHardwareRepositoryError";
    this.code = code;
  }
}

export class SupabaseDeploymentHardwareRepository
  implements DeploymentHardwareRepository
{
  constructor(private readonly client: SupabaseClient) {}

  async findHardwareByDeploymentKey(
    clinicId: string,
    deploymentHardwareKey: string,
  ): Promise<DeploymentHardwareShellRecord | null> {
    const { data, error } = await this.client
      .from("clinical_hardware_devices")
      .select("*")
      .eq("clinic_id", clinicId)
      .eq("deployment_hardware_key", deploymentHardwareKey)
      .maybeSingle();

    if (error) {
      throw toRepositoryError(error);
    }

    return data ? mapHardwareRowToRecord(data) : null;
  }

  async createHardwareShell(
    payload: CreateDeploymentHardwareShellPayload,
  ): Promise<DeploymentHardwareShellPersistenceResult> {
    const payloadValidationMessage = validateHardwareShellPayload(payload);

    if (payloadValidationMessage) {
      return {
        ok: false,
        hardware: null,
        message: payloadValidationMessage,
      };
    }

    const existingHardware = await this.findHardwareByDeploymentKey(
      payload.clinicId,
      payload.deploymentHardwareKey,
    );

    if (existingHardware) {
      return resolveExistingHardwareShell(existingHardware);
    }

    const { data, error } = await this.client
      .from("clinical_hardware_devices")
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
      hardware: mapHardwareRowToRecord(data),
      message: "Hardware planned shell provisioned for draft clinic.",
    };
  }

  async listDeploymentHardwareShells(
    clinicId: string,
  ): Promise<readonly DeploymentHardwareShellRecord[]> {
    const { data, error } = await this.client
      .from("clinical_hardware_devices")
      .select("*")
      .eq("clinic_id", clinicId)
      .not("deployment_hardware_key", "is", null)
      .order("deployment_hardware_key", { ascending: true });

    if (error) {
      throw toRepositoryError(error);
    }

    return ((data ?? []) as DeploymentHardwareDatabaseRow[]).map(
      mapHardwareRowToRecord,
    );
  }

  private async resolveCreateConflictAfterUniqueViolation(
    payload: CreateDeploymentHardwareShellPayload,
  ): Promise<DeploymentHardwareShellPersistenceResult> {
    const existingHardware = await this.findHardwareByDeploymentKey(
      payload.clinicId,
      payload.deploymentHardwareKey,
    );

    if (existingHardware) {
      return resolveExistingHardwareShell(existingHardware);
    }

    return {
      ok: false,
      hardware: null,
      message:
        "Hardware shell unique conflict could not be resolved safely; this may be a device identity collision or missing deployment metadata constraint.",
    };
  }
}

export function mapCreatePayloadToDatabasePayload(
  payload: CreateDeploymentHardwareShellPayload,
): DeploymentHardwareDatabasePayload {
  return {
    clinic_id: payload.clinicId,
    deployment_hardware_key: payload.deploymentHardwareKey,
    provisioning_source: "setup_draft",
    provisioning_status: "planned",
    active: false,
    display_order: payload.displayOrder,
    agent_id: null,
    default_workstation_id: null,
    current_workstation_id: null,
    device_name: payload.name,
    device_type: mapHardwareTypeToDeviceType(payload.hardwareType),
    device_role: "deployment_planned_shell",
    status: "discovered",
    health: "unknown",
    supports_print_labels: payload.capabilities.includes("label_printing"),
    supports_scan_qr: payload.capabilities.includes("barcode_scanning"),
    supports_scan_barcode: payload.capabilities.includes("barcode_scanning"),
    supports_camera: false,
    supports_audio: false,
    supports_cycle_reading: false,
    supports_temperature: false,
    supports_humidity: false,
    metadata: buildDeploymentHardwareMetadata(payload),
    created_at: payload.createdAt,
    updated_at: payload.updatedAt,
  };
}

export function mapHardwareRowToRecord(
  row: DeploymentHardwareDatabaseRow,
): DeploymentHardwareShellRecord {
  const metadata = normalizeMetadata(row.metadata);

  return {
    id: row.id,
    clinicId: row.clinic_id,
    deploymentHardwareKey: row.deployment_hardware_key,
    name: row.device_name,
    hardwareType:
      getMetadataHardwareType(metadata) ?? mapDeviceTypeToHardwareType(row.device_type),
    quantity: getMetadataNumber(metadata, "quantity") ?? 1,
    displayOrder: row.display_order ?? 100,
    status: row.provisioning_status === "planned" ? "planned" : "active",
    capabilities: getHardwareCapabilitiesFromRow(row, metadata),
    assignedWorkstationKey: getMetadataString(
      metadata,
      "assigned_workstation_key",
    ),
    assignedSterilizerKey: getMetadataString(
      metadata,
      "assigned_sterilizer_key",
    ),
    active: row.active === false ? false : row.status === "active",
    provisioningSource: row.provisioning_source,
    provisioningStatus: row.provisioning_status ?? "active",
    createdAt: row.created_at,
    updatedAt: row.updated_at ?? null,
  };
}

function validateHardwareShellPayload(
  payload: CreateDeploymentHardwareShellPayload,
): string | null {
  if (!payload.clinicId.trim()) {
    return "Hardware shell creation requires a clinic id.";
  }

  if (!payload.deploymentHardwareKey.trim()) {
    return "Hardware shell creation requires a deployment hardware key.";
  }

  if (!payload.name.trim()) {
    return "Hardware shell creation requires a clinic-scoped name.";
  }

  if (payload.quantity < 1) {
    return "Hardware shell creation requires a positive quantity.";
  }

  if (payload.displayOrder < 1) {
    return "Hardware shell creation requires a positive display order.";
  }

  if (
    payload.provisioningSource !== "setup_draft" ||
    payload.provisioningStatus !== "planned" ||
    payload.status !== "planned" ||
    payload.active !== false
  ) {
    return "Hardware shell creation accepts only inactive setup_draft planned shells.";
  }

  return null;
}

function resolveExistingHardwareShell(
  hardware: DeploymentHardwareShellRecord,
): DeploymentHardwareShellPersistenceResult {
  if (isReusableHardwareShell(hardware)) {
    return {
      ok: true,
      hardware,
      message: "Hardware planned shell already exists for this clinic; reuse it.",
    };
  }

  return {
    ok: false,
    hardware,
    message:
      "Hardware deployment key is already used by a non-planned hardware record.",
  };
}

function isReusableHardwareShell(hardware: DeploymentHardwareShellRecord): boolean {
  return (
    hardware.clinicId !== null &&
    hardware.deploymentHardwareKey !== null &&
    hardware.provisioningSource === "setup_draft" &&
    hardware.provisioningStatus === "planned" &&
    hardware.status === "planned" &&
    hardware.active === false
  );
}

function buildDeploymentHardwareMetadata(
  payload: CreateDeploymentHardwareShellPayload,
): HardwareMetadata {
  return {
    deployment_shell: true,
    hardware_type: payload.hardwareType,
    quantity: payload.quantity,
    capabilities: [...payload.capabilities],
    assigned_workstation_key: payload.assignedWorkstationKey,
    assigned_sterilizer_key: payload.assignedSterilizerKey,
  };
}

function getHardwareCapabilitiesFromRow(
  row: DeploymentHardwareDatabaseRow,
  metadata: HardwareMetadata,
): readonly DeploymentHardwareCapability[] {
  const metadataCapabilities = metadata.capabilities;

  if (Array.isArray(metadataCapabilities)) {
    return metadataCapabilities.filter(isDeploymentHardwareCapability);
  }

  const capabilities: DeploymentHardwareCapability[] = [];

  if (row.supports_print_labels) {
    capabilities.push("label_printing");
  }

  if (row.supports_scan_qr || row.supports_scan_barcode) {
    capabilities.push("barcode_scanning");
  }

  return capabilities;
}

function normalizeMetadata(metadata: HardwareMetadata | null): HardwareMetadata {
  return metadata && typeof metadata === "object" ? metadata : {};
}

function getMetadataString(
  metadata: HardwareMetadata,
  key: string,
): string | null {
  const value = metadata[key];

  return typeof value === "string" && value.trim() ? value : null;
}

function getMetadataNumber(
  metadata: HardwareMetadata,
  key: string,
): number | null {
  const value = metadata[key];

  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function getMetadataHardwareType(
  metadata: HardwareMetadata,
): DeploymentHardwareType | null {
  const value = getMetadataString(metadata, "hardware_type");

  return isDeploymentHardwareType(value) ? value : null;
}

function mapHardwareTypeToDeviceType(
  hardwareType: DeploymentHardwareType,
): HardwareDeviceType {
  return hardwareType === "label_printer" ? "printer" : "usb_scanner";
}

function mapDeviceTypeToHardwareType(
  deviceType: HardwareDeviceType,
): DeploymentHardwareType {
  return deviceType === "printer" ? "label_printer" : "usb_scanner";
}

function isDeploymentHardwareType(
  value: string | null,
): value is DeploymentHardwareType {
  return value === "label_printer" || value === "usb_scanner";
}

function isDeploymentHardwareCapability(
  value: unknown,
): value is DeploymentHardwareCapability {
  return value === "label_printing" || value === "barcode_scanning";
}

function isUniqueViolation(error: SupabaseErrorLike): boolean {
  return error.code === "23505";
}

function toRepositoryError(
  error: SupabaseErrorLike,
): DeploymentHardwareRepositoryError {
  return new DeploymentHardwareRepositoryError(
    error.message,
    error.code ?? null,
  );
}