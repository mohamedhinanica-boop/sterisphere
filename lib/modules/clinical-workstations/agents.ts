export type ClinicalAgentStatus =
  | "planned"
  | "registered"
  | "online"
  | "offline"
  | "needs_attention"
  | "retired";

export type ClinicalAgent = {
  id: string;
  clinic_id: string | null;
  name: string;
  agent_key: string | null;
  agent_url: string | null;
  agent_version: string | null;
  host_name: string | null;
  ip_address: string | null;
  assigned_workstation_id: string | null;
  status: ClinicalAgentStatus;
  last_seen_at: string | null;
  notes: string | null;
  created_at: string;
  created_by: string | null;
  updated_at: string | null;
  updated_by: string | null;
};

export const CLINICAL_AGENT_STATUSES: Array<{
  value: ClinicalAgentStatus;
  label: string;
}> = [
  { value: "planned", label: "Planned" },
  { value: "registered", label: "Registered" },
  { value: "online", label: "Online" },
  { value: "offline", label: "Offline" },
  { value: "needs_attention", label: "Needs attention" },
  { value: "retired", label: "Retired" },
];

export const CLINICAL_AGENT_STATUS_CLASS_NAMES: Record<
  ClinicalAgentStatus,
  string
> = {
  planned: "border-blue-200 bg-blue-50 text-blue-700",
  registered: "border-cyan-200 bg-cyan-50 text-cyan-700",
  online: "border-green-200 bg-green-50 text-green-700",
  offline: "border-slate-200 bg-slate-50 text-slate-600",
  needs_attention: "border-amber-200 bg-amber-50 text-amber-800",
  retired: "border-slate-200 bg-slate-100 text-slate-500",
};

export function getClinicalAgentStatusLabel(status: ClinicalAgentStatus) {
  return (
    CLINICAL_AGENT_STATUSES.find((item) => item.value === status)?.label ||
    "Planned"
  );
}

