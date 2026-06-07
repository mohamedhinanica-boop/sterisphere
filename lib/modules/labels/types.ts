export type LabelData = {
  packNumber: string;
  packType: string | null;
  expiresAt: string | null;
  qrValue: string;
};

export type PackLabel = {
  id: string;
  pack_number: string;
  pack_type: string | null;
  expires_at: string | null;
};