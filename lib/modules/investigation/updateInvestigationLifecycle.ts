import { supabase } from "@/lib/supabase";

export type InvestigationLifecycleStatus = "Open" | "In Review" | "Closed";

export async function updateInvestigationLifecycle(
  cycleId: string,
  investigationStatus: InvestigationLifecycleStatus
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

  return data;
}
