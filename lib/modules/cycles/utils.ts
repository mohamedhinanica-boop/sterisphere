import { supabase } from "@/lib/supabase";
import type { LoadItem, SavedLoadItem } from "./types";

export function calculateExpectedPackCount(loadItems: LoadItem[]) {
  return loadItems.reduce((total, item) => {
    const quantity = Number(item.quantity);
    return total + (Number.isInteger(quantity) && quantity > 0 ? quantity : 0);
  }, 0);
}

export function buildLoadSummary(loadItems: LoadItem[], loadNotes: string) {
  const composition = loadItems
    .map((item) => `${item.packType} × ${item.quantity}`)
    .join(", ");

  if (loadNotes.trim()) {
    return `${composition}. Notes: ${loadNotes.trim()}`;
  }

  return composition;
}

export async function getCurrentUserEmail() {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return user?.email || "unknown";
}

export async function getNextPackNumberSequence(totalNeeded: number) {
  const currentYear = new Date().getFullYear();
  const prefix = `PACK-${currentYear}-`;

  const { data, error } = await supabase
    .from("packs")
    .select("pack_number")
    .like("pack_number", `${prefix}%`);

  if (error) {
    throw error;
  }

  const maxExistingNumber =
    data?.reduce((max, pack) => {
      const numericPart = Number(pack.pack_number.replace(prefix, ""));
      return Number.isFinite(numericPart) && numericPart > max
        ? numericPart
        : max;
    }, 0) || 0;

  return Array.from({ length: totalNeeded }, (_, index) => {
    const nextNumber = maxExistingNumber + index + 1;
    return `${prefix}${String(nextNumber).padStart(4, "0")}`;
  });
}

export function buildPackGenerationItems(items: SavedLoadItem[]) {
  const cycleLoadSummary = items
    .map((item) => `${item.pack_type} × ${item.quantity}`)
    .join(", ");

  const cyclePackTotal = items.reduce(
    (total, item) => total + item.quantity,
    0
  );

  const packItems = items.flatMap((item) =>
    Array.from({ length: item.quantity }, (_, index) => ({
      packType: item.pack_type,
      loadItemIndex: index + 1,
      loadItemTotal: item.quantity,
      cyclePackTotal,
      cycleLoadSummary,
    }))
  );

  return {
    packItems,
    cyclePackTotal,
    cycleLoadSummary,
  };
}
