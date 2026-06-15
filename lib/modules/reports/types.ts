export type Cycle = {
  id: string;
  cycle_number: string;
  sterilizer: string;
  operator: string;
  released_by: string | null;
  released_at: string | null;
  status: string;
  cycle_state: string | null;
  expected_pack_count: number | null;
  investigation_status: string | null;
  investigation_root_cause: string | null;
  created_at: string;
};

export type Pack = {
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
  created_at: string;
};

export type PatientTrace = {
  id: string;
  patient_name: string;
  provider: string;
  treatment_room: string;
  pack_number: string;
  procedure: string;
  created_at: string;
};

export type AuditLog = {
  id: string;
  action: string;
  entity_type: string;
  description: string | null;
  user_email: string | null;
  created_at: string;
};

export type ReportsData = {
  cycles: Cycle[];
  packs: Pack[];
  patientTraces: PatientTrace[];
  auditLogs: AuditLog[];
};
