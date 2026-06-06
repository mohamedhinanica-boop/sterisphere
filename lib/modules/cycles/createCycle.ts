import { supabase } from "@/lib/supabase";
import { createAuditLog } from "@/lib/audit";
import type { CreateCycleInput, CreateCycleResult } from "./types";
import {
  buildLoadSummary,
  calculateExpectedPackCount,
  getCurrentUserEmail,
} from "./utils";

export async function createCycle(
  input: CreateCycleInput
): Promise<CreateCycleResult> {
  const durationMinutes = Number(input.durationMinutes);
  const sterilizer = input.sterilizer.trim();

  if (!sterilizer) {
    throw new Error("Please select a sterilizer.");
  }

  if (!Number.isInteger(durationMinutes) || durationMinutes <= 0) {
    throw new Error("Please enter a valid cycle duration.");
  }

  if (input.loadItems.length === 0) {
    throw new Error("Please add at least one load item.");
  }

  for (const item of input.loadItems) {
    const quantity = Number(item.quantity);

    if (!item.packType || !Number.isInteger(quantity) || quantity <= 0) {
      throw new Error("Each load item must have a valid pack type and quantity.");
    }
  }

  const expectedPackCount = calculateExpectedPackCount(input.loadItems);

  if (expectedPackCount <= 0) {
    throw new Error("Expected pack count must be greater than zero.");
  }

  const newCycleNumber = `STERI-${new Date().getFullYear()}-${String(
    input.cycleCounter
  ).padStart(4, "0")}`;

  const operatorEmail = await getCurrentUserEmail();
  const loadSummary = buildLoadSummary(input.loadItems, input.loadNotes);

  const expectedFinish = new Date();
  expectedFinish.setMinutes(expectedFinish.getMinutes() + durationMinutes);

  const { data: newCycle, error: cycleError } = await supabase
    .from("cycles")
    .insert([
      {
        cycle_number: newCycleNumber,
        sterilizer,
        operator: operatorEmail,
        load_contents: loadSummary,
        duration_minutes: durationMinutes,
        expected_finish_at: expectedFinish.toISOString(),
        status: "Pending",
        cycle_state: "Open",
        expected_pack_count: expectedPackCount,
        created_by: operatorEmail,
      },
    ])
    .select()
    .single();

  if (cycleError || !newCycle) {
    throw cycleError || new Error("Error starting cycle.");
  }

  const loadRows = input.loadItems.map((item) => ({
    cycle_id: newCycle.id,
    pack_type: item.packType,
    quantity: Number(item.quantity),
  }));

  const { error: loadItemsError } = await supabase
    .from("load_items")
    .insert(loadRows);

  if (loadItemsError) {
    await supabase.from("cycles").delete().eq("id", newCycle.id);
    throw loadItemsError;
  }

  await createAuditLog({
    action: "cycle_started",
    entityType: "cycle",
    entityId: newCycle.id,
    description: `Started sterilization cycle ${newCycle.cycle_number}`,
    metadata: {
      cycle_number: newCycle.cycle_number,
      sterilizer: newCycle.sterilizer,
      operator: newCycle.operator,
      status: newCycle.status,
      cycle_state: newCycle.cycle_state,
      expected_pack_count: newCycle.expected_pack_count,
      duration_minutes: durationMinutes,
      expected_finish_at: expectedFinish.toISOString(),
      load_items: loadRows,
    },
  });

  return { cycle: newCycle };
}
