import { nextStep, type SetupState } from "./setup-state";
import { SetupStep } from "./setup-steps";
import {
  EMPTY_CLINIC_PROFILE,
  type ClinicProfileSetup,
} from "./setup-types";

export type ClinicProfileField = keyof ClinicProfileSetup;

export type ClinicProfileErrors = Partial<
  Record<ClinicProfileField, string>
>;

export interface ClinicProfileOption {
  value: string;
  label: string;
}

export const CLINIC_COUNTRIES: readonly ClinicProfileOption[] = [
  { value: "CA", label: "Canada" },
  { value: "US", label: "United States" },
  { value: "AU", label: "Australia" },
  { value: "GB", label: "United Kingdom" },
];

export const CLINIC_REGIONS: Readonly<
  Record<string, readonly ClinicProfileOption[]>
> = {
  CA: [
    { value: "AB", label: "Alberta" },
    { value: "BC", label: "British Columbia" },
    { value: "MB", label: "Manitoba" },
    { value: "NB", label: "New Brunswick" },
    { value: "NL", label: "Newfoundland and Labrador" },
    { value: "NS", label: "Nova Scotia" },
    { value: "NT", label: "Northwest Territories" },
    { value: "NU", label: "Nunavut" },
    { value: "ON", label: "Ontario" },
    { value: "PE", label: "Prince Edward Island" },
    { value: "QC", label: "Quebec" },
    { value: "SK", label: "Saskatchewan" },
    { value: "YT", label: "Yukon" },
  ],
  US: [
    { value: "CA", label: "California" },
    { value: "FL", label: "Florida" },
    { value: "IL", label: "Illinois" },
    { value: "MA", label: "Massachusetts" },
    { value: "MI", label: "Michigan" },
    { value: "NY", label: "New York" },
    { value: "OH", label: "Ohio" },
    { value: "PA", label: "Pennsylvania" },
    { value: "TX", label: "Texas" },
    { value: "WA", label: "Washington" },
  ],
  AU: [
    { value: "ACT", label: "Australian Capital Territory" },
    { value: "NSW", label: "New South Wales" },
    { value: "NT", label: "Northern Territory" },
    { value: "QLD", label: "Queensland" },
    { value: "SA", label: "South Australia" },
    { value: "TAS", label: "Tasmania" },
    { value: "VIC", label: "Victoria" },
    { value: "WA", label: "Western Australia" },
  ],
  GB: [
    { value: "ENG", label: "England" },
    { value: "NIR", label: "Northern Ireland" },
    { value: "SCT", label: "Scotland" },
    { value: "WLS", label: "Wales" },
  ],
};

export const CLINIC_TIMEZONES: readonly ClinicProfileOption[] = [
  { value: "America/Toronto", label: "Eastern Time (Toronto)" },
  { value: "America/Winnipeg", label: "Central Time (Winnipeg)" },
  { value: "America/Edmonton", label: "Mountain Time (Edmonton)" },
  { value: "America/Vancouver", label: "Pacific Time (Vancouver)" },
  { value: "America/Halifax", label: "Atlantic Time (Halifax)" },
  { value: "America/St_Johns", label: "Newfoundland Time" },
  { value: "America/New_York", label: "Eastern Time (US)" },
  { value: "America/Chicago", label: "Central Time (US)" },
  { value: "America/Denver", label: "Mountain Time (US)" },
  { value: "America/Los_Angeles", label: "Pacific Time (US)" },
  { value: "Australia/Sydney", label: "Australian Eastern Time" },
  { value: "Australia/Adelaide", label: "Australian Central Time" },
  { value: "Australia/Perth", label: "Australian Western Time" },
  { value: "Europe/London", label: "United Kingdom Time" },
];

export const CLINIC_LANGUAGES: readonly ClinicProfileOption[] = [
  { value: "en", label: "English" },
  { value: "fr", label: "French" },
  { value: "es", label: "Spanish" },
];

export function getClinicRegions(
  country: string,
): readonly ClinicProfileOption[] {
  return CLINIC_REGIONS[country] || [];
}

export function validateClinicProfile(
  profile: ClinicProfileSetup,
): ClinicProfileErrors {
  const errors: ClinicProfileErrors = {};

  if (!profile.clinicName.trim()) {
    errors.clinicName = "Clinic name is required.";
  }

  if (!profile.country) {
    errors.country = "Country is required.";
  }

  if (profile.country && !profile.region) {
    errors.region = "Province or state is required.";
  }

  if (!profile.timezone) {
    errors.timezone = "Time zone is required.";
  }

  if (!profile.primaryLanguage) {
    errors.primaryLanguage = "Primary language is required.";
  }

  return errors;
}

export function isClinicProfileValid(profile: ClinicProfileSetup): boolean {
  return Object.keys(validateClinicProfile(profile)).length === 0;
}

export function updateClinicProfile(
  state: SetupState,
  field: ClinicProfileField,
  value: string,
): SetupState {
  const clinicProfile = {
    ...state.clinicProfile,
    [field]: value,
  };

  if (field === "country" && value !== state.clinicProfile.country) {
    clinicProfile.region = "";
  }

  return { ...state, clinicProfile };
}

export function advanceFromClinicProfile(state: SetupState): SetupState {
  if (
    state.currentStep !== SetupStep.CLINIC_PROFILE ||
    !isClinicProfileValid(state.clinicProfile)
  ) {
    return state;
  }

  return nextStep({
    ...state,
    completedSteps: state.completedSteps.includes(SetupStep.CLINIC_PROFILE)
      ? state.completedSteps
      : [...state.completedSteps, SetupStep.CLINIC_PROFILE],
  });
}
