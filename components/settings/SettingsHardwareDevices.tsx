"use client";

import { useEffect, useState } from "react";
import {
  Activity,
  Cpu,
  Link2,
  Search,
  type LucideIcon,
} from "lucide-react";
import { Panel } from "@/components/settings";
import {
  HARDWARE_DEVICE_HEALTH_CLASS_NAMES,
  HARDWARE_DEVICE_STATUS_CLASS_NAMES,
  getEnabledHardwareDeviceCapabilities,
  getHardwareDeviceCapabilityLabel,
  getHardwareDeviceHealthLabel,
  getHardwareDeviceStatusLabel,
  getHardwareDeviceTypeLabel,
  type HardwareConnectionType,
  type HardwareDeviceCapability,
  type HardwareDeviceHealth,
  type HardwareDeviceStatus,
  type HardwareDeviceType,
} from "@/lib/modules/clinical-workstations";
import { supabase } from "@/lib/supabase";

type DeviceDataState = "loading" | "connected" | "planning";

type RelatedName = { name: string } | Array<{ name: string }> | null;

type HardwareDeviceRow = {
  id: string;
  device_name: string;
  device_type: HardwareDeviceType;
  device_role: string | null;
  agent_id: string | null;
  default_workstation_id: string | null;
  current_workstation_id: string | null;
  manufacturer: string | null;
  model: string | null;
  serial_number: string | null;
  firmware_version: string | null;
  connection_type: HardwareConnectionType | null;
  connection_identifier: string | null;
  status: HardwareDeviceStatus;
  health: HardwareDeviceHealth;
  last_seen_at: string | null;
  last_error_at: string | null;
  last_error_message: string | null;
  supports_print_labels: boolean;
  supports_scan_qr: boolean;
  supports_scan_barcode: boolean;
  supports_camera: boolean;
  supports_audio: boolean;
  supports_cycle_reading: boolean;
  supports_temperature: boolean;
  supports_humidity: boolean;
  agent: RelatedName;
  default_workstation: RelatedName;
  current_workstation: RelatedName;
};

type DisplayHardwareDevice = Omit<
  HardwareDeviceRow,
  "agent" | "default_workstation" | "current_workstation"
> & {
  agent_name: string | null;
  default_workstation_name: string | null;
  current_workstation_name: string | null;
  capabilities: HardwareDeviceCapability[];
};

const planningDevices: DisplayHardwareDevice[] = [
  {
    id: "planning-label-printer",
    device_name: "Reception Label Printer",
    device_type: "printer",
    device_role: "Pack labels",
    agent_id: null,
    agent_name: "Main Clinic Agent",
    default_workstation_id: null,
    default_workstation_name: "Reception",
    current_workstation_id: null,
    current_workstation_name: "Reception",
    manufacturer: "Brother",
    model: "QL Series",
    serial_number: "Not reported",
    firmware_version: "Not reported",
    connection_type: "lan",
    connection_identifier: "Not configured",
    status: "discovered",
    health: "unknown",
    last_seen_at: null,
    last_error_at: null,
    last_error_message: null,
    supports_print_labels: true,
    supports_scan_qr: false,
    supports_scan_barcode: false,
    supports_camera: false,
    supports_audio: false,
    supports_cycle_reading: false,
    supports_temperature: false,
    supports_humidity: false,
    capabilities: ["print_labels"],
  },
  {
    id: "planning-usb-scanner",
    device_name: "Shared USB Scanner",
    device_type: "usb_scanner",
    device_role: "Pack scanning",
    agent_id: null,
    agent_name: "Main Clinic Agent",
    default_workstation_id: null,
    default_workstation_name: "Operatory 1",
    current_workstation_id: null,
    current_workstation_name: "Not assigned",
    manufacturer: "Not reported",
    model: "Not reported",
    serial_number: "Not reported",
    firmware_version: "Not reported",
    connection_type: "usb",
    connection_identifier: "Not configured",
    status: "discovered",
    health: "unknown",
    last_seen_at: null,
    last_error_at: null,
    last_error_message: null,
    supports_print_labels: false,
    supports_scan_qr: true,
    supports_scan_barcode: true,
    supports_camera: false,
    supports_audio: false,
    supports_cycle_reading: false,
    supports_temperature: false,
    supports_humidity: false,
    capabilities: ["scan_qr", "scan_barcode"],
  },
  {
    id: "planning-sterilizer",
    device_name: "Sterilizer Interface",
    device_type: "sterilizer",
    device_role: "Cycle observation",
    agent_id: null,
    agent_name: "Sterilization Agent",
    default_workstation_id: null,
    default_workstation_name: "Sterilization Room",
    current_workstation_id: null,
    current_workstation_name: "Sterilization Room",
    manufacturer: "Not reported",
    model: "Not reported",
    serial_number: "Not reported",
    firmware_version: "Not reported",
    connection_type: "serial",
    connection_identifier: "Not configured",
    status: "discovered",
    health: "unknown",
    last_seen_at: null,
    last_error_at: null,
    last_error_message: null,
    supports_print_labels: false,
    supports_scan_qr: false,
    supports_scan_barcode: false,
    supports_camera: false,
    supports_audio: false,
    supports_cycle_reading: true,
    supports_temperature: false,
    supports_humidity: false,
    capabilities: ["read_cycle"],
  },
];

export default function SettingsHardwareDevices() {
  const [devices, setDevices] = useState<DisplayHardwareDevice[]>([]);
  const [dataState, setDataState] = useState<DeviceDataState>("loading");

  useEffect(() => {
    let isCurrent = true;

    async function loadDevices() {
      try {
        const { data, error } = await supabase
          .from("clinical_hardware_devices")
          .select(
            "id, device_name, device_type, device_role, agent_id, default_workstation_id, current_workstation_id, manufacturer, model, serial_number, firmware_version, connection_type, connection_identifier, status, health, last_seen_at, last_error_at, last_error_message, supports_print_labels, supports_scan_qr, supports_scan_barcode, supports_camera, supports_audio, supports_cycle_reading, supports_temperature, supports_humidity, agent:clinical_agents!clinical_hardware_devices_agent_id_fkey(name), default_workstation:clinical_workstations!clinical_hardware_devices_default_workstation_id_fkey(name), current_workstation:clinical_workstations!clinical_hardware_devices_current_workstation_id_fkey(name)",
          )
          .order("device_name", { ascending: true });

        if (error) {
          throw error;
        }

        if (!isCurrent) {
          return;
        }

        setDevices(
          ((data || []) as HardwareDeviceRow[]).map(mapHardwareDeviceRow),
        );
        setDataState("connected");
      } catch (error) {
        console.info(
          "Clinical hardware devices table is not connected; showing planning mode.",
          error,
        );

        if (isCurrent) {
          setDevices([]);
          setDataState("planning");
        }
      }
    }

    loadDevices();

    return () => {
      isCurrent = false;
    };
  }, []);

  const displayedDevices =
    dataState === "planning" ? planningDevices : devices;

  return (
    <Panel
      title="Hardware Devices"
      description="Read-only inventory foundation for hardware observed by SteriSphere Clinic Agents."
    >
      <div className="flex flex-col gap-4 border-b border-slate-200 pb-5 md:flex-row md:items-start md:justify-between">
        <div className="flex items-start gap-3">
          <span className="rounded-lg border border-slate-200 bg-slate-50 p-2">
            <Cpu className="h-5 w-5 text-slate-700" />
          </span>
          <div>
            <p className="font-medium text-slate-900">
              Super admin hardware inventory
            </p>
            <p className="mt-1 max-w-3xl text-sm text-slate-600">
              Observe discovered devices and their room context before enabling
              assignment, diagnostics, or clinical use.
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
            ? "Loading devices"
            : dataState === "connected"
              ? "Read-only / Connected"
              : "Planning mode / Table not connected yet"}
        </span>
      </div>

      <div className="mt-6 border-l-4 border-cyan-300 bg-cyan-50 px-4 py-3">
        <p className="text-sm font-medium text-cyan-900">
          Observe before control
        </p>
        <p className="mt-1 text-sm text-cyan-800">
          Hardware Discovery lets SteriSphere observe available devices before
          routing workflows to them. Devices are displayed before they are
          assigned or used.
        </p>
      </div>

      {dataState === "loading" ? (
        <div className="mt-6 border-l-4 border-slate-300 bg-slate-50 px-4 py-3">
          <p className="text-sm font-medium text-slate-900">
            Loading discovered hardware
          </p>
          <p className="mt-1 text-sm text-slate-600">
            Checking for the cloud-side hardware inventory table.
          </p>
        </div>
      ) : null}

      {dataState === "connected" && displayedDevices.length === 0 ? (
        <div className="mt-6 border-l-4 border-slate-300 bg-slate-50 px-4 py-3">
          <p className="text-sm font-medium text-slate-900">
            No hardware devices discovered
          </p>
          <p className="mt-1 text-sm text-slate-600">
            The inventory table is connected but contains no device records.
            Agent discovery and reporting will be added in a later phase.
          </p>
        </div>
      ) : null}

      {displayedDevices.length > 0 ? (
        <div className="mt-6 grid grid-cols-1 gap-4 xl:grid-cols-2">
          {displayedDevices.map((device) => (
            <DeviceCard key={device.id} device={device} />
          ))}
        </div>
      ) : null}

      {dataState === "planning" ? (
        <div className="mt-6 border-l-4 border-amber-300 bg-amber-50 px-4 py-3">
          <p className="text-sm font-medium text-amber-900">
            Planning mode / table not connected yet
          </p>
          <p className="mt-1 text-sm text-amber-800">
            Static examples remain visible until the clinical hardware SQL is
            applied and readable through the current Supabase client.
          </p>
        </div>
      ) : null}
    </Panel>
  );
}

function DeviceCard({ device }: { device: DisplayHardwareDevice }) {
  return (
    <article className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-center gap-3">
          <span className="rounded-lg border border-slate-200 bg-slate-50 p-2">
            <Cpu className="h-5 w-5 text-slate-700" />
          </span>
          <div>
            <h3 className="font-semibold text-slate-900">
              {device.device_name}
            </h3>
            <p className="mt-1 text-sm text-slate-500">
              {getHardwareDeviceTypeLabel(device.device_type)}
              {device.device_role ? ` / ${device.device_role}` : ""}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <StatusBadge
            label={getHardwareDeviceStatusLabel(device.status)}
            className={HARDWARE_DEVICE_STATUS_CLASS_NAMES[device.status]}
          />
          <StatusBadge
            label={getHardwareDeviceHealthLabel(device.health)}
            className={HARDWARE_DEVICE_HEALTH_CLASS_NAMES[device.health]}
          />
        </div>
      </div>

      <dl className="mt-4 grid grid-cols-1 border-t border-slate-200 sm:grid-cols-2">
        <DeviceDetail label="Assigned agent" value={device.agent_name} />
        <DeviceDetail
          label="Connection"
          value={formatConnection(device)}
        />
        <DeviceDetail
          label="Default workstation"
          value={device.default_workstation_name}
        />
        <DeviceDetail
          label="Current workstation"
          value={device.current_workstation_name}
        />
        <DeviceDetail
          label="Manufacturer / model"
          value={formatManufacturerModel(device)}
        />
        <DeviceDetail label="Serial number" value={device.serial_number} />
        <DeviceDetail label="Firmware" value={device.firmware_version} />
        <DeviceDetail
          label="Last seen"
          value={formatTimestamp(device.last_seen_at, "Never")}
        />
        <div className="border-b border-slate-200 py-3 sm:col-span-2">
          <dt className="text-xs font-medium uppercase text-slate-500">
            Capabilities
          </dt>
          <dd className="mt-2 flex flex-wrap gap-x-4 gap-y-2">
            {device.capabilities.length > 0 ? (
              device.capabilities.map((capability) => (
                <span key={capability} className="text-sm text-slate-700">
                  {getHardwareDeviceCapabilityLabel(capability)}
                </span>
              ))
            ) : (
              <span className="text-sm text-slate-500">
                No capabilities reported
              </span>
            )}
          </dd>
        </div>
      </dl>

      {device.last_error_message ? (
        <div className="mt-4 border-l-4 border-red-300 bg-red-50 px-3 py-2">
          <p className="text-xs font-medium uppercase text-red-700">
            Last error
          </p>
          <p className="mt-1 text-sm text-red-900">
            {device.last_error_message}
          </p>
          <p className="mt-1 text-xs text-red-700">
            {formatTimestamp(device.last_error_at, "Time not reported")}
          </p>
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <ComingSoonButton icon={Link2} label="Assign Device" />
        <ComingSoonButton icon={Activity} label="Test Device" />
        <ComingSoonButton icon={Search} label="View Diagnostics" />
        <span className="text-xs font-medium text-slate-500">
          Coming in next phase
        </span>
      </div>
    </article>
  );
}

function DeviceDetail({
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

function StatusBadge({
  label,
  className,
}: {
  label: string;
  className: string;
}) {
  return (
    <span
      className={`w-fit rounded-lg border px-3 py-1 text-xs font-medium ${className}`}
    >
      {label}
    </span>
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

function mapHardwareDeviceRow(
  row: HardwareDeviceRow,
): DisplayHardwareDevice {
  return {
    ...row,
    agent_name: getRelatedName(row.agent),
    default_workstation_name: getRelatedName(row.default_workstation),
    current_workstation_name: getRelatedName(row.current_workstation),
    capabilities: getEnabledHardwareDeviceCapabilities(row),
  };
}

function getRelatedName(relation: RelatedName) {
  const record = Array.isArray(relation) ? relation[0] : relation;
  return record?.name || null;
}

function formatConnection(device: DisplayHardwareDevice) {
  if (!device.connection_type && !device.connection_identifier) {
    return null;
  }

  return [device.connection_type, device.connection_identifier]
    .filter(Boolean)
    .join(" / ");
}

function formatManufacturerModel(device: DisplayHardwareDevice) {
  const value = [device.manufacturer, device.model].filter(Boolean).join(" / ");
  return value || null;
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
