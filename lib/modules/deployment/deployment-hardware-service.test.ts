import {
  CURRENT_DEPLOYMENT_DRAFT_VERSION,
  type DeploymentDraft,
} from "./deployment-draft";
import { DeploymentHardwareService } from "./deployment-hardware-service";
import { InMemoryDeploymentHardwareTestRepository } from "./deployment-hardware-test-repository";
import type { DeploymentHardwareShellRecord } from "./deployment-hardware-types";

export interface DeploymentHardwareServiceHarnessScenario {
  name: string;
  passed: boolean;
  message: string;
}

export interface DeploymentHardwareServiceHarnessResult {
  passed: boolean;
  scenarios: readonly DeploymentHardwareServiceHarnessScenario[];
}

const FIXED_TIMESTAMP = "2026-07-09T12:00:00.000Z";
const CLINIC_ID = "clinic-hardware-harness-0001";
const OTHER_CLINIC_ID = "clinic-hardware-harness-0002";

export async function runDeploymentHardwareServiceHarness(): Promise<DeploymentHardwareServiceHarnessResult> {
  const scenarios = [
    await scenarioCreatesHardwareShellsFromDraft(),
    await scenarioRetryReusesAllShells(),
    await scenarioPartialExistingCreatesOnlyMissing(),
    await scenarioEmptyDraftCreatesNone(),
    await scenarioSameKeyCannotDuplicateWithinClinic(),
    await scenarioDifferentClinicsCanUseSameDeploymentHardwareKey(),
    await scenarioDeterministicPayloadGeneration(),
    await scenarioGlobalLegacyHardwareIsIgnored(),
    await scenarioAssignmentKeysCarriedLogicallyButNotResolved(),
    await scenarioForbiddenDownstreamCountersRemainZero(),
  ];

  return {
    passed: scenarios.every((scenario) => scenario.passed),
    scenarios,
  };
}

async function scenarioCreatesHardwareShellsFromDraft(): Promise<DeploymentHardwareServiceHarnessScenario> {
  const harness = createHarness();
  const result = await harness.service.provisionHardwareShellsForClinic({
    clinicId: CLINIC_ID,
    draft: createDraft(),
    createdAt: FIXED_TIMESTAMP,
  });

  return expectScenario(
    "creates hardware shells from draft",
    result.ok &&
      result.counts.requested === 3 &&
      result.counts.created === 3 &&
      result.counts.reused === 0 &&
      harness.repository.hardware.every(
        (hardware) =>
          hardware.provisioningSource === "setup_draft" &&
          hardware.provisioningStatus === "planned" &&
          hardware.status === "planned" &&
          hardware.active === false &&
          hardware.clinicId === CLINIC_ID &&
          hardware.quantity === 1,
      ),
    `requested=${result.counts.requested}; created=${result.counts.created}`,
  );
}

async function scenarioRetryReusesAllShells(): Promise<DeploymentHardwareServiceHarnessScenario> {
  const harness = createHarness();
  const command = {
    clinicId: CLINIC_ID,
    draft: createDraft(),
    createdAt: FIXED_TIMESTAMP,
  };
  const firstResult =
    await harness.service.provisionHardwareShellsForClinic(command);
  const secondResult =
    await harness.service.provisionHardwareShellsForClinic(command);

  return expectScenario(
    "retry reuses all shells",
    firstResult.ok &&
      secondResult.ok &&
      secondResult.counts.created === 0 &&
      secondResult.counts.reused === 3 &&
      harness.repository.hardware.length === 3,
    `firstCreated=${firstResult.counts.created}; secondReused=${secondResult.counts.reused}`,
  );
}

async function scenarioPartialExistingCreatesOnlyMissing(): Promise<DeploymentHardwareServiceHarnessScenario> {
  const harness = createHarness({
    hardware: [
      createHardwareShellRecord({
        id: "hardware-existing-one",
        clinicId: CLINIC_ID,
        deploymentHardwareKey: "hardware-001",
      }),
    ],
  });
  const result = await harness.service.provisionHardwareShellsForClinic({
    clinicId: CLINIC_ID,
    draft: createDraft(),
    createdAt: FIXED_TIMESTAMP,
  });

  return expectScenario(
    "partial existing shells create only missing",
    result.ok &&
      result.counts.requested === 3 &&
      result.counts.reused === 1 &&
      result.counts.created === 2 &&
      harness.repository.hardware.length === 3,
    `created=${result.counts.created}; reused=${result.counts.reused}; total=${harness.repository.hardware.length}`,
  );
}

async function scenarioEmptyDraftCreatesNone(): Promise<DeploymentHardwareServiceHarnessScenario> {
  const harness = createHarness();
  const result = await harness.service.provisionHardwareShellsForClinic({
    clinicId: CLINIC_ID,
    draft: createDraft({ labelPrinters: 0, usbScanners: 0 }),
    createdAt: FIXED_TIMESTAMP,
  });

  return expectScenario(
    "empty draft creates none",
    result.ok &&
      result.counts.requested === 0 &&
      result.counts.created === 0 &&
      harness.repository.hardware.length === 0,
    `requested=${result.counts.requested}; created=${result.counts.created}`,
  );
}

async function scenarioSameKeyCannotDuplicateWithinClinic(): Promise<DeploymentHardwareServiceHarnessScenario> {
  const harness = createHarness({
    hardware: [
      createHardwareShellRecord({
        id: "hardware-duplicate-a",
        clinicId: CLINIC_ID,
        deploymentHardwareKey: "hardware-001",
      }),
      createHardwareShellRecord({
        id: "hardware-duplicate-b",
        clinicId: CLINIC_ID,
        deploymentHardwareKey: "hardware-001",
      }),
    ],
  });
  const result = await harness.service.provisionHardwareShellsForClinic({
    clinicId: CLINIC_ID,
    draft: createDraft({ labelPrinters: 1, usbScanners: 0 }),
    createdAt: FIXED_TIMESTAMP,
  });

  return expectScenario(
    "same key cannot duplicate within clinic",
    !result.ok &&
      result.counts.conflicts === 1 &&
      result.counts.skipped === 1 &&
      harness.repository.calls.createHardwareShell === 0,
    `conflicts=${result.counts.conflicts}; skipped=${result.counts.skipped}; writes=${harness.repository.calls.createHardwareShell}`,
  );
}

async function scenarioDifferentClinicsCanUseSameDeploymentHardwareKey(): Promise<DeploymentHardwareServiceHarnessScenario> {
  const harness = createHarness({
    clinicIds: [CLINIC_ID, OTHER_CLINIC_ID],
    clinicIdsWithSettings: [CLINIC_ID, OTHER_CLINIC_ID],
    clinicIdsWithProviderShells: [CLINIC_ID, OTHER_CLINIC_ID],
    clinicIdsWithSterilizerShells: [CLINIC_ID, OTHER_CLINIC_ID],
    clinicIdsWithWorkstationShells: [CLINIC_ID, OTHER_CLINIC_ID],
  });
  const draft = createDraft({ labelPrinters: 1, usbScanners: 0 });
  const firstClinicResult =
    await harness.service.provisionHardwareShellsForClinic({
      clinicId: CLINIC_ID,
      draft,
      createdAt: FIXED_TIMESTAMP,
    });
  const otherClinicResult =
    await harness.service.provisionHardwareShellsForClinic({
      clinicId: OTHER_CLINIC_ID,
      draft,
      createdAt: FIXED_TIMESTAMP,
    });
  const retryResult =
    await harness.service.provisionHardwareShellsForClinic({
      clinicId: CLINIC_ID,
      draft,
      createdAt: FIXED_TIMESTAMP,
    });

  return expectScenario(
    "different clinics can use same deployment_hardware_key",
    firstClinicResult.ok &&
      otherClinicResult.ok &&
      retryResult.ok &&
      firstClinicResult.counts.created === 1 &&
      otherClinicResult.counts.created === 1 &&
      retryResult.counts.created === 0 &&
      retryResult.counts.reused === 1 &&
      harness.repository.hardware.filter(
        (hardware) => hardware.deploymentHardwareKey === "hardware-001",
      ).length === 2,
    `firstCreated=${firstClinicResult.counts.created}; otherCreated=${otherClinicResult.counts.created}; retryReused=${retryResult.counts.reused}`,
  );
}

async function scenarioDeterministicPayloadGeneration(): Promise<DeploymentHardwareServiceHarnessScenario> {
  const harness = createHarness();
  const payloads = harness.service.buildHardwareShellPayloadsFromDraft({
    clinicId: CLINIC_ID,
    draft: createDraft(),
    createdAt: FIXED_TIMESTAMP,
  });

  return expectScenario(
    "deterministic payload generation for hardware-001..003",
    payloads.length === 3 &&
      payloads.map((payload) => payload.deploymentHardwareKey).join(",") ===
        "hardware-001,hardware-002,hardware-003" &&
      payloads[0]?.hardwareType === "label_printer" &&
      payloads[1]?.hardwareType === "usb_scanner" &&
      payloads[2]?.hardwareType === "usb_scanner" &&
      payloads[0]?.quantity === 1 &&
      payloads[0]?.displayOrder === 1 &&
      payloads[1]?.displayOrder === 2 &&
      payloads[2]?.displayOrder === 3 &&
      payloads[0]?.active === false &&
      payloads[0]?.provisioningSource === "setup_draft" &&
      payloads[0]?.provisioningStatus === "planned",
    `keys=${payloads.map((payload) => payload.deploymentHardwareKey).join(",")}`,
  );
}

async function scenarioGlobalLegacyHardwareIsIgnored(): Promise<DeploymentHardwareServiceHarnessScenario> {
  const harness = createHarness({
    hardware: [
      createHardwareShellRecord({
        id: "hardware-global-legacy",
        clinicId: null,
        deploymentHardwareKey: "hardware-001",
        provisioningStatus: "active",
        active: true,
      }),
    ],
  });
  const result = await harness.service.provisionHardwareShellsForClinic({
    clinicId: CLINIC_ID,
    draft: createDraft({ labelPrinters: 1, usbScanners: 0 }),
    createdAt: FIXED_TIMESTAMP,
  });

  return expectScenario(
    "legacy global hardware with clinic_id null is ignored",
    result.ok &&
      result.counts.created === 1 &&
      harness.repository.hardware.length === 2,
    `created=${result.counts.created}; total=${harness.repository.hardware.length}`,
  );
}

async function scenarioAssignmentKeysCarriedLogicallyButNotResolved(): Promise<DeploymentHardwareServiceHarnessScenario> {
  const harness = createHarness();
  const payloads = harness.service.buildHardwareShellPayloadsFromDraft({
    clinicId: CLINIC_ID,
    draft: createDraft(),
    createdAt: FIXED_TIMESTAMP,
  });

  return expectScenario(
    "assignment keys are carried logically but not resolved",
    payloads.length === 3 &&
      payloads[0]?.assignedWorkstationKey === "workstation-002" &&
      payloads[0]?.assignedSterilizerKey === null &&
      payloads[1]?.assignedWorkstationKey === "workstation-001" &&
      payloads[1]?.assignedSterilizerKey === null &&
      payloads[2]?.assignedWorkstationKey === "workstation-003" &&
      payloads[2]?.assignedSterilizerKey === null &&
      harness.repository.downstreamWriteCount === 0,
    `assignments=${payloads
      .map((payload) => payload.assignedWorkstationKey ?? "none")
      .join(",")}`,
  );
}

async function scenarioForbiddenDownstreamCountersRemainZero(): Promise<DeploymentHardwareServiceHarnessScenario> {
  const harness = createHarness();
  await harness.service.provisionHardwareShellsForClinic({
    clinicId: CLINIC_ID,
    draft: createDraft(),
    createdAt: FIXED_TIMESTAMP,
  });

  return expectScenario(
    "forbidden downstream counters remain zero",
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
  hardware?: readonly DeploymentHardwareShellRecord[];
} = {}): {
  repository: InMemoryDeploymentHardwareTestRepository;
  service: DeploymentHardwareService;
} {
  const repository = new InMemoryDeploymentHardwareTestRepository({
    clinicIds: input.clinicIds ?? [CLINIC_ID],
    clinicIdsWithSettings: input.clinicIdsWithSettings ?? [CLINIC_ID],
    clinicIdsWithProviderShells:
      input.clinicIdsWithProviderShells ?? [CLINIC_ID],
    clinicIdsWithSterilizerShells:
      input.clinicIdsWithSterilizerShells ?? [CLINIC_ID],
    clinicIdsWithWorkstationShells:
      input.clinicIdsWithWorkstationShells ?? [CLINIC_ID],
    hardware: input.hardware ?? [],
  });

  return {
    repository,
    service: new DeploymentHardwareService(repository),
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
      name: "Hardware Harness Dental",
      legalName: "Hardware Harness Dental Professional Corporation",
      clinicCode: "HARDWARE-HARNESS",
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

function createHardwareShellRecord(input: {
  id: string;
  clinicId: string | null;
  deploymentHardwareKey: string | null;
  provisioningStatus?: DeploymentHardwareShellRecord["provisioningStatus"];
  active?: boolean;
}): DeploymentHardwareShellRecord {
  const label = input.deploymentHardwareKey ?? "legacy-hardware";

  return {
    id: input.id,
    clinicId: input.clinicId,
    deploymentHardwareKey: input.deploymentHardwareKey,
    name: `${label} Shell`,
    hardwareType: "label_printer",
    quantity: 1,
    displayOrder: 1,
    status: input.provisioningStatus === "active" ? "active" : "planned",
    capabilities: ["label_printing"],
    assignedWorkstationKey: "workstation-001",
    assignedSterilizerKey: null,
    active: input.active ?? false,
    provisioningSource: input.deploymentHardwareKey ? "setup_draft" : null,
    provisioningStatus: input.provisioningStatus ?? "planned",
    createdAt: FIXED_TIMESTAMP,
    updatedAt: FIXED_TIMESTAMP,
  };
}

function expectScenario(
  name: string,
  passed: boolean,
  message: string,
): DeploymentHardwareServiceHarnessScenario {
  return {
    name,
    passed,
    message,
  };
}