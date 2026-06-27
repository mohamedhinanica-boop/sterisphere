export type SessionStatus =
  | "planned"
  | "active"
  | "idle"
  | "ended"
  | "abandoned";

export type ClinicalWorkstationSession = {
  id: string;
  clinic_id: string | null;
  workstation_id: string;
  user_id: string | null;
  status: SessionStatus;
  started_at: string | null;
  ended_at: string | null;
  last_activity_at: string | null;
  device_context: Record<string, unknown>;
  notes: string | null;
  created_at: string;
  updated_at: string | null;
};

export const WORKSTATION_SESSION_STATUSES: Array<{
  value: SessionStatus;
  label: string;
}> = [
  { value: "planned", label: "Planned" },
  { value: "active", label: "Active" },
  { value: "idle", label: "Idle" },
  { value: "ended", label: "Ended" },
  { value: "abandoned", label: "Abandoned" },
];

export const WORKSTATION_SESSION_STATUS_CLASS_NAMES: Record<
  SessionStatus,
  string
> = {
  planned: "border-blue-200 bg-blue-50 text-blue-700",
  active: "border-green-200 bg-green-50 text-green-700",
  idle: "border-amber-200 bg-amber-50 text-amber-800",
  ended: "border-slate-200 bg-slate-50 text-slate-600",
  abandoned: "border-red-200 bg-red-50 text-red-700",
};

export function getWorkstationSessionStatusLabel(status: SessionStatus) {
  return (
    WORKSTATION_SESSION_STATUSES.find((item) => item.value === status)?.label ||
    status
  );
}

