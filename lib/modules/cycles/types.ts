export type CycleStatus = "Pending" | "Passed" | "Failed" | string;
export type CycleState = "Open" | "Closed" | string;

export type LoadItem = {
  packType: string;
  quantity: string;
};

export type SavedLoadItem = {
  id: string;
  cycle_id: string;
  pack_type: string;
  quantity: number;
};

export type Cycle = {
  id: string;
  cycle_number: string;
  sterilizer: string;
  operator: string;
  load_contents: string;
  status: CycleStatus;
  cycle_state?: CycleState | null;
  expected_pack_count?: number | null;
  duration_minutes?: number | null;
  expected_finish_at?: string | null;
  created_at: string;
};

export type CreateCycleInput = {
  sterilizer: string;
  loadNotes: string;
  durationMinutes: string;
  loadItems: LoadItem[];
  cycleCounter: number;
};

export type CreateCycleResult = {
  cycle: Cycle;
};

export type ReviewCycleResult = {
  status: string;
  generatedPackCount: number;
};
