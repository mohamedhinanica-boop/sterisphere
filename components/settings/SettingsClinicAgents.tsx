"use client";

import { useEffect, useState } from "react";
import {
  Cable,
  Gauge,
  HardDrive,
  History,
  Link2,
  RadioTower,
  Server,
  type LucideIcon,
} from "lucide-react";
import { Panel } from "@/components/settings";
import {
  CLINICAL_AGENT_STATUS_CLASS_NAMES,
  getClinicalAgentHeartbeatStatus,
  getClinicalAgentStatusLabel,
  type ClinicalAgentStatus,
} from "@/lib/modules/clinical-workstations";
import { supabase } from "@/lib/supabase";

type AgentDataState = "loading" | "connected" | "planning";

type ClinicalAgentRow = {
  id: string;
  name: string;
  agent_url: string | null;
  agent_version: string | null;
  heartbeat_interval_seconds?: number;
  heartbeat_timeout_seconds?: number;
  platform?: string | null;
  operating_system?: string | null;
  metadata?: Record<string, unknown>;
  host_name: string | null;
  ip_address: string | null;
  assigned_workstation_id: string | null;
  status: ClinicalAgentStatus;
  last_seen_at: string | null;
  notes: string | null;
  assigned_workstation:
    | { name: string }
    | Array<{ name: string }>
    | null;
};

type DisplayClinicalAgent = Omit<
  ClinicalAgentRow,
  "assigned_workstation"
> & {
  assigned_workstation_name: string | null;
};

const planningAgents: DisplayClinicalAgent[] = [
  {
    id: "planning-main-agent",
    name: "Main Clinic Agent",
    agent_url: "http://localhost:8787",
    agent_version: null,
    heartbeat_interval_seconds: 30,
    heartbeat_timeout_seconds: 90,
    platform: "Windows",
    operating_system: "Not reported",
    metadata: {},
    host_name: "CLINIC-FRONTDESK",
    ip_address: "Not configured",
    assigned_workstation_id: null,
    assigned_workstation_name: "Reception",
    status: "planned",
    last_seen_at: null,
    notes: "Planning example for the clinic's first registered agent.",
  },
  {
    id: "planning-sterilization-agent",
    name: "Sterilization Agent",
    agent_url: "Not configured",
    agent_version: null,
    heartbeat_interval_seconds: 30,
    heartbeat_timeout_seconds: 90,
    platform: "Windows",
    operating_system: "Not reported",
    metadata: {},
    host_name: "STERI-STATION",
    ip_address: "Not configured",
    assigned_workstation_id: null,
    assigned_workstation_name: "Sterilization Room",
    status: "planned",
    last_seen_at: null,
    notes: "Future local gateway for sterilization-area hardware.",
  },
];

export default function SettingsClinicAgents() {
  const [agents, setAgents] = useState<DisplayClinicalAgent[]>([]);
  const [dataState, setDataState] = useState<AgentDataState>("loading");

  useEffect(() => {
    let isCurrent = true;

    async function loadAgents() {
      try {
        const { data, error } = await supabase
          .from("clinical_agents")
          .select(
            "id, name, agent_url, agent_version, heartbeat_interval_seconds, heartbeat_timeout_seconds, platform, operating_system, metadata, host_name, ip_address, assigned_workstation_id, status, last_seen_at, notes, assigned_workstation:clinical_workstations(name)",
          )
          .order("name", { ascending: true });

        let rows = data as ClinicalAgentRow[] | null;
        let queryError = error;

        if (queryError && isMissingHeartbeatColumn(queryError)) {
          const legacyResult = await supabase
            .from("clinical_agents")
            .select(
              "id, name, agent_url, agent_version, host_name, ip_address, assigned_workstation_id, status, last_seen_at, notes, assigned_workstation:clinical_workstations(name)",
            )
            .order("name", { ascending: true });

          rows = legacyResult.data as ClinicalAgentRow[] | null;
          queryError = legacyResult.error;
        }

        if (queryError) {
          throw queryError;
        }

        if (!isCurrent) {
          return;
        }

        setAgents((rows || []).map(mapClinicalAgentRow));
        setDataState("connected");
      } catch (error) {
        console.info(
          "Clinical agents table is not connected; showing planning mode.",
          error,
        );

        if (isCurrent) {
          setAgents([]);
          setDataState("planning");
        }
      }
    }

    loadAgents();

    return () => {
      isCurrent = false;
    };
  }, []);

  const displayedAgents = dataState === "planning" ? planningAgents : agents;

  return (
    <Panel
      title="Clinic Agents"
      description="Read-only foundation for cloud-side Clinic Agent registration and workstation assignment."
    >
      <div className="flex flex-col gap-4 border-b border-slate-200 pb-5 md:flex-row md:items-start md:justify-between">
        <div className="flex items-start gap-3">
          <span className="rounded-lg border border-slate-200 bg-slate-50 p-2">
            <Server className="h-5 w-5 text-slate-700" />
          </span>
          <div>
            <p className="font-medium text-slate-900">
              Super admin agent registry
            </p>
            <p className="mt-1 max-w-3xl text-sm text-slate-600">
              Clinic Agents will become the local gateway for printers,
              scanners, cameras, sound, sterilizers, and future devices. This
              phase only reads cloud registration records.
            </p>
          </div>
        </div>

        <span
          className={`w-fit rounded-lg border px-3 py-2 text-sm font-medium ${
            dataState === "connected"
              ? "border-green-200 bg-green-50 text-green-700"
              : "border-amber-200 bg-amber-50 text-amber-800"
          }`}
        >
          {dataState === "loading"
            ? "Loading agents"
            : dataState === "connected"
              ? "Read-only / Connected"
              : "Planning mode / Table not connected yet"}
        </span>
      </div>

      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-slate-600">
          Registration, pairing, and discovery controls are not active yet.
        </p>
        <ComingSoonButton icon={Link2} label="Register Agent" />
      </div>

      {dataState === "loading" ? (
        <div className="mt-6 border-l-4 border-slate-300 bg-slate-50 px-4 py-3">
          <p className="text-sm font-medium text-slate-900">
            Loading registered agents
          </p>
          <p className="mt-1 text-sm text-slate-600">
            Checking for the cloud-side Clinic Agent table.
          </p>
        </div>
      ) : null}

      {dataState === "connected" && displayedAgents.length === 0 ? (
        <div className="mt-6 border-l-4 border-slate-300 bg-slate-50 px-4 py-3">
          <p className="text-sm font-medium text-slate-900">
            No Clinic Agents registered
          </p>
          <p className="mt-1 text-sm text-slate-600">
            The agent table is connected but contains no records. Registration
            will be enabled in a later phase.
          </p>
        </div>
      ) : null}

      {displayedAgents.length > 0 ? (
        <div className="mt-6 grid grid-cols-1 gap-4 xl:grid-cols-2">
          {displayedAgents.map((agent) => (
            <AgentCard key={agent.id} agent={agent} />
          ))}
        </div>
      ) : null}

      {dataState === "planning" ? (
        <div className="mt-6 border-l-4 border-amber-300 bg-amber-50 px-4 py-3">
          <p className="text-sm font-medium text-amber-900">
            Planning mode / table not connected yet
          </p>
          <p className="mt-1 text-sm text-amber-800">
            Static examples remain visible until the clinical agent SQL is
            applied and readable through the current Supabase client.
          </p>
        </div>
      ) : null}

      <div className="mt-6 border-l-4 border-cyan-300 bg-cyan-50 px-4 py-3">
        <div className="flex items-start gap-3">
          <Gauge className="mt-0.5 h-5 w-5 shrink-0 text-cyan-700" />
          <div>
            <p className="text-sm font-medium text-cyan-900">
              Heartbeat availability
            </p>
            <p className="mt-1 text-sm text-cyan-800">
              Heartbeat allows SteriSphere to know whether the Clinic Agent is
              available before routing hardware operations. This phase only
              evaluates saved timestamps when the page loads; it does not poll
              or contact an agent.
            </p>
          </div>
        </div>
      </div>
    </Panel>
  );
}

function AgentCard({ agent }: { agent: DisplayClinicalAgent }) {
  const heartbeatStatus = getClinicalAgentHeartbeatStatus({
    status: agent.status,
    last_seen_at: agent.last_seen_at,
    heartbeat_timeout_seconds: agent.heartbeat_timeout_seconds ?? 90,
  });

  return (
    <article className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-center gap-3">
          <span className="rounded-lg border border-slate-200 bg-slate-50 p-2">
            <RadioTower className="h-5 w-5 text-slate-700" />
          </span>
          <div>
            <h3 className="font-semibold text-slate-900">{agent.name}</h3>
            <p className="mt-1 text-sm text-slate-500">
              {agent.assigned_workstation_name || "Not assigned"}
            </p>
          </div>
        </div>

        <span
          className={`w-fit rounded-lg border px-3 py-1 text-xs font-medium ${
            CLINICAL_AGENT_STATUS_CLASS_NAMES[heartbeatStatus]
          }`}
        >
          {getClinicalAgentStatusLabel(heartbeatStatus)}
        </span>
      </div>

      <dl className="mt-4 grid grid-cols-1 border-t border-slate-200 sm:grid-cols-2">
        <AgentDetail
          label="Assigned workstation"
          value={agent.assigned_workstation_name || "Not assigned"}
        />
        <AgentDetail label="Agent URL" value={agent.agent_url} />
        <AgentDetail label="Host name" value={agent.host_name} />
        <AgentDetail label="IP address" value={agent.ip_address} />
        <AgentDetail
          label="Heartbeat interval"
          value={`${agent.heartbeat_interval_seconds ?? 30} seconds`}
        />
        <AgentDetail label="Agent version" value={agent.agent_version} />
        <AgentDetail label="Platform" value={agent.platform || null} />
        <AgentDetail
          label="Operating system"
          value={agent.operating_system || null}
        />
        <AgentDetail
          label="Last seen"
          value={formatLastSeen(agent.last_seen_at)}
        />
        <div className="border-b border-slate-200 py-3 sm:col-span-2">
          <dt className="text-xs font-medium uppercase text-slate-500">Notes</dt>
          <dd className="mt-1 text-sm text-slate-700">
            {agent.notes || "No notes"}
          </dd>
        </div>
      </dl>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <ComingSoonButton icon={Link2} label="Register Agent" compact />
        <ComingSoonButton icon={Cable} label="Pair Workstation" compact />
        <ComingSoonButton icon={HardDrive} label="View Devices" compact />
        <ComingSoonButton icon={Gauge} label="Test Connection" compact />
        <ComingSoonButton icon={History} label="View Heartbeats" compact />
        <span className="text-xs font-medium text-slate-500">
          Coming in next phase
        </span>
      </div>
    </article>
  );
}

function AgentDetail({
  label,
  value,
}: {
  label: string;
  value: string | null;
}) {
  return (
    <div className="border-b border-slate-200 py-3 sm:odd:pr-4 sm:even:pl-4">
      <dt className="text-xs font-medium uppercase text-slate-500">{label}</dt>
      <dd className="mt-1 break-all text-sm font-medium text-slate-900">
        {value || "Not configured"}
      </dd>
    </div>
  );
}

function ComingSoonButton({
  icon: Icon,
  label,
  compact = false,
}: {
  icon: LucideIcon;
  label: string;
  compact?: boolean;
}) {
  return (
    <button
      type="button"
      disabled
      title="Coming in next phase"
      className={`inline-flex cursor-not-allowed items-center gap-2 rounded-lg border border-slate-200 bg-slate-100 font-medium text-slate-500 ${
        compact ? "px-3 py-2 text-sm" : "px-4 py-2.5 text-sm"
      }`}
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );
}

function mapClinicalAgentRow(row: ClinicalAgentRow): DisplayClinicalAgent {
  const workstation = Array.isArray(row.assigned_workstation)
    ? row.assigned_workstation[0]
    : row.assigned_workstation;

  return {
    ...row,
    heartbeat_interval_seconds: row.heartbeat_interval_seconds ?? 30,
    heartbeat_timeout_seconds: row.heartbeat_timeout_seconds ?? 90,
    platform: row.platform || null,
    operating_system: row.operating_system || null,
    metadata: row.metadata || {},
    assigned_workstation_name: workstation?.name || null,
  };
}

function formatLastSeen(value: string | null) {
  if (!value) {
    return "Never";
  }

  const timestamp = new Date(value);

  if (Number.isNaN(timestamp.getTime())) {
    return "Unknown";
  }

  return timestamp.toLocaleString();
}

function isMissingHeartbeatColumn(error: {
  code?: string;
  message?: string;
}) {
  const heartbeatColumns = [
    "heartbeat_interval_seconds",
    "heartbeat_timeout_seconds",
    "platform",
    "operating_system",
    "metadata",
  ];

  return (
    (error.code === "42703" || error.code === "PGRST204") &&
    heartbeatColumns.some((column) => error.message?.includes(column))
  );
}
