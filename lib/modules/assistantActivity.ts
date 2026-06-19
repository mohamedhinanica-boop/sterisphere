import { supabase } from "@/lib/supabase";

type AuditMetadata = Record<string, unknown> | null;

type ActivityAuditLog = {
  id: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  description: string | null;
  user_email: string | null;
  metadata: AuditMetadata;
  created_at: string;
};

export type ActivityVariant = "success" | "warning" | "critical" | "neutral";

export type AssistantActivityItem = {
  id: string;
  time: string;
  title: string;
  entityLabel: string;
  detail: string;
  variant: ActivityVariant;
  userEmail: string | null;
  createdAt: string;
};

export async function loadAssistantActivity(limit = 8) {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const { data, error } = await supabase
    .from("audit_logs")
    .select("id, action, entity_type, entity_id, description, user_email, metadata, created_at")
    .gte("created_at", todayStart.toISOString())
    .order("created_at", { ascending: false })
    .limit(limit)
    .returns<ActivityAuditLog[]>();

  if (error) {
    throw error;
  }

  return (data || []).map(mapAuditLogToActivity);
}

export function mapAuditLogToActivity(log: ActivityAuditLog): AssistantActivityItem {
  const title = getActivityTitle(log);
  const entityLabel = getActivityEntityLabel(log);

  return {
    id: log.id,
    time: formatActivityTime(log.created_at),
    title,
    entityLabel,
    detail: log.description || title,
    variant: getActivityVariant(log),
    userEmail: log.user_email,
    createdAt: log.created_at,
  };
}

export function getActivityVariantClass(variant: ActivityVariant) {
  return {
    success: "border-green-200 bg-green-50 text-green-700",
    warning: "border-yellow-200 bg-yellow-50 text-yellow-800",
    critical: "border-red-200 bg-red-50 text-red-700",
    neutral: "border-slate-200 bg-slate-100 text-slate-700",
  }[variant];
}

function getActivityTitle(log: ActivityAuditLog) {
  const action = log.action.toLowerCase();
  const newStatus = getMetadataString(log.metadata, "new_status").toLowerCase();

  if (action === "cycle_started") return "Cycle started";
  if (action === "cycle_passed") return "Cycle passed";
  if (action === "cycle_status_updated" && newStatus === "failed") {
    return "Cycle failed";
  }
  if (action === "cycle_status_updated") return "Cycle updated";
  if (action === "packs_auto_generated") return "Packs generated";
  if (action === "pack_created") return "Pack created";
  if (action === "label_printed") return "Label printed";
  if (action === "patient_trace_created") return "Patient trace recorded";
  if (action === "pack_marked_used") return "Pack used";
  if (action === "expired_pack_reviewed") return "Expired pack reviewed";
  if (action.includes("investigation")) return "Investigation updated";

  return formatActionLabel(log.action);
}

function getActivityEntityLabel(log: ActivityAuditLog) {
  const cycleNumber = getMetadataString(log.metadata, "cycle_number");
  const packNumber = getMetadataString(log.metadata, "pack_number");
  const patientName = getMetadataString(log.metadata, "patient_name");

  if (cycleNumber) return cycleNumber;
  if (packNumber) return packNumber;
  if (patientName) return patientName;
  if (log.entity_id) return log.entity_id;

  return log.entity_type;
}

function getActivityVariant(log: ActivityAuditLog): ActivityVariant {
  const action = log.action.toLowerCase();
  const newStatus = getMetadataString(log.metadata, "new_status").toLowerCase();

  if (
    action.includes("failed") ||
    newStatus === "failed" ||
    action.includes("investigation") ||
    action.includes("expired")
  ) {
    return "critical";
  }

  if (
    action.includes("passed") ||
    action.includes("created") ||
    action.includes("generated")
  ) {
    return "success";
  }

  if (action.includes("started") || action.includes("updated")) {
    return "warning";
  }

  return "neutral";
}

function getMetadataString(metadata: AuditMetadata, key: string) {
  const value = metadata?.[key];
  return typeof value === "string" ? value : "";
}

function formatActivityTime(value: string) {
  return new Date(value).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatActionLabel(action: string) {
  return action
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}