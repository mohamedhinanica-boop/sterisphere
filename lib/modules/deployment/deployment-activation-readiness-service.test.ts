import { DeploymentActivationReadinessService } from "./deployment-activation-readiness-service";
import { InMemoryDeploymentActivationReadinessTestRepository } from "./deployment-activation-readiness-test-repository";
import type {
  DeploymentActivationReadinessAssessmentCommand,
  DeploymentActivationReadinessIssue,
  DeploymentActivationReadinessIssueCode,
  DeploymentActivationReadinessSnapshot,
} from "./deployment-activation-readiness-types";

export interface DeploymentActivationReadinessServiceHarnessScenario {
  name: string;
  passed: boolean;
  message: string;
}

export interface DeploymentActivationReadinessServiceHarnessResult {
  passed: boolean;
  scenarios: readonly DeploymentActivationReadinessServiceHarnessScenario[];
}

const CLINIC_ID = "clinic-activation-readiness-0001";
const DEPLOYMENT_RUN_ID = "deployment-run-activation-readiness-0001";
const EXPECTED = {
  providerKeys: ["provider-001"],
  sterilizerKeys: ["sterilizer-001"],
  workstationKeys: ["workstation-001"],
  hardwareKeys: ["hardware-001"],
};

export async function runDeploymentActivationReadinessServiceHarness(): Promise<DeploymentActivationReadinessServiceHarnessResult> {
  const scenarios = [
    await scenarioFullyReadyDeployment(),
    await scenarioMissingDeploymentRun(),
    await scenarioMissingClinicSettings(),
    await scenarioMissingProviderShell(),
    await scenarioMissingSterilizerShell(),
    await scenarioMissingWorkstationShell(),
    await scenarioMissingHardwareShell(),
    await scenarioActivePlannedShellRejected(),
    await scenarioWrongProvisioningSourceRejected(),
    await scenarioWrongProvisioningStatusRejected(),
    await scenarioOperationallyBoundHardwareRejected(),
    await scenarioMissingAssignment(),
    await scenarioDuplicateAssignment(),
    await scenarioInvalidAssignmentTargetEvidence(),
    await scenarioIncompleteAssignmentResolutionEvidence(),
    await scenarioExplicitUnassignedAssignmentReady(),
    await scenarioWarningsDoNotBlockReadiness(),
    await scenarioMixedBlockersDeterministicOrdering(),
    await scenarioUnexpectedRepositoryError(),
    await scenarioSourceRecordsRemainUnmodified(),
    await scenarioDownstreamCountersRemainZero(),
  ];

  return {
    passed: scenarios.every((scenario) => scenario.passed),
    scenarios,
  };
}

async function scenarioFullyReadyDeployment(): Promise<DeploymentActivationReadinessServiceHarnessScenario> {
  const result = await assess();

  return expectScenario(
    "fully ready deployment passes readiness",
    result.ok && result.status === "ready" && result.blockers === 0,
    `status=${result.status}; blockers=${result.blockers}`,
  );
}

async function scenarioMissingDeploymentRun(): Promise<DeploymentActivationReadinessServiceHarnessScenario> {
  return expectBlocker(
    "missing deployment run blocks readiness",
    { deploymentRun: null },
    "deployment_run_missing",
  );
}

async function scenarioMissingClinicSettings(): Promise<DeploymentActivationReadinessServiceHarnessScenario> {
  return expectBlocker(
    "missing clinic settings blocks readiness",
    { clinicSettings: null },
    "clinic_settings_missing",
  );
}

async function scenarioMissingProviderShell(): Promise<DeploymentActivationReadinessServiceHarnessScenario> {
  return expectBlocker(
    "missing provider shell blocks readiness",
    { providerShells: [] },
    "provider_shell_missing",
  );
}

async function scenarioMissingSterilizerShell(): Promise<DeploymentActivationReadinessServiceHarnessScenario> {
  return expectBlocker(
    "missing sterilizer shell blocks readiness",
    { sterilizerShells: [] },
    "sterilizer_shell_missing",
  );
}

async function scenarioMissingWorkstationShell(): Promise<DeploymentActivationReadinessServiceHarnessScenario> {
  return expectBlocker(
    "missing workstation shell blocks readiness",
    { workstationShells: [] },
    "workstation_shell_missing",
  );
}

async function scenarioMissingHardwareShell(): Promise<DeploymentActivationReadinessServiceHarnessScenario> {
  return expectBlocker(
    "missing hardware shell blocks readiness",
    { hardwareShells: [] },
    "hardware_shell_missing",
  );
}

async function scenarioActivePlannedShellRejected(): Promise<DeploymentActivationReadinessServiceHarnessScenario> {
  return expectBlocker(
    "active planned shell blocks readiness",
    { workstationShells: [workstationShell({ active: true })] },
    "unexpected_active_record",
  );
}

async function scenarioWrongProvisioningSourceRejected(): Promise<DeploymentActivationReadinessServiceHarnessScenario> {
  return expectBlocker(
    "wrong provisioning source blocks readiness",
    { sterilizerShells: [sterilizerShell({ provisioningSource: "manual" })] },
    "provisioning_source_incompatible",
  );
}

async function scenarioWrongProvisioningStatusRejected(): Promise<DeploymentActivationReadinessServiceHarnessScenario> {
  return expectBlocker(
    "wrong provisioning status blocks readiness",
    { hardwareShells: [hardwareShell({ provisioningStatus: "archived" })] },
    "provisioning_status_incompatible",
  );
}

async function scenarioOperationallyBoundHardwareRejected(): Promise<DeploymentActivationReadinessServiceHarnessScenario> {
  return expectBlocker(
    "operationally bound hardware blocks readiness",
    { hardwareShells: [hardwareShell({ currentWorkstationId: "workstation-row-live" })] },
    "hardware_shell_bound",
  );
}

async function scenarioMissingAssignment(): Promise<DeploymentActivationReadinessServiceHarnessScenario> {
  return expectBlocker(
    "missing assignment blocks readiness",
    { hardwareAssignments: [] },
    "assignment_missing",
  );
}

async function scenarioDuplicateAssignment(): Promise<DeploymentActivationReadinessServiceHarnessScenario> {
  return expectBlocker(
    "duplicate assignment blocks readiness",
    {
      hardwareAssignments: [
        hardwareAssignment({ id: "assignment-row-1" }),
        hardwareAssignment({ id: "assignment-row-2" }),
      ],
    },
    "assignment_duplicate",
  );
}

async function scenarioInvalidAssignmentTargetEvidence(): Promise<DeploymentActivationReadinessServiceHarnessScenario> {
  return expectBlocker(
    "invalid assignment target evidence blocks readiness",
    {
      assignmentTargetValidation: {
        requested: 1,
        valid: 0,
        invalid: 1,
        missingTargets: 1,
        incompatibleTargets: 0,
      },
    },
    "assignment_target_invalid",
  );
}

async function scenarioIncompleteAssignmentResolutionEvidence(): Promise<DeploymentActivationReadinessServiceHarnessScenario> {
  return expectBlocker(
    "incomplete assignment resolution evidence blocks readiness",
    {
      plannedAssignmentResolution: {
        requested: 1,
        resolved: 0,
        unresolved: 1,
        missingHardware: 0,
        missingTargets: 1,
        incompatibleHardware: 0,
        incompatibleTargets: 0,
      },
    },
    "assignment_resolution_incomplete",
  );
}

async function scenarioExplicitUnassignedAssignmentReady(): Promise<DeploymentActivationReadinessServiceHarnessScenario> {
  const result = await assess({
    hardwareAssignments: [
      hardwareAssignment({ targetType: "unassigned", targetDeploymentKey: null }),
    ],
  });

  return expectScenario(
    "explicit unassigned assignment remains readiness-compatible",
    result.ok && result.status === "ready",
    `status=${result.status}; blockers=${result.blockers}`,
  );
}

async function scenarioWarningsDoNotBlockReadiness(): Promise<DeploymentActivationReadinessServiceHarnessScenario> {
  const result = await assess({
    warnings: [
      issue({
        code: "deployment_run_incompatible",
        entityType: "deployment_run",
        severity: "warning",
        message: "Non-blocking support note.",
      }),
    ],
  });

  return expectScenario(
    "warnings do not block readiness",
    result.ok && result.status === "ready" && result.warnings === 1,
    `status=${result.status}; warnings=${result.warnings}`,
  );
}

async function scenarioMixedBlockersDeterministicOrdering(): Promise<DeploymentActivationReadinessServiceHarnessScenario> {
  const result = await assess({
    providerShells: [],
    hardwareShells: [hardwareShell({ active: true })],
    hardwareAssignments: [],
  });
  const issueOrder = result.issues.map((current) => current.code).join(",");

  return expectScenario(
    "mixed blockers preserve deterministic ordering",
    !result.ok &&
      issueOrder ===
        "assignment_missing,hardware_shell_missing,unexpected_active_record,provider_shell_missing",
    issueOrder,
  );
}

async function scenarioUnexpectedRepositoryError(): Promise<DeploymentActivationReadinessServiceHarnessScenario> {
  const repository = new InMemoryDeploymentActivationReadinessTestRepository({
    snapshot: readySnapshot(),
    shouldThrow: true,
  });
  const service = new DeploymentActivationReadinessService(repository);
  const result = await service.assessDeploymentActivationReadiness(command());

  return expectScenario(
    "unexpected repository error returns error result",
    !result.ok && result.status === "error" && result.issues.length === 0,
    `status=${result.status}; issues=${result.issues.length}`,
  );
}

async function scenarioSourceRecordsRemainUnmodified(): Promise<DeploymentActivationReadinessServiceHarnessScenario> {
  const snapshot = readySnapshot();
  const before = JSON.stringify(snapshot);
  await assess(snapshot);

  return expectScenario(
    "source records remain unmodified",
    before === JSON.stringify(snapshot),
    "source snapshot unchanged",
  );
}

async function scenarioDownstreamCountersRemainZero(): Promise<DeploymentActivationReadinessServiceHarnessScenario> {
  const result = await assess();

  return expectScenario(
    "downstream counters remain zero",
    result.downstream.requested === 0 &&
      result.downstream.created === 0 &&
      result.downstream.reused === 0 &&
      result.downstream.skipped === 0 &&
      result.downstream.conflicts === 0,
    `downstream=${JSON.stringify(result.downstream)}`,
  );
}

async function expectBlocker(
  name: string,
  snapshot: Partial<DeploymentActivationReadinessSnapshot>,
  expectedCode: DeploymentActivationReadinessIssueCode,
): Promise<DeploymentActivationReadinessServiceHarnessScenario> {
  const result = await assess(snapshot);

  return expectScenario(
    name,
    !result.ok &&
      result.status === "blocked" &&
      result.issues.some((current) => current.code === expectedCode),
    `status=${result.status}; codes=${result.issues.map((current) => current.code).join(",")}`,
  );
}

async function assess(
  snapshot: Partial<DeploymentActivationReadinessSnapshot> = {},
) {
  const repository = new InMemoryDeploymentActivationReadinessTestRepository({
    snapshot: readySnapshot(snapshot),
  });
  const service = new DeploymentActivationReadinessService(repository);

  return service.assessDeploymentActivationReadiness(command());
}

function command(): DeploymentActivationReadinessAssessmentCommand {
  return {
    clinicId: CLINIC_ID,
    deploymentRunId: DEPLOYMENT_RUN_ID,
    expected: EXPECTED,
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
    providerShells: input.providerShells ?? [providerShell()],
    sterilizerShells: input.sterilizerShells ?? [sterilizerShell()],
    workstationShells: input.workstationShells ?? [workstationShell()],
    hardwareShells: input.hardwareShells ?? [hardwareShell()],
    hardwareAssignments: input.hardwareAssignments ?? [hardwareAssignment()],
    assignmentTargetValidation:
      input.assignmentTargetValidation === undefined
        ? {
            requested: 1,
            valid: 1,
            invalid: 0,
            missingTargets: 0,
            incompatibleTargets: 0,
          }
        : input.assignmentTargetValidation,
    plannedAssignmentResolution:
      input.plannedAssignmentResolution === undefined
        ? {
            requested: 1,
            resolved: 1,
            unresolved: 0,
            missingHardware: 0,
            missingTargets: 0,
            incompatibleHardware: 0,
            incompatibleTargets: 0,
          }
        : input.plannedAssignmentResolution,
    warnings: input.warnings,
  };
}

function providerShell(input: Partial<DeploymentActivationReadinessSnapshot["providerShells"][number]> = {}) {
  return {
    id: input.id ?? "provider-row-001",
    clinicId: input.clinicId === undefined ? CLINIC_ID : input.clinicId,
    deploymentProviderKey: input.deploymentProviderKey ?? "provider-001",
    provisioningSource: input.provisioningSource ?? "setup_draft",
    provisioningStatus: input.provisioningStatus ?? "placeholder",
    active: input.active ?? false,
  };
}

function sterilizerShell(input: Partial<DeploymentActivationReadinessSnapshot["sterilizerShells"][number]> = {}) {
  return {
    id: input.id ?? "sterilizer-row-001",
    clinicId: input.clinicId === undefined ? CLINIC_ID : input.clinicId,
    deploymentSterilizerKey: input.deploymentSterilizerKey ?? "sterilizer-001",
    provisioningSource: input.provisioningSource ?? "setup_draft",
    provisioningStatus: input.provisioningStatus ?? "planned",
    active: input.active ?? false,
  };
}

function workstationShell(input: Partial<DeploymentActivationReadinessSnapshot["workstationShells"][number]> = {}) {
  return {
    id: input.id ?? "workstation-row-001",
    clinicId: input.clinicId === undefined ? CLINIC_ID : input.clinicId,
    deploymentWorkstationKey: input.deploymentWorkstationKey ?? "workstation-001",
    provisioningSource: input.provisioningSource ?? "setup_draft",
    provisioningStatus: input.provisioningStatus ?? "planned",
    active: input.active ?? false,
  };
}

function hardwareShell(input: Partial<DeploymentActivationReadinessSnapshot["hardwareShells"][number]> = {}) {
  return {
    id: input.id ?? "hardware-row-001",
    clinicId: input.clinicId === undefined ? CLINIC_ID : input.clinicId,
    deploymentHardwareKey: input.deploymentHardwareKey ?? "hardware-001",
    provisioningSource: input.provisioningSource ?? "setup_draft",
    provisioningStatus: input.provisioningStatus ?? "planned",
    active: input.active ?? false,
    agentId: input.agentId ?? null,
    defaultWorkstationId: input.defaultWorkstationId ?? null,
    currentWorkstationId: input.currentWorkstationId ?? null,
    status: input.status ?? "discovered",
  };
}

function hardwareAssignment(input: Partial<DeploymentActivationReadinessSnapshot["hardwareAssignments"][number]> = {}) {
  return {
    id: input.id ?? "hardware-assignment-row-001",
    clinicId: input.clinicId === undefined ? CLINIC_ID : input.clinicId,
    deploymentHardwareKey: input.deploymentHardwareKey ?? "hardware-001",
    assignmentKey: input.assignmentKey ?? "hardware-assignment-hardware-001",
    targetType: input.targetType ?? "workstation",
    targetDeploymentKey:
      input.targetDeploymentKey === undefined
        ? "workstation-001"
        : input.targetDeploymentKey,
    assignmentSource: input.assignmentSource ?? "setup_draft",
    assignmentStatus: input.assignmentStatus ?? "planned",
    active: input.active ?? false,
  };
}

function issue(
  input: Partial<DeploymentActivationReadinessIssue>,
): DeploymentActivationReadinessIssue {
  return {
    code: input.code ?? "deployment_run_incompatible",
    entityType: input.entityType ?? "deployment_run",
    deploymentKey: input.deploymentKey ?? null,
    severity: input.severity ?? "warning",
    message: input.message ?? "Readiness warning.",
  };
}

function expectScenario(
  name: string,
  passed: boolean,
  message: string,
): DeploymentActivationReadinessServiceHarnessScenario {
  return { name, passed, message };
}
