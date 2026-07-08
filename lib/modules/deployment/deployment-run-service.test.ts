import type { DeploymentAuditEvidenceEnvelope } from "./deployment-audit-evidence-types";
import {
  CURRENT_DEPLOYMENT_DRAFT_VERSION,
  hashDeploymentDraftInput,
  summarizeDeploymentDraft,
  type DeploymentDraft,
} from "./deployment-draft";
import { DeploymentRunService } from "./deployment-run-service";
import type {
  DeploymentRunCreateCommand,
  DeploymentRunCreateResultStatus,
  DeploymentRunResumeResultStatus,
} from "./deployment-run-service-types";
import { InMemoryDeploymentRunTestRepository } from "./deployment-run-test-repository";
import type { DeploymentRunRecord } from "./deployment-run-types";
import { DeploymentStatus } from "./deployment-types";

export interface DeploymentRunServiceHarnessScenario {
  name: string;
  passed: boolean;
  message: string;
}

export interface DeploymentRunServiceHarnessResult {
  passed: boolean;
  scenarios: readonly DeploymentRunServiceHarnessScenario[];
}

const FIXED_TIMESTAMP = "2026-07-08T12:00:00.000Z";
const VALID_IDEMPOTENCY_KEY = "deploy-key-0001";
const VALID_PAYLOAD_HASH = "draft-hash-0001";

export async function runDeploymentRunServiceHarness(): Promise<DeploymentRunServiceHarnessResult> {
  const scenarios = [
    await scenarioNewIdempotencyKeyCreatesRun(),
    await scenarioSameKeySamePayloadReusesRun(),
    await scenarioSameKeyDifferentPayloadConflicts(),
    await scenarioMissingIdempotencyRejectsBeforeWrite(),
    await scenarioMissingPayloadHashRejectsBeforeWrite(),
    await scenarioResumeExistingRunSucceeds(),
    await scenarioResumeMissingRunReturnsNotFound(),
    await scenarioServiceDoesNotTouchForbiddenBoundaries(),
  ];

  return {
    passed: scenarios.every((scenario) => scenario.passed),
    scenarios,
  };
}

async function scenarioNewIdempotencyKeyCreatesRun(): Promise<DeploymentRunServiceHarnessScenario> {
  const repository = new InMemoryDeploymentRunTestRepository();
  const service = new DeploymentRunService(repository);
  const result = await service.createOrReuseDeploymentRun(
    createCommand({
      idempotencyKey: VALID_IDEMPOTENCY_KEY,
      payloadHash: VALID_PAYLOAD_HASH,
    }),
  );

  return expectScenario(
    "new idempotency key creates deployment_runs record",
    result.status === "created" &&
      result.ok &&
      repository.calls.createDeploymentRun === 1 &&
      repository.records.length === 1,
    `status=${result.status}; writes=${repository.calls.createDeploymentRun}`,
  );
}

async function scenarioSameKeySamePayloadReusesRun(): Promise<DeploymentRunServiceHarnessScenario> {
  const existingRun = createDeploymentRunRecord({
    idempotencyKey: VALID_IDEMPOTENCY_KEY,
    payloadHash: VALID_PAYLOAD_HASH,
  });
  const repository = new InMemoryDeploymentRunTestRepository([existingRun]);
  const service = new DeploymentRunService(repository);
  const result = await service.createOrReuseDeploymentRun(
    createCommand({
      idempotencyKey: VALID_IDEMPOTENCY_KEY,
      payloadHash: VALID_PAYLOAD_HASH,
    }),
  );

  return expectCreateStatus(
    "same idempotency key and same payload hash reuses existing run",
    result.status,
    "reused",
    repository.calls.createDeploymentRun,
  );
}

async function scenarioSameKeyDifferentPayloadConflicts(): Promise<DeploymentRunServiceHarnessScenario> {
  const repository = new InMemoryDeploymentRunTestRepository([
    createDeploymentRunRecord({
      idempotencyKey: VALID_IDEMPOTENCY_KEY,
      payloadHash: VALID_PAYLOAD_HASH,
    }),
  ]);
  const service = new DeploymentRunService(repository);
  const result = await service.createOrReuseDeploymentRun(
    createCommand({
      idempotencyKey: VALID_IDEMPOTENCY_KEY,
      payloadHash: "draft-hash-different",
    }),
  );

  return expectCreateStatus(
    "same idempotency key and different payload hash returns conflict",
    result.status,
    "conflict",
    repository.calls.createDeploymentRun,
  );
}

async function scenarioMissingIdempotencyRejectsBeforeWrite(): Promise<DeploymentRunServiceHarnessScenario> {
  const repository = new InMemoryDeploymentRunTestRepository();
  const service = new DeploymentRunService(repository);
  const result = await service.createOrReuseDeploymentRun(
    createCommand({
      idempotencyKey: "",
      payloadHash: VALID_PAYLOAD_HASH,
    }),
  );

  return expectCreateStatus(
    "missing idempotency key rejects before write",
    result.status,
    "rejected",
    repository.calls.createDeploymentRun,
  );
}

async function scenarioMissingPayloadHashRejectsBeforeWrite(): Promise<DeploymentRunServiceHarnessScenario> {
  const repository = new InMemoryDeploymentRunTestRepository();
  const service = new DeploymentRunService(repository);
  const result = await service.evaluateDeploymentRunPersistenceDecision({
    idempotencyKey: VALID_IDEMPOTENCY_KEY,
    payloadHash: "",
  });

  return expectScenario(
    "missing payload hash rejects before write",
    result.status === "rejected" &&
      result.reason === "missing_payload_hash" &&
      repository.calls.createDeploymentRun === 0,
    `status=${result.status}; reason=${result.reason}; writes=${repository.calls.createDeploymentRun}`,
  );
}

async function scenarioResumeExistingRunSucceeds(): Promise<DeploymentRunServiceHarnessScenario> {
  const existingRun = createDeploymentRunRecord({
    deploymentRunId: "deployment-run-existing",
    idempotencyKey: VALID_IDEMPOTENCY_KEY,
    payloadHash: VALID_PAYLOAD_HASH,
  });
  const repository = new InMemoryDeploymentRunTestRepository([existingRun]);
  const service = new DeploymentRunService(repository);
  const result = await service.resumeDeploymentRun({
    deploymentRunId: "deployment-run-existing",
    expectedPayloadHash: VALID_PAYLOAD_HASH,
  });

  return expectResumeStatus(
    "resume existing deployment run succeeds",
    result.status,
    "resumed",
  );
}

async function scenarioResumeMissingRunReturnsNotFound(): Promise<DeploymentRunServiceHarnessScenario> {
  const repository = new InMemoryDeploymentRunTestRepository();
  const service = new DeploymentRunService(repository);
  const result = await service.resumeDeploymentRun({
    deploymentRunId: "deployment-run-missing",
  });

  return expectResumeStatus(
    "resume missing deployment run returns not found",
    result.status,
    "not_found",
  );
}

async function scenarioServiceDoesNotTouchForbiddenBoundaries(): Promise<DeploymentRunServiceHarnessScenario> {
  const repository = new InMemoryDeploymentRunTestRepository();
  const service = new DeploymentRunService(repository);
  await service.createOrReuseDeploymentRun(
    createCommand({
      idempotencyKey: VALID_IDEMPOTENCY_KEY,
      payloadHash: VALID_PAYLOAD_HASH,
    }),
  );

  return expectScenario(
    "service never creates clinic, tenant, settings, user, stage records, or executes engine",
    repository.calls.forbiddenClinicCreates === 0 &&
      repository.calls.forbiddenTenantCreates === 0 &&
      repository.calls.forbiddenSettingsWrites === 0 &&
      repository.calls.forbiddenUserWrites === 0 &&
      repository.calls.forbiddenStageWrites === 0 &&
      repository.calls.forbiddenEngineExecutions === 0,
    "forbidden boundary counters remained zero",
  );
}

function createCommand(input: {
  idempotencyKey: string;
  payloadHash: string;
}): DeploymentRunCreateCommand {
  const draft = createDraft();

  return {
    id: "00000000-0000-0000-0000-000000000001",
    deploymentRunId: "deployment-run-0001",
    clinicId: null,
    idempotencyKey: input.idempotencyKey,
    payloadHash: input.payloadHash,
    draft,
    auditEvidence: createAuditEvidence(draft, input.payloadHash),
    createdAt: FIXED_TIMESTAMP,
    metadata: {
      harness: true,
    },
  };
}

function createDeploymentRunRecord(input: {
  deploymentRunId?: string;
  idempotencyKey: string;
  payloadHash: string;
}): DeploymentRunRecord {
  const draft = createDraft();

  return {
    id: "00000000-0000-0000-0000-000000000001",
    deploymentRunId: input.deploymentRunId ?? "deployment-run-0001",
    clinicId: null,
    idempotencyKey: input.idempotencyKey,
    payloadHash: input.payloadHash,
    lifecycleState: "ready",
    deploymentStatus: DeploymentStatus.DRAFT,
    persistenceStatus: "pending",
    draftSnapshot: draft,
    auditEvidence: createAuditEvidence(draft, input.payloadHash),
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
    workstations: [
      {
        draftId: "workstation-1",
        name: "Treatment Room 1",
        workstationType: "treatment_room",
        roomNumber: "1",
        locationLabel: "Room 1",
        capabilities: ["cycle_start"],
      },
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
    sterilizers: [
      {
        draftId: "sterilizer-1",
        displayName: "Sterilizer 1",
        sterilizerType: "autoclave",
        manufacturer: "SciCan",
        model: "Statim",
        serialNumber: "HARNESS-STER-1",
        assignedWorkstationDraftId: "workstation-1",
        status: "active",
      },
    ],
    policies: {
      packExpiration: "180 days",
    },
    hardwarePlan: {
      labelPrinters: 1,
      usbScanners: 1,
    },
    reviewMetadata: {
      readinessScore: 100,
      requiredSections: ["clinic", "workstations"],
      completedSections: ["clinic", "workstations"],
      warnings: [],
    },
  };
}

function createAuditEvidence(
  draft: DeploymentDraft,
  payloadHash: string,
): DeploymentAuditEvidenceEnvelope {
  return {
    subject: {
      clinicId: null,
      deploymentRunId: "deployment-run-0001",
      draftVersion: draft.draftVersion,
      payloadHash: payloadHash || hashDeploymentDraftInput(draft),
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
      evidenceVersion: "deployment-audit-evidence-harness-v1",
      generatedAt: FIXED_TIMESTAMP,
      immutableConcept: true,
      payloadHash: payloadHash || hashDeploymentDraftInput(draft),
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

function expectCreateStatus(
  name: string,
  actual: DeploymentRunCreateResultStatus,
  expected: DeploymentRunCreateResultStatus,
  writes: number,
): DeploymentRunServiceHarnessScenario {
  return expectScenario(
    name,
    actual === expected && (expected === "created" ? writes === 1 : writes === 0),
    `status=${actual}; expected=${expected}; writes=${writes}`,
  );
}

function expectResumeStatus(
  name: string,
  actual: DeploymentRunResumeResultStatus,
  expected: DeploymentRunResumeResultStatus,
): DeploymentRunServiceHarnessScenario {
  return expectScenario(
    name,
    actual === expected,
    `status=${actual}; expected=${expected}`,
  );
}

function expectScenario(
  name: string,
  passed: boolean,
  message: string,
): DeploymentRunServiceHarnessScenario {
  return {
    name,
    passed,
    message,
  };
}
