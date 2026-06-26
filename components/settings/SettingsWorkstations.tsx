"use client";

import { useEffect, useState } from "react";
import {
  Camera,
  ClipboardList,
  Laptop,
  Printer,
  RadioTower,
  ScanBarcode,
  ShieldCheck,
  Usb,
  Volume2,
} from "lucide-react";
import {
  WORKSTATION_CAPABILITIES,
  WORKSTATION_STATUSES,
  WORKSTATION_STATUS_CLASS_NAMES,
  WORKSTATION_TYPES,
  getWorkstationCapabilityLabel,
  getWorkstationStatusLabel,
  getWorkstationTypeLabel,
  type WorkstationCapability,
  type WorkstationStatus,
  type WorkstationType,
} from "@/lib/modules/clinical-workstations";
import { supabase } from "@/lib/supabase";
import { Panel } from "@/components/settings";

type DisplayWorkstation = {
  id: string;
  name: string;
  type: WorkstationType;
  location: string;
  agentUrl: string;
  status: WorkstationStatus;
  capabilities: WorkstationCapability[];
};

type WorkstationRow = {
  id: string;
  name: string;
  workstation_type: WorkstationType;
  location_label: string | null;
  room_number: string | null;
  agent_url: string | null;
  supports_printer: boolean;
  supports_usb_scanner: boolean;
  supports_camera: boolean;
  supports_sound: boolean;
  supports_sterilizer: boolean;
  status: WorkstationStatus;
};

type WorkstationDataState = "loading" | "connected" | "planning";

const workstationExamples: DisplayWorkstation[] = [
  {
    id: "planning-reception",
    name: "Reception",
    type: "reception",
    location: "Front desk",
    agentUrl: "Not configured",
    status: "planned",
    capabilities: ["printer", "usb_scanner", "sound"],
  },
  {
    id: "planning-sterilization",
    name: "Sterilization Room",
    type: "sterilization",
    location: "Sterilization",
    agentUrl: "Not configured",
    status: "planned",
    capabilities: ["printer", "usb_scanner", "camera", "sound", "sterilizer"],
  },
  {
    id: "planning-operatory-1",
    name: "Operatory 1",
    type: "operatory",
    location: "Room 1",
    agentUrl: "Not configured",
    status: "planned",
    capabilities: ["usb_scanner", "camera", "sound"],
  },
  {
    id: "planning-operatory-2",
    name: "Operatory 2",
    type: "operatory",
    location: "Room 2",
    agentUrl: "Not configured",
    status: "planned",
    capabilities: ["usb_scanner", "camera", "sound"],
  },
];

const comingNext = [
  {
    title: "Workstation registration",
    description:
      "Create and manage clinic workstation records before hardware is paired.",
  },
  {
    title: "Room identity",
    description:
      "Attach scans, prints, and alerts to a clinical location such as an operatory or sterilization room.",
  },
  {
    title: "Scanner event flow",
    description:
      "Route scanner events through the Clinic Agent after the registration model is ready.",
  },
  {
    title: "Patient context flow",
    description:
      "Connect room-level scan context to an active patient workflow in a later phase.",
  },
  {
    title: "Audit logging",
    description:
      "Record which workstation, room, user, and hardware path produced each future event.",
  },
];

const capabilityIcons = {
  printer: Printer,
  usb_scanner: Usb,
  camera: Camera,
  sound: Volume2,
  sterilizer: ShieldCheck,
} satisfies Record<WorkstationCapability, typeof Printer>;

export default function SettingsWorkstations() {
  const [workstations, setWorkstations] = useState<DisplayWorkstation[]>([]);
  const [dataState, setDataState] =
    useState<WorkstationDataState>("loading");

  useEffect(() => {
    let isCurrent = true;

    async function loadWorkstations() {
      try {
        const { data, error } = await supabase
          .from("clinical_workstations")
          .select(
            "id, name, workstation_type, location_label, room_number, agent_url, supports_printer, supports_usb_scanner, supports_camera, supports_sound, supports_sterilizer, status",
          )
          .order("name", { ascending: true });

        if (error) {
          throw error;
        }

        if (!isCurrent) {
          return;
        }

        setWorkstations(
          ((data || []) as WorkstationRow[]).map(mapWorkstationRow),
        );
        setDataState("connected");
      } catch (error) {
        console.info(
          "Clinical workstations table is not connected; showing planning mode.",
          error,
        );

        if (isCurrent) {
          setWorkstations([]);
          setDataState("planning");
        }
      }
    }

    loadWorkstations();

    return () => {
      isCurrent = false;
    };
  }, []);

  const displayedWorkstations =
    dataState === "planning" ? workstationExamples : workstations;

  return (
    <Panel
      title="Smart Clinical Workstations"
      description="Foundation for future room-level workstation registration, Clinic Agent pairing, and hardware readiness."
    >
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <span className="rounded-lg border border-slate-200 bg-white p-2">
                <ShieldCheck className="h-5 w-5 text-slate-700" />
              </span>
              <div>
                <p className="font-medium text-slate-900">
                  Super admin workstation console
                </p>
                <p className="mt-1 text-sm text-slate-600">
                  Visible only to super admins from the Settings Workstations
                  tab.
                </p>
              </div>
            </div>
            <p className="mt-4 max-w-3xl text-sm text-slate-600">
              Workstations represent fixed clinical locations that may later
              connect to a SteriSphere Clinic Agent for local hardware access.
              This first persistence step is read-only.
            </p>
          </div>

          <span
            className={`w-fit rounded-lg border px-3 py-2 text-sm font-medium ${
              dataState === "connected"
                ? "border-green-200 bg-green-50 text-green-700"
                : "border-amber-200 bg-amber-50 text-amber-800"
            }`}
          >
            {dataState === "loading"
              ? "Loading workstations"
              : dataState === "connected"
                ? "Read-only / Connected"
                : "Planning mode / Table not connected yet"}
          </span>
        </div>
      </div>

      {dataState === "loading" ? (
        <div className="mt-6 rounded-lg border border-slate-200 bg-slate-50 p-4">
          <p className="text-sm font-medium text-slate-900">
            Loading configured workstations
          </p>
          <p className="mt-1 text-sm text-slate-600">
            Checking for the read-only workstation table connection.
          </p>
        </div>
      ) : null}

      {dataState === "connected" && displayedWorkstations.length === 0 ? (
        <div className="mt-6 rounded-lg border border-slate-200 bg-slate-50 p-4">
          <p className="text-sm font-medium text-slate-900">
            No workstations configured
          </p>
          <p className="mt-1 text-sm text-slate-600">
            The workstation table is connected but contains no rooms yet.
            Workstation setup and registration will be added in a later phase.
          </p>
        </div>
      ) : null}

      {displayedWorkstations.length > 0 ? (
        <div className="mt-6 grid grid-cols-1 gap-4 xl:grid-cols-2">
          {displayedWorkstations.map((workstation) => (
            <div
              key={workstation.id}
              className="rounded-xl border border-slate-200 bg-white p-4"
            >
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <div className="flex items-center gap-3">
                    <span className="rounded-lg border border-slate-200 bg-slate-50 p-2">
                      <Laptop className="h-5 w-5 text-slate-700" />
                    </span>
                    <div>
                      <p className="font-semibold text-slate-900">
                        {workstation.name}
                      </p>
                      <p className="mt-1 text-sm text-slate-500">
                        {getWorkstationTypeLabel(workstation.type)} /{" "}
                        {workstation.location}
                      </p>
                    </div>
                  </div>
                </div>

                <span
                  className={`w-fit rounded-lg border px-3 py-1 text-xs font-medium ${
                    WORKSTATION_STATUS_CLASS_NAMES[workstation.status]
                  }`}
                >
                  {getWorkstationStatusLabel(workstation.status)}
                </span>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs font-medium uppercase text-slate-500">
                    Workstation name
                  </p>
                  <p className="mt-1 text-sm font-medium text-slate-900">
                    {workstation.name}
                  </p>
                </div>

                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs font-medium uppercase text-slate-500">
                    Type / location
                  </p>
                  <p className="mt-1 text-sm font-medium text-slate-900">
                    {getWorkstationTypeLabel(workstation.type)} /{" "}
                    {workstation.location}
                  </p>
                </div>

                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs font-medium uppercase text-slate-500">
                    Agent URL
                  </p>
                  <p className="mt-1 text-sm font-medium text-slate-900">
                    {workstation.agentUrl}
                  </p>
                </div>

                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs font-medium uppercase text-slate-500">
                    Status
                  </p>
                  <p className="mt-1 text-sm font-medium text-slate-900">
                    {getWorkstationStatusLabel(workstation.status)}
                  </p>
                </div>
              </div>

              <div className="mt-4">
                <p className="text-sm font-medium text-slate-700">
                  Hardware capabilities
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {workstation.capabilities.length > 0 ? (
                    workstation.capabilities.map((capability) => {
                      const CapabilityIcon = capabilityIcons[capability];

                      return (
                        <span
                          key={capability}
                          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1 text-sm text-slate-600"
                        >
                          <CapabilityIcon className="h-4 w-4" />
                          {getWorkstationCapabilityLabel(capability)}
                        </span>
                      );
                    })
                  ) : (
                    <span className="text-sm text-slate-500">
                      No hardware capabilities configured
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {dataState === "planning" ? (
        <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-medium text-amber-900">
            Planning mode / table not connected yet
          </p>
          <p className="mt-1 text-sm text-amber-800">
            The saved workstation list could not be loaded. The examples above
            remain visible as a non-blocking preview until the planning SQL is
            applied and available to the current Supabase client.
          </p>
        </div>
      ) : null}

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex items-center gap-3">
            <span className="rounded-lg border border-slate-200 bg-white p-2">
              <Laptop className="h-5 w-5 text-slate-700" />
            </span>
            <div>
              <p className="font-medium text-slate-900">Room Identity</p>
              <p className="mt-1 text-sm text-slate-500">
                Name, type, room number, and notes for each clinical station.
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex items-center gap-3">
            <span className="rounded-lg border border-slate-200 bg-white p-2">
              <RadioTower className="h-5 w-5 text-slate-700" />
            </span>
            <div>
              <p className="font-medium text-slate-900">Clinic Agent Pairing</p>
              <p className="mt-1 text-sm text-slate-500">
                Agent URL, status, and last-seen tracking are planned only.
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex items-center gap-3">
            <span className="rounded-lg border border-slate-200 bg-white p-2">
              <ScanBarcode className="h-5 w-5 text-slate-700" />
            </span>
            <div>
              <p className="font-medium text-slate-900">Hardware Readiness</p>
              <p className="mt-1 text-sm text-slate-500">
                Scanner, printer, camera, and audio checks will come later.
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6 rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex items-center gap-3">
          <span className="rounded-lg border border-slate-200 bg-slate-50 p-2">
            <ClipboardList className="h-5 w-5 text-slate-700" />
          </span>
          <div>
            <p className="font-medium text-slate-900">Coming next</p>
            <p className="mt-1 text-sm text-slate-500">
              Planned Phase 7 work after this UI foundation.
            </p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
          {comingNext.map((item) => (
            <div
              key={item.title}
              className="rounded-lg border border-slate-200 bg-slate-50 p-3"
            >
              <p className="text-sm font-medium text-slate-900">
                {item.title}
              </p>
              <p className="mt-1 text-sm text-slate-500">{item.description}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <SummaryChips
          title="Planned workstation types"
          items={WORKSTATION_TYPES.map((type) => type.label)}
        />
        <SummaryChips
          title="Planned workstation capabilities"
          items={WORKSTATION_CAPABILITIES.map((capability) => capability.label)}
        />
        <SummaryChips
          title="Planned workstation statuses"
          items={WORKSTATION_STATUSES.map((status) => status.label)}
        />
      </div>
    </Panel>
  );
}

function mapWorkstationRow(row: WorkstationRow): DisplayWorkstation {
  const capabilities: WorkstationCapability[] = [];

  if (row.supports_printer) capabilities.push("printer");
  if (row.supports_usb_scanner) capabilities.push("usb_scanner");
  if (row.supports_camera) capabilities.push("camera");
  if (row.supports_sound) capabilities.push("sound");
  if (row.supports_sterilizer) capabilities.push("sterilizer");

  return {
    id: row.id,
    name: row.name,
    type: row.workstation_type,
    location:
      row.location_label ||
      (row.room_number
        ? `Room ${row.room_number}`
        : "Location not configured"),
    agentUrl: row.agent_url || "Not configured",
    status: row.status,
    capabilities,
  };
}

function SummaryChips({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <p className="text-sm font-medium text-slate-700">{title}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {items.map((item) => (
          <span
            key={item}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1 text-sm text-slate-600"
          >
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}
