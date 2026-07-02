import {
  SETUP_STEP_ORDER,
  SetupStep,
  type SetupStepId,
} from "./setup-steps";
import {
  EMPTY_CLINIC_PROFILE,
  type ClinicProfileSetup,
} from "./setup-types";

export interface SetupState {
  currentStep: SetupStepId;
  completedSteps: readonly SetupStepId[];
  isCompleted: boolean;
  startedAt: string | null;
  completedAt: string | null;
  version: number;
  clinicProfile: ClinicProfileSetup;
}

export function createSetupState({
  startedAt = null,
  version = 1,
}: {
  startedAt?: string | null;
  version?: number;
} = {}): SetupState {
  return {
    currentStep: SetupStep.WELCOME,
    completedSteps: [],
    isCompleted: false,
    startedAt,
    completedAt: null,
    version,
    clinicProfile: { ...EMPTY_CLINIC_PROFILE },
  };
}

export function nextStep(state: SetupState): SetupState {
  if (!canAdvance(state)) {
    return state;
  }

  const currentIndex = SETUP_STEP_ORDER.indexOf(state.currentStep);
  const nextStepId = SETUP_STEP_ORDER[currentIndex + 1];

  return nextStepId ? { ...state, currentStep: nextStepId } : state;
}

export function previousStep(state: SetupState): SetupState {
  const currentIndex = SETUP_STEP_ORDER.indexOf(state.currentStep);
  const previousStepId = SETUP_STEP_ORDER[currentIndex - 1];

  return previousStepId ? { ...state, currentStep: previousStepId } : state;
}

export function canAdvance(state: SetupState): boolean {
  return (
    state.currentStep !== SetupStep.COMPLETE &&
    isStepComplete(state, state.currentStep)
  );
}

export function isStepComplete(
  state: SetupState,
  step: SetupStepId,
): boolean {
  return state.completedSteps.includes(step);
}
