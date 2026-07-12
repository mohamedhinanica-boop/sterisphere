import { DeploymentActivationPlanService } from "./deployment-activation-plan-service";
import { InMemoryDeploymentActivationPlanTestRepository } from "./deployment-activation-plan-test-repository";
import type {
  DeploymentActivationPlanCommand,
  DeploymentActivationPlanIssue,
  DeploymentActivationPlanIssueCode,
  DeploymentActivationPlanSnapshot,
} from "./deployment-activation-plan-types";
import type {
  DeploymentActivationReadinessResult,
} from "./deployment-activation-readiness-types";
import type {
  DeploymentPlannedAssignmentResolvedRecord,
} from "./deployment-planned-assignment-resolution-types";

export interface DeploymentActivationPlanServiceHarnessScenario {
  name: string;
  passed: boolean;
  message: string;
}

export interface DeploymentActivationPlanServiceHarnessResult {
  passed: boolean;
  scenarios: readonly DeploymentActivationPlanServiceHarnessScenario[];
}

const CLINIC_ID = "clinic-activation-plan-0001";
const DEPLOYMENT_RUN_ID = "deployment-run-activation-plan-0001";
const EXPECTED = {
  providerKeys: ["provider-001"],
  sterilizerKeys: ["sterilizer-001"],
  workstationKeys: ["workstation-001"],
  hardwareKeys: ["hardware-001"],
};

export async function runDeploymentActivationPlanServiceHarness(): Promise<DeploymentActivationPlanServiceHarnessResult> {
  const scenarios = [
    await scenarioFullyReadyActivationPlan(),
    await scenarioReadinessNotReady(),
    await scenarioReadinessEvidenceMissing(),
    await scenarioMissingDeploymentRun(),
    await scenarioWrongClinicOwnership(),
    await scenarioMissingClinic(),
    await scenarioMissingProvider(),
    await scenarioMissingSterilizer(),
    await scenarioMissingWorkstation(),
    await scenarioMissingHardware(),
    await scenarioActiveShellDriftDetected(),
    await scenarioWrongProvisioningSourceStatus(),
    await scenarioHardwareBindingDriftDetected(),
    await scenarioAssignmentTargetChanged(),
    await scenarioMissingResolvedHardwareId(),
    await scenarioMissingResolvedTargetId(),
    await scenarioExplicitUnassignedProducesNoBinding(),
    await scenarioWorkstationAssignmentCreatesBinding(),
    await scenarioSterilizerAssignmentCreatesBinding(),
    await scenarioDeterministicActivationOrder(),
    await scenarioDeterministicDependencyGraph(),
    await scenarioDeterministicPlanKey(),
    await scenarioReversibleAndIrreversibleCounts(),
    await scenarioWarningOnlyPlanRemainsReady(),
    await scenarioRepositoryErrorReturnsError(),
    await scenarioSourceRecordsRemainUnmodified(),
    await scenarioDownstreamCountersRemainZero(),
  ];

  return {
    passed: scenarios.every((scenario) => scenario.passed),
    scenarios,
  };
}

async function scenarioFullyReadyActivationPlan(): Promise<DeploymentActivationPlanServiceHarnessScenario> {
  const result = await plan();

  return expectScenario(
    "fully ready activation plan",
    result.ok &&
      result.status === "ready" &&
      result.planItems.length === 8 &&
      result.blockers === 0,
    `status=${result.status}; items=${result.planItems.length}`,
  );
}

async function scenarioReadinessNotReady(): Promise<DeploymentActivationPlanServiceHarnessScenario> {
  return expectBlocker(
    "readiness not ready blocks activation planning",
    {},
    { readiness: readiness({ status: "blocked", ok: false, blockers: 1, checksFailed: 1 }) },
    "readiness_not_ready",
  );
}

async function scenarioReadinessEvidenceMissing(): Promise<DeploymentActivationPlanServiceHarnessScenario> {
  return expectBlocker(
    "missing readiness evidence blocks activation planning",
    {},
    { readiness: null },
    "readiness_evidence_missing",
  );
}

async function scenarioMissingDeploymentRun(): Promise<DeploymentActivationPlanServiceHarnessScenario> {
  return expectBlocker(
    "missing deployment run blocks activation planning",
    { deploymentRun: null },
    {},
    "deployment_run_missing",
  );
}

async function scenarioWrongClinicOwnership(): Promise<DeploymentActivationPlanServiceHarnessScenario> {
  return expectBlocker(
    "wrong clinic ownership blocks activation planning",
    { deploymentRun: { ...deploymentRun(), clinicId: "other-clinic" } },
    {},
    "clinic_ownership_mismatch",
  );
}

async function scenarioMissingClinic(): Promise<DeploymentActivationPlanServiceHarnessScenario> {
  return expectBlocker(
    "missing clinic blocks activation planning",
    { clinic: null },
    {},
    "entity_missing",
  );
}

async function scenarioMissingProvider(): Promise<DeploymentActivationPlanServiceHarnessScenario> {
  return expectBlocker(
    "missing provider blocks activation planning",
    { providerShells: [] },
    {},
    "entity_missing",
  );
}

async function scenarioMissingSterilizer(): Promise<DeploymentActivationPlanServiceHarnessScenario> {
  return expectBlocker(
    "missing sterilizer blocks activation planning",
    { sterilizerShells: [] },
    {},
    "entity_missing",
  );
}

async function scenarioMissingWorkstation(): Promise<DeploymentActivationPlanServiceHarnessScenario> {
  return expectBlocker(
    "missing workstation blocks activation planning",
    { workstationShells: [] },
    {},
    "entity_missing",
  );
}

async function scenarioMissingHardware(): Promise<DeploymentActivationPlanServiceHarnessScenario> {
  return expectBlocker(
    "missing hardware blocks activation planning",
    { hardwareShells: [] },
    {},
    "entity_missing",
  );
}

async function scenarioActiveShellDriftDetected(): Promise<DeploymentActivationPlanServiceHarnessScenario> {
  return expectBlocker(
    "active shell drift is detected",
    { workstationShells: [workstationShell({ active: true })] },
    {},
    "unexpected_active_record",
  );
}

async function scenarioWrongProvisioningSourceStatus(): Promise<DeploymentActivationPlanServiceHarnessScenario> {
  return expectBlocker(
    "wrong provisioning source or status blocks activation planning",
    { hardwareShells: [hardwareShell({ provisioningSource: "manual", provisioningStatus: "archived" })] },
    {},
    "provisioning_state_incompatible",
  );
}

async function scenarioHardwareBindingDriftDetected(): Promise<DeploymentActivationPlanServiceHarnessScenario> {
  return expectBlocker(
    "hardware binding drift is detected",
    { hardwareShells: [hardwareShell({ currentWorkstationId: "workstation-live-001" })] },
    {},
    "hardware_already_bound",
  );
}

async function scenarioAssignmentTargetChanged(): Promise<DeploymentActivationPlanServiceHarnessScenario> {
  return expectBlocker(
    "assignment target changed after readiness",
    { hardwareAssignments: [hardwareAssignment({ targetDeploymentKey: "workstation-002" })] },
    {},
    "assignment_target_changed",
  );
}

async function scenarioMissingResolvedHardwareId(): Promise<DeploymentActivationPlanServiceHarnessScenario> {
  return expectBlocker(
    "missing resolved hardware id blocks activation planning",
    {},
    { resolvedAssignments: [resolvedAssignment({ hardwareId: null })] },
    "resolved_identity_missing",
  );
}

async function scenarioMissingResolvedTargetId(): Promise<DeploymentActivationPlanServiceHarnessScenario> {
  return expectBlocker(
    "missing resolved target id blocks activation planning",
    {},
    { resolvedAssignments: [resolvedAssignment({ targetId: null })] },
    "resolved_identity_missing",
  );
}

async function scenarioExplicitUnassignedProducesNoBinding(): Promise<DeploymentActivationPlanServiceHarnessScenario> {
  const result = await plan({
    hardwareAssignments: [
      hardwareAssignment({ targetType: "unassigned", targetDeploymentKey: null }),
    ],
  }, {
    resolvedAssignments: [
      resolvedAssignment({ targetType: "unassigned", targetDeploymentKey: null, targetId: null }),
    ],
  });

  return expectScenario(
    "explicit unassigned produces no binding item",
    result.ok &&
      result.planItems.every((item) => item.entityType !== "hardware_binding"),
    result.planItems.map((item) => item.entityType).join(","),
  );
}

async function scenarioWorkstationAssignmentCreatesBinding(): Promise<DeploymentActivationPlanServiceHarnessScenario> {
  const result = await plan();

  return expectScenario(
    "workstation assignment creates proposed binding item",
    result.planItems.some(
      (item) =>
        item.entityType === "hardware_binding" &&
        item.targetState.targetType === "workstation",
    ),
    result.planItems.map((item) => item.entityType).join(","),
  );
}

async function scenarioSterilizerAssignmentCreatesBinding(): Promise<DeploymentActivationPlanServiceHarnessScenario> {
  const result = await plan({
    hardwareAssignments: [
      hardwareAssignment({ targetType: "sterilizer", targetDeploymentKey: "sterilizer-001" }),
    ],
  }, {
    resolvedAssignments: [
      resolvedAssignment({ targetType: "sterilizer", targetDeploymentKey: "sterilizer-001", targetId: "sterilizer-row-001" }),
    ],
  });

  return expectScenario(
    "sterilizer assignment creates proposed binding item",
    result.planItems.some(
      (item) =>
        item.entityType === "hardware_binding" &&
        item.targetState.targetType === "sterilizer",
    ),
    result.planItems.map((item) => item.entityType).join(","),
  );
}

async function scenarioDeterministicActivationOrder(): Promise<DeploymentActivationPlanServiceHarnessScenario> {
  const result = await plan();
  const order = result.planItems.map((item) => item.entityType).join(">");

  return expectScenario(
    "deterministic activation order",
    order ===
      "clinic>provider_shell>sterilizer_shell>workstation_shell>hardware_shell>hardware_binding>hardware_assignment>deployment_run",
    order,
  );
}

async function scenarioDeterministicDependencyGraph(): Promise<DeploymentActivationPlanServiceHarnessScenario> {
  const result = await plan();
  const binding = result.planItems.find(
    (item) => item.entityType === "hardware_binding",
  );
  const finalization = result.planItems.find(
    (item) => item.entityType === "deployment_run",
  );

  return expectScenario(
    "deterministic dependency graph",
    Boolean(binding?.dependencyKeys.includes("activation-plan-deployment-run-activation-plan-0001:hardware_shell:hardware-001")) &&
      Boolean(binding?.dependencyKeys.includes("activation-plan-deployment-run-activation-plan-0001:workstation_shell:workstation-001")) &&
      finalization?.dependencyKeys.length === 7,
    `binding=${binding?.dependencyKeys.join(",")}; final=${finalization?.dependencyKeys.length}`,
  );
}

async function scenarioDeterministicPlanKey(): Promise<DeploymentActivationPlanServiceHarnessScenario> {
  const result = await plan();

  return expectScenario(
    "deterministic plan key",
    result.planKey === "activation-plan-deployment-run-activation-plan-0001",
    String(result.planKey),
  );
}

async function scenarioReversibleAndIrreversibleCounts(): Promise<DeploymentActivationPlanServiceHarnessScenario> {
  const result = await plan();

  return expectScenario(
    "reversible and irreversible item counts",
    result.reversibleItems === 6 && result.irreversibleItems === 2,
    `reversible=${result.reversibleItems}; irreversible=${result.irreversibleItems}`,
  );
}

async function scenarioWarningOnlyPlanRemainsReady(): Promise<DeploymentActivationPlanServiceHarnessScenario> {
  const result = await plan({
    hardwareAssignments: [
      hardwareAssignment({ targetType: "unassigned", targetDeploymentKey: null }),
    ],
  }, {
    resolvedAssignments: [
      resolvedAssignment({ targetType: "unassigned", targetDeploymentKey: null, targetId: null }),
    ],
  });

  return expectScenario(
    "warning-only plan remains ready",
    result.ok && result.status === "ready" && result.warnings > 0,
    `status=${result.status}; warnings=${result.warnings}`,
  );
}

async function scenarioRepositoryErrorReturnsError(): Promise<DeploymentActivationPlanServiceHarnessScenario> {
  const repository = new InMemoryDeploymentActivationPlanTestRepository({
    snapshot: readySnapshot(),
    shouldThrow: true,
  });
  const service = new DeploymentActivationPlanService(repository);
  const result = await service.buildActivationPlan(command());

  return expectScenario(
    "repository error returns error",
    !result.ok && result.status === "error" && result.planItems.length === 0,
    `status=${result.status}; items=${result.planItems.length}`,
  );
}

async function scenarioSourceRecordsRemainUnmodified(): Promise<DeploymentActivationPlanServiceHarnessScenario> {
  const snapshot = readySnapshot();
  const before = JSON.stringify(snapshot);
  await plan(snapshot);

  return expectScenario(
    "source records remain unmodified",
    before === JSON.stringify(snapshot),
    "source snapshot unchanged",
  );
}

async function scenarioDownstreamCountersRemainZero(): Promise<DeploymentActivationPlanServiceHarnessScenario> {
  const result = await plan();

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

async function expectBlocker(
  name: string,
  snapshot: Partial<DeploymentActivationPlanSnapshot>,
  commandInput: Partial<DeploymentActivationPlanCommand>,
  expectedCode: DeploymentActivationPlanIssueCode,
): Promise<DeploymentActivationPlanServiceHarnessScenario> {
  const result = await plan(snapshot, commandInput);

  return expectScenario(
    name,
    !result.ok &&
      result.status === "blocked" &&
      hasIssue(result.issues, expectedCode),
    issueCodes(result.issues),
  );
}

async function plan(
  snapshot: Partial<DeploymentActivationPlanSnapshot> = {},
  commandInput: Partial<DeploymentActivationPlanCommand> = {},
) {
  const repository = new InMemoryDeploymentActivationPlanTestRepository({
    snapshot: readySnapshot(snapshot),
  });
  const service = new DeploymentActivationPlanService(repository);

  return service.buildActivationPlan(command(commandInput));
}

function command(
  input: Partial<DeploymentActivationPlanCommand> = {},
): DeploymentActivationPlanCommand {
  return {
    clinicId: CLINIC_ID,
    deploymentRunId: DEPLOYMENT_RUN_ID,
    readiness: readiness(),
    resolvedAssignments: [resolvedAssignment()],
    expected: EXPECTED,
    ...input,
  };
}

function readiness(
  input: Partial<DeploymentActivationReadinessResult> = {},
): DeploymentActivationReadinessResult {
  return {
    ok: input.ok ?? true,
    status: input.status ?? "ready",
    checksRequested: input.checksRequested ?? 10,
    checksPassed: input.checksPassed ?? 10,
    checksFailed: input.checksFailed ?? 0,
    blockers: input.blockers ?? 0,
    warnings: input.warnings ?? 0,
    issues: input.issues ?? [],
    downstream: input.downstream ?? zeroDownstream(),
    message: input.message ?? "Deployment activation readiness checks passed.",
  };
}

function readySnapshot(
  input: Partial<DeploymentActivationPlanSnapshot> = {},
): DeploymentActivationPlanSnapshot {
  return {
    deploymentRun:
      input.deploymentRun === undefined ? deploymentRun() : input.deploymentRun,
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
    assignmentTargetValidation: input.assignmentTargetValidation ?? {
      requested: 1,
      valid: 1,
      invalid: 0,
      missingTargets: 0,
      incompatibleTargets: 0,
    },
    plannedAssignmentResolution: input.plannedAssignmentResolution ?? {
      requested: 1,
      resolved: 1,
      unresolved: 0,
      missingHardware: 0,
      missingTargets: 0,
      incompatibleHardware: 0,
      incompatibleTargets: 0,
    },
    warnings: input.warnings,
    existingActivationPlanKey: input.existingActivationPlanKey ?? null,
  };
}

function deploymentRun() {
  return {
    deploymentRunId: DEPLOYMENT_RUN_ID,
    clinicId: CLINIC_ID,
    lifecycleState: "completed",
    deploymentStatus: "deployed",
  };
}

function providerShell(input: Partial<DeploymentActivationPlanSnapshot["providerShells"][number]> = {}) {
  return {
    id: input.id ?? "provider-row-001",
    clinicId: input.clinicId === undefined ? CLINIC_ID : input.clinicId,
    deploymentProviderKey: input.deploymentProviderKey ?? "provider-001",
    provisioningSource: input.provisioningSource ?? "setup_draft",
    provisioningStatus: input.provisioningStatus ?? "placeholder",
    active: input.active ?? false,
  };
}

function sterilizerShell(input: Partial<DeploymentActivationPlanSnapshot["sterilizerShells"][number]> = {}) {
  return {
    id: input.id ?? "sterilizer-row-001",
    clinicId: input.clinicId === undefined ? CLINIC_ID : input.clinicId,
    deploymentSterilizerKey: input.deploymentSterilizerKey ?? "sterilizer-001",
    provisioningSource: input.provisioningSource ?? "setup_draft",
    provisioningStatus: input.provisioningStatus ?? "planned",
    active: input.active ?? false,
  };
}

function workstationShell(input: Partial<DeploymentActivationPlanSnapshot["workstationShells"][number]> = {}) {
  return {
    id: input.id ?? "workstation-row-001",
    clinicId: input.clinicId === undefined ? CLINIC_ID : input.clinicId,
    deploymentWorkstationKey: input.deploymentWorkstationKey ?? "workstation-001",
    provisioningSource: input.provisioningSource ?? "setup_draft",
    provisioningStatus: input.provisioningStatus ?? "planned",
    active: input.active ?? false,
  };
}

function hardwareShell(input: Partial<DeploymentActivationPlanSnapshot["hardwareShells"][number]> = {}) {
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

function hardwareAssignment(input: Partial<DeploymentActivationPlanSnapshot["hardwareAssignments"][number]> = {}) {
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

function resolvedAssignment(
  input: Partial<DeploymentPlannedAssignmentResolvedRecord> = {},
): DeploymentPlannedAssignmentResolvedRecord {
  return {
    clinicId: input.clinicId ?? CLINIC_ID,
    deploymentHardwareKey: input.deploymentHardwareKey ?? "hardware-001",
    hardwareId: input.hardwareId === undefined ? "hardware-row-001" : input.hardwareId,
    assignmentKey: input.assignmentKey ?? "hardware-assignment-hardware-001",
    targetType: input.targetType ?? "workstation",
    targetDeploymentKey:
      input.targetDeploymentKey === undefined
        ? "workstation-001"
        : input.targetDeploymentKey,
    targetId: input.targetId === undefined ? "workstation-row-001" : input.targetId,
    resolutionStatus: input.resolutionStatus ?? "resolved",
    issues: input.issues ?? [],
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
  issues: readonly DeploymentActivationPlanIssue[],
  code: DeploymentActivationPlanIssueCode,
): boolean {
  return issues.some((issue) => issue.code === code);
}

function issueCodes(issues: readonly DeploymentActivationPlanIssue[]): string {
  return issues.map((issue) => issue.code).join(",");
}

function expectScenario(
  name: string,
  passed: boolean,
  message: string,
): DeploymentActivationPlanServiceHarnessScenario {
  return { name, passed, message };
}
