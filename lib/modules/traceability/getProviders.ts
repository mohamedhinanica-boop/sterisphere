import type { Provider } from "./types";

export async function getProviders(supabase: any): Promise<Provider[]> {
  const { data, error } = await supabase
    .from("providers")
    .select("id, display_name, full_name, role, active")
    .eq("active", true)
    .in("role", ["Dentist", "Specialist", "Hygienist"])
    .order("full_name", { ascending: true });

  if (error) {
    throw error;
  }

  return data || [];
}
