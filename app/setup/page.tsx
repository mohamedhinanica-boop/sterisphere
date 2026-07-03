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
  Minus,
  Monitor,
  Phone,
  Plus,
  Rocket,
  ShieldCheck,
  Sparkles,
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

type WorkstationCategory =
  | "reception"
  | "treatment"
  | "sterilization"
  | "consultation"
  | "xray"
  | "laboratory"
  | "storage";

type WorkstationQuantities = Record<WorkstationCategory, number>;

interface WorkstationCategoryDefinition {
  id: WorkstationCategory;
  title: string;
  description: string;
  type: string;
  singularName: string;
  capabilities: readonly string[];
  alwaysNumbered?: boolean;
}

const workstationCategories: readonly WorkstationCategoryDefinition[] = [
  {
    id: "reception",
    title: "Reception Desks",
    description: "Front-desk stations for intake and clinic coordination.",
    type: "Reception",
    singularName: "Reception",
    capabilities: ["Computer"],
  },
  {
    id: "treatment",
    title: "Treatment Rooms",
    description: "Operatories where patient treatment and traceability occur.",
    type: "Operatory",
    singularName: "Operatory",
    capabilities: ["Computer", "USB Scanner", "Camera"],
    alwaysNumbered: true,
  },
  {
    id: "sterilization",
    title: "Sterilization Rooms",
    description: "Processing areas for sterilization and pack workflows.",
    type: "Sterilization",
    singularName: "Sterilization Room",
    capabilities: [
      "Computer",
      "USB Scanner",
      "Printer",
      "Camera",
      "Sterilizer",
    ],
  },
  {
    id: "consultation",
    title: "Consultation Rooms",
    description: "Private spaces for patient discussions and planning.",
    type: "Consultation",
    singularName: "Consultation Room",
    capabilities: ["Computer", "Camera"],
  },
  {
    id: "xray",
    title: "X-Ray Rooms",
    description: "Imaging rooms used during diagnostic workflows.",
    type: "X-Ray",
    singularName: "X-Ray Room",
    capabilities: ["Computer", "Camera"],
  },
  {
    id: "laboratory",
    title: "Laboratories",
    description: "Clinical lab spaces for scanning and case preparation.",
    type: "Laboratory",
    singularName: "Laboratory",
    capabilities: ["Computer", "USB Scanner"],
  },
  {
    id: "storage",
    title: "Storage Rooms",
    description: "Inventory locations for supplies and prepared packs.",
    type: "Storage",
    singularName: "Storage Room",
    capabilities: ["Computer", "USB Scanner"],
  },
] as const;

const recommendedWorkstationQuantities: WorkstationQuantities = {
  reception: 1,
  treatment: 6,
  sterilization: 1,
  consultation: 0,
  xray: 0,
  laboratory: 0,
  storage: 0,
};

type ProviderCategory =
  | "dentists"
  | "hygienists"
  | "assistants"
  | "receptionists"
  | "treatmentCoordinators"
  | "sterilizationTechnicians"
  | "officeManagers";

type ProviderQuantities = Record<ProviderCategory, number>;

interface ProviderCategoryDefinition {
  id: ProviderCategory;
  title: string;
  description: string;
  singularName: string;
  defaultRole: string;
  receptionNaming?: boolean;
}

interface ProviderEdit {
  displayName?: string;
  role?: string;
  status?: "active" | "inactive";
  preferredWorkstationId?: string;
}

interface WorkstationDraft {
  id: string;
  name: string;
  type: string;
  capabilities: readonly string[];
}

const clinicTypes = [
  "General Dentistry",
  "Orthodontics",
  "Pediatric Dentistry",
  "Oral Surgery",
  "Periodontics",
  "Prosthodontics",
  "Endodontics",
  "Multi-specialty",
] as const;

const providerCategories: readonly ProviderCategoryDefinition[] = [
  {
    id: "dentists",
    title: "Dentists",
    description: "Primary clinical providers delivering patient treatment.",
    singularName: "Dentist",
    defaultRole: "Dentist",
  },
  {
    id: "hygienists",
    title: "Hygienists",
    description: "Preventive-care providers supporting recurring appointments.",
    singularName: "Hygienist",
    defaultRole: "Dental Hygienist",
  },
  {
    id: "assistants",
    title: "Assistants",
    description: "Clinical assistants supporting treatment-room workflows.",
    singularName: "Assistant",
    defaultRole: "Dental Assistant",
  },
  {
    id: "receptionists",
    title: "Receptionists",
    description: "Front-office staff coordinating intake and scheduling.",
    singularName: "Reception",
    defaultRole: "Receptionist",
    receptionNaming: true,
  },
  {
    id: "treatmentCoordinators",
    title: "Treatment Coordinators",
    description: "Staff coordinating treatment plans and patient follow-up.",
    singularName: "Treatment Coordinator",
    defaultRole: "Treatment Coordinator",
  },
  {
    id: "sterilizationTechnicians",
    title: "Sterilization Technicians",
    description: "Dedicated staff supporting instrument processing.",
    singularName: "Sterilization Technician",
    defaultRole: "Sterilization Technician",
  },
  {
    id: "officeManagers",
    title: "Office Managers",
    description: "Operational leaders responsible for clinic coordination.",
    singularName: "Office Manager",
    defaultRole: "Office Manager",
  },
] as const;

const initialProviderQuantities: ProviderQuantities = {
  dentists: 6,
  hygienists: 4,
  assistants: 8,
  receptionists: 2,
  treatmentCoordinators: 0,
  sterilizationTechnicians: 1,
  officeManagers: 1,
};

function generateWorkstationDraft(
  quantities: WorkstationQuantities,
  names: Record<string, string>,
): WorkstationDraft[] {
  return workstationCategories.flatMap((category) =>
    Array.from({ length: quantities[category.id] }, (_, index) => {
      const id = `${category.id}-${index + 1}`;
      const defaultName =
        category.alwaysNumbered || index > 0
          ? `${category.singularName} ${index + 1}`
          : category.singularName;

      return {
        id,
        name: names[id] ?? defaultName,
        type: category.type,
        capabilities: category.capabilities,
      };
    }),
  );
}

interface DeploymentRecommendation {
  title: string;
  value?: string;
  explanation: string;
}

interface DeploymentGuidance {
  readiness: "Recommended" | "Action required";
  capacity: "Low–Medium" | "Medium–High" | "High";
  throughput: "20–40 packs" | "40–60 packs" | "60–90 packs";
  recommendations: DeploymentRecommendation[];
}

function getDeploymentGuidance(
  clinicType: string,
  rooms: WorkstationQuantities,
): DeploymentGuidance {
  const highInstrumentDemand =
    clinicType === "Oral Surgery" || clinicType === "Multi-specialty";
  const demandScore =
    rooms.treatment + rooms.laboratory + (highInstrumentDemand ? 2 : 0);
  const capacity =
    demandScore > 8
      ? "High"
      : demandScore > 3
        ? "Medium–High"
        : "Low–Medium";
  const throughput =
    demandScore > 8
      ? "60–90 packs"
      : demandScore > 3
        ? "40–60 packs"
        : "20–40 packs";
  const sterilizationRoomCount = Math.max(1, rooms.sterilization);

  return {
    readiness:
      rooms.sterilization > 0 ? "Recommended" : "Action required",
    capacity,
    throughput,
    recommendations: [
      {
        title: `${sterilizationRoomCount} Dedicated Sterilization ${
          sterilizationRoomCount === 1 ? "Room" : "Rooms"
        }`,
        explanation:
          "Improves workflow separation, processing control, and compliance.",
      },
      {
        title: "Dedicated Pack Preparation Area",
        explanation:
          "Keeps inspection, assembly, and packaging workflows clearly separated.",
      },
      {
        title: "Recommended Pack Expiration Policy",
        value: "365 Days",
        explanation:
          "Provides a clear local placeholder for deployment policy review.",
      },
      {
        title: "Sterilization Capacity Planning",
        value: capacity,
        explanation:
          "Supports a deployment review of expected instrument-processing demand.",
      },
    ],
  };
}
export default function ClinicSetupPage() {
  const [setupState, setSetupState] = useState(createSetupState);
  const [workstationQuantities, setWorkstationQuantities] =
    useState<WorkstationQuantities>(recommendedWorkstationQuantities);
  const [workstationNames, setWorkstationNames] = useState<
    Record<string, string>
  >({});
  const [clinicType, setClinicType] = useState("General Dentistry");
  const [providerQuantities, setProviderQuantities] =
    useState<ProviderQuantities>(initialProviderQuantities);
  const [providerEdits, setProviderEdits] = useState<
    Record<string, ProviderEdit>
  >({});
  const [touchedProfileFields, setTouchedProfileFields] = useState<
    Partial<Record<ClinicProfileField, boolean>>
  >({});

  const currentStepIndex = SETUP_STEP_ORDER.indexOf(setupState.currentStep);
  const isWelcome = setupState.currentStep === SetupStep.WELCOME;
  const isClinicProfile =
    setupState.currentStep === SetupStep.CLINIC_PROFILE;
  const isWorkstations = setupState.currentStep === SetupStep.WORKSTATIONS;
  const isProviders = setupState.currentStep === SetupStep.PROVIDERS;
  const isSterilizers = setupState.currentStep === SetupStep.STERILIZERS;
  const workstationDraft = generateWorkstationDraft(
    workstationQuantities,
    workstationNames,
  );
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
    if (isClinicProfile) {
      setSetupState((current) => advanceFromClinicProfile(current));
      return;
    }

    if (isWorkstations && workstationQuantities.treatment > 0) {
      setSetupState((current) =>
        nextStep({
          ...current,
          completedSteps: current.completedSteps.includes(
            SetupStep.WORKSTATIONS,
          )
            ? current.completedSteps
            : [...current.completedSteps, SetupStep.WORKSTATIONS],
        }),
      );
      return;
    }

    if (
      isProviders &&
      clinicType &&
      providerQuantities.dentists > 0
    ) {
      setSetupState((current) =>
        nextStep({
          ...current,
          completedSteps: current.completedSteps.includes(SetupStep.PROVIDERS)
            ? current.completedSteps
            : [...current.completedSteps, SetupStep.PROVIDERS],
        }),
      );
    }
  }

  function updateWorkstationQuantity(
    category: WorkstationCategory,
    adjustment: -1 | 1,
  ) {
    setWorkstationQuantities((current) => ({
      ...current,
      [category]: Math.max(0, current[category] + adjustment),
    }));
  }

  function updateWorkstationName(id: string, name: string) {
    setWorkstationNames((current) => ({ ...current, [id]: name }));
  }

  function updateProviderQuantity(
    category: ProviderCategory,
    adjustment: -1 | 1,
  ) {
    setProviderQuantities((current) => ({
      ...current,
      [category]: Math.max(0, current[category] + adjustment),
    }));
  }

  function updateProvider(
    id: string,
    field: keyof ProviderEdit,
    value: string,
  ) {
    setProviderEdits((current) => ({
      ...current,
      [id]: { ...current[id], [field]: value },
    }));
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
            <WorkstationsStep
              quantities={workstationQuantities}
              names={workstationNames}
              onQuantityChange={updateWorkstationQuantity}
              onNameChange={updateWorkstationName}
            />
          )}

          {isProviders && (
            <ProvidersStep
              clinicType={clinicType}
              quantities={providerQuantities}
              edits={providerEdits}
              workstations={workstationDraft}
              workstationQuantities={workstationQuantities}
              onClinicTypeChange={setClinicType}
              onQuantityChange={updateProviderQuantity}
              onProviderChange={updateProvider}
            />
          )}

          {isSterilizers && (
            <FutureStepPlaceholder
              stepNumber={5}
              title="Sterilizers"
              phase="8.6"
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
              disabled={
                (isClinicProfile && !clinicProfileValid) ||
                (isWorkstations && workstationQuantities.treatment === 0) ||
                (isProviders &&
                  (!clinicType || providerQuantities.dentists === 0)) ||
                (!isClinicProfile && !isWorkstations && !isProviders)
              }
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

function ProvidersStep({
  clinicType,
  quantities,
  edits,
  workstations,
  workstationQuantities,
  onClinicTypeChange,
  onQuantityChange,
  onProviderChange,
}: {
  clinicType: string;
  quantities: ProviderQuantities;
  edits: Record<string, ProviderEdit>;
  workstations: WorkstationDraft[];
  workstationQuantities: WorkstationQuantities;
  onClinicTypeChange: (clinicType: string) => void;
  onQuantityChange: (
    category: ProviderCategory,
    adjustment: -1 | 1,
  ) => void;
  onProviderChange: (
    id: string,
    field: keyof ProviderEdit,
    value: string,
  ) => void;
}) {
  const providers = providerCategories.flatMap((category) =>
    Array.from({ length: quantities[category.id] }, (_, index) => {
      const id = `${category.id}-${index + 1}`;
      const defaultName =
        category.receptionNaming && index === 0
          ? category.singularName
          : `${category.singularName} ${index + 1}`;

      return {
        id,
        displayName: edits[id]?.displayName ?? defaultName,
        role: edits[id]?.role ?? category.defaultRole,
        status: edits[id]?.status ?? "active",
        preferredWorkstationId:
          edits[id]?.preferredWorkstationId ?? "",
      };
    }),
  );
  const deploymentGuidance = getDeploymentGuidance(
    clinicType,
    workstationQuantities,
  );

  return (
    <div>
      <div className="mb-6">
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-blue-700">
          Step 4 of {SETUP_STEP_ORDER.length}
        </p>
        <h2 className="mt-2 text-3xl font-bold text-slate-950">
          Intelligent Provider Planning
        </h2>
        <p className="mt-2 max-w-3xl text-base text-slate-600">
          Describe the clinical team and review the deployment draft as
          SteriSphere plans provider coverage.
        </p>
      </div>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(320px,0.8fr)_minmax(460px,1.2fr)]">
        <div className="space-y-4">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="border-b border-slate-100 pb-4">
              <label
                htmlFor="provider-clinic-type"
                className="text-sm font-semibold text-slate-800"
              >
                Clinic Type <span className="text-red-600">*</span>
              </label>
              <p className="mt-1 text-xs leading-5 text-slate-600">
                Used only to shape local sterilization deployment guidance.
              </p>
              <select
                id="provider-clinic-type"
                required
                value={clinicType}
                onChange={(event) =>
                  onClinicTypeChange(event.target.value)
                }
                className="mt-3 min-h-12 w-full rounded-xl border border-slate-300 bg-white px-4 text-sm text-slate-950 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
              >
                <option value="" disabled>
                  Select clinic type
                </option>
                {clinicTypes.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </div>

            <div className="pt-4">
              <h3 className="text-lg font-bold text-slate-950">
                Provider quantities
              </h3>
              <p className="mt-1 text-sm text-slate-600">
                Adjust staffing counts to update the draft instantly.
              </p>
              <div className="mt-4 space-y-3">
                {providerCategories.map((category) => (
                  <ProviderQuantityCard
                    key={category.id}
                    category={category}
                    quantity={quantities[category.id]}
                    onChange={(adjustment) =>
                      onQuantityChange(category.id, adjustment)
                    }
                  />
                ))}
              </div>
            </div>
          </section>

          <aside className="rounded-2xl border border-blue-200 bg-blue-50 p-5">
            <div className="flex items-start gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-700 text-white">
                <Sparkles className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <h3 className="font-bold text-blue-950">
                  Steri AI Recommendation
                </h3>
                <p className="mt-2 text-sm leading-6 text-blue-900">
                  Local placeholder guidance based on the current clinic and
                  room draft. It does not change your configuration.
                </p>
              </div>
            </div>

            <dl className="mt-5 grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl bg-white/70 p-3">
                <dt className="text-xs font-semibold uppercase tracking-wide text-blue-700">
                  Clinic Profile
                </dt>
                <dd className="mt-1 font-bold text-blue-950">
                  {clinicType || "Not selected"}
                </dd>
              </div>
              <div className="rounded-xl bg-white/70 p-3">
                <dt className="text-xs font-semibold uppercase tracking-wide text-blue-700">
                  Treatment Rooms
                </dt>
                <dd className="mt-1 font-bold text-blue-950">
                  {workstationQuantities.treatment}
                </dd>
              </div>
              <div className="rounded-xl bg-white/70 p-3">
                <dt className="text-xs font-semibold uppercase tracking-wide text-blue-700">
                  Deployment Readiness
                </dt>
                <dd className="mt-1 font-bold text-blue-950">
                  {deploymentGuidance.readiness}
                </dd>
              </div>
              <div className="rounded-xl bg-white/70 p-3">
                <dt className="text-xs font-semibold uppercase tracking-wide text-blue-700">
                  Estimated Daily Capacity
                </dt>
                <dd className="mt-1 font-bold text-blue-950">
                  {deploymentGuidance.capacity}
                </dd>
              </div>
            </dl>

            {workstationQuantities.sterilization === 0 && (
              <div
                role="alert"
                className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-950"
              >
                <p className="text-sm font-bold">Warning</p>
                <p className="mt-1 text-sm leading-6">
                  No Sterilization Room has been configured. SteriSphere
                  strongly recommends a dedicated sterilization area before
                  deployment.
                </p>
              </div>
            )}

            <ul className="mt-5 space-y-3">
              {deploymentGuidance.recommendations.map((recommendation) => (
                <li
                  key={recommendation.title}
                  className="flex gap-3 rounded-xl bg-white/70 p-3"
                >
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                  <div>
                    <p className="text-sm font-bold text-blue-950">
                      {recommendation.title}
                      {recommendation.value && (
                        <span className="ml-2 font-semibold text-blue-700">
                          {recommendation.value}
                        </span>
                      )}
                    </p>
                    <p className="mt-1 text-xs leading-5 text-blue-800">
                      {recommendation.explanation}
                    </p>
                  </div>
                </li>
              ))}
              <li className="flex gap-3 rounded-xl bg-white/70 p-3">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                <div>
                  <p className="text-sm font-bold text-blue-950">
                    Estimated Daily Pack Throughput{" "}
                    <span className="ml-2 font-semibold text-blue-700">
                      {deploymentGuidance.throughput}
                    </span>
                  </p>
                  <p className="mt-1 text-xs leading-5 text-blue-800">
                    Helps size sterilizer and pack-processing capacity for the
                    current room draft.
                  </p>
                </div>
              </li>
            </ul>

            <p className="mt-4 text-xs leading-5 text-blue-700">
              Recommendations are local deployment placeholders only. No AI,
              backend, database, or persistence is used.
            </p>
            <p className="mt-2 text-xs font-semibold leading-5 text-blue-900">
              Hardware planning is completed in a later setup step.
            </p>
          </aside>
        </div>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm xl:sticky xl:top-5">
          <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-4">
            <div>
              <h3 className="text-lg font-bold text-slate-950">
                Live provider preview
              </h3>
              <p className="mt-1 text-sm text-slate-600">
                {providers.length}{" "}
                {providers.length === 1 ? "provider" : "providers"} in this
                local draft
              </p>
            </div>
            <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              Live
            </span>
          </div>

          {providers.length > 0 ? (
            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
              {providers.map((provider) => (
                <ProviderPreviewCard
                  key={provider.id}
                  provider={provider}
                  workstations={workstations}
                  onChange={(field, value) =>
                    onProviderChange(provider.id, field, value)
                  }
                />
              ))}
            </div>
          ) : (
            <div className="mt-4 flex min-h-56 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
              <Monitor className="h-8 w-8 text-slate-400" />
              <p className="mt-3 font-semibold text-slate-700">
                No providers in the draft
              </p>
              <p className="mt-1 max-w-sm text-sm text-slate-500">
                Add a provider role to begin planning the deployment team.
              </p>
            </div>
          )}

          {quantities.dentists === 0 && (
            <p className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900">
              Add at least one dentist to continue.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}

function ProviderQuantityCard({
  category,
  quantity,
  onChange,
}: {
  category: ProviderCategoryDefinition;
  quantity: number;
  onChange: (adjustment: -1 | 1) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
      <div className="min-w-0">
        <h4 className="font-semibold text-slate-900">{category.title}</h4>
        <p className="mt-1 text-xs leading-5 text-slate-600">
          {category.description}
        </p>
      </div>
      <div
        className="flex shrink-0 items-center rounded-xl border border-slate-300 bg-white p-1"
        aria-label={`${category.title} quantity`}
      >
        <button
          type="button"
          aria-label={`Remove one ${category.title}`}
          disabled={quantity === 0}
          onClick={() => onChange(-1)}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-600 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-30"
        >
          <Minus className="h-4 w-4" />
        </button>
        <output
          aria-live="polite"
          className="min-w-9 text-center text-base font-bold text-slate-950"
        >
          {quantity}
        </output>
        <button
          type="button"
          aria-label={`Add one ${category.title}`}
          onClick={() => onChange(1)}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-blue-700 transition hover:bg-blue-50"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function ProviderPreviewCard({
  provider,
  workstations,
  onChange,
}: {
  provider: {
    id: string;
    displayName: string;
    role: string;
    status: "active" | "inactive";
    preferredWorkstationId: string;
  };
  workstations: WorkstationDraft[];
  onChange: (field: keyof ProviderEdit, value: string) => void;
}) {
  return (
    <article className="rounded-xl border border-slate-200 p-4">
      <div className="space-y-3">
        <div>
          <label
            htmlFor={`provider-name-${provider.id}`}
            className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500"
          >
            Display Name
          </label>
          <input
            id={`provider-name-${provider.id}`}
            value={provider.displayName}
            onChange={(event) =>
              onChange("displayName", event.target.value)
            }
            className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-bold text-slate-950 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100"
          />
        </div>
        <div>
          <label
            htmlFor={`provider-role-${provider.id}`}
            className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500"
          >
            Role
          </label>
          <input
            id={`provider-role-${provider.id}`}
            value={provider.role}
            onChange={(event) => onChange("role", event.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-1 2xl:grid-cols-2">
          <div>
            <label
              htmlFor={`provider-status-${provider.id}`}
              className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500"
            >
              Status
            </label>
            <select
              id={`provider-status-${provider.id}`}
              value={provider.status}
              onChange={(event) => onChange("status", event.target.value)}
              className="mt-1 min-h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
          <div>
            <label
              htmlFor={`provider-workstation-${provider.id}`}
              className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500"
            >
              Preferred Workstation
            </label>
            <select
              id={`provider-workstation-${provider.id}`}
              value={provider.preferredWorkstationId}
              onChange={(event) =>
                onChange("preferredWorkstationId", event.target.value)
              }
              className="mt-1 min-h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
            >
              <option value="">Not assigned</option>
              {workstations.map((workstation) => (
                <option key={workstation.id} value={workstation.id}>
                  {workstation.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>
    </article>
  );
}

function WorkstationsStep({
  quantities,
  names,
  onQuantityChange,
  onNameChange,
}: {
  quantities: WorkstationQuantities;
  names: Record<string, string>;
  onQuantityChange: (
    category: WorkstationCategory,
    adjustment: -1 | 1,
  ) => void;
  onNameChange: (id: string, name: string) => void;
}) {
  const workstations = generateWorkstationDraft(quantities, names);

  return (
    <div>
      <div className="mb-6">
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-blue-700">
          Step 3 of {SETUP_STEP_ORDER.length}
        </p>
        <h2 className="mt-2 text-3xl font-bold text-slate-950">
          Intelligent Workstation Generator
        </h2>
        <p className="mt-2 max-w-3xl text-base text-slate-600">
          Describe the clinic layout and review the workstation draft as
          SteriSphere builds it in real time.
        </p>
      </div>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(320px,0.8fr)_minmax(460px,1.2fr)]">
        <div className="space-y-4">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4">
              <h3 className="text-lg font-bold text-slate-950">
                Clinic layout
              </h3>
              <p className="mt-1 text-sm text-slate-600">
                Adjust each room count. The draft updates automatically.
              </p>
            </div>
            <div className="space-y-3">
              {workstationCategories.map((category) => (
                <QuantityCard
                  key={category.id}
                  category={category}
                  quantity={quantities[category.id]}
                  onChange={(adjustment) =>
                    onQuantityChange(category.id, adjustment)
                  }
                />
              ))}
            </div>
          </section>

          <aside className="rounded-2xl border border-blue-200 bg-blue-50 p-5">
            <div className="flex items-start gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-700 text-white">
                <Sparkles className="h-4 w-4" />
              </span>
              <div>
                <h3 className="font-bold text-blue-950">
                  Steri AI Recommendation
                </h3>
                <p className="mt-2 text-sm leading-6 text-blue-900">
                  Based on your clinic profile, SteriSphere recommends:
                </p>
                <ul className="mt-2 space-y-1 text-sm text-blue-950">
                  <li>• 1 Reception Desk</li>
                  <li>• 1 Sterilization Room</li>
                  <li>• 6 Treatment Rooms</li>
                </ul>
                <p className="mt-3 text-xs text-blue-700">
                  Placeholder guidance for deployment planning.
                </p>
              </div>
            </div>
          </aside>
        </div>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm xl:sticky xl:top-5">
          <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-4">
            <div>
              <h3 className="text-lg font-bold text-slate-950">
                Live workstation preview
              </h3>
              <p className="mt-1 text-sm text-slate-600">
                {workstations.length}{" "}
                {workstations.length === 1 ? "workstation" : "workstations"}{" "}
                in this local draft
              </p>
            </div>
            <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              Live
            </span>
          </div>

          {workstations.length > 0 ? (
            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
              {workstations.map((workstation) => (
                <WorkstationPreviewCard
                  key={workstation.id}
                  workstation={workstation}
                  onNameChange={(name) =>
                    onNameChange(workstation.id, name)
                  }
                />
              ))}
            </div>
          ) : (
            <div className="mt-4 flex min-h-56 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
              <Monitor className="h-8 w-8 text-slate-400" />
              <p className="mt-3 font-semibold text-slate-700">
                No workstations in the draft
              </p>
              <p className="mt-1 max-w-sm text-sm text-slate-500">
                Add a room from the clinic layout to start generating the
                preview.
              </p>
            </div>
          )}

          {quantities.treatment === 0 && (
            <p className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900">
              Add at least one treatment room to continue.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}

function QuantityCard({
  category,
  quantity,
  onChange,
}: {
  category: WorkstationCategoryDefinition;
  quantity: number;
  onChange: (adjustment: -1 | 1) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
      <div className="min-w-0">
        <h4 className="font-semibold text-slate-900">{category.title}</h4>
        <p className="mt-1 text-xs leading-5 text-slate-600">
          {category.description}
        </p>
      </div>
      <div
        className="flex shrink-0 items-center rounded-xl border border-slate-300 bg-white p-1"
        aria-label={`${category.title} quantity`}
      >
        <button
          type="button"
          aria-label={`Remove one ${category.title}`}
          disabled={quantity === 0}
          onClick={() => onChange(-1)}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-600 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-30"
        >
          <Minus className="h-4 w-4" />
        </button>
        <output
          aria-live="polite"
          className="min-w-9 text-center text-base font-bold text-slate-950"
        >
          {quantity}
        </output>
        <button
          type="button"
          aria-label={`Add one ${category.title}`}
          onClick={() => onChange(1)}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-blue-700 transition hover:bg-blue-50"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function WorkstationPreviewCard({
  workstation,
  onNameChange,
}: {
  workstation: {
    id: string;
    name: string;
    type: string;
    capabilities: readonly string[];
  };
  onNameChange: (name: string) => void;
}) {
  return (
    <article className="rounded-xl border border-slate-200 p-4">
      <label
        htmlFor={`workstation-name-${workstation.id}`}
        className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500"
      >
        Workstation name
      </label>
      <input
        id={`workstation-name-${workstation.id}`}
        value={workstation.name}
        onChange={(event) => onNameChange(event.target.value)}
        className="mt-1 w-full rounded-lg border border-transparent bg-slate-50 px-3 py-2 text-base font-bold text-slate-950 outline-none transition hover:border-slate-200 focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100"
      />
      <p className="mt-2 text-xs font-semibold text-blue-700">
        {workstation.type}
      </p>
      <div className="mt-4 border-t border-slate-100 pt-3">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
          Default capabilities
        </p>
        <ul className="mt-2 grid gap-1.5">
          {workstation.capabilities.map((capability) => (
            <li
              key={capability}
              className="flex items-center gap-2 text-sm text-slate-700"
            >
              <Check className="h-4 w-4 text-emerald-600" />
              {capability}
            </li>
          ))}
        </ul>
      </div>
    </article>
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
