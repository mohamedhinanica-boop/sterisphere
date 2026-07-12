import { DeploymentPlannedAssignmentResolutionService } from "./deployment-planned-assignment-resolution-service";
import { InMemoryDeploymentPlannedAssignmentResolutionTestRepository } from "./deployment-planned-assignment-resolution-test-repository";
import type {
  DeploymentPlannedAssignmentResolutionAssignment,
  DeploymentPlannedAssignmentResolutionHardwareShell,
  DeploymentPlannedAssignmentResolutionIssueCode,
  DeploymentPlannedAssignmentResolutionSterilizerShell,
  DeploymentPlannedAssignmentResolutionWorkstationShell,
} from "./deployment-planned-assignment-resolution-types";

export interface DeploymentPlannedAssignmentResolutionServiceHarnessScenario {
  name: string;
  passed: boolean;
  message: string;
}

export interface DeploymentPlannedAssignmentResolutionServiceHarnessResult {
  passed: boolean;
  scenarios: readonly DeploymentPlannedAssignmentResolutionServiceHarnessScenario[];
}

const CLINIC_ID = "clinic-planned-assignment-resolution-0001";
const OTHER_CLINIC_ID = "clinic-planned-assignment-resolution-0002";

export async function runDeploymentPlannedAssignmentResolutionServiceHarness(): Promise<DeploymentPlannedAssignmentResolutionServiceHarnessResult> {
  const scenarios = [
    await scenarioValidWorkstationResolution(),
    await scenarioValidSterilizerResolution(),
    await scenarioValidUnassignedResolution(),
    await scenarioPersistedDiscoveredHardwareResolution(),
    await scenarioRepeatedPersistedHardwareResolution(),
    await scenarioMissingHardwareShell(),
    await scenarioCrossClinicHardwareShell(),
    await scenarioLegacyGlobalHardwareShell(),
    await scenarioActiveHardwareShell(),
    await scenarioArchivedHardwareShell(),
    await scenarioWrongHardwareProvisioningSource(),
    await scenarioBoundHardwareShellRejected(),
    await scenarioMissingWorkstationTarget(),
    await scenarioMissingSterilizerTarget(),
    await scenarioCrossClinicWorkstationTarget(),
    await scenarioCrossClinicSterilizerTarget(),
    await scenarioActiveWorkstationTarget(),
    await scenarioActiveSterilizerTarget(),
    await scenarioArchivedTarget(),
    await scenarioWrongTargetProvisioningSource(),
    await scenarioMalformedHardwareKey(),
    await scenarioMalformedWorkstationKey(),
    await scenarioMalformedSterilizerKey(),
    await scenarioUnsupportedTargetType(),
    await scenarioUnassignedWithTargetKey(),
    await scenarioMixedBatchDeterministicOrdering(),
    await scenarioSourceRecordsRemainUnmodified(),
    await scenarioDownstreamCountersRemainZero(),
  ];

  return {
    passed: scenarios.every((scenario) => scenario.passed),
    scenarios,
  };
}

async function scenarioValidWorkstationResolution(): Promise<DeploymentPlannedAssignmentResolutionServiceHarnessScenario> {
  const harness = createHarness();
  const result = await harness.service.resolveAssignmentsForClinicAssignments(
    CLINIC_ID,
    [
      createAssignment({
        deploymentHardwareKey: "hardware-001",
        targetType: "workstation",
        targetDeploymentKey: "workstation-001",
      }),
    ],
  );

  return expectScenario(
    "valid workstation assignment resolves hardware and target ids",
    result.ok &&
      result.records[0]?.hardwareId === "hardware-row-hardware-001" &&
      result.records[0]?.targetId === "workstation-row-workstation-001",
    `hardware=${result.records[0]?.hardwareId}; target=${result.records[0]?.targetId}`,
  );
}

async function scenarioValidSterilizerResolution(): Promise<DeploymentPlannedAssignmentResolutionServiceHarnessScenario> {
  const harness = createHarness();
  const result = await harness.service.resolveAssignmentsForClinicAssignments(
    CLINIC_ID,
    [
      createAssignment({
        deploymentHardwareKey: "hardware-001",
        targetType: "sterilizer",
        targetDeploymentKey: "sterilizer-001",
      }),
    ],
  );

  return expectScenario(
    "valid sterilizer assignment resolves hardware and target ids",
    result.ok &&
      result.records[0]?.hardwareId === "hardware-row-hardware-001" &&
      result.records[0]?.targetId === "sterilizer-row-sterilizer-001",
    `hardware=${result.records[0]?.hardwareId}; target=${result.records[0]?.targetId}`,
  );
}

async function scenarioValidUnassignedResolution(): Promise<DeploymentPlannedAssignmentResolutionServiceHarnessScenario> {
  const harness = createHarness();
  const result = await harness.service.resolveAssignmentsForClinicAssignments(
    CLINIC_ID,
    [
      createAssignment({
        deploymentHardwareKey: "hardware-001",
        targetType: "unassigned",
        targetDeploymentKey: null,
      }),
    ],
  );

  return expectScenario(
    "explicit unassigned assignment resolves hardware with null target id",
    result.ok &&
      result.records[0]?.hardwareId === "hardware-row-hardware-001" &&
      result.records[0]?.targetId === null &&
      harness.repository.calls.findWorkstationShellByDeploymentKey === 0 &&
      harness.repository.calls.findSterilizerShellByDeploymentKey === 0,
    `target=${result.records[0]?.targetId}; workstationLookups=${harness.repository.calls.findWorkstationShellByDeploymentKey}`,
  );
}

async function scenarioPersistedDiscoveredHardwareResolution(): Promise<DeploymentPlannedAssignmentResolutionServiceHarnessScenario> {
  const harness = createHarness({
    hardwareShells: [
      createHardwareShell("hardware-001", { status: "discovered" }),
    ],
  });
  const result = await harness.service.resolveAssignmentsForClinicAssignments(
    CLINIC_ID,
    [createAssignment({ deploymentHardwareKey: "hardware-001" })],
  );

  return expectScenario(
    "persisted hardware shell with discovered device status resolves",
    result.ok &&
      result.counts.resolved === 1 &&
      result.counts.incompatibleHardware === 0 &&
      result.records[0]?.hardwareId === "hardware-row-hardware-001",
    `status=discovered; resolved=${result.counts.resolved}; incompatibleHardware=${result.counts.incompatibleHardware}`,
  );
}

async function scenarioRepeatedPersistedHardwareResolution(): Promise<DeploymentPlannedAssignmentResolutionServiceHarnessScenario> {
  const harness = createHarness({
    assignments: [createAssignment({ deploymentHardwareKey: "hardware-001" })],
    hardwareShells: [
      createHardwareShell("hardware-001", { status: "discovered" }),
    ],
  });
  const first = await harness.service.resolveAssignmentsForClinic(CLINIC_ID);
  const second = await harness.service.resolveAssignmentsForClinic(CLINIC_ID);

  return expectScenario(
    "repeated resolution returns the same successful persisted hardware result",
    first.ok &&
      second.ok &&
      JSON.stringify(first.records) === JSON.stringify(second.records) &&
      harness.repository.downstreamWriteCount === 0,
    `first=${first.counts.resolved}; second=${second.counts.resolved}; downstreamWrites=${harness.repository.downstreamWriteCount}`,
  );
}
async function scenarioMissingHardwareShell(): Promise<DeploymentPlannedAssignmentResolutionServiceHarnessScenario> {
  return expectIssueFromHarness(
    "missing hardware shell is unresolved",
    createHarness({ hardwareShells: [] }),
    createAssignment({ deploymentHardwareKey: "hardware-999" }),
    "hardware_missing",
  );
}

async function scenarioCrossClinicHardwareShell(): Promise<DeploymentPlannedAssignmentResolutionServiceHarnessScenario> {
  return expectIssueFromHarness(
    "cross-clinic hardware shell is rejected",
    createHarness({
      hardwareShells: [
        createHardwareShell("hardware-001", { clinicId: OTHER_CLINIC_ID }),
      ],
    }),
    createAssignment({ deploymentHardwareKey: "hardware-001" }),
    "hardware_cross_clinic_or_legacy",
  );
}

async function scenarioLegacyGlobalHardwareShell(): Promise<DeploymentPlannedAssignmentResolutionServiceHarnessScenario> {
  return expectIssueFromHarness(
    "legacy global hardware shell is rejected",
    createHarness({
      hardwareShells: [createHardwareShell("hardware-001", { clinicId: null })],
    }),
    createAssignment({ deploymentHardwareKey: "hardware-001" }),
    "hardware_cross_clinic_or_legacy",
  );
}

async function scenarioActiveHardwareShell(): Promise<DeploymentPlannedAssignmentResolutionServiceHarnessScenario> {
  return expectIssueFromHarness(
    "active hardware shell is rejected",
    createHarness({
      hardwareShells: [createHardwareShell("hardware-001", { active: true })],
    }),
    createAssignment({ deploymentHardwareKey: "hardware-001" }),
    "hardware_incompatible",
  );
}

async function scenarioArchivedHardwareShell(): Promise<DeploymentPlannedAssignmentResolutionServiceHarnessScenario> {
  return expectIssueFromHarness(
    "archived hardware shell is rejected",
    createHarness({
      hardwareShells: [
        createHardwareShell("hardware-001", { provisioningStatus: "archived" }),
      ],
    }),
    createAssignment({ deploymentHardwareKey: "hardware-001" }),
    "hardware_incompatible",
  );
}

async function scenarioWrongHardwareProvisioningSource(): Promise<DeploymentPlannedAssignmentResolutionServiceHarnessScenario> {
  return expectIssueFromHarness(
    "wrong hardware provisioning source is rejected",
    createHarness({
      hardwareShells: [
        createHardwareShell("hardware-001", { provisioningSource: "manual" }),
      ],
    }),
    createAssignment({ deploymentHardwareKey: "hardware-001" }),
    "hardware_incompatible",
  );
}

async function scenarioBoundHardwareShellRejected(): Promise<DeploymentPlannedAssignmentResolutionServiceHarnessScenario> {
  return expectIssueFromHarness(
    "operationally bound hardware shell is rejected",
    createHarness({
      hardwareShells: [
        createHardwareShell("hardware-001", {
          currentWorkstationId: "workstation-row-operational",
        }),
      ],
    }),
    createAssignment({ deploymentHardwareKey: "hardware-001" }),
    "hardware_operationally_bound",
  );
}

async function scenarioMissingWorkstationTarget(): Promise<DeploymentPlannedAssignmentResolutionServiceHarnessScenario> {
  return expectIssueFromHarness(
    "missing workstation target is unresolved",
    createHarness({ workstationShells: [] }),
    createAssignment({
      targetType: "workstation",
      targetDeploymentKey: "workstation-999",
    }),
    "target_missing",
  );
}

async function scenarioMissingSterilizerTarget(): Promise<DeploymentPlannedAssignmentResolutionServiceHarnessScenario> {
  return expectIssueFromHarness(
    "missing sterilizer target is unresolved",
    createHarness({ sterilizerShells: [] }),
    createAssignment({
      targetType: "sterilizer",
      targetDeploymentKey: "sterilizer-999",
    }),
    "target_missing",
  );
}

async function scenarioCrossClinicWorkstationTarget(): Promise<DeploymentPlannedAssignmentResolutionServiceHarnessScenario> {
  return expectIssueFromHarness(
    "cross-clinic workstation target is rejected",
    createHarness({
      workstationShells: [
        createWorkstationShell("workstation-001", {
          clinicId: OTHER_CLINIC_ID,
        }),
      ],
    }),
    createAssignment({ targetDeploymentKey: "workstation-001" }),
    "target_cross_clinic_or_legacy",
  );
}

async function scenarioCrossClinicSterilizerTarget(): Promise<DeploymentPlannedAssignmentResolutionServiceHarnessScenario> {
  return expectIssueFromHarness(
    "cross-clinic sterilizer target is rejected",
    createHarness({
      sterilizerShells: [
        createSterilizerShell("sterilizer-001", {
          clinicId: OTHER_CLINIC_ID,
        }),
      ],
    }),
    createAssignment({
      targetType: "sterilizer",
      targetDeploymentKey: "sterilizer-001",
    }),
    "target_cross_clinic_or_legacy",
  );
}

async function scenarioActiveWorkstationTarget(): Promise<DeploymentPlannedAssignmentResolutionServiceHarnessScenario> {
  return expectIssueFromHarness(
    "active workstation target is rejected",
    createHarness({
      workstationShells: [
        createWorkstationShell("workstation-001", { active: true }),
      ],
    }),
    createAssignment({ targetDeploymentKey: "workstation-001" }),
    "target_incompatible",
  );
}

async function scenarioActiveSterilizerTarget(): Promise<DeploymentPlannedAssignmentResolutionServiceHarnessScenario> {
  return expectIssueFromHarness(
    "active sterilizer target is rejected",
    createHarness({
      sterilizerShells: [
        createSterilizerShell("sterilizer-001", { active: true }),
      ],
    }),
    createAssignment({
      targetType: "sterilizer",
      targetDeploymentKey: "sterilizer-001",
    }),
    "target_incompatible",
  );
}

async function scenarioArchivedTarget(): Promise<DeploymentPlannedAssignmentResolutionServiceHarnessScenario> {
  return expectIssueFromHarness(
    "archived target is rejected",
    createHarness({
      workstationShells: [
        createWorkstationShell("workstation-001", {
          provisioningStatus: "archived",
        }),
      ],
    }),
    createAssignment({ targetDeploymentKey: "workstation-001" }),
    "target_incompatible",
  );
}

async function scenarioWrongTargetProvisioningSource(): Promise<DeploymentPlannedAssignmentResolutionServiceHarnessScenario> {
  return expectIssueFromHarness(
    "wrong target provisioning source is rejected",
    createHarness({
      workstationShells: [
        createWorkstationShell("workstation-001", {
          provisioningSource: "manual",
        }),
      ],
    }),
    createAssignment({ targetDeploymentKey: "workstation-001" }),
    "target_incompatible",
  );
}

async function scenarioMalformedHardwareKey(): Promise<DeploymentPlannedAssignmentResolutionServiceHarnessScenario> {
  const harness = createHarness();
  const result = await harness.service.resolveAssignmentsForClinicAssignments(
    CLINIC_ID,
    [createAssignment({ deploymentHardwareKey: "hardware-one" })],
  );

  return expectScenario(
    "malformed hardware key is rejected before hardware lookup",
    result.issues[0]?.code === "malformed_hardware_key" &&
      harness.repository.calls.findHardwareShellByDeploymentKey === 0,
    `code=${result.issues[0]?.code}; lookups=${harness.repository.calls.findHardwareShellByDeploymentKey}`,
  );
}

async function scenarioMalformedWorkstationKey(): Promise<DeploymentPlannedAssignmentResolutionServiceHarnessScenario> {
  const harness = createHarness();
  const result = await harness.service.resolveAssignmentsForClinicAssignments(
    CLINIC_ID,
    [createAssignment({ targetDeploymentKey: "workstation-one" })],
  );

  return expectScenario(
    "malformed workstation key is rejected before target lookup",
    result.issues[0]?.code === "malformed_target_key" &&
      harness.repository.calls.findWorkstationShellByDeploymentKey === 0,
    `code=${result.issues[0]?.code}; lookups=${harness.repository.calls.findWorkstationShellByDeploymentKey}`,
  );
}

async function scenarioMalformedSterilizerKey(): Promise<DeploymentPlannedAssignmentResolutionServiceHarnessScenario> {
  const harness = createHarness();
  const result = await harness.service.resolveAssignmentsForClinicAssignments(
    CLINIC_ID,
    [
      createAssignment({
        targetType: "sterilizer",
        targetDeploymentKey: "sterilizer-one",
      }),
    ],
  );

  return expectScenario(
    "malformed sterilizer key is rejected before target lookup",
    result.issues[0]?.code === "malformed_target_key" &&
      harness.repository.calls.findSterilizerShellByDeploymentKey === 0,
    `code=${result.issues[0]?.code}; lookups=${harness.repository.calls.findSterilizerShellByDeploymentKey}`,
  );
}

async function scenarioUnsupportedTargetType(): Promise<DeploymentPlannedAssignmentResolutionServiceHarnessScenario> {
  return expectIssueFromHarness(
    "unsupported target type is rejected",
    createHarness(),
    createAssignment({
      targetType: "cabinet",
      targetDeploymentKey: "cabinet-001",
    }),
    "unsupported_target_type",
  );
}

async function scenarioUnassignedWithTargetKey(): Promise<DeploymentPlannedAssignmentResolutionServiceHarnessScenario> {
  return expectIssueFromHarness(
    "unassigned assignment with non-null target key is rejected",
    createHarness(),
    createAssignment({
      targetType: "unassigned",
      targetDeploymentKey: "workstation-001",
    }),
    "unexpected_target_key",
  );
}

async function scenarioMixedBatchDeterministicOrdering(): Promise<DeploymentPlannedAssignmentResolutionServiceHarnessScenario> {
  const harness = createHarness({
    hardwareShells: [
      createHardwareShell("hardware-001"),
      createHardwareShell("hardware-003"),
    ],
    workstationShells: [createWorkstationShell("workstation-001")],
  });
  const result = await harness.service.resolveAssignmentsForClinicAssignments(
    CLINIC_ID,
    [
      createAssignment({
        deploymentHardwareKey: "hardware-003",
        targetDeploymentKey: "workstation-999",
      }),
      createAssignment({
        deploymentHardwareKey: "hardware-001",
        targetDeploymentKey: "workstation-001",
      }),
      createAssignment({
        deploymentHardwareKey: "hardware-002",
        targetDeploymentKey: "workstation-002",
      }),
    ],
  );

  return expectScenario(
    "mixed batch reports deterministic records and issue ordering",
    !result.ok &&
      result.counts.requested === 3 &&
      result.counts.resolved === 1 &&
      result.counts.unresolved === 2 &&
      result.records.map((record) => record.deploymentHardwareKey).join(",") ===
        "hardware-001,hardware-002,hardware-003" &&
      result.issues.map((issue) => issue.deploymentHardwareKey).join(",") ===
        "hardware-002,hardware-002,hardware-003",
    `records=${result.records.map((record) => record.deploymentHardwareKey).join(",")}; issues=${result.issues.map((issue) => issue.deploymentHardwareKey).join(",")}`,
  );
}

async function scenarioSourceRecordsRemainUnmodified(): Promise<DeploymentPlannedAssignmentResolutionServiceHarnessScenario> {
  const assignment = createAssignment({});
  const hardwareShell = createHardwareShell("hardware-001");
  const workstationShell = createWorkstationShell("workstation-001");
  const harness = createHarness({
    assignments: [assignment],
    hardwareShells: [hardwareShell],
    workstationShells: [workstationShell],
  });
  const before = JSON.stringify({
    assignments: harness.repository.assignments,
    hardwareShells: harness.repository.hardwareShells,
    workstationShells: harness.repository.workstationShells,
  });

  await harness.service.resolveAssignmentsForClinic(CLINIC_ID);

  return expectScenario(
    "source records remain unmodified",
    before ===
      JSON.stringify({
        assignments: harness.repository.assignments,
        hardwareShells: harness.repository.hardwareShells,
        workstationShells: harness.repository.workstationShells,
      }),
    "source snapshot unchanged",
  );
}

async function scenarioDownstreamCountersRemainZero(): Promise<DeploymentPlannedAssignmentResolutionServiceHarnessScenario> {
  const harness = createHarness();
  const result = await harness.service.resolveAssignmentsForClinicAssignments(
    CLINIC_ID,
    [createAssignment({})],
  );

  return expectScenario(
    "downstream counters remain zero",
    result.downstream.requested === 0 &&
      result.downstream.created === 0 &&
      result.downstream.reused === 0 &&
      result.downstream.skipped === 0 &&
      result.downstream.conflicts === 0 &&
      harness.repository.downstreamWriteCount === 0,
    `downstreamWrites=${harness.repository.downstreamWriteCount}`,
  );
}

async function expectIssueFromHarness(
  name: string,
  harness: {
    repository: InMemoryDeploymentPlannedAssignmentResolutionTestRepository;
    service: DeploymentPlannedAssignmentResolutionService;
  },
  assignment: DeploymentPlannedAssignmentResolutionAssignment,
  expectedCode: DeploymentPlannedAssignmentResolutionIssueCode,
): Promise<DeploymentPlannedAssignmentResolutionServiceHarnessScenario> {
  const result = await harness.service.resolveAssignmentsForClinicAssignments(
    CLINIC_ID,
    [assignment],
  );

  return expectScenario(
    name,
    !result.ok && result.issues[0]?.code === expectedCode,
    `code=${result.issues[0]?.code}; issues=${result.issues.length}`,
  );
}

function createHarness(input: {
  assignments?: readonly DeploymentPlannedAssignmentResolutionAssignment[];
  hardwareShells?: readonly DeploymentPlannedAssignmentResolutionHardwareShell[];
  workstationShells?: readonly DeploymentPlannedAssignmentResolutionWorkstationShell[];
  sterilizerShells?: readonly DeploymentPlannedAssignmentResolutionSterilizerShell[];
} = {}): {
  repository: InMemoryDeploymentPlannedAssignmentResolutionTestRepository;
  service: DeploymentPlannedAssignmentResolutionService;
} {
  const repository =
    new InMemoryDeploymentPlannedAssignmentResolutionTestRepository({
      assignments: input.assignments ?? [],
      hardwareShells: input.hardwareShells ?? [
        createHardwareShell("hardware-001"),
      ],
      workstationShells: input.workstationShells ?? [
        createWorkstationShell("workstation-001"),
      ],
      sterilizerShells: input.sterilizerShells ?? [
        createSterilizerShell("sterilizer-001"),
      ],
    });

  return {
    repository,
    service: new DeploymentPlannedAssignmentResolutionService(repository),
  };
}

function createAssignment(
  input: Partial<DeploymentPlannedAssignmentResolutionAssignment>,
): DeploymentPlannedAssignmentResolutionAssignment {
  const deploymentHardwareKey = input.deploymentHardwareKey ?? "hardware-001";

  return {
    clinicId: input.clinicId ?? CLINIC_ID,
    deploymentHardwareKey,
    assignmentKey:
      input.assignmentKey ?? `hardware-assignment-${deploymentHardwareKey}`,
    targetType: input.targetType ?? "workstation",
    targetDeploymentKey:
      input.targetDeploymentKey === undefined
        ? "workstation-001"
        : input.targetDeploymentKey,
  };
}

function createHardwareShell(
  deploymentHardwareKey: string,
  input: Partial<DeploymentPlannedAssignmentResolutionHardwareShell> = {},
): DeploymentPlannedAssignmentResolutionHardwareShell {
  return {
    id: input.id ?? `hardware-row-${deploymentHardwareKey}`,
    clinicId: input.clinicId === undefined ? CLINIC_ID : input.clinicId,
    deploymentHardwareKey:
      input.deploymentHardwareKey ?? deploymentHardwareKey,
    status: input.status ?? "planned",
    provisioningSource: input.provisioningSource ?? "setup_draft",
    provisioningStatus: input.provisioningStatus ?? "planned",
    active: input.active ?? false,
    agentId: input.agentId ?? null,
    defaultWorkstationId: input.defaultWorkstationId ?? null,
    currentWorkstationId: input.currentWorkstationId ?? null,
  };
}

function createWorkstationShell(
  deploymentWorkstationKey: string,
  input: Partial<DeploymentPlannedAssignmentResolutionWorkstationShell> = {},
): DeploymentPlannedAssignmentResolutionWorkstationShell {
  return {
    id: input.id ?? `workstation-row-${deploymentWorkstationKey}`,
    clinicId: input.clinicId === undefined ? CLINIC_ID : input.clinicId,
    deploymentWorkstationKey:
      input.deploymentWorkstationKey ?? deploymentWorkstationKey,
    status: input.status ?? "planned",
    provisioningSource: input.provisioningSource ?? "setup_draft",
    provisioningStatus: input.provisioningStatus ?? "planned",
    active: input.active ?? false,
  };
}

function createSterilizerShell(
  deploymentSterilizerKey: string,
  input: Partial<DeploymentPlannedAssignmentResolutionSterilizerShell> = {},
): DeploymentPlannedAssignmentResolutionSterilizerShell {
  return {
    id: input.id ?? `sterilizer-row-${deploymentSterilizerKey}`,
    clinicId: input.clinicId === undefined ? CLINIC_ID : input.clinicId,
    deploymentSterilizerKey:
      input.deploymentSterilizerKey ?? deploymentSterilizerKey,
    provisioningSource: input.provisioningSource ?? "setup_draft",
    provisioningStatus: input.provisioningStatus ?? "planned",
    active: input.active ?? false,
  };
}

function expectScenario(
  name: string,
  passed: boolean,
  message: string,
): DeploymentPlannedAssignmentResolutionServiceHarnessScenario {
  return {
    name,
    passed,
    message,
  };
}
