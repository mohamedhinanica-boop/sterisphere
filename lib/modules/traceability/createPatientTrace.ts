import { createAuditLog } from "@/lib/audit";
import type {
  CreatePatientTraceInput,
  CreatePatientTraceResult,
  PatientTrace,
} from "./types";
import { validatePackUsage } from "./validatePackUsage";

export async function createPatientTrace(
  supabase: any,
  input: CreatePatientTraceInput
): Promise<CreatePatientTraceResult> {
  if (
    !input.patientId ||
    !input.patientName ||
    !input.provider ||
    !input.treatmentRoom ||
    !input.packNumber ||
    !input.procedure
  ) {
    throw new Error("Please fill all required fields.");
  }

  const pack = await validatePackUsage(supabase, input.packNumber);

  const { data: newTrace, error: traceError } = await supabase
    .from("patient_traces")
    .insert([
      {
        patient_id: input.patientId,
        patient_name: input.patientName,
        provider: input.provider,
        treatment_room: input.treatmentRoom,
        pack_number: input.packNumber,
        procedure: input.procedure,
      },
    ])
    .select()
    .single();

  if (traceError || !newTrace) {
    throw traceError || new Error("Error saving patient trace.");
  }

  await createAuditLog({
    action: "patient_trace_created",
    entityType: "patient_trace",
    entityId: newTrace.id,
    description: `Linked pack ${newTrace.pack_number} to patient ${newTrace.patient_name}`,
    metadata: {
      patient_name: newTrace.patient_name,
      pack_number: newTrace.pack_number,
      provider: newTrace.provider,
      treatment_room: newTrace.treatment_room,
      procedure: newTrace.procedure,
    },
  });

  const { data: updatedPack, error: packUpdateError } = await supabase
  .from("packs")
  .update({ status: "Used" })
  .eq("pack_number", input.packNumber)
  .select("id, pack_number, status")
  .single();

if (packUpdateError || !updatedPack) {
  throw packUpdateError || new Error("Pack could not be marked as used.");
}

  if (packUpdateError) {
    throw packUpdateError;
  }

  await createAuditLog({
    action: "pack_marked_used",
    entityType: "pack",
    entityId: input.packNumber,
    description: `Pack ${input.packNumber} marked as used`,
    metadata: {
      pack_number: input.packNumber,
      patient_name: input.patientName,
    },
  });

  return {
    trace: newTrace as PatientTrace,
    pack,
  };
}
