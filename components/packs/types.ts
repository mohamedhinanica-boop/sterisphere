import type { Pack } from "@/lib/modules/packs";

export type ExtendedPack = Pack & {
  expired_reviewed?: boolean | null;
  expired_reviewed_at?: string | null;
  expired_reviewed_by?: string | null;
};

export type PatientTrace = {
  id: string;
  patient_name: string;
  provider: string;
  treatment_room: string;
  procedure: string;
  created_at: string | null;
  pack_id: string | null;
  pack_number: string;
};
