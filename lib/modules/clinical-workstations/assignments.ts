export type DeviceAssignmentMode = "permanent" | "temporary";

export type DeviceAssignmentReason =
  | "default_home"
  | "shared_device"
  | "maintenance_coverage"
  | "device_unavailable"
  | "workflow_fallback"
  | "other";

export type DeviceAvailability =
  | "available"
  | "in_use"
  | "offline"
  | "maintenance"
  | "unknown";

export type WorkflowConfidenceLevel =
  | "excellent"
  | "high"
  | "good"
  | "exception";

export type DeviceWorkstationAssignment = {
  device_id: string;
  default_workstation_id: string | null;
  current_workstation_id: string | null;
  assignment_mode: DeviceAssignmentMode;
  assignment_reason: DeviceAssignmentReason;
  assignment_reason_note: string | null;
  availability: DeviceAvailability;
  assigned_by: string | null;
  assigned_at: string;
  expires_at: string | null;
  released_at: string | null;
};

export type TraceWorkstationContext = {
  scan_workstation_id: string | null;
  clinical_workstation_id: string;
  device_id: string | null;
  user_id: string;
  override_reason: string | null;
  confidence_level: WorkflowConfidenceLevel;
  created_at: string;
};

