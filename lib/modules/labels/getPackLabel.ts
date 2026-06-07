import type { PackLabel } from "./types";

export async function getPackLabel(
  supabase: any,
  packId: string
): Promise<PackLabel> {
  const { data, error } = await supabase
    .from("packs")
    .select(
      `
      id,
      pack_number,
      pack_type,
      expires_at
    `
    )
    .eq("id", packId)
    .single();

  if (error || !data) {
    throw error || new Error("Pack not found.");
  }

  return data;
}