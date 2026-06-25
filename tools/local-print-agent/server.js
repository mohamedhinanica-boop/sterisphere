"use strict";

const http = require("node:http");
const net = require("node:net");

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 8787;
const CONNECTION_TIMEOUT_MS = 2500;
const MAX_BODY_BYTES = 1024;

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
        printingEnabled: false,
      });
      return;
    }

    if (request.method === "POST" && request.url === "/test-connection") {
      const body = await readJsonBody(request);
      const hostResult = validateHost(body.host);
      const portResult = validatePrinterPort(body.port);

      if (!hostResult.ok) {
        sendJson(response, 400, { ok: false, error: hostResult.error });
        return;
      }

      if (!portResult.ok) {
        sendJson(response, 400, { ok: false, error: portResult.error });
        return;
      }

      try {
        await checkTcpConnection(hostResult.host, portResult.port);
        sendJson(response, 200, {
          ok: true,
          host: hostResult.host,
          port: portResult.port,
        });
      } catch (error) {
        sendJson(response, 200, {
          ok: false,
          host: hostResult.host,
          port: portResult.port,
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

function createHttpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}
