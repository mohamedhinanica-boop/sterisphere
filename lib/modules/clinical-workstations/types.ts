export type WorkstationType =
  | "reception"
  | "sterilization"
  | "operatory"
  | "admin"
  | "other";

export type WorkstationStatus =
  | "not_registered"
  | "online"
  | "offline"
  | "maintenance"
  | "unknown";

export type ClinicalWorkstation = {
  id: string;
  clinic_id: string;
  name: string;
  type: WorkstationType;
  room_number: string | null;
  agent_id: string | null;
  status: WorkstationStatus;
  last_seen: string | null;
  notes: string | null;
};

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
  { value: "not_registered", label: "Not registered" },
  { value: "online", label: "Online" },
  { value: "offline", label: "Offline" },
  { value: "maintenance", label: "Maintenance" },
  { value: "unknown", label: "Unknown" },
];
