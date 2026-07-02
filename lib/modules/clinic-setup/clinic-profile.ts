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

  if (
    profile.phone &&
    isNorthAmericanCountry(profile.country) &&
    profile.phone.length !== 10
  ) {
    errors.phone = "Enter a 10-digit phone number.";
  }

  if (
    profile.email &&
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profile.email)
  ) {
    errors.email = "Enter a valid email address.";
  }

  if (profile.website && !isValidWebsite(profile.website)) {
    errors.website = "Enter a valid website URL.";
  }

  if (
    profile.country === "CA" &&
    profile.postalCode &&
    !isValidCanadianPostalCode(profile.postalCode)
  ) {
    errors.postalCode = "Enter a valid Canadian postal code.";
  }

  if (
    profile.clinicCode &&
    !/^[A-Z0-9_-]+$/.test(profile.clinicCode)
  ) {
    errors.clinicCode =
      "Use letters, numbers, dashes, or underscores only.";
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

export function normalizeClinicCode(value: string): string {
  return value.replace(/\s+/g, "").toLocaleUpperCase();
}

export function normalizePhoneNumber(
  value: string,
  country: string,
): string {
  const digits = value.replace(/\D/g, "");

  if (isNorthAmericanCountry(country)) {
    const nationalNumber =
      digits.length > 10 && digits.startsWith("1") ? digits.slice(1) : digits;

    return nationalNumber.slice(0, 10);
  }

  return digits.slice(0, 15);
}

export function formatPhoneNumber(
  normalizedValue: string,
  country: string,
): string {
  if (!normalizedValue || !isNorthAmericanCountry(country)) {
    return normalizedValue;
  }

  if (normalizedValue.length <= 3) {
    return normalizedValue;
  }

  if (normalizedValue.length <= 6) {
    return `(${normalizedValue.slice(0, 3)}) ${normalizedValue.slice(3)}`;
  }

  return `(${normalizedValue.slice(0, 3)}) ${normalizedValue.slice(
    3,
    6,
  )}-${normalizedValue.slice(6, 10)}`;
}

export function normalizeWebsite(value: string): string {
  const trimmedValue = value.trim();

  if (!trimmedValue) {
    return "";
  }

  return /^[a-z][a-z\d+.-]*:\/\//i.test(trimmedValue)
    ? trimmedValue
    : `https://${trimmedValue}`;
}

export function formatPostalCode(value: string, country: string): string {
  if (country !== "CA") {
    return value;
  }

  const normalizedValue = value
    .replace(/[^a-z\d]/gi, "")
    .toLocaleUpperCase()
    .slice(0, 6);

  return normalizedValue.length > 3
    ? `${normalizedValue.slice(0, 3)} ${normalizedValue.slice(3)}`
    : normalizedValue;
}

export function normalizeClinicProfileField(
  state: SetupState,
  field: ClinicProfileField,
): SetupState {
  const currentValue = state.clinicProfile[field];

  if (typeof currentValue !== "string") {
    return state;
  }

  const normalizedValue =
    field === "website" ? normalizeWebsite(currentValue) : currentValue.trim();

  return normalizedValue === currentValue
    ? state
    : updateClinicProfile(state, field, normalizedValue);
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

function isNorthAmericanCountry(country: string): boolean {
  return country === "CA" || country === "US";
}

function isValidWebsite(value: string): boolean {
  try {
    const url = new URL(normalizeWebsite(value));

    return (
      (url.protocol === "http:" || url.protocol === "https:") &&
      url.hostname.includes(".")
    );
  } catch {
    return false;
  }
}

function isValidCanadianPostalCode(value: string): boolean {
  return /^[ABCEGHJ-NPRSTVXY]\d[ABCEGHJ-NPRSTV-Z] \d[ABCEGHJ-NPRSTV-Z]\d$/.test(
    formatPostalCode(value, "CA"),
  );
}
