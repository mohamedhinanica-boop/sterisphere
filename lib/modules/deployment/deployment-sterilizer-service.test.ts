import {
  CURRENT_DEPLOYMENT_DRAFT_VERSION,
  type DeploymentDraft,
} from "./deployment-draft";
import { DeploymentSterilizerService } from "./deployment-sterilizer-service";
import { InMemoryDeploymentSterilizerTestRepository } from "./deployment-sterilizer-test-repository";
import type { DeploymentSterilizerShellRecord } from "./deployment-sterilizer-types";

export interface DeploymentSterilizerServiceHarnessScenario {
  name: string;
  passed: boolean;
  message: string;
}

export interface DeploymentSterilizerServiceHarnessResult {
  passed: boolean;
  scenarios: readonly DeploymentSterilizerServiceHarnessScenario[];
}

const FIXED_TIMESTAMP = "2026-07-09T12:00:00.000Z";
const CLINIC_ID = "clinic-sterilizer-harness-0001";
const OTHER_CLINIC_ID = "clinic-sterilizer-harness-0002";

export async function runDeploymentSterilizerServiceHarness(): Promise<DeploymentSterilizerServiceHarnessResult> {
  const scenarios = [
    await scenarioCreatesSterilizerShellsFromDraft(),
    await scenarioRetryReusesAllShells(),
    await scenarioPartialExistingCreatesOnlyMissing(),
    await scenarioEmptyDraftCreatesNone(),
    await scenarioSameKeyCannotDuplicateWithinClinic(),
    await scenarioDifferentClinicsCanUseSameDeploymentSterilizerKey(),
    await scenarioGeneratedNamesDifferAcrossClinics(),
    await scenarioGlobalLegacySterilizersAreIgnored(),
    await scenarioForbiddenDownstreamCountersRemainZero(),
  ];

  return {
    passed: scenarios.every((scenario) => scenario.passed),
    scenarios,
  };
}

async function scenarioCreatesSterilizerShellsFromDraft(): Promise<DeploymentSterilizerServiceHarnessScenario> {
  const harness = createHarness();
  const result = await harness.service.provisionSterilizerShellsForClinic({
    clinicId: CLINIC_ID,
    draft: createDraft(),
    createdAt: FIXED_TIMESTAMP,
  });

  return expectScenario(
    "creates sterilizer shells from draft",
    result.ok &&
      result.counts.requested === 2 &&
      result.counts.created === 2 &&
      result.counts.reused === 0 &&
      harness.repository.sterilizers.every(
        (sterilizer) =>
          sterilizer.provisioningSource === "setup_draft" &&
          sterilizer.provisioningStatus === "planned" &&
          sterilizer.active === false &&
          sterilizer.clinicId === CLINIC_ID &&
          sterilizer.name.endsWith("clinicst0001"),
      ),
    `requested=${result.counts.requested}; created=${result.counts.created}`,
  );
}

async function scenarioRetryReusesAllShells(): Promise<DeploymentSterilizerServiceHarnessScenario> {
  const harness = createHarness();
  const command = {
    clinicId: CLINIC_ID,
    draft: createDraft(),
    createdAt: FIXED_TIMESTAMP,
  };
  const firstResult =
    await harness.service.provisionSterilizerShellsForClinic(command);
  const secondResult =
    await harness.service.provisionSterilizerShellsForClinic(command);

  return expectScenario(
    "retry reuses all shells",
    firstResult.ok &&
      secondResult.ok &&
      secondResult.counts.created === 0 &&
      secondResult.counts.reused === 2 &&
      harness.repository.sterilizers.length === 2,
    `firstCreated=${firstResult.counts.created}; secondReused=${secondResult.counts.reused}`,
  );
}

async function scenarioPartialExistingCreatesOnlyMissing(): Promise<DeploymentSterilizerServiceHarnessScenario> {
  const harness = createHarness({
    sterilizers: [
      createSterilizerShellRecord({
        id: "sterilizer-existing-one",
        clinicId: CLINIC_ID,
        deploymentSterilizerKey: "sterilizer-001",
      }),
    ],
  });
  const result = await harness.service.provisionSterilizerShellsForClinic({
    clinicId: CLINIC_ID,
    draft: createDraft(),
    createdAt: FIXED_TIMESTAMP,
  });

  return expectScenario(
    "partial existing shells create only missing",
    result.ok &&
      result.counts.requested === 2 &&
      result.counts.reused === 1 &&
      result.counts.created === 1 &&
      harness.repository.sterilizers.length === 2,
    `created=${result.counts.created}; reused=${result.counts.reused}; total=${harness.repository.sterilizers.length}`,
  );
}

async function scenarioEmptyDraftCreatesNone(): Promise<DeploymentSterilizerServiceHarnessScenario> {
  const harness = createHarness();
  const result = await harness.service.provisionSterilizerShellsForClinic({
    clinicId: CLINIC_ID,
    draft: createDraft([]),
    createdAt: FIXED_TIMESTAMP,
  });

  return expectScenario(
    "zero-count or empty draft creates none",
    result.ok &&
      result.counts.requested === 0 &&
      result.counts.created === 0 &&
      harness.repository.sterilizers.length === 0,
    `requested=${result.counts.requested}; created=${result.counts.created}`,
  );
}

async function scenarioSameKeyCannotDuplicateWithinClinic(): Promise<DeploymentSterilizerServiceHarnessScenario> {
  const harness = createHarness({
    sterilizers: [
      createSterilizerShellRecord({
        id: "sterilizer-duplicate-a",
        clinicId: CLINIC_ID,
        deploymentSterilizerKey: "sterilizer-001",
      }),
      createSterilizerShellRecord({
        id: "sterilizer-duplicate-b",
        clinicId: CLINIC_ID,
        deploymentSterilizerKey: "sterilizer-001",
      }),
    ],
  });
  const result = await harness.service.provisionSterilizerShellsForClinic({
    clinicId: CLINIC_ID,
    draft: createDraft([createDraftSterilizer("steam-1", "Steam Autoclave 1")]),
    createdAt: FIXED_TIMESTAMP,
  });

  return expectScenario(
    "same key cannot duplicate within clinic",
    !result.ok &&
      result.counts.conflicts === 1 &&
      result.counts.skipped === 1 &&
      harness.repository.calls.createSterilizerShell === 0,
    `conflicts=${result.counts.conflicts}; skipped=${result.counts.skipped}; writes=${harness.repository.calls.createSterilizerShell}`,
  );
}

async function scenarioDifferentClinicsCanUseSameDeploymentSterilizerKey(): Promise<DeploymentSterilizerServiceHarnessScenario> {
  const harness = createHarness({
    clinicIds: [CLINIC_ID, OTHER_CLINIC_ID],
    clinicIdsWithSettings: [CLINIC_ID, OTHER_CLINIC_ID],
    clinicIdsWithProviderShells: [CLINIC_ID, OTHER_CLINIC_ID],
  });
  const draft = createDraft([
    createDraftSterilizer("steam-1", "Steam Autoclave 1"),
  ]);
  const firstClinicResult =
    await harness.service.provisionSterilizerShellsForClinic({
      clinicId: CLINIC_ID,
      draft,
      createdAt: FIXED_TIMESTAMP,
    });
  const otherClinicResult =
    await harness.service.provisionSterilizerShellsForClinic({
      clinicId: OTHER_CLINIC_ID,
      draft,
      createdAt: FIXED_TIMESTAMP,
    });
  const retryResult =
    await harness.service.provisionSterilizerShellsForClinic({
      clinicId: CLINIC_ID,
      draft,
      createdAt: FIXED_TIMESTAMP,
    });

  return expectScenario(
    "different clinics can use same deployment_sterilizer_key",
    firstClinicResult.ok &&
      otherClinicResult.ok &&
      retryResult.ok &&
      firstClinicResult.counts.created === 1 &&
      otherClinicResult.counts.created === 1 &&
      retryResult.counts.created === 0 &&
      retryResult.counts.reused === 1 &&
      harness.repository.sterilizers.filter(
        (sterilizer) =>
          sterilizer.deploymentSterilizerKey === "sterilizer-001",
      ).length === 2,
    `firstCreated=${firstClinicResult.counts.created}; otherCreated=${otherClinicResult.counts.created}; retryReused=${retryResult.counts.reused}`,
  );
}

async function scenarioGeneratedNamesDifferAcrossClinics(): Promise<DeploymentSterilizerServiceHarnessScenario> {
  const firstHarness = createHarness();
  const otherHarness = createHarness({
    clinicIds: [OTHER_CLINIC_ID],
    clinicIdsWithSettings: [OTHER_CLINIC_ID],
    clinicIdsWithProviderShells: [OTHER_CLINIC_ID],
  });
  const draft = createDraft([
    createDraftSterilizer("steam-1", "Steam Autoclave 1"),
  ]);
  const [firstPayload] =
    firstHarness.service.buildSterilizerShellPayloadsFromDraft({
      clinicId: CLINIC_ID,
      draft,
      createdAt: FIXED_TIMESTAMP,
    });
  const [otherPayload] =
    otherHarness.service.buildSterilizerShellPayloadsFromDraft({
      clinicId: OTHER_CLINIC_ID,
      draft,
      createdAt: FIXED_TIMESTAMP,
    });

  return expectScenario(
    "generated names differ across clinics",
    firstPayload !== undefined &&
      otherPayload !== undefined &&
      firstPayload.deploymentSterilizerKey === otherPayload.deploymentSterilizerKey &&
      firstPayload.name !== otherPayload.name &&
      firstPayload.name.endsWith("clinicst0001") &&
      otherPayload.name.endsWith("clinicst0002"),
    `firstName=${firstPayload?.name}; otherName=${otherPayload?.name}`,
  );
}

async function scenarioGlobalLegacySterilizersAreIgnored(): Promise<DeploymentSterilizerServiceHarnessScenario> {
  const harness = createHarness({
    sterilizers: [
      createSterilizerShellRecord({
        id: "sterilizer-global-legacy",
        clinicId: null,
        deploymentSterilizerKey: "sterilizer-001",
        provisioningStatus: "active",
        active: true,
      }),
    ],
  });
  const result = await harness.service.provisionSterilizerShellsForClinic({
    clinicId: CLINIC_ID,
    draft: createDraft([createDraftSterilizer("steam-1", "Steam Autoclave 1")]),
    createdAt: FIXED_TIMESTAMP,
  });

  return expectScenario(
    "legacy global sterilizers with clinic_id null are ignored",
    result.ok &&
      result.counts.created === 1 &&
      harness.repository.sterilizers.length === 2,
    `created=${result.counts.created}; total=${harness.repository.sterilizers.length}`,
  );
}

async function scenarioForbiddenDownstreamCountersRemainZero(): Promise<DeploymentSterilizerServiceHarnessScenario> {
  const harness = createHarness();
  await harness.service.provisionSterilizerShellsForClinic({
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
  sterilizers?: readonly DeploymentSterilizerShellRecord[];
} = {}): {
  repository: InMemoryDeploymentSterilizerTestRepository;
  service: DeploymentSterilizerService;
} {
  const repository = new InMemoryDeploymentSterilizerTestRepository({
    clinicIds: input.clinicIds ?? [CLINIC_ID],
    clinicIdsWithSettings: input.clinicIdsWithSettings ?? [CLINIC_ID],
    clinicIdsWithProviderShells:
      input.clinicIdsWithProviderShells ?? [CLINIC_ID],
    sterilizers: input.sterilizers ?? [],
  });

  return {
    repository,
    service: new DeploymentSterilizerService(repository),
  };
}

function createDraft(
  sterilizers: DeploymentDraft["sterilizers"] = [
    createDraftSterilizer("steam-1", "Steam Autoclave 1", "Steam Autoclave"),
    createDraftSterilizer(
      "cassette-1",
      "Cassette Sterilizer 1",
      "Cassette Sterilizer",
    ),
  ],
): DeploymentDraft {
  return {
    draftVersion: CURRENT_DEPLOYMENT_DRAFT_VERSION,
    createdAt: FIXED_TIMESTAMP,
    clinicProfile: {
      name: "Sterilizer Harness Dental",
      legalName: "Sterilizer Harness Dental Professional Corporation",
      clinicCode: "STERILIZER-HARNESS",
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
    workstations: [],
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
    sterilizers,
    policies: {
      packExpiration: "180 days",
    },
    hardwarePlan: {
      labelPrinters: 0,
      usbScanners: 0,
    },
    reviewMetadata: {
      readinessScore: 100,
      requiredSections: ["clinic", "sterilizers"],
      completedSections: ["clinic", "sterilizers"],
      warnings: [],
    },
  };
}

function createDraftSterilizer(
  draftId: string,
  displayName: string,
  sterilizerType = "Steam Autoclave",
): DeploymentDraft["sterilizers"][number] {
  return {
    draftId,
    displayName,
    sterilizerType,
    manufacturer: "",
    model: "",
    serialNumber: "",
    assignedWorkstationDraftId: null,
    status: "planned",
  };
}

function createSterilizerShellRecord(input: {
  id: string;
  clinicId: string | null;
  deploymentSterilizerKey: string | null;
  provisioningStatus?: DeploymentSterilizerShellRecord["provisioningStatus"];
  active?: boolean;
}): DeploymentSterilizerShellRecord {
  const label = input.deploymentSterilizerKey ?? "legacy-sterilizer";

  return {
    id: input.id,
    clinicId: input.clinicId,
    deploymentSterilizerKey: input.deploymentSterilizerKey,
    name: `${label} Shell`,
    type: "Steam Autoclave",
    active: input.active ?? false,
    provisioningSource: input.deploymentSterilizerKey ? "setup_draft" : null,
    provisioningStatus: input.provisioningStatus ?? "planned",
    createdAt: FIXED_TIMESTAMP,
    updatedAt: FIXED_TIMESTAMP,
  };
}

function expectScenario(
  name: string,
  passed: boolean,
  message: string,
): DeploymentSterilizerServiceHarnessScenario {
  return {
    name,
    passed,
    message,
  };
}
