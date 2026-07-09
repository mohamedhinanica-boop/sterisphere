import {
  CURRENT_DEPLOYMENT_DRAFT_VERSION,
  type DeploymentDraft,
} from "./deployment-draft";
import { DeploymentProviderService } from "./deployment-provider-service";
import { InMemoryDeploymentProviderTestRepository } from "./deployment-provider-test-repository";
import type { DeploymentProviderShellRecord } from "./deployment-provider-types";

export interface DeploymentProviderServiceHarnessScenario {
  name: string;
  passed: boolean;
  message: string;
}

export interface DeploymentProviderServiceHarnessResult {
  passed: boolean;
  scenarios: readonly DeploymentProviderServiceHarnessScenario[];
}

const FIXED_TIMESTAMP = "2026-07-09T12:00:00.000Z";
const CLINIC_ID = "clinic-provider-harness-0001";
const OTHER_CLINIC_ID = "clinic-provider-harness-0002";

export async function runDeploymentProviderServiceHarness(): Promise<DeploymentProviderServiceHarnessResult> {
  const scenarios = [
    await scenarioCreatesShellsFromCountOnlyDraft(),
    await scenarioRetryReusesAllShells(),
    await scenarioPartialExistingCreatesOnlyMissing(),
    await scenarioZeroCountCategoriesCreateNone(),
    await scenarioSameKeyCannotDuplicateWithinClinic(),
    await scenarioDifferentClinicsCanUseSameDeploymentProviderKey(),
    await scenarioGlobalLegacyProvidersAreIgnored(),
    await scenarioForbiddenDownstreamCountersRemainZero(),
  ];

  return {
    passed: scenarios.every((scenario) => scenario.passed),
    scenarios,
  };
}

async function scenarioCreatesShellsFromCountOnlyDraft(): Promise<DeploymentProviderServiceHarnessScenario> {
  const harness = createHarness();
  const result = await harness.service.provisionProviderShellsForClinic({
    clinicId: CLINIC_ID,
    draft: createDraft(),
    createdAt: FIXED_TIMESTAMP,
  });

  return expectScenario(
    "creates shells from count-only draft",
    result.ok &&
      result.counts.requested === 6 &&
      result.counts.created === 6 &&
      result.counts.reused === 0 &&
      harness.repository.providers.every(
        (provider) =>
          provider.provisioningSource === "setup_draft" &&
          provider.provisioningStatus === "placeholder" &&
          provider.firstName === null &&
          provider.lastName === null &&
          provider.active === false,
      ),
    `requested=${result.counts.requested}; created=${result.counts.created}`,
  );
}

async function scenarioRetryReusesAllShells(): Promise<DeploymentProviderServiceHarnessScenario> {
  const harness = createHarness();
  const command = {
    clinicId: CLINIC_ID,
    draft: createDraft(),
    createdAt: FIXED_TIMESTAMP,
  };
  const firstResult = await harness.service.provisionProviderShellsForClinic(
    command,
  );
  const secondResult = await harness.service.provisionProviderShellsForClinic(
    command,
  );

  return expectScenario(
    "retry reuses all shells",
    firstResult.ok &&
      secondResult.ok &&
      secondResult.counts.created === 0 &&
      secondResult.counts.reused === 6 &&
      harness.repository.providers.length === 6,
    `firstCreated=${firstResult.counts.created}; secondReused=${secondResult.counts.reused}`,
  );
}

async function scenarioPartialExistingCreatesOnlyMissing(): Promise<DeploymentProviderServiceHarnessScenario> {
  const harness = createHarness({
    providers: [
      createProviderShellRecord({
        id: "provider-existing-dentist",
        clinicId: CLINIC_ID,
        deploymentProviderKey: "dentist-001",
      }),
      createProviderShellRecord({
        id: "provider-existing-hygienist",
        clinicId: CLINIC_ID,
        deploymentProviderKey: "hygienist-001",
      }),
    ],
  });
  const result = await harness.service.provisionProviderShellsForClinic({
    clinicId: CLINIC_ID,
    draft: createDraft(),
    createdAt: FIXED_TIMESTAMP,
  });

  return expectScenario(
    "partial existing shells creates only missing",
    result.ok &&
      result.counts.requested === 6 &&
      result.counts.reused === 2 &&
      result.counts.created === 4 &&
      harness.repository.providers.length === 6,
    `created=${result.counts.created}; reused=${result.counts.reused}; total=${harness.repository.providers.length}`,
  );
}

async function scenarioZeroCountCategoriesCreateNone(): Promise<DeploymentProviderServiceHarnessScenario> {
  const harness = createHarness();
  const result = await harness.service.provisionProviderShellsForClinic({
    clinicId: CLINIC_ID,
    draft: createDraft({
      dentists: 0,
      hygienists: 0,
      assistants: 0,
      receptionists: 0,
      treatmentCoordinators: 0,
      sterilizationTechnicians: 0,
      officeManagers: 0,
    }),
    createdAt: FIXED_TIMESTAMP,
  });

  return expectScenario(
    "zero-count categories create none",
    result.ok &&
      result.counts.requested === 0 &&
      result.counts.created === 0 &&
      harness.repository.providers.length === 0,
    `requested=${result.counts.requested}; created=${result.counts.created}`,
  );
}

async function scenarioSameKeyCannotDuplicateWithinClinic(): Promise<DeploymentProviderServiceHarnessScenario> {
  const harness = createHarness({
    providers: [
      createProviderShellRecord({
        id: "provider-duplicate-a",
        clinicId: CLINIC_ID,
        deploymentProviderKey: "dentist-001",
      }),
      createProviderShellRecord({
        id: "provider-duplicate-b",
        clinicId: CLINIC_ID,
        deploymentProviderKey: "dentist-001",
      }),
    ],
  });
  const result = await harness.service.provisionProviderShellsForClinic({
    clinicId: CLINIC_ID,
    draft: createDraft({
      dentists: 1,
      hygienists: 0,
      assistants: 0,
      receptionists: 0,
      treatmentCoordinators: 0,
      sterilizationTechnicians: 0,
      officeManagers: 0,
    }),
    createdAt: FIXED_TIMESTAMP,
  });

  return expectScenario(
    "same key cannot duplicate within clinic",
    !result.ok &&
      result.counts.conflicts === 1 &&
      result.counts.skipped === 1 &&
      harness.repository.calls.createProviderShell === 0,
    `conflicts=${result.counts.conflicts}; skipped=${result.counts.skipped}; writes=${harness.repository.calls.createProviderShell}`,
  );
}

async function scenarioDifferentClinicsCanUseSameDeploymentProviderKey(): Promise<DeploymentProviderServiceHarnessScenario> {
  const harness = createHarness({
    clinicIds: [CLINIC_ID, OTHER_CLINIC_ID],
    clinicIdsWithSettings: [CLINIC_ID, OTHER_CLINIC_ID],
    providers: [
      createProviderShellRecord({
        id: "provider-other-clinic",
        clinicId: OTHER_CLINIC_ID,
        deploymentProviderKey: "dentist-001",
      }),
    ],
  });
  const result = await harness.service.provisionProviderShellsForClinic({
    clinicId: CLINIC_ID,
    draft: createDraft({
      dentists: 1,
      hygienists: 0,
      assistants: 0,
      receptionists: 0,
      treatmentCoordinators: 0,
      sterilizationTechnicians: 0,
      officeManagers: 0,
    }),
    createdAt: FIXED_TIMESTAMP,
  });

  return expectScenario(
    "different clinics can use same deployment_provider_key",
    result.ok &&
      result.counts.created === 1 &&
      harness.repository.providers.filter(
        (provider) => provider.deploymentProviderKey === "dentist-001",
      ).length === 2,
    `created=${result.counts.created}; matchingKeys=${harness.repository.providers.filter((provider) => provider.deploymentProviderKey === "dentist-001").length}`,
  );
}

async function scenarioGlobalLegacyProvidersAreIgnored(): Promise<DeploymentProviderServiceHarnessScenario> {
  const harness = createHarness({
    providers: [
      createProviderShellRecord({
        id: "provider-global-legacy",
        clinicId: null,
        deploymentProviderKey: "dentist-001",
        provisioningStatus: "active",
        active: true,
      }),
    ],
  });
  const result = await harness.service.provisionProviderShellsForClinic({
    clinicId: CLINIC_ID,
    draft: createDraft({
      dentists: 1,
      hygienists: 0,
      assistants: 0,
      receptionists: 0,
      treatmentCoordinators: 0,
      sterilizationTechnicians: 0,
      officeManagers: 0,
    }),
    createdAt: FIXED_TIMESTAMP,
  });

  return expectScenario(
    "global legacy providers with clinic_id null are ignored",
    result.ok &&
      result.counts.created === 1 &&
      harness.repository.providers.length === 2,
    `created=${result.counts.created}; total=${harness.repository.providers.length}`,
  );
}

async function scenarioForbiddenDownstreamCountersRemainZero(): Promise<DeploymentProviderServiceHarnessScenario> {
  const harness = createHarness();
  await harness.service.provisionProviderShellsForClinic({
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
  providers?: readonly DeploymentProviderShellRecord[];
} = {}): {
  repository: InMemoryDeploymentProviderTestRepository;
  service: DeploymentProviderService;
} {
  const repository = new InMemoryDeploymentProviderTestRepository({
    clinicIds: input.clinicIds ?? [CLINIC_ID],
    clinicIdsWithSettings: input.clinicIdsWithSettings ?? [CLINIC_ID],
    providers: input.providers ?? [],
  });

  return {
    repository,
    service: new DeploymentProviderService(repository),
  };
}

function createDraft(
  providerPlan: DeploymentDraft["providerPlan"] = {
    clinicType: "general_dentistry",
    dentists: 1,
    hygienists: 1,
    assistants: 1,
    receptionists: 1,
    treatmentCoordinators: 0,
    sterilizationTechnicians: 1,
    officeManagers: 1,
  },
): DeploymentDraft {
  return {
    draftVersion: CURRENT_DEPLOYMENT_DRAFT_VERSION,
    createdAt: FIXED_TIMESTAMP,
    clinicProfile: {
      name: "Provider Harness Dental",
      legalName: "Provider Harness Dental Professional Corporation",
      clinicCode: "PROVIDER-HARNESS",
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
    providerPlan,
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
      requiredSections: ["clinic"],
      completedSections: ["clinic"],
      warnings: [],
    },
  };
}

function createProviderShellRecord(input: {
  id: string;
  clinicId: string | null;
  deploymentProviderKey: string | null;
  provisioningStatus?: DeploymentProviderShellRecord["provisioningStatus"];
  active?: boolean;
}): DeploymentProviderShellRecord {
  const label = input.deploymentProviderKey ?? "legacy-provider";

  return {
    id: input.id,
    clinicId: input.clinicId,
    deploymentProviderKey: input.deploymentProviderKey,
    provisioningSource: input.deploymentProviderKey ? "setup_draft" : null,
    provisioningStatus: input.provisioningStatus ?? "placeholder",
    firstName: null,
    lastName: null,
    title: `${label} Placeholder`,
    displayName: `${label} Placeholder`,
    fullName: `${label} Placeholder`,
    role: "Dentist",
    active: input.active ?? false,
    createdAt: FIXED_TIMESTAMP,
    updatedAt: FIXED_TIMESTAMP,
  };
}

function expectScenario(
  name: string,
  passed: boolean,
  message: string,
): DeploymentProviderServiceHarnessScenario {
  return {
    name,
    passed,
    message,
  };
}

