import { Laptop, RadioTower, ScanBarcode } from "lucide-react";
import {
  WORKSTATION_STATUSES,
  WORKSTATION_TYPES,
} from "@/lib/modules/clinical-workstations";
import { Panel } from "@/components/settings";

export default function SettingsWorkstations() {
  return (
    <Panel
      title="Smart Clinical Workstations"
      description="Foundation for future room-level workstation registration, Clinic Agent pairing, and hardware readiness."
    >
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
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
                Agent ID, status, and last-seen tracking are planned only.
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

      <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4">
        <p className="text-sm font-medium text-amber-900">
          Planning placeholder only
        </p>
        <p className="mt-1 text-sm text-amber-800">
          No scanner events, patient tracing changes, or Clinic Agent behavior
          changes are active from this section.
        </p>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
        <div>
          <p className="text-sm font-medium text-slate-700">
            Planned workstation types
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {WORKSTATION_TYPES.map((type) => (
              <span
                key={type.value}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1 text-sm text-slate-600"
              >
                {type.label}
              </span>
            ))}
          </div>
        </div>

        <div>
          <p className="text-sm font-medium text-slate-700">
            Planned workstation statuses
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {WORKSTATION_STATUSES.map((status) => (
              <span
                key={status.value}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1 text-sm text-slate-600"
              >
                {status.label}
              </span>
            ))}
          </div>
        </div>
      </div>
    </Panel>
  );
}
