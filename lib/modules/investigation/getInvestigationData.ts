import { supabase } from "@/lib/supabase";
import type {
  InvestigationCycle,
  InvestigationDataResult,
  InvestigationLoadItem,
  InvestigationPack,
  InvestigationPatientTrace,
} from "./types";

export async function getInvestigationData(
  cycleNumber: string
): Promise<InvestigationDataResult> {
  const normalizedCycleNumber = cycleNumber.trim();

  if (!normalizedCycleNumber) {
    throw new Error("Please enter a cycle number.");
  }

  const { data: cycleData, error: cycleError } = await supabase
    .from("cycles")
    .select(
      "id, cycle_number, sterilizer, operator, released_by, released_at, load_contents, expected_pack_count, status, reviewed_at, investigation_status, investigation_closed_at, investigation_root_cause, investigation_preventive_action, investigation_corrective_action, investigation_checklist, created_at"
    )
    .eq("cycle_number", normalizedCycleNumber)
    .maybeSingle<InvestigationCycle>();

  if (cycleError) {
    throw cycleError;
  }

  if (!cycleData) {
    return {
      cycle: null,
      packs: [],
      patients: [],
      loadItems: [],
      notice: "",
    };
  }

  const { data: loadData, error: loadError } = await supabase
    .from("load_items")
    .select("id, cycle_id, pack_type, quantity")
    .eq("cycle_id", cycleData.id)
    .returns<InvestigationLoadItem[]>();

  if (loadError) {
    throw loadError;
  }

  const { data: packsData, error: packsError } = await supabase
    .from("packs")
    .select(
      "id, pack_number, cycle_number, pack_type, status, sterilized_at, expires_at, load_item_index, load_item_total, cycle_pack_total, cycle_load_summary"
    )
    .eq("cycle_number", normalizedCycleNumber)
    .order("pack_number", { ascending: true })
    .returns<InvestigationPack[]>();

  if (packsError) {
    throw packsError;
  }

  const packs = packsData || [];

  if (packs.length === 0) {
    return {
      cycle: cycleData,
      packs: [],
      patients: [],
      loadItems: loadData || [],
      notice: "Cycle found. No linked packs or patient records were found.",
    };
  }

  const packNumbers = packs.map((pack) => pack.pack_number);

  const { data: patientData, error: patientError } = await supabase
    .from("patient_traces")
    .select("*")
    .in("pack_number", packNumbers)
    .returns<InvestigationPatientTrace[]>();

  if (patientError) {
    throw patientError;
  }

  return {
    cycle: cycleData,
    packs,
    patients: patientData || [],
    loadItems: loadData || [],
    notice: "Investigation completed.",
  };
}
