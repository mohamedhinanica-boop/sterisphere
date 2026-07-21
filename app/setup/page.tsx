"use client";

import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Check,
  ChevronDown,
  CircleAlert,
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
  type DeploymentDraft,
  type DeploymentDraftAdapterResult,
  type DeploymentExecutionResult,
  type DeploymentStageExecutionStatus,
} from "@/lib/modules/deployment";
import {
  persistDeploymentRunAction,
  type PersistDeploymentRunActionResult,
} from "./actions";
import { useEffect, useState } from "react";

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

function createEmptyActivationExecutionEvidence(input: {
  status?: "error" | "skipped";
  message?: string;
} = {}) {
  return {
    ok: false,
    status: input.status ?? "skipped",
    executionKey: null,
    planKey: null,
    clinicId: null,
    deploymentRunId: null,
    itemsRequested: 0,
    itemsReady: 0,
    itemsBlocked: 0,
    itemsPending: 0,
    reversibleItems: 0,
    irreversibleItems: 0,
    blockers: 0,
    warnings: 0,
    issues: [],
    executionItems: [],
    rollbackBoundary: {
      lastReversibleSequence: null,
      firstIrreversibleSequence: null,
      rollbackSupportedItemKeys: [],
      rollbackUnsupportedItemKeys: [],
      wouldCrossIrreversibleBoundary: false,
    },
    downstream: {
      requested: 0,
      created: 0,
      reused: 0,
      skipped: 0,
      conflicts: 0,
    },
    message: input.message ?? "Activation execution preparation was not attempted.",
  } as const;
}

function createEmptyActivationExecutionPersistenceEvidence(input: {
  status?: "error" | "not_attempted";
  message?: string;
} = {}) {
  return {
    ok: false,
    status: input.status ?? "not_attempted",
    sessionId: null,
    executionKey: null,
    planKey: null,
    sessionCreated: 0,
    sessionReused: 0,
    itemsRequested: 0,
    itemsCreated: 0,
    itemsReused: 0,
    itemsConflicted: 0,
    blockers: 0,
    warnings: 0,
    issues: [],
    downstream: {
      itemsClaimed: 0,
      itemsStarted: 0,
      itemsSucceeded: 0,
      itemsFailed: 0,
      itemsRolledBack: 0,
      sessionsCompleted: 0,
      sessionsFailed: 0,
      bindingsWritten: 0,
      entitiesActivated: 0,
      deploymentRunsFinalized: 0,
    },
    message: input.message ?? "Activation execution persistence was not attempted.",
  } as const;
}
function createEmptyActivationExecutionClaimEvidence(input: {
  status?: "error" | "not_attempted";
  message?: string;
} = {}) {
  return {
    ok: false,
    status: input.status ?? "not_attempted",
    sessionId: null,
    executionKey: null,
    planKey: null,
    claimantId: null,
    persistedOwnerId: null,
    leaseExpiresAt: null,
    claimMode: null,
    ownershipResult: null,
    sessionClaimed: 0,
    sessionReused: 0,
    sessionReclaimed: 0,
    conflicts: 0,
    blockers: 0,
    warnings: 0,
    issues: [],
    downstream: {
      sessionsClaimed: 0,
      sessionsStarted: 0,
      itemsClaimed: 0,
      itemsStarted: 0,
      itemsSucceeded: 0,
      itemsFailed: 0,
      itemsRolledBack: 0,
      entitiesActivated: 0,
      bindingsWritten: 0,
      deploymentRunsFinalized: 0,
    },
    message: input.message ?? "Activation execution claim was not attempted.",
  } as const;
}
function createEmptyActivationExecutionItemStartEvidence(input: {
  status?: "error" | "not_attempted";
  message?: string;
} = {}) {
  return {
    ok: false,
    status: input.status ?? "not_attempted",
    claimantId: null,
    sessionId: null,
    executionKey: null,
    itemId: null,
    executionItemKey: null,
    planItemKey: null,
    sequence: null,
    entityType: null,
    entityKey: null,
    entityId: null,
    action: null,
    itemExecutionStatus: null,
    attemptCount: 0,
    startedAt: null,
    leaseExpiresAt: null,
    dependencyCount: 0,
    reversible: null,
    itemStartResult: null,
    startedCount: 0,
    reusedCount: 0,
    conflicts: 0,
    blockers: 0,
    warnings: 0,
    issues: [],
    downstream: {
      itemsStarted: 0,
      itemsSucceeded: 0,
      entitiesActivated: 0,
      bindingsWritten: 0,
      deploymentFinalized: 0,
    },
    message: input.message ?? "Activation execution item start was not attempted.",
  } as const;
}
function createEmptyClinicActivationEvidence(input: {
  status?: "error" | "not_attempted";
  message?: string;
} = {}) {
  return {
    ok: false,
    status: input.status ?? "not_attempted",
    claimantId: null,
    clinicId: null,
    deploymentRunId: null,
    sessionId: null,
    executionKey: null,
    itemId: null,
    executionItemKey: null,
    planItemKey: null,
    currentClinicState: null,
    targetClinicState: null,
    deployedAt: null,
    activationResult: null,
    activatedCount: 0,
    reusedCount: 0,
    conflicts: 0,
    blockers: 0,
    warnings: 0,
    issues: [],
    downstream: {
      itemsSucceeded: 0,
      dependenciesUnlocked: 0,
      providersActivated: 0,
      sterilizersActivated: 0,
      workstationsActivated: 0,
      hardwareActivated: 0,
      bindingsWritten: 0,
      deploymentFinalized: 0,
    },
    message: input.message ?? "Clinic activation was not attempted.",
  } as const;
}
function createEmptyActivationExecutionStartEvidence(input: {
  status?: "error" | "not_attempted";
  message?: string;
} = {}) {
  return {
    ok: false,
    status: input.status ?? "not_attempted",
    sessionId: null,
    executionKey: null,
    planKey: null,
    claimantId: null,
    startedAt: null,
    leaseExpiresAt: null,
    startResult: null,
    startedCount: 0,
    reusedCount: 0,
    conflicts: 0,
    blockers: 0,
    warnings: 0,
    issues: [],
    downstream: {
      sessionsStarted: 0,
      itemsStarted: 0,
      itemsSucceeded: 0,
      itemsFailed: 0,
      itemsRolledBack: 0,
      entitiesActivated: 0,
      bindingsWritten: 0,
      deploymentRunsFinalized: 0,
      rollbacksExecuted: 0,
    },
    message: input.message ?? "Activation execution start was not attempted.",
  } as const;
}
function formatClinicActivationDiagnostics(
  diagnostics: {
    layer?: string | null;
    errorCode?: string | null;
    errorMessage?: string | null;
    errorDetails?: string | null;
    errorHint?: string | null;
    exceptionType?: string | null;
    exceptionMessage?: string | null;
    stack?: string | null;
  } | null | undefined,
): string {
  if (!diagnostics) {
    return "none";
  }

  return [
    `layer=${diagnostics.layer ?? "unknown"}`,
    `error.code=${diagnostics.errorCode ?? "none"}`,
    `error.message=${diagnostics.errorMessage ?? "none"}`,
    `error.details=${diagnostics.errorDetails ?? "none"}`,
    `error.hint=${diagnostics.errorHint ?? "none"}`,
    `exception.type=${diagnostics.exceptionType ?? "none"}`,
    `exception.message=${diagnostics.exceptionMessage ?? "none"}`,
    diagnostics.stack ? `stack=${diagnostics.stack}` : null,
  ].filter(Boolean).join("; ");
}
function formatDependencyProgressionDiagnostics(
  diagnostics: {
    layer?: string | null;
    rpcAttempted?: boolean | null;
    errorCode?: string | null;
    errorMessage?: string | null;
    errorDetails?: string | null;
    errorHint?: string | null;
    exceptionType?: string | null;
    exceptionMessage?: string | null;
  } | null | undefined,
): string {
  if (!diagnostics) {
    return "none";
  }

  return [
    `layer=${diagnostics.layer ?? "unknown"}`,
    `rpcAttempted=${diagnostics.rpcAttempted === true ? "true" : "false"}`,
    `error.code=${diagnostics.errorCode ?? "none"}`,
    `error.message=${diagnostics.errorMessage ?? "none"}`,
    `error.details=${diagnostics.errorDetails ?? "none"}`,
    `error.hint=${diagnostics.errorHint ?? "none"}`,
    `exception.type=${diagnostics.exceptionType ?? "none"}`,
    `exception.message=${diagnostics.exceptionMessage ?? "none"}`,
  ].filter(Boolean).join("; ");
}
function formatProviderShellActivationDiagnostics(
  diagnostics: {
    layer?: string | null;
    rpcAttempted?: boolean | null;
    errorCode?: string | null;
    errorMessage?: string | null;
    errorDetails?: string | null;
    errorHint?: string | null;
    exceptionType?: string | null;
    exceptionMessage?: string | null;
  } | null | undefined,
): string {
  if (!diagnostics) {
    return "none";
  }

  return [
    `layer=${diagnostics.layer ?? "unknown"}`,
    `rpcAttempted=${diagnostics.rpcAttempted === true ? "true" : "false"}`,
    `error.code=${diagnostics.errorCode ?? "none"}`,
    `error.message=${diagnostics.errorMessage ?? "none"}`,
    `error.details=${diagnostics.errorDetails ?? "none"}`,
    `error.hint=${diagnostics.errorHint ?? "none"}`,
    `exception.type=${diagnostics.exceptionType ?? "none"}`,
    `exception.message=${diagnostics.exceptionMessage ?? "none"}`,
  ].filter(Boolean).join("; ");
}
function readDeploymentStatus(
  state: Record<string, unknown> | null | undefined,
): string {
  const status = state?.deploymentStatus ?? state?.deployment_status;
  return typeof status === "string" && status.trim() ? status : "unknown";
}
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
  const [reviewedDeploymentDraft, setReviewedDeploymentDraft] =
    useState<DeploymentDraft | null>(null);
  const [deploymentRunResult, setDeploymentRunResult] =
    useState<PersistDeploymentRunActionResult | null>(null);
  const [isPersistingDeploymentRun, setIsPersistingDeploymentRun] =
    useState(false);
  const [deploymentExecutionMode, setDeploymentExecutionMode] =
    useState<"persist" | "verify">("persist");

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
    if (isPersistingDeploymentRun || (isComplete && deploymentRunResult?.ok)) {
      return;
    }

    setSetupState((current) => previousStep(current));
  }

  function startOver() {
    setSetupState(createSetupState());
    setReviewedDeploymentDraft(null);
    setDeploymentRunResult(null);
    setIsPersistingDeploymentRun(false);
    setDeploymentExecutionMode("persist");
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

    if (isReview && deploymentDraftPreview) {
      setReviewedDeploymentDraft(deploymentDraftPreview.draft);
      setDeploymentRunResult(null);
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

  async function persistDeploymentRun() {
    if (isPersistingDeploymentRun) {
      return;
    }

    if (!reviewedDeploymentDraft) {
      setDeploymentRunResult({
        ok: false,
        status: "rejected",
        deploymentRunId: null,
        deploymentSessionId: setupState.setupSessionId,
        idempotencyKey: null,
        payloadHash: null,
        clinicRoot: {
          ok: false,
          status: "skipped",
          clinicId: null,
          message: "Clinic root persistence was not attempted.",
        },
        clinicSettings: {
          ok: false,
          status: "skipped",
          settingsId: null,
          clinicId: null,
          message: "Clinic settings provisioning was not attempted.",
        },
        providerShells: {
          ok: false,
          status: "skipped",
          clinicId: null,
          requested: 0,
          created: 0,
          reused: 0,
          skipped: 0,
          conflicts: 0,
          message: "Provider shell provisioning was not attempted.",
        },
        sterilizerShells: {
          ok: false,
          status: "skipped",
          clinicId: null,
          requested: 0,
          created: 0,
          reused: 0,
          skipped: 0,
          conflicts: 0,
          message: "Sterilizer shell provisioning was not attempted.",
        },
        workstationShells: {
          ok: false,
          status: "skipped",
          clinicId: null,
          requested: 0,
          created: 0,
          reused: 0,
          skipped: 0,
          conflicts: 0,
          message: "Workstation shell provisioning was not attempted.",
        },
        hardwareShells: {
          ok: false,
          status: "skipped",
          clinicId: null,
          requested: 0,
          created: 0,
          reused: 0,
          skipped: 0,
          conflicts: 0,
          message: "Hardware shell provisioning was not attempted.",
        },
        assignmentTargetValidation: {
          ok: false,
          status: "skipped",
          clinicId: null,
          requested: 0,
          valid: 0,
          invalid: 0,
          missingTargets: 0,
          incompatibleTargets: 0,
          issues: [],
          downstream: {
            requested: 0,
            created: 0,
            reused: 0,
            skipped: 0,
            conflicts: 0,
          },
          message: "Assignment target validation was not attempted.",
        },
        hardwareAssignments: {
          ok: false,
          status: "skipped",
          clinicId: null,
          requested: 0,
          created: 0,
          reused: 0,
          skipped: 0,
          conflicts: 0,
          message: "Hardware assignment provisioning was not attempted.",
        },
        plannedAssignmentResolution: {
          ok: false,
          status: "skipped",
          clinicId: null,
          requested: 0,
          resolved: 0,
          unresolved: 0,
          missingHardware: 0,
          missingTargets: 0,
          incompatibleHardware: 0,
          incompatibleTargets: 0,
          records: [],
          issues: [],
          downstream: {
            requested: 0,
            created: 0,
            reused: 0,
            skipped: 0,
            conflicts: 0,
          },
          message: "Planned assignment resolution was not attempted.",
        },
        deploymentActivationReadiness: {
          ok: false,
          status: "skipped",
          clinicId: null,
          deploymentRunId: null,
          checksRequested: 0,
          checksPassed: 0,
          checksFailed: 0,
          blockers: 0,
          warnings: 0,
          issues: [],
          downstream: {
            requested: 0,
            created: 0,
            reused: 0,
            skipped: 0,
            conflicts: 0,
          },
          message: "Deployment activation readiness was not attempted.",
        },
        deploymentActivationPlan: {
          ok: false,
          status: "skipped",
          clinicId: null,
          deploymentRunId: null,
          planKey: null,
          itemsRequested: 0,
          itemsPlanned: 0,
          itemsBlocked: 0,
          reversibleItems: 0,
          irreversibleItems: 0,
          blockers: 0,
          warnings: 0,
          issues: [],
          planItems: [],
          downstream: {
            requested: 0,
            created: 0,
            reused: 0,
            skipped: 0,
            conflicts: 0,
          },
          message: "Controlled activation planning was not attempted.",
        },
        deploymentActivationExecution: createEmptyActivationExecutionEvidence(),
        deploymentActivationExecutionPersistence: createEmptyActivationExecutionPersistenceEvidence(),
        deploymentActivationExecutionClaim: createEmptyActivationExecutionClaimEvidence(),
        deploymentActivationExecutionStart: createEmptyActivationExecutionStartEvidence(),
        deploymentActivationExecutionItemStart: createEmptyActivationExecutionItemStartEvidence(),
                deploymentClinicActivation: createEmptyClinicActivationEvidence(),
        message:
          "Review must be confirmed before a deployment run can be persisted.",
      });
      return;
    }

    setDeploymentExecutionMode(deploymentRunResult?.ok ? "verify" : "persist");
    setIsPersistingDeploymentRun(true);
    setDeploymentRunResult(null);

    try {
      const result = await persistDeploymentRunAction(
        reviewedDeploymentDraft,
        setupState.setupSessionId,
      );
      setDeploymentRunResult(result);
    } catch {
      setDeploymentRunResult({
        ok: false,
        status: "error",
        deploymentRunId: null,
        deploymentSessionId: setupState.setupSessionId,
        idempotencyKey: null,
        payloadHash: null,
        clinicRoot: {
          ok: false,
          status: "error",
          clinicId: null,
          message:
            "Clinic root persistence was not completed. No downstream records were created.",
        },
        clinicSettings: {
          ok: false,
          status: "error",
          settingsId: null,
          clinicId: null,
          message:
            "Clinic settings provisioning was not completed. No rollback was performed.",
        },
        providerShells: {
          ok: false,
          status: "error",
          clinicId: null,
          requested: 0,
          created: 0,
          reused: 0,
          skipped: 0,
          conflicts: 0,
          message:
            "Provider shell provisioning was not completed. No downstream records were created.",
        },
        sterilizerShells: {
          ok: false,
          status: "error",
          clinicId: null,
          requested: 0,
          created: 0,
          reused: 0,
          skipped: 0,
          conflicts: 0,
          message:
            "Sterilizer shell provisioning was not completed. No downstream records were created.",
        },
        workstationShells: {
          ok: false,
          status: "error",
          clinicId: null,
          requested: 0,
          created: 0,
          reused: 0,
          skipped: 0,
          conflicts: 0,
          message:
            "Workstation shell provisioning was not completed. No downstream records were created.",
        },
        hardwareShells: {
          ok: false,
          status: "error",
          clinicId: null,
          requested: 0,
          created: 0,
          reused: 0,
          skipped: 0,
          conflicts: 0,
          message:
            "Hardware shell provisioning was not completed. No downstream records were created.",
        },
        assignmentTargetValidation: {
          ok: false,
          status: "error",
          clinicId: null,
          requested: 0,
          valid: 0,
          invalid: 0,
          missingTargets: 0,
          incompatibleTargets: 0,
          issues: [],
          downstream: {
            requested: 0,
            created: 0,
            reused: 0,
            skipped: 0,
            conflicts: 0,
          },
          message:
            "Assignment target validation was not completed. Hardware assignments were not persisted.",
        },
        hardwareAssignments: {
          ok: false,
          status: "error",
          clinicId: null,
          requested: 0,
          created: 0,
          reused: 0,
          skipped: 0,
          conflicts: 0,
          message:
            "Hardware assignment provisioning was not completed. No downstream records were created.",
        },
        plannedAssignmentResolution: {
          ok: false,
          status: "error",
          clinicId: null,
          requested: 0,
          resolved: 0,
          unresolved: 0,
          missingHardware: 0,
          missingTargets: 0,
          incompatibleHardware: 0,
          incompatibleTargets: 0,
          records: [],
          issues: [],
          downstream: {
            requested: 0,
            created: 0,
            reused: 0,
            skipped: 0,
            conflicts: 0,
          },
          message:
            "Planned assignment resolution was not completed. Logical assignments remain inactive and unbound.",
        },
        deploymentActivationReadiness: {
          ok: false,
          status: "error",
          clinicId: null,
          deploymentRunId: null,
          checksRequested: 0,
          checksPassed: 0,
          checksFailed: 0,
          blockers: 0,
          warnings: 0,
          issues: [],
          downstream: {
            requested: 0,
            created: 0,
            reused: 0,
            skipped: 0,
            conflicts: 0,
          },
          message:
            "Deployment activation readiness was not completed. No activation occurred.",
        },
        deploymentActivationPlan: {
          ok: false,
          status: "error",
          clinicId: null,
          deploymentRunId: null,
          planKey: null,
          itemsRequested: 0,
          itemsPlanned: 0,
          itemsBlocked: 0,
          reversibleItems: 0,
          irreversibleItems: 0,
          blockers: 0,
          warnings: 0,
          issues: [],
          planItems: [],
          downstream: {
            requested: 0,
            created: 0,
            reused: 0,
            skipped: 0,
            conflicts: 0,
          },
          message:
            "Controlled activation planning was not completed. No activation plan was created.",
        },
        deploymentActivationExecution: createEmptyActivationExecutionEvidence({
          status: "error",
          message:
            "Activation execution preparation was not completed. No execution session was persisted.",
        }),
        deploymentActivationExecutionPersistence: createEmptyActivationExecutionPersistenceEvidence({
          status: "error",
          message:
            "Activation execution persistence was not completed. No execution session or item rows were persisted.",
        }),
        deploymentActivationExecutionClaim: createEmptyActivationExecutionClaimEvidence({
          status: "error",
          message:
            "Activation execution claim was not completed. No ownership claim or activation began.",
        }),
        deploymentActivationExecutionStart: createEmptyActivationExecutionStartEvidence({
          status: "error",
          message:
            "Activation execution start was not completed. No execution item, activation, or binding began.",
        }),
        deploymentActivationExecutionItemStart: createEmptyActivationExecutionItemStartEvidence(),
                deploymentClinicActivation: createEmptyClinicActivationEvidence(),
        message:
          "Deployment runtime persistence failed safely. No downstream records were created.",
      });
    } finally {
      setIsPersistingDeploymentRun(false);
      setDeploymentExecutionMode("persist");
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
            <CompleteStep
              deploymentRunResult={deploymentRunResult}
              reviewedDraft={reviewedDeploymentDraft}
              isPersisting={isPersistingDeploymentRun}
              executionMode={deploymentExecutionMode}
              onStartOver={startOver}
            />
          )}

          <div className="mt-5 flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <button
              type="button"
              onClick={goBack}
              disabled={
                isWelcome ||
                isPersistingDeploymentRun ||
                (isComplete && deploymentRunResult?.ok)
              }
              className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ArrowLeft className="h-4 w-4" />
              {isComplete ? "Back to Review" : "Back"}
            </button>

            <button
              type="button"
              onClick={isComplete ? persistDeploymentRun : goNext}
              disabled={
                (isComplete &&
                  (isPersistingDeploymentRun || !reviewedDeploymentDraft)) ||
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
              aria-busy={isComplete && isPersistingDeploymentRun}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-blue-700 px-5 py-2 text-sm font-semibold text-white transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
            >
              {isComplete
                ? isPersistingDeploymentRun
                  ? deploymentExecutionMode === "verify"
                    ? "Verifying Runtime Records"
                    : "Persisting Runtime Records"
                  : deploymentRunResult?.ok
                    ? "Verify / Reuse Runtime Records"
                    : "Persist Runtime Records"
                : isReview
                  ? "Confirm Review"
                  : "Next"}
              {isComplete && isPersistingDeploymentRun ? (
                <span
                  aria-hidden="true"
                  className="h-4 w-4 animate-spin rounded-full border-2 border-slate-400 border-t-transparent"
                />
              ) : isComplete ? (
                <Rocket className="h-4 w-4" />
              ) : (
                <ArrowRight className="h-4 w-4" />
              )}
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}

const deploymentExecutionStageLabels = [
  "Preparing deployment run",
  "Linking clinic configuration",
  "Provisioning provider and sterilizer shells",
  "Provisioning workstation and hardware shells",
  "Validating assignment targets",
  "Recording planned hardware assignments",
  "Resolving planned assignment IDs",
  "Assessing activation readiness",
  "Generating controlled activation plan",
  "Preparing activation execution",
  "Persisting prepared activation execution evidence",
  "Claiming activation execution session",
  "Starting activation execution session",
  "Starting next activation execution item",
  "Finalizing deployment evidence",
] as const;

type CompleteStageMetric = {
  label: string;
  value: string | number | boolean | null | undefined;
};

type CompleteStage = {
  id: string;
  name: string;
  status: string;
  result: string;
  evidence: unknown;
  metrics: readonly CompleteStageMetric[];
  blockers: number;
  warnings: number;
  issues: readonly Record<string, unknown>[];
};

type CompleteStageGroup = {
  name: string;
  stages: readonly CompleteStage[];
};

type CompleteStageIssueGroup = {
  key: string;
  severity: string;
  code: string;
  message: string;
  count: number;
  diagnostics: readonly unknown[];
};

function buildCompleteStageGroups(input: Record<string, unknown>): CompleteStageGroup[] {
  const stage = (
    id: string,
    name: string,
    evidence: unknown,
    fallbackStatus: string,
    fallbackResult: string,
    metrics: readonly CompleteStageMetric[] = [],
  ): CompleteStage => {
    const record = readRecord(evidence);
    const status = readString(record, "status") ?? fallbackStatus;
    const issues = readIssueArray(record);

    return {
      id,
      name,
      status,
      result: readString(record, "message") ?? fallbackResult,
      evidence,
      metrics,
      blockers: readNumber(record, "blockers") ?? readNumber(record, "conflicts") ?? issues.filter((issue) => readString(issue, "severity") === "blocker").length,
      warnings: readNumber(record, "warnings") ?? issues.filter((issue) => readString(issue, "severity") === "warning").length,
      issues,
    };
  };

  const deploymentRunResult = readRecord(input.deploymentRunResult);

  return [
    {
      name: "Provisioning",
      stages: [
        stage("deployment-run", "Deployment Run", input.deploymentRunResult ? {
          status: readString(deploymentRunResult, "status"),
          message: readString(deploymentRunResult, "message"),
          deploymentRunId: readString(deploymentRunResult, "deploymentRunId"),
          deploymentSessionId: readString(deploymentRunResult, "deploymentSessionId"),
          idempotencyKey: readString(deploymentRunResult, "idempotencyKey"),
          payloadHash: readString(deploymentRunResult, "payloadHash") ?? input.payloadHash,
          ok: deploymentRunResult?.ok,
        } : null, "ready", "Ready to persist deployment run evidence.", [
          { label: "Run", value: readString(deploymentRunResult, "deploymentRunId") ?? "not persisted" },
          { label: "Hash", value: readString(deploymentRunResult, "payloadHash") ?? String(input.payloadHash ?? "pending") },
        ]),
        stage("clinic-root", "Clinic Root", input.clinicRoot, "ready", "Draft clinic root is ready to create or reuse.", [
          { label: "Clinic", value: readField(input.clinicRoot, "clinicId") ?? "not linked" },
          { label: "Result", value: readField(input.clinicRoot, "status") ?? "ready" },
        ]),
        stage("clinic-settings", "Clinic Settings", input.clinicSettings, "ready", "Clinic settings follow clinic root persistence.", [
          { label: "Settings", value: readField(input.clinicSettings, "settingsId") ?? "not linked" },
          { label: "Result", value: readField(input.clinicSettings, "status") ?? "ready" },
        ]),
        stage("provider-shells", "Provider Shells", input.providerShells, "ready", "Provider placeholder shells are planned deployment records.", shellMetrics(input.providerShells)),
        stage("sterilizer-shells", "Sterilizer Shells", input.sterilizerShells, "ready", "Sterilizer planned shells are inactive setup-draft records.", shellMetrics(input.sterilizerShells)),
        stage("workstation-shells", "Workstation Shells", input.workstationShells, "ready", "Workstation planned shells are inactive setup-draft records.", shellMetrics(input.workstationShells)),
        stage("hardware-shells", "Hardware Shells", input.hardwareShells, "ready", "Hardware planned shells are inactive setup-draft records.", shellMetrics(input.hardwareShells)),
        stage("assignment-validation", "Assignment Validation", input.assignmentTargetValidation, "not_attempted", "Assignment target validation runs before hardware assignment persistence.", [
          { label: "Checked", value: readField(input.assignmentTargetValidation, "assignmentsChecked") ?? readField(input.assignmentTargetValidation, "requested") ?? 0 },
          { label: "Issues", value: readIssueArray(readRecord(input.assignmentTargetValidation)).length },
        ]),
        stage("hardware-assignments", "Hardware Assignments", input.hardwareAssignments, "not_attempted", "Logical hardware assignments are planned setup-draft relationships.", shellMetrics(input.hardwareAssignments)),
        stage("planned-assignment-resolution", "Planned Assignment Resolution", input.plannedAssignmentResolution, "not_attempted", "Logical assignment resolution is read-only evidence.", [
          { label: "Resolved", value: readField(input.plannedAssignmentResolution, "resolved") ?? readField(input.plannedAssignmentResolution, "resolvedCount") ?? 0 },
          { label: "Missing", value: (Number(readField(input.plannedAssignmentResolution, "missingHardware") ?? 0) + Number(readField(input.plannedAssignmentResolution, "missingTargets") ?? 0)) },
        ]),
      ],
    },
    {
      name: "Activation Planning",
      stages: [
        stage("activation-readiness", "Activation Readiness", input.deploymentActivationReadiness, "not_attempted", "Activation readiness checks whether the deployment can plan activation.", blockerWarningMetrics(input.deploymentActivationReadiness)),
        stage("controlled-activation-plan", "Controlled Activation Plan", input.deploymentActivationPlan, "not_attempted", "Controlled activation planning is deterministic and read-only.", [
          { label: "Planned", value: readField(input.deploymentActivationPlan, "itemsPlanned") ?? 0 },
          { label: "Blocked", value: readField(input.deploymentActivationPlan, "itemsBlocked") ?? 0 },
        ]),
        stage("execution-preparation", "Execution Preparation", input.deploymentActivationExecution, "not_attempted", "Execution preparation creates planned activation execution evidence.", [
          { label: "Requested", value: readField(input.deploymentActivationExecution, "itemsRequested") ?? 0 },
          { label: "Ready", value: readField(input.deploymentActivationExecution, "itemsPlanned") ?? 0 },
        ]),
        stage("execution-persistence", "Execution Persistence", input.deploymentActivationExecutionPersistence, "not_attempted", "Prepared execution persistence creates or reuses durable session and item evidence.", [
          { label: "Items", value: readField(input.deploymentActivationExecutionPersistence, "itemCount") ?? readField(input.deploymentActivationExecutionPersistence, "itemsPersisted") ?? 0 },
          { label: "Conflicts", value: readField(input.deploymentActivationExecutionPersistence, "conflicts") ?? 0 },
        ]),
      ],
    },
    {
      name: "Execution Control",
      stages: [
        stage("execution-claim", "Execution Claim", input.deploymentActivationExecutionClaim, "not_attempted", "Atomic claim preserves exclusive ownership without starting activation.", [
          { label: "Claimed", value: readField(input.deploymentActivationExecutionClaim, "claimedCount") ?? 0 },
          { label: "Conflicts", value: readField(input.deploymentActivationExecutionClaim, "conflicts") ?? 0 },
        ]),
        stage("execution-start", "Execution Start", input.deploymentActivationExecutionStart, "not_attempted", "Session start marks only the activation execution session running.", [
          { label: "Started", value: readField(input.deploymentActivationExecutionStart, "startedCount") ?? 0 },
          { label: "Reused", value: readField(input.deploymentActivationExecutionStart, "reusedCount") ?? 0 },
        ]),
        stage("first-item-start", "First Item Start", input.deploymentActivationExecutionItemStart, "not_attempted", "First item start marks one deterministic execution item running.", [
          { label: "Started", value: readField(input.deploymentActivationExecutionItemStart, "startedCount") ?? 0 },
          { label: "Attempt", value: readField(input.deploymentActivationExecutionItemStart, "attemptCount") ?? 0 },
        ]),
        stage("item-completion", "Item Completion", null, "not_reported", "No separate item-completion action result is exposed to this page yet.", [
          { label: "Completed", value: "not reported" },
          { label: "Evidence", value: "pending contract" },
        ]),
        stage("dependency-progression", "Dependency Progression", input.deploymentActivationExecutionDependencyProgression, "not_attempted", "Dependency progression readies one deterministic next item after completion evidence.", [
          { label: "Progressed", value: readField(input.deploymentActivationExecutionDependencyProgression, "progressedCount") ?? 0 },
          { label: "Next", value: readField(input.deploymentActivationExecutionDependencyProgression, "nextSequence") ?? "none" },
        ]),
        stage("next-item-start", "Next Item Start", input.deploymentActivationExecutionNextItemStart, "not_attempted", "Next-item start marks the deterministic next item running only.", [
          { label: "Started", value: readField(input.deploymentActivationExecutionNextItemStart, "startedCount") ?? 0 },
          { label: "Sequence", value: readField(input.deploymentActivationExecutionNextItemStart, "sequence") ?? "none" },
        ]),
        stage("post-provider-dependency-progression", "Post-Provider Dependency Progression", input.deploymentProviderShellExecutionDependencyProgression, "not_attempted", "Post-provider dependency progression readies the next deterministic pending item without starting it.", [
          { label: "Progressed", value: readField(input.deploymentProviderShellExecutionDependencyProgression, "progressedCount") ?? 0 },
          { label: "Reused", value: readField(input.deploymentProviderShellExecutionDependencyProgression, "reusedCount") ?? 0 },
          { label: "Next", value: readField(input.deploymentProviderShellExecutionDependencyProgression, "nextSequence") ?? "none" },
        ]),
        stage("post-provider-next-item-start", "Post-Provider Next Item Start", input.deploymentProviderShellExecutionNextItemStart, "not_attempted", "Post-provider next-item start marks the next deterministic provider item running only.", [
          { label: "Started", value: readField(input.deploymentProviderShellExecutionNextItemStart, "startedCount") ?? 0 },
          { label: "Reused", value: readField(input.deploymentProviderShellExecutionNextItemStart, "reusedCount") ?? 0 },
          { label: "Sequence", value: readField(input.deploymentProviderShellExecutionNextItemStart, "sequence") ?? "none" },
        ]),
        stage("post-sterilizer-dependency-progression", "Post-Sterilizer Dependency Progression", input.deploymentSterilizerShellExecutionDependencyProgression, "not_attempted", "Post-sterilizer dependency progression readies the next deterministic item without activating it.", [
          { label: "Progressed", value: readField(input.deploymentSterilizerShellExecutionDependencyProgression, "progressedCount") ?? 0 },
          { label: "Next", value: readField(input.deploymentSterilizerShellExecutionDependencyProgression, "nextSequence") ?? "none" },
        ]),
        stage("post-sterilizer-next-item-start", "Post-Sterilizer Next Item Start", input.deploymentSterilizerShellExecutionNextItemStart, "not_attempted", "Post-sterilizer next-item start may start the first workstation item but does not dispatch it.", [
          { label: "Started", value: readField(input.deploymentSterilizerShellExecutionNextItemStart, "startedCount") ?? 0 },
          { label: "Sequence", value: readField(input.deploymentSterilizerShellExecutionNextItemStart, "sequence") ?? "none" },
        ]),
        stage("workstation-execution-step", "Workstation Execution Step", input.deploymentWorkstationExecutionStep, "not_attempted", "Workstation execution-step evidence covers one bounded activation/completion/progression/start cycle.", [
          { label: "Status", value: readField(input.deploymentWorkstationExecutionStep, "status") ?? "not attempted" },
          { label: "Sequence", value: readField(input.deploymentWorkstationExecutionStep, "sequence") ?? "none" },
        ]),
        stage("post-workstation-dependency-progression", "Post-Workstation Dependency Progression", input.deploymentWorkstationShellExecutionDependencyProgression, "not_attempted", "Post-workstation dependency progression readies the next deterministic item without activating hardware.", [
          { label: "Progressed", value: readField(input.deploymentWorkstationShellExecutionDependencyProgression, "progressedCount") ?? 0 },
          { label: "Next", value: readField(input.deploymentWorkstationShellExecutionDependencyProgression, "nextSequence") ?? "none" },
        ]),
        stage("post-workstation-next-item-start", "Post-Workstation Next Item Start", input.deploymentWorkstationShellExecutionNextItemStart, "not_attempted", "Post-workstation next-item start may start the first hardware item but does not dispatch or activate it.", [
          { label: "Started", value: readField(input.deploymentWorkstationShellExecutionNextItemStart, "startedCount") ?? 0 },
          { label: "Sequence", value: readField(input.deploymentWorkstationShellExecutionNextItemStart, "sequence") ?? "none" },
        ]),
        stage("hardware-execution-step", "Hardware Execution Step", input.deploymentHardwareExecutionStep, "not_attempted", "Hardware execution-step evidence covers one bounded activation/completion/progression/start cycle.", [
          { label: "Status", value: readField(input.deploymentHardwareExecutionStep, "status") ?? "not attempted" },
          { label: "Sequence", value: readField(input.deploymentHardwareExecutionStep, "sequence") ?? "none" },
        ]),
        stage("post-hardware-dependency-progression", "Post-Hardware Dependency Progression", input.deploymentHardwareShellExecutionDependencyProgression, "not_attempted", "Post-hardware dependency progression readies the next deterministic item without executing hardware assignments.", [
          { label: "Progressed", value: readField(input.deploymentHardwareShellExecutionDependencyProgression, "progressedCount") ?? 0 },
          { label: "Next", value: readField(input.deploymentHardwareShellExecutionDependencyProgression, "nextSequence") ?? "none" },
        ]),
        stage("post-hardware-next-item-start", "Post-Hardware Next Item Start", input.deploymentHardwareShellExecutionNextItemStart, "not_attempted", "Post-hardware next-item start may start the first Hardware Binding item but does not execute it.", [
          { label: "Started", value: readField(input.deploymentHardwareShellExecutionNextItemStart, "startedCount") ?? 0 },
          { label: "Sequence", value: readField(input.deploymentHardwareShellExecutionNextItemStart, "sequence") ?? "none" },
        ]),
        stage("hardware-binding-execution", "Hardware Binding Execution", input.deploymentHardwareBindingExecution, "not_attempted", "Hardware Binding execution writes only the durable binding and stops before item completion.", [
          { label: "Written", value: readField(input.deploymentHardwareBindingExecution, "bindingWritten") === true ? 1 : 0 },
          { label: "Reused", value: readField(readField(input.deploymentHardwareBindingExecution, "downstream"), "bindingsReused") ?? 0 },
          { label: "Target", value: readField(input.deploymentHardwareBindingExecution, "targetDeploymentKey") ?? "none" },
        ]),
        stage("hardware-binding-item-completion", "Hardware Binding Item Completion", input.deploymentHardwareBindingItemCompletion, "not_attempted", "Hardware Binding completion marks only the successfully bound running item succeeded and stops.", [
          { label: "Completed", value: readField(input.deploymentHardwareBindingItemCompletion, "completedCount") ?? 0 },
          { label: "Reused", value: readField(input.deploymentHardwareBindingItemCompletion, "reusedCount") ?? 0 },
          { label: "Status", value: readField(input.deploymentHardwareBindingItemCompletion, "completionStatus") ?? "not_attempted" },
        ]),
      ],
    },
    {
      name: "Entity Activation",
      stages: [
        stage("clinic-activation", "Clinic Activation", input.deploymentClinicActivation, "not_attempted", "Clinic activation may mark the clinic deployed for the clinic activation item only.", [
          { label: "Activated", value: readField(input.deploymentClinicActivation, "activatedCount") ?? 0 },
          { label: "Reused", value: readField(input.deploymentClinicActivation, "reusedCount") ?? 0 },
        ]),
        stage("provider-shell-activation", "Provider Shell Activation", input.deploymentProviderShellActivation, "not_attempted", "Provider shell activation targets only the selected provider shell.", [
          { label: "Activated", value: readField(input.deploymentProviderShellActivation, "activatedCount") ?? 0 },
          { label: "Conflicts", value: readField(input.deploymentProviderShellActivation, "conflicts") ?? 0 },
        ]),
        stage("provider-shell-item-completion", "Provider Shell Item Completion", input.deploymentProviderShellExecutionItemCompletion, "not_attempted", "Provider-shell item completion marks only the activated provider execution item succeeded.", [
          { label: "Completed", value: readField(input.deploymentProviderShellExecutionItemCompletion, "completedCount") ?? 0 },
          { label: "Reused", value: readField(input.deploymentProviderShellExecutionItemCompletion, "reusedCount") ?? 0 },
        ]),
        stage("sterilizer-shell-activation", "Sterilizer Shell Activation", input.deploymentSterilizerShellActivation, "not_attempted", "Sterilizer shell activation targets only the selected deterministic sterilizer shell.", [
          { label: "Activated", value: readField(input.deploymentSterilizerShellActivation, "activatedCount") ?? 0 },
          { label: "Conflicts", value: readField(input.deploymentSterilizerShellActivation, "conflicts") ?? 0 },
        ]),
        stage("sterilizer-shell-item-completion", "Sterilizer Shell Item Completion", input.deploymentSterilizerShellExecutionItemCompletion, "not_attempted", "Sterilizer-shell item completion marks only the activated sterilizer execution item succeeded.", [
          { label: "Completed", value: readField(input.deploymentSterilizerShellExecutionItemCompletion, "completedCount") ?? 0 },
          { label: "Reused", value: readField(input.deploymentSterilizerShellExecutionItemCompletion, "reusedCount") ?? 0 },
        ]),
        stage("workstation-shell-activation", "Workstation Shell Activation", input.deploymentWorkstationShellActivation, "not_attempted", "Workstation shell activation targets only the selected deterministic workstation UUID and deployment key.", [
          { label: "Activated", value: readField(input.deploymentWorkstationShellActivation, "activatedCount") ?? 0 },
          { label: "Conflicts", value: readField(input.deploymentWorkstationShellActivation, "conflicts") ?? 0 },
        ]),
        stage("workstation-shell-item-completion", "Workstation Shell Item Completion", input.deploymentWorkstationShellExecutionItemCompletion, "not_attempted", "Workstation-shell item completion marks only the activated workstation execution item succeeded.", [
          { label: "Completed", value: readField(input.deploymentWorkstationShellExecutionItemCompletion, "completedCount") ?? 0 },
          { label: "Reused", value: readField(input.deploymentWorkstationShellExecutionItemCompletion, "reusedCount") ?? 0 },
        ]),
        stage("hardware-shell-activation", "Hardware Shell Activation", input.deploymentHardwareShellActivation, "not_attempted", "Hardware shell activation targets only the selected deterministic hardware UUID and deployment key.", [
          { label: "Activated", value: readField(input.deploymentHardwareShellActivation, "activatedCount") ?? 0 },
          { label: "Conflicts", value: readField(input.deploymentHardwareShellActivation, "conflicts") ?? 0 },
        ]),
        stage("hardware-shell-item-completion", "Hardware Shell Item Completion", input.deploymentHardwareShellExecutionItemCompletion, "not_attempted", "Hardware-shell item completion marks only the activated hardware execution item succeeded.", [
          { label: "Completed", value: readField(input.deploymentHardwareShellExecutionItemCompletion, "completedCount") ?? 0 },
          { label: "Reused", value: readField(input.deploymentHardwareShellExecutionItemCompletion, "reusedCount") ?? 0 },
        ]),      ],
    },
  ];
}

function shellMetrics(evidence: unknown): readonly CompleteStageMetric[] {
  return [
    { label: "Requested", value: readField(evidence, "requested") ?? 0 },
    { label: "Created", value: readField(evidence, "created") ?? 0 },
    { label: "Reused", value: readField(evidence, "reused") ?? 0 },
    { label: "Conflicts", value: readField(evidence, "conflicts") ?? 0 },
  ];
}

function blockerWarningMetrics(evidence: unknown): readonly CompleteStageMetric[] {
  return [
    { label: "Blockers", value: readField(evidence, "blockers") ?? 0 },
    { label: "Warnings", value: readField(evidence, "warnings") ?? 0 },
  ];
}

function summarizeCompleteStageGroups(groups: readonly CompleteStageGroup[]) {
  const stages = groups.flatMap((group) => group.stages);
  return {
    activeOrSucceededCount: stages.filter(isPositiveCompleteStage).length,
    blockers: stages.reduce((total, stage) => total + stage.blockers, 0),
    warnings: stages.reduce((total, stage) => total + stage.warnings, 0),
    currentStage: stages.find(needsDefaultExpansion) ?? null,
    totalStages: stages.length,
  };
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function readString(record: Record<string, unknown> | null, key: string): string | null {
  const value = record?.[key];
  return typeof value === "string" && value.trim() ? value : null;
}

function readNumber(record: Record<string, unknown> | null, key: string): number | null {
  const value = record?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readField(value: unknown, key: string): string | number | boolean | null {
  const record = readRecord(value);
  const field = record?.[key];
  return typeof field === "string" || typeof field === "number" || typeof field === "boolean" ? field : null;
}

function readIssueArray(record: Record<string, unknown> | null): readonly Record<string, unknown>[] {
  const issues = record?.issues;
  return Array.isArray(issues) ? issues.filter((issue): issue is Record<string, unknown> => Boolean(readRecord(issue))) : [];
}

function isPositiveCompleteStage(stage: CompleteStage): boolean {
  const status = stage.status.toLowerCase();
  return ["created", "reused", "ready", "valid", "validated", "resolved", "planned", "prepared", "persisted", "claimed", "already_owned", "started", "already_started", "activated", "already_activated", "succeeded", "success", "ok"].includes(status) || status.includes("ready") || status.includes("created") || status.includes("reused");
}

function needsDefaultExpansion(stage: CompleteStage): boolean {
  const status = stage.status.toLowerCase();
  const hasBlockerIssue = stage.issues.some((issue) => readString(issue, "severity") === "blocker");
  return stage.blockers > 0 || hasBlockerIssue || ["error", "blocked", "conflict", "conflicted", "not_found", "rejected", "running", "started", "claimed", "activatable"].some((term) => status.includes(term));
}

function shouldExpandForIssues(stage: CompleteStage): boolean {
  const status = stage.status.toLowerCase();
  return stage.blockers > 0 || stage.warnings > 0 || stage.issues.some((issue) => readString(issue, "code") === "repository_error") || ["error", "blocked", "conflict", "conflicted", "not_found", "rejected"].some((term) => status.includes(term));
}

function safeEvidenceText(evidence: unknown): string {
  if (evidence === null || evidence === undefined) {
    return "No structured evidence returned for this stage.";
  }

  return JSON.stringify(evidence, null, 2);
}

function CompleteStageGroups({
  groups,
  expandedStageIds,
  onToggleStage,
  onExpandIssues,
  onExpandAll,
  onCollapseAll,
}: {
  groups: readonly CompleteStageGroup[];
  expandedStageIds: ReadonlySet<string>;
  onToggleStage: (stageId: string, expanded: boolean) => void;
  onExpandIssues: () => void;
  onExpandAll: () => void;
  onCollapseAll: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-2xl border border-white/60 bg-white/45 p-3 sm:flex-row sm:items-center sm:justify-between sm:p-4">
        <div className="min-w-0">
          <h4 className="text-sm font-bold text-slate-950">Deployment Evidence</h4>
          <p className="mt-1 text-xs text-slate-600">
            Expand only the evidence you need; all stage details remain available.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            aria-label="Expand stages with issues, blockers, warnings, conflicts, or errors"
            onClick={onExpandIssues}
            className="inline-flex min-h-9 items-center justify-center rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-800 transition hover:bg-amber-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            Expand issues
          </button>
          <button
            type="button"
            aria-label="Expand all deployment evidence stages"
            onClick={onExpandAll}
            className="inline-flex min-h-9 items-center justify-center rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            Expand all
          </button>
          <button
            type="button"
            aria-label="Collapse all deployment evidence stages"
            onClick={onCollapseAll}
            className="inline-flex min-h-9 items-center justify-center rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            Collapse all
          </button>
        </div>
      </div>
      {groups.map((group) => (
        <section key={group.name} className="rounded-2xl border border-white/60 bg-white/45 p-3 sm:p-4">
          <div className="mb-2 flex min-w-0 items-center justify-between gap-3 px-1">
            <h4 className="min-w-0 truncate text-sm font-bold text-slate-950" title={group.name}>{group.name}</h4>
            <span className="shrink-0 text-xs font-semibold text-slate-500">{group.stages.length} stages</span>
          </div>
          <div className="min-w-0 divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 bg-white/75">
            {group.stages.map((stage) => (
              <CompleteStageRow
                key={stage.id}
                stage={stage}
                expanded={expandedStageIds.has(stage.id)}
                onToggle={(expanded) => onToggleStage(stage.id, expanded)}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function CompleteStageRow({
  stage,
  expanded,
  onToggle,
}: {
  stage: CompleteStage;
  expanded: boolean;
  onToggle: (expanded: boolean) => void;
}) {
  const panelId = `complete-stage-${stage.id}`;
  const primaryMetrics = stage.metrics.slice(0, 2);
  const statusTone = stage.blockers > 0 || stage.issues.length > 0 || stage.status.toLowerCase().includes("error") || stage.status.toLowerCase().includes("conflict")
    ? "text-amber-700"
    : isPositiveCompleteStage(stage)
      ? "text-emerald-700"
      : "text-slate-500";

  return (
    <article className="min-w-0 bg-white/80">
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={panelId}
        onClick={() => onToggle(!expanded)}
        className="grid w-full min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] gap-3 px-3 py-3 text-left transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 sm:px-4"
      >
        <span className={`mt-0.5 shrink-0 ${statusTone}`} aria-hidden="true">
          {stage.blockers > 0 || stage.issues.length > 0 ? (
            <CircleAlert className="h-5 w-5" />
          ) : isPositiveCompleteStage(stage) ? (
            <Check className="h-5 w-5" />
          ) : (
            <Minus className="h-5 w-5" />
          )}
        </span>
        <span className="min-w-0">
          <span className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="min-w-0 max-w-full truncate font-semibold text-slate-950" title={stage.name}>{stage.name}</span>
            <span className="max-w-full truncate rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[0.68rem] font-semibold uppercase tracking-[0.06em] text-slate-600" title={stage.status}>
              {stage.status}
            </span>
            {stage.blockers > 0 ? <StageBadge label="Blockers" value={stage.blockers} tone="amber" /> : null}
            {stage.warnings > 0 ? <StageBadge label="Warnings" value={stage.warnings} tone="blue" /> : null}
          </span>
          <span className="mt-1 block min-w-0 truncate text-sm text-slate-600" title={stage.result}>{stage.result}</span>
          <span className="mt-2 flex min-w-0 flex-wrap gap-2 sm:hidden">
            {primaryMetrics.map((metric) => (
              <MetricChip key={metric.label} metric={metric} />
            ))}
          </span>
        </span>
        <span className="flex min-w-0 shrink-0 items-start gap-2 justify-self-end">
          <span className="hidden max-w-[22rem] min-w-0 flex-wrap justify-end gap-2 lg:flex">
            {primaryMetrics.map((metric) => (
              <MetricChip key={metric.label} metric={metric} />
            ))}
          </span>
          <ChevronDown className={`mt-1 h-4 w-4 shrink-0 text-slate-500 transition ${expanded ? "rotate-180" : ""}`} aria-hidden="true" />
        </span>
      </button>
      {expanded ? (
        <div id={panelId} className="min-w-0 border-t border-slate-200 bg-slate-50/80 px-3 py-4 sm:px-4">
          <div className="grid min-w-0 gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {stage.metrics.map((metric) => (
              <div key={metric.label} className="min-w-0 rounded-lg border border-slate-200 bg-white p-3">
                <p className="truncate text-[0.68rem] font-semibold uppercase tracking-[0.06em] text-slate-500" title={metric.label}>{metric.label}</p>
                <p className="mt-1 min-w-0 truncate text-sm font-semibold text-slate-950" title={String(metric.value ?? "none")}>{String(metric.value ?? "none")}</p>
              </div>
            ))}
          </div>
          <CompleteStageIssues stage={stage} />
          <StructuredEvidenceDisclosure stage={stage} />
        </div>
      ) : null}
    </article>
  );
}

function MetricChip({ metric }: { metric: CompleteStageMetric }) {
  const value = String(metric.value ?? "none");
  return (
    <span className="max-w-full truncate rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700" title={`${metric.label}: ${value}`}>
      {metric.label}: {value}
    </span>
  );
}

function StageBadge({ label, value, tone }: { label: string; value: number; tone: "amber" | "blue" }) {
  const classes = tone === "amber"
    ? "border-amber-200 bg-amber-50 text-amber-800"
    : "border-blue-200 bg-blue-50 text-blue-800";
  return <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[0.68rem] font-semibold ${classes}`}>{label}: {value}</span>;
}

function CompleteStageIssues({ stage }: { stage: CompleteStage }) {
  const issueGroups = groupCompleteStageIssues(stage.issues);

  if (issueGroups.length === 0) {
    return null;
  }

  return (
    <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-950">
      <p className="text-xs font-semibold uppercase tracking-[0.08em]">{stage.name} Issues</p>
      <ul className="mt-2 space-y-2 text-xs">
        {issueGroups.map((issue) => (
          <li key={issue.key} className="min-w-0 break-words rounded-md bg-white/45 p-2">
            <span className="font-semibold">{issue.severity}: {issue.code}</span>{" "}
            <span>{issue.message}</span>
            {issue.count > 1 ? <span className="ml-1 font-semibold">x{issue.count}</span> : null}
            {issue.diagnostics.length > 0 ? (
              <span className="mt-1 block space-y-1 font-mono text-[0.68rem] font-normal leading-4 text-amber-900">
                {issue.diagnostics.map((diagnostic: unknown, index: number) => (
                  <span key={`${issue.key}-diagnostic-${index}`} className="block overflow-x-auto whitespace-pre-wrap break-words">
                    {JSON.stringify(diagnostic)}
                  </span>
                ))}
              </span>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

function groupCompleteStageIssues(issues: readonly Record<string, unknown>[]): readonly CompleteStageIssueGroup[] {
  const groups = new Map<string, CompleteStageIssueGroup>();

  for (const issue of issues) {
    const severity = readString(issue, "severity") ?? "issue";
    const code = readString(issue, "code") ?? "unknown";
    const message = readString(issue, "message") ?? "No issue message returned.";
    const diagnostics = readRecord(issue.diagnostics);
    const key = diagnostics ? `${severity}:${code}:${message}:${JSON.stringify(diagnostics)}` : `${severity}:${code}:${message}`;
    const current = groups.get(key);

    if (current) {
      groups.set(key, {
        ...current,
        count: current.count + 1,
      });
    } else {
      groups.set(key, {
        key,
        severity,
        code,
        message,
        count: 1,
        diagnostics: diagnostics ? [diagnostics] : [],
      });
    }
  }

  return [...groups.values()];
}

function StructuredEvidenceDisclosure({ stage }: { stage: CompleteStage }) {
  const [expanded, setExpanded] = useState(false);
  const panelId = `complete-stage-${stage.id}-structured-evidence`;

  return (
    <div className="mt-3 rounded-lg border border-slate-200 bg-white p-3">
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={panelId}
        aria-label={`Toggle structured evidence for ${stage.name}`}
        onClick={() => setExpanded((current) => !current)}
        className="flex w-full min-w-0 items-center justify-between gap-3 text-left text-xs font-semibold uppercase tracking-[0.08em] text-slate-500 transition hover:text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
      >
        <span className="min-w-0 truncate">Structured Evidence</span>
        <ChevronDown className={`h-4 w-4 shrink-0 transition ${expanded ? "rotate-180" : ""}`} aria-hidden="true" />
      </button>
      {expanded ? (
        <pre id={panelId} className="mt-2 max-h-72 max-w-full overflow-auto whitespace-pre rounded-md bg-slate-950 p-3 text-[0.68rem] leading-4 text-slate-100">
          {safeEvidenceText(stage.evidence)}
        </pre>
      ) : null}
    </div>
  );
}
function KnownLimitations() {
  const limitations = [
    "Rollback execution is unavailable.",
    "Heartbeat and background worker orchestration are unavailable.",
    "Hardware Binding item completion evidence is exposed as a separate terminal stage.",
    "Dependency progression and next-item start remain single-boundary controls.",
    "Entity activation is limited to the explicit clinic and provider-shell stages shown.",
    "Deployment finalization is unavailable.",
  ];

  return (
    <section className="rounded-2xl border border-slate-200 bg-white/70 p-4 text-sm text-slate-700">
      <h4 className="font-bold text-slate-950">Known Limitations</h4>
      <ul className="mt-2 grid gap-2 sm:grid-cols-2">
        {limitations.map((limitation) => (
          <li key={limitation} className="flex gap-2">
            <Minus className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
            <span>{limitation}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
function CompleteStep({
  deploymentRunResult,
  reviewedDraft,
  isPersisting,
  executionMode,
  onStartOver,
}: {
  deploymentRunResult: PersistDeploymentRunActionResult | null;
  reviewedDraft: DeploymentDraft | null;
  isPersisting: boolean;
  executionMode: "persist" | "verify";
  onStartOver: () => void;
}) {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const completedDraftSections = [
    "Clinic profile configured",
    "Workstations planned",
    "Provider structure planned",
    "Sterilizers planned",
    "Baseline policies selected",
    "Hardware quantities planned",
    "Review completed",
  ];
  const payloadHash = reviewedDraft
    ? hashDeploymentDraftInput(reviewedDraft)
    : null;
  const deploymentRunPersisted = Boolean(deploymentRunResult?.deploymentRunId);
  const clinicRoot = deploymentRunResult?.clinicRoot ?? null;
  const clinicSettings = deploymentRunResult?.clinicSettings ?? null;
  const providerShells = deploymentRunResult?.providerShells ?? null;
  const sterilizerShells = deploymentRunResult?.sterilizerShells ?? null;
  const workstationShells = deploymentRunResult?.workstationShells ?? null;
  const hardwareShells = deploymentRunResult?.hardwareShells ?? null;
  const assignmentTargetValidation =
    deploymentRunResult?.assignmentTargetValidation ?? null;
  const hardwareAssignments = deploymentRunResult?.hardwareAssignments ?? null;
  const plannedAssignmentResolution =
    deploymentRunResult?.plannedAssignmentResolution ?? null;
  const deploymentActivationReadiness =
    deploymentRunResult?.deploymentActivationReadiness ?? null;
  const deploymentActivationPlan =
    deploymentRunResult?.deploymentActivationPlan ?? null;
  const deploymentActivationExecution =
    deploymentRunResult?.deploymentActivationExecution ?? null;
  const deploymentActivationExecutionPersistence =
    deploymentRunResult?.deploymentActivationExecutionPersistence ?? null;
  const deploymentActivationExecutionClaim =
    deploymentRunResult?.deploymentActivationExecutionClaim ?? null;
  const deploymentActivationExecutionStart =
    deploymentRunResult?.deploymentActivationExecutionStart ?? null;
  const deploymentActivationExecutionItemStart =
    deploymentRunResult?.deploymentActivationExecutionItemStart ?? null;
  const deploymentClinicActivation =
    deploymentRunResult?.deploymentClinicActivation ?? null;
  const deploymentActivationExecutionDependencyProgression =
    deploymentRunResult?.deploymentActivationExecutionDependencyProgression ?? null;
  const deploymentActivationExecutionNextItemStart =
    deploymentRunResult?.deploymentActivationExecutionNextItemStart ?? null;
  const deploymentProviderShellActivation =
    deploymentRunResult?.deploymentProviderShellActivation ?? null;
  const deploymentProviderShellExecutionItemCompletion =
    deploymentRunResult?.deploymentProviderShellExecutionItemCompletion ?? null;
  const deploymentProviderShellExecutionDependencyProgression =
    deploymentRunResult?.deploymentProviderShellExecutionDependencyProgression ?? null;
  const deploymentProviderShellExecutionNextItemStart =
    deploymentRunResult?.deploymentProviderShellExecutionNextItemStart ?? null;
  const deploymentSterilizerShellActivation =
    deploymentRunResult?.deploymentSterilizerShellActivation ?? null;
  const deploymentSterilizerShellExecutionItemCompletion =
    deploymentRunResult?.deploymentSterilizerShellExecutionItemCompletion ?? null;
  const deploymentSterilizerShellExecutionDependencyProgression =
    deploymentRunResult?.deploymentSterilizerShellExecutionDependencyProgression ?? null;
  const deploymentSterilizerShellExecutionNextItemStart =
    deploymentRunResult?.deploymentSterilizerShellExecutionNextItemStart ?? null;
  const deploymentWorkstationExecutionStep =
    deploymentRunResult?.deploymentWorkstationExecutionStep ?? null;
  const deploymentWorkstationShellActivation =
    deploymentRunResult?.deploymentWorkstationShellActivation ?? null;
  const deploymentWorkstationShellExecutionItemCompletion =
    deploymentRunResult?.deploymentWorkstationShellExecutionItemCompletion ?? null;
  const deploymentWorkstationShellExecutionDependencyProgression =
    deploymentRunResult?.deploymentWorkstationShellExecutionDependencyProgression ?? null;
  const deploymentWorkstationShellExecutionNextItemStart =
    deploymentRunResult?.deploymentWorkstationShellExecutionNextItemStart ?? null;  const deploymentHardwareExecutionStep =
    deploymentRunResult?.deploymentHardwareExecutionStep ?? null;
  const deploymentHardwareShellActivation =
    deploymentRunResult?.deploymentHardwareShellActivation ?? null;
  const deploymentHardwareShellExecutionItemCompletion =
    deploymentRunResult?.deploymentHardwareShellExecutionItemCompletion ?? null;
  const deploymentHardwareShellExecutionDependencyProgression =
    deploymentRunResult?.deploymentHardwareShellExecutionDependencyProgression ?? null;
  const deploymentHardwareShellExecutionNextItemStart =
    deploymentRunResult?.deploymentHardwareShellExecutionNextItemStart ?? null;
  const deploymentHardwareBindingExecution =
    deploymentRunResult?.deploymentHardwareBindingExecution ?? null;
  const deploymentHardwareBindingItemCompletion =
    deploymentRunResult?.deploymentHardwareBindingItemCompletion ?? null;
  const statusTone = deploymentRunResult?.ok
    ? "border-emerald-200 bg-emerald-50 text-emerald-950"
    : deploymentRunResult
      ? "border-amber-200 bg-amber-50 text-amber-950"
      : "border-blue-200 bg-blue-50 text-blue-950";
  const statusTitle = deploymentRunResult
    ? deploymentRunPersisted
      ? deploymentRunResult.status === "reused"
        ? "Deployment run reused"
        : "Deployment run persisted"
      : "Deployment run not persisted"
    : isPersisting
      ? "Persisting deployment runtime records"
      : "Ready to persist deployment runtime records";
  const supportHref = buildDeploymentSupportHref(deploymentRunResult);
  const executionStageLabel =
    deploymentExecutionStageLabels[
      Math.min(
        deploymentExecutionStageLabels.length - 1,
        Math.floor(elapsedSeconds / 4),
      )
    ];
  const executionTitle =
    executionMode === "verify"
      ? "Verifying deployment records"
      : "Provisioning clinic runtime";

  const stageGroups = buildCompleteStageGroups({
    deploymentRunResult,
    payloadHash,
    clinicRoot,
    clinicSettings,
    providerShells,
    sterilizerShells,
    workstationShells,
    hardwareShells,
    assignmentTargetValidation,
    hardwareAssignments,
    plannedAssignmentResolution,
    deploymentActivationReadiness,
    deploymentActivationPlan,
    deploymentActivationExecution,
    deploymentActivationExecutionPersistence,
    deploymentActivationExecutionClaim,
    deploymentActivationExecutionStart,
    deploymentActivationExecutionItemStart,
    deploymentClinicActivation,
    deploymentActivationExecutionDependencyProgression,
    deploymentActivationExecutionNextItemStart,
    deploymentProviderShellActivation,
    deploymentProviderShellExecutionItemCompletion,
    deploymentProviderShellExecutionDependencyProgression,
    deploymentProviderShellExecutionNextItemStart,
    deploymentSterilizerShellActivation,
    deploymentSterilizerShellExecutionItemCompletion,
    deploymentSterilizerShellExecutionDependencyProgression,
    deploymentSterilizerShellExecutionNextItemStart,
    deploymentWorkstationExecutionStep,
    deploymentWorkstationShellActivation,
    deploymentWorkstationShellExecutionItemCompletion,
    deploymentWorkstationShellExecutionDependencyProgression,
    deploymentWorkstationShellExecutionNextItemStart,
    deploymentHardwareExecutionStep,
    deploymentHardwareShellActivation,
    deploymentHardwareShellExecutionItemCompletion,
    deploymentHardwareShellExecutionDependencyProgression,
    deploymentHardwareShellExecutionNextItemStart,
    deploymentHardwareBindingExecution,
    deploymentHardwareBindingItemCompletion,
  });
  const stageSummary = summarizeCompleteStageGroups(stageGroups);
  const defaultExpandedStageIds = stageSummary.currentStage ? [stageSummary.currentStage.id] : [];
  const [manuallyExpandedStageIds, setManuallyExpandedStageIds] = useState<Set<string> | null>(null);
  const expandedStageIds = manuallyExpandedStageIds ?? new Set(defaultExpandedStageIds);
  const allStageIds = stageGroups.flatMap((group) => group.stages.map((stage) => stage.id));
  const issueStageIds = stageGroups.flatMap((group) => group.stages.filter(shouldExpandForIssues).map((stage) => stage.id));
  const toggleStageExpansion = (stageId: string, expanded: boolean) => {
    setManuallyExpandedStageIds((current) => {
      const next = new Set(current ?? defaultExpandedStageIds);
      if (expanded) {
        next.add(stageId);
      } else {
        next.delete(stageId);
      }
      return next;
    });
  };
  const expandIssueStages = () => setManuallyExpandedStageIds(new Set(issueStageIds));
  const expandAllStages = () => setManuallyExpandedStageIds(new Set(allStageIds));
  const collapseAllStages = () => setManuallyExpandedStageIds(new Set());
  const currentStageName = stageSummary.currentStage?.name ?? (isPersisting ? executionStageLabel : "Ready");
  const summaryClinicId = clinicRoot?.clinicId ?? deploymentClinicActivation?.clinicId ?? "Not linked";
  const summaryExecutionSessionId = deploymentActivationExecutionPersistence?.sessionId ?? deploymentActivationExecutionClaim?.sessionId ?? deploymentActivationExecutionStart?.sessionId ?? deploymentActivationExecutionItemStart?.sessionId ?? deploymentClinicActivation?.sessionId ?? deploymentActivationExecutionDependencyProgression?.sessionId ?? deploymentActivationExecutionNextItemStart?.sessionId ?? deploymentProviderShellExecutionNextItemStart?.sessionId ?? deploymentProviderShellExecutionDependencyProgression?.sessionId ?? deploymentProviderShellActivation?.sessionId ?? deploymentHardwareShellExecutionNextItemStart?.sessionId ?? deploymentHardwareShellActivation?.sessionId ?? deploymentWorkstationShellExecutionNextItemStart?.sessionId ?? deploymentWorkstationShellActivation?.sessionId ?? deploymentSterilizerShellExecutionNextItemStart?.sessionId ?? deploymentSterilizerShellActivation?.sessionId ?? "Not started";
  useEffect(() => {
    if (!isPersisting) {
      setElapsedSeconds(0);
      return;
    }

    setElapsedSeconds(0);
    const intervalId = window.setInterval(() => {
      setElapsedSeconds((current) => current + 1);
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, [isPersisting]);

  return (
    <div
      aria-busy={isPersisting}
      className="overflow-hidden rounded-3xl border border-emerald-200 bg-white shadow-sm"
    >
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

        <div className={`mt-6 rounded-2xl border p-5 text-sm leading-6 ${statusTone}`}>
          <p className="font-bold">{statusTitle}</p>
          <p className="mt-2">
            {isPersisting
              ? "Please keep this page open while SteriSphere processes the secure setup stages."
              : deploymentRunResult?.message ??
                "Confirm deployment to persist a deployment_runs evidence record and draft clinic root."}
          </p>

          {isPersisting && (
            <div
              role="status"
              aria-live="polite"
              className="mt-4 rounded-xl border border-white/60 bg-white/60 p-4"
            >
              <div className="flex items-start gap-3">
                <span
                  aria-hidden="true"
                  className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-900/10"
                >
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-emerald-800 border-t-transparent" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-bold">{executionTitle}</p>
                  <p className="mt-1">
                    Several secure setup stages are being processed. This may
                    take a few moments.
                  </p>
                  <p className="mt-3 text-xs font-semibold uppercase leading-4 tracking-[0.06em] opacity-70">
                    Current activity
                  </p>
                  <p className="mt-1 font-semibold">{executionStageLabel}</p>
                  <p className="mt-1 text-xs opacity-75">
                    These labels are informational while the server action runs;
                    final evidence appears when processing completes.
                  </p>
                </div>
                <span className="shrink-0 text-xs font-semibold opacity-75">
                  {elapsedSeconds}s
                </span>
              </div>
              <div className="mt-4 h-2 overflow-hidden rounded-full bg-emerald-950/10">
                <div className="h-full w-1/2 animate-pulse rounded-full bg-emerald-700" />
              </div>
            </div>
          )}

          <dl className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div>
              <dt className="text-xs font-semibold uppercase tracking-[0.12em] opacity-70">
                Overall Status
              </dt>
              <dd className="mt-1 font-semibold">
                {deploymentRunResult?.status ?? (isPersisting ? "running" : "ready")}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-[0.12em] opacity-70">
                Clinic ID
              </dt>
              <dd className="mt-1 break-all font-mono text-xs">
                {summaryClinicId}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-[0.12em] opacity-70">
                Run ID
              </dt>
              <dd className="mt-1 break-all font-mono text-xs">
                {deploymentRunResult?.deploymentRunId ?? "Not persisted"}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-[0.12em] opacity-70">
                Execution Session ID
              </dt>
              <dd className="mt-1 break-all font-mono text-xs">
                {summaryExecutionSessionId}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-[0.12em] opacity-70">
                Current Stage
              </dt>
              <dd className="mt-1 font-semibold">
                {currentStageName}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-[0.12em] opacity-70">
                Succeeded / Active
              </dt>
              <dd className="mt-1 font-semibold">
                {stageSummary.activeOrSucceededCount} of {stageSummary.totalStages}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-[0.12em] opacity-70">
                Blockers
              </dt>
              <dd className="mt-1 font-semibold">
                {stageSummary.blockers}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-[0.12em] opacity-70">
                Warnings
              </dt>
              <dd className="mt-1 font-semibold">
                {stageSummary.warnings}
              </dd>
            </div>
          </dl>

          <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1fr)_18rem]">
            <div className="min-w-0">
              <CompleteStageGroups
                groups={stageGroups}
                expandedStageIds={expandedStageIds}
                onToggleStage={toggleStageExpansion}
                onExpandIssues={expandIssueStages}
                onExpandAll={expandAllStages}
                onCollapseAll={collapseAllStages}
              />
            </div>
            <aside className="space-y-4 xl:sticky xl:top-4 xl:self-start">
              <div className="rounded-2xl border border-white/60 bg-white/65 p-4 text-slate-800">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                  Current Stage
                </p>
                <p className="mt-2 text-lg font-bold text-slate-950">{currentStageName}</p>
                <dl className="mt-4 grid gap-3 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-slate-500">Succeeded/active</dt>
                    <dd className="font-semibold text-slate-950">{stageSummary.activeOrSucceededCount}/{stageSummary.totalStages}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-slate-500">Blockers</dt>
                    <dd className="font-semibold text-amber-700">{stageSummary.blockers}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-slate-500">Warnings</dt>
                    <dd className="font-semibold text-blue-700">{stageSummary.warnings}</dd>
                  </div>
                </dl>
              </div>
              <KnownLimitations />
            </aside>
          </div>

          <div className="mt-5 rounded-2xl border border-slate-200 bg-white/70 p-4 text-xs leading-5 text-slate-700">
            <p className="font-semibold uppercase tracking-[0.08em] text-slate-500">
              Persistence Boundary
            </p>
            <p className="mt-2">
              Deployment runtime persistence currently writes deployment_runs,
              draft public.clinics rows, public.clinic_settings,
              public.providers placeholder shells, public.sterilizers planned shells,
              public.clinical_workstations planned shells,
              public.clinical_hardware_devices planned shells,
              public.deployment_hardware_assignments planned logical relationships,
              activation readiness and planning evidence, and prepared activation execution evidence only. A prepared session may be claimed for exclusive ownership, then atomically marked running on the session row only. Execution item boundaries and entity activation remain explicit stage controls; the Hardware Binding stage may write its selected durable binding and complete that same item, while no downstream item starts and no users, packs, cycles, traces, audit logs, rollback work, or deployment finalization occurs from this page rendering.
            </p>
          </div>

          <div className="mt-5 flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white/75 p-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
            <button
              type="button"
              disabled
              className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl bg-slate-200 px-4 py-2 text-sm font-semibold text-slate-500 disabled:cursor-not-allowed sm:w-auto"
              title="Automatic workspace access will be enabled after clinic activation is implemented."
            >
              Access SteriSphere Platform
            </button>
            <button
              type="button"
              onClick={onStartOver}
              disabled={isPersisting}
              className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto"
            >
              Start Over
            </button>
            <a
              href={supportHref}
              className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl border border-blue-300 bg-white px-4 py-2 text-sm font-semibold text-blue-700 transition hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 sm:w-auto"
            >
              Contact Support
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
function buildDeploymentSupportHref(
  result: PersistDeploymentRunActionResult | null,
): string {
  const subject = encodeURIComponent("SteriSphere deployment support");
  const body = encodeURIComponent(
    [
      "Please help with this SteriSphere deployment session.",
      "",
      `Deployment session ID: ${result?.deploymentSessionId ?? "not persisted"}`,
      `Deployment run ID: ${result?.deploymentRunId ?? "not persisted"}`,
      `Idempotency key: ${result?.idempotencyKey ?? "not available"}`,
      `Payload hash: ${result?.payloadHash ?? "not available"}`,
      `Deployment run status: ${result?.status ?? "not persisted"}`,
      `Clinic root status: ${result?.clinicRoot.status ?? "not attempted"}`,
      `Clinic ID: ${result?.clinicRoot.clinicId ?? "not linked"}`,
      `Clinic settings status: ${result?.clinicSettings.status ?? "not attempted"}`,
      `Clinic settings ID: ${result?.clinicSettings.settingsId ?? "not linked"}`,
      `Provider shells status: ${result?.providerShells.status ?? "not attempted"}`,
      `Provider shells requested: ${result?.providerShells.requested ?? 0}`,
      `Provider shells created: ${result?.providerShells.created ?? 0}`,
      `Provider shells reused: ${result?.providerShells.reused ?? 0}`,
      `Provider shell conflicts: ${result?.providerShells.conflicts ?? 0}`,
      `Sterilizer shells status: ${result?.sterilizerShells.status ?? "not attempted"}`,
      `Sterilizer shells requested: ${result?.sterilizerShells.requested ?? 0}`,
      `Sterilizer shells created: ${result?.sterilizerShells.created ?? 0}`,
      `Sterilizer shells reused: ${result?.sterilizerShells.reused ?? 0}`,
      `Sterilizer shell conflicts: ${result?.sterilizerShells.conflicts ?? 0}`,
      `Workstation shells status: ${result?.workstationShells.status ?? "not attempted"}`,
      `Workstation shells requested: ${result?.workstationShells.requested ?? 0}`,
      `Workstation shells created: ${result?.workstationShells.created ?? 0}`,
      `Workstation shells reused: ${result?.workstationShells.reused ?? 0}`,
      `Workstation shell conflicts: ${result?.workstationShells.conflicts ?? 0}`,
      `Hardware shells status: ${result?.hardwareShells.status ?? "not attempted"}`,
      `Hardware shells requested: ${result?.hardwareShells.requested ?? 0}`,
      `Hardware shells created: ${result?.hardwareShells.created ?? 0}`,
      `Hardware shells reused: ${result?.hardwareShells.reused ?? 0}`,
      `Hardware shell conflicts: ${result?.hardwareShells.conflicts ?? 0}`,
      `Assignment target validation status: ${result?.assignmentTargetValidation.status ?? "not attempted"}`,
      `Assignment target validation requested: ${result?.assignmentTargetValidation.requested ?? 0}`,
      `Assignment target validation valid: ${result?.assignmentTargetValidation.valid ?? 0}`,
      `Assignment target validation invalid: ${result?.assignmentTargetValidation.invalid ?? 0}`,
      `Assignment target validation missing targets: ${result?.assignmentTargetValidation.missingTargets ?? 0}`,
      `Assignment target validation incompatible targets: ${result?.assignmentTargetValidation.incompatibleTargets ?? 0}`,
      `Assignment target validation issues: ${result?.assignmentTargetValidation.issues.map((issue) => `${issue.deploymentHardwareKey}:${issue.targetType}:${issue.targetDeploymentKey ?? "none"}:${issue.code}`).join("; ") ?? "none"}`,
      `Hardware assignments status: ${result?.hardwareAssignments.status ?? "not attempted"}`,
      `Hardware assignments requested: ${result?.hardwareAssignments.requested ?? 0}`,
      `Hardware assignments created: ${result?.hardwareAssignments.created ?? 0}`,
      `Hardware assignments reused: ${result?.hardwareAssignments.reused ?? 0}`,
      `Hardware assignment conflicts: ${result?.hardwareAssignments.conflicts ?? 0}`,
      `Planned assignment resolution status: ${result?.plannedAssignmentResolution.status ?? "not attempted"}`,
      `Planned assignment resolution requested: ${result?.plannedAssignmentResolution.requested ?? 0}`,
      `Planned assignment resolution resolved: ${result?.plannedAssignmentResolution.resolved ?? 0}`,
      `Planned assignment resolution unresolved: ${result?.plannedAssignmentResolution.unresolved ?? 0}`,
      `Planned assignment resolution missing hardware: ${result?.plannedAssignmentResolution.missingHardware ?? 0}`,
      `Planned assignment resolution missing targets: ${result?.plannedAssignmentResolution.missingTargets ?? 0}`,
      `Planned assignment resolution incompatible hardware: ${result?.plannedAssignmentResolution.incompatibleHardware ?? 0}`,
      `Planned assignment resolution incompatible targets: ${result?.plannedAssignmentResolution.incompatibleTargets ?? 0}`,
      `Planned assignment resolution records: ${result?.plannedAssignmentResolution.records.map((record) => `${record.deploymentHardwareKey}:${record.hardwareId ?? "none"}:${record.targetType}:${record.targetDeploymentKey ?? "none"}:${record.targetId ?? "none"}:${record.resolutionStatus}`).join("; ") ?? "none"}`,
      `Planned assignment resolution issues: ${result?.plannedAssignmentResolution.issues.map((issue) => `${issue.deploymentHardwareKey}:${issue.assignmentKey ?? "none"}:${issue.targetType}:${issue.targetDeploymentKey ?? "none"}:${issue.code}`).join("; ") ?? "none"}`,
      `Deployment activation readiness status: ${result?.deploymentActivationReadiness.status ?? "not attempted"}`,
      `Deployment activation readiness checks requested: ${result?.deploymentActivationReadiness.checksRequested ?? 0}`,
      `Deployment activation readiness checks passed: ${result?.deploymentActivationReadiness.checksPassed ?? 0}`,
      `Deployment activation readiness checks failed: ${result?.deploymentActivationReadiness.checksFailed ?? 0}`,
      `Deployment activation readiness blockers: ${result?.deploymentActivationReadiness.blockers ?? 0}`,
      `Deployment activation readiness warnings: ${result?.deploymentActivationReadiness.warnings ?? 0}`,
      `Deployment activation readiness issues: ${result?.deploymentActivationReadiness.issues.map((issue) => `${issue.severity}:${issue.entityType}:${issue.deploymentKey ?? "none"}:${issue.code}`).join("; ") ?? "none"}`,
      `Activation plan status: ${result?.deploymentActivationPlan.status ?? "not attempted"}`,
      `Activation plan key: ${result?.deploymentActivationPlan.planKey ?? "not generated"}`,
      `Activation plan items requested: ${result?.deploymentActivationPlan.itemsRequested ?? 0}`,
      `Activation plan items planned: ${result?.deploymentActivationPlan.itemsPlanned ?? 0}`,
      `Activation plan items blocked: ${result?.deploymentActivationPlan.itemsBlocked ?? 0}`,
      `Activation plan reversible items: ${result?.deploymentActivationPlan.reversibleItems ?? 0}`,
      `Activation plan irreversible items: ${result?.deploymentActivationPlan.irreversibleItems ?? 0}`,
      `Activation plan blockers: ${result?.deploymentActivationPlan.blockers ?? 0}`,
      `Activation plan warnings: ${result?.deploymentActivationPlan.warnings ?? 0}`,
      `Activation plan issues: ${result?.deploymentActivationPlan.issues.map((issue) => `${issue.severity}:${issue.entityType}:${issue.deploymentKey ?? "none"}:${issue.code}`).join("; ") ?? "none"}`,
      `Activation plan items: ${result?.deploymentActivationPlan.planItems.map((item) => `${item.sequence}:${item.entityType}:${item.deploymentKey ?? "none"}:${item.action}`).join("; ") ?? "none"}`,
      `Activation execution preparation status: ${result?.deploymentActivationExecution.status ?? "not attempted"}`,
      `Activation execution key: ${result?.deploymentActivationExecution.executionKey ?? "not prepared"}`,
      `Activation execution plan key: ${result?.deploymentActivationExecution.planKey ?? "not generated"}`,
      `Activation execution items requested: ${result?.deploymentActivationExecution.itemsRequested ?? 0}`,
      `Activation execution items ready: ${result?.deploymentActivationExecution.itemsReady ?? 0}`,
      `Activation execution items pending: ${result?.deploymentActivationExecution.itemsPending ?? 0}`,
      `Activation execution items blocked: ${result?.deploymentActivationExecution.itemsBlocked ?? 0}`,
      `Activation execution blockers: ${result?.deploymentActivationExecution.blockers ?? 0}`,
      `Activation execution warnings: ${result?.deploymentActivationExecution.warnings ?? 0}`,
      `Activation execution rollback boundary: last reversible ${result?.deploymentActivationExecution.rollbackBoundary.lastReversibleSequence ?? "none"}; first irreversible ${result?.deploymentActivationExecution.rollbackBoundary.firstIrreversibleSequence ?? "none"}; crosses irreversible ${result?.deploymentActivationExecution.rollbackBoundary.wouldCrossIrreversibleBoundary ? "yes" : "no"}`,
      `Activation execution issues: ${result?.deploymentActivationExecution.issues.map((issue) => `${issue.severity}:${issue.entityType}:${issue.deploymentKey ?? "none"}:${issue.code}`).join("; ") ?? "none"}`,
      `Activation execution items: ${result?.deploymentActivationExecution.executionItems.slice(0, 8).map((item) => `${item.sequence}:${item.action}:${item.entityType}:${item.deploymentKey ?? "none"}:${item.executionStatus}`).join("; ") ?? "none"}`,
      `Activation execution message: ${result?.deploymentActivationExecution.message ?? "No activation-execution-preparation response yet."}`,
      `Activation execution persistence status: ${result?.deploymentActivationExecutionPersistence.status ?? "not attempted"}`,
      `Activation execution persistence session ID: ${result?.deploymentActivationExecutionPersistence.sessionId ?? "not persisted"}`,
      `Activation execution persistence execution key: ${result?.deploymentActivationExecutionPersistence.executionKey ?? "not prepared"}`,
      `Activation execution persistence plan key: ${result?.deploymentActivationExecutionPersistence.planKey ?? "not generated"}`,
      `Activation execution persistence session created: ${result?.deploymentActivationExecutionPersistence.sessionCreated ?? 0}`,
      `Activation execution persistence session reused: ${result?.deploymentActivationExecutionPersistence.sessionReused ?? 0}`,
      `Activation execution persistence items requested: ${result?.deploymentActivationExecutionPersistence.itemsRequested ?? 0}`,
      `Activation execution persistence items created: ${result?.deploymentActivationExecutionPersistence.itemsCreated ?? 0}`,
      `Activation execution persistence items reused: ${result?.deploymentActivationExecutionPersistence.itemsReused ?? 0}`,
      `Activation execution persistence item conflicts: ${result?.deploymentActivationExecutionPersistence.itemsConflicted ?? 0}`,
      `Activation execution persistence blockers: ${result?.deploymentActivationExecutionPersistence.blockers ?? 0}`,
      `Activation execution persistence warnings: ${result?.deploymentActivationExecutionPersistence.warnings ?? 0}`,
      `Activation execution persistence issues: ${result?.deploymentActivationExecutionPersistence.issues.map((issue) => `${issue.severity}:${issue.executionKey ?? "none"}:${issue.executionItemKey ?? "none"}:${issue.code}`).join("; ") ?? "none"}`,
      `Activation execution persistence message: ${result?.deploymentActivationExecutionPersistence.message ?? "No activation-execution-persistence response yet."}`,
      `Activation execution claim status: ${result?.deploymentActivationExecutionClaim.status ?? "not attempted"}`,
      `Activation execution claim claimant: ${result?.deploymentActivationExecutionClaim.claimantId ?? "not assigned"}`,
      `Activation execution claim lease expiration: ${result?.deploymentActivationExecutionClaim.leaseExpiresAt ?? "no lease"}`,
      `Activation execution claim session ID: ${result?.deploymentActivationExecutionClaim.sessionId ?? "not claimed"}`,
      `Activation execution claim execution key: ${result?.deploymentActivationExecutionClaim.executionKey ?? "not prepared"}`,
      `Activation execution claim plan key: ${result?.deploymentActivationExecutionClaim.planKey ?? "not generated"}`,
      `Activation execution claim mode: ${result?.deploymentActivationExecutionClaim.claimMode ?? "none"}`,
      `Activation execution claim counts: claimed ${result?.deploymentActivationExecutionClaim.sessionClaimed ?? 0}, reused ${result?.deploymentActivationExecutionClaim.sessionReused ?? 0}, reclaimed ${result?.deploymentActivationExecutionClaim.sessionReclaimed ?? 0}, conflicts ${result?.deploymentActivationExecutionClaim.conflicts ?? 0}`,
      `Activation execution claim blockers: ${result?.deploymentActivationExecutionClaim.blockers ?? 0}`,
      `Activation execution claim warnings: ${result?.deploymentActivationExecutionClaim.warnings ?? 0}`,
      `Activation execution claim issues: ${result?.deploymentActivationExecutionClaim.issues.map((issue) => `${issue.severity}:${issue.sessionId ?? "none"}:${issue.executionKey ?? "none"}:${issue.code}`).join("; ") ?? "none"}`,
      `Activation execution claim message: ${result?.deploymentActivationExecutionClaim.message ?? "No activation-execution-claim response yet."}`,
      "Activation execution claim note: ownership only; no activation or item execution began.",
      `Activation execution start status: ${result?.deploymentActivationExecutionStart.status ?? "not attempted"}`,
      `Activation execution start claimant: ${result?.deploymentActivationExecutionStart.claimantId ?? "not assigned"}`,
      `Activation execution start session ID: ${result?.deploymentActivationExecutionStart.sessionId ?? "not started"}`,
      `Activation execution start execution key: ${result?.deploymentActivationExecutionStart.executionKey ?? "not prepared"}`,
      `Activation execution start started at: ${result?.deploymentActivationExecutionStart.startedAt ?? "not running"}`,
      `Activation execution start lease expiration: ${result?.deploymentActivationExecutionStart.leaseExpiresAt ?? "no lease"}`,
      `Activation execution start result: ${result?.deploymentActivationExecutionStart.startResult ?? "none"}`,
      `Activation execution start counts: started ${result?.deploymentActivationExecutionStart.startedCount ?? 0}, reused ${result?.deploymentActivationExecutionStart.reusedCount ?? 0}, conflicts ${result?.deploymentActivationExecutionStart.conflicts ?? 0}`,
      `Activation execution start blockers: ${result?.deploymentActivationExecutionStart.blockers ?? 0}`,
      `Activation execution start warnings: ${result?.deploymentActivationExecutionStart.warnings ?? 0}`,
      `Activation execution start issues: ${result?.deploymentActivationExecutionStart.issues.map((issue) => `${issue.severity}:${issue.sessionId ?? "none"}:${issue.executionKey ?? "none"}:${issue.code}`).join("; ") ?? "none"}`,
      `Activation execution start message: ${result?.deploymentActivationExecutionStart.message ?? "No activation-execution-start response yet."}`,
      "Activation execution start note: the execution session may be running, but no execution item, activation, or hardware binding has started.",
      `Activation execution item start status: ${result?.deploymentActivationExecutionItemStart.status ?? "not attempted"}`,
      `Activation execution item start claimant: ${result?.deploymentActivationExecutionItemStart.claimantId ?? "not assigned"}`,
      `Activation execution item start session ID: ${result?.deploymentActivationExecutionItemStart.sessionId ?? "not started"}`,
      `Activation execution item start execution key: ${result?.deploymentActivationExecutionItemStart.executionKey ?? "not prepared"}`,
      `Activation execution item start item ID: ${result?.deploymentActivationExecutionItemStart.itemId ?? "not started"}`,
      `Activation execution item start item key: ${result?.deploymentActivationExecutionItemStart.executionItemKey ?? "not started"}`,
      `Activation execution item start plan item key: ${result?.deploymentActivationExecutionItemStart.planItemKey ?? "not selected"}`,
      `Activation execution item start sequence: ${result?.deploymentActivationExecutionItemStart.sequence ?? "none"}`,
      `Activation execution item start entity: ${result?.deploymentActivationExecutionItemStart.entityType ?? "none"}:${result?.deploymentActivationExecutionItemStart.entityKey ?? "none"}`,
      `Activation execution item start action: ${result?.deploymentActivationExecutionItemStart.action ?? "none"}`,
      `Activation execution item start attempt count: ${result?.deploymentActivationExecutionItemStart.attemptCount ?? 0}`,
      `Activation execution item start started at: ${result?.deploymentActivationExecutionItemStart.startedAt ?? "not running"}`,
      `Activation execution item start lease expiration: ${result?.deploymentActivationExecutionItemStart.leaseExpiresAt ?? "no lease"}`,
      `Activation execution item start result: ${result?.deploymentActivationExecutionItemStart.itemStartResult ?? "none"}`,
      `Activation execution item start counts: started ${result?.deploymentActivationExecutionItemStart.startedCount ?? 0}, reused ${result?.deploymentActivationExecutionItemStart.reusedCount ?? 0}, conflicts ${result?.deploymentActivationExecutionItemStart.conflicts ?? 0}`,
      `Activation execution item start blockers: ${result?.deploymentActivationExecutionItemStart.blockers ?? 0}`,
      `Activation execution item start warnings: ${result?.deploymentActivationExecutionItemStart.warnings ?? 0}`,
      `Activation execution item start issues: ${result?.deploymentActivationExecutionItemStart.issues.map((issue) => `${issue.severity}:${issue.sessionId ?? "none"}:${issue.executionItemKey ?? "none"}:${issue.code}`).join("; ") ?? "none"}`,
      `Activation execution item start message: ${result?.deploymentActivationExecutionItemStart.message ?? "No activation-execution-item-start response yet."}`,
      "Activation execution item start note: no activation action, entity mutation, hardware binding, dependency progression, rollback, or finalization occurred.",
      `Clinic activation status: ${result?.deploymentClinicActivation.status ?? "not attempted"}`,
      `Clinic activation claimant: ${result?.deploymentClinicActivation.claimantId ?? "not assigned"}`,
      `Clinic activation clinic ID: ${result?.deploymentClinicActivation.clinicId ?? "not available"}`,
      `Clinic activation deployment run key: ${result?.deploymentClinicActivation.deploymentRunId ?? "not persisted"}`,
      `Clinic activation session ID: ${result?.deploymentClinicActivation.sessionId ?? "not started"}`,
      `Clinic activation execution key: ${result?.deploymentClinicActivation.executionKey ?? "not prepared"}`,
      `Clinic activation item ID: ${result?.deploymentClinicActivation.itemId ?? "not started"}`,
      `Clinic activation item key: ${result?.deploymentClinicActivation.executionItemKey ?? "not started"}`,
      `Clinic activation plan item key: ${result?.deploymentClinicActivation.planItemKey ?? "not selected"}`,
      `Clinic activation current deployment status: ${readDeploymentStatus(result?.deploymentClinicActivation.currentClinicState)}`,
      `Clinic activation target deployment status: ${readDeploymentStatus(result?.deploymentClinicActivation.targetClinicState)}`,
      `Clinic activation deployed at: ${result?.deploymentClinicActivation.deployedAt ?? "not activated"}`,
      `Clinic activation result: ${result?.deploymentClinicActivation.activationResult ?? "none"}`,
      `Clinic activation counts: activated ${result?.deploymentClinicActivation.activatedCount ?? 0}, reused ${result?.deploymentClinicActivation.reusedCount ?? 0}, conflicts ${result?.deploymentClinicActivation.conflicts ?? 0}`,
      `Clinic activation blockers: ${result?.deploymentClinicActivation.blockers ?? 0}`,
      `Clinic activation warnings: ${result?.deploymentClinicActivation.warnings ?? 0}`,
      `Clinic activation issues: ${result?.deploymentClinicActivation.issues.map((issue) => `${issue.severity}:${issue.sessionId ?? "none"}:${issue.executionItemKey ?? "none"}:${issue.code}`).join("; ") ?? "none"}`,
      `Clinic activation diagnostics: ${result?.deploymentClinicActivation.issues.map((issue) => `${issue.code}: ${formatClinicActivationDiagnostics(issue.diagnostics)}`).join(" | ") ?? "none"}`,
      `Clinic activation message: ${result?.deploymentClinicActivation.message ?? "No clinic-activation response yet."}`,
      "Clinic activation note: the clinic row may now be active, but the execution item has not completed and no downstream activation, binding, dependency unlock, rollback, or finalization occurred.",
      `Dependency progression status: ${result?.deploymentActivationExecutionDependencyProgression?.status ?? "not attempted"}`,
      `Dependency progression claimant: ${result?.deploymentActivationExecutionDependencyProgression?.claimantId ?? "not assigned"}`,
      `Dependency progression session ID: ${result?.deploymentActivationExecutionDependencyProgression?.sessionId ?? "not running"}`,
      `Dependency progression execution key: ${result?.deploymentActivationExecutionDependencyProgression?.executionKey ?? "not prepared"}`,
      `Dependency progression completed item: ${result?.deploymentActivationExecutionDependencyProgression?.completedSequence ?? "none"}:${result?.deploymentActivationExecutionDependencyProgression?.completedExecutionItemKey ?? "none"}:${result?.deploymentActivationExecutionDependencyProgression?.completedPlanItemKey ?? "none"}`,
      `Dependency progression next item: ${result?.deploymentActivationExecutionDependencyProgression?.nextSequence ?? "none"}:${result?.deploymentActivationExecutionDependencyProgression?.nextExecutionItemKey ?? "none"}:${result?.deploymentActivationExecutionDependencyProgression?.nextPlanItemKey ?? "none"}`,
      `Dependency progression next entity: ${result?.deploymentActivationExecutionDependencyProgression?.nextEntityType ?? "none"}:${result?.deploymentActivationExecutionDependencyProgression?.nextEntityId ?? "none"}`,
      `Dependency progression next action: ${result?.deploymentActivationExecutionDependencyProgression?.nextAction ?? "none"}`,
      `Dependency progression before/after: ${result?.deploymentActivationExecutionDependencyProgression?.statusBefore ?? "none"} -> ${result?.deploymentActivationExecutionDependencyProgression?.statusAfter ?? "none"}`,
      `Dependency progression counts: progressed ${result?.deploymentActivationExecutionDependencyProgression?.progressedCount ?? 0}, reused ${result?.deploymentActivationExecutionDependencyProgression?.reusedCount ?? 0}, conflicts ${result?.deploymentActivationExecutionDependencyProgression?.conflicts ?? 0}`,
      `Dependency progression blockers: ${result?.deploymentActivationExecutionDependencyProgression?.blockers ?? 0}`,
      `Dependency progression warnings: ${result?.deploymentActivationExecutionDependencyProgression?.warnings ?? 0}`,
      `Dependency progression issues: ${result?.deploymentActivationExecutionDependencyProgression?.issues.map((issue) => `${issue.severity}:${issue.sessionId ?? "none"}:${issue.executionItemKey ?? "none"}:${issue.code}`).join("; ") ?? "none"}`,
      `Dependency progression diagnostics: ${result?.deploymentActivationExecutionDependencyProgression?.issues.map((issue) => `${issue.code}: ${formatDependencyProgressionDiagnostics(issue.diagnostics)}`).join(" | ") ?? "none"}`,
      `Dependency progression message: ${result?.deploymentActivationExecutionDependencyProgression?.message ?? "No dependency-progression response yet."}`,
      "Dependency progression note: the next item was not started, no attempt count or execution timestamp was written, and no entity was activated.",
      `Next-item start status: ${result?.deploymentActivationExecutionNextItemStart?.status ?? "not attempted"}`,
      `Next-item start claimant: ${result?.deploymentActivationExecutionNextItemStart?.claimantId ?? "not assigned"}`,
      `Next-item start session ID: ${result?.deploymentActivationExecutionNextItemStart?.sessionId ?? "not running"}`,
      `Next-item start execution key: ${result?.deploymentActivationExecutionNextItemStart?.executionKey ?? "not prepared"}`,
      `Next-item start plan key: ${result?.deploymentActivationExecutionNextItemStart?.planKey ?? "not generated"}`,
      `Next-item start item ID: ${result?.deploymentActivationExecutionNextItemStart?.itemId ?? "not started"}`,
      `Next-item start item key: ${result?.deploymentActivationExecutionNextItemStart?.executionItemKey ?? "not started"}`,
      `Next-item start plan item key: ${result?.deploymentActivationExecutionNextItemStart?.planItemKey ?? "not selected"}`,
      `Next-item start sequence/entity/action: ${result?.deploymentActivationExecutionNextItemStart?.sequence ?? "none"}:${result?.deploymentActivationExecutionNextItemStart?.entityType ?? "none"}:${result?.deploymentActivationExecutionNextItemStart?.entityId ?? "none"}:${result?.deploymentActivationExecutionNextItemStart?.action ?? "none"}`,
      `Next-item start attempt count: ${result?.deploymentActivationExecutionNextItemStart?.attemptCount ?? 0}`,
      `Next-item start started at: ${result?.deploymentActivationExecutionNextItemStart?.startedAt ?? "not running"}`,
      `Next-item start lease expiration: ${result?.deploymentActivationExecutionNextItemStart?.leaseExpiresAt ?? "no lease"}`,
      `Next-item start result: ${result?.deploymentActivationExecutionNextItemStart?.result ?? "none"}`,
      `Next-item start counts: started ${result?.deploymentActivationExecutionNextItemStart?.startedCount ?? 0}, reused ${result?.deploymentActivationExecutionNextItemStart?.reusedCount ?? 0}, conflicts ${result?.deploymentActivationExecutionNextItemStart?.conflicts ?? 0}`,
      `Next-item start blockers: ${result?.deploymentActivationExecutionNextItemStart?.blockers ?? 0}`,
      `Next-item start warnings: ${result?.deploymentActivationExecutionNextItemStart?.warnings ?? 0}`,
      `Next-item start issues: ${result?.deploymentActivationExecutionNextItemStart?.issues.map((issue) => `${issue.severity}:${issue.sessionId ?? "none"}:${issue.executionItemKey ?? "none"}:${issue.code}`).join("; ") ?? "none"}`,
      `Next-item start message: ${result?.deploymentActivationExecutionNextItemStart?.message ?? "No next-item-start response yet."}`,
      "Next-item start note: one deterministic item may be running, but no provider/entity activation, item completion, dependency progression, session lifecycle update, binding, rollback, or finalization occurred.",
      `Provider shell activation status: ${result?.deploymentProviderShellActivation?.status ?? "not attempted"}`,
      `Provider shell activation claimant: ${result?.deploymentProviderShellActivation?.claimantId ?? "not assigned"}`,
      `Provider shell activation session ID: ${result?.deploymentProviderShellActivation?.sessionId ?? "not running"}`,
      `Provider shell activation execution key: ${result?.deploymentProviderShellActivation?.executionKey ?? "not prepared"}`,
      `Provider shell activation plan key: ${result?.deploymentProviderShellActivation?.planKey ?? "not generated"}`,
      `Provider shell activation item: ${result?.deploymentProviderShellActivation?.sequence ?? "none"}:${result?.deploymentProviderShellActivation?.executionItemKey ?? "none"}:${result?.deploymentProviderShellActivation?.planItemKey ?? "none"}`,
      `Provider shell activation provider: ${result?.deploymentProviderShellActivation?.providerId ?? "none"}:${result?.deploymentProviderShellActivation?.deploymentProviderKey ?? "none"}`,
      `Provider shell activation state before/after: ${result?.deploymentProviderShellActivation?.provisioningStatusBefore ?? "none"}/${String(result?.deploymentProviderShellActivation?.activeBefore ?? "none")} -> ${result?.deploymentProviderShellActivation?.provisioningStatusAfter ?? "none"}/${String(result?.deploymentProviderShellActivation?.activeAfter ?? "none")}`,
      `Provider shell activation activated at: ${result?.deploymentProviderShellActivation?.activatedAt ?? "not activated"}`,
      `Provider shell activation result: ${result?.deploymentProviderShellActivation?.result ?? "none"}`,
      `Provider shell activation counts: activated ${result?.deploymentProviderShellActivation?.activatedCount ?? 0}, reused ${result?.deploymentProviderShellActivation?.reusedCount ?? 0}, conflicts ${result?.deploymentProviderShellActivation?.conflicts ?? 0}`,
      `Provider shell activation blockers: ${result?.deploymentProviderShellActivation?.blockers ?? 0}`,
      `Provider shell activation warnings: ${result?.deploymentProviderShellActivation?.warnings ?? 0}`,
      `Provider shell activation issues: ${result?.deploymentProviderShellActivation?.issues.map((issue) => `${issue.severity}:${issue.sessionId ?? "none"}:${issue.executionItemKey ?? "none"}:${issue.deploymentProviderKey ?? "none"}:${issue.code}`).join("; ") ?? "none"}`,
      `Provider shell activation diagnostics: ${result?.deploymentProviderShellActivation?.issues.map((issue) => `${issue.code}: ${formatProviderShellActivationDiagnostics(issue.diagnostics)}`).join(" | ") ?? "none"}`,
      `Provider shell activation message: ${result?.deploymentProviderShellActivation?.message ?? "No provider-shell activation response yet."}`,
      "Provider shell activation note: a selected provider shell may now be active, but no provider item completion, further dependency progression, hardware binding, rollback, or finalization occurred.",
      `Post-provider dependency progression status: ${result?.deploymentProviderShellExecutionDependencyProgression?.status ?? "not attempted"}`,
      `Post-provider dependency progression completed item: ${result?.deploymentProviderShellExecutionDependencyProgression?.completedSequence ?? "none"}:${result?.deploymentProviderShellExecutionDependencyProgression?.completedExecutionItemKey ?? "none"}:${result?.deploymentProviderShellExecutionDependencyProgression?.completedPlanItemKey ?? "none"}`,
      `Post-provider dependency progression next item: ${result?.deploymentProviderShellExecutionDependencyProgression?.nextSequence ?? "none"}:${result?.deploymentProviderShellExecutionDependencyProgression?.nextExecutionItemKey ?? "none"}:${result?.deploymentProviderShellExecutionDependencyProgression?.nextPlanItemKey ?? "none"}`,
      `Post-provider dependency progression next entity/action: ${result?.deploymentProviderShellExecutionDependencyProgression?.nextEntityType ?? "none"}:${result?.deploymentProviderShellExecutionDependencyProgression?.nextEntityId ?? "none"}:${result?.deploymentProviderShellExecutionDependencyProgression?.nextAction ?? "none"}`,
      `Post-provider dependency progression before/after: ${result?.deploymentProviderShellExecutionDependencyProgression?.statusBefore ?? "none"} -> ${result?.deploymentProviderShellExecutionDependencyProgression?.statusAfter ?? "none"}`,
      `Post-provider dependency progression counts: progressed ${result?.deploymentProviderShellExecutionDependencyProgression?.progressedCount ?? 0}, reused ${result?.deploymentProviderShellExecutionDependencyProgression?.reusedCount ?? 0}, conflicts ${result?.deploymentProviderShellExecutionDependencyProgression?.conflicts ?? 0}`,
      `Post-provider dependency progression issues: ${result?.deploymentProviderShellExecutionDependencyProgression?.issues.map((issue) => `${issue.severity}:${issue.sessionId ?? "none"}:${issue.executionItemKey ?? "none"}:${issue.code}`).join("; ") ?? "none"}`,
      `Post-provider dependency progression diagnostics: ${result?.deploymentProviderShellExecutionDependencyProgression?.issues.map((issue) => `${issue.code}: ${formatDependencyProgressionDiagnostics(issue.diagnostics)}`).join(" | ") ?? "none"}`,
      `Post-provider dependency progression message: ${result?.deploymentProviderShellExecutionDependencyProgression?.message ?? "No post-provider dependency-progression response yet."}`,
      "Post-provider dependency progression note: the next item was not started, no attempt count or execution timestamp was written, and no entity was activated.",
      `Post-provider next-item start status: ${result?.deploymentProviderShellExecutionNextItemStart?.status ?? "not attempted"}`,
      `Post-provider next-item start item: ${result?.deploymentProviderShellExecutionNextItemStart?.sequence ?? "none"}:${result?.deploymentProviderShellExecutionNextItemStart?.executionItemKey ?? "none"}:${result?.deploymentProviderShellExecutionNextItemStart?.planItemKey ?? "none"}`,
      `Post-provider next-item start entity/action: ${result?.deploymentProviderShellExecutionNextItemStart?.entityType ?? "none"}:${result?.deploymentProviderShellExecutionNextItemStart?.entityId ?? "none"}:${result?.deploymentProviderShellExecutionNextItemStart?.action ?? "none"}`,
      `Post-provider next-item start attempt/started: ${result?.deploymentProviderShellExecutionNextItemStart?.attemptCount ?? 0}:${result?.deploymentProviderShellExecutionNextItemStart?.startedAt ?? "not started"}`,
      `Post-provider next-item start result: ${result?.deploymentProviderShellExecutionNextItemStart?.result ?? "none"}`,
      `Post-provider next-item start counts: started ${result?.deploymentProviderShellExecutionNextItemStart?.startedCount ?? 0}, reused ${result?.deploymentProviderShellExecutionNextItemStart?.reusedCount ?? 0}, conflicts ${result?.deploymentProviderShellExecutionNextItemStart?.conflicts ?? 0}`,
      `Post-provider next-item start issues: ${result?.deploymentProviderShellExecutionNextItemStart?.issues.map((issue) => `${issue.severity}:${issue.sessionId ?? "none"}:${issue.executionItemKey ?? "none"}:${issue.code}`).join("; ") ?? "none"}`,
      `Post-provider next-item start message: ${result?.deploymentProviderShellExecutionNextItemStart?.message ?? "No post-provider next-item-start response yet."}`,
      "Post-provider next-item start note: exactly one deterministic ready item may be started; no entity activation, item completion, further dependency progression, binding, rollback, or finalization occurred.",
      "Activation execution persistence note: prepared evidence is create/reuse only; compatible claimed or running evidence may pass through unchanged, with no activation, binding, rollback, or finalization.",
      `Message: ${result?.message ?? "No server response yet."}`,
      `Clinic root message: ${result?.clinicRoot.message ?? "No clinic-root response yet."}`,
      `Clinic settings message: ${result?.clinicSettings.message ?? "No clinic-settings response yet."}`,
      `Provider shells message: ${result?.providerShells.message ?? "No provider-shell response yet."}`,
      `Sterilizer shells message: ${result?.sterilizerShells.message ?? "No sterilizer-shell response yet."}`,
      `Workstation shells message: ${result?.workstationShells.message ?? "No workstation-shell response yet."}`,
      `Hardware shells message: ${result?.hardwareShells.message ?? "No hardware-shell response yet."}`,
      `Assignment target validation message: ${result?.assignmentTargetValidation.message ?? "No assignment-target-validation response yet."}`,
      `Hardware assignments message: ${result?.hardwareAssignments.message ?? "No hardware-assignment response yet."}`,
      `Planned assignment resolution message: ${result?.plannedAssignmentResolution.message ?? "No planned-assignment-resolution response yet."}`,
      `Deployment activation readiness message: ${result?.deploymentActivationReadiness.message ?? "No deployment-activation-readiness response yet."}`,
      `Activation plan message: ${result?.deploymentActivationPlan.message ?? "No activation-plan response yet."}`,
      `Activation execution preparation message: ${result?.deploymentActivationExecution.message ?? "No activation-execution-preparation response yet."}`,
      `Activation execution persistence message: ${result?.deploymentActivationExecutionPersistence.message ?? "No activation-execution-persistence response yet."}`,
    ].join("\n"),
  );

  return `mailto:support@sterisphere.app?subject=${subject}&body=${body}`;
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
      payloadGenerated:
        result?.dryRunPayload?.payloadGenerated ?? false,
      payloadType: result?.dryRunPayload?.payloadType ?? null,
      payloadSummary:
        result?.dryRunPayload?.payloadSummary ??
        "No persistence payload",
    };
  });
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

      <DeploymentSimulationPanel
        simulation={deploymentSimulation}
        stages={simulationStageResults}
      />

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

interface SimulationStagePreview {
  id: string;
  displayName: string;
  status: DeploymentStageExecutionStatus;
  payloadGenerated: boolean;
  payloadType: string | null;
  payloadSummary: string;
}

function DeploymentSimulationPanel({
  simulation,
  stages,
}: {
  simulation: DeploymentExecutionResult | null;
  stages: readonly SimulationStagePreview[];
}) {
  const status =
    simulation?.status === "succeeded"
      ? "Ready"
      : simulation?.status === "failed"
        ? "Failed"
        : "Not run";

  return (
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
            status === "Ready"
              ? "bg-emerald-100 text-emerald-800"
              : status === "Failed"
                ? "bg-rose-100 text-rose-800"
                : "bg-slate-100 text-slate-700"
          }`}
        >
          {status}
        </span>
      </div>

      {!simulation ? (
        <p className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
          Simulation unavailable until deployment draft passes validation.
        </p>
      ) : (
        <>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <DraftPreviewMetric label="Simulation status" value={status} />
            <DraftPreviewMetric
              label="Completed stages"
              value={`${simulation.completedStages.length} / ${DEPLOYMENT_STAGES.length}`}
            />
            <DraftPreviewMetric
              label="Total duration"
              value={`${simulation.durationMs} ms`}
            />
            <DraftPreviewMetric
              label="Rollback required"
              value={simulation.rollbackRequired ? "Yes" : "No"}
            />
            <DraftPreviewMetric
              label="Warning count"
              value={simulation.warnings.length}
            />
          </div>

          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {stages.map((stage) => (
              <div
                key={stage.id}
                className="flex items-start justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5"
              >
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-slate-800">
                    {stage.displayName}
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                        stage.payloadGenerated
                          ? "bg-blue-100 text-blue-800"
                          : "bg-slate-200 text-slate-600"
                      }`}
                    >
                      Generated: {stage.payloadGenerated ? "Yes" : "No"}
                    </span>
                    <span className="truncate text-[11px] font-semibold text-slate-600">
                      {stage.payloadType ?? "No persistence payload"}
                    </span>
                  </div>
                  {stage.payloadGenerated && (
                    <p className="mt-1 text-[11px] leading-4 text-slate-500">
                      {stage.payloadSummary}
                    </p>
                  )}
                </div>
                <span
                  className={`shrink-0 text-[11px] font-bold ${
                    stage.status === "succeeded"
                      ? "text-emerald-700"
                      : stage.status === "failed"
                        ? "text-rose-700"
                        : "text-slate-500"
                  }`}
                >
                  {formatSimulationStageStatus(stage.status)}
                </span>
              </div>
            ))}
          </div>

          <p className="mt-4 text-xs leading-5 text-slate-500">
            Dry-run diagnostics validate what the Deployment Engine would
            prepare. No data is saved.
          </p>

          {simulation.status === "succeeded" && (
            <p className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-900">
              Deployment sequence simulation completed successfully. No data
              was saved.
            </p>
          )}

          {simulation.status === "failed" && (
            <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">
              <p className="font-bold">
                Failed stage:{" "}
                {simulation.failedStage?.stageDisplayName ??
                  "Draft validation"}
              </p>
              <p className="mt-1">
                {simulation.failedStage?.messages[0] ??
                  simulation.messages[0] ??
                  "The local deployment simulation could not complete."}
              </p>
              <p className="mt-2 text-xs font-semibold">
                No deployment was performed and no data was saved.
              </p>
            </div>
          )}
        </>
      )}
    </section>
  );
}

function formatSimulationStageStatus(
  status: DeploymentStageExecutionStatus,
) {
  return `${status.charAt(0).toUpperCase()}${status.slice(1)}`;
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
                      in Settings - Sterilization Policies.
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
                <strong>Settings - Sterilization Policies</strong>.
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
                  ? " - Sterilization"
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
              <strong> Settings - Providers</strong>.
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
                  <li>- 1 Reception Desk</li>
                  <li>- 1 Sterilization Room</li>
                  <li>- 6 Treatment Rooms</li>
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
          Estimated setup time: 10-15 minutes
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
            Dashboard access remains disabled until clinic activation is implemented.
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
