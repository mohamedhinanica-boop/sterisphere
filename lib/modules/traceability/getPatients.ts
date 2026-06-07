import type { Patient } from "./types";

export async function getPatients(supabase: any): Promise<Patient[]> {
  const { data, error } = await supabase
    .from("patients")
    .select("*")
    .order("full_name", { ascending: true });

  if (error) {
    throw error;
  }

  return data || [];
}
