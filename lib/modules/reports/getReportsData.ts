import { supabase } from "@/lib/supabase";
import type { ReportsData } from "./types";

export async function getReportsData(): Promise<ReportsData> {
  const { data: cyclesData, error: cyclesError } = await supabase
    .from("cycles")
    .select(
      "id, cycle_number, sterilizer, operator, released_by, released_at, status, cycle_state, expected_pack_count, created_at"
    )
    .order("created_at", { ascending: false });

  const { data: packsData, error: packsError } = await supabase
    .from("packs")
    .select(
      "id, pack_number, cycle_number, pack_type, status, sterilized_at, expires_at, load_item_index, load_item_total, cycle_pack_total, cycle_load_summary, created_at"
    )
    .order("created_at", { ascending: false });

  const { data: tracesData, error: tracesError } = await supabase
    .from("patient_traces")
    .select(
      "id, patient_name, provider, treatment_room, pack_number, procedure, created_at"
    )
    .order("created_at", { ascending: false });

  const { data: auditData, error: auditError } = await supabase
    .from("audit_logs")
    .select("id, action, entity_type, description, user_email, created_at")
    .order("created_at", { ascending: false })
    .limit(50);

  if (cyclesError || packsError || tracesError || auditError) {
    console.error({ cyclesError, packsError, tracesError, auditError });
    throw new Error("Error loading reports data.");
  }

  return {
    cycles: cyclesData || [],
    packs: packsData || [],
    patientTraces: tracesData || [],
    auditLogs: auditData || [],
  };
}
