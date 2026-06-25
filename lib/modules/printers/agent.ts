import { supabase } from "@/lib/supabase";
import {
  DEFAULT_LABEL_HEIGHT_MM,
  DEFAULT_LABEL_WIDTH_MM,
  DEFAULT_LOCAL_PRINT_AGENT_URL,
  DEFAULT_PRINTER_PORT,
  type PrinterConnectionType,
} from "./types";

type AgentPrintStatus = "printed" | "fallback";

type AgentPrintResult = {
  status: AgentPrintStatus;
  message?: string;
};

type ClinicPrinterSettings = {
  printer_model?: string | null;
  printer_connection_type?: PrinterConnectionType | null;
  printer_ip?: string | null;
  printer_port?: number | null;
  printer_label_width_mm?: number | null;
  printer_label_height_mm?: number | null;
  local_print_agent_url?: string | null;
};

export type AgentPackLabelInput = {
  displayName?: string | null;
  packNumber: string;
  cycleNumber: string;
  expiresAt: string | null;
  qrValue: string;
};

const AGENT_UNAVAILABLE_MESSAGE =
  "Local Print Agent unavailable. Using browser printing.";

export async function printPackLabelViaAgent(
  label: AgentPackLabelInput,
): Promise<AgentPrintResult> {
  const settings = await loadPrinterSettings();
  const configuredSettings = getConfiguredAgentSettings(settings);

  if (!configuredSettings) {
    return { status: "fallback" };
  }

  try {
    const response = await fetch(
      `${configuredSettings.agentUrl}/print-pack-label`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          displayName: label.displayName || label.packNumber,
          packNumber: label.packNumber,
          cycleNumber: label.cycleNumber,
          expiresAt: label.expiresAt,
          qrValue: label.qrValue,
          labelWidthMm:
            configuredSettings.labelWidthMm || DEFAULT_LABEL_WIDTH_MM,
          labelHeightMm:
            configuredSettings.labelHeightMm || DEFAULT_LABEL_HEIGHT_MM,
          template: "sterisphere-standard",
          host: configuredSettings.printerHost,
          port: configuredSettings.printerPort,
        }),
      },
    );

    const result = (await response.json()) as { ok?: boolean; error?: string };

    if (!response.ok || !result.ok) {
      return {
        status: "fallback",
        message: AGENT_UNAVAILABLE_MESSAGE,
      };
    }

    return { status: "printed" };
  } catch (error) {
    console.error("Local Print Agent print error:", error);
    return {
      status: "fallback",
      message: AGENT_UNAVAILABLE_MESSAGE,
    };
  }
}

async function loadPrinterSettings(): Promise<ClinicPrinterSettings | null> {
  const { data, error } = await supabase
    .from("clinic_settings")
    .select("*")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle<ClinicPrinterSettings>();

  if (error) {
    console.error("Printer settings load error:", error);
    return null;
  }

  return data;
}

function getConfiguredAgentSettings(settings: ClinicPrinterSettings | null) {
  if (!settings) {
    return null;
  }

  const connectionType = settings.printer_connection_type;
  const agentUrl = normalizeAgentUrl(settings.local_print_agent_url);
  const printerHost = settings.printer_ip?.trim();
  const printerPort = settings.printer_port || DEFAULT_PRINTER_PORT;

  if (
    !settings.printer_model ||
    (connectionType !== "wifi" && connectionType !== "ethernet") ||
    !agentUrl ||
    !printerHost ||
    !Number.isInteger(printerPort) ||
    printerPort < 1 ||
    printerPort > 65535
  ) {
    return null;
  }

  return {
    agentUrl,
    printerHost,
    printerPort,
    labelWidthMm: settings.printer_label_width_mm || DEFAULT_LABEL_WIDTH_MM,
    labelHeightMm: settings.printer_label_height_mm || DEFAULT_LABEL_HEIGHT_MM,
  };
}

function normalizeAgentUrl(value?: string | null) {
  return (value || DEFAULT_LOCAL_PRINT_AGENT_URL).trim().replace(/\/+$/, "");
}
