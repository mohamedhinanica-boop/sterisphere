export type HardwareDeviceType =
  | "printer"
  | "usb_scanner"
  | "camera"
  | "speaker"
  | "sterilizer"
  | "environment_sensor"
  | "rfid_reader"
  | "nfc_reader"
  | "future_custom";

export type HardwareConnectionType =
  | "usb"
  | "lan"
  | "wifi"
  | "bluetooth"
  | "serial"
  | "virtual"
  | "unknown";

export type HardwareDeviceCapability =
  | "print_labels"
  | "scan_qr"
  | "scan_barcode"
  | "capture_image"
  | "play_sound"
  | "read_cycle"
  | "read_temperature"
  | "read_humidity";

export type HardwareDeviceStatus =
  | "discovered"
  | "registered"
  | "assigned"
  | "active"
  | "maintenance"
  | "retired"
  | "offline"
  | "needs_attention";

export type HardwareDeviceHealth =
  | "unknown"
  | "healthy"
  | "warning"
  | "error"
  | "offline";

export type HardwareDevice = {
  id: string;
  clinic_id: string | null;
  agent_id: string | null;
  default_workstation_id: string | null;
  current_workstation_id: string | null;
  device_name: string;
  device_type: HardwareDeviceType;
  device_role: string | null;
  manufacturer: string | null;
  model: string | null;
  serial_number: string | null;
  firmware_version: string | null;
  connection_type: HardwareConnectionType | null;
  connection_identifier: string | null;
  status: HardwareDeviceStatus;
  health: HardwareDeviceHealth;
  last_seen_at: string | null;
  last_success_at: string | null;
  last_error_at: string | null;
  last_error_message: string | null;
  supports_print_labels: boolean;
  supports_scan_qr: boolean;
  supports_scan_barcode: boolean;
  supports_camera: boolean;
  supports_audio: boolean;
  supports_cycle_reading: boolean;
  supports_temperature: boolean;
  supports_humidity: boolean;
  metadata: Record<string, unknown>;
  notes: string | null;
  created_at: string;
  updated_at: string | null;
};

export const HARDWARE_DEVICE_TYPES: Array<{
  value: HardwareDeviceType;
  label: string;
}> = [
  { value: "printer", label: "Printer" },
  { value: "usb_scanner", label: "USB scanner" },
  { value: "camera", label: "Camera" },
  { value: "speaker", label: "Speaker" },
  { value: "sterilizer", label: "Sterilizer" },
  { value: "environment_sensor", label: "Environment sensor" },
  { value: "rfid_reader", label: "RFID reader" },
  { value: "nfc_reader", label: "NFC reader" },
  { value: "future_custom", label: "Future custom" },
];

export const HARDWARE_DEVICE_CAPABILITIES: Array<{
  value: HardwareDeviceCapability;
  label: string;
}> = [
  { value: "print_labels", label: "Print labels" },
  { value: "scan_qr", label: "Scan QR" },
  { value: "scan_barcode", label: "Scan barcode" },
  { value: "capture_image", label: "Capture image" },
  { value: "play_sound", label: "Play sound" },
  { value: "read_cycle", label: "Read cycle" },
  { value: "read_temperature", label: "Read temperature" },
  { value: "read_humidity", label: "Read humidity" },
];

export const HARDWARE_DEVICE_STATUSES: Array<{
  value: HardwareDeviceStatus;
  label: string;
}> = [
  { value: "discovered", label: "Discovered" },
  { value: "registered", label: "Registered" },
  { value: "assigned", label: "Assigned" },
  { value: "active", label: "Active" },
  { value: "maintenance", label: "Maintenance" },
  { value: "retired", label: "Retired" },
  { value: "offline", label: "Offline" },
  { value: "needs_attention", label: "Needs attention" },
];

export const HARDWARE_DEVICE_HEALTHS: Array<{
  value: HardwareDeviceHealth;
  label: string;
}> = [
  { value: "unknown", label: "Unknown" },
  { value: "healthy", label: "Healthy" },
  { value: "warning", label: "Warning" },
  { value: "error", label: "Error" },
  { value: "offline", label: "Offline" },
];

export const HARDWARE_DEVICE_STATUS_CLASS_NAMES: Record<
  HardwareDeviceStatus,
  string
> = {
  discovered: "border-blue-200 bg-blue-50 text-blue-700",
  registered: "border-cyan-200 bg-cyan-50 text-cyan-700",
  assigned: "border-indigo-200 bg-indigo-50 text-indigo-700",
  active: "border-green-200 bg-green-50 text-green-700",
  maintenance: "border-amber-200 bg-amber-50 text-amber-800",
  retired: "border-slate-200 bg-slate-100 text-slate-500",
  offline: "border-slate-200 bg-slate-50 text-slate-600",
  needs_attention: "border-amber-200 bg-amber-50 text-amber-800",
};

export const HARDWARE_DEVICE_HEALTH_CLASS_NAMES: Record<
  HardwareDeviceHealth,
  string
> = {
  unknown: "border-slate-200 bg-slate-50 text-slate-600",
  healthy: "border-green-200 bg-green-50 text-green-700",
  warning: "border-amber-200 bg-amber-50 text-amber-800",
  error: "border-red-200 bg-red-50 text-red-700",
  offline: "border-slate-200 bg-slate-100 text-slate-600",
};

export function getHardwareDeviceTypeLabel(type: HardwareDeviceType) {
  return HARDWARE_DEVICE_TYPES.find((item) => item.value === type)?.label || type;
}

export function getHardwareDeviceStatusLabel(status: HardwareDeviceStatus) {
  return (
    HARDWARE_DEVICE_STATUSES.find((item) => item.value === status)?.label ||
    status
  );
}

export function getHardwareDeviceHealthLabel(health: HardwareDeviceHealth) {
  return (
    HARDWARE_DEVICE_HEALTHS.find((item) => item.value === health)?.label ||
    health
  );
}

export function getEnabledHardwareDeviceCapabilities(
  device: Pick<
    HardwareDevice,
    | "supports_print_labels"
    | "supports_scan_qr"
    | "supports_scan_barcode"
    | "supports_camera"
    | "supports_audio"
    | "supports_cycle_reading"
    | "supports_temperature"
    | "supports_humidity"
  >,
): HardwareDeviceCapability[] {
  const capabilities: HardwareDeviceCapability[] = [];

  if (device.supports_print_labels) capabilities.push("print_labels");
  if (device.supports_scan_qr) capabilities.push("scan_qr");
  if (device.supports_scan_barcode) capabilities.push("scan_barcode");
  if (device.supports_camera) capabilities.push("capture_image");
  if (device.supports_audio) capabilities.push("play_sound");
  if (device.supports_cycle_reading) capabilities.push("read_cycle");
  if (device.supports_temperature) capabilities.push("read_temperature");
  if (device.supports_humidity) capabilities.push("read_humidity");

  return capabilities;
}

export function getHardwareDeviceCapabilityLabel(
  capability: HardwareDeviceCapability,
) {
  return (
    HARDWARE_DEVICE_CAPABILITIES.find((item) => item.value === capability)
      ?.label || capability
  );
}
