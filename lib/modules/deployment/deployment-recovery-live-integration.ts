import { buildDeploymentRecoveryPersistenceCommand, DeploymentRecoveryPersistenceService } from "./deployment-recovery-service";
import type { DeploymentRecoveryRepository } from "./deployment-recovery-repository";
import type { DeploymentRecoveryPersistenceInput, DeploymentRecoveryPersistenceServiceResult } from "./deployment-recovery-persistence-types";
import type { DeploymentExecutionRecoveryResult } from "./deployment-recovery-types";

export const DEPLOYMENT_RECOVERY_INTEGRATION_FIXTURE = {
  owner: "sterisphere:integration-fixture:recovery-persistence-validation",
  clinicId: "9c2a0001-0000-4000-8000-000000000001",
  deploymentRunRecordId: "9c2a0002-0000-4000-8000-000000000002",
  sessionId: "9c2a0003-0000-4000-8000-000000000003",
  clinicCode: "INTEGRATION-RECOVERY-PERSISTENCE-VALIDATION",
  clinicName: "Integration Fixture - Recovery Persistence Validation",
  deploymentRunKey: "integration-fixture:recovery-persistence-validation:run",
  executionKey: "integration-fixture:recovery-persistence-validation:execution",
  planKey: "integration-fixture:recovery-persistence-validation:plan",
  runIdempotencyKey: "integration-fixture:recovery-persistence-validation:run",
  runPayloadHash: "integration-fixture-recovery-persistence-validation-v1",
  failedAt: "2026-07-21T12:00:00.000Z",
} as const;

export type DeploymentRecoveryIntegrationEnvironment =
  | "local"
  | "development"
  | "test"
  | "staging"
  | "supabase_branch";

export interface DeploymentRecoveryIntegrationSafetyInput {
  allowFixture: string | undefined;
  environment: string | undefined;
  nodeEnv: string | undefined;
  vercelEnv: string | undefined;
  supabaseUrl: string | undefined;
  productionSupabaseUrl: string | undefined;
}

export interface DeploymentRecoveryIntegrationSafetyResult {
  allowed: boolean;
  environment: DeploymentRecoveryIntegrationEnvironment | null;
  issueCode: "fixture_opt_in_missing" | "production_environment_blocked" | "production_url_blocked" | "environment_identity_unknown" | null;
  message: string;
}

export interface DeploymentRecoveryIntegrationFixtureResult {
  ok: boolean;
  status: "created" | "reused" | "cleaned" | "blocked" | "error";
  message: string;
  steps: readonly string[];
}

export interface DeploymentRecoveryIntegrationFixtureStore {
  prepareFixture(): Promise<DeploymentRecoveryIntegrationFixtureResult>;
  cleanupOwnedFixture(recoveryPlanId: string | null): Promise<DeploymentRecoveryIntegrationFixtureResult>;
}

export interface DeploymentRecoveryLiveIntegrationResult {
  ok: boolean;
  status: "passed" | "blocked" | "failed" | "cleanup_failed";
  message: string;
  safety: DeploymentRecoveryIntegrationSafetyResult;
  fixtureOwner: string;
  recoveryKey: string | null;
  canonicalPayloadHash: string | null;
  conflictingPayloadHash: string | null;
  persisted: DeploymentRecoveryPersistenceServiceResult | null;
  reused: DeploymentRecoveryPersistenceServiceResult | null;
  conflict: DeploymentRecoveryPersistenceServiceResult | null;
  immutableReplay: DeploymentRecoveryPersistenceServiceResult | null;
  repositoryCalls: number;
  rollbackItems: 0;
  cleanup: DeploymentRecoveryIntegrationFixtureResult | null;
  downstream: {
    rollbackExecuted: 0;
    entitiesCompensated: 0;
    bindingsRemoved: 0;
    sessionsRecovered: 0;
    finalized: 0;
  };
}

export function assessDeploymentRecoveryIntegrationSafety(
  input: DeploymentRecoveryIntegrationSafetyInput,
): DeploymentRecoveryIntegrationSafetyResult {
  if (input.allowFixture !== "true") {
    return denied("fixture_opt_in_missing", "The explicit recovery integration fixture opt-in is absent.");
  }
  if (input.nodeEnv === "production" || input.vercelEnv === "production") {
    return denied("production_environment_blocked", "Production environments cannot run the recovery integration fixture.");
  }
  const environment = readEnvironment(input.environment);
  const currentUrl = normalizedUrl(input.supabaseUrl);
  const productionUrl = normalizedUrl(input.productionSupabaseUrl);
  if (!environment || !currentUrl) {
    return denied("environment_identity_unknown", "An explicit isolated environment and valid Supabase URL are required.");
  }
  if (productionUrl && currentUrl === productionUrl) {
    return denied("production_url_blocked", "The configured Supabase URL is the production database.");
  }
  const localUrl = currentUrl.startsWith("http://localhost:") || currentUrl.startsWith("http://127.0.0.1:");
  if (!localUrl && !productionUrl) {
    return denied("environment_identity_unknown", "Remote isolated databases require the configured production URL for comparison.");
  }
  return { allowed: true, environment, issueCode: null, message: "Explicit isolated recovery integration execution is permitted." };
}

export function buildDeploymentRecoveryIntegrationInput(
  conflicting = false,
): DeploymentRecoveryPersistenceInput {
  const fixture = DEPLOYMENT_RECOVERY_INTEGRATION_FIXTURE;
  const recovery: DeploymentExecutionRecoveryResult = {
    ok: true,
    status: "rollback_not_required",
    message: conflicting
      ? "Recovery decision complete for immutable conflict validation."
      : "Recovery decision complete.",
    clinicId: fixture.clinicId,
    deploymentRunKey: fixture.deploymentRunKey,
    sessionId: fixture.sessionId,
    executionKey: fixture.executionKey,
    planKey: fixture.planKey,
    failure: {
      failureCode: "integration_validation_failure",
      failureLayer: "recovery_persistence_integration",
      failedAt: fixture.failedAt,
      message: "Deployment execution failure classified for recovery planning.",
      failedExecutionItemKey: null,
      failedPlanItemKey: null,
      failedSequence: null,
      failedEntityType: null,
      failedEntityId: null,
      failedAction: null,
      retryable: false,
      diagnostics: { operation: "integration_validation" },
    },
    failedItem: null,
    rollbackRequired: false,
    rollbackExecutable: false,
    rollbackItems: [],
    unsupportedCompensations: [],
    runningItemsToRecover: [],
    completedMutationCount: 0,
    reversibleMutationCount: 0,
    issues: [],
    stoppedAtStage: "decision_complete",
    downstream: {
      failuresClassified: 1,
      rollbackItemsPlanned: 0,
      unsupportedCompensations: 0,
      runningItemsIdentified: 0,
      rollbackExecuted: 0,
      entitiesCompensated: 0,
      bindingsRemoved: 0,
      sessionsRecovered: 0,
      finalized: 0,
    },
  };
  return {
    clinicId: fixture.clinicId,
    deploymentRunKey: fixture.deploymentRunKey,
    sessionId: fixture.sessionId,
    executionKey: fixture.executionKey,
    planKey: fixture.planKey,
    recovery,
  };
}

export async function runDeploymentRecoveryLiveIntegration(input: {
  safety: DeploymentRecoveryIntegrationSafetyInput;
  fixtureStore: DeploymentRecoveryIntegrationFixtureStore;
  repository: DeploymentRecoveryRepository;
}): Promise<DeploymentRecoveryLiveIntegrationResult> {
  const cleanupCapture: { value: DeploymentRecoveryIntegrationFixtureResult | null } = { value: null };
  const fixtureStore: DeploymentRecoveryIntegrationFixtureStore = {
    prepareFixture: () => input.fixtureStore.prepareFixture(),
    cleanupOwnedFixture: async (recoveryPlanId) => {
      cleanupCapture.value = await input.fixtureStore.cleanupOwnedFixture(recoveryPlanId);
      return cleanupCapture.value;
    },
  };
  const result = await runDeploymentRecoveryLiveIntegrationInternal({ ...input, fixtureStore });
  const finalCleanup = readCleanupCapture(cleanupCapture);
  if (finalCleanup && !finalCleanup.ok) {
    return { ...result, ok: false, status: "cleanup_failed", message: finalCleanup.message, cleanup: finalCleanup };
  }
  return { ...result, cleanup: finalCleanup };
}

async function runDeploymentRecoveryLiveIntegrationInternal(input: {
  safety: DeploymentRecoveryIntegrationSafetyInput;
  fixtureStore: DeploymentRecoveryIntegrationFixtureStore;
  repository: DeploymentRecoveryRepository;
}): Promise<DeploymentRecoveryLiveIntegrationResult> {
  const safety = assessDeploymentRecoveryIntegrationSafety(input.safety);
  const base = emptyResult(safety);
  if (!safety.allowed) return base;

  let recoveryPlanId: string | null = null;
  let cleanup: DeploymentRecoveryIntegrationFixtureResult | null = null;
  const countingRepository = new CountingRecoveryRepository(input.repository);
  try {
    const staleCleanup = await input.fixtureStore.cleanupOwnedFixture(null);
    if (!staleCleanup.ok) return { ...base, status: "cleanup_failed", message: staleCleanup.message, cleanup: staleCleanup };
    const prepared = await input.fixtureStore.prepareFixture();
    if (!prepared.ok) return { ...base, status: "failed", message: prepared.message, cleanup: prepared };

    const canonicalInput = buildDeploymentRecoveryIntegrationInput(false);
    const conflictingInput = buildDeploymentRecoveryIntegrationInput(true);
    const canonical = buildDeploymentRecoveryPersistenceCommand(canonicalInput);
    const conflicting = buildDeploymentRecoveryPersistenceCommand(conflictingInput);
    if (!canonical.command || !conflicting.command || canonical.recoveryKey !== conflicting.recoveryKey || canonical.payloadHash === conflicting.payloadHash) {
      return { ...base, status: "failed", message: "Deterministic integration payload construction failed validation." };
    }

    const service = new DeploymentRecoveryPersistenceService(countingRepository);
    const persisted = await service.persistRecoveryDecision(canonicalInput);
    recoveryPlanId = persisted.recoveryPlanId;
    const reused = await service.persistRecoveryDecision(canonicalInput);
    const conflict = await service.persistRecoveryDecision(conflictingInput);
    const immutableReplay = await service.persistRecoveryDecision(canonicalInput);
    const valid = persisted.status === "persisted" && reused.status === "reused" && conflict.status === "conflict" &&
      immutableReplay.status === "reused" && persisted.recoveryPlanId !== null &&
      reused.recoveryPlanId === persisted.recoveryPlanId && conflict.recoveryPlanId === persisted.recoveryPlanId &&
      immutableReplay.recoveryPlanId === persisted.recoveryPlanId &&
      persisted.recoveryKey === canonical.recoveryKey && reused.recoveryKey === canonical.recoveryKey &&
      conflict.recoveryKey === canonical.recoveryKey && immutableReplay.recoveryKey === canonical.recoveryKey &&
      persisted.payloadHash === canonical.payloadHash && reused.payloadHash === canonical.payloadHash &&
      conflict.payloadHash === conflicting.payloadHash && immutableReplay.payloadHash === canonical.payloadHash &&
      [persisted, reused, conflict, immutableReplay].every(validZeroMutationResult) && countingRepository.calls === 4;
    return {
      ...base,
      ok: valid,
      status: valid ? "passed" : "failed",
      message: valid ? "Isolated recovery persistence integration validation passed." : "Recovery persistence integration evidence did not match the acceptance contract.",
      recoveryKey: canonical.recoveryKey,
      canonicalPayloadHash: canonical.payloadHash,
      conflictingPayloadHash: conflicting.payloadHash,
      persisted,
      reused,
      conflict,
      immutableReplay,
      repositoryCalls: countingRepository.calls,
    };
  } catch {
    return { ...base, status: "failed", message: "Recovery persistence integration validation failed safely.", repositoryCalls: countingRepository.calls };
  } finally {
    cleanup = await input.fixtureStore.cleanupOwnedFixture(recoveryPlanId).catch(() => ({
      ok: false, status: "error" as const, message: "Recovery integration fixture cleanup failed safely.", steps: [],
    }));
    if (!cleanup.ok) {
      base.cleanup = cleanup;
    }
  }
}

class CountingRecoveryRepository implements DeploymentRecoveryRepository {
  calls = 0;
  constructor(private readonly repository: DeploymentRecoveryRepository) {}
  async persistRecoveryPlan(command: Parameters<DeploymentRecoveryRepository["persistRecoveryPlan"]>[0]) {
    this.calls += 1;
    return this.repository.persistRecoveryPlan(command);
  }
}

function validZeroMutationResult(result: DeploymentRecoveryPersistenceServiceResult): boolean {
  return result.rollbackRequired === false && result.rollbackExecutable === false &&
    result.recoveryStatus === "rollback_not_required" && result.rollbackItemsRequested === 0 &&
    result.rollbackItemsPersisted === 0 && result.downstream.rollbackExecuted === 0 &&
    result.downstream.entitiesCompensated === 0 && result.downstream.bindingsRemoved === 0 &&
    result.downstream.sessionsRecovered === 0 && result.downstream.finalized === 0;
}

function emptyResult(safety: DeploymentRecoveryIntegrationSafetyResult): DeploymentRecoveryLiveIntegrationResult {
  return {
    ok: false,
    status: "blocked",
    message: safety.message,
    safety,
    fixtureOwner: DEPLOYMENT_RECOVERY_INTEGRATION_FIXTURE.owner,
    recoveryKey: null,
    canonicalPayloadHash: null,
    conflictingPayloadHash: null,
    persisted: null,
    reused: null,
    conflict: null,
    immutableReplay: null,
    repositoryCalls: 0,
    rollbackItems: 0,
    cleanup: null,
    downstream: { rollbackExecuted: 0, entitiesCompensated: 0, bindingsRemoved: 0, sessionsRecovered: 0, finalized: 0 },
  };
}

function denied(issueCode: NonNullable<DeploymentRecoveryIntegrationSafetyResult["issueCode"]>, message: string): DeploymentRecoveryIntegrationSafetyResult {
  return { allowed: false, environment: null, issueCode, message };
}

function readEnvironment(value: string | undefined): DeploymentRecoveryIntegrationEnvironment | null {
  return value === "local" || value === "development" || value === "test" || value === "staging" || value === "supabase_branch" ? value : null;
}

function normalizedUrl(value: string | undefined): string | null {
  if (!value) return null;
  try { return new URL(value).origin.toLowerCase(); } catch { return null; }
}

function readCleanupCapture(capture: { value: DeploymentRecoveryIntegrationFixtureResult | null }): DeploymentRecoveryIntegrationFixtureResult | null {
  return capture.value;
}
