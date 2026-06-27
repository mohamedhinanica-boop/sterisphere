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
  heartbeat_interval_seconds: number;
  heartbeat_timeout_seconds: number;
  platform: string | null;
  operating_system: string | null;
  metadata: Record<string, unknown>;
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

export type ClinicalAgentHeartbeatInput = Pick<
  ClinicalAgent,
  "status" | "last_seen_at" | "heartbeat_timeout_seconds"
>;

export function getClinicalAgentHeartbeatStatus(
  agent: ClinicalAgentHeartbeatInput,
  now: number = Date.now(),
): ClinicalAgentStatus {
  if (
    agent.status === "planned" ||
    agent.status === "retired" ||
    agent.status === "needs_attention"
  ) {
    return agent.status;
  }

  if (!agent.last_seen_at) {
    return "registered";
  }

  const lastSeenAt = new Date(agent.last_seen_at).getTime();

  if (!Number.isFinite(lastSeenAt)) {
    return "offline";
  }

  const timeoutMilliseconds = agent.heartbeat_timeout_seconds * 1000;

  return now - lastSeenAt <= timeoutMilliseconds ? "online" : "offline";
}
