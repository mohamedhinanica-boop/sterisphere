import { createHash, timingSafeEqual } from "node:crypto";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";

const MAX_METADATA_BYTES = 8192;

type HeartbeatRequest = {
  agent_key?: unknown;
  agent_version?: unknown;
  host_name?: unknown;
  ip_address?: unknown;
  platform?: unknown;
  operating_system?: unknown;
  metadata?: unknown;
};

export async function POST(request: Request) {
  // Temporary Phase 7.7A bridge. Secure registration will replace this shared
  // development secret with a unique, rotatable credential for each agent.
  const configuredSecret = process.env.CLINIC_AGENT_HEARTBEAT_SECRET;
  const providedSecret = getBearerToken(request.headers.get("authorization"));

  if (
    !configuredSecret ||
    !providedSecret ||
    !secretsMatch(providedSecret, configuredSecret)
  ) {
    return noStoreJson({ ok: false, error: "Unauthorized." }, 401);
  }

  let body: HeartbeatRequest;

  try {
    body = (await request.json()) as HeartbeatRequest;
  } catch {
    return noStoreJson({ ok: false, error: "Invalid request body." }, 400);
  }

  const validation = validateHeartbeat(body);
  if (!validation.ok) {
    return noStoreJson({ ok: false, error: validation.error }, 400);
  }

  const { data: agent, error: lookupError } = await supabase
    .from("clinical_agents")
    .select("id, agent_key, status")
    .eq("agent_key", validation.value.agent_key)
    .maybeSingle();

  if (lookupError) {
    console.error("Clinic Agent heartbeat lookup failed:", lookupError.message);
    return noStoreJson(
      { ok: false, error: "Unable to process heartbeat." },
      500,
    );
  }

  if (!agent) {
    return noStoreJson({ ok: false, error: "Agent not found." }, 404);
  }

  if (agent.status === "retired" || agent.status === "revoked") {
    return noStoreJson(
      { ok: false, error: "Agent is not allowed to send heartbeats." },
      403,
    );
  }

  const lastSeenAt = new Date().toISOString();
  const { data: updatedAgent, error: updateError } = await supabase
    .from("clinical_agents")
    .update({
      agent_version: validation.value.agent_version,
      host_name: validation.value.host_name,
      ip_address: validation.value.ip_address,
      platform: validation.value.platform,
      operating_system: validation.value.operating_system,
      metadata: validation.value.metadata,
      status: "online",
      last_seen_at: lastSeenAt,
      updated_at: lastSeenAt,
    })
    .eq("id", agent.id)
    .select("agent_key, status, last_seen_at")
    .single();

  if (updateError) {
    console.error("Clinic Agent heartbeat update failed:", updateError.message);
    return noStoreJson(
      { ok: false, error: "Unable to save heartbeat." },
      500,
    );
  }

  return noStoreJson({
    ok: true,
    agent_key: updatedAgent.agent_key,
    status: updatedAgent.status,
    last_seen_at: updatedAgent.last_seen_at,
  });
}

function validateHeartbeat(body: HeartbeatRequest):
  | {
      ok: true;
      value: {
        agent_key: string;
        agent_version: string;
        host_name: string;
        ip_address: string | null;
        platform: string;
        operating_system: string;
        metadata: Record<string, unknown>;
      };
    }
  | { ok: false; error: string } {
  const agentKey = validateRequiredString(body.agent_key, "agent_key", 128);
  if (!agentKey.ok) return agentKey;

  const agentVersion = validateRequiredString(
    body.agent_version,
    "agent_version",
    64,
  );
  if (!agentVersion.ok) return agentVersion;

  const hostName = validateRequiredString(body.host_name, "host_name", 255);
  if (!hostName.ok) return hostName;

  const ipAddress = validateOptionalString(body.ip_address, "ip_address", 64);
  if (!ipAddress.ok) return ipAddress;

  const platform = validateRequiredString(body.platform, "platform", 64);
  if (!platform.ok) return platform;

  const operatingSystem = validateRequiredString(
    body.operating_system,
    "operating_system",
    255,
  );
  if (!operatingSystem.ok) return operatingSystem;

  const metadata = validateMetadata(body.metadata);
  if (!metadata.ok) return metadata;

  return {
    ok: true,
    value: {
      agent_key: agentKey.value,
      agent_version: agentVersion.value,
      host_name: hostName.value,
      ip_address: ipAddress.value,
      platform: platform.value,
      operating_system: operatingSystem.value,
      metadata: metadata.value,
    },
  };
}

function validateRequiredString(
  value: unknown,
  field: string,
  maxLength: number,
):
  | { ok: true; value: string }
  | { ok: false; error: string } {
  if (typeof value !== "string" || !value.trim()) {
    return { ok: false, error: `${field} is required.` };
  }

  const normalized = value.trim();
  if (normalized.length > maxLength) {
    return { ok: false, error: `${field} is too long.` };
  }

  return { ok: true, value: normalized };
}

function validateOptionalString(
  value: unknown,
  field: string,
  maxLength: number,
):
  | { ok: true; value: string | null }
  | { ok: false; error: string } {
  if (value === undefined || value === null || value === "") {
    return { ok: true, value: null };
  }

  if (typeof value !== "string") {
    return { ok: false, error: `${field} must be a string.` };
  }

  const normalized = value.trim();
  if (normalized.length > maxLength) {
    return { ok: false, error: `${field} is too long.` };
  }

  return { ok: true, value: normalized || null };
}

function validateMetadata(
  value: unknown,
):
  | { ok: true; value: Record<string, unknown> }
  | { ok: false; error: string } {
  if (value === undefined || value === null) {
    return { ok: true, value: {} };
  }

  if (typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, error: "metadata must be a JSON object." };
  }

  try {
    if (Buffer.byteLength(JSON.stringify(value)) > MAX_METADATA_BYTES) {
      return { ok: false, error: "metadata is too large." };
    }
  } catch {
    return { ok: false, error: "metadata must be valid JSON." };
  }

  return { ok: true, value: value as Record<string, unknown> };
}

function getBearerToken(authorization: string | null) {
  if (!authorization) {
    return null;
  }

  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

function secretsMatch(provided: string, expected: string) {
  const providedDigest = createHash("sha256").update(provided).digest();
  const expectedDigest = createHash("sha256").update(expected).digest();
  return timingSafeEqual(providedDigest, expectedDigest);
}

function noStoreJson(payload: unknown, status = 200) {
  return Response.json(payload, {
    status,
    headers: { "cache-control": "no-store" },
  });
}

