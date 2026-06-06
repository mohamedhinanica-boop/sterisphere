import { supabase } from "@/lib/supabase";
import type { FailedCycle } from "./types";

export async function getFailedCycles(): Promise<FailedCycle[]> {
  const { data, error } = await supabase
    .from("cycles")
    .select("id, cycle_number, sterilizer, operator, reviewed_at, created_at")
    .eq("status", "Failed")
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  return data || [];
}
