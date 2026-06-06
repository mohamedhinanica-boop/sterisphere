export type InvestigationPack = {
  id: string;
  pack_number: string;
  cycle_number: string;
  pack_type: string;
  status: string | null;
  sterilized_at: string | null;
  expires_at: string | null;
  load_item_index: number | null;
  load_item_total: number | null;
  cycle_pack_total: number | null;
  cycle_load_summary: string | null;
};

export type InvestigationPatientTrace = {
  id: string;
  patient_name: string;
  provider: string;
  treatment_room: string;
  pack_number: string;
  procedure: string;
  created_at?: string;
};

export type InvestigationCycle = {
  id: string;
  cycle_number: string;
  sterilizer: string;
  operator: string;
  released_by: string | null;
  released_at: string | null;
  load_contents: string;
  expected_pack_count: number | null;
  status: string;
  reviewed_at: string | null;
  created_at: string;
};

export type FailedCycle = {
  id: string;
  cycle_number: string;
  sterilizer: string;
  operator: string;
  reviewed_at: string | null;
  created_at: string;
};

export type InvestigationLoadItem = {
  id: string;
  cycle_id: string;
  pack_type: string;
  quantity: number;
};

export type InvestigationDataResult = {
  cycle: InvestigationCycle | null;
  packs: InvestigationPack[];
  patients: InvestigationPatientTrace[];
  loadItems: InvestigationLoadItem[];
  notice: string;
};
