export type Patient = {
  id: string;
  external_id: string | null;
  full_name: string;
  date_of_birth: string | null;
  source_system: string | null;
};

export type Pack = {
  id: string;
  pack_number: string;
  cycle_number: string;
  pack_type: string;
  status: string | null;
  expires_at: string | null;
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

export type Provider = {
  id: string;
  full_name: string;
  role: string | null;
  active: boolean;
};

export type CycleStatus = {
  cycle_number: string;
  status: string;
};

export type ValidatedPack = {
  id: string;
  pack_number: string;
  cycle_number: string;
  status: string | null;
  expires_at: string | null;
};
