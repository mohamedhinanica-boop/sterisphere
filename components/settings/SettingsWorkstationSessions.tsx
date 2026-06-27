"use client";

import { useEffect, useState } from "react";
import {
  Activity,
  CircleStop,
  History,
  MonitorCheck,
  Play,
  type LucideIcon,
} from "lucide-react";
import { Panel } from "@/components/settings";
import {
  WORKSTATION_SESSION_STATUS_CLASS_NAMES,
  getWorkstationSessionStatusLabel,
  type SessionStatus,
} from "@/lib/modules/clinical-workstations";
import { supabase } from "@/lib/supabase";

type SessionDataState = "loading" | "connected" | "planning";
type RelatedWorkstation = { name: string } | Array<{ name: string }> | null;

type WorkstationSessionRow = {
  id: string;
  workstation_id: string;
  user_id: string | null;
  status: SessionStatus;
  started_at: string | null;
  ended_at: string | null;
  last_activity_at: string | null;
  device_context: Record<string, unknown> | null;
  notes: string | null;
  workstation: RelatedWorkstation;
};

type DisplayWorkstationSession = Omit<
  WorkstationSessionRow,
  "workstation"
> & {
  workstation_name: string;
  current_user: string;
};

const planningSessions: DisplayWorkstationSession[] = [
  {
    id: "planning-operatory-session",
    workstation_id: "planning-operatory-1",
    workstation_name: "Operatory 1",
    user_id: null,
    current_user: "Assistant user",
    status: "active",
    started_at: null,
    ended_at: null,
    last_activity_at: null,
    device_context: {
      input_sources: ["usb_scanner", "keyboard"],
      browser_session: true,
    },
    notes: "Planning example for an active treatment-room session.",
  },
  {
    id: "planning-sterilization-session",
    workstation_id: "planning-sterilization",
    workstation_name: "Sterilization Room",
    user_id: null,
    current_user: "Sterilization assistant",
    status: "planned",
    started_at: null,
    ended_at: null,
    last_activity_at: null,
    device_context: {
      input_sources: ["tablet_camera"],
    },
    notes: "Planning example for a mobile camera input workflow.",
  },
];

export default function SettingsWorkstationSessions() {
  const [sessions, setSessions] = useState<DisplayWorkstationSession[]>([]);
  const [dataState, setDataState] = useState<SessionDataState>("loading");

  useEffect(() => {
    let isCurrent = true;

    async function loadSessions() {
      try {
        const { data, error } = await supabase
          .from("workstation_sessions")
          .select(
            "id, workstation_id, user_id, status, started_at, ended_at, last_activity_at, device_context, notes, workstation:clinical_workstations(name)",
          )
          .order("last_activity_at", {
            ascending: false,
            nullsFirst: false,
          })
          .order("created_at", { ascending: false });

        if (error) {
          throw error;
        }

        if (!isCurrent) {
          return;
        }

        setSessions(
          ((data || []) as WorkstationSessionRow[]).map(
            mapWorkstationSessionRow,
          ),
        );
        setDataState("connected");
      } catch (error) {
        console.info(
          "Workstation sessions table is not connected; showing planning mode.",
          error,
        );

        if (isCurrent) {
          setSessions([]);
          setDataState("planning");
        }
      }
    }

    loadSessions();

    return () => {
      isCurrent = false;
    };
  }, []);

  const displayedSessions =
    dataState === "planning" ? planningSessions : sessions;

  return (
    <Panel
      title="Workstation Sessions"
      description="Read-only foundation for clinical context bound to configured workstations."
    >
      <div className="flex flex-col gap-4 border-b border-slate-200 pb-5 md:flex-row md:items-start md:justify-between">
        <div className="flex items-start gap-3">
          <span className="rounded-lg border border-slate-200 bg-slate-50 p-2">
            <MonitorCheck className="h-5 w-5 text-slate-700" />
          </span>
          <div>
            <p className="font-medium text-slate-900">
              Super admin session overview
            </p>
            <p className="mt-1 max-w-3xl text-sm text-slate-600">
              Sessions establish the room and user context that future clinical
              inputs will use. This phase displays records only.
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
            ? "Loading sessions"
            : dataState === "connected"
              ? "Read-only / Connected"
              : "Planning mode / Table not connected yet"}
        </span>
      </div>

      <div className="mt-6 border-l-4 border-cyan-300 bg-cyan-50 px-4 py-3">
        <div className="flex items-start gap-3">
          <Activity className="mt-0.5 h-5 w-5 shrink-0 text-cyan-700" />
          <div>
            <p className="text-sm font-medium text-cyan-900">
              Clinical Context
            </p>
            <p className="mt-1 text-sm text-cyan-800">
              Clinical workflows belong to Workstation Sessions. Input devices
              such as USB scanners, tablet cameras, and keyboards simply
              provide information to the active session. Patient traceability
              should ultimately record the workstation used for treatment
              rather than the scanner that captured the QR code. This greatly
              simplifies deployment while preserving audit integrity.
            </p>
          </div>
        </div>
      </div>

      {dataState === "loading" ? (
        <SessionMessage
          title="Loading workstation sessions"
          description="Checking for the cloud-side session table."
        />
      ) : null}

      {dataState === "connected" && displayedSessions.length === 0 ? (
        <SessionMessage
          title="No workstation sessions"
          description="The session table is connected but contains no records. Session lifecycle controls will be added in a later phase."
        />
      ) : null}

      {displayedSessions.length > 0 ? (
        <div className="mt-6 grid grid-cols-1 gap-4 xl:grid-cols-2">
          {displayedSessions.map((session) => (
            <SessionCard key={session.id} session={session} />
          ))}
        </div>
      ) : null}

      {dataState === "planning" ? (
        <div className="mt-6 border-l-4 border-amber-300 bg-amber-50 px-4 py-3">
          <p className="text-sm font-medium text-amber-900">
            Planning mode / table not connected yet
          </p>
          <p className="mt-1 text-sm text-amber-800">
            Static examples remain visible until the workstation session SQL is
            applied and readable through the current Supabase client.
          </p>
        </div>
      ) : null}
    </Panel>
  );
}

function SessionCard({
  session,
}: {
  session: DisplayWorkstationSession;
}) {
  return (
    <article className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="font-semibold text-slate-900">
            {session.workstation_name}
          </h3>
          <p className="mt-1 text-sm text-slate-500">{session.current_user}</p>
        </div>

        <span
          className={`w-fit rounded-lg border px-3 py-1 text-xs font-medium ${
            WORKSTATION_SESSION_STATUS_CLASS_NAMES[session.status]
          }`}
        >
          {getWorkstationSessionStatusLabel(session.status)}
        </span>
      </div>

      <dl className="mt-4 grid grid-cols-1 border-t border-slate-200 sm:grid-cols-2">
        <SessionDetail label="Workstation" value={session.workstation_name} />
        <SessionDetail label="Current user" value={session.current_user} />
        <SessionDetail
          label="Started"
          value={formatTimestamp(session.started_at, "Not started")}
        />
        <SessionDetail
          label="Last activity"
          value={formatTimestamp(session.last_activity_at, "No activity")}
        />
        <SessionDetail
          label="Ended"
          value={formatTimestamp(session.ended_at, "Not ended")}
        />
        <SessionDetail
          label="Device context"
          value={summarizeDeviceContext(session.device_context)}
        />
        <div className="border-b border-slate-200 py-3 sm:col-span-2">
          <dt className="text-xs font-medium uppercase text-slate-500">Notes</dt>
          <dd className="mt-1 text-sm text-slate-700">
            {session.notes || "No notes"}
          </dd>
        </div>
      </dl>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <ComingSoonButton icon={Play} label="Start Session" />
        <ComingSoonButton icon={CircleStop} label="End Session" />
        <ComingSoonButton icon={History} label="View Activity" />
        <span className="text-xs font-medium text-slate-500">
          Coming in next phase
        </span>
      </div>
    </article>
  );
}

function SessionDetail({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="border-b border-slate-200 py-3 sm:odd:pr-4 sm:even:pl-4">
      <dt className="text-xs font-medium uppercase text-slate-500">{label}</dt>
      <dd className="mt-1 text-sm font-medium text-slate-900">{value}</dd>
    </div>
  );
}

function SessionMessage({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="mt-6 border-l-4 border-slate-300 bg-slate-50 px-4 py-3">
      <p className="text-sm font-medium text-slate-900">{title}</p>
      <p className="mt-1 text-sm text-slate-600">{description}</p>
    </div>
  );
}

function ComingSoonButton({
  icon: Icon,
  label,
}: {
  icon: LucideIcon;
  label: string;
}) {
  return (
    <button
      type="button"
      disabled
      title="Coming in next phase"
      className="inline-flex cursor-not-allowed items-center gap-2 rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-sm font-medium text-slate-500"
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );
}

function mapWorkstationSessionRow(
  row: WorkstationSessionRow,
): DisplayWorkstationSession {
  const workstation = Array.isArray(row.workstation)
    ? row.workstation[0]
    : row.workstation;

  return {
    ...row,
    workstation_name: workstation?.name || "Unknown workstation",
    current_user: formatUser(row.user_id),
  };
}

function formatUser(userId: string | null) {
  return userId ? `User ${userId.slice(0, 8)}` : "Not assigned";
}

function summarizeDeviceContext(
  context: Record<string, unknown> | null,
) {
  const keys = Object.keys(context || {});

  if (keys.length === 0) {
    return "No device context";
  }

  return keys
    .slice(0, 3)
    .map(formatContextKey)
    .concat(keys.length > 3 ? [`+${keys.length - 3} more`] : [])
    .join(", ");
}

function formatContextKey(key: string) {
  return key
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatTimestamp(value: string | null, fallback: string) {
  if (!value) {
    return fallback;
  }

  const timestamp = new Date(value);
  return Number.isNaN(timestamp.getTime())
    ? "Unknown"
    : timestamp.toLocaleString();
}

