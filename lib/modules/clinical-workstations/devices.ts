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
  | "retired";

export type HardwareConnectionHealth =
  | "online"
  | "offline"
  | "degraded"
  | "unknown";

export type HardwareDeviceHealth = {
  online: boolean;
  connection_health: HardwareConnectionHealth;
  last_heartbeat_at: string | null;
  last_successful_operation_at: string | null;
  error_code: string | null;
  error_message: string | null;
};

export type HardwareDevice = {
  device_id: string;
  device_name: string;
  device_type: HardwareDeviceType;
  manufacturer: string | null;
  model: string | null;
  serial_number: string | null;
  firmware_version: string | null;
  connection_type: HardwareConnectionType;
  agent_id: string | null;
  workstation_id: string | null;
  status: HardwareDeviceStatus;
  last_seen: string | null;
  health: HardwareDeviceHealth;
  capabilities: HardwareDeviceCapability[];
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
  { value: "assigned", label: "Assigned to workstation" },
  { value: "active", label: "Active" },
  { value: "maintenance", label: "Maintenance" },
  { value: "retired", label: "Retired" },
];

export const DEFAULT_HARDWARE_DEVICE_HEALTH: HardwareDeviceHealth = {
  online: false,
  connection_health: "unknown",
  last_heartbeat_at: null,
  last_successful_operation_at: null,
  error_code: null,
  error_message: null,
};
