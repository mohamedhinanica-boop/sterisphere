import type { PatientTrace } from "./types";

export async function getPatientTraces(supabase: any): Promise<PatientTrace[]> {
  const { data, error } = await supabase
    .from("patient_traces")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  return data || [];
}
