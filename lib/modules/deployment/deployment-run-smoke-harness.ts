import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { DeploymentAuditEvidenceEnvelope } from "./deployment-audit-evidence-types";
import {
  CURRENT_DEPLOYMENT_DRAFT_VERSION,
  summarizeDeploymentDraft,
  type DeploymentDraft,
} from "./deployment-draft";
import {
  createOrReuseServerDeploymentRun,
  type ServerDeploymentRunCreateCommand,
} from "./deployment-run-server";
import type {
  DeploymentRunCreateResult,
  DeploymentRunCreateResultStatus,
} from "./deployment-run-service-types";

export interface DeploymentRunSmokeHarnessInput {
  idempotencyKey: string;
  deploymentRunId: string;
  createdAt: string;
  payloadHash: string;
  conflictingPayloadHash: string;
}

export interface DeploymentRunSmokeHarnessStep {
  name: string;
  expectedStatus: DeploymentRunCreateResultStatus;
  actualStatus: DeploymentRunCreateResultStatus;
  passed: boolean;
  message: string;
  deploymentRunId: string | null;
}

export interface DeploymentRunSmokeHarnessResult {
  passed: boolean;
  idempotencyKey: string;
  deploymentRunId: string;
  createdStep: DeploymentRunSmokeHarnessStep;
  reusedStep: DeploymentRunSmokeHarnessStep;
  conflictStep: DeploymentRunSmokeHarnessStep;
}

export async function runDeploymentRunSmokeHarness(
  client: SupabaseClient,
  input: DeploymentRunSmokeHarnessInput,
): Promise<DeploymentRunSmokeHarnessResult> {
  const createResult = await createOrReuseServerDeploymentRun(
    client,
    createSmokeCommand(input, input.payloadHash),
  );
  const reuseResult = await createOrReuseServerDeploymentRun(
    client,
    createSmokeCommand(input, input.payloadHash),
  );
  const conflictResult = await createOrReuseServerDeploymentRun(
    client,
    createSmokeCommand(input, input.conflictingPayloadHash),
  );

  const createdStep = expectSmokeStep(
    "new idempotency key creates one deployment_run",
    createResult,
    "created",
  );
  const reusedStep = expectSmokeStep(
    "same idempotency key and same payload hash reuses existing run",
    reuseResult,
    "reused",
    input.deploymentRunId,
  );
  const conflictStep = expectSmokeStep(
    "same idempotency key and different payload hash conflicts",
    conflictResult,
    "conflict",
    input.deploymentRunId,
  );

  return {
    passed: createdStep.passed && reusedStep.passed && conflictStep.passed,
    idempotencyKey: input.idempotencyKey,
    deploymentRunId: input.deploymentRunId,
    createdStep,
    reusedStep,
    conflictStep,
  };
}

export function createDeploymentRunSmokeHarnessInput(
  label: string,
): DeploymentRunSmokeHarnessInput {
  const safeLabel = label.trim().toLowerCase().replace(/[^a-z0-9-]/g, "-");

  return {
    idempotencyKey: `deployment-run-smoke-${safeLabel}`,
    deploymentRunId: `deployment-run-smoke-${safeLabel}`,
    createdAt: new Date().toISOString(),
    payloadHash: `deployment-run-smoke-${safeLabel}-payload-a`,
    conflictingPayloadHash: `deployment-run-smoke-${safeLabel}-payload-b`,
  };
}

function createSmokeCommand(
  input: DeploymentRunSmokeHarnessInput,
  payloadHash: string,
): ServerDeploymentRunCreateCommand {
  const draft = createSmokeDraft();

  return {
    deploymentRunId: input.deploymentRunId,
    clinicId: null,
    idempotencyKey: input.idempotencyKey,
    payloadHash,
    draft,
    auditEvidence: createSmokeAuditEvidence(
      draft,
      input.deploymentRunId,
      payloadHash,
      input.createdAt,
    ),
    createdAt: input.createdAt,
    metadata: {
      smokeHarness: "deployment_runs_only",
      cleanupKey: input.idempotencyKey,
    },
  };
}

function createSmokeDraft(): DeploymentDraft {
  return {
    draftVersion: CURRENT_DEPLOYMENT_DRAFT_VERSION,
    createdAt: "2026-07-08T12:00:00.000Z",
    clinicProfile: {
      name: "Deployment Run Smoke Harness",
      legalName: "Deployment Run Smoke Harness",
      clinicCode: "SMOKE",
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
        draftId: "smoke-workstation-1",
        name: "Smoke Treatment Room",
        workstationType: "operatory",
        roomNumber: "1",
        locationLabel: "Room 1",
        capabilities: ["sterilizer"],
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
        draftId: "smoke-sterilizer-1",
        displayName: "Smoke Sterilizer",
        sterilizerType: "autoclave",
        manufacturer: "SciCan",
        model: "Statim",
        serialNumber: "SMOKE-STER-1",
        assignedWorkstationDraftId: "smoke-workstation-1",
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

function createSmokeAuditEvidence(
  draft: DeploymentDraft,
  deploymentRunId: string,
  payloadHash: string,
  generatedAt: string,
): DeploymentAuditEvidenceEnvelope {
  return {
    subject: {
      clinicId: null,
      deploymentRunId,
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
      evidenceVersion: "deployment-run-smoke-harness-v1",
      generatedAt,
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
      retryDecision: "Smoke harness evidence only.",
    },
    events: [],
  };
}

function expectSmokeStep(
  name: string,
  result: DeploymentRunCreateResult,
  expectedStatus: DeploymentRunCreateResultStatus,
  expectedDeploymentRunId?: string,
): DeploymentRunSmokeHarnessStep {
  const actualDeploymentRunId = result.deploymentRun?.deploymentRunId ?? null;
  const statusPassed = result.status === expectedStatus;
  const runPassed =
    !expectedDeploymentRunId || actualDeploymentRunId === expectedDeploymentRunId;

  return {
    name,
    expectedStatus,
    actualStatus: result.status,
    passed: statusPassed && runPassed,
    message: result.message,
    deploymentRunId: actualDeploymentRunId,
  };
}
