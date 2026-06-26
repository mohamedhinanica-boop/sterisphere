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
  WORKSTATION_STATUSES,
  WORKSTATION_TYPES,
  type WorkstationType,
} from "@/lib/modules/clinical-workstations";
import { Panel } from "@/components/settings";

type WorkstationExample = {
  name: string;
  type: WorkstationType;
  location: string;
  agentUrl: string;
  status: "Planned" | "Not configured";
  capabilities: Array<"Printer" | "USB Scanner" | "Camera" | "Sound">;
};

const workstationExamples: WorkstationExample[] = [
  {
    name: "Reception",
    type: "reception",
    location: "Front desk",
    agentUrl: "Not configured",
    status: "Planned",
    capabilities: ["Printer", "USB Scanner", "Sound"],
  },
  {
    name: "Sterilization Room",
    type: "sterilization",
    location: "Sterilization",
    agentUrl: "Not configured",
    status: "Planned",
    capabilities: ["Printer", "USB Scanner", "Camera", "Sound"],
  },
  {
    name: "Operatory 1",
    type: "operatory",
    location: "Room 1",
    agentUrl: "Not configured",
    status: "Not configured",
    capabilities: ["USB Scanner", "Camera", "Sound"],
  },
  {
    name: "Operatory 2",
    type: "operatory",
    location: "Room 2",
    agentUrl: "Not configured",
    status: "Not configured",
    capabilities: ["USB Scanner", "Camera", "Sound"],
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
  Printer,
  "USB Scanner": Usb,
  Camera,
  Sound: Volume2,
};

function getWorkstationTypeLabel(type: WorkstationType) {
  return WORKSTATION_TYPES.find((item) => item.value === type)?.label || "Other";
}

export default function SettingsWorkstations() {
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
                  Super admin planning console
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
              This screen is a UI foundation only.
            </p>
          </div>

          <span className="w-fit rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800">
            Planned / Not configured
          </span>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 xl:grid-cols-2">
        {workstationExamples.map((workstation) => (
          <div
            key={workstation.name}
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
                  workstation.status === "Planned"
                    ? "border-blue-200 bg-blue-50 text-blue-700"
                    : "border-slate-200 bg-slate-50 text-slate-600"
                }`}
              >
                {workstation.status}
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
                  Agent URL / status
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
                  {workstation.status}
                </p>
              </div>
            </div>

            <div className="mt-4">
              <p className="text-sm font-medium text-slate-700">
                Hardware capabilities placeholder
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {workstation.capabilities.map((capability) => {
                  const CapabilityIcon = capabilityIcons[capability];

                  return (
                    <span
                      key={capability}
                      className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1 text-sm text-slate-600"
                    >
                      <CapabilityIcon className="h-4 w-4" />
                      {capability}
                    </span>
                  );
                })}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4">
        <p className="text-sm font-medium text-amber-900">
          Planning placeholder only
        </p>
        <p className="mt-1 text-sm text-amber-800">
          No scanner events, patient tracing changes, or Clinic Agent behavior
          changes are active from this section.
        </p>
      </div>

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

      <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
        <SummaryChips
          title="Planned workstation types"
          items={WORKSTATION_TYPES.map((type) => type.label)}
        />
        <SummaryChips
          title="Planned workstation statuses"
          items={WORKSTATION_STATUSES.map((status) => status.label)}
        />
      </div>
    </Panel>
  );
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
