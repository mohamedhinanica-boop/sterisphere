import type { ValidatedPack } from "./types";

export async function validatePackUsage(
  supabase: any,
  packNumber: string
): Promise<ValidatedPack> {
  const now = new Date().toISOString();

  const { data: pack, error: packError } = await supabase
    .from("packs")
    .select("id, pack_number, cycle_number, status, expires_at")
    .eq("pack_number", packNumber)
    .maybeSingle();

  if (packError || !pack) {
    throw new Error("Pack could not be validated.");
  }

  if (pack.status !== "Available") {
    throw new Error("This pack is no longer available.");
  }

  if (!pack.expires_at || pack.expires_at < now) {
    throw new Error("This pack is expired and cannot be used.");
  }

  const { data: cycle, error: cycleError } = await supabase
    .from("cycles")
    .select("status")
    .eq("cycle_number", pack.cycle_number)
    .maybeSingle();

  if (cycleError || !cycle) {
    throw new Error("Cycle could not be validated.");
  }

  if (cycle.status !== "Passed") {
    throw new Error("Only packs from Passed cycles can be used.");
  }

  const { data: existingTrace, error: traceError } = await supabase
    .from("patient_traces")
    .select("id")
    .eq("pack_number", packNumber)
    .maybeSingle();

  if (traceError) {
    throw new Error("Pack usage history could not be validated.");
  }

  if (existingTrace) {
    throw new Error("This pack is already linked to a patient.");
  }

  return pack;
}
