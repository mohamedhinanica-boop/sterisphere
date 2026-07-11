import { DeploymentAssignmentTargetValidationService } from "./deployment-assignment-target-validation-service";
import { InMemoryDeploymentAssignmentTargetValidationTestRepository } from "./deployment-assignment-target-validation-test-repository";
import type {
  DeploymentAssignmentTargetValidationAssignment,
  DeploymentAssignmentTargetValidationIssueCode,
  DeploymentAssignmentTargetValidationSterilizerTarget,
  DeploymentAssignmentTargetValidationWorkstationTarget,
} from "./deployment-assignment-target-validation-types";

export interface DeploymentAssignmentTargetValidationServiceHarnessScenario {
  name: string;
  passed: boolean;
  message: string;
}

export interface DeploymentAssignmentTargetValidationServiceHarnessResult {
  passed: boolean;
  scenarios: readonly DeploymentAssignmentTargetValidationServiceHarnessScenario[];
}

const CLINIC_ID = "clinic-assignment-target-validation-0001";
const OTHER_CLINIC_ID = "clinic-assignment-target-validation-0002";

export async function runDeploymentAssignmentTargetValidationServiceHarness(): Promise<DeploymentAssignmentTargetValidationServiceHarnessResult> {
  const scenarios = [
    await scenarioValidWorkstationAssignment(),
    await scenarioValidSterilizerAssignment(),
    await scenarioExplicitUnassignedDoesNotLookup(),
    await scenarioRejectsUnassignedWithTargetKey(),
    await scenarioRejectsMissingWorkstationKey(),
    await scenarioRejectsMissingSterilizerKey(),
    await scenarioRejectsUnknownTarget(),
    await scenarioRejectsUnknownSterilizerTarget(),
    await scenarioRejectsCrossClinicWorkstation(),
    await scenarioRejectsCrossClinicSterilizer(),
    await scenarioRejectsLegacyGlobalWorkstation(),
    await scenarioRejectsLegacyGlobalSterilizer(),
    await scenarioRejectsActiveTarget(),
    await scenarioRejectsActiveSterilizerTarget(),
    await scenarioRejectsArchivedTarget(),
    await scenarioRejectsWrongProvisioningSource(),
    await scenarioRejectsUnsupportedTargetType(),
    await scenarioRejectsMalformedDeterministicKey(),
    await scenarioBatchResultCountersAndOrdering(),
    await scenarioEmptyAssignmentSet(),
    await scenarioDoesNotMutateInputs(),
    await scenarioDownstreamCountersRemainZero(),
  ];

  return {
    passed: scenarios.every((scenario) => scenario.passed),
    scenarios,
  };
}

async function scenarioValidWorkstationAssignment(): Promise<DeploymentAssignmentTargetValidationServiceHarnessScenario> {
  const harness = createHarness({
    assignments: [
      createAssignment({
        deploymentHardwareKey: "hardware-001",
        targetType: "workstation",
        targetDeploymentKey: "workstation-001",
      }),
    ],
    workstationTargets: [createWorkstationTarget("workstation-001")],
  });
  const result =
    await harness.service.validateAssignmentTargetsForClinic(CLINIC_ID);

  return expectScenario(
    "valid workstation target passes",
    result.ok && result.counts.valid === 1 && result.issues.length === 0,
    `valid=${result.counts.valid}; issues=${result.issues.length}`,
  );
}

async function scenarioValidSterilizerAssignment(): Promise<DeploymentAssignmentTargetValidationServiceHarnessScenario> {
  const harness = createHarness({
    assignments: [
      createAssignment({
        deploymentHardwareKey: "hardware-001",
        targetType: "sterilizer",
        targetDeploymentKey: "sterilizer-001",
      }),
    ],
    sterilizerTargets: [createSterilizerTarget("sterilizer-001")],
  });
  const result =
    await harness.service.validateAssignmentTargetsForClinic(CLINIC_ID);

  return expectScenario(
    "valid sterilizer target passes",
    result.ok && result.counts.valid === 1 && result.issues.length === 0,
    `valid=${result.counts.valid}; issues=${result.issues.length}`,
  );
}

async function scenarioExplicitUnassignedDoesNotLookup(): Promise<DeploymentAssignmentTargetValidationServiceHarnessScenario> {
  const harness = createHarness({
    assignments: [
      createAssignment({
        deploymentHardwareKey: "hardware-001",
        targetType: "unassigned",
        targetDeploymentKey: null,
      }),
    ],
  });
  const result =
    await harness.service.validateAssignmentTargetsForClinic(CLINIC_ID);

  return expectScenario(
    "explicit unassigned state is valid without target lookup",
    result.ok &&
      result.counts.valid === 1 &&
      harness.repository.calls.findWorkstationTargetByDeploymentKey === 0 &&
      harness.repository.calls.findSterilizerTargetByDeploymentKey === 0,
    `valid=${result.counts.valid}; workstationLookups=${harness.repository.calls.findWorkstationTargetByDeploymentKey}`,
  );
}

async function scenarioRejectsUnassignedWithTargetKey(): Promise<DeploymentAssignmentTargetValidationServiceHarnessScenario> {
  const harness = createHarness({
    assignments: [
      createAssignment({
        deploymentHardwareKey: "hardware-001",
        targetType: "unassigned",
        targetDeploymentKey: "workstation-001",
      }),
    ],
  });
  const result =
    await harness.service.validateAssignmentTargetsForClinic(CLINIC_ID);

  return expectIssueScenario(
    "unassigned assignment with target key is invalid",
    result.issues[0]?.code,
    "unexpected_target_key",
  );
}

async function scenarioRejectsMissingWorkstationKey(): Promise<DeploymentAssignmentTargetValidationServiceHarnessScenario> {
  const harness = createHarness({
    assignments: [
      createAssignment({
        deploymentHardwareKey: "hardware-001",
        targetType: "workstation",
        targetDeploymentKey: null,
      }),
    ],
  });
  const result =
    await harness.service.validateAssignmentTargetsForClinic(CLINIC_ID);

  return expectIssueScenario(
    "workstation target requires a key",
    result.issues[0]?.code,
    "missing_target_key",
  );
}

async function scenarioRejectsMissingSterilizerKey(): Promise<DeploymentAssignmentTargetValidationServiceHarnessScenario> {
  const harness = createHarness({
    assignments: [
      createAssignment({
        deploymentHardwareKey: "hardware-001",
        targetType: "sterilizer",
        targetDeploymentKey: null,
      }),
    ],
  });
  const result =
    await harness.service.validateAssignmentTargetsForClinic(CLINIC_ID);

  return expectIssueScenario(
    "sterilizer target requires a key",
    result.issues[0]?.code,
    "missing_target_key",
  );
}

async function scenarioRejectsUnknownTarget(): Promise<DeploymentAssignmentTargetValidationServiceHarnessScenario> {
  const harness = createHarness({
    assignments: [
      createAssignment({
        deploymentHardwareKey: "hardware-001",
        targetType: "workstation",
        targetDeploymentKey: "workstation-999",
      }),
    ],
  });
  const result =
    await harness.service.validateAssignmentTargetsForClinic(CLINIC_ID);

  return expectIssueScenario(
    "unknown target key is missing",
    result.issues[0]?.code,
    "target_missing",
  );
}


async function scenarioRejectsUnknownSterilizerTarget(): Promise<DeploymentAssignmentTargetValidationServiceHarnessScenario> {
  const harness = createHarness({
    assignments: [
      createAssignment({
        deploymentHardwareKey: "hardware-001",
        targetType: "sterilizer",
        targetDeploymentKey: "sterilizer-999",
      }),
    ],
  });
  const result =
    await harness.service.validateAssignmentTargetsForClinic(CLINIC_ID);

  return expectIssueScenario(
    "unknown sterilizer target key is missing",
    result.issues[0]?.code,
    "target_missing",
  );
}
async function scenarioRejectsCrossClinicWorkstation(): Promise<DeploymentAssignmentTargetValidationServiceHarnessScenario> {
  const harness = createHarness({
    assignments: [
      createAssignment({
        deploymentHardwareKey: "hardware-001",
        targetType: "workstation",
        targetDeploymentKey: "workstation-001",
      }),
    ],
    workstationTargets: [
      createWorkstationTarget("workstation-001", {
        clinicId: OTHER_CLINIC_ID,
      }),
    ],
  });
  const result =
    await harness.service.validateAssignmentTargetsForClinic(CLINIC_ID);

  return expectIssueScenario(
    "cross-clinic workstation target is rejected",
    result.issues[0]?.code,
    "target_cross_clinic_or_legacy",
  );
}


async function scenarioRejectsCrossClinicSterilizer(): Promise<DeploymentAssignmentTargetValidationServiceHarnessScenario> {
  const harness = createHarness({
    assignments: [
      createAssignment({
        deploymentHardwareKey: "hardware-001",
        targetType: "sterilizer",
        targetDeploymentKey: "sterilizer-001",
      }),
    ],
    sterilizerTargets: [
      createSterilizerTarget("sterilizer-001", {
        clinicId: OTHER_CLINIC_ID,
      }),
    ],
  });
  const result =
    await harness.service.validateAssignmentTargetsForClinic(CLINIC_ID);

  return expectIssueScenario(
    "cross-clinic sterilizer target is rejected",
    result.issues[0]?.code,
    "target_cross_clinic_or_legacy",
  );
}

async function scenarioRejectsLegacyGlobalWorkstation(): Promise<DeploymentAssignmentTargetValidationServiceHarnessScenario> {
  const harness = createHarness({
    assignments: [
      createAssignment({
        deploymentHardwareKey: "hardware-001",
        targetType: "workstation",
        targetDeploymentKey: "workstation-001",
      }),
    ],
    workstationTargets: [
      createWorkstationTarget("workstation-001", {
        clinicId: null,
      }),
    ],
  });
  const result =
    await harness.service.validateAssignmentTargetsForClinic(CLINIC_ID);

  return expectIssueScenario(
    "legacy global workstation target is rejected",
    result.issues[0]?.code,
    "target_cross_clinic_or_legacy",
  );
}
async function scenarioRejectsLegacyGlobalSterilizer(): Promise<DeploymentAssignmentTargetValidationServiceHarnessScenario> {
  const harness = createHarness({
    assignments: [
      createAssignment({
        deploymentHardwareKey: "hardware-001",
        targetType: "sterilizer",
        targetDeploymentKey: "sterilizer-001",
      }),
    ],
    sterilizerTargets: [
      createSterilizerTarget("sterilizer-001", {
        clinicId: null,
      }),
    ],
  });
  const result =
    await harness.service.validateAssignmentTargetsForClinic(CLINIC_ID);

  return expectIssueScenario(
    "legacy global sterilizer target is rejected",
    result.issues[0]?.code,
    "target_cross_clinic_or_legacy",
  );
}

async function scenarioRejectsActiveTarget(): Promise<DeploymentAssignmentTargetValidationServiceHarnessScenario> {
  const harness = createHarness({
    assignments: [
      createAssignment({
        deploymentHardwareKey: "hardware-001",
        targetType: "workstation",
        targetDeploymentKey: "workstation-001",
      }),
    ],
    workstationTargets: [
      createWorkstationTarget("workstation-001", {
        active: true,
      }),
    ],
  });
  const result =
    await harness.service.validateAssignmentTargetsForClinic(CLINIC_ID);

  return expectIssueScenario(
    "active target is incompatible",
    result.issues[0]?.code,
    "target_incompatible",
  );
}


async function scenarioRejectsActiveSterilizerTarget(): Promise<DeploymentAssignmentTargetValidationServiceHarnessScenario> {
  const harness = createHarness({
    assignments: [
      createAssignment({
        deploymentHardwareKey: "hardware-001",
        targetType: "sterilizer",
        targetDeploymentKey: "sterilizer-001",
      }),
    ],
    sterilizerTargets: [
      createSterilizerTarget("sterilizer-001", {
        active: true,
      }),
    ],
  });
  const result =
    await harness.service.validateAssignmentTargetsForClinic(CLINIC_ID);

  return expectIssueScenario(
    "active sterilizer target is incompatible",
    result.issues[0]?.code,
    "target_incompatible",
  );
}
async function scenarioRejectsArchivedTarget(): Promise<DeploymentAssignmentTargetValidationServiceHarnessScenario> {
  const harness = createHarness({
    assignments: [
      createAssignment({
        deploymentHardwareKey: "hardware-001",
        targetType: "sterilizer",
        targetDeploymentKey: "sterilizer-001",
      }),
    ],
    sterilizerTargets: [
      createSterilizerTarget("sterilizer-001", {
        provisioningStatus: "archived",
      }),
    ],
  });
  const result =
    await harness.service.validateAssignmentTargetsForClinic(CLINIC_ID);

  return expectIssueScenario(
    "archived target is incompatible",
    result.issues[0]?.code,
    "target_incompatible",
  );
}

async function scenarioRejectsWrongProvisioningSource(): Promise<DeploymentAssignmentTargetValidationServiceHarnessScenario> {
  const harness = createHarness({
    assignments: [
      createAssignment({
        deploymentHardwareKey: "hardware-001",
        targetType: "workstation",
        targetDeploymentKey: "workstation-001",
      }),
    ],
    workstationTargets: [
      createWorkstationTarget("workstation-001", {
        provisioningSource: "manual",
      }),
    ],
  });
  const result =
    await harness.service.validateAssignmentTargetsForClinic(CLINIC_ID);

  return expectIssueScenario(
    "wrong provisioning source is incompatible",
    result.issues[0]?.code,
    "target_incompatible",
  );
}

async function scenarioRejectsUnsupportedTargetType(): Promise<DeploymentAssignmentTargetValidationServiceHarnessScenario> {
  const harness = createHarness({
    assignments: [
      createAssignment({
        deploymentHardwareKey: "hardware-001",
        targetType: "cabinet",
        targetDeploymentKey: "cabinet-001",
      }),
    ],
  });
  const result =
    await harness.service.validateAssignmentTargetsForClinic(CLINIC_ID);

  return expectIssueScenario(
    "unsupported target type is rejected",
    result.issues[0]?.code,
    "unsupported_target_type",
  );
}

async function scenarioRejectsMalformedDeterministicKey(): Promise<DeploymentAssignmentTargetValidationServiceHarnessScenario> {
  const harness = createHarness({
    assignments: [
      createAssignment({
        deploymentHardwareKey: "hardware-001",
        targetType: "workstation",
        targetDeploymentKey: "workstation-one",
      }),
    ],
  });
  const result =
    await harness.service.validateAssignmentTargetsForClinic(CLINIC_ID);

  return expectScenario(
    "malformed deterministic target key is rejected before lookup",
    result.issues[0]?.code === "malformed_target_key" &&
      harness.repository.calls.findWorkstationTargetByDeploymentKey === 0,
    `code=${result.issues[0]?.code}; lookups=${harness.repository.calls.findWorkstationTargetByDeploymentKey}`,
  );
}

async function scenarioBatchResultCountersAndOrdering(): Promise<DeploymentAssignmentTargetValidationServiceHarnessScenario> {
  const harness = createHarness({
    assignments: [
      createAssignment({
        deploymentHardwareKey: "hardware-003",
        targetType: "workstation",
        targetDeploymentKey: "workstation-999",
      }),
      createAssignment({
        deploymentHardwareKey: "hardware-001",
        targetType: "workstation",
        targetDeploymentKey: "workstation-001",
      }),
      createAssignment({
        deploymentHardwareKey: "hardware-002",
        targetType: "sterilizer",
        targetDeploymentKey: "sterilizer-999",
      }),
    ],
    workstationTargets: [createWorkstationTarget("workstation-001")],
  });
  const result =
    await harness.service.validateAssignmentTargetsForClinic(CLINIC_ID);

  return expectScenario(
    "batch result counters and issue ordering are deterministic",
    !result.ok &&
      result.counts.requested === 3 &&
      result.counts.valid === 1 &&
      result.counts.invalid === 2 &&
      result.counts.missingTargets === 2 &&
      result.issues.map((issue) => issue.deploymentHardwareKey).join(",") ===
        "hardware-002,hardware-003",
    `requested=${result.counts.requested}; valid=${result.counts.valid}; issues=${result.issues.map((issue) => issue.deploymentHardwareKey).join(",")}`,
  );
}

async function scenarioRuntimePayloadValidationDoesNotReadAssignmentRows(): Promise<DeploymentAssignmentTargetValidationServiceHarnessScenario> {
  const harness = createHarness({
    assignments: [
      createAssignment({
        deploymentHardwareKey: "hardware-999",
        targetType: "workstation",
        targetDeploymentKey: "workstation-999",
      }),
    ],
    workstationTargets: [createWorkstationTarget("workstation-001")],
  });
  const result = await harness.service.validateAssignmentTargetsForClinicAssignments(
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
    "runtime payload validation does not read persisted assignment rows",
    result.ok &&
      result.counts.requested === 1 &&
      harness.repository.calls.listPlannedHardwareAssignments === 0,
    `requested=${result.counts.requested}; assignmentReads=${harness.repository.calls.listPlannedHardwareAssignments}`,
  );
}

async function scenarioRuntimePayloadValidationBlocksInvalidBatch(): Promise<DeploymentAssignmentTargetValidationServiceHarnessScenario> {
  const harness = createHarness({
    workstationTargets: [createWorkstationTarget("workstation-001")],
  });
  const result = await harness.service.validateAssignmentTargetsForClinicAssignments(
    CLINIC_ID,
    [
      createAssignment({
        deploymentHardwareKey: "hardware-001",
        targetType: "workstation",
        targetDeploymentKey: "workstation-001",
      }),
      createAssignment({
        deploymentHardwareKey: "hardware-002",
        targetType: "sterilizer",
        targetDeploymentKey: "sterilizer-999",
      }),
    ],
  );

  return expectScenario(
    "runtime payload validation blocks invalid target batches deterministically",
    !result.ok &&
      result.counts.requested === 2 &&
      result.counts.valid === 1 &&
      result.counts.invalid === 1 &&
      result.issues[0]?.deploymentHardwareKey === "hardware-002" &&
      result.issues[0]?.code === "target_missing",
    `requested=${result.counts.requested}; valid=${result.counts.valid}; issue=${result.issues[0]?.code}`,
  );
}

async function scenarioRuntimePayloadValidationKeepsDownstreamCountersZero(): Promise<DeploymentAssignmentTargetValidationServiceHarnessScenario> {
  const harness = createHarness({
    workstationTargets: [createWorkstationTarget("workstation-001")],
  });
  const result = await harness.service.validateAssignmentTargetsForClinicAssignments(
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
    "runtime payload validation keeps downstream counters zero",
    result.ok &&
      result.downstream.requested === 0 &&
      result.downstream.created === 0 &&
      result.downstream.reused === 0 &&
      result.downstream.skipped === 0 &&
      result.downstream.conflicts === 0 &&
      harness.repository.downstreamWriteCount === 0,
    `downstreamWrites=${harness.repository.downstreamWriteCount}`,
  );
}
async function scenarioEmptyAssignmentSet(): Promise<DeploymentAssignmentTargetValidationServiceHarnessScenario> {
  const harness = createHarness();
  const result =
    await harness.service.validateAssignmentTargetsForClinic(CLINIC_ID);

  return expectScenario(
    "empty assignment set validates with zero counts",
    result.ok &&
      result.counts.requested === 0 &&
      result.counts.valid === 0 &&
      result.counts.invalid === 0,
    `requested=${result.counts.requested}; valid=${result.counts.valid}`,
  );
}

async function scenarioDoesNotMutateInputs(): Promise<DeploymentAssignmentTargetValidationServiceHarnessScenario> {
  const assignment = createAssignment({
    deploymentHardwareKey: "hardware-001",
    targetType: "workstation",
    targetDeploymentKey: "workstation-001",
  });
  const workstationTarget = createWorkstationTarget("workstation-001");
  const harness = createHarness({
    assignments: [assignment],
    workstationTargets: [workstationTarget],
  });
  const before = JSON.stringify({ assignment, workstationTarget });

  await harness.service.validateAssignmentTargetsForClinic(CLINIC_ID);

  return expectScenario(
    "validation does not mutate assignment or target inputs",
    before === JSON.stringify({ assignment, workstationTarget }),
    `beforeAfterEqual=${before === JSON.stringify({ assignment, workstationTarget })}`,
  );
}

async function scenarioDownstreamCountersRemainZero(): Promise<DeploymentAssignmentTargetValidationServiceHarnessScenario> {
  const harness = createHarness({
    assignments: [
      createAssignment({
        deploymentHardwareKey: "hardware-001",
        targetType: "workstation",
        targetDeploymentKey: "workstation-001",
      }),
    ],
    workstationTargets: [createWorkstationTarget("workstation-001")],
  });
  const result =
    await harness.service.validateAssignmentTargetsForClinic(CLINIC_ID);

  return expectScenario(
    "downstream counters remain zero",
    harness.repository.downstreamWriteCount === 0 &&
      result.downstream.requested === 0 &&
      result.downstream.created === 0 &&
      result.downstream.reused === 0 &&
      result.downstream.skipped === 0 &&
      result.downstream.conflicts === 0,
    `downstreamWrites=${harness.repository.downstreamWriteCount}`,
  );
}

function createHarness(input: {
  assignments?: readonly DeploymentAssignmentTargetValidationAssignment[];
  workstationTargets?: readonly DeploymentAssignmentTargetValidationWorkstationTarget[];
  sterilizerTargets?: readonly DeploymentAssignmentTargetValidationSterilizerTarget[];
} = {}): {
  repository: InMemoryDeploymentAssignmentTargetValidationTestRepository;
  service: DeploymentAssignmentTargetValidationService;
} {
  const repository =
    new InMemoryDeploymentAssignmentTargetValidationTestRepository(input);

  return {
    repository,
    service: new DeploymentAssignmentTargetValidationService(repository),
  };
}

function createAssignment(input: {
  deploymentHardwareKey: string;
  targetType: string;
  targetDeploymentKey: string | null;
  clinicId?: string;
  assignmentStatus?: string;
  assignmentSource?: string;
  active?: boolean;
}): DeploymentAssignmentTargetValidationAssignment {
  return {
    clinicId: input.clinicId ?? CLINIC_ID,
    deploymentHardwareKey: input.deploymentHardwareKey,
    deploymentHardwareAssignmentKey: `hardware-assignment-${input.deploymentHardwareKey}`,
    targetType: input.targetType,
    targetDeploymentKey: input.targetDeploymentKey,
    assignmentStatus: input.assignmentStatus ?? "planned",
    assignmentSource: input.assignmentSource ?? "setup_draft",
    active: input.active ?? false,
  };
}

function createWorkstationTarget(
  deploymentWorkstationKey: string,
  input: Partial<DeploymentAssignmentTargetValidationWorkstationTarget> = {},
): DeploymentAssignmentTargetValidationWorkstationTarget {
  return {
    id: input.id ?? `target-${deploymentWorkstationKey}`,
    clinicId: input.clinicId === undefined ? CLINIC_ID : input.clinicId,
    deploymentWorkstationKey:
      input.deploymentWorkstationKey ?? deploymentWorkstationKey,
    status: input.status ?? "planned",
    provisioningSource: input.provisioningSource ?? "setup_draft",
    provisioningStatus: input.provisioningStatus ?? "planned",
    active: input.active ?? false,
  };
}

function createSterilizerTarget(
  deploymentSterilizerKey: string,
  input: Partial<DeploymentAssignmentTargetValidationSterilizerTarget> = {},
): DeploymentAssignmentTargetValidationSterilizerTarget {
  return {
    id: input.id ?? `target-${deploymentSterilizerKey}`,
    clinicId: input.clinicId === undefined ? CLINIC_ID : input.clinicId,
    deploymentSterilizerKey:
      input.deploymentSterilizerKey ?? deploymentSterilizerKey,
    provisioningSource: input.provisioningSource ?? "setup_draft",
    provisioningStatus: input.provisioningStatus ?? "planned",
    active: input.active ?? false,
  };
}

function expectIssueScenario(
  name: string,
  actual: DeploymentAssignmentTargetValidationIssueCode | undefined,
  expected: DeploymentAssignmentTargetValidationIssueCode,
): DeploymentAssignmentTargetValidationServiceHarnessScenario {
  return expectScenario(name, actual === expected, `code=${actual}`);
}

function expectScenario(
  name: string,
  passed: boolean,
  message: string,
): DeploymentAssignmentTargetValidationServiceHarnessScenario {
  return {
    name,
    passed,
    message,
  };
}
