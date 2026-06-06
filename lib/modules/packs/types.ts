export type PackStatus = "Available" | "Used" | "Expired" | string;

export type CycleContext = {
  cycle_number: string;
  sterilizer: string;
  operator: string;
  released_by: string | null;
  released_at: string | null;
};

export type Pack = {
  id: string;
  pack_number: string;
  cycle_number: string;
  pack_type: string;
  contents: string | null;
  status: string | null;
  sterilized_at: string | null;
  expires_at: string | null;
  load_item_index: number | null;
  load_item_total: number | null;
  cycle_pack_total: number | null;
  cycle_load_summary: string | null;
  created_at: string;
  cycle?: CycleContext | null;
};
