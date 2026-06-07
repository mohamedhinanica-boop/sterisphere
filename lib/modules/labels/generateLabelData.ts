import type { LabelData, PackLabel } from "./types";

export function generateLabelData(
  pack: PackLabel
): LabelData {
  return {
    packNumber: pack.pack_number,
    packType: pack.pack_type,
    expiresAt: pack.expires_at,
    qrValue: pack.pack_number,
  };
}