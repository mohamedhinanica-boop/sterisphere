import { supabase } from "@/lib/supabase";

export async function markCycleAsReviewed(cycleId: string) {
  const reviewedAt = new Date().toISOString();

  const { error } = await supabase
    .from("cycles")
    .update({ reviewed_at: reviewedAt })
    .eq("id", cycleId)
    .is("reviewed_at", null);

  if (error) {
    throw error;
  }

  return reviewedAt;
}
