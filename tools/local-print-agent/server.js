"use strict";

const fs = require("node:fs");
const http = require("node:http");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");

loadEnvironmentFile();

const DEFAULT_HOST = "0.0.0.0";
const DEFAULT_PORT = 8787;
const DEFAULT_AGENT_VERSION = "0.1.0";
const DEFAULT_HEARTBEAT_INTERVAL_SECONDS = 30;
const HEARTBEAT_TIMEOUT_MS = 10000;
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
const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "Content-Type",
};

const agentHost = process.env.AGENT_HOST || DEFAULT_HOST;
const agentPort = parsePort(process.env.AGENT_PORT, DEFAULT_PORT);

const server = http.createServer(async (request, response) => {
  try {
    if (request.method === "OPTIONS") {
      sendNoContent(response);
      return;
    }

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
  logStartupUrls(agentHost, agentPort);
  startHeartbeatLoop();
});

function loadEnvironmentFile() {
  const envPath = path.join(__dirname, ".env");
  let contents;

  try {
    contents = fs.readFileSync(envPath, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") {
      console.log("[env] No .env file found; using operating system settings.");
    } else {
      console.warn(`[env] Could not read .env; continuing: ${error.message}`);
    }
    return;
  }

  let loadedCount = 0;

  for (const [index, rawLine] of contents.split(/\r?\n/).entries()) {
    const line = rawLine.replace(/^\uFEFF/, "").trim();

    if (!line || line.startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf("=");
    if (separatorIndex <= 0) {
      console.warn(`[env] Ignored malformed .env line ${index + 1}.`);
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    const parsedValue = parseEnvironmentValue(
      line.slice(separatorIndex + 1).trim(),
    );

    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key) || !parsedValue.ok) {
      console.warn(`[env] Ignored malformed .env line ${index + 1}.`);
      continue;
    }

    if (process.env[key] === undefined) {
      process.env[key] = parsedValue.value;
      loadedCount += 1;
    }
  }

  console.log(`[env] Loaded ${loadedCount} setting(s) from .env.`);
}

function parseEnvironmentValue(value) {
  if (!value) {
    return { ok: true, value: "" };
  }

  const quote = value[0];
  if (quote !== '"' && quote !== "'") {
    return { ok: true, value };
  }

  if (value.length < 2 || value[value.length - 1] !== quote) {
    return { ok: false };
  }

  return { ok: true, value: value.slice(1, -1) };
}

function sendJson(response, statusCode, payload) {
  const body = JSON.stringify(payload);

  response.writeHead(statusCode, {
    ...CORS_HEADERS,
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
    "cache-control": "no-store",
  });
  response.end(body);
}

function sendNoContent(response) {
  response.writeHead(204, {
    ...CORS_HEADERS,
    "cache-control": "no-store",
  });
  response.end();
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

function logStartupUrls(host, port) {
  const lanUrls = getLanUrls(port);
  const hostUrl = host === "0.0.0.0" ? null : `http://${host}:${port}`;

  console.log("SteriSphere Print Agent is running. Do not close this window.");
  console.log(`Listening on host ${host}, port ${port}.`);
  console.log(`Local URL: http://localhost:${port}`);

  if (hostUrl && hostUrl !== `http://127.0.0.1:${port}`) {
    console.log(`Configured host URL: ${hostUrl}`);
  }

  if (lanUrls.length > 0) {
    console.log("LAN URL(s):");
    for (const url of lanUrls) {
      console.log(`  ${url}`);
    }
  } else {
    console.log("LAN URL: not detected. Run ipconfig to find this PC's IPv4 address.");
  }
}

function getLanUrls(port) {
  return getLanIpv4Addresses().map(
    (address) => `http://${address}:${port}`,
  );
}

function getLanIpv4Addresses() {
  const interfaces = os.networkInterfaces();
  const addresses = [];

  for (const interfaceAddresses of Object.values(interfaces)) {
    for (const address of interfaceAddresses || []) {
      if (address.family !== "IPv4" || address.internal) {
        continue;
      }

      addresses.push(address.address);
    }
  }

  return addresses;
}

function startHeartbeatLoop() {
  const configResult = getHeartbeatConfig();

  if (!configResult.ok) {
    console.log(`[heartbeat] Disabled: ${configResult.reason}`);
    return;
  }

  if (typeof fetch !== "function") {
    console.log("[heartbeat] Disabled: Node.js 18 or newer is required.");
    return;
  }

  const config = configResult.config;
  let heartbeatInFlight = false;

  async function runHeartbeat() {
    if (heartbeatInFlight) {
      console.log("[heartbeat] Skipped: previous request is still running.");
      return;
    }

    heartbeatInFlight = true;
    try {
      await sendHeartbeat(config);
    } catch (error) {
      console.error(`[heartbeat] Failed: ${error.message}`);
    } finally {
      heartbeatInFlight = false;
    }
  }

  console.log(
    `[heartbeat] Enabled: ${config.endpoint} every ${config.intervalSeconds}s.`,
  );
  void runHeartbeat();

  const timer = setInterval(
    () => void runHeartbeat(),
    config.intervalSeconds * 1000,
  );
  timer.unref();
}

function getHeartbeatConfig() {
  const cloudUrl = normalizeCloudUrl(process.env.STERISPHERE_CLOUD_URL);
  const agentKey = normalizeEnvironmentValue(process.env.STERISPHERE_AGENT_KEY);
  const heartbeatSecret = normalizeEnvironmentValue(
    process.env.STERISPHERE_AGENT_HEARTBEAT_SECRET,
  );

  if (!cloudUrl) {
    return { ok: false, reason: "STERISPHERE_CLOUD_URL is not configured." };
  }

  if (!agentKey) {
    return { ok: false, reason: "STERISPHERE_AGENT_KEY is not configured." };
  }

  if (!heartbeatSecret) {
    return {
      ok: false,
      reason: "STERISPHERE_AGENT_HEARTBEAT_SECRET is not configured.",
    };
  }

  const intervalSeconds = parseHeartbeatInterval(
    process.env.STERISPHERE_HEARTBEAT_INTERVAL_SECONDS,
  );

  return {
    ok: true,
    config: {
      endpoint: new URL("/api/clinic-agents/heartbeat", cloudUrl).toString(),
      agentKey,
      agentVersion:
        normalizeEnvironmentValue(process.env.STERISPHERE_AGENT_VERSION) ||
        DEFAULT_AGENT_VERSION,
      heartbeatSecret,
      intervalSeconds,
    },
  };
}

async function sendHeartbeat(config) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), HEARTBEAT_TIMEOUT_MS);

  try {
    const response = await fetch(config.endpoint, {
      method: "POST",
      headers: {
        authorization: `Bearer ${config.heartbeatSecret}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        agent_key: config.agentKey,
        agent_version: config.agentVersion,
        host_name: os.hostname(),
        ip_address: getLanIpv4Addresses()[0] || null,
        platform: `${os.platform()}-${os.arch()}`,
        operating_system: `${os.type()} ${os.release()}`,
        metadata: {
          node_version: process.version,
          service: "sterisphere-local-print-agent",
        },
      }),
      signal: controller.signal,
    });

    const result = await readHeartbeatResponse(response);
    if (!response.ok || !result.ok) {
      throw new Error(
        `cloud returned ${response.status}${result.error ? `: ${result.error}` : ""}`,
      );
    }

    console.log(
      `[heartbeat] Success: ${result.status || "online"} at ${result.last_seen_at || new Date().toISOString()}.`,
    );
  } finally {
    clearTimeout(timeout);
  }
}

async function readHeartbeatResponse(response) {
  try {
    const result = await response.json();
    return {
      ok: result?.ok === true,
      status: typeof result?.status === "string" ? result.status : null,
      last_seen_at:
        typeof result?.last_seen_at === "string" ? result.last_seen_at : null,
      error: typeof result?.error === "string" ? result.error : null,
    };
  } catch {
    return { ok: false, status: null, last_seen_at: null, error: null };
  }
}

function normalizeCloudUrl(value) {
  const normalized = normalizeEnvironmentValue(value);
  if (!normalized) {
    return null;
  }

  try {
    const url = new URL(normalized);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }

    return url;
  } catch {
    return null;
  }
}

function normalizeEnvironmentValue(value) {
  return typeof value === "string" ? value.trim() : "";
}

function parseHeartbeatInterval(value) {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < 5 || parsed > 3600) {
    return DEFAULT_HEARTBEAT_INTERVAL_SECONDS;
  }

  return parsed;
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
