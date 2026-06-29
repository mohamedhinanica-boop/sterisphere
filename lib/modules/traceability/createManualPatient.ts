import type { SupabaseClient } from "@supabase/supabase-js";
import type { Patient } from "./types";

export type ManualPatientInput = {
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  externalId?: string;
};

export type CreateManualPatientResult = {
  patient: Patient;
  possibleDuplicate: boolean;
};

export function generateManualPatientExternalId(now = new Date()): string {
  const date = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("");
  const randomSuffix = globalThis.crypto
    .randomUUID()
    .replaceAll("-", "")
    .slice(0, 6)
    .toUpperCase();

  return `SPH-PAT-${date}-${randomSuffix}`;
}

export async function createManualPatient(
  supabase: SupabaseClient,
  input: ManualPatientInput,
): Promise<CreateManualPatientResult> {
  const firstName = input.firstName.trim();
  const lastName = input.lastName.trim();
  const dateOfBirth = input.dateOfBirth.trim();
  const suppliedExternalId = input.externalId?.trim() || "";

  if (!firstName) {
    throw new Error("Patient first name is required.");
  }

  if (!lastName) {
    throw new Error("Patient last name is required.");
  }

  if (!dateOfBirth) {
    throw new Error("Date of birth is required.");
  }

  const fullName = `${firstName} ${lastName}`;

  if (suppliedExternalId) {
    const { data: existingPatient, error } = await supabase
      .from("patients")
      .select("id")
      .eq("external_id", suppliedExternalId)
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (existingPatient) {
      throw new Error("A patient with this external ID already exists.");
    }
  }

  let possibleDuplicate = false;
  const { data: matchingPatient, error: duplicateWarningError } = await supabase
    .from("patients")
    .select("id")
    .eq("full_name", fullName)
    .eq("date_of_birth", dateOfBirth)
    .limit(1)
    .maybeSingle();

  if (duplicateWarningError) {
    console.warn(
      "Could not check for a matching patient name and date of birth.",
      duplicateWarningError,
    );
  } else {
    possibleDuplicate = Boolean(matchingPatient);
  }

  const generatedExternalId = !suppliedExternalId;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const externalId =
      suppliedExternalId || generateManualPatientExternalId();
    const { data, error } = await supabase
      .from("patients")
      .insert([
        {
          full_name: fullName,
          date_of_birth: dateOfBirth,
          external_id: externalId,
          source_system: "Manual",
        },
      ])
      .select("id, external_id, full_name, date_of_birth, source_system")
      .single<Patient>();

    if (!error && data) {
      return { patient: data, possibleDuplicate };
    }

    if (error?.code === "23505" && generatedExternalId && attempt === 0) {
      continue;
    }

    if (error?.code === "23505") {
      throw new Error("A patient with this external ID already exists.");
    }

    throw error || new Error("Patient could not be created.");
  }

  throw new Error("A unique manual patient ID could not be generated.");
}
