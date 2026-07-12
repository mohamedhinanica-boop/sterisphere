import { createDeploymentActivationReadinessService } from "./deployment-activation-readiness-service";
import { InMemoryDeploymentActivationReadinessTestRepository } from "./deployment-activation-readiness-test-repository";
import {
  buildActivationReadinessExpectedPlanFromDraft,
  createRuntimeEvidenceActivationReadinessRepository,
} from "./deployment-activation-readiness-server";
import { createEmptyDeploymentDraft } from "./deployment-draft";
import type {
  DeploymentActivationReadinessAssessmentCommand,
  DeploymentActivationReadinessIssue,
  DeploymentActivationReadinessSnapshot,
} from "./deployment-activation-readiness-types";
import type {
  ServerDeploymentAssignmentTargetValidationResult,
} from "./deployment-assignment-target-validation-server";
import type {
  ServerDeploymentPlannedAssignmentResolutionResult,
} from "./deployment-planned-assignment-resolution-server";

export interface DeploymentActivationReadinessRuntimeHarnessScenario {
  name: string;
  passed: boolean;
  message: string;
}

export interface DeploymentActivationReadinessRuntimeHarnessResult {
  passed: boolean;
  scenarios: readonly DeploymentActivationReadinessRuntimeHarnessScenario[];
}

const CLINIC_ID = "clinic-runtime-readiness-0001";
const DEPLOYMENT_RUN_ID = "deployment-run-runtime-readiness-0001";

export async function runDeploymentActivationReadinessRuntimeHarness(): Promise<DeploymentActivationReadinessRuntimeHarnessResult> {
  const scenarios = [
    await scenarioFullyReadyRuntimeComposition(),
    await scenarioMissingDurableShellBlocks(),
    await scenarioInvalidValidationEvidenceBlocks(),
    await scenarioIncompleteResolutionEvidenceBlocks(),
    await scenarioWarningOnlyReadinessRemainsReady(),
    await scenarioVerifyReuseIsDeterministic(),
    await scenarioUpstreamEvidenceAvailableWhenBlocked(),
    await scenarioUnexpectedRepositoryErrorIsSafe(),
    await scenarioSourceSnapshotRemainsUnmodified(),
    await scenarioDownstreamCountersRemainZero(),
  ];

  return {
    passed: scenarios.every((scenario) => scenario.passed),
    scenarios,
  };
}

async function scenarioFullyReadyRuntimeComposition(): Promise<DeploymentActivationReadinessRuntimeHarnessScenario> {
  const result = await assess();

  return expectScenario(
    "fully ready runtime composition passes readiness",
    result.ok && result.status === "ready" && result.blockers === 0,
    `status=${result.status}; blockers=${result.blockers}`,
  );
}

async function scenarioMissingDurableShellBlocks(): Promise<DeploymentActivationReadinessRuntimeHarnessScenario> {
  const result = await assess({ workstationShells: [] });

  return expectScenario(
    "missing durable workstation shell blocks readiness",
    !result.ok &&
      result.status === "blocked" &&
      hasIssue(result.issues, "workstation_shell_missing"),
    issueCodes(result.issues),
  );
}

async function scenarioInvalidValidationEvidenceBlocks(): Promise<DeploymentActivationReadinessRuntimeHarnessScenario> {
  const result = await assess({}, { assignmentTargetValidation: validationEvidence({ invalid: 1, valid: 0 }) });

  return expectScenario(
    "invalid runtime validation evidence blocks readiness",
    !result.ok &&
      result.status === "blocked" &&
      hasIssue(result.issues, "assignment_target_invalid"),
    issueCodes(result.issues),
  );
}

async function scenarioIncompleteResolutionEvidenceBlocks(): Promise<DeploymentActivationReadinessRuntimeHarnessScenario> {
  const result = await assess({}, { plannedAssignmentResolution: resolutionEvidence({ resolved: 0, unresolved: 1 }) });

  return expectScenario(
    "incomplete runtime resolution evidence blocks readiness",
    !result.ok &&
      result.status === "blocked" &&
      hasIssue(result.issues, "assignment_resolution_incomplete"),
    issueCodes(result.issues),
  );
}

async function scenarioWarningOnlyReadinessRemainsReady(): Promise<DeploymentActivationReadinessRuntimeHarnessScenario> {
  const result = await assess({
    warnings: [
      {
        code: "deployment_run_incompatible",
        entityType: "deployment_run",
        deploymentKey: DEPLOYMENT_RUN_ID,
        severity: "warning",
        message: "Support-only runtime readiness note.",
      },
    ],
  });

  return expectScenario(
    "warning-only readiness remains ready",
    result.ok && result.status === "ready" && result.warnings === 1,
    `status=${result.status}; warnings=${result.warnings}`,
  );
}

async function scenarioVerifyReuseIsDeterministic(): Promise<DeploymentActivationReadinessRuntimeHarnessScenario> {
  const first = await assess();
  const second = await assess();

  return expectScenario(
    "verify reuse reruns readiness deterministically",
    JSON.stringify(first) === JSON.stringify(second),
    `first=${first.status}; second=${second.status}`,
  );
}

async function scenarioUpstreamEvidenceAvailableWhenBlocked(): Promise<DeploymentActivationReadinessRuntimeHarnessScenario> {
  const snapshot = readySnapshot({ hardwareShells: [] });
  await assess(snapshot);

  return expectScenario(
    "upstream evidence remains available when readiness is blocked",
    snapshot.providerShells.length === 1 &&
      snapshot.sterilizerShells.length === 1 &&
      snapshot.workstationShells.length === 1,
    "durable upstream snapshot retained",
  );
}

async function scenarioUnexpectedRepositoryErrorIsSafe(): Promise<DeploymentActivationReadinessRuntimeHarnessScenario> {
  const service = createDeploymentActivationReadinessService(
    createRuntimeEvidenceActivationReadinessRepository(
      new InMemoryDeploymentActivationReadinessTestRepository({
        snapshot: readySnapshot(),
        shouldThrow: true,
      }),
      {
        assignmentTargetValidation: validationEvidence(),
        plannedAssignmentResolution: resolutionEvidence(),
      },
    ),
  );
  const result = await service.assessDeploymentActivationReadiness(command());

  return expectScenario(
    "unexpected repository error returns safe error result",
    !result.ok && result.status === "error" && result.issues.length === 0,
    `status=${result.status}; issues=${result.issues.length}`,
  );
}

async function scenarioSourceSnapshotRemainsUnmodified(): Promise<DeploymentActivationReadinessRuntimeHarnessScenario> {
  const snapshot = readySnapshot();
  const before = JSON.stringify(snapshot);
  await assess(snapshot);

  return expectScenario(
    "source snapshot remains unmodified",
    before === JSON.stringify(snapshot),
    "source snapshot unchanged",
  );
}

async function scenarioDownstreamCountersRemainZero(): Promise<DeploymentActivationReadinessRuntimeHarnessScenario> {
  const result = await assess();

  return expectScenario(
    "downstream counters remain zero",
    result.downstream.requested === 0 &&
      result.downstream.created === 0 &&
      result.downstream.reused === 0 &&
      result.downstream.skipped === 0 &&
      result.downstream.conflicts === 0,
    JSON.stringify(result.downstream),
  );
}

async function assess(
  snapshot: Partial<DeploymentActivationReadinessSnapshot> = {},
  evidence: Partial<{
    assignmentTargetValidation: ServerDeploymentAssignmentTargetValidationResult;
    plannedAssignmentResolution: ServerDeploymentPlannedAssignmentResolutionResult;
  }> = {},
) {
  const service = createDeploymentActivationReadinessService(
    createRuntimeEvidenceActivationReadinessRepository(
      new InMemoryDeploymentActivationReadinessTestRepository({
        snapshot: readySnapshot(snapshot),
      }),
      {
        assignmentTargetValidation:
          evidence.assignmentTargetValidation ?? validationEvidence(),
        plannedAssignmentResolution:
          evidence.plannedAssignmentResolution ?? resolutionEvidence(),
      },
    ),
  );

  return service.assessDeploymentActivationReadiness(command());
}

function command(): DeploymentActivationReadinessAssessmentCommand {
  return {
    clinicId: CLINIC_ID,
    deploymentRunId: DEPLOYMENT_RUN_ID,
    expected: buildActivationReadinessExpectedPlanFromDraft(draft(), {
      clinicId: CLINIC_ID,
      timestamp: "2026-07-12T00:00:00.000Z",
    }),
  };
}

function draft() {
  return {
    ...createEmptyDeploymentDraft("2026-07-12T00:00:00.000Z"),
    workstations: [
      {
        draftId: "workstation-draft-001",
        name: "Operatory 1",
        workstationType: "operatory" as const,
        roomNumber: "1",
        locationLabel: "Operatory 1",
        capabilities: ["usb_scanner"] as const,
      },
    ],
    providerPlan: {
      clinicType: "General Dentistry",
      dentists: 1,
      hygienists: 0,
      assistants: 0,
      receptionists: 0,
      treatmentCoordinators: 0,
      sterilizationTechnicians: 0,
      officeManagers: 0,
    },
    sterilizers: [
      {
        draftId: "sterilizer-draft-001",
        displayName: "Sterilizer 1",
        sterilizerType: "Steam Autoclave",
        manufacturer: "",
        model: "",
        serialNumber: "",
        assignedWorkstationDraftId: null,
        status: "planned" as const,
      },
    ],
    hardwarePlan: {
      labelPrinters: 0,
      usbScanners: 1,
    },
  };
}

function readySnapshot(
  input: Partial<DeploymentActivationReadinessSnapshot> = {},
): DeploymentActivationReadinessSnapshot {
  return {
    deploymentRun:
      input.deploymentRun === undefined
        ? {
            deploymentRunId: DEPLOYMENT_RUN_ID,
            clinicId: CLINIC_ID,
            lifecycleState: "completed",
            deploymentStatus: "deployed",
          }
        : input.deploymentRun,
    clinic: input.clinic === undefined ? { id: CLINIC_ID } : input.clinic,
    clinicSettings:
      input.clinicSettings === undefined
        ? { id: "clinic-settings-row-001", clinicId: CLINIC_ID }
        : input.clinicSettings,
    providerShells: input.providerShells ?? [
      {
        id: "provider-row-001",
        clinicId: CLINIC_ID,
        deploymentProviderKey: "dentist-001",
        provisioningSource: "setup_draft",
        provisioningStatus: "placeholder",
        active: false,
      },
    ],
    sterilizerShells: input.sterilizerShells ?? [
      {
        id: "sterilizer-row-001",
        clinicId: CLINIC_ID,
        deploymentSterilizerKey: "sterilizer-001",
        provisioningSource: "setup_draft",
        provisioningStatus: "planned",
        active: false,
      },
    ],
    workstationShells: input.workstationShells ?? [
      {
        id: "workstation-row-001",
        clinicId: CLINIC_ID,
        deploymentWorkstationKey: "workstation-001",
        provisioningSource: "setup_draft",
        provisioningStatus: "planned",
        active: false,
      },
    ],
    hardwareShells: input.hardwareShells ?? [
      {
        id: "hardware-row-001",
        clinicId: CLINIC_ID,
        deploymentHardwareKey: "hardware-001",
        provisioningSource: "setup_draft",
        provisioningStatus: "planned",
        active: false,
        agentId: null,
        defaultWorkstationId: null,
        currentWorkstationId: null,
        status: "discovered",
      },
    ],
    hardwareAssignments: input.hardwareAssignments ?? [
      {
        id: "assignment-row-001",
        clinicId: CLINIC_ID,
        deploymentHardwareKey: "hardware-001",
        assignmentKey: "hardware-assignment-hardware-001",
        targetType: "workstation",
        targetDeploymentKey: "workstation-001",
        assignmentSource: "setup_draft",
        assignmentStatus: "planned",
        active: false,
      },
    ],
    assignmentTargetValidation: input.assignmentTargetValidation ?? null,
    plannedAssignmentResolution: input.plannedAssignmentResolution ?? null,
    warnings: input.warnings,
  };
}

function validationEvidence(
  input: Partial<ServerDeploymentAssignmentTargetValidationResult> = {},
): ServerDeploymentAssignmentTargetValidationResult {
  return {
    ok: input.ok ?? true,
    status: input.status ?? "valid",
    clinicId: input.clinicId ?? CLINIC_ID,
    requested: input.requested ?? 1,
    valid: input.valid ?? 1,
    invalid: input.invalid ?? 0,
    missingTargets: input.missingTargets ?? 0,
    incompatibleTargets: input.incompatibleTargets ?? 0,
    issues: input.issues ?? [],
    downstream: input.downstream ?? zeroDownstream(),
    message: input.message ?? "Assignment target validation passed.",
  };
}

function resolutionEvidence(
  input: Partial<ServerDeploymentPlannedAssignmentResolutionResult> = {},
): ServerDeploymentPlannedAssignmentResolutionResult {
  return {
    ok: input.ok ?? true,
    status: input.status ?? "resolved",
    clinicId: input.clinicId ?? CLINIC_ID,
    requested: input.requested ?? 1,
    resolved: input.resolved ?? 1,
    unresolved: input.unresolved ?? 0,
    missingHardware: input.missingHardware ?? 0,
    missingTargets: input.missingTargets ?? 0,
    incompatibleHardware: input.incompatibleHardware ?? 0,
    incompatibleTargets: input.incompatibleTargets ?? 0,
    records: input.records ?? [],
    issues: input.issues ?? [],
    downstream: input.downstream ?? zeroDownstream(),
    message: input.message ?? "Planned assignment resolution passed.",
  };
}

function zeroDownstream() {
  return {
    requested: 0,
    created: 0,
    reused: 0,
    skipped: 0,
    conflicts: 0,
  } as const;
}

function hasIssue(
  issues: readonly DeploymentActivationReadinessIssue[],
  code: DeploymentActivationReadinessIssue["code"],
): boolean {
  return issues.some((issue) => issue.code === code);
}

function issueCodes(
  issues: readonly DeploymentActivationReadinessIssue[],
): string {
  return issues.map((issue) => issue.code).join(",");
}

function expectScenario(
  name: string,
  passed: boolean,
  message: string,
): DeploymentActivationReadinessRuntimeHarnessScenario {
  return { name, passed, message };
}
