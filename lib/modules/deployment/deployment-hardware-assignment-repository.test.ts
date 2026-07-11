import { InMemoryDeploymentHardwareAssignmentTestRepository } from "./deployment-hardware-assignment-test-repository";
import type {
  CreateDeploymentHardwareAssignmentPayload,
  DeploymentHardwareAssignmentRecord,
} from "./deployment-hardware-assignment-types";

export interface DeploymentHardwareAssignmentRepositoryHarnessScenario {
  name: string;
  passed: boolean;
  message: string;
}

export interface DeploymentHardwareAssignmentRepositoryHarnessResult {
  passed: boolean;
  scenarios: readonly DeploymentHardwareAssignmentRepositoryHarnessScenario[];
}

const CLINIC_ID = "clinic-hardware-assignment-repository-0001";
const OTHER_CLINIC_ID = "clinic-hardware-assignment-repository-0002";
const FIXED_TIMESTAMP = "2026-07-10T12:00:00.000Z";

export async function runDeploymentHardwareAssignmentRepositoryHarness(): Promise<DeploymentHardwareAssignmentRepositoryHarnessResult> {
  const scenarios = [
    await scenarioDirectCreateReusesCompatibleExistingAssignment(),
    await scenarioDirectCreateRejectsIncompatibleDuplicate(),
    await scenarioSameHardwareKeyAcrossClinicsStaysScoped(),
    await scenarioListOrderingIsDeterministic(),
  ];

  return {
    passed: scenarios.every((scenario) => scenario.passed),
    scenarios,
  };
}

async function scenarioDirectCreateReusesCompatibleExistingAssignment(): Promise<DeploymentHardwareAssignmentRepositoryHarnessScenario> {
  const existingAssignment = createAssignmentRecord({
    id: "assignment-existing-compatible",
    clinicId: CLINIC_ID,
    deploymentHardwareKey: "hardware-001",
    targetDeploymentKey: "workstation-001",
  });
  const repository = new InMemoryDeploymentHardwareAssignmentTestRepository({
    assignments: [existingAssignment],
  });
  const result = await repository.createHardwareAssignment(
    createPayload({
      deploymentHardwareKey: "hardware-001",
      targetDeploymentKey: "workstation-001",
    }),
  );

  return expectScenario(
    "repository direct create reuses compatible existing assignment",
    result.ok &&
      result.assignment?.id === existingAssignment.id &&
      repository.assignments.length === 1,
    `ok=${result.ok}; id=${result.assignment?.id}; total=${repository.assignments.length}`,
  );
}

async function scenarioDirectCreateRejectsIncompatibleDuplicate(): Promise<DeploymentHardwareAssignmentRepositoryHarnessScenario> {
  const repository = new InMemoryDeploymentHardwareAssignmentTestRepository({
    assignments: [
      createAssignmentRecord({
        id: "assignment-existing-conflict",
        clinicId: CLINIC_ID,
        deploymentHardwareKey: "hardware-001",
        targetDeploymentKey: "workstation-999",
      }),
    ],
  });
  const result = await repository.createHardwareAssignment(
    createPayload({
      deploymentHardwareKey: "hardware-001",
      targetDeploymentKey: "workstation-001",
    }),
  );

  return expectScenario(
    "repository direct create rejects incompatible duplicate assignment",
    !result.ok &&
      result.assignment?.targetDeploymentKey === "workstation-999" &&
      repository.assignments.length === 1,
    `ok=${result.ok}; target=${result.assignment?.targetDeploymentKey}; total=${repository.assignments.length}`,
  );
}

async function scenarioSameHardwareKeyAcrossClinicsStaysScoped(): Promise<DeploymentHardwareAssignmentRepositoryHarnessScenario> {
  const repository = new InMemoryDeploymentHardwareAssignmentTestRepository({
    assignments: [
      createAssignmentRecord({
        id: "assignment-other-clinic",
        clinicId: OTHER_CLINIC_ID,
        deploymentHardwareKey: "hardware-001",
        targetDeploymentKey: "workstation-001",
      }),
    ],
  });
  const result = await repository.createHardwareAssignment(
    createPayload({
      deploymentHardwareKey: "hardware-001",
      targetDeploymentKey: "workstation-001",
    }),
  );

  return expectScenario(
    "repository scopes duplicate protection by clinic and hardware key",
    result.ok &&
      result.assignment?.clinicId === CLINIC_ID &&
      repository.assignments.length === 2,
    `ok=${result.ok}; clinic=${result.assignment?.clinicId}; total=${repository.assignments.length}`,
  );
}

async function scenarioListOrderingIsDeterministic(): Promise<DeploymentHardwareAssignmentRepositoryHarnessScenario> {
  const repository = new InMemoryDeploymentHardwareAssignmentTestRepository({
    assignments: [
      createAssignmentRecord({
        id: "assignment-hardware-003",
        clinicId: CLINIC_ID,
        deploymentHardwareKey: "hardware-003",
        targetDeploymentKey: "workstation-003",
      }),
      createAssignmentRecord({
        id: "assignment-hardware-001",
        clinicId: CLINIC_ID,
        deploymentHardwareKey: "hardware-001",
        targetDeploymentKey: "workstation-001",
      }),
      createAssignmentRecord({
        id: "assignment-hardware-002",
        clinicId: CLINIC_ID,
        deploymentHardwareKey: "hardware-002",
        targetDeploymentKey: "workstation-002",
      }),
    ],
  });
  const assignments =
    await repository.listDeploymentHardwareAssignments(CLINIC_ID);

  return expectScenario(
    "repository list ordering is deterministic by deployment hardware key",
    assignments
      .map((assignment) => assignment.deploymentHardwareKey)
      .join(",") === "hardware-001,hardware-002,hardware-003",
    `keys=${assignments
      .map((assignment) => assignment.deploymentHardwareKey)
      .join(",")}`,
  );
}

function createPayload(input: {
  deploymentHardwareKey: string;
  targetDeploymentKey: string | null;
}): CreateDeploymentHardwareAssignmentPayload {
  return {
    clinicId: CLINIC_ID,
    deploymentHardwareAssignmentKey: `hardware-assignment-${input.deploymentHardwareKey}`,
    deploymentHardwareKey: input.deploymentHardwareKey,
    targetType: input.targetDeploymentKey ? "workstation" : "unassigned",
    targetDeploymentKey: input.targetDeploymentKey,
    assignmentStatus: "planned",
    assignmentSource: "setup_draft",
    active: false,
    displayOrder: Number(input.deploymentHardwareKey.slice(-3)),
    reason: null,
    metadata: {},
    createdAt: FIXED_TIMESTAMP,
    updatedAt: FIXED_TIMESTAMP,
  };
}

function createAssignmentRecord(input: {
  id: string;
  clinicId: string | null;
  deploymentHardwareKey: string | null;
  targetDeploymentKey: string | null;
}): DeploymentHardwareAssignmentRecord {
  return {
    id: input.id,
    clinicId: input.clinicId,
    deploymentHardwareAssignmentKey: input.deploymentHardwareKey
      ? `hardware-assignment-${input.deploymentHardwareKey}`
      : null,
    deploymentHardwareKey: input.deploymentHardwareKey,
    targetType: input.targetDeploymentKey ? "workstation" : "unassigned",
    targetDeploymentKey: input.targetDeploymentKey,
    assignmentStatus: "planned",
    assignmentSource: "setup_draft",
    active: false,
    displayOrder: input.deploymentHardwareKey
      ? Number(input.deploymentHardwareKey.slice(-3))
      : null,
    reason: null,
    metadata: {},
    createdAt: FIXED_TIMESTAMP,
    updatedAt: FIXED_TIMESTAMP,
  };
}

function expectScenario(
  name: string,
  passed: boolean,
  message: string,
): DeploymentHardwareAssignmentRepositoryHarnessScenario {
  return {
    name,
    passed,
    message,
  };
}
