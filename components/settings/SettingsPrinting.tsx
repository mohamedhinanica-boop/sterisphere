import { useState } from "react";
import { Activity, Printer, Server, TestTube2, Wifi } from "lucide-react";
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
type DiagnosticStatus = "unknown" | "testing" | "success" | "error";
const cloudLanPrinterMessage =
  "Cloud servers cannot directly access LAN printers. Use the Local Print Agent diagnostics below.";

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
  const [agentStatus, setAgentStatus] =
    useState<DiagnosticStatus>("unknown");
  const [agentStatusMessage, setAgentStatusMessage] = useState(
    "Status: Unknown",
  );
  const [printerStatus, setPrinterStatus] =
    useState<DiagnosticStatus>("unknown");
  const [printerStatusMessage, setPrinterStatusMessage] = useState(
    "Status: Unknown",
  );
  const [testLabelStatus, setTestLabelStatus] =
    useState<DiagnosticStatus>("unknown");
  const [testLabelMessage, setTestLabelMessage] = useState("Status: Unknown");

  function updatePrinterForm(updates: Partial<PrinterForm>) {
    setConnectionTestStatus("idle");
    setConnectionTestMessage("");
    setAgentStatus("unknown");
    setAgentStatusMessage("Status: Unknown");
    setPrinterStatus("unknown");
    setPrinterStatusMessage("Status: Unknown");
    setTestLabelStatus("unknown");
    setTestLabelMessage("Status: Unknown");
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
    setConnectionTestMessage("Testing cloud reachability...");

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
      setConnectionTestMessage("Cloud reachability successful.");
    } catch {
      setConnectionTestStatus("error");
      setConnectionTestMessage(
        isPrivateNetworkPrinter
          ? cloudLanPrinterMessage
          : "Offline / connection failed.",
      );
    }
  }

  async function testAgent() {
    const agentUrlResult = getLocalAgentUrl();

    if (!agentUrlResult.ok) {
      setAgentStatus("error");
      setAgentStatusMessage(agentUrlResult.error);
      return;
    }

    setAgentStatus("testing");
    setAgentStatusMessage("Testing Local Print Agent...");

    try {
      const response = await fetch(`${agentUrlResult.url}/health`, {
        method: "GET",
      });
      const result = (await response.json()) as {
        ok?: boolean;
        status?: string;
        version?: string;
      };

      if (!response.ok || !result.ok) {
        setAgentStatus("error");
        setAgentStatusMessage("✕ Local Print Agent Offline");
        return;
      }

      setAgentStatus("success");
      setAgentStatusMessage(
        `✓ Local Print Agent Online. Version ${result.version || "unknown"}. Status ${result.status || "unknown"}.`,
      );
    } catch {
      setAgentStatus("error");
      setAgentStatusMessage("✕ Local Print Agent Offline");
    }
  }

  async function testPrinterViaAgent() {
    const requestResult = getAgentPrinterRequest();

    if (!requestResult.ok) {
      setPrinterStatus("error");
      setPrinterStatusMessage(requestResult.error);
      return;
    }

    setPrinterStatus("testing");
    setPrinterStatusMessage("Testing printer through Local Print Agent...");

    try {
      const response = await fetch(`${requestResult.agentUrl}/test-connection`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          host: requestResult.host,
          port: requestResult.port,
        }),
      });
      const result = (await response.json()) as {
        ok?: boolean;
        error?: string;
      };

      if (!response.ok || !result.ok) {
        setPrinterStatus("error");
        setPrinterStatusMessage(
          result.error ? `✕ ${result.error}` : "✕ Printer Offline",
        );
        return;
      }

      setPrinterStatus("success");
      setPrinterStatusMessage("✓ Printer Online");
    } catch {
      setPrinterStatus("error");
      setPrinterStatusMessage("✕ Printer Offline");
    }
  }

  async function printTestLabelViaAgent() {
    const requestResult = getAgentPrinterRequest();

    if (!requestResult.ok) {
      setTestLabelStatus("error");
      setTestLabelMessage(requestResult.error);
      return;
    }

    const labelWidthMm = Number(printerForm.labelWidthMm);
    const labelHeightMm = Number(printerForm.labelHeightMm);

    if (
      !Number.isInteger(labelWidthMm) ||
      labelWidthMm <= 0 ||
      !Number.isInteger(labelHeightMm) ||
      labelHeightMm <= 0
    ) {
      setTestLabelStatus("error");
      setTestLabelMessage("Enter valid label dimensions before printing.");
      return;
    }

    setTestLabelStatus("testing");
    setTestLabelMessage("Sending test label through Local Print Agent...");

    try {
      const response = await fetch(`${requestResult.agentUrl}/print-test-label`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          host: requestResult.host,
          port: requestResult.port,
          labelWidthMm,
          labelHeightMm,
        }),
      });
      const result = (await response.json()) as {
        ok?: boolean;
        error?: string;
      };

      if (!response.ok || !result.ok) {
        setTestLabelStatus("error");
        setTestLabelMessage(result.error || "Test label failed.");
        return;
      }

      setTestLabelStatus("success");
      setTestLabelMessage("Test label sent.");
    } catch {
      setTestLabelStatus("error");
      setTestLabelMessage("Test label failed.");
    }
  }

  function getAgentPrinterRequest():
    | { ok: true; agentUrl: string; host: string; port: number }
    | { ok: false; error: string } {
    const agentUrlResult = getLocalAgentUrl();
    if (!agentUrlResult.ok) {
      return agentUrlResult;
    }

    if (printerForm.connectionType === "usb") {
      return {
        ok: false,
        error: "USB printer diagnostics are not available yet.",
      };
    }

    const host = printerForm.printerIp.trim();
    if (!host) {
      return { ok: false, error: "Enter a printer IP address first." };
    }

    const port = Number(printerForm.printerPort);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      return { ok: false, error: "Enter a valid printer port from 1 to 65535." };
    }

    return {
      ok: true,
      agentUrl: agentUrlResult.url,
      host,
      port,
    };
  }

  function getLocalAgentUrl():
    | { ok: true; url: string }
    | { ok: false; error: string } {
    const localAgentUrl = printerForm.localAgentUrl.trim();

    if (!localAgentUrl) {
      return { ok: false, error: "Enter a Local Print Agent URL first." };
    }

    try {
      const url = new URL(localAgentUrl);
      return { ok: true, url: url.toString().replace(/\/+$/, "") };
    } catch {
      return { ok: false, error: "Enter a valid Local Print Agent URL." };
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

        <div className="mt-6 grid gap-4 lg:grid-cols-3">
          <DiagnosticCard
            title="Cloud Reachability"
            description="Cloud servers cannot directly access LAN printers. Use the Local Print Agent diagnostics below."
            status={connectionTestStatus}
            message={connectionTestMessage || "Status: Unknown"}
            actionLabel={
              connectionTestStatus === "testing"
                ? "Testing..."
                : "Cloud Reachability"
            }
            icon={<Wifi className="h-4 w-4" />}
            onAction={testConnection}
            actionDisabled={connectionTestStatus === "testing"}
          />

          <DiagnosticCard
            title="Local Print Agent"
            description="Checks whether this browser can reach the workstation Local Print Agent."
            status={agentStatus}
            message={agentStatusMessage}
            actionLabel={agentStatus === "testing" ? "Testing..." : "Test Agent"}
            icon={<Server className="h-4 w-4" />}
            onAction={testAgent}
            actionDisabled={agentStatus === "testing"}
          />

          <DiagnosticCard
            title="Printer Diagnostics"
            description="Checks printer TCP reachability through the Local Print Agent."
            status={printerStatus}
            message={printerStatusMessage}
            actionLabel={
              printerStatus === "testing" ? "Testing..." : "Test Printer"
            }
            icon={<Activity className="h-4 w-4" />}
            onAction={testPrinterViaAgent}
            actionDisabled={printerStatus === "testing"}
          />
        </div>

        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          <DiagnosticCard
            title="Print Test Label"
            description="Sends a simple TSPL test label through the Local Print Agent."
            status={testLabelStatus}
            message={testLabelMessage}
            actionLabel={
              testLabelStatus === "testing" ? "Printing..." : "Print Test Label"
            }
            icon={<TestTube2 className="h-4 w-4" />}
            onAction={printTestLabelViaAgent}
            actionDisabled={testLabelStatus === "testing"}
            compact
          />

          <button
            type="button"
            onClick={onSavePrinterSettings}
            disabled={loading || !canManageSettings}
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-slate-950 px-6 py-3 text-sm font-medium text-white cursor-pointer transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Printer className="h-4 w-4" />
            {loading ? "Saving..." : "Save Printing Settings"}
          </button>
        </div>
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

function DiagnosticCard({
  title,
  description,
  status,
  message,
  actionLabel,
  icon,
  onAction,
  actionDisabled,
  compact = false,
}: {
  title: string;
  description: string;
  status: ConnectionTestStatus | DiagnosticStatus;
  message: string;
  actionLabel: string;
  icon: React.ReactNode;
  onAction: () => void;
  actionDisabled: boolean;
  compact?: boolean;
}) {
  const statusTone =
    status === "success"
      ? "border-green-200 bg-green-50 text-green-800"
      : status === "error"
        ? "border-red-200 bg-red-50 text-red-800"
        : status === "testing"
          ? "border-blue-200 bg-blue-50 text-blue-800"
          : "border-slate-200 bg-slate-50 text-slate-600";

  const statusLabel =
    status === "success"
      ? "Success"
      : status === "error"
        ? "Failed"
        : status === "testing"
          ? "Testing"
          : "Unknown";

  return (
    <div
      className={`rounded-xl border border-slate-200 bg-white p-4 ${
        compact ? "min-w-[min(100%,22rem)] flex-1" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-slate-950">{title}</h3>
          <p className="mt-1 text-sm text-slate-500">{description}</p>
        </div>
        <span className={`rounded-lg border px-2 py-1 text-xs font-medium ${statusTone}`}>
          {statusLabel}
        </span>
      </div>

      <p className="mt-4 text-sm font-medium text-slate-700">{message}</p>

      <button
        type="button"
        onClick={onAction}
        disabled={actionDisabled}
        className="mt-4 inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 cursor-pointer transition hover:bg-slate-50 disabled:cursor-wait disabled:opacity-70"
      >
        {icon}
        {actionLabel}
      </button>
    </div>
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
