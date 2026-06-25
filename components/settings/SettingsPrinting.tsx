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

export default function SettingsPrinting({
  printerForm,
  onPrinterFormChange,
  onSavePrinterSettings,
  loading,
  canManageSettings,
}: SettingsPrintingProps) {
  function updatePrinterForm(updates: Partial<PrinterForm>) {
    onPrinterFormChange({
      ...printerForm,
      ...updates,
    });
  }

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
        </div>

        <label className="mt-4 flex items-start justify-between gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4 cursor-pointer">
          <div>
            <p className="font-medium text-slate-900">Auto-print labels</p>
            <p className="mt-1 text-sm text-slate-500">
              Stores the existing future-ready auto-print preference. Direct
              printing is not enabled in this sprint.
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

        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          <button
            type="button"
            disabled
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-slate-100 px-5 py-3 text-sm font-medium text-slate-500 cursor-not-allowed"
            title="Direct printer connection testing is not enabled yet."
          >
            <Wifi className="h-4 w-4" />
            Test Connection
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
