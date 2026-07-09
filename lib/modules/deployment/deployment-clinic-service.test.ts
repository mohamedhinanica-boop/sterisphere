import type { DeploymentAuditEvidenceEnvelope } from "./deployment-audit-evidence-types";
import {
  CURRENT_DEPLOYMENT_DRAFT_VERSION,
  hashDeploymentDraftInput,
  summarizeDeploymentDraft,
  type DeploymentDraft,
} from "./deployment-draft";
import { DeploymentClinicService } from "./deployment-clinic-service";
import type {
  DeploymentClinicCreateCommand,
  DeploymentClinicRecord,
} from "./deployment-clinic-types";
import { InMemoryDeploymentClinicTestRepository } from "./deployment-clinic-test-repository";
import { InMemoryDeploymentRunTestRepository } from "./deployment-run-test-repository";
import type { DeploymentRunRecord } from "./deployment-run-types";
import { DeploymentStatus } from "./deployment-types";

export interface DeploymentClinicServiceHarnessScenario {
  name: string;
  passed: boolean;
  message: string;
}

export interface DeploymentClinicServiceHarnessResult {
  passed: boolean;
  scenarios: readonly DeploymentClinicServiceHarnessScenario[];
}

const FIXED_TIMESTAMP = "2026-07-08T12:00:00.000Z";
const DEPLOYMENT_RUN_ID = "deployment-run-clinic-harness-0001";
const IDEMPOTENCY_KEY = "setup-deployment-session:clinic-harness-0001";
const PAYLOAD_HASH = "clinic-harness-payload-hash-0001";

export async function runDeploymentClinicServiceHarness(): Promise<DeploymentClinicServiceHarnessResult> {
  const scenarios = [
    await scenarioDeploymentRunMustExistBeforeClinicCreation(),
    await scenarioCreateClinicRootFromDeploymentRunSucceeds(),
    await scenarioDeploymentRunClinicIdLinksAfterCreation(),
    await scenarioRetrySameDeploymentRunReusesLinkedClinic(),
    await scenarioSameClinicCodeFromDifferentSessionConflicts(),
    await scenarioLinkConflictWhenDeploymentRunPointsElsewhere(),
    await scenarioServiceDoesNotTouchForbiddenBoundaries(),
  ];

  return {
    passed: scenarios.every((scenario) => scenario.passed),
    scenarios,
  };
}

async function scenarioDeploymentRunMustExistBeforeClinicCreation(): Promise<DeploymentClinicServiceHarnessScenario> {
  const harness = createHarness([]);
  const result = await harness.service.createClinicRootForDeploymentRun(
    createCommand(),
  );

  return expectScenario(
    "deployment_run must exist before clinic creation",
    !result.ok &&
      result.status === "rejected" &&
      harness.clinicRepository.calls.createClinic === 0 &&
      harness.clinicRepository.clinics.length === 0,
    `status=${result.status}; clinicWrites=${harness.clinicRepository.calls.createClinic}`,
  );
}

async function scenarioCreateClinicRootFromDeploymentRunSucceeds(): Promise<DeploymentClinicServiceHarnessScenario> {
  const harness = createHarness([createDeploymentRunRecord()]);
  const result = await harness.service.createClinicRootForDeploymentRun(
    createCommand(),
  );

  return expectScenario(
    "create clinic root from deployment run succeeds",
    result.ok &&
      result.clinic?.deploymentStatus === "draft" &&
      harness.clinicRepository.calls.createClinic === 1 &&
      harness.clinicRepository.clinics.length === 1,
    `status=${result.status}; clinicStatus=${result.clinic?.deploymentStatus}`,
  );
}

async function scenarioDeploymentRunClinicIdLinksAfterCreation(): Promise<DeploymentClinicServiceHarnessScenario> {
  const harness = createHarness([createDeploymentRunRecord()]);
  const result = await harness.service.createClinicRootForDeploymentRun(
    createCommand(),
  );
  const deploymentRun = harness.deploymentRunRepository.records[0];

  return expectScenario(
    "deployment_runs.clinic_id links after clinic creation",
    result.ok &&
      Boolean(result.clinic?.id) &&
      deploymentRun?.clinicId === result.clinic?.id,
    `linkedClinicId=${deploymentRun?.clinicId ?? "null"}`,
  );
}

async function scenarioRetrySameDeploymentRunReusesLinkedClinic(): Promise<DeploymentClinicServiceHarnessScenario> {
  const harness = createHarness([createDeploymentRunRecord()]);
  const firstResult = await harness.service.createClinicRootForDeploymentRun(
    createCommand(),
  );
  const secondResult = await harness.service.createClinicRootForDeploymentRun(
    createCommand(),
  );

  return expectScenario(
    "retry same deployment_run reuses linked clinic",
    firstResult.ok &&
      secondResult.ok &&
      secondResult.status === "reused" &&
      firstResult.clinic?.id === secondResult.clinic?.id &&
      harness.clinicRepository.calls.createClinic === 1 &&
      harness.clinicRepository.clinics.length === 1,
    `first=${firstResult.status}; second=${secondResult.status}; clinicWrites=${harness.clinicRepository.calls.createClinic}`,
  );
}

async function scenarioSameClinicCodeFromDifferentSessionConflicts(): Promise<DeploymentClinicServiceHarnessScenario> {
  const existingClinic = createClinicRecord({
    id: "clinic-existing",
    clinicCode: "HARNESS",
  });
  const harness = createHarness(
    [
      createDeploymentRunRecord({
        deploymentRunId: "deployment-run-different-session",
        idempotencyKey: "setup-deployment-session:different-session",
      }),
    ],
    [existingClinic],
  );
  const result = await harness.service.createClinicRootForDeploymentRun(
    createCommand({
      deploymentRunId: "deployment-run-different-session",
    }),
  );

  return expectScenario(
    "same clinic_code from different session conflicts",
    !result.ok &&
      result.status === "conflict" &&
      result.clinic?.id === existingClinic.id &&
      harness.clinicRepository.calls.linkClinicToDeploymentRun === 0,
    `status=${result.status}; conflictingClinic=${result.clinic?.id ?? "none"}`,
  );
}

async function scenarioLinkConflictWhenDeploymentRunPointsElsewhere(): Promise<DeploymentClinicServiceHarnessScenario> {
  const linkedClinic = createClinicRecord({
    id: "clinic-linked",
    clinicCode: "LINKED",
  });
  const targetClinic = createClinicRecord({
    id: "clinic-target",
    clinicCode: "TARGET",
  });
  const harness = createHarness(
    [
      createDeploymentRunRecord({
        clinicId: linkedClinic.id,
      }),
    ],
    [linkedClinic, targetClinic],
  );
  const result = await harness.service.linkClinicToDeploymentRun({
    deploymentRunId: DEPLOYMENT_RUN_ID,
    clinicId: targetClinic.id,
    updatedAt: FIXED_TIMESTAMP,
  });

  return expectScenario(
    "link conflict is explicit when deployment_run points to another clinic",
    !result.ok &&
      result.status === "conflict" &&
      result.clinic?.id === linkedClinic.id &&
      harness.clinicRepository.calls.linkClinicToDeploymentRun === 0,
    `status=${result.status}; existingClinic=${result.clinic?.id ?? "none"}`,
  );
}

async function scenarioServiceDoesNotTouchForbiddenBoundaries(): Promise<DeploymentClinicServiceHarnessScenario> {
  const harness = createHarness([createDeploymentRunRecord()]);
  await harness.service.createClinicRootForDeploymentRun(createCommand());

  return expectScenario(
    "service never creates settings, providers, sterilizers, workstations, packs, cycles, traces, or audit logs",
    harness.clinicRepository.calls.forbiddenSettingsWrites === 0 &&
      harness.clinicRepository.calls.forbiddenProviderWrites === 0 &&
      harness.clinicRepository.calls.forbiddenSterilizerWrites === 0 &&
      harness.clinicRepository.calls.forbiddenWorkstationWrites === 0 &&
      harness.clinicRepository.calls.forbiddenPackWrites === 0 &&
      harness.clinicRepository.calls.forbiddenCycleWrites === 0 &&
      harness.clinicRepository.calls.forbiddenTraceWrites === 0 &&
      harness.clinicRepository.calls.forbiddenAuditLogWrites === 0,
    "forbidden boundary counters remained zero",
  );
}

function createHarness(
  deploymentRuns: readonly DeploymentRunRecord[],
  clinics: readonly DeploymentClinicRecord[] = [],
): {
  clinicRepository: InMemoryDeploymentClinicTestRepository;
  deploymentRunRepository: InMemoryDeploymentRunTestRepository;
  service: DeploymentClinicService;
} {
  const deploymentRunRepository = new InMemoryDeploymentRunTestRepository(
    deploymentRuns,
  );
  const clinicRepository = new InMemoryDeploymentClinicTestRepository(
    deploymentRunRepository,
    clinics,
  );

  return {
    clinicRepository,
    deploymentRunRepository,
    service: new DeploymentClinicService(
      clinicRepository,
      deploymentRunRepository,
    ),
  };
}

function createCommand(
  input: {
    deploymentRunId?: string;
  } = {},
): DeploymentClinicCreateCommand {
  return {
    deploymentRunId: input.deploymentRunId ?? DEPLOYMENT_RUN_ID,
    draft: createDraft(),
    createdAt: FIXED_TIMESTAMP,
    deploymentVersion: "rc3-clinic-harness",
    schemaVersion: "clinic-root-v1",
  };
}

function createDeploymentRunRecord(
  input: {
    deploymentRunId?: string;
    idempotencyKey?: string;
    clinicId?: string | null;
  } = {},
): DeploymentRunRecord {
  const draft = createDraft();

  return {
    id: "00000000-0000-0000-0000-000000000101",
    deploymentRunId: input.deploymentRunId ?? DEPLOYMENT_RUN_ID,
    clinicId: input.clinicId ?? null,
    idempotencyKey: input.idempotencyKey ?? IDEMPOTENCY_KEY,
    payloadHash: PAYLOAD_HASH,
    lifecycleState: "ready",
    deploymentStatus: DeploymentStatus.DRAFT,
    persistenceStatus: "pending",
    draftSnapshot: draft,
    auditEvidence: createAuditEvidence(draft),
    rollbackRecovery: null,
    lifecycleSummary: null,
    createdAt: FIXED_TIMESTAMP,
    startedAt: null,
    completedAt: null,
    failedAt: null,
    blockedAt: null,
    retryOf: null,
    metadata: {
      harness: true,
    },
  };
}

function createClinicRecord(input: {
  id: string;
  clinicCode: string;
}): DeploymentClinicRecord {
  return {
    id: input.id,
    name: "Harness Dental",
    legalName: "Harness Dental Professional Corporation",
    clinicCode: input.clinicCode,
    country: "Canada",
    provinceState: "Ontario",
    timezone: "America/Toronto",
    primaryLanguage: "English",
    phone: null,
    email: null,
    website: null,
    addressStreet: null,
    addressCity: null,
    addressPostalCode: null,
    deploymentStatus: "draft",
    deployedAt: null,
    deploymentVersion: "rc3-clinic-harness",
    schemaVersion: "clinic-root-v1",
    createdAt: FIXED_TIMESTAMP,
    updatedAt: FIXED_TIMESTAMP,
  };
}

function createDraft(): DeploymentDraft {
  return {
    draftVersion: CURRENT_DEPLOYMENT_DRAFT_VERSION,
    createdAt: FIXED_TIMESTAMP,
    clinicProfile: {
      name: "Harness Dental",
      legalName: "Harness Dental Professional Corporation",
      clinicCode: "HARNESS",
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
    sterilizers: [],
    policies: {
      packExpiration: "180 days",
    },
    hardwarePlan: {
      labelPrinters: 1,
      usbScanners: 1,
    },
    reviewMetadata: {
      readinessScore: 100,
      requiredSections: ["clinic"],
      completedSections: ["clinic"],
      warnings: [],
    },
  };
}

function createAuditEvidence(
  draft: DeploymentDraft,
): DeploymentAuditEvidenceEnvelope {
  const payloadHash = hashDeploymentDraftInput(draft);

  return {
    subject: {
      clinicId: null,
      deploymentRunId: DEPLOYMENT_RUN_ID,
      draftVersion: draft.draftVersion,
      payloadHash,
    },
    actor: {
      requestedBy: null,
    },
    snapshot: {
      draft,
      deploymentSummary: summarizeDeploymentDraft(draft),
      stageExecutionSummary: [],
      dryRunDiagnostics: [],
      transaction: null,
      lockMetadata: [],
      idempotencyMetadata: [],
      rollbackVerification: null,
      recoveryPlan: null,
      lifecycleSummary: null,
      finalOutcome: "succeeded",
    },
    integrity: {
      evidenceVersion: "deployment-clinic-harness-v1",
      generatedAt: FIXED_TIMESTAMP,
      immutableConcept: true,
      payloadHash,
      eventCount: 0,
      stageCount: 0,
      warningCount: 0,
    },
    summary: {
      outcome: "succeeded",
      completedStageCount: 0,
      failedStage: null,
      skippedStageCount: 0,
      warningCount: 0,
      rollbackRequired: false,
      rollbackVerified: false,
      manualRecoveryRequired: false,
      safeToRetry: true,
      retryDecision: "Harness evidence only.",
    },
    events: [],
  };
}

function expectScenario(
  name: string,
  passed: boolean,
  message: string,
): DeploymentClinicServiceHarnessScenario {
  return {
    name,
    passed,
    message,
  };
}
