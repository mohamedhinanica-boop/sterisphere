import { supabase } from "@/lib/supabase";
import { createAuditLog } from "@/lib/audit";
import type { Cycle, SavedLoadItem } from "./types";
import {
  buildPackGenerationItems,
  getCurrentUserEmail,
  getNextPackNumberSequence,
} from "./utils";

export async function generatePacksForCycle(cycle: Cycle) {
  const { data: existingPacks, error: existingPacksError } = await supabase
    .from("packs")
    .select("id")
    .eq("cycle_id", cycle.id);

  if (existingPacksError) {
    throw existingPacksError;
  }

  if ((existingPacks || []).length > 0) {
    throw new Error("Packs have already been generated for this cycle.");
  }

  const { data: savedLoadItems, error: loadItemsError } = await supabase
    .from("load_items")
    .select("id, cycle_id, pack_type, quantity")
    .eq("cycle_id", cycle.id);

  if (loadItemsError) {
    throw loadItemsError;
  }

  if (!savedLoadItems || savedLoadItems.length === 0) {
    throw new Error("No load composition found for this cycle.");
  }

  const { packItems, cyclePackTotal, cycleLoadSummary } =
    buildPackGenerationItems(savedLoadItems as SavedLoadItem[]);

  if (packItems.length === 0) {
    throw new Error("Load composition does not contain valid quantities.");
  }

  const packNumbers = await getNextPackNumberSequence(packItems.length);
  const createdBy = await getCurrentUserEmail();

  const sterilizedAt = new Date();

  const expiresAt = new Date();
  expiresAt.setFullYear(expiresAt.getFullYear() + 1);

  const packRows = packItems.map((item, index) => ({
    pack_number: packNumbers[index],
    cycle_id: cycle.id,
    cycle_number: cycle.cycle_number,
    pack_type: item.packType,
    contents: item.packType,
    status: "Available",
    created_by: createdBy,
    sterilized_at: sterilizedAt.toISOString(),
    expires_at: expiresAt.toISOString(),
    load_item_index: item.loadItemIndex,
    load_item_total: item.loadItemTotal,
    cycle_pack_total: cyclePackTotal,
    cycle_load_summary: cycleLoadSummary,
  }));

  const { data: createdPacks, error: packsError } = await supabase
    .from("packs")
    .insert(packRows)
    .select();

  if (packsError) {
    throw packsError;
  }

  await createAuditLog({
    action: "packs_auto_generated",
    entityType: "cycle",
    entityId: cycle.id,
    description: `Generated ${packRows.length} packs from cycle ${cycle.cycle_number}`,
    metadata: {
      cycle_number: cycle.cycle_number,
      generated_count: packRows.length,
      cycle_pack_total: cyclePackTotal,
      cycle_load_summary: cycleLoadSummary,
      packs: packRows.map((pack) => ({
        pack_number: pack.pack_number,
        pack_type: pack.pack_type,
      })),
    },
  });

  await Promise.all(
    (createdPacks || []).map((pack) =>
      createAuditLog({
        action: "pack_created",
        entityType: "pack",
        entityId: pack.id,
        description: `Auto-created pack ${pack.pack_number} from cycle ${cycle.cycle_number}`,
        metadata: {
          pack_number: pack.pack_number,
          cycle_number: pack.cycle_number,
          pack_type: pack.pack_type,
          status: pack.status,
          source: "auto_generated_from_passed_cycle",
        },
      })
    )
  );

  return packRows.length;
}
