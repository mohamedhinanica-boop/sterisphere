"use strict";

const http = require("node:http");
const net = require("node:net");

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 8787;
const CONNECTION_TIMEOUT_MS = 2500;
const MAX_BODY_BYTES = 2048;
const DEFAULT_PACK_LABEL_TEMPLATE = "sterisphere-standard";
const SUPPORTED_PACK_LABEL_TEMPLATES = {
  [DEFAULT_PACK_LABEL_TEMPLATE]: buildSterisphereStandardPackLabel,
};
const FUTURE_PACK_LABEL_TEMPLATES = [
  "compact",
  "large-qr",
  "large-text",
  "custom",
];

const agentHost = process.env.AGENT_HOST || DEFAULT_HOST;
const agentPort = parsePort(process.env.AGENT_PORT, DEFAULT_PORT);

const server = http.createServer(async (request, response) => {
  try {
    if (request.method === "GET" && request.url === "/health") {
      sendJson(response, 200, {
        ok: true,
        status: "running",
        service: "sterisphere-local-print-agent",
        version: "0.1.0",
        testLabelPrintingEnabled: true,
        packLabelPrintingEnabled: true,
        defaultPackLabelTemplate: DEFAULT_PACK_LABEL_TEMPLATE,
        supportedPackLabelTemplates: Object.keys(SUPPORTED_PACK_LABEL_TEMPLATES),
      });
      return;
    }

    if (request.method === "POST" && request.url === "/print-pack-label") {
      const body = await readJsonBody(request);
      const targetResult = validatePrinterTarget(body);

      if (!targetResult.ok) {
        sendJson(response, 400, { ok: false, error: targetResult.error });
        return;
      }

      const labelSizeResult = validateLabelSize(body);
      if (!labelSizeResult.ok) {
        sendJson(response, 400, { ok: false, error: labelSizeResult.error });
        return;
      }

      const templateResult = validatePackLabelTemplate(body.template);
      if (!templateResult.ok) {
        sendJson(response, 400, { ok: false, error: templateResult.error });
        return;
      }

      const packLabelResult = validatePackLabelPayload(body);
      if (!packLabelResult.ok) {
        sendJson(response, 400, { ok: false, error: packLabelResult.error });
        return;
      }

      try {
        const command = buildTsplPackLabel(templateResult.template, {
          labelWidthMm: labelSizeResult.labelWidthMm,
          labelHeightMm: labelSizeResult.labelHeightMm,
          displayName: packLabelResult.displayName,
          packNumber: packLabelResult.packNumber,
          cycleNumber: packLabelResult.cycleNumber,
          expiresAt: packLabelResult.expiresAt,
          qrValue: packLabelResult.qrValue,
        });
        await sendTcpPayload(targetResult.host, targetResult.port, command);
        sendJson(response, 200, { ok: true });
      } catch (error) {
        sendJson(response, 200, {
          ok: false,
          error: `Print failed: ${error.message}`,
        });
      }
      return;
    }

    if (request.method === "POST" && request.url === "/print-test-label") {
      const body = await readJsonBody(request);
      const targetResult = validatePrinterTarget(body);

      if (!targetResult.ok) {
        sendJson(response, 400, { ok: false, error: targetResult.error });
        return;
      }

      const labelSizeResult = validateLabelSize(body);
      if (!labelSizeResult.ok) {
        sendJson(response, 400, { ok: false, error: labelSizeResult.error });
        return;
      }

      try {
        const command = buildTsplTestLabel(
          labelSizeResult.labelWidthMm,
          labelSizeResult.labelHeightMm,
        );
        await sendTcpPayload(targetResult.host, targetResult.port, command);
        sendJson(response, 200, { ok: true });
      } catch (error) {
        sendJson(response, 200, {
          ok: false,
          error: `Print failed: ${error.message}`,
        });
      }
      return;
    }

    if (request.method === "POST" && request.url === "/test-connection") {
      const body = await readJsonBody(request);
      const targetResult = validatePrinterTarget(body);

      if (!targetResult.ok) {
        sendJson(response, 400, { ok: false, error: targetResult.error });
        return;
      }

      try {
        await checkTcpConnection(targetResult.host, targetResult.port);
        sendJson(response, 200, {
          ok: true,
          host: targetResult.host,
          port: targetResult.port,
        });
      } catch (error) {
        sendJson(response, 200, {
          ok: false,
          host: targetResult.host,
          port: targetResult.port,
          error: "Offline / connection failed.",
          detail: error.message,
        });
      }
      return;
    }

    sendJson(response, 404, { ok: false, error: "Not found." });
  } catch (error) {
    const isRequestError = error.statusCode && error.statusCode < 500;
    sendJson(response, error.statusCode || 500, {
      ok: false,
      error: isRequestError ? error.message : "Internal agent error.",
    });
  }
});

server.listen(agentPort, agentHost, () => {
  console.log(
    `SteriSphere Local Print Agent listening on http://${agentHost}:${agentPort}`,
  );
});

function sendJson(response, statusCode, payload) {
  const body = JSON.stringify(payload);

  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
    "cache-control": "no-store",
  });
  response.end(body);
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    let rawBody = "";

    request.setEncoding("utf8");

    request.on("data", (chunk) => {
      rawBody += chunk;

      if (Buffer.byteLength(rawBody) > MAX_BODY_BYTES) {
        reject(createHttpError(413, "Request body is too large."));
        request.destroy();
      }
    });

    request.on("end", () => {
      if (!rawBody.trim()) {
        reject(createHttpError(400, "Request body is required."));
        return;
      }

      try {
        resolve(JSON.parse(rawBody));
      } catch {
        reject(createHttpError(400, "Invalid JSON request body."));
      }
    });

    request.on("error", () => {
      reject(createHttpError(400, "Error reading request body."));
    });
  });
}

function validatePrinterTarget(body) {
  const hostResult = validateHost(body.host);
  if (!hostResult.ok) {
    return hostResult;
  }

  const portResult = validatePrinterPort(body.port);
  if (!portResult.ok) {
    return portResult;
  }

  return { ok: true, host: hostResult.host, port: portResult.port };
}

function validateHost(value) {
  if (typeof value !== "string") {
    return { ok: false, error: "Printer host is required." };
  }

  const host = value.trim();

  if (!host) {
    return { ok: false, error: "Printer host is required." };
  }

  if (host.length > 253) {
    return { ok: false, error: "Printer host is too long." };
  }

  if (/[/?#@\\\s]/.test(host)) {
    return { ok: false, error: "Printer host contains invalid characters." };
  }

  const unwrappedHost =
    host.startsWith("[") && host.endsWith("]") ? host.slice(1, -1) : host;

  if (net.isIP(unwrappedHost)) {
    return { ok: true, host: unwrappedHost };
  }

  if (isValidHostname(host)) {
    return { ok: true, host };
  }

  return { ok: false, error: "Enter a valid printer IP or hostname." };
}

function validatePrinterPort(value) {
  const port = parsePort(value);

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return { ok: false, error: "Enter a valid printer port from 1 to 65535." };
  }

  return { ok: true, port };
}

function validateLabelSize(body) {
  const widthResult = validateLabelDimension(body.labelWidthMm, "Label width");
  if (!widthResult.ok) {
    return widthResult;
  }

  const heightResult = validateLabelDimension(body.labelHeightMm, "Label height");
  if (!heightResult.ok) {
    return heightResult;
  }

  return {
    ok: true,
    labelWidthMm: widthResult.dimensionMm,
    labelHeightMm: heightResult.dimensionMm,
  };
}

function validateLabelDimension(value, label) {
  const dimensionMm = typeof value === "number" ? value : Number(value);

  if (!Number.isFinite(dimensionMm) || dimensionMm <= 0) {
    return { ok: false, error: `${label} must be a positive number.` };
  }

  if (dimensionMm < 10 || dimensionMm > 150) {
    return { ok: false, error: `${label} must be between 10 and 150 mm.` };
  }

  return { ok: true, dimensionMm };
}

function validatePackLabelTemplate(value) {
  if (value === undefined || value === null || value === "") {
    return { ok: true, template: DEFAULT_PACK_LABEL_TEMPLATE };
  }

  if (typeof value !== "string") {
    return { ok: false, error: "Template must be a string." };
  }

  const template = value.trim();

  if (SUPPORTED_PACK_LABEL_TEMPLATES[template]) {
    return { ok: true, template };
  }

  return {
    ok: false,
    error: `Unsupported template. Use ${DEFAULT_PACK_LABEL_TEMPLATE}. Future planned templates: ${FUTURE_PACK_LABEL_TEMPLATES.join(", ")}.`,
  };
}

function validatePackLabelPayload(body) {
  const packNumberResult = validateRequiredLabelText(
    body.packNumber,
    "Pack number",
    32,
  );
  if (!packNumberResult.ok) {
    return packNumberResult;
  }

  const cycleNumberResult = validateRequiredLabelText(
    body.cycleNumber,
    "Cycle number",
    32,
  );
  if (!cycleNumberResult.ok) {
    return cycleNumberResult;
  }

  const expiresAtResult = validateExpiryDate(body.expiresAt);
  if (!expiresAtResult.ok) {
    return expiresAtResult;
  }

  const qrValueResult = validateRequiredLabelText(body.qrValue, "QR value", 256);
  if (!qrValueResult.ok) {
    return qrValueResult;
  }

  const displayNameResult = validateOptionalLabelText(
    body.displayName,
    "Display name",
    32,
  );
  if (!displayNameResult.ok) {
    return displayNameResult;
  }

  return {
    ok: true,
    displayName: displayNameResult.value || packNumberResult.value,
    packNumber: packNumberResult.value,
    cycleNumber: cycleNumberResult.value,
    expiresAt: expiresAtResult.value,
    qrValue: qrValueResult.value,
  };
}

function validateRequiredLabelText(value, label, maxLength) {
  if (typeof value !== "string") {
    return { ok: false, error: `${label} is required.` };
  }

  const sanitized = sanitizeTsplText(value, maxLength);

  if (!sanitized) {
    return { ok: false, error: `${label} is required.` };
  }

  return { ok: true, value: sanitized };
}

function validateOptionalLabelText(value, label, maxLength) {
  if (value === undefined || value === null || value === "") {
    return { ok: true, value: "" };
  }

  if (typeof value !== "string") {
    return { ok: false, error: `${label} must be a string.` };
  }

  return { ok: true, value: sanitizeTsplText(value, maxLength) };
}

function validateExpiryDate(value) {
  if (typeof value !== "string") {
    return { ok: false, error: "Expiry date is required." };
  }

  const trimmed = value.trim();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return { ok: false, error: "Expiry date must use YYYY-MM-DD format." };
  }

  const parsed = new Date(`${trimmed}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== trimmed) {
    return { ok: false, error: "Expiry date must be a valid calendar date." };
  }

  return { ok: true, value: trimmed };
}

function sanitizeTsplText(value, maxLength) {
  return value
    .trim()
    .replace(/[\r\n\t]/g, " ")
    .replace(/[^\x20-\x7E]/g, "")
    .replace(/["\\]/g, "'")
    .replace(/\s+/g, " ")
    .slice(0, maxLength)
    .trim();
}

function parsePort(value, fallback) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  const port = typeof value === "number" ? value : Number(value);
  return Number.isInteger(port) ? port : NaN;
}

function isValidHostname(host) {
  const labels = host.split(".");

  return labels.every((label) => {
    return (
      label.length > 0 &&
      label.length <= 63 &&
      /^[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?$/.test(label)
    );
  });
}

function buildTsplTestLabel(labelWidthMm, labelHeightMm) {
  const widthDots = mmToDots(labelWidthMm);
  const heightDots = mmToDots(labelHeightMm);
  const borderInset = 12;
  const left = 34;

  return [
    `SIZE ${labelWidthMm} mm,${labelHeightMm} mm`,
    "GAP 2 mm,0 mm",
    "DIRECTION 1",
    "REFERENCE 0,0",
    "OFFSET 0 mm",
    "SET PEEL OFF",
    "SET CUTTER OFF",
    "SET PARTIAL_CUTTER OFF",
    "CLS",
    `BOX ${borderInset},${borderInset},${widthDots - borderInset},${heightDots - borderInset},2`,
    `TEXT ${left},46,"3",0,1,1,"STERISPHERE"`,
    `TEXT ${left},104,"2",0,1,1,"Printer Test"`,
    `TEXT ${left},150,"2",0,1,1,"Connection OK"`,
    "PRINT 1,1",
    "",
  ].join("\r\n");
}

function buildTsplPackLabel(template, labelData) {
  const renderer = SUPPORTED_PACK_LABEL_TEMPLATES[template];

  if (!renderer) {
    throw new Error(`Unsupported template: ${template}`);
  }

  return renderer(labelData);
}

function buildSterisphereStandardPackLabel({
  labelWidthMm,
  labelHeightMm,
  displayName,
  packNumber,
  cycleNumber,
  expiresAt,
  qrValue,
}) {
  // Physical-printer calibration values for 50x30 mm Zywell TSPL labels.
  const leftMargin = 38;
  const topMargin = 34;
  const qrModuleSize = 5;
  const qrX = leftMargin;
  const qrY = topMargin + 14;
  const textBlockX = 176;
  const rowSpacing = 22;
  const nameY = topMargin;
  const expiryLabelY = nameY + rowSpacing + 18;
  const expiryValueY = expiryLabelY + rowSpacing;
  const packY = expiryValueY + rowSpacing + 26;
  const cycleY = packY + rowSpacing + 4;
  const name = fitTsplText(displayName, 18);
  const pack = fitTsplText(packNumber, 22);
  const cycle = fitTsplText(cycleNumber, 22);

  return [
    `SIZE ${labelWidthMm} mm,${labelHeightMm} mm`,
    "GAP 2 mm,0 mm",
    "DIRECTION 1",
    "REFERENCE 0,0",
    "OFFSET 0 mm",
    "SET PEEL OFF",
    "SET CUTTER OFF",
    "SET PARTIAL_CUTTER OFF",
    "CLS",
    `QRCODE ${qrX},${qrY},M,${qrModuleSize},A,0,"${qrValue}"`,
    `TEXT ${textBlockX},${nameY},"2",0,1,1,"${name}"`,
    `TEXT ${textBlockX},${expiryLabelY},"1",0,1,1,"EXPIRY"`,
    `TEXT ${textBlockX},${expiryValueY},"2",0,1,1,"${expiresAt}"`,
    `TEXT ${textBlockX},${packY},"1",0,1,1,"PACK ${pack}"`,
    `TEXT ${textBlockX},${cycleY},"1",0,1,1,"CYCLE ${cycle}"`,
    "PRINT 1,1",
    "",
  ].join("\r\n");
}

function fitTsplText(value, maxLength) {
  const text = sanitizeTsplText(value, maxLength);

  if (text.length <= maxLength) {
    return text;
  }

  return text.slice(0, maxLength).trim();
}

function mmToDots(value) {
  return Math.round(value * 8);
}

function checkTcpConnection(host, port) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host, port });

    function cleanup() {
      socket.removeAllListeners();
      socket.destroy();
    }

    socket.setTimeout(CONNECTION_TIMEOUT_MS);

    socket.once("connect", () => {
      cleanup();
      resolve();
    });

    socket.once("timeout", () => {
      cleanup();
      reject(new Error("Connection timed out."));
    });

    socket.once("error", (error) => {
      cleanup();
      reject(error);
    });
  });
}

function sendTcpPayload(host, port, payload) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host, port });
    let settled = false;

    function settle(error) {
      if (settled) {
        return;
      }

      settled = true;
      socket.removeAllListeners();
      socket.destroy();

      if (error) {
        reject(error);
      } else {
        resolve();
      }
    }

    socket.setTimeout(CONNECTION_TIMEOUT_MS);

    socket.once("connect", () => {
      if (Buffer.isBuffer(payload)) {
        socket.write(payload, () => {
          socket.end();
        });
        return;
      }

      socket.write(payload, "ascii", () => {
        socket.end();
      });
    });

    socket.once("close", (hadError) => {
      if (!hadError) {
        settle();
      }
    });

    socket.once("timeout", () => {
      settle(new Error("Connection timed out."));
    });

    socket.once("error", (error) => {
      settle(error);
    });
  });
}

function createHttpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}
