"use client";

import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Check,
  Clock3,
  ImageIcon,
  MapPin,
  Phone,
  Rocket,
  ShieldCheck,
} from "lucide-react";
import {
  CLINIC_COUNTRIES,
  CLINIC_LANGUAGES,
  CLINIC_TIMEZONES,
  SETUP_STEP_ORDER,
  SetupStep,
  advanceFromClinicProfile,
  createSetupState,
  formatPhoneNumber,
  formatPostalCode,
  getClinicRegions,
  isClinicProfileValid,
  nextStep,
  normalizeClinicCode,
  normalizeClinicProfileField,
  normalizePhoneNumber,
  previousStep,
  updateClinicProfile,
  validateClinicProfile,
  type ClinicProfileErrors,
  type ClinicProfileField,
  type ClinicProfileOption,
  type ClinicProfileSetup,
  type SetupStepId,
} from "@/lib/modules/clinic-setup";
import { useState } from "react";

const stepLabels: Record<SetupStepId, string> = {
  WELCOME: "Welcome",
  CLINIC_PROFILE: "Clinic Profile",
  WORKSTATIONS: "Workstations",
  PROVIDERS: "Providers",
  STERILIZERS: "Sterilizers",
  POLICIES: "Policies",
  HARDWARE: "Hardware",
  REVIEW: "Review",
  COMPLETE: "Complete",
};

const setupJourney = [
  "Discovery meeting",
  "Clinic intake questionnaire",
  "Platform configuration",
  "Hardware validation",
  "Staff training",
  "Go live",
] as const;

export default function ClinicSetupPage() {
  const [setupState, setSetupState] = useState(createSetupState);
  const [touchedProfileFields, setTouchedProfileFields] = useState<
    Partial<Record<ClinicProfileField, boolean>>
  >({});

  const currentStepIndex = SETUP_STEP_ORDER.indexOf(setupState.currentStep);
  const isWelcome = setupState.currentStep === SetupStep.WELCOME;
  const isClinicProfile =
    setupState.currentStep === SetupStep.CLINIC_PROFILE;
  const isWorkstations = setupState.currentStep === SetupStep.WORKSTATIONS;
  const clinicProfileErrors = validateClinicProfile(setupState.clinicProfile);
  const clinicProfileValid = isClinicProfileValid(setupState.clinicProfile);

  function startSetup() {
    setSetupState((current) =>
      nextStep({
        ...current,
        completedSteps: current.completedSteps.includes(SetupStep.WELCOME)
          ? current.completedSteps
          : [...current.completedSteps, SetupStep.WELCOME],
      }),
    );
  }

  function goBack() {
    setSetupState((current) => previousStep(current));
  }

  function updateProfile(field: ClinicProfileField, value: string) {
    setSetupState((current) => updateClinicProfile(current, field, value));
  }

  function touchProfileField(field: ClinicProfileField) {
    setTouchedProfileFields((current) => ({ ...current, [field]: true }));
  }

  function finishProfileField(field: ClinicProfileField) {
    setSetupState((current) => normalizeClinicProfileField(current, field));
    touchProfileField(field);
  }

  function goNext() {
    setSetupState((current) => advanceFromClinicProfile(current));
  }

  return (
    <div className="mx-auto w-full max-w-7xl">
      <header className="mb-6">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-950 text-white">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-700">
              Clinic Setup
            </p>
            <h1 className="text-2xl font-bold text-slate-950">
              Deployment Workspace
            </h1>
          </div>
        </div>
      </header>

      <div className="mb-5 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-3 shadow-sm lg:hidden">
        <ol className="flex min-w-max gap-2">
          {SETUP_STEP_ORDER.map((step, index) => (
            <ProgressStep
              key={step}
              step={step}
              index={index}
              currentStepIndex={currentStepIndex}
              compact
            />
          ))}
        </ol>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:block">
          <p className="px-3 pb-3 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
            Setup progress
          </p>
          <ol className="space-y-1">
            {SETUP_STEP_ORDER.map((step, index) => (
              <ProgressStep
                key={step}
                step={step}
                index={index}
                currentStepIndex={currentStepIndex}
              />
            ))}
          </ol>
        </aside>

        <section className="min-w-0">
          {isWelcome && <WelcomeCard onStart={startSetup} />}

          {isClinicProfile && (
            <ClinicProfileStep
              profile={setupState.clinicProfile}
              errors={clinicProfileErrors}
              touchedFields={touchedProfileFields}
              onChange={updateProfile}
              onBlur={finishProfileField}
            />
          )}

          {isWorkstations && (
            <FutureStepPlaceholder
              stepNumber={3}
              title="Workstations"
              phase="8.4"
            />
          )}

          <div className="mt-5 flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <button
              type="button"
              onClick={goBack}
              disabled={isWelcome}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </button>

            <button
              type="button"
              onClick={goNext}
              disabled={!isClinicProfile || !clinicProfileValid}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-blue-700 px-5 py-2 text-sm font-semibold text-white transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
            >
              Next
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}

function ClinicProfileStep({
  profile,
  errors,
  touchedFields,
  onChange,
  onBlur,
}: {
  profile: ClinicProfileSetup;
  errors: ClinicProfileErrors;
  touchedFields: Partial<Record<ClinicProfileField, boolean>>;
  onChange: (field: ClinicProfileField, value: string) => void;
  onBlur: (field: ClinicProfileField) => void;
}) {
  const regions = getClinicRegions(profile.country);

  function visibleError(field: ClinicProfileField) {
    return touchedFields[field] ? errors[field] : undefined;
  }

  return (
    <div>
      <div className="mb-6">
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-blue-700">
          Step 2 of {SETUP_STEP_ORDER.length}
        </p>
        <h2 className="mt-2 text-3xl font-bold text-slate-950">
          Clinic Profile
        </h2>
        <p className="mt-2 max-w-3xl text-base text-slate-600">
          Establish the clinic identity and regional context used throughout
          deployment.
        </p>
      </div>

      <div className="space-y-5">
        <SetupCard
          icon={Building2}
          title="Clinic Identity"
          description="Core identity, locale, and deployment defaults."
        >
          <div className="grid gap-5 md:grid-cols-2">
            <TextField
              id="clinic-name"
              label="Clinic Name"
              value={profile.clinicName}
              required
              error={visibleError("clinicName")}
              onChange={(value) => onChange("clinicName", value)}
              onBlur={() => onBlur("clinicName")}
            />
            <TextField
              id="legal-company-name"
              label="Legal Company Name"
              value={profile.legalCompanyName}
              onChange={(value) => onChange("legalCompanyName", value)}
            />
            <TextField
              id="clinic-code"
              label="Clinic Code"
              value={profile.clinicCode}
              placeholder="Optional internal identifier"
              error={visibleError("clinicCode")}
              onChange={(value) =>
                onChange("clinicCode", normalizeClinicCode(value))
              }
              onBlur={() => onBlur("clinicCode")}
            />
            <div>
              <FieldLabel htmlFor="clinic-logo">Clinic Logo</FieldLabel>
              <button
                id="clinic-logo"
                type="button"
                disabled
                className="mt-2 flex min-h-12 w-full cursor-not-allowed items-center gap-3 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 text-left text-sm text-slate-500"
              >
                <ImageIcon className="h-5 w-5" />
                Logo upload will be available in a future phase.
              </button>
            </div>
            <SelectField
              id="clinic-country"
              label="Country"
              value={profile.country}
              options={CLINIC_COUNTRIES}
              placeholder="Select country"
              required
              error={visibleError("country")}
              onChange={(value) => onChange("country", value)}
              onBlur={() => onBlur("country")}
            />
            <SelectField
              id="clinic-region"
              label="Province / State"
              value={profile.region}
              options={regions}
              placeholder={
                profile.country
                  ? "Select province or state"
                  : "Select country first"
              }
              required
              disabled={!profile.country}
              error={visibleError("region")}
              onChange={(value) => onChange("region", value)}
              onBlur={() => onBlur("region")}
            />
            <SelectField
              id="clinic-timezone"
              label="Time Zone"
              value={profile.timezone}
              options={CLINIC_TIMEZONES}
              placeholder="Select time zone"
              required
              error={visibleError("timezone")}
              onChange={(value) => onChange("timezone", value)}
              onBlur={() => onBlur("timezone")}
            />
            <SelectField
              id="clinic-language"
              label="Primary Language"
              value={profile.primaryLanguage}
              options={CLINIC_LANGUAGES}
              placeholder="Select language"
              required
              error={visibleError("primaryLanguage")}
              onChange={(value) => onChange("primaryLanguage", value)}
              onBlur={() => onBlur("primaryLanguage")}
            />
          </div>
        </SetupCard>

        <SetupCard
          icon={Phone}
          title="Contact"
          description="Primary public and deployment contact details."
        >
          <div className="grid gap-5 md:grid-cols-2">
            <TextField
              id="clinic-phone"
              label="Phone"
              value={formatPhoneNumber(profile.phone, profile.country)}
              type="tel"
              placeholder={
                profile.country === "CA" || profile.country === "US"
                  ? "(514) 514-2026"
                  : undefined
              }
              error={visibleError("phone")}
              onChange={(value) =>
                onChange(
                  "phone",
                  normalizePhoneNumber(value, profile.country),
                )
              }
              onBlur={() => onBlur("phone")}
            />
            <TextField
              id="clinic-email"
              label="Email"
              value={profile.email}
              type="email"
              error={visibleError("email")}
              onChange={(value) => onChange("email", value)}
              onBlur={() => onBlur("email")}
            />
            <div className="md:col-span-2">
              <TextField
                id="clinic-website"
                label="Website"
                value={profile.website}
                type="url"
                placeholder="https://"
                error={visibleError("website")}
                onChange={(value) => onChange("website", value)}
                onBlur={() => onBlur("website")}
              />
            </div>
          </div>
        </SetupCard>

        <SetupCard
          icon={MapPin}
          title="Address"
          description="Physical clinic location used during deployment."
        >
          <div className="grid gap-5 md:grid-cols-2">
            <div className="md:col-span-2">
              <TextField
                id="clinic-street"
                label="Street"
                value={profile.street}
                onChange={(value) => onChange("street", value)}
              />
            </div>
            <TextField
              id="clinic-city"
              label="City"
              value={profile.city}
              onChange={(value) => onChange("city", value)}
            />
            <TextField
              id="clinic-postal-code"
              label="Postal Code"
              value={profile.postalCode}
              placeholder={profile.country === "CA" ? "H2T 5T4" : undefined}
              error={visibleError("postalCode")}
              onChange={(value) =>
                onChange(
                  "postalCode",
                  formatPostalCode(value, profile.country),
                )
              }
              onBlur={() => onBlur("postalCode")}
            />
          </div>
        </SetupCard>
      </div>
    </div>
  );
}

function FutureStepPlaceholder({
  stepNumber,
  title,
  phase,
}: {
  stepNumber: number;
  title: string;
  phase: string;
}) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
      <p className="text-sm font-semibold uppercase tracking-[0.16em] text-blue-700">
        Step {stepNumber} of {SETUP_STEP_ORDER.length}
      </p>
      <h2 className="mt-3 text-3xl font-bold text-slate-950">{title}</h2>
      <p className="mt-3 text-base text-slate-600">
        Implementation begins in Phase {phase}.
      </p>
    </div>
  );
}

function SetupCard({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: typeof Building2;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex items-start gap-3 border-b border-slate-100 pb-4">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
          <Icon className="h-5 w-5" />
        </span>
        <div>
          <h3 className="text-lg font-bold text-slate-950">{title}</h3>
          <p className="mt-1 text-sm text-slate-600">{description}</p>
        </div>
      </div>
      <div className="pt-5">{children}</div>
    </section>
  );
}

function TextField({
  id,
  label,
  value,
  type = "text",
  placeholder,
  required = false,
  error,
  onChange,
  onBlur,
}: {
  id: string;
  label: string;
  value: string;
  type?: "text" | "email" | "tel" | "url";
  placeholder?: string;
  required?: boolean;
  error?: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
}) {
  return (
    <div>
      <FieldLabel htmlFor={id} required={required}>
        {label}
      </FieldLabel>
      <input
        id={id}
        type={type}
        value={value}
        placeholder={placeholder}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
        onChange={(event) => onChange(event.target.value)}
        onBlur={onBlur}
        className={`mt-2 min-h-12 w-full rounded-xl border px-4 text-sm text-slate-950 outline-none transition focus:ring-4 ${
          error
            ? "border-red-400 focus:border-red-500 focus:ring-red-100"
            : "border-slate-300 focus:border-blue-500 focus:ring-blue-100"
        }`}
      />
      {error && (
        <p id={`${id}-error`} className="mt-2 text-sm text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}

function SelectField({
  id,
  label,
  value,
  options,
  placeholder,
  required = false,
  disabled = false,
  error,
  onChange,
  onBlur,
}: {
  id: string;
  label: string;
  value: string;
  options: readonly ClinicProfileOption[];
  placeholder: string;
  required?: boolean;
  disabled?: boolean;
  error?: string;
  onChange: (value: string) => void;
  onBlur: () => void;
}) {
  return (
    <div>
      <FieldLabel htmlFor={id} required={required}>
        {label}
      </FieldLabel>
      <select
        id={id}
        value={value}
        disabled={disabled}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
        onChange={(event) => onChange(event.target.value)}
        onBlur={onBlur}
        className={`mt-2 min-h-12 w-full rounded-xl border bg-white px-4 text-sm text-slate-950 outline-none transition focus:ring-4 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500 ${
          error
            ? "border-red-400 focus:border-red-500 focus:ring-red-100"
            : "border-slate-300 focus:border-blue-500 focus:ring-blue-100"
        }`}
      >
        <option value="">{placeholder}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {error && (
        <p id={`${id}-error`} className="mt-2 text-sm text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}

function FieldLabel({
  htmlFor,
  required = false,
  children,
}: {
  htmlFor: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label htmlFor={htmlFor} className="text-sm font-semibold text-slate-700">
      {children}
      {required && <span className="ml-1 text-red-600">*</span>}
    </label>
  );
}

function WelcomeCard({ onStart }: { onStart: () => void }) {
  return (
    <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="bg-gradient-to-br from-slate-950 via-slate-900 to-blue-950 p-6 text-white sm:p-9">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10">
          <Rocket className="h-6 w-6" />
        </div>
        <h2 className="mt-6 text-3xl font-bold sm:text-4xl">
          Welcome to SteriSphere
        </h2>
        <p className="mt-4 max-w-2xl text-base leading-7 text-slate-200 sm:text-lg">
          Let&apos;s prepare this clinic for safe, compliant, and intelligent
          sterilization.
        </p>
        <div className="mt-5 inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm text-slate-100">
          <Clock3 className="h-4 w-4" />
          Estimated setup time: 10–15 minutes
        </div>
      </div>

      <div className="p-6 sm:p-9">
        <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm leading-6 text-blue-950">
          This setup experience is intended for SteriSphere deployment staff
          and Super Admins.
        </div>

        <div className="mt-8">
          <h3 className="text-lg font-bold text-slate-950">
            Your deployment journey
          </h3>
          <p className="mt-1 text-sm text-slate-600">
            A consistent path from clinic discovery to confident go-live.
          </p>

          <ol className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {setupJourney.map((item, index) => (
              <li
                key={item}
                className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-900 text-sm font-bold text-white">
                  {index + 1}
                </span>
                <span className="text-sm font-semibold text-slate-800">
                  {item}
                </span>
              </li>
            ))}
          </ol>
        </div>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={onStart}
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-blue-700 px-6 py-3 text-sm font-bold text-white transition hover:bg-blue-800 active:scale-[0.99]"
          >
            Start Setup
            <ArrowRight className="h-4 w-4" />
          </button>
          <Link
            href="/"
            className="inline-flex min-h-12 items-center justify-center rounded-xl border border-slate-300 px-6 py-3 text-sm font-bold text-slate-700 transition hover:bg-slate-50"
          >
            Return to Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}

function ProgressStep({
  step,
  index,
  currentStepIndex,
  compact = false,
}: {
  step: SetupStepId;
  index: number;
  currentStepIndex: number;
  compact?: boolean;
}) {
  const isCurrent = index === currentStepIndex;
  const isCompleted = index < currentStepIndex;

  return (
    <li
      aria-current={isCurrent ? "step" : undefined}
      aria-disabled={!isCurrent && !isCompleted}
      className={`flex items-center gap-3 rounded-xl ${
        compact ? "px-3 py-2" : "px-3 py-3"
      } ${
        isCurrent
          ? "bg-blue-50 text-blue-800 ring-1 ring-blue-200"
          : isCompleted
            ? "text-emerald-700"
            : "text-slate-400"
      }`}
    >
      <span
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
          isCurrent
            ? "bg-blue-700 text-white"
            : isCompleted
              ? "bg-emerald-100 text-emerald-700"
              : "bg-slate-100 text-slate-400"
        }`}
      >
        {isCompleted ? <Check className="h-4 w-4" /> : index + 1}
      </span>
      <span className="whitespace-nowrap text-sm font-semibold">
        {stepLabels[step]}
      </span>
    </li>
  );
}
