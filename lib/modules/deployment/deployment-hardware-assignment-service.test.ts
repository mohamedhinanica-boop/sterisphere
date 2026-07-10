import {
  CURRENT_DEPLOYMENT_DRAFT_VERSION,
  type DeploymentDraft,
} from "./deployment-draft";
import {
  buildHardwareAssignmentPayloadsFromHardwareShells,
} from "./deployment-hardware-assignment-payload";
import { DeploymentHardwareAssignmentService } from "./deployment-hardware-assignment-service";
import { InMemoryDeploymentHardwareAssignmentTestRepository } from "./deployment-hardware-assignment-test-repository";
import type {
  DeploymentHardwareAssignmentRecord,
  DeploymentHardwareAssignmentTargetType,
} from "./deployment-hardware-assignment-types";
import type { CreateDeploymentHardwareShellPayload } from "./deployment-hardware-types";

export interface DeploymentHardwareAssignmentServiceHarnessScenario {
  name: string;
  passed: boolean;
  message: string;
}

export interface DeploymentHardwareAssignmentServiceHarnessResult {
  passed: boolean;
  scenarios: readonly DeploymentHardwareAssignmentServiceHarnessScenario[];
}

const FIXED_TIMESTAMP = "2026-07-10T12:00:00.000Z";
const CLINIC_ID = "clinic-hardware-assignment-harness-0001";
const OTHER_CLINIC_ID = "clinic-hardware-assignment-harness-0002";

export async function runDeploymentHardwareAssignmentServiceHarness(): Promise<DeploymentHardwareAssignmentServiceHarnessResult> {
  const scenarios = [
    await scenarioCreatesAssignmentsFromDraft(),
    await scenarioRetryReusesAssignments(),
    await scenarioPartialExistingCreatesOnlyMissing(),
    await scenarioEmptyAssignmentDraftCreatesNone(),
    await scenarioSameClinicDuplicateAssignmentKeyConflicts(),
    await scenarioDifferentClinicsCanUseSameHardwareKey(),
    await scenarioDeterministicAssignmentPayloadGeneration(),
    await scenarioWorkstationTargetKeyCarriedLogically(),
    await scenarioSterilizerTargetKeyCarriedLogically(),
    await scenarioExplicitUnassignedState(),
    await scenarioConflictingTargetAssignment(),
    await scenarioGlobalLegacyAssignmentsAreIgnored(),
    await scenarioForbiddenDownstreamCountersRemainZero(),
  ];

  return {
    passed: scenarios.every((scenario) => scenario.passed),
    scenarios,
  };
}

async function scenarioCreatesAssignmentsFromDraft(): Promise<DeploymentHardwareAssignmentServiceHarnessScenario> {
  const harness = createHarness();
  const result = await harness.service.provisionHardwareAssignmentsForClinic({
    clinicId: CLINIC_ID,
    draft: createDraft(),
    createdAt: FIXED_TIMESTAMP,
  });

  return expectScenario(
    "fresh assignment plan creates missing planned assignments",
    result.ok &&
      result.counts.requested === 3 &&
      result.counts.created === 3 &&
      result.counts.reused === 0 &&
      harness.repository.assignments.every(
        (assignment) =>
          assignment.clinicId === CLINIC_ID &&
          assignment.assignmentSource === "setup_draft" &&
          assignment.assignmentStatus === "planned" &&
          assignment.active === false,
      ),
    `requested=${result.counts.requested}; created=${result.counts.created}`,
  );
}

async function scenarioRetryReusesAssignments(): Promise<DeploymentHardwareAssignmentServiceHarnessScenario> {
  const harness = createHarness();
  const command = {
    clinicId: CLINIC_ID,
    draft: createDraft(),
    createdAt: FIXED_TIMESTAMP,
  };
  const firstResult =
    await harness.service.provisionHardwareAssignmentsForClinic(command);
  const secondResult =
    await harness.service.provisionHardwareAssignmentsForClinic(command);

  return expectScenario(
    "retry reuses compatible existing assignments",
    firstResult.ok &&
      secondResult.ok &&
      secondResult.counts.created === 0 &&
      secondResult.counts.reused === 3 &&
      harness.repository.assignments.length === 3,
    `firstCreated=${firstResult.counts.created}; secondReused=${secondResult.counts.reused}`,
  );
}

async function scenarioPartialExistingCreatesOnlyMissing(): Promise<DeploymentHardwareAssignmentServiceHarnessScenario> {
  const harness = createHarness({
    assignments: [
      createAssignmentRecord({
        id: "assignment-existing-one",
        clinicId: CLINIC_ID,
        deploymentHardwareKey: "hardware-001",
        targetType: "workstation",
        targetDeploymentKey: "workstation-002",
      }),
    ],
  });
  const result = await harness.service.provisionHardwareAssignmentsForClinic({
    clinicId: CLINIC_ID,
    draft: createDraft(),
    createdAt: FIXED_TIMESTAMP,
  });

  return expectScenario(
    "partial existing creates only missing assignments",
    result.ok &&
      result.counts.requested === 3 &&
      result.counts.reused === 1 &&
      result.counts.created === 2 &&
      harness.repository.assignments.length === 3,
    `created=${result.counts.created}; reused=${result.counts.reused}; total=${harness.repository.assignments.length}`,
  );
}

async function scenarioEmptyAssignmentDraftCreatesNone(): Promise<DeploymentHardwareAssignmentServiceHarnessScenario> {
  const harness = createHarness();
  const result = await harness.service.provisionHardwareAssignmentsForClinic({
    clinicId: CLINIC_ID,
    draft: createDraft({ labelPrinters: 0, usbScanners: 0 }),
    createdAt: FIXED_TIMESTAMP,
  });

  return expectScenario(
    "empty assignment draft creates none",
    result.ok &&
      result.counts.requested === 0 &&
      result.counts.created === 0 &&
      harness.repository.assignments.length === 0,
    `requested=${result.counts.requested}; created=${result.counts.created}`,
  );
}

async function scenarioSameClinicDuplicateAssignmentKeyConflicts(): Promise<DeploymentHardwareAssignmentServiceHarnessScenario> {
  const harness = createHarness({
    assignments: [
      createAssignmentRecord({
        id: "assignment-duplicate-a",
        clinicId: CLINIC_ID,
        deploymentHardwareKey: "hardware-001",
        targetType: "workstation",
        targetDeploymentKey: "workstation-002",
      }),
      createAssignmentRecord({
        id: "assignment-duplicate-b",
        clinicId: CLINIC_ID,
        deploymentHardwareKey: "hardware-001",
        targetType: "workstation",
        targetDeploymentKey: "workstation-002",
      }),
    ],
  });
  const result = await harness.service.provisionHardwareAssignmentsForClinic({
    clinicId: CLINIC_ID,
    draft: createDraft({ labelPrinters: 1, usbScanners: 0 }),
    createdAt: FIXED_TIMESTAMP,
  });

  return expectScenario(
    "duplicate same-clinic hardware assignment keys conflict deterministically",
    !result.ok &&
      result.counts.conflicts === 1 &&
      result.counts.skipped === 1 &&
      harness.repository.calls.createHardwareAssignment === 0,
    `conflicts=${result.counts.conflicts}; skipped=${result.counts.skipped}; writes=${harness.repository.calls.createHardwareAssignment}`,
  );
}

async function scenarioDifferentClinicsCanUseSameHardwareKey(): Promise<DeploymentHardwareAssignmentServiceHarnessScenario> {
  const harness = createHarness({
    clinicIds: [CLINIC_ID, OTHER_CLINIC_ID],
    clinicIdsWithSettings: [CLINIC_ID, OTHER_CLINIC_ID],
    clinicIdsWithProviderShells: [CLINIC_ID, OTHER_CLINIC_ID],
    clinicIdsWithSterilizerShells: [CLINIC_ID, OTHER_CLINIC_ID],
    clinicIdsWithWorkstationShells: [CLINIC_ID, OTHER_CLINIC_ID],
    clinicIdsWithHardwareShells: [CLINIC_ID, OTHER_CLINIC_ID],
  });
  const draft = createDraft({ labelPrinters: 1, usbScanners: 0 });
  const firstClinicResult =
    await harness.service.provisionHardwareAssignmentsForClinic({
      clinicId: CLINIC_ID,
      draft,
      createdAt: FIXED_TIMESTAMP,
    });
  const otherClinicResult =
    await harness.service.provisionHardwareAssignmentsForClinic({
      clinicId: OTHER_CLINIC_ID,
      draft,
      createdAt: FIXED_TIMESTAMP,
    });
  const retryResult =
    await harness.service.provisionHardwareAssignmentsForClinic({
      clinicId: CLINIC_ID,
      draft,
      createdAt: FIXED_TIMESTAMP,
    });

  return expectScenario(
    "same hardware key may exist across different clinics",
    firstClinicResult.ok &&
      otherClinicResult.ok &&
      retryResult.ok &&
      firstClinicResult.counts.created === 1 &&
      otherClinicResult.counts.created === 1 &&
      retryResult.counts.reused === 1 &&
      harness.repository.assignments.filter(
        (assignment) => assignment.deploymentHardwareKey === "hardware-001",
      ).length === 2,
    `firstCreated=${firstClinicResult.counts.created}; otherCreated=${otherClinicResult.counts.created}; retryReused=${retryResult.counts.reused}`,
  );
}

async function scenarioDeterministicAssignmentPayloadGeneration(): Promise<DeploymentHardwareAssignmentServiceHarnessScenario> {
  const harness = createHarness();
  const payloads = harness.service.buildHardwareAssignmentPayloadsFromDraft({
    clinicId: CLINIC_ID,
    draft: createDraft(),
    createdAt: FIXED_TIMESTAMP,
  });

  return expectScenario(
    "deterministic assignment payload generation",
    payloads.length === 3 &&
      payloads.map((payload) => payload.deploymentHardwareAssignmentKey).join(",") ===
        "hardware-assignment-hardware-001,hardware-assignment-hardware-002,hardware-assignment-hardware-003" &&
      payloads.map((payload) => payload.deploymentHardwareKey).join(",") ===
        "hardware-001,hardware-002,hardware-003" &&
      payloads.every(
        (payload, index) =>
          payload.displayOrder === index + 1 &&
          payload.assignmentStatus === "planned" &&
          payload.assignmentSource === "setup_draft" &&
          payload.active === false,
      ),
    `keys=${payloads.map((payload) => payload.deploymentHardwareAssignmentKey).join(",")}`,
  );
}

async function scenarioWorkstationTargetKeyCarriedLogically(): Promise<DeploymentHardwareAssignmentServiceHarnessScenario> {
  const harness = createHarness();
  const payloads = harness.service.buildHardwareAssignmentPayloadsFromDraft({
    clinicId: CLINIC_ID,
    draft: createDraft(),
    createdAt: FIXED_TIMESTAMP,
  });

  return expectScenario(
    "workstation target key is carried logically",
    payloads[0]?.targetType === "workstation" &&
      payloads[0]?.targetDeploymentKey === "workstation-002" &&
      harness.repository.downstreamWriteCount === 0,
    `target=${payloads[0]?.targetType}:${payloads[0]?.targetDeploymentKey}`,
  );
}

async function scenarioSterilizerTargetKeyCarriedLogically(): Promise<DeploymentHardwareAssignmentServiceHarnessScenario> {
  const payloads = buildHardwareAssignmentPayloadsFromHardwareShells(
    [
      createHardwareShellPayload({
        deploymentHardwareKey: "hardware-001",
        assignedWorkstationKey: null,
        assignedSterilizerKey: "sterilizer-001",
      }),
    ],
    { clinicId: CLINIC_ID, timestamp: FIXED_TIMESTAMP },
  );

  return expectScenario(
    "sterilizer target key is carried logically",
    payloads[0]?.targetType === "sterilizer" &&
      payloads[0]?.targetDeploymentKey === "sterilizer-001",
    `target=${payloads[0]?.targetType}:${payloads[0]?.targetDeploymentKey}`,
  );
}

async function scenarioExplicitUnassignedState(): Promise<DeploymentHardwareAssignmentServiceHarnessScenario> {
  const payloads = buildHardwareAssignmentPayloadsFromHardwareShells(
    [
      createHardwareShellPayload({
        deploymentHardwareKey: "hardware-001",
        assignedWorkstationKey: null,
        assignedSterilizerKey: null,
      }),
    ],
    { clinicId: CLINIC_ID, timestamp: FIXED_TIMESTAMP },
  );

  return expectScenario(
    "unassigned hardware remains an explicit planned state",
    payloads[0]?.targetType === "unassigned" &&
      payloads[0]?.targetDeploymentKey === null &&
      payloads[0]?.assignmentStatus === "planned" &&
      payloads[0]?.active === false,
    `target=${payloads[0]?.targetType}:${payloads[0]?.targetDeploymentKey ?? "none"}`,
  );
}

async function scenarioConflictingTargetAssignment(): Promise<DeploymentHardwareAssignmentServiceHarnessScenario> {
  const harness = createHarness({
    assignments: [
      createAssignmentRecord({
        id: "assignment-conflicting-target",
        clinicId: CLINIC_ID,
        deploymentHardwareKey: "hardware-001",
        targetType: "workstation",
        targetDeploymentKey: "workstation-999",
      }),
    ],
  });
  const result = await harness.service.provisionHardwareAssignmentsForClinic({
    clinicId: CLINIC_ID,
    draft: createDraft({ labelPrinters: 1, usbScanners: 0 }),
    createdAt: FIXED_TIMESTAMP,
  });

  return expectScenario(
    "conflicting target assignment is reported without mutation",
    !result.ok &&
      result.counts.conflicts === 1 &&
      result.counts.skipped === 1 &&
      result.counts.created === 0 &&
      harness.repository.assignments[0]?.targetDeploymentKey ===
        "workstation-999",
    `conflicts=${result.counts.conflicts}; target=${harness.repository.assignments[0]?.targetDeploymentKey}`,
  );
}

async function scenarioGlobalLegacyAssignmentsAreIgnored(): Promise<DeploymentHardwareAssignmentServiceHarnessScenario> {
  const harness = createHarness({
    assignments: [
      createAssignmentRecord({
        id: "assignment-global-legacy",
        clinicId: null,
        deploymentHardwareKey: "hardware-001",
        targetType: "workstation",
        targetDeploymentKey: "workstation-legacy",
        assignmentStatus: "active",
        active: true,
      }),
    ],
  });
  const result = await harness.service.provisionHardwareAssignmentsForClinic({
    clinicId: CLINIC_ID,
    draft: createDraft({ labelPrinters: 1, usbScanners: 0 }),
    createdAt: FIXED_TIMESTAMP,
  });

  return expectScenario(
    "legacy global assignments are ignored",
    result.ok &&
      result.counts.created === 1 &&
      harness.repository.assignments.length === 2,
    `created=${result.counts.created}; total=${harness.repository.assignments.length}`,
  );
}

async function scenarioForbiddenDownstreamCountersRemainZero(): Promise<DeploymentHardwareAssignmentServiceHarnessScenario> {
  const harness = createHarness();
  await harness.service.provisionHardwareAssignmentsForClinic({
    clinicId: CLINIC_ID,
    draft: createDraft(),
    createdAt: FIXED_TIMESTAMP,
  });

  return expectScenario(
    "downstream counters remain zero",
    harness.repository.downstreamWriteCount === 0,
    `downstreamWrites=${harness.repository.downstreamWriteCount}`,
  );
}

function createHarness(input: {
  clinicIds?: readonly string[];
  clinicIdsWithSettings?: readonly string[];
  clinicIdsWithProviderShells?: readonly string[];
  clinicIdsWithSterilizerShells?: readonly string[];
  clinicIdsWithWorkstationShells?: readonly string[];
  clinicIdsWithHardwareShells?: readonly string[];
  assignments?: readonly DeploymentHardwareAssignmentRecord[];
} = {}): {
  repository: InMemoryDeploymentHardwareAssignmentTestRepository;
  service: DeploymentHardwareAssignmentService;
} {
  const repository = new InMemoryDeploymentHardwareAssignmentTestRepository({
    clinicIds: input.clinicIds ?? [CLINIC_ID],
    clinicIdsWithSettings: input.clinicIdsWithSettings ?? [CLINIC_ID],
    clinicIdsWithProviderShells:
      input.clinicIdsWithProviderShells ?? [CLINIC_ID],
    clinicIdsWithSterilizerShells:
      input.clinicIdsWithSterilizerShells ?? [CLINIC_ID],
    clinicIdsWithWorkstationShells:
      input.clinicIdsWithWorkstationShells ?? [CLINIC_ID],
    clinicIdsWithHardwareShells:
      input.clinicIdsWithHardwareShells ?? [CLINIC_ID],
    assignments: input.assignments ?? [],
  });

  return {
    repository,
    service: new DeploymentHardwareAssignmentService(repository),
  };
}

function createDraft(
  hardwarePlan: DeploymentDraft["hardwarePlan"] = {
    labelPrinters: 1,
    usbScanners: 2,
  },
): DeploymentDraft {
  return {
    draftVersion: CURRENT_DEPLOYMENT_DRAFT_VERSION,
    createdAt: FIXED_TIMESTAMP,
    clinicProfile: {
      name: "Hardware Assignment Harness Dental",
      legalName: "Hardware Assignment Harness Dental PC",
      clinicCode: "HARDWARE-ASSIGNMENT-HARNESS",
      country: "Canada",
      provinceState: "Ontario",
      timezone: "America/Toronto",
      primaryLanguage: "English",
      phone: "",
      email: "",
      website: "",
      addressStreet: "",
      addressCity: "",
      addressPostalCode: "",
    },
    workstations: [
      createDraftWorkstation("op-1", "Operatory 1", ["usb_scanner"]),
      createDraftWorkstation("steri-1", "Sterilization Bay", ["printer"]),
      createDraftWorkstation("front-1", "Front Desk", [
        "printer",
        "usb_scanner",
      ]),
    ],
    providerPlan: {
      clinicType: "general_dentistry",
      dentists: 1,
      hygienists: 1,
      assistants: 1,
      receptionists: 1,
      treatmentCoordinators: 0,
      sterilizationTechnicians: 1,
      officeManagers: 1,
    },
    sterilizers: [],
    policies: {
      packExpiration: "180 days",
    },
    hardwarePlan,
    reviewMetadata: {
      readinessScore: 100,
      requiredSections: ["clinic", "hardware"],
      completedSections: ["clinic", "hardware"],
      warnings: [],
    },
  };
}

function createDraftWorkstation(
  draftId: string,
  name: string,
  capabilities: DeploymentDraft["workstations"][number]["capabilities"],
): DeploymentDraft["workstations"][number] {
  return {
    draftId,
    name,
    workstationType: draftId === "front-1" ? "reception" : "operatory",
    roomNumber: "",
    locationLabel: name,
    capabilities,
  };
}

function createHardwareShellPayload(input: {
  deploymentHardwareKey: string;
  assignedWorkstationKey: string | null;
  assignedSterilizerKey: string | null;
}): CreateDeploymentHardwareShellPayload {
  return {
    clinicId: CLINIC_ID,
    deploymentHardwareKey: input.deploymentHardwareKey,
    name: `${input.deploymentHardwareKey} Shell`,
    hardwareType: "label_printer",
    quantity: 1,
    displayOrder: 1,
    status: "planned",
    capabilities: ["label_printing"],
    assignedWorkstationKey: input.assignedWorkstationKey,
    assignedSterilizerKey: input.assignedSterilizerKey,
    active: false,
    provisioningSource: "setup_draft",
    provisioningStatus: "planned",
    createdAt: FIXED_TIMESTAMP,
    updatedAt: FIXED_TIMESTAMP,
  };
}

function createAssignmentRecord(input: {
  id: string;
  clinicId: string | null;
  deploymentHardwareKey: string | null;
  targetType: DeploymentHardwareAssignmentTargetType;
  targetDeploymentKey: string | null;
  assignmentStatus?: DeploymentHardwareAssignmentRecord["assignmentStatus"];
  active?: boolean;
}): DeploymentHardwareAssignmentRecord {
  const assignmentKey = input.deploymentHardwareKey
    ? `hardware-assignment-${input.deploymentHardwareKey}`
    : null;

  return {
    id: input.id,
    clinicId: input.clinicId,
    deploymentHardwareAssignmentKey: assignmentKey,
    deploymentHardwareKey: input.deploymentHardwareKey,
    targetType: input.targetType,
    targetDeploymentKey: input.targetDeploymentKey,
    assignmentStatus: input.assignmentStatus ?? "planned",
    assignmentSource: input.deploymentHardwareKey ? "setup_draft" : null,
    active: input.active ?? false,
    displayOrder: 1,
    reason: null,
    metadata: null,
    createdAt: FIXED_TIMESTAMP,
    updatedAt: FIXED_TIMESTAMP,
  };
}

function expectScenario(
  name: string,
  passed: boolean,
  message: string,
): DeploymentHardwareAssignmentServiceHarnessScenario {
  return {
    name,
    passed,
    message,
  };
}