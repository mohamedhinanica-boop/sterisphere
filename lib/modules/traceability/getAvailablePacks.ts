import type { CycleStatus, Pack } from "./types";

export async function getAvailablePacks(supabase: any): Promise<Pack[]> {
  const now = new Date().toISOString();

  const { data: packData, error: packError } = await supabase
    .from("packs")
    .select("id, pack_number, cycle_number, pack_type, status, expires_at")
    .eq("status", "Available")
    .gte("expires_at", now)
    .order("created_at", { ascending: false });

  if (packError) {
    throw packError;
  }

  if (!packData || packData.length === 0) {
    return [];
  }

  const cycleNumbers = Array.from(
    new Set(packData.map((pack: Pack) => pack.cycle_number))
  );

  const { data: cycleData, error: cycleError } = await supabase
    .from("cycles")
    .select("cycle_number, status")
    .in("cycle_number", cycleNumbers);

  if (cycleError) {
    throw cycleError;
  }

  const passedCycleNumbers = new Set(
    (cycleData || [])
      .filter((cycle: CycleStatus) => cycle.status === "Passed")
      .map((cycle: CycleStatus) => cycle.cycle_number)
  );

  return packData.filter((pack: Pack) => passedCycleNumbers.has(pack.cycle_number));
}
