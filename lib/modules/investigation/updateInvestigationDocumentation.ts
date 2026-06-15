import { supabase } from "@/lib/supabase";
import { createAuditLog } from "@/lib/audit";

type InvestigationDocumentation = {
  rootCause: string;
  preventiveAction: string;
  correctiveAction: string;
  checklist: Record<string, boolean>;
};

export async function updateInvestigationDocumentation(
  cycleId: string,
  documentation: InvestigationDocumentation,
  auditContext: {
    cycleNumber: string;
    previousStatus: string;
    newStatus: string;
  }
) {
  const { data, error } = await supabase
    .from("cycles")
    .update({
      investigation_root_cause: documentation.rootCause,
      investigation_preventive_action: documentation.preventiveAction,
      investigation_corrective_action: documentation.correctiveAction,
      investigation_checklist: documentation.checklist,
    })
    .eq("id", cycleId)
    .select(
      "investigation_root_cause, investigation_preventive_action, investigation_corrective_action, investigation_checklist"
    )
    .single<{
      investigation_root_cause: string | null;
      investigation_preventive_action: string | null;
      investigation_corrective_action: string | null;
      investigation_checklist: Record<string, boolean> | null;
    }>();

  if (error) {
    throw error;
  }

  await createAuditLog({
    action: "Investigation Record Updated",
    entityType: "cycle",
    entityId: cycleId,
    description: `Investigation record updated for cycle ${auditContext.cycleNumber}`,
    metadata: {
      cycle_id: cycleId,
      cycle_number: auditContext.cycleNumber,
      previous_status: auditContext.previousStatus,
      new_status: auditContext.newStatus,
    },
  });

  return data;
}
