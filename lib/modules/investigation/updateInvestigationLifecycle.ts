import { supabase } from "@/lib/supabase";
import { createAuditLog } from "@/lib/audit";

export type InvestigationLifecycleStatus = "Open" | "In Review" | "Closed";

type InvestigationLifecycleAuditContext = {
  cycleNumber: string;
  previousStatus: InvestigationLifecycleStatus;
  reopenReason?: string;
};

export async function updateInvestigationLifecycle(
  cycleId: string,
  investigationStatus: InvestigationLifecycleStatus,
  auditContext: InvestigationLifecycleAuditContext
) {
  const closedAt =
    investigationStatus === "Closed" ? new Date().toISOString() : null;

  const { data, error } = await supabase
    .from("cycles")
    .update({
      investigation_status: investigationStatus,
      investigation_closed_at: closedAt,
    })
    .eq("id", cycleId)
    .select("investigation_status, investigation_closed_at")
    .single<{
      investigation_status: InvestigationLifecycleStatus;
      investigation_closed_at: string | null;
    }>();

  if (error) {
    throw error;
  }

  const isReopen =
    auditContext.previousStatus === "Closed" &&
    investigationStatus === "In Review";
  const action = isReopen
    ? "Investigation Reopened"
    : investigationStatus === "Closed"
      ? "Investigation Closed"
      : "Investigation Status Updated";

  await createAuditLog({
    action,
    entityType: "cycle",
    entityId: cycleId,
    description: `${action} for cycle ${auditContext.cycleNumber}`,
    metadata: {
      cycle_id: cycleId,
      cycle_number: auditContext.cycleNumber,
      previous_status: auditContext.previousStatus,
      new_status: investigationStatus,
      ...(auditContext.reopenReason
        ? { reopen_reason: auditContext.reopenReason }
        : {}),
    },
  });

  return data;
}
