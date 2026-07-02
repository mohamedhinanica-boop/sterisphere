export const SetupStep = {
  WELCOME: "WELCOME",
  CLINIC_PROFILE: "CLINIC_PROFILE",
  WORKSTATIONS: "WORKSTATIONS",
  PROVIDERS: "PROVIDERS",
  STERILIZERS: "STERILIZERS",
  POLICIES: "POLICIES",
  HARDWARE: "HARDWARE",
  REVIEW: "REVIEW",
  COMPLETE: "COMPLETE",
} as const;

export type SetupStepId = (typeof SetupStep)[keyof typeof SetupStep];

export const SETUP_STEP_ORDER: readonly SetupStepId[] = [
  SetupStep.WELCOME,
  SetupStep.CLINIC_PROFILE,
  SetupStep.WORKSTATIONS,
  SetupStep.PROVIDERS,
  SetupStep.STERILIZERS,
  SetupStep.POLICIES,
  SetupStep.HARDWARE,
  SetupStep.REVIEW,
  SetupStep.COMPLETE,
];
