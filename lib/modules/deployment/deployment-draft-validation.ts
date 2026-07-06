import type { DeploymentDraft } from "./deployment-draft";

export interface DeploymentDraftValidationError {
  code: string;
  path: string;
  message: string;
}

export interface DeploymentDraftValidationResult {
  valid: boolean;
  errors: readonly DeploymentDraftValidationError[];
}

export function validateDeploymentDraft(
  draft: DeploymentDraft,
): DeploymentDraftValidationResult {
  const errors: DeploymentDraftValidationError[] = [];
  const requiredProfileFields = [
    ["name", "Clinic name"],
    ["country", "Country"],
    ["provinceState", "Province or state"],
    ["timezone", "Time zone"],
    ["primaryLanguage", "Primary language"],
  ] as const;

  for (const [field, label] of requiredProfileFields) {
    if (!draft.clinicProfile[field].trim()) {
      errors.push({
        code: "REQUIRED_CLINIC_PROFILE_FIELD",
        path: `clinicProfile.${field}`,
        message: `${label} is required.`,
      });
    }
  }

  if (
    !draft.workstations.some(
      (workstation) => workstation.workstationType === "operatory",
    )
  ) {
    errors.push({
      code: "TREATMENT_ROOM_REQUIRED",
      path: "workstations",
      message: "At least one treatment room is required.",
    });
  }

  if (
    !draft.sterilizers.some(
      (sterilizer) =>
        sterilizer.status === "active" ||
        sterilizer.status === "planned",
    )
  ) {
    errors.push({
      code: "AVAILABLE_STERILIZER_REQUIRED",
      path: "sterilizers",
      message: "At least one active or planned sterilizer is required.",
    });
  }

  if (!draft.policies.packExpiration.trim()) {
    errors.push({
      code: "PACK_EXPIRATION_POLICY_REQUIRED",
      path: "policies.packExpiration",
      message: "A pack expiration policy is required.",
    });
  }

  if (draft.hardwarePlan.labelPrinters < 1) {
    errors.push({
      code: "LABEL_PRINTER_REQUIRED",
      path: "hardwarePlan.labelPrinters",
      message: "At least one label printer is required.",
    });
  }

  if (draft.hardwarePlan.usbScanners < 1) {
    errors.push({
      code: "USB_SCANNER_REQUIRED",
      path: "hardwarePlan.usbScanners",
      message: "At least one USB scanner is required.",
    });
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
