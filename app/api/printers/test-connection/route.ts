import net from "node:net";

export const runtime = "nodejs";

const CONNECTION_TIMEOUT_MS = 2500;

type TestConnectionRequest = {
  host?: unknown;
  port?: unknown;
};

export async function POST(request: Request) {
  let body: TestConnectionRequest;

  try {
    body = (await request.json()) as TestConnectionRequest;
  } catch {
    return Response.json(
      { ok: false, error: "Invalid request body." },
      { status: 400 },
    );
  }

  const hostResult = validateHost(body.host);
  if (!hostResult.ok) {
    return Response.json(
      { ok: false, error: hostResult.error },
      { status: 400 },
    );
  }

  const portResult = validatePort(body.port);
  if (!portResult.ok) {
    return Response.json(
      { ok: false, error: portResult.error },
      { status: 400 },
    );
  }

  try {
    await checkTcpConnection(hostResult.host, portResult.port);
    return Response.json({ ok: true });
  } catch {
    return Response.json(
      { ok: false, error: "Offline / connection failed." },
      { status: 200 },
    );
  }
}

function validateHost(value: unknown):
  | { ok: true; host: string }
  | { ok: false; error: string } {
  if (typeof value !== "string") {
    return { ok: false, error: "Printer IP is required." };
  }

  const host = value.trim();

  if (!host) {
    return { ok: false, error: "Printer IP is required." };
  }

  if (host.length > 253) {
    return { ok: false, error: "Printer IP is too long." };
  }

  if (/[/?#@\\\s]/.test(host)) {
    return { ok: false, error: "Printer IP contains invalid characters." };
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

function validatePort(value: unknown):
  | { ok: true; port: number }
  | { ok: false; error: string } {
  const port = typeof value === "number" ? value : Number(value);

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return { ok: false, error: "Enter a valid printer port from 1 to 65535." };
  }

  return { ok: true, port };
}

function isValidHostname(host: string) {
  const labels = host.split(".");

  return labels.every((label) => {
    return (
      label.length > 0 &&
      label.length <= 63 &&
      /^[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?$/.test(label)
    );
  });
}

function checkTcpConnection(host: string, port: number) {
  return new Promise<void>((resolve, reject) => {
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
