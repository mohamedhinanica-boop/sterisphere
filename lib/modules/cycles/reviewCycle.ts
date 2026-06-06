import { supabase } from "@/lib/supabase";
import { createAuditLog } from "@/lib/audit";
import type { Cycle, ReviewCycleResult } from "./types";
import { generatePacksForCycle } from "./generatePacksForCycle";
import { getCurrentUserEmail } from "./utils";

export async function reviewCycle(
  cycle: Cycle,
  newStatus: string
): Promise<ReviewCycleResult> {
  const completedBy = await getCurrentUserEmail();
  const completedAt = new Date().toISOString();

  if (newStatus === "Passed") {
    const generatedPackCount = await generatePacksForCycle(cycle);

    const { error } = await supabase
      .from("cycles")
      .update({
        status: "Passed",
        cycle_state: "Closed",
        expected_pack_count: generatedPackCount,
        released_by: completedBy,
        released_at: completedAt,
      })
      .eq("id", cycle.id);

    if (error) {
      throw error;
    }

    await createAuditLog({
      action: "cycle_passed",
      entityType: "cycle",
      entityId: cycle.id,
      description: `Cycle ${cycle.cycle_number} passed and ${generatedPackCount} packs were generated`,
      metadata: {
        cycle_number: cycle.cycle_number,
        new_status: "Passed",
        cycle_state: "Closed",
        completed_by: completedBy,
        completed_at: completedAt,
        generated_pack_count: generatedPackCount,
      },
    });

    return {
      status: "Passed",
      generatedPackCount,
    };
  }

  const { error } = await supabase
    .from("cycles")
    .update({
      status: newStatus,
      cycle_state: "Closed",
      released_by: completedBy,
      released_at: completedAt,
    })
    .eq("id", cycle.id);

  if (error) {
    throw error;
  }

  await createAuditLog({
    action: "cycle_status_updated",
    entityType: "cycle",
    entityId: cycle.id,
    description: `Cycle status updated to ${newStatus}`,
    metadata: {
      cycle_number: cycle.cycle_number,
      new_status: newStatus,
      cycle_state: "Closed",
      completed_by: completedBy,
      completed_at: completedAt,
    },
  });

  return {
    status: newStatus,
    generatedPackCount: 0,
  };
}
