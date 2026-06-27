export type WorkstationType =
  | "reception"
  | "sterilization"
  | "operatory"
  | "admin"
  | "other";

export type WorkstationStatus =
  | "planned"
  | "active"
  | "inactive"
  | "needs_attention";

export type WorkstationCapability =
  | "printer"
  | "usb_scanner"
  | "camera"
  | "sound"
  | "sterilizer";

export type WorkstationCapabilities = Record<WorkstationCapability, boolean>;

export type WorkstationAuditMetadata = {
  created_at: string;
  created_by: string | null;
  updated_at: string | null;
  updated_by: string | null;
};

export type ClinicalWorkstation = {
  id: string;
  clinic_id: string;
  name: string;
  workstation_type: WorkstationType;
  display_order: number;
  room_number: string | null;
  location_label: string | null;
  agent_id: string | null;
  agent_url: string | null;
  capabilities: WorkstationCapabilities;
  status: WorkstationStatus;
  last_seen: string | null;
  notes: string | null;
} & WorkstationAuditMetadata;

export const WORKSTATION_TYPES: Array<{
  value: WorkstationType;
  label: string;
}> = [
  { value: "reception", label: "Reception" },
  { value: "sterilization", label: "Sterilization" },
  { value: "operatory", label: "Operatory" },
  { value: "admin", label: "Admin" },
  { value: "other", label: "Other" },
];

export const WORKSTATION_STATUSES: Array<{
  value: WorkstationStatus;
  label: string;
}> = [
  { value: "planned", label: "Planned" },
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
  { value: "needs_attention", label: "Needs attention" },
];

export const WORKSTATION_CAPABILITIES: Array<{
  value: WorkstationCapability;
  label: string;
}> = [
  { value: "printer", label: "Printer" },
  { value: "usb_scanner", label: "USB scanner" },
  { value: "camera", label: "Camera" },
  { value: "sound", label: "Sound" },
  { value: "sterilizer", label: "Sterilizer" },
];

export const DEFAULT_WORKSTATION_CAPABILITIES: WorkstationCapabilities = {
  printer: false,
  usb_scanner: false,
  camera: false,
  sound: false,
  sterilizer: false,
};

export function createWorkstationCapabilities(
  enabledCapabilities: WorkstationCapability[] = [],
): WorkstationCapabilities {
  return enabledCapabilities.reduce<WorkstationCapabilities>(
    (capabilities, capability) => ({
      ...capabilities,
      [capability]: true,
    }),
    { ...DEFAULT_WORKSTATION_CAPABILITIES },
  );
}

export function getEnabledWorkstationCapabilities(
  capabilities: WorkstationCapabilities,
): WorkstationCapability[] {
  return WORKSTATION_CAPABILITIES.filter(
    (capability) => capabilities[capability.value],
  ).map((capability) => capability.value);
}

export function getWorkstationCapabilityLabel(
  capability: WorkstationCapability,
) {
  return (
    WORKSTATION_CAPABILITIES.find((item) => item.value === capability)?.label ||
    capability
  );
}

export function getWorkstationTypeLabel(type: WorkstationType) {
  return WORKSTATION_TYPES.find((item) => item.value === type)?.label || "Other";
}

export function getWorkstationStatusLabel(status: WorkstationStatus) {
  return (
    WORKSTATION_STATUSES.find((item) => item.value === status)?.label ||
    "Planned"
  );
}

export const WORKSTATION_STATUS_CLASS_NAMES: Record<WorkstationStatus, string> =
  {
    planned: "border-blue-200 bg-blue-50 text-blue-700",
    active: "border-green-200 bg-green-50 text-green-700",
    inactive: "border-slate-200 bg-slate-50 text-slate-600",
    needs_attention: "border-amber-200 bg-amber-50 text-amber-800",
  };
