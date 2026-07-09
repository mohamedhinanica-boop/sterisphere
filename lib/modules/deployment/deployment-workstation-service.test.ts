import {
  CURRENT_DEPLOYMENT_DRAFT_VERSION,
  type DeploymentDraft,
} from "./deployment-draft";
import { DeploymentWorkstationService } from "./deployment-workstation-service";
import { InMemoryDeploymentWorkstationTestRepository } from "./deployment-workstation-test-repository";
import type { DeploymentWorkstationShellRecord } from "./deployment-workstation-types";

export interface DeploymentWorkstationServiceHarnessScenario {
  name: string;
  passed: boolean;
  message: string;
}

export interface DeploymentWorkstationServiceHarnessResult {
  passed: boolean;
  scenarios: readonly DeploymentWorkstationServiceHarnessScenario[];
}

const FIXED_TIMESTAMP = "2026-07-09T12:00:00.000Z";
const CLINIC_ID = "clinic-workstation-harness-0001";
const OTHER_CLINIC_ID = "clinic-workstation-harness-0002";

export async function runDeploymentWorkstationServiceHarness(): Promise<DeploymentWorkstationServiceHarnessResult> {
  const scenarios = [
    await scenarioCreatesWorkstationShellsFromDraft(),
    await scenarioRetryReusesAllShells(),
    await scenarioPartialExistingCreatesOnlyMissing(),
    await scenarioEmptyDraftCreatesNone(),
    await scenarioSameKeyCannotDuplicateWithinClinic(),
    await scenarioDifferentClinicsCanUseSameDeploymentWorkstationKey(),
    await scenarioDeterministicPayloadGeneration(),
    await scenarioGlobalLegacyWorkstationsAreIgnored(),
    await scenarioForbiddenDownstreamCountersRemainZero(),
  ];

  return {
    passed: scenarios.every((scenario) => scenario.passed),
    scenarios,
  };
}

async function scenarioCreatesWorkstationShellsFromDraft(): Promise<DeploymentWorkstationServiceHarnessScenario> {
  const harness = createHarness();
  const result = await harness.service.provisionWorkstationShellsForClinic({
    clinicId: CLINIC_ID,
    draft: createDraft(),
    createdAt: FIXED_TIMESTAMP,
  });

  return expectScenario(
    "creates workstation shells from draft",
    result.ok &&
      result.counts.requested === 3 &&
      result.counts.created === 3 &&
      result.counts.reused === 0 &&
      harness.repository.workstations.every(
        (workstation) =>
          workstation.provisioningSource === "setup_draft" &&
          workstation.provisioningStatus === "planned" &&
          workstation.status === "planned" &&
          workstation.active === false &&
          workstation.clinicId === CLINIC_ID &&
          workstation.agentUrl === null,
      ),
    `requested=${result.counts.requested}; created=${result.counts.created}`,
  );
}

async function scenarioRetryReusesAllShells(): Promise<DeploymentWorkstationServiceHarnessScenario> {
  const harness = createHarness();
  const command = {
    clinicId: CLINIC_ID,
    draft: createDraft(),
    createdAt: FIXED_TIMESTAMP,
  };
  const firstResult =
    await harness.service.provisionWorkstationShellsForClinic(command);
  const secondResult =
    await harness.service.provisionWorkstationShellsForClinic(command);

  return expectScenario(
    "retry reuses all shells",
    firstResult.ok &&
      secondResult.ok &&
      secondResult.counts.created === 0 &&
      secondResult.counts.reused === 3 &&
      harness.repository.workstations.length === 3,
    `firstCreated=${firstResult.counts.created}; secondReused=${secondResult.counts.reused}`,
  );
}

async function scenarioPartialExistingCreatesOnlyMissing(): Promise<DeploymentWorkstationServiceHarnessScenario> {
  const harness = createHarness({
    workstations: [
      createWorkstationShellRecord({
        id: "workstation-existing-one",
        clinicId: CLINIC_ID,
        deploymentWorkstationKey: "workstation-001",
      }),
    ],
  });
  const result = await harness.service.provisionWorkstationShellsForClinic({
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
      harness.repository.workstations.length === 3,
    `created=${result.counts.created}; reused=${result.counts.reused}; total=${harness.repository.workstations.length}`,
  );
}

async function scenarioEmptyDraftCreatesNone(): Promise<DeploymentWorkstationServiceHarnessScenario> {
  const harness = createHarness();
  const result = await harness.service.provisionWorkstationShellsForClinic({
    clinicId: CLINIC_ID,
    draft: createDraft([]),
    createdAt: FIXED_TIMESTAMP,
  });

  return expectScenario(
    "empty draft creates none",
    result.ok &&
      result.counts.requested === 0 &&
      result.counts.created === 0 &&
      harness.repository.workstations.length === 0,
    `requested=${result.counts.requested}; created=${result.counts.created}`,
  );
}

async function scenarioSameKeyCannotDuplicateWithinClinic(): Promise<DeploymentWorkstationServiceHarnessScenario> {
  const harness = createHarness({
    workstations: [
      createWorkstationShellRecord({
        id: "workstation-duplicate-a",
        clinicId: CLINIC_ID,
        deploymentWorkstationKey: "workstation-001",
      }),
      createWorkstationShellRecord({
        id: "workstation-duplicate-b",
        clinicId: CLINIC_ID,
        deploymentWorkstationKey: "workstation-001",
      }),
    ],
  });
  const result = await harness.service.provisionWorkstationShellsForClinic({
    clinicId: CLINIC_ID,
    draft: createDraft([
      createDraftWorkstation("op-1", "Operatory 1", "operatory", "Room 1", [
        "usb_scanner",
      ]),
    ]),
    createdAt: FIXED_TIMESTAMP,
  });

  return expectScenario(
    "same key cannot duplicate within clinic",
    !result.ok &&
      result.counts.conflicts === 1 &&
      result.counts.skipped === 1 &&
      harness.repository.calls.createWorkstationShell === 0,
    `conflicts=${result.counts.conflicts}; skipped=${result.counts.skipped}; writes=${harness.repository.calls.createWorkstationShell}`,
  );
}

async function scenarioDifferentClinicsCanUseSameDeploymentWorkstationKey(): Promise<DeploymentWorkstationServiceHarnessScenario> {
  const harness = createHarness({
    clinicIds: [CLINIC_ID, OTHER_CLINIC_ID],
    clinicIdsWithSettings: [CLINIC_ID, OTHER_CLINIC_ID],
    clinicIdsWithProviderShells: [CLINIC_ID, OTHER_CLINIC_ID],
    clinicIdsWithSterilizerShells: [CLINIC_ID, OTHER_CLINIC_ID],
  });
  const draft = createDraft([
    createDraftWorkstation("op-1", "Operatory 1", "operatory", "Room 1", [
      "usb_scanner",
    ]),
  ]);
  const firstClinicResult =
    await harness.service.provisionWorkstationShellsForClinic({
      clinicId: CLINIC_ID,
      draft,
      createdAt: FIXED_TIMESTAMP,
    });
  const otherClinicResult =
    await harness.service.provisionWorkstationShellsForClinic({
      clinicId: OTHER_CLINIC_ID,
      draft,
      createdAt: FIXED_TIMESTAMP,
    });
  const retryResult =
    await harness.service.provisionWorkstationShellsForClinic({
      clinicId: CLINIC_ID,
      draft,
      createdAt: FIXED_TIMESTAMP,
    });

  return expectScenario(
    "different clinics can use same deployment_workstation_key",
    firstClinicResult.ok &&
      otherClinicResult.ok &&
      retryResult.ok &&
      firstClinicResult.counts.created === 1 &&
      otherClinicResult.counts.created === 1 &&
      retryResult.counts.created === 0 &&
      retryResult.counts.reused === 1 &&
      harness.repository.workstations.filter(
        (workstation) =>
          workstation.deploymentWorkstationKey === "workstation-001",
      ).length === 2,
    `firstCreated=${firstClinicResult.counts.created}; otherCreated=${otherClinicResult.counts.created}; retryReused=${retryResult.counts.reused}`,
  );
}

async function scenarioDeterministicPayloadGeneration(): Promise<DeploymentWorkstationServiceHarnessScenario> {
  const harness = createHarness();
  const payloads = harness.service.buildWorkstationShellPayloadsFromDraft({
    clinicId: CLINIC_ID,
    draft: createDraft(),
    createdAt: FIXED_TIMESTAMP,
  });

  return expectScenario(
    "deterministic payload generation",
    payloads.length === 3 &&
      payloads.map((payload) => payload.deploymentWorkstationKey).join(",") ===
        "workstation-001,workstation-002,workstation-003" &&
      payloads[0]?.displayOrder === 1 &&
      payloads[1]?.displayOrder === 2 &&
      payloads[2]?.displayOrder === 3 &&
      payloads[0]?.status === "planned" &&
      payloads[0]?.active === false &&
      payloads[0]?.provisioningSource === "setup_draft" &&
      payloads[0]?.provisioningStatus === "planned" &&
      payloads[0]?.agentUrl === null &&
      payloads[0]?.capabilities.usb_scanner === true,
    `keys=${payloads.map((payload) => payload.deploymentWorkstationKey).join(",")}`,
  );
}

async function scenarioGlobalLegacyWorkstationsAreIgnored(): Promise<DeploymentWorkstationServiceHarnessScenario> {
  const harness = createHarness({
    workstations: [
      createWorkstationShellRecord({
        id: "workstation-global-legacy",
        clinicId: null,
        deploymentWorkstationKey: "workstation-001",
        provisioningStatus: "active",
        active: true,
      }),
    ],
  });
  const result = await harness.service.provisionWorkstationShellsForClinic({
    clinicId: CLINIC_ID,
    draft: createDraft([
      createDraftWorkstation("op-1", "Operatory 1", "operatory", "Room 1", [
        "usb_scanner",
      ]),
    ]),
    createdAt: FIXED_TIMESTAMP,
  });

  return expectScenario(
    "legacy global workstations with clinic_id null are ignored",
    result.ok &&
      result.counts.created === 1 &&
      harness.repository.workstations.length === 2,
    `created=${result.counts.created}; total=${harness.repository.workstations.length}`,
  );
}

async function scenarioForbiddenDownstreamCountersRemainZero(): Promise<DeploymentWorkstationServiceHarnessScenario> {
  const harness = createHarness();
  await harness.service.provisionWorkstationShellsForClinic({
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
  workstations?: readonly DeploymentWorkstationShellRecord[];
} = {}): {
  repository: InMemoryDeploymentWorkstationTestRepository;
  service: DeploymentWorkstationService;
} {
  const repository = new InMemoryDeploymentWorkstationTestRepository({
    clinicIds: input.clinicIds ?? [CLINIC_ID],
    clinicIdsWithSettings: input.clinicIdsWithSettings ?? [CLINIC_ID],
    clinicIdsWithProviderShells:
      input.clinicIdsWithProviderShells ?? [CLINIC_ID],
    clinicIdsWithSterilizerShells:
      input.clinicIdsWithSterilizerShells ?? [CLINIC_ID],
    workstations: input.workstations ?? [],
  });

  return {
    repository,
    service: new DeploymentWorkstationService(repository),
  };
}

function createDraft(
  workstations: DeploymentDraft["workstations"] = [
    createDraftWorkstation("op-1", "Operatory 1", "operatory", "Room 1", [
      "usb_scanner",
    ]),
    createDraftWorkstation(
      "steri-1",
      "Sterilization Bay",
      "sterilization",
      "Sterilization",
      ["printer", "sterilizer"],
    ),
    createDraftWorkstation("front-1", "Front Desk", "reception", "Reception", [
      "printer",
    ]),
  ],
): DeploymentDraft {
  return {
    draftVersion: CURRENT_DEPLOYMENT_DRAFT_VERSION,
    createdAt: FIXED_TIMESTAMP,
    clinicProfile: {
      name: "Workstation Harness Dental",
      legalName: "Workstation Harness Dental Professional Corporation",
      clinicCode: "WORKSTATION-HARNESS",
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
    workstations,
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
    hardwarePlan: {
      labelPrinters: 0,
      usbScanners: 0,
    },
    reviewMetadata: {
      readinessScore: 100,
      requiredSections: ["clinic", "workstations"],
      completedSections: ["clinic", "workstations"],
      warnings: [],
    },
  };
}

function createDraftWorkstation(
  draftId: string,
  name: string,
  workstationType: DeploymentDraft["workstations"][number]["workstationType"],
  locationLabel: string,
  capabilities: DeploymentDraft["workstations"][number]["capabilities"],
): DeploymentDraft["workstations"][number] {
  return {
    draftId,
    name,
    workstationType,
    roomNumber: "",
    locationLabel,
    capabilities,
  };
}

function createWorkstationShellRecord(input: {
  id: string;
  clinicId: string | null;
  deploymentWorkstationKey: string | null;
  provisioningStatus?: DeploymentWorkstationShellRecord["provisioningStatus"];
  active?: boolean;
}): DeploymentWorkstationShellRecord {
  const label = input.deploymentWorkstationKey ?? "legacy-workstation";

  return {
    id: input.id,
    clinicId: input.clinicId,
    deploymentWorkstationKey: input.deploymentWorkstationKey,
    name: `${label} Shell`,
    workstationType: "operatory",
    displayOrder: 1,
    status: input.provisioningStatus === "active" ? "active" : "planned",
    capabilities: {
      printer: false,
      usb_scanner: true,
      camera: false,
      sound: false,
      sterilizer: false,
    },
    locationLabel: "Room 1",
    agentUrl: null,
    active: input.active ?? false,
    provisioningSource: input.deploymentWorkstationKey ? "setup_draft" : null,
    provisioningStatus: input.provisioningStatus ?? "planned",
    createdAt: FIXED_TIMESTAMP,
    updatedAt: FIXED_TIMESTAMP,
  };
}

function expectScenario(
  name: string,
  passed: boolean,
  message: string,
): DeploymentWorkstationServiceHarnessScenario {
  return {
    name,
    passed,
    message,
  };
}
