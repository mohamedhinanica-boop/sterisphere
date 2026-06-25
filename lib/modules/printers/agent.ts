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
const PRINT_AGENT_LOG_PREFIX = "[Local Print Agent]";

export async function printPackLabelViaAgent(
  label: AgentPackLabelInput,
): Promise<AgentPrintResult> {
  logAgentDecision("printPackLabelViaAgent invoked", {
    packNumber: label.packNumber,
    hasDisplayName: Boolean(label.displayName),
    hasExpiresAt: Boolean(label.expiresAt),
  });

  const settings = await loadPrinterSettings();
  const configuredSettings = getConfiguredAgentSettings(settings);

  logAgentDecision("printing enabled", {
    enabled: Boolean(configuredSettings),
  });

  if (!configuredSettings) {
    return { status: "fallback" };
  }

  try {
    const url = `${configuredSettings.agentUrl}/print-pack-label`;
    const payload = {
      displayName: label.displayName || label.packNumber,
      packNumber: label.packNumber,
      cycleNumber: label.cycleNumber,
      expiresAt: label.expiresAt,
      qrValue: label.qrValue,
      labelWidthMm: configuredSettings.labelWidthMm || DEFAULT_LABEL_WIDTH_MM,
      labelHeightMm:
        configuredSettings.labelHeightMm || DEFAULT_LABEL_HEIGHT_MM,
      template: "sterisphere-standard",
      host: configuredSettings.printerHost,
      port: configuredSettings.printerPort,
    };

    logAgentDecision("POST attempt", {
      url,
      host: payload.host,
      port: payload.port,
      labelWidthMm: payload.labelWidthMm,
      labelHeightMm: payload.labelHeightMm,
      template: payload.template,
      packNumber: payload.packNumber,
    });

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const result = (await response.json()) as { ok?: boolean; error?: string };

    logAgentDecision("agent response", {
      httpStatus: response.status,
      responseOk: response.ok,
      agentOk: Boolean(result.ok),
      error: result.error || null,
    });

    if (!response.ok || !result.ok) {
      logAgentFallback("agent returned unsuccessful print response", {
        httpStatus: response.status,
        responseOk: response.ok,
        agentOk: Boolean(result.ok),
        error: result.error || null,
      });

      return {
        status: "fallback",
        message: AGENT_UNAVAILABLE_MESSAGE,
      };
    }

    logAgentDecision("print completed via Local Print Agent", {
      packNumber: label.packNumber,
    });

    return { status: "printed" };
  } catch (error) {
    logAgentFallback("agent POST failed or response could not be read", {
      error,
    });
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
    logAgentFallback("clinic_settings load error", {
      error,
    });
    return null;
  }

  logAgentDecision("clinic_settings loaded", {
    loaded: Boolean(data),
  });

  return data;
}

function getConfiguredAgentSettings(settings: ClinicPrinterSettings | null) {
  if (!settings) {
    logAgentFallback("clinic_settings missing");
    return null;
  }

  const connectionType = settings.printer_connection_type;
  const agentUrl = normalizeAgentUrl(settings.local_print_agent_url);
  const printerHost = settings.printer_ip?.trim();
  const printerPort = settings.printer_port || DEFAULT_PRINTER_PORT;

  logAgentDecision("printer model", {
    printerModel: settings.printer_model || null,
  });
  logAgentDecision("connection type", {
    connectionType: connectionType || null,
  });
  logAgentDecision("local agent URL", {
    configuredValue: settings.local_print_agent_url || null,
    normalizedValue: agentUrl || null,
  });
  logAgentDecision("printer host", {
    printerHost: printerHost || null,
  });
  logAgentDecision("printer port", {
    printerPort,
  });

  if (!settings.printer_model) {
    logAgentFallback("printer model missing");
    return null;
  }

  if (connectionType !== "wifi" && connectionType !== "ethernet") {
    logAgentFallback("connection type is not Wi-Fi or Ethernet", {
      connectionType: connectionType || null,
    });
    return null;
  }

  if (!agentUrl) {
    logAgentFallback("local agent URL missing");
    return null;
  }

  if (!printerHost) {
    logAgentFallback("printer host missing");
    return null;
  }

  if (
    !Number.isInteger(printerPort) ||
    printerPort < 1 ||
    printerPort > 65535
  ) {
    logAgentFallback("printer port invalid", {
      printerPort,
    });
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

function logAgentDecision(message: string, details?: Record<string, unknown>) {
  console.info(PRINT_AGENT_LOG_PREFIX, message, details || {});
}

function logAgentFallback(reason: string, details?: Record<string, unknown>) {
  console.warn(PRINT_AGENT_LOG_PREFIX, "fallback reason", {
    reason,
    ...(details || {}),
  });
}
