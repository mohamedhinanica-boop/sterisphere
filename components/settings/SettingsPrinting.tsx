import { useState } from "react";
import { Printer, TestTube2, Wifi } from "lucide-react";
import {
  CERTIFIED_PRINTER_MODELS,
  PRINTER_CONNECTION_TYPES,
  type CertifiedPrinterModel,
  type PrinterConnectionType,
} from "@/lib/modules/printers";
import { InputField, Panel } from "./index";

type PrinterForm = {
  printerModel: CertifiedPrinterModel;
  connectionType: PrinterConnectionType;
  printerIp: string;
  printerPort: string;
  labelWidthMm: string;
  labelHeightMm: string;
  localAgentUrl: string;
  autoPrintLabels: boolean;
};

type SettingsPrintingProps = {
  printerForm: PrinterForm;
  onPrinterFormChange: (form: PrinterForm) => void;
  onSavePrinterSettings: () => void;
  loading: boolean;
  canManageSettings: boolean;
};

const certificationGuidance = [
  { tier: "Premium", model: "Brother QL-820NWB" },
  { tier: "Professional", model: "Brother TD-4550DNWB" },
  { tier: "Value", model: "Zywell ZY Series" },
];

type ConnectionTestStatus = "idle" | "testing" | "success" | "error";
const cloudLanPrinterMessage =
  "Cloud server cannot reach local clinic printer. A local print agent will be required for production direct printing.";

export default function SettingsPrinting({
  printerForm,
  onPrinterFormChange,
  onSavePrinterSettings,
  loading,
  canManageSettings,
}: SettingsPrintingProps) {
  const [connectionTestStatus, setConnectionTestStatus] =
    useState<ConnectionTestStatus>("idle");
  const [connectionTestMessage, setConnectionTestMessage] = useState("");

  function updatePrinterForm(updates: Partial<PrinterForm>) {
    setConnectionTestStatus("idle");
    setConnectionTestMessage("");
    onPrinterFormChange({
      ...printerForm,
      ...updates,
    });
  }

  async function testConnection() {
    const host = printerForm.printerIp.trim();
    const isPrivateNetworkPrinter =
      printerForm.connectionType !== "usb" && isPrivateLanHost(host);

    if (printerForm.connectionType === "usb") {
      setConnectionTestStatus("error");
      setConnectionTestMessage(
        "USB printer connection testing is not available yet.",
      );
      return;
    }

    const port = Number(printerForm.printerPort);

    if (!host) {
      setConnectionTestStatus("error");
      setConnectionTestMessage("Enter a printer IP address before testing.");
      return;
    }

    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      setConnectionTestStatus("error");
      setConnectionTestMessage("Enter a valid printer port from 1 to 65535.");
      return;
    }

    setConnectionTestStatus("testing");
    setConnectionTestMessage("Testing printer connection...");

    try {
      const response = await fetch("/api/printers/test-connection", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          host,
          port,
        }),
      });

      const result = (await response.json()) as {
        ok: boolean;
        error?: string;
      };

      if (!response.ok || !result.ok) {
        setConnectionTestStatus("error");
        setConnectionTestMessage(
          isPrivateNetworkPrinter
            ? cloudLanPrinterMessage
            : result.error || "Offline / connection failed.",
        );
        return;
      }

      setConnectionTestStatus("success");
      setConnectionTestMessage("Online / connection successful.");
    } catch {
      setConnectionTestStatus("error");
      setConnectionTestMessage(
        isPrivateNetworkPrinter
          ? cloudLanPrinterMessage
          : "Offline / connection failed.",
      );
    }
  }

  const privateNetworkPrinter =
    printerForm.connectionType !== "usb" &&
    isPrivateLanHost(printerForm.printerIp.trim());

  return (
    <section className="space-y-6">
      <Panel
        title="Printing"
        description="Configure certified label printer settings for future direct Wi-Fi printing."
      >
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div>
            <label className="block text-sm font-medium mb-2">
              Certified Printer
            </label>
            <select
              value={printerForm.printerModel}
              onChange={(event) =>
                updatePrinterForm({
                  printerModel: event.target.value as CertifiedPrinterModel,
                })
              }
              className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3"
            >
              {CERTIFIED_PRINTER_MODELS.map((printer) => (
                <option key={printer.value} value={printer.value}>
                  {printer.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">
              Connection Type
            </label>
            <select
              value={printerForm.connectionType}
              onChange={(event) =>
                updatePrinterForm({
                  connectionType: event.target.value as PrinterConnectionType,
                })
              }
              className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3"
            >
              {PRINTER_CONNECTION_TYPES.map((connectionType) => (
                <option key={connectionType.value} value={connectionType.value}>
                  {connectionType.label}
                </option>
              ))}
            </select>
          </div>

          <InputField
            label="Printer IP"
            value={printerForm.printerIp}
            onChange={(value) => updatePrinterForm({ printerIp: value })}
            placeholder="Example: 192.168.1.45"
          />

          <InputField
            label="Port"
            type="number"
            min="1"
            value={printerForm.printerPort}
            onChange={(value) => updatePrinterForm({ printerPort: value })}
            placeholder="9100"
          />

          <InputField
            label="Label Width (mm)"
            type="number"
            min="1"
            value={printerForm.labelWidthMm}
            onChange={(value) => updatePrinterForm({ labelWidthMm: value })}
            placeholder="50"
          />

          <InputField
            label="Label Height (mm)"
            type="number"
            min="1"
            value={printerForm.labelHeightMm}
            onChange={(value) => updatePrinterForm({ labelHeightMm: value })}
            placeholder="30"
          />

          <div className="lg:col-span-2">
            <InputField
              label="Local Print Agent URL"
              value={printerForm.localAgentUrl}
              onChange={(value) => updatePrinterForm({ localAgentUrl: value })}
              placeholder="http://localhost:8787"
            />
          </div>
        </div>

        <label className="mt-4 flex items-start justify-between gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4 cursor-pointer">
          <div>
            <p className="font-medium text-slate-900">Auto-print labels</p>
            <p className="mt-1 text-sm text-slate-500">
              Stores the existing future-ready auto-print preference. Direct
              automatic printing is not enabled in this sprint.
            </p>
          </div>
          <input
            type="checkbox"
            checked={printerForm.autoPrintLabels}
            onChange={(event) =>
              updatePrinterForm({ autoPrintLabels: event.target.checked })
            }
            className="mt-1 h-5 w-5"
          />
        </label>

        {privateNetworkPrinter && (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            <p className="font-medium">Private LAN printer detected</p>
            <p className="mt-1">
              Cloud-hosted SteriSphere cannot directly reach local printers
              from Vercel. Manual label printing can use the Local Print Agent
              URL when this workstation can reach it; browser printing remains
              the fallback.
            </p>
          </div>
        )}

        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          <button
            type="button"
            onClick={testConnection}
            disabled={connectionTestStatus === "testing"}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-medium text-slate-700 cursor-pointer transition hover:bg-slate-50 disabled:cursor-wait disabled:opacity-70"
            title={
              privateNetworkPrinter
                ? "Works only when this server is on the same LAN as the printer."
                : undefined
            }
          >
            <Wifi className="h-4 w-4" />
            {connectionTestStatus === "testing"
              ? "Testing..."
              : "Test Connection"}
          </button>

          <button
            type="button"
            disabled
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-slate-100 px-5 py-3 text-sm font-medium text-slate-500 cursor-not-allowed"
            title="Direct test label printing is not enabled yet."
          >
            <TestTube2 className="h-4 w-4" />
            Print Test Label
          </button>

          <button
            type="button"
            onClick={onSavePrinterSettings}
            disabled={loading || !canManageSettings}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-6 py-3 text-sm font-medium text-white cursor-pointer transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Printer className="h-4 w-4" />
            {loading ? "Saving..." : "Save Printing Settings"}
          </button>
        </div>

        {connectionTestStatus !== "idle" && (
          <div
            className={`mt-4 rounded-xl border p-4 text-sm ${
              connectionTestStatus === "success"
                ? "border-green-200 bg-green-50 text-green-800"
                : connectionTestStatus === "testing"
                  ? "border-blue-200 bg-blue-50 text-blue-800"
                  : "border-red-200 bg-red-50 text-red-800"
            }`}
          >
            <p className="font-medium">
              {connectionTestStatus === "success"
                ? "Printer online"
                : connectionTestStatus === "testing"
                  ? "Testing connection"
                  : "Printer offline"}
            </p>
            <p className="mt-1">{connectionTestMessage}</p>
          </div>
        )}
      </Panel>

      <Panel
        title="Direct Printing Architecture"
        description="Production direct printing will use a Local Print Agent installed on a clinic workstation/tablet network."
      >
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-sm font-medium text-slate-500">Future flow</p>
          <p className="mt-2 text-lg font-semibold text-slate-950">
            SteriSphere Cloud &rarr; Local Print Agent &rarr; LAN Printer
            &rarr; Label
          </p>
          <p className="mt-2 text-sm text-slate-600">
            Browser/manual printing remains the active fallback when the Local
            Print Agent is unavailable or not configured.
          </p>
        </div>
      </Panel>

      <Panel
        title="Certification Guidance"
        description="Read-only printer recommendations for SteriSphere label workflows."
      >
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {certificationGuidance.map((printer) => (
            <div
              key={printer.tier}
              className="rounded-xl border border-slate-200 bg-slate-50 p-4"
            >
              <p className="text-sm font-medium text-slate-500">
                {printer.tier}
              </p>
              <p className="mt-1 font-semibold text-slate-950">
                {printer.model}
              </p>
            </div>
          ))}
        </div>
      </Panel>
    </section>
  );
}

function isPrivateLanHost(host: string) {
  const ipv4Parts = host.split(".").map((part) => Number(part));

  if (
    ipv4Parts.length !== 4 ||
    ipv4Parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
  ) {
    return false;
  }

  const [first, second] = ipv4Parts;

  return (
    first === 10 ||
    first === 127 ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168)
  );
}
