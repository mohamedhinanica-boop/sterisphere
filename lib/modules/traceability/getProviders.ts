import { supabase } from "@/lib/supabase";
import type { Provider } from "./types";

export async function getProviders(): Promise<Provider[]> {
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