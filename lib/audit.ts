import { supabase } from "@/lib/supabase";

type AuditLogInput = {
  action: string;
  entityType: string;
  entityId?: string;
  description?: string;
  metadata?: Record<string, unknown>;
};

export async function createAuditLog({
  action,
  entityType,
  entityId,
  description,
  metadata,
}: AuditLogInput) {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  await supabase.from("audit_logs").insert([
    {
      action,
      entity_type: entityType,
      entity_id: entityId || null,
      description: description || null,
      user_email: user?.email || "unknown",
      metadata: metadata || null,
    },
  ]);
}