"use client";

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
import {
  DEPLOYMENT_STAGES,
  createDeploymentDraftFromSetupState,
  hashDeploymentDraftInput,
  simulateDeployment,
  summarizeDeploymentDraft,
  type DeploymentDraftAdapterResult,
} from "@/lib/modules/deployment";
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

const deploymentProgressByStep: Record<SetupStepId, number> = {
  WELCOME: 0,
  CLINIC_PROFILE: 0,
  WORKSTATIONS: 14,
  PROVIDERS: 29,
  STERILIZERS: 43,
  POLICIES: 57,
  HARDWARE: 71,
  REVIEW: 86,
  COMPLETE: 100,
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
}

interface WorkstationDraft {
  id: string;
  name: string;
  type: string;
  capabilities: readonly string[];
}

type SterilizerCategory = "steam" | "cassette" | "dryHeat" | "other";
type SterilizerStatus = "active" | "planned" | "inactive";
type SterilizerQuantities = Record<SterilizerCategory, number>;

interface SterilizerCategoryDefinition {
  id: SterilizerCategory;
  title: string;
  singularName: string;
  type: string;
  description: string;
}

interface SterilizerEdit {
  displayName?: string;
  type?: string;
  brand?: string;
  model?: string;
  serialNumber?: string;
  assignedWorkstationId?: string;
  status?: SterilizerStatus;
}

interface SterilizerDraft {
  id: string;
  displayName: string;
  type: string;
  brand: string;
  model: string;
  serialNumber: string;
  assignedWorkstationId: string;
  status: SterilizerStatus;
}

const sterilizerCategories: readonly SterilizerCategoryDefinition[] = [
  {
    id: "steam",
    title: "Steam Autoclaves",
    singularName: "Steam Autoclave",
    type: "Steam Autoclave",
    description: "General-purpose pressurized steam sterilization.",
  },
  {
    id: "cassette",
    title: "Cassette Sterilizers",
    singularName: "Cassette Sterilizer",
    type: "Cassette Sterilizer",
    description: "Fast-turnover processing for compatible instruments.",
  },
  {
    id: "dryHeat",
    title: "Dry Heat Sterilizers",
    singularName: "Dry Heat Sterilizer",
    type: "Dry Heat Sterilizer",
    description: "Dry heat processing for compatible instruments.",
  },
  {
    id: "other",
    title: "Other Sterilizers",
    singularName: "Other Sterilizer",
    type: "Other Sterilizer",
    description: "Additional equipment requiring deployment review.",
  },
] as const;

const initialSterilizerQuantities: SterilizerQuantities = {
  steam: 1,
  cassette: 0,
  dryHeat: 0,
  other: 0,
};
interface PolicyDraft {
  packExpiration: string;
}

interface PolicyOption {
  value: string;
  label: string;
  summary: string;
}

interface PolicyDefinition {
  id: keyof PolicyDraft;
  label: string;
  description: string;
  summaryLabel: string;
  options: readonly PolicyOption[];
}

const policyDefinitions: readonly PolicyDefinition[] = [
  {
    id: "packExpiration",
    label: "Pack Expiration Policy",
    description: "Sets the baseline shelf-life rule for prepared packs.",
    summaryLabel: "Pack Expiration",
    options: [
      { value: "180-days", label: "180 Days", summary: "180 Days" },
      { value: "365-days", label: "365 Days", summary: "365 Days" },
      {
        value: "clinic-defined",
        label: "Clinic Defined",
        summary: "Clinic Defined",
      },
    ],
  },
] as const;

const initialPolicyDraft: PolicyDraft = {
  packExpiration: "365-days",
};

type HardwareCategory = "labelPrinter" | "usbScanner";

type HardwarePlan = Record<HardwareCategory, number>;

interface HardwareDefinition {
  id: HardwareCategory;
  title: string;
  description: string;
}

const hardwareDefinitions: readonly HardwareDefinition[] = [
  {
    id: "labelPrinter",
    title: "Label Printers",
    description: "Estimate printers needed for sterilization pack labels.",
  },
  {
    id: "usbScanner",
    title: "USB QR / Barcode Scanners",
    description: "Estimate scanners needed in treatment rooms.",
  },
] as const;

function createInitialHardwarePlan(treatmentRooms: number): HardwarePlan {
  return {
    labelPrinter: 1,
    usbScanner: treatmentRooms,
  };
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
  },
  {
    id: "hygienists",
    title: "Hygienists",
    description: "Preventive-care providers supporting recurring appointments.",
  },
  {
    id: "assistants",
    title: "Assistants",
    description: "Clinical assistants supporting treatment-room workflows.",
  },
  {
    id: "receptionists",
    title: "Receptionists",
    description: "Front-office staff coordinating intake and scheduling.",
  },
  {
    id: "treatmentCoordinators",
    title: "Treatment Coordinators",
    description: "Staff coordinating treatment plans and patient follow-up.",
  },
  {
    id: "sterilizationTechnicians",
    title: "Sterilization Technicians",
    description: "Dedicated staff supporting instrument processing.",
  },
  {
    id: "officeManagers",
    title: "Office Managers",
    description: "Operational leaders responsible for clinic coordination.",
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

function generateSterilizerDraft(
  quantities: SterilizerQuantities,
  edits: Record<string, SterilizerEdit>,
  workstations: WorkstationDraft[],
): SterilizerDraft[] {
  const preferredWorkstationId =
    workstations.find((workstation) => workstation.type === "Sterilization")
      ?.id ?? "";

  return sterilizerCategories.flatMap((category) =>
    Array.from({ length: quantities[category.id] }, (_, index) => {
      const id = `${category.id}-${index + 1}`;
      const edit = edits[id];

      return {
        id,
        displayName:
          edit?.displayName ?? `${category.singularName} ${index + 1}`,
        type: edit?.type ?? category.type,
        brand: edit?.brand ?? "",
        model: edit?.model ?? "",
        serialNumber: edit?.serialNumber ?? "",
        assignedWorkstationId:
          edit?.assignedWorkstationId ?? preferredWorkstationId,
        status: edit?.status ?? "planned",
      };
    }),
  );
}
interface ProviderRecommendation {
  title: string;
  explanation: string;
}

interface ProviderGuidance {
  recommendations: ProviderRecommendation[];
}

function getProviderGuidance(): ProviderGuidance {
  return {
    recommendations: [
      {
        title: "Deployment Structure Only",
        explanation:
          "Provider counts establish the clinic structure without creating personnel records.",
      },
      {
        title: "Detailed Records After Deployment",
        explanation:
          "Names, credentials, contact details, and assignments belong in Provider Settings.",
      },
      {
        title: "Fast, Focused Setup",
        explanation:
          "Deferring operational details keeps the initial deployment quick and focused.",
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
  const [sterilizerQuantities, setSterilizerQuantities] =
    useState<SterilizerQuantities>(initialSterilizerQuantities);
  const [sterilizerEdits, setSterilizerEdits] = useState<
    Record<string, SterilizerEdit>
  >({});
  const [policyDraft, setPolicyDraft] =
    useState<PolicyDraft>(initialPolicyDraft);
  const [hardwarePlan, setHardwarePlan] = useState<HardwarePlan>(() =>
    createInitialHardwarePlan(recommendedWorkstationQuantities.treatment),
  );
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
  const isPolicies = setupState.currentStep === SetupStep.POLICIES;
  const isHardware = setupState.currentStep === SetupStep.HARDWARE;
  const isReview = setupState.currentStep === SetupStep.REVIEW;
  const isComplete = setupState.currentStep === SetupStep.COMPLETE;
  const workstationDraft = generateWorkstationDraft(
    workstationQuantities,
    workstationNames,
  );
  const sterilizerDraft = generateSterilizerDraft(
    sterilizerQuantities,
    sterilizerEdits,
    workstationDraft,
  );
  const hasPlannedSterilizer = sterilizerDraft.some(
    (sterilizer) =>
      sterilizer.status === "active" || sterilizer.status === "planned",
  );
  const isPolicyDraftComplete = Boolean(policyDraft.packExpiration);
  const isHardwarePlanComplete =
    hardwarePlan.labelPrinter > 0 && hardwarePlan.usbScanner > 0;
  const deploymentDraftPreview = isReview
    ? createDeploymentDraftFromSetupState(setupState, {
        workstations: workstationDraft,
        providerPlan: {
          clinicType,
          ...providerQuantities,
        },
        sterilizers: sterilizerDraft,
        policies: policyDraft,
        hardwarePlan,
        reviewMetadata: {
          requiredSections: SETUP_STEP_ORDER.filter(
            (step) =>
              step !== SetupStep.WELCOME &&
              step !== SetupStep.COMPLETE,
          ),
          completedSections: setupState.completedSteps,
        },
      })
    : null;
  const clinicProfileErrors = validateClinicProfile(setupState.clinicProfile);
  const clinicProfileValid = isClinicProfileValid(setupState.clinicProfile);
  const areRequiredSectionsComplete =
    clinicProfileValid &&
    workstationQuantities.treatment > 0 &&
    Boolean(clinicType) &&
    providerQuantities.dentists > 0 &&
    hasPlannedSterilizer &&
    isPolicyDraftComplete &&
    isHardwarePlanComplete;
  const deploymentProgress =
    deploymentProgressByStep[setupState.currentStep];

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
      return;
    }

    if (isSterilizers && hasPlannedSterilizer) {
      setSetupState((current) =>
        nextStep({
          ...current,
          completedSteps: current.completedSteps.includes(
            SetupStep.STERILIZERS,
          )
            ? current.completedSteps
            : [...current.completedSteps, SetupStep.STERILIZERS],
        }),
      );
      return;
    }

    if (isPolicies && isPolicyDraftComplete) {
      setSetupState((current) =>
        nextStep({
          ...current,
          completedSteps: current.completedSteps.includes(SetupStep.POLICIES)
            ? current.completedSteps
            : [...current.completedSteps, SetupStep.POLICIES],
        }),
      );
      return;
    }

    if (isHardware && isHardwarePlanComplete) {
      setSetupState((current) =>
        nextStep({
          ...current,
          completedSteps: current.completedSteps.includes(SetupStep.HARDWARE)
            ? current.completedSteps
            : [...current.completedSteps, SetupStep.HARDWARE],
        }),
      );
      return;
    }

    if (isReview) {
      setSetupState((current) =>
        nextStep({
          ...current,
          completedSteps: current.completedSteps.includes(SetupStep.REVIEW)
            ? current.completedSteps
            : [...current.completedSteps, SetupStep.REVIEW],
        }),
      );
    }
  }

  function updateWorkstationQuantity(
    category: WorkstationCategory,
    adjustment: -1 | 1,
  ) {
    const currentQuantity = workstationQuantities[category];
    const nextQuantity = Math.max(0, currentQuantity + adjustment);

    setWorkstationQuantities((current) => ({
      ...current,
      [category]: nextQuantity,
    }));

    if (category === "treatment") {
      setHardwarePlan((current) => ({
        ...current,
        usbScanner:
          current.usbScanner === currentQuantity
            ? nextQuantity
            : current.usbScanner,
      }));
    }
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

  function updateSterilizerQuantity(
    category: SterilizerCategory,
    adjustment: -1 | 1,
  ) {
    setSterilizerQuantities((current) => ({
      ...current,
      [category]: Math.max(0, current[category] + adjustment),
    }));
  }

  function updatePolicy(field: keyof PolicyDraft, value: string) {
    setPolicyDraft((current) => ({ ...current, [field]: value }));
  }

  function updateHardwareQuantity(
    category: HardwareCategory,
    adjustment: -1 | 1,
  ) {
    setHardwarePlan((current) => ({
      ...current,
      [category]: Math.max(0, current[category] + adjustment),
    }));
  }
  function updateSterilizer(
    id: string,
    field: keyof SterilizerEdit,
    value: string,
  ) {
    setSterilizerEdits((current) => ({
      ...current,
      [id]: { ...current[id], [field]: value },
    }));
  }
  return (
    <div className="mx-auto min-h-[100dvh] w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
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
          <DeploymentProgress value={deploymentProgress} />

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
              workstationQuantities={workstationQuantities}
              onClinicTypeChange={setClinicType}
              onQuantityChange={updateProviderQuantity}
            />
          )}

          {isSterilizers && (
            <SterilizersStep
              quantities={sterilizerQuantities}
              edits={sterilizerEdits}
              workstations={workstationDraft}
              treatmentRooms={workstationQuantities.treatment}
              sterilizationRooms={workstationQuantities.sterilization}
              onQuantityChange={updateSterilizerQuantity}
              onSterilizerChange={updateSterilizer}
            />
          )}

          {isPolicies && (
            <PoliciesStep
              policies={policyDraft}
              onPolicyChange={updatePolicy}
            />
          )}

          {isHardware && (
            <HardwareStep
              plan={hardwarePlan}
              onQuantityChange={updateHardwareQuantity}
            />
          )}

          {isReview && deploymentDraftPreview && (
            <ReviewStep
              profile={setupState.clinicProfile}
              workstationQuantities={workstationQuantities}
              workstations={workstationDraft}
              clinicType={clinicType}
              providerQuantities={providerQuantities}
              sterilizers={sterilizerDraft}
              policy={policyDraft}
              hardware={hardwarePlan}
              requiredSectionsComplete={areRequiredSectionsComplete}
              deploymentDraftPreview={deploymentDraftPreview}
            />
          )}

          {isComplete && (
            <CompleteStep />
          )}

          <div className="mt-5 flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <button
              type="button"
              onClick={goBack}
              disabled={isWelcome}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ArrowLeft className="h-4 w-4" />
              {isComplete ? "Back to Review" : "Back"}
            </button>

            <button
              type="button"
              onClick={goNext}
              disabled={
                isComplete ||
                (isClinicProfile && !clinicProfileValid) ||
                (isWorkstations && workstationQuantities.treatment === 0) ||
                (isProviders &&
                  (!clinicType || providerQuantities.dentists === 0)) ||
                (isSterilizers && !hasPlannedSterilizer) ||
                (isPolicies && !isPolicyDraftComplete) ||
                (isHardware && !isHardwarePlanComplete) ||
                (!isClinicProfile &&
                  !isWorkstations &&
                  !isProviders &&
                  !isSterilizers &&
                  !isPolicies &&
                  !isHardware &&
                  !isReview &&
                  !isComplete)
              }
              className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-blue-700 px-5 py-2 text-sm font-semibold text-white transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
            >
              {isComplete
                ? "Deployment Persistence Coming Soon"
                : isReview
                  ? "Confirm Review"
                  : "Next"}
              {!isComplete && <ArrowRight className="h-4 w-4" />}
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}

function CompleteStep() {
  const completedDraftSections = [
    "Clinic profile configured",
    "Workstations planned",
    "Provider structure planned",
    "Sterilizers planned",
    "Baseline policies selected",
    "Hardware quantities planned",
    "Review completed",
  ];

  return (
    <div className="overflow-hidden rounded-3xl border border-emerald-200 bg-white shadow-sm">
      <div className="bg-gradient-to-br from-emerald-950 via-emerald-900 to-slate-950 p-6 text-white sm:p-9">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10">
          <Check className="h-6 w-6" />
        </div>
        <p className="mt-6 text-sm font-semibold uppercase tracking-[0.16em] text-emerald-200">
          Step 9 of {SETUP_STEP_ORDER.length}
        </p>
        <h2 className="mt-2 text-3xl font-bold sm:text-4xl">
          Deployment Draft Complete
        </h2>
        <p className="mt-4 max-w-2xl text-base leading-7 text-emerald-100 sm:text-lg">
          Your SteriSphere deployment draft has been prepared.
        </p>
      </div>

      <div className="p-6 sm:p-9">
        <h3 className="text-lg font-bold text-slate-950">
          Draft summary
        </h3>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {completedDraftSections.map((section) => (
            <div
              key={section}
              className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                <Check className="h-4 w-4" />
              </span>
              <p className="text-sm font-semibold text-slate-900">
                {section}
              </p>
            </div>
          ))}
        </div>

        <div className="mt-6 rounded-2xl border border-blue-200 bg-blue-50 p-5 text-sm leading-6 text-blue-950">
          In a future phase, confirming deployment will create the clinic
          configuration and open the live SteriSphere workspace.
        </div>
      </div>
    </div>
  );
}

function ReviewStep({
  profile,
  workstationQuantities,
  workstations,
  clinicType,
  providerQuantities,
  sterilizers,
  policy,
  hardware,
  requiredSectionsComplete,
  deploymentDraftPreview,
}: {
  profile: ClinicProfileSetup;
  workstationQuantities: WorkstationQuantities;
  workstations: WorkstationDraft[];
  clinicType: string;
  providerQuantities: ProviderQuantities;
  sterilizers: SterilizerDraft[];
  policy: PolicyDraft;
  hardware: HardwarePlan;
  requiredSectionsComplete: boolean;
  deploymentDraftPreview: DeploymentDraftAdapterResult;
}) {
  const getOptionLabel = (
    options: readonly ClinicProfileOption[],
    value: string,
  ) => options.find((option) => option.value === value)?.label ?? value;
  const country = getOptionLabel(CLINIC_COUNTRIES, profile.country);
  const region = getOptionLabel(
    getClinicRegions(profile.country),
    profile.region,
  );
  const timezone = getOptionLabel(CLINIC_TIMEZONES, profile.timezone);
  const language = getOptionLabel(
    CLINIC_LANGUAGES,
    profile.primaryLanguage,
  );
  const otherRooms =
    workstationQuantities.consultation +
    workstationQuantities.xray +
    workstationQuantities.laboratory +
    workstationQuantities.storage;
  const sterilizerTypes = Array.from(
    new Set(sterilizers.map((sterilizer) => sterilizer.type)),
  ).join(", ");
  const sterilizerAssignments = sterilizers
    .filter((sterilizer) => sterilizer.assignedWorkstationId)
    .map((sterilizer) => {
      const workstation = workstations.find(
        (item) => item.id === sterilizer.assignedWorkstationId,
      );
      return `${sterilizer.displayName}: ${
        workstation?.name ?? sterilizer.assignedWorkstationId
      }`;
    });
  const expirationPolicy =
    policyDefinitions[0].options.find(
      (option) => option.value === policy.packExpiration,
    )?.label ?? "Not selected";
  const readinessChecks = [
    requiredSectionsComplete,
    workstationQuantities.treatment > 0,
    sterilizers.length > 0,
    hardware.labelPrinter > 0,
    hardware.usbScanner > 0,
  ];
  const readinessScore = Math.round(
    (readinessChecks.filter(Boolean).length / readinessChecks.length) * 100,
  );
  const deploymentDraftSummary = summarizeDeploymentDraft(
    deploymentDraftPreview.draft,
  );
  const deploymentDraftHash = hashDeploymentDraftInput(
    deploymentDraftPreview.draft,
  );
  const deploymentDraftIssues = deploymentDraftPreview.validation.errors;
  const deploymentSimulation = deploymentDraftPreview.validation.valid
    ? simulateDeployment(deploymentDraftPreview.draft)
    : null;
  const simulationStageResults = DEPLOYMENT_STAGES.map((stage) => {
    const result =
      deploymentSimulation?.completedStages.find(
        (item) => item.stageId === stage.id,
      ) ??
      (deploymentSimulation?.failedStage?.stageId === stage.id
        ? deploymentSimulation.failedStage
        : undefined) ??
      deploymentSimulation?.skippedStages.find(
        (item) => item.stageId === stage.id,
      );

    return {
      id: stage.id,
      displayName: stage.displayName,
      status: result?.status ?? "skipped",
    };
  });
  const simulationStatus = !deploymentSimulation
    ? "Not run"
    : deploymentSimulation.status === "succeeded"
      ? "Ready"
      : "Failed";
  const warnings = [
    workstationQuantities.reception === 0
      ? "No reception desk configured."
      : null,
    workstationQuantities.sterilization === 0
      ? "No sterilization room configured."
      : null,
    hardware.usbScanner < workstationQuantities.treatment
      ? "Scanner count is lower than the treatment room count."
      : null,
    !profile.clinicCode ? "No clinic code entered." : null,
  ].filter((warning): warning is string => Boolean(warning));

  return (
    <div>
      <div className="mb-6">
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-blue-700">
          Step 8 of {SETUP_STEP_ORDER.length}
        </p>
        <h2 className="mt-2 text-3xl font-bold text-slate-950">
          Deployment Review
        </h2>
        <p className="mt-2 max-w-3xl text-base text-slate-600">
          Review the complete local deployment draft before confirming it.
        </p>
      </div>

      <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-[0.14em] text-emerald-700">
          Deployment Readiness
        </p>
        <p className="mt-2 text-4xl font-bold text-emerald-950">
          {readinessScore}%
        </p>
        <p className="mt-2 text-sm text-emerald-800">
          Based on required sections and essential deployment quantities.
        </p>
      </section>

      <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.14em] text-slate-500">
              Deployment Draft
            </p>
            <h3 className="mt-1 text-lg font-bold text-slate-950">
              Canonical payload preview
            </h3>
          </div>
          <span
            className={`inline-flex w-fit rounded-full px-3 py-1 text-xs font-bold ${
              deploymentDraftPreview.validation.valid
                ? "bg-emerald-100 text-emerald-800"
                : "bg-amber-100 text-amber-900"
            }`}
          >
            {deploymentDraftPreview.validation.valid
              ? "Ready"
              : "Needs attention"}
          </span>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <DraftPreviewMetric
            label="Draft version"
            value={deploymentDraftPreview.draft.draftVersion}
          />
          <DraftPreviewMetric
            label="Payload hash"
            value={deploymentDraftHash}
          />
          <DraftPreviewMetric
            label="Validation issues"
            value={deploymentDraftIssues.length}
          />
          <DraftPreviewMetric
            label="Workstations"
            value={deploymentDraftSummary.workstationCount}
          />
          <DraftPreviewMetric
            label="Sterilizers"
            value={deploymentDraftSummary.sterilizerCount}
          />
          <DraftPreviewMetric
            label="Label printers"
            value={deploymentDraftSummary.plannedPrinterCount}
          />
          <DraftPreviewMetric
            label="USB scanners"
            value={deploymentDraftSummary.plannedScannerCount}
          />
        </div>

        {deploymentDraftIssues.length > 0 && (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
            <h4 className="text-sm font-bold text-amber-950">
              Canonical draft warnings
            </h4>
            <ul className="mt-2 space-y-2 text-sm text-amber-900">
              {deploymentDraftIssues.map((issue) => (
                <li key={`${issue.code}-${issue.path}`}>
                  {issue.message}
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-amber-800">
              These local validation warnings do not block Confirm Review and
              cannot trigger deployment.
            </p>
          </div>
        )}
      </section>

      <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.14em] text-slate-500">
              Deployment Simulation
            </p>
            <h3 className="mt-1 text-lg font-bold text-slate-950">
              In-memory sequence preview
            </h3>
          </div>
          <span
            className={`inline-flex w-fit rounded-full px-3 py-1 text-xs font-bold ${
              simulationStatus === "Ready"
                ? "bg-emerald-100 text-emerald-800"
                : simulationStatus === "Failed"
                  ? "bg-rose-100 text-rose-800"
                  : "bg-slate-100 text-slate-700"
            }`}
          >
            {simulationStatus}
          </span>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <DraftPreviewMetric
            label="Stages completed"
            value={deploymentSimulation?.completedStages.length ?? 0}
          />
          <DraftPreviewMetric
            label="Total duration"
            value={`${deploymentSimulation?.durationMs ?? 0} ms`}
          />
          <DraftPreviewMetric
            label="Rollback required"
            value={deploymentSimulation?.rollbackRequired ? "Yes" : "No"}
          />
          <DraftPreviewMetric
            label="Warnings"
            value={deploymentSimulation?.warnings.length ?? 0}
          />
          <DraftPreviewMetric
            label="Stages total"
            value={DEPLOYMENT_STAGES.length}
          />
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {simulationStageResults.map((stage) => (
            <div
              key={stage.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2"
            >
              <span className="text-xs font-semibold text-slate-800">
                {stage.displayName}
              </span>
              <span
                className={`shrink-0 text-[11px] font-bold uppercase tracking-wide ${
                  stage.status === "succeeded"
                    ? "text-emerald-700"
                    : stage.status === "failed"
                      ? "text-rose-700"
                      : "text-slate-500"
                }`}
              >
                {stage.status}
              </span>
            </div>
          ))}
        </div>

        {deploymentSimulation?.status === "succeeded" && (
          <p className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-900">
            Deployment sequence simulation completed successfully. No data was
            saved.
          </p>
        )}

        {deploymentSimulation?.status === "failed" && (
          <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">
            <p className="font-bold">
              Failed stage:{" "}
              {deploymentSimulation.failedStage?.stageDisplayName ??
                "Draft validation"}
            </p>
            <p className="mt-1">
              {deploymentSimulation.failedStage?.messages[0] ??
                deploymentSimulation.messages[0] ??
                "The local deployment simulation could not complete."}
            </p>
            <p className="mt-2 text-xs font-semibold">
              No deployment was performed and no data was saved.
            </p>
          </div>
        )}

        {!deploymentSimulation && (
          <p className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
            Simulation was not run because the canonical draft needs attention.
            No deployment was performed.
          </p>
        )}
      </section>

      {warnings.length > 0 && (
        <section className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-5">
          <h3 className="font-bold text-amber-950">Review notes</h3>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {warnings.map((warning) => (
              <div
                key={warning}
                className="rounded-xl border border-amber-200 bg-white/70 p-3 text-sm font-semibold text-amber-900"
              >
                {warning}
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-amber-800">
            These notes are informational and do not block confirmation.
          </p>
        </section>
      )}

      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <ReviewSection title="Clinic Profile">
          <ReviewRow label="Clinic name" value={profile.clinicName} />
          <ReviewRow label="Country / Province" value={`${country} / ${region}`} />
          <ReviewRow label="Time zone" value={timezone} />
          <ReviewRow label="Language" value={language} />
        </ReviewSection>

        <ReviewSection title="Workstations">
          <ReviewRow label="Total workstations" value={workstations.length} />
          <ReviewRow
            label="Treatment rooms"
            value={workstationQuantities.treatment}
          />
          <ReviewRow
            label="Sterilization rooms"
            value={workstationQuantities.sterilization}
          />
          <ReviewRow
            label="Reception desks"
            value={workstationQuantities.reception}
          />
          <ReviewRow label="Other rooms" value={otherRooms} />
        </ReviewSection>

        <ReviewSection title="Providers">
          <ReviewRow label="Clinic type" value={clinicType} />
          {providerCategories.map((category) => (
            <ReviewRow
              key={category.id}
              label={category.title}
              value={providerQuantities[category.id]}
            />
          ))}
        </ReviewSection>

        <ReviewSection title="Sterilizers">
          <ReviewRow label="Total sterilizers" value={sterilizers.length} />
          <ReviewRow label="Types" value={sterilizerTypes || "None"} />
          <ReviewRow
            label="Assigned workstation"
            value={
              sterilizerAssignments.length > 0
                ? sterilizerAssignments.join("; ")
                : "Not assigned"
            }
          />
        </ReviewSection>

        <ReviewSection title="Policies">
          <ReviewRow
            label="Pack expiration policy"
            value={expirationPolicy}
          />
          {[
            "Cycle Review Required",
            "Failed Cycles Require Investigation",
            "Traceability Required",
          ].map((safeguard) => (
            <div key={safeguard} className="flex items-center gap-2 py-2">
              <Check className="h-4 w-4 shrink-0 text-emerald-600" />
              <p className="text-sm font-semibold text-slate-900">
                {safeguard}
              </p>
            </div>
          ))}
        </ReviewSection>

        <ReviewSection title="Hardware">
          <ReviewRow label="Label printers" value={hardware.labelPrinter} />
          <ReviewRow label="USB scanners" value={hardware.usbScanner} />
        </ReviewSection>
      </div>

      <aside className="mt-5 rounded-2xl border border-blue-200 bg-blue-50 p-5">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-700 text-white">
            <Sparkles className="h-4 w-4" />
          </span>
          <div>
            <h3 className="font-bold text-blue-950">
              Steri AI Guidance
            </h3>
            <p className="mt-2 text-sm leading-6 text-blue-900">
              This review summarizes the local deployment draft. No clinic data
              is saved until deployment is confirmed in a future phase.
            </p>
          </div>
        </div>
      </aside>
    </div>
  );
}

function DraftPreviewMetric({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className="mt-1 break-all text-sm font-bold text-slate-950">
        {value}
      </p>
    </div>
  );
}

function ReviewSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="border-b border-slate-100 pb-3 text-lg font-bold text-slate-950">
        {title}
      </h3>
      <dl className="mt-3 divide-y divide-slate-100">{children}</dl>
    </section>
  );
}

function ReviewRow({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5">
      <dt className="text-sm text-slate-600">{label}</dt>
      <dd className="text-right text-sm font-bold text-slate-900">{value}</dd>
    </div>
  );
}

function DeploymentProgress({ value }: { value: number }) {
  return (
    <div className="mb-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm font-bold text-slate-950">
          Deployment Progress
        </p>
        <p className="text-sm font-semibold text-blue-700">
          {value}% Complete
        </p>
      </div>
      <div
        role="progressbar"
        aria-label="Deployment progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={value}
        className="mt-3 h-2.5 overflow-hidden rounded-full bg-slate-200"
      >
        <div
          className="h-full rounded-full bg-blue-700 transition-[width]"
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  );
}

function HardwareStep({
  plan,
  onQuantityChange,
}: {
  plan: HardwarePlan;
  onQuantityChange: (
    category: HardwareCategory,
    adjustment: -1 | 1,
  ) => void;
}) {
  const readinessSummary = [
    {
      label: "Label Printers",
      value: plan.labelPrinter,
    },
    {
      label: "USB Scanners",
      value: plan.usbScanner,
    },
  ];

  return (
    <div>
      <div className="mb-6">
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-blue-700">
          Step 7 of {SETUP_STEP_ORDER.length}
        </p>
        <h2 className="mt-2 text-3xl font-bold text-slate-950">
          Hardware Planning
        </h2>
        <p className="mt-2 max-w-3xl text-base text-slate-600">
          Plan the devices needed for deployment without configuring or pairing
          hardware yet.
        </p>
      </div>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(420px,1.15fr)_minmax(320px,0.85fr)]">
        <div className="space-y-4">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-lg font-bold text-slate-950">
              Hardware planning checklist
            </h3>
            <p className="mt-1 text-sm text-slate-600">
              Estimate the physical equipment required for deployment.
            </p>

            <div className="mt-5 space-y-4">
              {hardwareDefinitions.map((hardware) => {
                const quantity = plan[hardware.id];

                return (
                  <div
                    key={hardware.id}
                    className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
                  >
                    <div>
                      <h4 className="font-bold text-slate-950">
                        {hardware.title}
                      </h4>
                      <p className="mt-1 text-sm leading-6 text-slate-600">
                        {hardware.description}
                      </p>
                    </div>

                    <div className="mt-4">
                      <div className="max-w-40">
                        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                          Quantity
                        </p>
                        <div className="mt-2 flex min-h-11 items-center rounded-xl border border-slate-300 bg-white p-1">
                          <button
                            type="button"
                            onClick={() =>
                              onQuantityChange(hardware.id, -1)
                            }
                            disabled={quantity === 0}
                            aria-label={`Decrease ${hardware.title} quantity`}
                            className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-600 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-30"
                          >
                            <Minus className="h-4 w-4" />
                          </button>
                          <span className="min-w-10 text-center text-sm font-bold text-slate-950">
                            {quantity}
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              onQuantityChange(hardware.id, 1)
                            }
                            aria-label={`Increase ${hardware.title} quantity`}
                            className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-600 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-30"
                          >
                            <Plus className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <aside className="rounded-2xl border border-blue-200 bg-blue-50 p-5">
            <div className="flex items-start gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-700 text-white">
                <Sparkles className="h-4 w-4" />
              </span>
              <div>
                <h3 className="font-bold text-blue-950">
                  Steri AI Guidance
                </h3>
                <p className="mt-2 text-sm leading-6 text-blue-900">
                  One label printer is generally recommended per sterilization
                  room. One USB scanner is generally recommended per treatment
                  room requiring traceability.
                </p>
              </div>
            </div>
            <div className="mt-4 rounded-xl bg-white/70 p-4 text-sm leading-6 text-blue-950">
              Hardware configuration and pairing are completed after deployment
              from <strong>Hardware Settings</strong>.
            </div>
            <p className="mt-4 text-xs leading-5 text-blue-700">
              Local equipment estimate only. No device configuration or
              persistence is used.
            </p>
          </aside>
        </div>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm xl:sticky xl:top-5">
          <div className="border-b border-slate-100 pb-4">
            <h3 className="text-lg font-bold text-slate-950">
              Deployment Hardware Summary
            </h3>
            <p className="mt-1 text-sm text-slate-600">
              This is a planning summary only.
            </p>
          </div>

          <dl className="mt-4 space-y-3">
            {readinessSummary.map((item) => (
              <div
                key={item.label}
                className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4"
              >
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                <div>
                  <dt className="text-sm font-bold text-slate-900">
                    {item.label}: {item.value}
                  </dt>
                </div>
              </div>
            ))}
          </dl>
        </section>
      </div>
    </div>
  );
}

function PoliciesStep({
  policies,
  onPolicyChange,
}: {
  policies: PolicyDraft;
  onPolicyChange: (field: keyof PolicyDraft, value: string) => void;
}) {
  const complianceSummary = policyDefinitions.map((policy) => ({
    label: policy.summaryLabel,
    value:
      policy.options.find((option) => option.value === policies[policy.id])
        ?.summary ?? "Not selected",
  }));

  return (
    <div>
      <div className="mb-6">
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-blue-700">
          Step 6 of {SETUP_STEP_ORDER.length}
        </p>
        <h2 className="mt-2 text-3xl font-bold text-slate-950">
          Policy &amp; Compliance Planning
        </h2>
        <p className="mt-2 max-w-3xl text-base text-slate-600">
          Establish the minimum sterilization defaults required for initial
          clinic operation.
        </p>
      </div>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(320px,0.8fr)_minmax(460px,1.2fr)]">
        <div className="space-y-4">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-lg font-bold text-slate-950">
              Policy configuration
            </h3>
            <p className="mt-1 text-sm text-slate-600">
              Select the clinic&apos;s baseline pack expiration policy.
            </p>
            <div className="mt-5 space-y-4">
              {policyDefinitions.map((policy) => (
                <div key={policy.id}>
                  <label
                    htmlFor={`policy-${policy.id}`}
                    className="text-sm font-semibold text-slate-800"
                  >
                    {policy.label} <span className="text-red-600">*</span>
                  </label>
                  <p className="mt-1 text-xs leading-5 text-slate-600">
                    {policy.description}
                  </p>
                  <select
                    id={`policy-${policy.id}`}
                    required
                    value={policies[policy.id]}
                    onChange={(event) =>
                      onPolicyChange(policy.id, event.target.value)
                    }
                    className="mt-2 min-h-12 w-full rounded-xl border border-slate-300 bg-white px-4 text-sm text-slate-950 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                  >
                    <option value="" disabled>
                      Select a policy
                    </option>
                    {policy.options.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  {policies.packExpiration === "clinic-defined" && (
                    <p className="mt-2 text-xs leading-5 text-slate-600">
                      Custom expiration rules are configured after deployment
                      in Settings → Sterilization Policies.
                    </p>
                  )}
                </div>
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
                  Steri AI Guidance
                </h3>
                <p className="mt-2 text-sm leading-6 text-blue-900">
                  Deployment only defines the baseline pack expiration policy.
                  Core safeguards remain active by default.
                </p>
              </div>
            </div>
            <div className="mt-4 rounded-xl bg-white/70 p-4 text-sm leading-6 text-blue-950">
              <p className="font-bold">Deployment note</p>
              <p className="mt-1">
                Advanced policy settings are managed after deployment in{" "}
                <strong>Settings → Sterilization Policies</strong>.
              </p>
            </div>
            <p className="mt-4 text-xs leading-5 text-blue-700">
              Local placeholder guidance only. No AI, backend, database, or
              persistence is used.
            </p>
          </aside>
        </div>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm xl:sticky xl:top-5">
          <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-4">
            <div>
              <h3 className="text-lg font-bold text-slate-950">
                Compliance Summary
              </h3>
              <p className="mt-1 text-sm text-slate-600">
                Live operational defaults for this local deployment draft.
              </p>
            </div>
            <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              Live
            </span>
          </div>

          <dl className="mt-4 space-y-3">
            {complianceSummary.map((item) => (
              <div
                key={item.label}
                className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4"
              >
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                    {item.label}
                  </dt>
                  <dd className="mt-1 text-sm font-bold text-slate-900">
                    {item.value}
                  </dd>
                </div>
              </div>
            ))}
            {[
              "Cycle Review Required",
              "Failed Cycles Require Investigation",
              "Traceability Required",
            ].map((safeguard) => (
              <div
                key={safeguard}
                className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4"
              >
                <Check className="h-4 w-4 shrink-0 text-emerald-600" />
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                    Core safeguard
                  </dt>
                  <dd className="mt-1 text-sm font-bold text-slate-900">
                    {safeguard}
                  </dd>
                </div>
              </div>
            ))}
          </dl>
        </section>
      </div>
    </div>
  );
}
function SterilizersStep({
  quantities,
  edits,
  workstations,
  treatmentRooms,
  sterilizationRooms,
  onQuantityChange,
  onSterilizerChange,
}: {
  quantities: SterilizerQuantities;
  edits: Record<string, SterilizerEdit>;
  workstations: WorkstationDraft[];
  treatmentRooms: number;
  sterilizationRooms: number;
  onQuantityChange: (
    category: SterilizerCategory,
    adjustment: -1 | 1,
  ) => void;
  onSterilizerChange: (
    id: string,
    field: keyof SterilizerEdit,
    value: string,
  ) => void;
}) {
  const sterilizers = generateSterilizerDraft(
    quantities,
    edits,
    workstations,
  );
  const hasPlannedSterilizer = sterilizers.some(
    (sterilizer) =>
      sterilizer.status === "active" || sterilizer.status === "planned",
  );

  return (
    <div>
      <div className="mb-6">
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-blue-700">
          Step 5 of {SETUP_STEP_ORDER.length}
        </p>
        <h2 className="mt-2 text-3xl font-bold text-slate-950">
          Sterilizer Planning
        </h2>
        <p className="mt-2 max-w-3xl text-base text-slate-600">
          Model the clinic&apos;s sterilization equipment before defining
          policies and hardware connections.
        </p>
      </div>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(320px,0.8fr)_minmax(460px,1.2fr)]">
        <div className="space-y-4">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-lg font-bold text-slate-950">
              Sterilizer quantities
            </h3>
            <p className="mt-1 text-sm text-slate-600">
              Adjust equipment counts to update the local draft instantly.
            </p>
            <div className="mt-4 space-y-3">
              {sterilizerCategories.map((category) => (
                <SterilizerQuantityCard
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
                  Local equipment-planning guidance only. It does not change
                  the sterilizer draft.
                </p>
              </div>
            </div>
            <ul className="mt-4 space-y-3 text-sm text-blue-950">
              <li className="rounded-xl bg-white/70 p-3">
                <strong>Dedicated sterilization room.</strong>{" "}
                Recommended for controlled equipment workflows.
              </li>
              {treatmentRooms > 6 && (
                <li className="rounded-xl bg-white/70 p-3">
                  <strong>Review sterilizer capacity.</strong> Clinics with
                  many treatment rooms may require additional capacity.
                </li>
              )}
              <li className="rounded-xl bg-white/70 p-3">
                <strong>Cassette sterilizers.</strong> Useful for compatible
                instruments that need fast turnover.
              </li>
              <li className="rounded-xl bg-white/70 p-3">
                <strong>Serial numbers are optional now.</strong> They can be
                added later for compliance and maintenance records.
              </li>
            </ul>
            {sterilizationRooms === 0 && (
              <p className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm font-medium text-amber-950">
                No sterilization room is in the workstation draft. A dedicated
                sterilization room is recommended before deployment.
              </p>
            )}
            <p className="mt-4 text-xs leading-5 text-blue-700">
              No AI, backend, database, or persistence is used.
            </p>
          </aside>
        </div>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm xl:sticky xl:top-5">
          <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-4">
            <div>
              <h3 className="text-lg font-bold text-slate-950">
                Live sterilizer preview
              </h3>
              <p className="mt-1 text-sm text-slate-600">
                {sterilizers.length}{" "}
                {sterilizers.length === 1 ? "sterilizer" : "sterilizers"} in
                this local draft
              </p>
            </div>
            <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              Live
            </span>
          </div>

          {sterilizers.length > 0 ? (
            <div className="mt-4 grid gap-4">
              {sterilizers.map((sterilizer) => (
                <SterilizerPreviewCard
                  key={sterilizer.id}
                  sterilizer={sterilizer}
                  workstations={workstations}
                  onChange={(field, value) =>
                    onSterilizerChange(sterilizer.id, field, value)
                  }
                />
              ))}
            </div>
          ) : (
            <div className="mt-4 flex min-h-56 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
              <Monitor className="h-8 w-8 text-slate-400" />
              <p className="mt-3 font-semibold text-slate-700">
                No sterilizers in the draft
              </p>
              <p className="mt-1 max-w-sm text-sm text-slate-500">
                Add at least one sterilizer to begin equipment planning.
              </p>
            </div>
          )}

          {!hasPlannedSterilizer && (
            <p className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900">
              Add an Active or Planned sterilizer to continue.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}

function SterilizerQuantityCard({
  category,
  quantity,
  onChange,
}: {
  category: SterilizerCategoryDefinition;
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

function SterilizerPreviewCard({
  sterilizer,
  workstations,
  onChange,
}: {
  sterilizer: SterilizerDraft;
  workstations: WorkstationDraft[];
  onChange: (field: keyof SterilizerEdit, value: string) => void;
}) {
  const orderedWorkstations = [...workstations].sort((left, right) => {
    const leftPreferred = left.type === "Sterilization" ? 0 : 1;
    const rightPreferred = right.type === "Sterilization" ? 0 : 1;
    return leftPreferred - rightPreferred;
  });

  return (
    <article className="rounded-xl border border-slate-200 p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <SterilizerTextField
          id={`sterilizer-name-${sterilizer.id}`}
          label="Display Name"
          value={sterilizer.displayName}
          emphasized
          onChange={(value) => onChange("displayName", value)}
        />
        <div>
          <label
            htmlFor={`sterilizer-type-${sterilizer.id}`}
            className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500"
          >
            Sterilizer Type
          </label>
          <select
            id={`sterilizer-type-${sterilizer.id}`}
            value={sterilizer.type}
            onChange={(event) => onChange("type", event.target.value)}
            className="mt-1 min-h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
          >
            {sterilizerCategories.map((category) => (
              <option key={category.id} value={category.type}>
                {category.type}
              </option>
            ))}
          </select>
        </div>
        <SterilizerTextField
          id={`sterilizer-brand-${sterilizer.id}`}
          label="Brand / Manufacturer"
          value={sterilizer.brand}
          placeholder="Optional"
          onChange={(value) => onChange("brand", value)}
        />
        <SterilizerTextField
          id={`sterilizer-model-${sterilizer.id}`}
          label="Model"
          value={sterilizer.model}
          placeholder="Optional"
          onChange={(value) => onChange("model", value)}
        />
        <SterilizerTextField
          id={`sterilizer-serial-${sterilizer.id}`}
          label="Serial Number"
          value={sterilizer.serialNumber}
          placeholder="Optional"
          onChange={(value) => onChange("serialNumber", value)}
        />
        <div>
          <label
            htmlFor={`sterilizer-status-${sterilizer.id}`}
            className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500"
          >
            Status
          </label>
          <select
            id={`sterilizer-status-${sterilizer.id}`}
            value={sterilizer.status}
            onChange={(event) => onChange("status", event.target.value)}
            className="mt-1 min-h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
          >
            <option value="active">Active</option>
            <option value="planned">Planned</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
        <div className="sm:col-span-2">
          <label
            htmlFor={`sterilizer-workstation-${sterilizer.id}`}
            className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500"
          >
            Assigned Workstation
          </label>
          <select
            id={`sterilizer-workstation-${sterilizer.id}`}
            value={sterilizer.assignedWorkstationId}
            onChange={(event) =>
              onChange("assignedWorkstationId", event.target.value)
            }
            className="mt-1 min-h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
          >
            <option value="">Not assigned</option>
            {orderedWorkstations.map((workstation) => (
              <option key={workstation.id} value={workstation.id}>
                {workstation.name}
                {workstation.type === "Sterilization"
                  ? " — Sterilization"
                  : ""}
              </option>
            ))}
          </select>
        </div>
      </div>
    </article>
  );
}

function SterilizerTextField({
  id,
  label,
  value,
  placeholder,
  emphasized = false,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  placeholder?: string;
  emphasized?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label
        htmlFor={id}
        className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500"
      >
        {label}
      </label>
      <input
        id={id}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className={`mt-1 min-h-10 w-full rounded-lg border border-slate-200 px-3 text-sm text-slate-800 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100 ${
          emphasized ? "bg-slate-50 font-bold text-slate-950" : "bg-white"
        }`}
      />
    </div>
  );
}
function ProvidersStep({
  clinicType,
  quantities,
  workstationQuantities,
  onClinicTypeChange,
  onQuantityChange,
}: {
  clinicType: string;
  quantities: ProviderQuantities;
  workstationQuantities: WorkstationQuantities;
  onClinicTypeChange: (clinicType: string) => void;
  onQuantityChange: (
    category: ProviderCategory,
    adjustment: -1 | 1,
  ) => void;
}) {
  const providerGuidance = getProviderGuidance();
  const providerSummary = [
    { label: "Dentists", count: quantities.dentists },
    { label: "Dental Hygienists", count: quantities.hygienists },
    { label: "Dental Assistants", count: quantities.assistants },
    { label: "Receptionists", count: quantities.receptionists },
    {
      label: "Treatment Coordinators",
      count: quantities.treatmentCoordinators,
    },
    {
      label: "Sterilization Technicians",
      count: quantities.sterilizationTechnicians,
    },
    { label: "Office Managers", count: quantities.officeManagers },
  ];

  return (
    <div>
      <div className="mb-6">
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-blue-700">
          Step 4 of {SETUP_STEP_ORDER.length}
        </p>
        <h2 className="mt-2 text-3xl font-bold text-slate-950">
          Provider Planning
        </h2>
        <p className="mt-2 max-w-3xl text-base text-slate-600">
          Define the clinic&apos;s provider structure without configuring
          individual personnel records.
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
                Provides deployment context for the planned clinic structure.
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
                Adjust planned counts to update the deployment summary.
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
                  Provider planning creates the deployment structure only.
                  Detailed provider records are completed after deployment.
                </p>
              </div>
            </div>

            {workstationQuantities.sterilization === 0 && (
              <div
                role="alert"
                className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-950"
              >
                <p className="text-sm font-bold">General readiness note</p>
                <p className="mt-1 text-sm leading-6">
                  No Sterilization Room has been configured. SteriSphere
                  strongly recommends a dedicated sterilization area before
                  deployment.
                </p>
              </div>
            )}

            <ul className="mt-5 space-y-3">
              {providerGuidance.recommendations.map((recommendation) => (
                <li
                  key={recommendation.title}
                  className="flex gap-3 rounded-xl bg-white/70 p-3"
                >
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                  <div>
                    <p className="text-sm font-bold text-blue-950">
                      {recommendation.title}
                    </p>
                    <p className="mt-1 text-xs leading-5 text-blue-800">
                      {recommendation.explanation}
                    </p>
                  </div>
                </li>
              ))}
            </ul>

            <p className="mt-4 text-xs leading-5 text-blue-700">
              Local placeholder guidance only. No AI, backend, database, or
              persistence is used.
            </p>
          </aside>
        </div>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm xl:sticky xl:top-5">
          <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-4">
            <div>
              <h3 className="text-lg font-bold text-slate-950">
                Provider Deployment Summary
              </h3>
              <p className="mt-1 text-sm font-semibold text-slate-700">
                {clinicType || "Clinic type not selected"}
              </p>
            </div>
            <span className="rounded-full bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700">
              Planned
            </span>
          </div>

          <ul className="mt-4 space-y-2">
            {providerSummary
              .filter((item) => item.count > 0)
              .map((item) => (
                <li
                  key={item.label}
                  className="flex items-center gap-3 rounded-xl bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-800"
                >
                  <Check className="h-4 w-4 shrink-0 text-emerald-600" />
                  {item.count} {item.label}
                </li>
              ))}
          </ul>

          <div className="mt-5 rounded-2xl border border-blue-200 bg-blue-50 p-5">
            <h4 className="font-bold text-blue-950">Deployment note</h4>
            <p className="mt-2 text-sm leading-6 text-blue-900">
              Provider profiles are intentionally kept simple during
              deployment. After deployment, complete provider information from
              <strong> Settings → Providers</strong>.
            </p>
            <p className="mt-4 text-xs font-semibold uppercase tracking-[0.12em] text-blue-700">
              Provider Settings stores
            </p>
            <ul className="mt-2 grid gap-2 text-sm text-blue-950 sm:grid-cols-2">
              {[
                "First name",
                "Last name",
                "License / Permit Number",
                "Contact Information",
                "Future specialties",
                "Status",
                "Preferred workstation",
                "Additional permissions",
              ].map((field) => (
                <li key={field} className="flex gap-2">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
                  {field}
                </li>
              ))}
            </ul>
          </div>

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

        <div className="mt-8">
          <button
            type="button"
            onClick={onStart}
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-blue-700 px-6 py-3 text-sm font-bold text-white transition hover:bg-blue-800 active:scale-[0.99]"
          >
            Start Setup
            <ArrowRight className="h-4 w-4" />
          </button>
          <p className="mt-3 text-sm text-slate-500">
            Dashboard access becomes available after deployment is completed.
          </p>
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
