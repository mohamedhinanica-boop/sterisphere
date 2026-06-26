import type { WorkstationType } from "./types";

export type ClinicalEventDeviceType =
  | "printer"
  | "usb_scanner"
  | "tablet_camera"
  | "camera"
  | "sound"
  | "sterilizer"
  | "rfid_nfc"
  | "sensor"
  | "workstation";

export type ClinicalEventType =
  | "scanner.pack_scanned"
  | "scanner.unknown_code_scanned"
  | "printer.label_print_requested"
  | "printer.label_printed"
  | "printer.error"
  | "camera.scan_started"
  | "camera.scan_completed"
  | "sound.alert_requested"
  | "sterilizer.cycle_detected"
  | "sterilizer.cycle_completed"
  | "workstation.heartbeat"
  | "workstation.offline"
  | "workstation.needs_attention";

export type ClinicalEventSource =
  | "clinic_agent"
  | "browser"
  | "cloud"
  | "system";

export type ClinicalEventStatus =
  | "queued"
  | "received"
  | "processing"
  | "processed"
  | "rejected"
  | "failed";

export type ClinicalEventPayload = Record<string, unknown>;

export type ClinicalEventEnvelope = {
  event_id: string;
  clinic_id: string;
  workstation_id: string | null;
  workstation_name: string | null;
  workstation_type: WorkstationType | null;
  device_type: ClinicalEventDeviceType;
  device_id: string | null;
  event_type: ClinicalEventType;
  payload: ClinicalEventPayload;
  user_id: string | null;
  patient_context_id: string | null;
  source: ClinicalEventSource;
  created_at: string;
  processed_at: string | null;
  status: ClinicalEventStatus;
  error_message: string | null;
};

export const CLINICAL_EVENT_TYPES: ClinicalEventType[] = [
  "scanner.pack_scanned",
  "scanner.unknown_code_scanned",
  "printer.label_print_requested",
  "printer.label_printed",
  "printer.error",
  "camera.scan_started",
  "camera.scan_completed",
  "sound.alert_requested",
  "sterilizer.cycle_detected",
  "sterilizer.cycle_completed",
  "workstation.heartbeat",
  "workstation.offline",
  "workstation.needs_attention",
];

export const CLINICAL_EVENT_STATUSES: ClinicalEventStatus[] = [
  "queued",
  "received",
  "processing",
  "processed",
  "rejected",
  "failed",
];
